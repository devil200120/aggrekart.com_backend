const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const Order = require('../models/Order');
const User = require('../models/User');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const { ErrorHandler } = require('../utils/errorHandler');
const { 
  sendOrderNotification, 
  sendSMS, 
  sendOrderPlacementNotification,
  sendSupplierOrderNotification 
} = require('../utils/notifications');
const router = express.Router();

// @route   GET /api/supplier-orders
// @desc    Get supplier's orders (Compatible with SupplierOrdersPage frontend)
// @access  Private (Supplier)
router.get('/', auth, authorize('supplier'), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('status').optional().custom((value) => {
    // Allow empty string or valid status values
    if (value === '' || ['pending', 'confirmed', 'preparing', 'material_loading', 'processing', 'dispatched', 'delivered', 'cancelled'].includes(value)) {
      return true;
    }
    throw new Error('Invalid status');
  }),
  query('search').optional().isString().withMessage('Search must be a string'),
  query('dateFrom').optional().isISO8601().withMessage('Invalid date format'),
  query('dateTo').optional().isISO8601().withMessage('Invalid date format')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    console.log('🔍 Supplier orders request from user:', req.user._id);
    console.log('📊 Query parameters:', req.query);

    const { page = 1, limit = 10, status, search, dateFrom, dateTo } = req.query;

    // Find supplier profile for the authenticated user
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      console.log('❌ Supplier profile not found for user:', req.user._id);
      return res.status(404).json({
        success: false,
        message: 'Supplier profile not found. Please complete your supplier registration.',
        debug: {
          userId: req.user._id,
          userRole: req.user.role
        }
      });
    }

    console.log('✅ Found supplier:', {
      id: supplier._id,
      companyName: supplier.companyName || supplier.businessName
    });

    // Build query to find orders for this supplier
    let query = { supplier: supplier._id };
    
    // Add status filter if provided and not empty
    if (status && status !== '') {
      query.status = status;
    }

    // Add search functionality
    if (search && search !== '') {
      const searchRegex = { $regex: search, $options: 'i' };
      // We'll need to do a more complex query for customer search
      const customerIds = await User.find({
        $or: [
          { name: searchRegex },
          { email: searchRegex }
        ]
      }).distinct('_id');

      query.$or = [
        { orderId: searchRegex },
        { customer: { $in: customerIds } }
      ];
    }

    // Add date range filter
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    console.log('📊 Query filter:', query);

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch orders with enhanced customer population and error handling
    const orders = await Order.find(query)
      .populate({
        path: 'customer',
        select: 'name email phoneNumber',
        options: { 
          lean: true,
          strictPopulate: false // Don't fail if customer doesn't exist
        }
      })
      .populate({
        path: 'items.product',
        select: 'name category price images'
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalOrders = await Order.countDocuments(query);

    console.log(`📦 Found ${orders.length} orders out of ${totalOrders} total`);

    // Post-process orders to handle missing customer data
    const processedOrders = orders.map(order => {
      // If customer is null or undefined, provide fallback data
      if (!order.customer) {
        console.warn(`⚠️ Order ${order._id} has missing customer data`);
        order.customer = {
          name: 'Customer Account Deleted',
          email: 'N/A',
          phoneNumber: 'N/A'
        };
      }
      return order;
    });

    // Get comprehensive order statistics for all supplier orders
    const allSupplierOrders = await Order.find({ supplier: supplier._id });
    const stats = {
      total: allSupplierOrders.length,
      pending: allSupplierOrders.filter(o => o.status === 'pending').length,
      confirmed: allSupplierOrders.filter(o => o.status === 'confirmed').length,
      preparing: allSupplierOrders.filter(o => o.status === 'preparing').length,
      material_loading: allSupplierOrders.filter(o => o.status === 'material_loading').length,
      processing: allSupplierOrders.filter(o => o.status === 'processing').length,
      dispatched: allSupplierOrders.filter(o => o.status === 'dispatched').length,
      delivered: allSupplierOrders.filter(o => o.status === 'delivered').length,
      cancelled: allSupplierOrders.filter(o => o.status === 'cancelled').length
    };

    console.log('📈 Order statistics:', stats);

    const pagination = {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalOrders / parseInt(limit)),
      totalItems: totalOrders,
      hasNext: parseInt(page) < Math.ceil(totalOrders / parseInt(limit)),
      hasPrev: parseInt(page) > 1
    };

    // Log sample orders for debugging
    if (processedOrders.length > 0) {
      console.log('📋 Sample processed orders:');
      processedOrders.slice(0, 3).forEach(order => {
        console.log(`- Order ${order.orderId}: ${order.customer?.name} - ${order.status} - ₹${order.pricing?.totalAmount || order.totalAmount || 0}`);
      });
    }

    res.json({
      success: true,
      data: {
        orders: processedOrders,
        pagination,
        stats
      }
    });

  } catch (error) {
    console.error('❌ Supplier orders error:', error);
    next(error);
  }
});

// @route   PATCH /api/supplier-orders/:orderId/status
// @desc    Update order status (Updated to match frontend expectations)
// @access  Private (Supplier)
router.patch('/:orderId/status', auth, authorize('supplier'), [
  param('orderId').notEmpty().withMessage('Order ID is required'),
  body('status').isIn(['pending', 'confirmed', 'preparing', 'material_loading', 'processing', 'dispatched', 'delivered', 'cancelled']).withMessage('Invalid status'),
  body('note').optional().trim().isLength({ max: 500 }).withMessage('Note cannot exceed 500 characters')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { orderId } = req.params;
    const { status, note } = req.body;

    console.log('Status update request:', { orderId, status, supplierId: req.user._id });

    // Find supplier profile
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier profile not found'
      });
    }

    // Define valid status transitions
    const statusTransitions = {
      'pending': ['confirmed', 'cancelled'],
      'confirmed': ['preparing', 'cancelled'], 
      'preparing': ['material_loading', 'cancelled'],
      'material_loading': ['processing', 'cancelled'],
      'processing': ['dispatched', 'cancelled'],
      'dispatched': ['delivered'],
      'delivered': [],
      'cancelled': []
    };

    // Find order for this supplier
    const order = await Order.findOne({ 
      _id: orderId,
      supplier: supplier._id 
    }).populate('customer', 'name email phoneNumber');

    if (!order) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found or you do not have permission to update this order' 
      });
    }

    const currentStatus = order.status;
    const allowedNextStatuses = statusTransitions[currentStatus] || [];

    // Validate status transition
    if (!allowedNextStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        message: `Cannot change status from ${currentStatus} to ${status}. Allowed transitions: ${allowedNextStatuses.join(', ')}` 
      });
    }

    // Check cooling period for early status changes (if applicable)
    if (order.coolingPeriod && order.coolingPeriod.isActive) {
      const coolingEndTime = new Date(order.coolingPeriod.endTime);
      const currentTime = new Date();
      
      if (currentTime < coolingEndTime && ['processing', 'dispatched'].includes(status)) {
        const remainingTime = Math.ceil((coolingEndTime - currentTime) / (1000 * 60)); // minutes
        return res.status(400).json({
          success: false,
          message: `Cannot move to ${status} during cooling period. ${remainingTime} minutes remaining.`
        });
      }
    }

    // Update order status
    order.status = status;
    order.updatedAt = new Date();
    
    // Add timeline entry
    order.timeline.push({
      status: status,
      timestamp: new Date(),
      note: note || `Status updated to ${status}`,
      updatedBy: req.user._id
    });

    // Set specific timestamps for certain statuses
    if (status === 'confirmed') {
      order.confirmedAt = new Date();
    }

    // Generate delivery OTP for dispatched orders
    if (status === 'dispatched') {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      order.delivery.deliveryOTP = otp;
      console.log(`🔑 DELIVERY OTP for Order ${order.orderId}: ${otp}`);
  console.log(`📱 Customer Phone: ${order.customer?.phoneNumber}`);
  console.log(`👤 Customer Name: ${order.customer?.name}`);
  console.log(`📦 Share this OTP with the delivery person`);
      // Send OTP to customer
      try {
        if (order.customer && order.customer.phoneNumber) {
          await sendSMS(
            order.customer.phoneNumber,
            `Your order ${order.orderId} has been dispatched. Delivery OTP: ${otp}. Share this with the delivery person. - AggreKart`
          );
        }
      } catch (error) {
        console.error('Failed to send delivery OTP:', error);
      }
    }

    await order.save();

    // Send comprehensive status update notifications to customer
    try {
      if (order.customer) {
        console.log(`📬 Sending notifications for order ${order.orderId} status: ${status}`);
        
        // Send SMS notification
        if (order.customer.phoneNumber) {
          const statusMessage = getStatusMessage(status, order.orderId);
          await sendSMS(order.customer.phoneNumber, statusMessage);
          console.log('✅ SMS sent successfully');
        }
        
        // Send Email notification
        if (order.customer.email) {
          const { sendEmail } = require('../utils/notifications');
          
          // Create professional email content
          const emailSubject = getEmailSubject(status, order.orderId);
          const emailContent = createStatusUpdateEmail(order.customer.name, order.orderId, status, order);
          
          await sendEmail(order.customer.email, emailSubject, emailContent);
          console.log('✅ Email sent successfully');
        }
      }
    } catch (error) {
      console.error('❌ Failed to send notifications:', error);
      // Don't fail the order update if notifications fail
    }

    // Enhanced debugging for customer data
    console.log('Order after update:', {
      _id: order._id,
      orderId: order.orderId,
      status: order.status,
      customer: order.customer ? {
        _id: order.customer._id,
        name: order.customer.name,
        email: order.customer.email,
        phoneNumber: order.customer.phoneNumber
      } : null
    });

    res.json({ 
      success: true,
      message: 'Order status updated successfully',
      data: {
        order: {
          _id: order._id,
          orderId: order.orderId,
          status: order.status,
          customer: order.customer || null,
          updatedAt: order.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: error.message 
    });
  }
});

// @route   PUT /api/supplier-orders/:orderId/status
// @desc    Update order status (PUT method for frontend compatibility)
// @access  Private (Supplier)
router.put('/:orderId/status', auth, authorize('supplier'), [
  param('orderId').notEmpty().withMessage('Order ID is required'),
  body('status').isIn(['pending', 'confirmed', 'preparing', 'material_loading', 'processing', 'dispatched', 'delivered', 'cancelled']).withMessage('Invalid status'),
  body('note').optional().trim().isLength({ max: 500 }).withMessage('Note cannot exceed 500 characters')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { orderId } = req.params;
    const { status, note } = req.body;

    console.log('📋 PUT Status update request:', { orderId, status, supplierId: req.user._id });

    // Find supplier profile
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier profile not found'
      });
    }

    // Define valid status transitions
    const statusTransitions = {
      'pending': ['confirmed', 'cancelled'],
      'confirmed': ['preparing', 'cancelled'], 
      'preparing': ['material_loading', 'cancelled'],
      'material_loading': ['processing', 'cancelled'],
      'processing': ['dispatched', 'cancelled'],
      'dispatched': ['delivered'],
      'delivered': [],
      'cancelled': []
    };

    // Find order for this supplier
    const order = await Order.findOne({ 
      _id: orderId,
      supplier: supplier._id 
    }).populate('customer', 'name email phoneNumber');

    if (!order) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found or you do not have permission to update this order' 
      });
    }

    const currentStatus = order.status;
    const allowedNextStatuses = statusTransitions[currentStatus] || [];

    // Validate status transition
    if (!allowedNextStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        message: `Cannot change status from ${currentStatus} to ${status}. Allowed transitions: ${allowedNextStatuses.join(', ')}` 
      });
    }

    // Check cooling period for early status changes (if applicable)
    if (order.coolingPeriod && order.coolingPeriod.isActive) {
      const coolingEndTime = new Date(order.coolingPeriod.endTime);
      const currentTime = new Date();
      
      if (currentTime < coolingEndTime && ['processing', 'dispatched'].includes(status)) {
        const remainingTime = Math.ceil((coolingEndTime - currentTime) / (1000 * 60)); // minutes
        return res.status(400).json({
          success: false,
          message: `Cannot move to ${status} during cooling period. ${remainingTime} minutes remaining.`
        });
      }
    }

    // Update order status
    order.status = status;
    order.updatedAt = new Date();
    
    // Add timeline entry
    order.timeline.push({
      status: status,
      timestamp: new Date(),
      note: note || `Status updated to ${status}`,
      updatedBy: req.user._id
    });

    // Set specific timestamps for certain statuses
    if (status === 'confirmed') {
      order.confirmedAt = new Date();
    }

    // Generate delivery OTP for dispatched orders
    if (status === 'dispatched') {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      order.delivery.deliveryOTP = otp;
      
      // Send OTP to customer
      try {
        if (order.customer && order.customer.phoneNumber) {
          await sendSMS(
            order.customer.phoneNumber,
            `Your order ${order.orderId} has been dispatched. Delivery OTP: ${otp}. Share this with the delivery person. - AggreKart`
          );
        }
      } catch (error) {
        console.error('Failed to send delivery OTP:', error);
      }
    }

    await order.save();

    // Send comprehensive status update notifications to customer
    try {
      if (order.customer) {
        console.log(`📬 Sending notifications for order ${order.orderId} status: ${status}`);
        
        // Send SMS notification
        if (order.customer.phoneNumber) {
          const statusMessage = getStatusMessage(status, order.orderId);
          await sendSMS(order.customer.phoneNumber, statusMessage);
          console.log('✅ SMS sent successfully');
        }
        
        // Send Email notification
        if (order.customer.email) {
          const { sendEmail } = require('../utils/notifications');
          
          // Create professional email content
          const emailSubject = getEmailSubject(status, order.orderId);
          const emailContent = createStatusUpdateEmail(order.customer.name, order.orderId, status, order);
          
          await sendEmail(order.customer.email, emailSubject, emailContent);
          console.log('✅ Email sent successfully');
        }
      }
    } catch (error) {
      console.error('❌ Failed to send notifications:', error);
      // Don't fail the order update if notifications fail
    }

    // Enhanced debugging for customer data
    console.log('Order after update:', {
      _id: order._id,
      orderId: order.orderId,
      status: order.status,
      customer: order.customer ? {
        _id: order.customer._id,
        name: order.customer.name,
        email: order.customer.email,
        phoneNumber: order.customer.phoneNumber
      } : null
    });

    res.json({ 
      success: true,
      message: 'Order status updated successfully',
      data: {
        order: {
          _id: order._id,
          orderId: order.orderId,
          status: order.status,
          customer: order.customer || null,
          updatedAt: order.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: error.message 
    });
  }
});

// @route   PUT /api/supplier-orders/:orderId/status
// @desc    Update order status (PUT method for frontend compatibility)
// @access  Private (Supplier)
router.put('/:orderId/status', auth, authorize('supplier'), [
  param('orderId').notEmpty().withMessage('Order ID is required'),
  body('status').isIn(['pending', 'confirmed', 'preparing', 'material_loading', 'processing', 'dispatched', 'delivered', 'cancelled']).withMessage('Invalid status'),
  body('note').optional().trim().isLength({ max: 500 }).withMessage('Note cannot exceed 500 characters')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { orderId } = req.params;
    const { status, note } = req.body;

    console.log('📋 PUT Status update request:', { orderId, status, supplierId: req.user._id });

    // Find supplier profile
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier profile not found'
      });
    }

    // Define valid status transitions
    const statusTransitions = {
      'pending': ['confirmed', 'cancelled'],
      'confirmed': ['preparing', 'cancelled'], 
      'preparing': ['material_loading', 'cancelled'],
      'material_loading': ['processing', 'cancelled'],
      'processing': ['dispatched', 'cancelled'],
      'dispatched': ['delivered'],
      'delivered': [],
      'cancelled': []
    };

    // Find order for this supplier
    const order = await Order.findOne({ 
      _id: orderId,
      supplier: supplier._id 
    }).populate('customer', 'name email phoneNumber');

    if (!order) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found or you do not have permission to update this order' 
      });
    }

    const currentStatus = order.status;
    const allowedNextStatuses = statusTransitions[currentStatus] || [];

    // Validate status transition
    if (!allowedNextStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        message: `Cannot change status from ${currentStatus} to ${status}. Allowed transitions: ${allowedNextStatuses.join(', ')}` 
      });
    }

    // Check cooling period for early status changes (if applicable)
    if (order.coolingPeriod && order.coolingPeriod.isActive) {
      const coolingEndTime = new Date(order.coolingPeriod.endTime);
      const currentTime = new Date();
      
      if (currentTime < coolingEndTime && ['processing', 'dispatched'].includes(status)) {
        const remainingTime = Math.ceil((coolingEndTime - currentTime) / (1000 * 60)); // minutes
        return res.status(400).json({
          success: false,
          message: `Cannot move to ${status} during cooling period. ${remainingTime} minutes remaining.`
        });
      }
    }

    // Update order status
    order.status = status;
    order.updatedAt = new Date();
    
    // Add timeline entry
    order.timeline.push({
      status: status,
      timestamp: new Date(),
      note: note || `Status updated to ${status}`,
      updatedBy: req.user._id
    });

    // Set specific timestamps for certain statuses
    if (status === 'confirmed') {
      order.confirmedAt = new Date();
    }

    // Generate delivery OTP for dispatched orders
    if (status === 'dispatched') {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      order.delivery.deliveryOTP = otp;
      
      // Send OTP to customer
      try {
        if (order.customer && order.customer.phoneNumber) {
          await sendSMS(
            order.customer.phoneNumber,
            `Your order ${order.orderId} has been dispatched. Delivery OTP: ${otp}. Share this with the delivery person. - AggreKart`
          );
        }
      } catch (error) {
        console.error('Failed to send delivery OTP:', error);
      }
    }

    await order.save();

    // Send comprehensive status update notifications to customer
    try {
      if (order.customer) {
        console.log(`📬 Sending notifications for order ${order.orderId} status: ${status}`);
        
        // Send SMS notification
        if (order.customer.phoneNumber) {
          const statusMessage = getStatusMessage(status, order.orderId);
          await sendSMS(order.customer.phoneNumber, statusMessage);
          console.log('✅ SMS sent successfully');
        }
        
        // Send Email notification
        if (order.customer.email) {
          const { sendEmail } = require('../utils/notifications');
          
          // Create professional email content
          const emailSubject = getEmailSubject(status, order.orderId);
          const emailContent = createStatusUpdateEmail(order.customer.name, order.orderId, status, order);
          
          await sendEmail(order.customer.email, emailSubject, emailContent);
          console.log('✅ Email sent successfully');
        }
      }
    } catch (error) {
      console.error('❌ Failed to send notifications:', error);
      // Don't fail the order update if notifications fail
    }

    // Enhanced debugging for customer data
    console.log('Order after update:', {
      _id: order._id,
      orderId: order.orderId,
      status: order.status,
      customer: order.customer ? {
        _id: order.customer._id,
        name: order.customer.name,
        email: order.customer.email,
        phoneNumber: order.customer.phoneNumber
      } : null
    });

    res.json({ 
      success: true,
      message: 'Order status updated successfully',
      data: {
        order: {
          _id: order._id,
          orderId: order.orderId,
          status: order.status,
          customer: order.customer || null,
          updatedAt: order.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: error.message 
    });
  }
});

// @route   PUT /api/supplier-orders/:orderId/invoice
// @desc    Update invoice with actual quantities (for aggregate, sand, steel)
// @access  Private (Supplier)
router.put('/:orderId/invoice', auth, authorize('supplier'), [
  param('orderId').notEmpty().withMessage('Order ID is required'),
  body('items').isArray({ min: 1 }).withMessage('Items array is required'),
  body('items.*.itemId').notEmpty().withMessage('Item ID is required'),
  body('items.*.actualQuantity').isFloat({ min: 0.1 }).withMessage('Actual quantity must be at least 0.1')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { orderId } = req.params;
    const { items } = req.body;

    // Find supplier
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier profile not found'
      });
    }

    // Find order
    const order = await Order.findOne({
      _id: orderId,
      supplier: supplier._id
    }).populate('customer');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order is in processing state
    if (order.status !== 'processing') {
      return res.status(400).json({
        success: false,
        message: 'Invoice can only be updated when order is in processing state'
      });
    }

    // Check if applicable for invoice update (aggregate, sand, steel)
    const updatableCategories = ['aggregate', 'sand', 'tmt_steel'];
    const hasUpdatableItems = order.items.some(item => 
      updatableCategories.includes(item.productSnapshot.category)
    );

    if (!hasUpdatableItems) {
      return res.status(400).json({
        success: false,
        message: 'This order does not contain items that can be updated'
      });
    }

    let totalAmountDifference = 0;

    // Update each item
    for (const updateItem of items) {
      const orderItem = order.items.id(updateItem.itemId);
      if (!orderItem) {
        return res.status(404).json({
          success: false,
          message: `Order item ${updateItem.itemId} not found`
        });
      }

      // Check if category allows quantity update
      if (!updatableCategories.includes(orderItem.productSnapshot.category)) {
        return res.status(400).json({
          success: false,
          message: `${orderItem.productSnapshot.name} cannot be updated`
        });
      }

      const oldTotal = orderItem.totalPrice;
      orderItem.actualQuantityDelivered = updateItem.actualQuantity;
      orderItem.totalPrice = updateItem.actualQuantity * orderItem.unitPrice;
      
      totalAmountDifference += orderItem.totalPrice - oldTotal;
    }

    // Recalculate order totals
    const newSubtotal = order.pricing.subtotal + totalAmountDifference;
    const newCommission = Math.round((newSubtotal * (supplier.commissionRate || 5)) / 100);
    const newGST = Math.round((newSubtotal * 18) / 100);
    const newPGCharges = Math.round(((newSubtotal + newCommission + newGST) * 2.5) / 100);
    const newPGGST = Math.round((newPGCharges * 18) / 100);
    const newTotalAmount = newSubtotal + newCommission + newGST + newPGCharges + newPGGST;

    // Update pricing
    order.pricing.subtotal = newSubtotal;
    order.pricing.commission = newCommission;
    order.pricing.gstAmount = newGST;
    order.pricing.paymentGatewayCharges = newPGCharges + newPGGST;
    order.pricing.totalAmount = newTotalAmount;

    // Recalculate payment amounts
    order.payment.advanceAmount = Math.round((newTotalAmount * order.payment.advancePercentage) / 100);
    // FIXED: Ensure payment amounts are valid before saving
    if (order.payment.remainingAmount < 0) {
      order.payment.remainingAmount = 0;
    }
    // Mark invoice as updated
    order.invoice.isUpdated = true;
    order.invoice.updatedAt = new Date();

    // Add timeline entry
    order.timeline.push({
      status: order.status,
      timestamp: new Date(),
      note: `Invoice updated with actual quantities. Amount difference: ₹${totalAmountDifference.toFixed(2)}`,
      updatedBy: req.user._id
    });

    await order.save();

    // Send notification to customer about invoice update
    try {
      if (order.customer && order.customer.phoneNumber) {
        await sendSMS(
          order.customer.phoneNumber,
          `Invoice updated for order ${order.orderId}. New total: ₹${newTotalAmount.toFixed(2)}. Check app for details. - AggreKart`
        );
      }
    } catch (error) {
      console.error('Failed to send invoice update notification:', error);
    }

    res.json({
      success: true,
      message: 'Invoice updated successfully',
      data: {
        order: {
          orderId: order.orderId,
          updatedItems: items.length,
          amountDifference: totalAmountDifference,
          newTotalAmount: newTotalAmount,
          newRemainingAmount: order.payment.remainingAmount
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/supplier-orders/:orderId/delivery-complete
// @desc    Complete delivery with OTP verification
// @access  Private (Supplier)
router.post('/:orderId/delivery-complete', auth, authorize('supplier'), [
  param('orderId').notEmpty().withMessage('Order ID is required'),
  body('deliveryOTP').isLength({ min: 6, max: 6 }).withMessage('Valid 6-digit OTP is required'),
  body('deliveryNotes').optional().trim().isLength({ max: 500 }).withMessage('Delivery notes cannot exceed 500 characters')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { orderId } = req.params;
    const { deliveryOTP, deliveryNotes } = req.body;

    // Find supplier
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier profile not found'
      });
    }

    // Find order
    const order = await Order.findOne({
      _id: orderId,
      supplier: supplier._id
    }).populate('customer');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status !== 'dispatched') {
      return res.status(400).json({
        success: false,
        message: 'Order must be in dispatched status'
      });
    }

    // Verify delivery OTP
    if (order.delivery.deliveryOTP !== deliveryOTP) {
      return res.status(400).json({
        success: false,
        message: 'Invalid delivery OTP'
      });
    }

    // Complete delivery
    order.status = 'delivered';
    order.delivery.actualDeliveryTime = new Date();
    order.delivery.deliveryNotes = deliveryNotes;
    
    // Add timeline entry
    order.timeline.push({
      status: 'delivered',
      timestamp: new Date(),
      note: 'Order delivered successfully',
      updatedBy: req.user._id
    });
    
    await order.save();

    // Update supplier stats
    supplier.totalOrders = (supplier.totalOrders || 0) + 1;
    supplier.totalRevenue = (supplier.totalRevenue || 0) + order.pricing.totalAmount;
    await supplier.save();

    // Send delivery confirmation to customer
    try {
      if (order.customer && order.customer.phoneNumber) {
        await sendSMS(
          order.customer.phoneNumber,
          `Your order ${order.orderId} has been delivered successfully! Thank you for choosing AggreKart.`
        );
      }
    } catch (error) {
      console.error('Failed to send delivery confirmation:', error);
    }

    res.json({
      success: true,
      message: 'Delivery completed successfully',
      data: {
        order: {
          orderId: order.orderId,
          status: order.status,
          deliveredAt: order.delivery.actualDeliveryTime
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/supplier-orders/analytics
// @desc    Get supplier order analytics
// @access  Private (Supplier)
router.get('/analytics', auth, authorize('supplier'), async (req, res, next) => {
  try {
    // Find supplier
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier profile not found'
      });
    }

    const { period = '30' } = req.query; // days
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - parseInt(period));

    // Get analytics data for supplier
    const analytics = await Order.aggregate([
      {
        $match: {
          supplier: supplier._id,
          createdAt: { $gte: fromDate }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$pricing.totalAmount' },
          deliveredOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          },
          averageOrderValue: { $avg: '$pricing.totalAmount' }
        }
      }
    ]);

    const result = analytics[0] || {
      totalOrders: 0,
      totalRevenue: 0,
      deliveredOrders: 0,
      cancelledOrders: 0,
      averageOrderValue: 0
    };

    // Get daily orders for chart
    const dailyOrders = await Order.aggregate([
      {
        $match: {
          supplier: supplier._id,
          createdAt: { $gte: fromDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 },
          revenue: { $sum: '$pricing.totalAmount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        summary: result,
        dailyChart: dailyOrders,
        period: parseInt(period)
      }
    });

  } catch (error) {
    next(error);
  }
});

// Helper function to generate email subjects
function getEmailSubject(status, orderId) {
  const subjects = {
    confirmed: `🎉 Order Confirmed - ${orderId} | Aggrekart`,
    preparing: `🔧 Order Being Prepared - ${orderId} | Aggrekart`,
    material_loading: `🚛 Materials Loading - ${orderId} | Aggrekart`,
    processing: `⚡ Order Processing - ${orderId} | Aggrekart`,
    dispatched: `🚛 Order Dispatched - ${orderId} | Aggrekart`,
    delivered: `✅ Order Delivered - ${orderId} | Aggrekart`,
    cancelled: `❌ Order Cancelled - ${orderId} | Aggrekart`
  };
  
  return subjects[status] || `📝 Order Update - ${orderId} | Aggrekart`;
}

// Helper function to create professional email content
function createStatusUpdateEmail(customerName, orderId, status, order) {
  const statusDetails = getStatusEmailDetails(status);
  const totalAmount = order.pricing?.totalAmount || order.totalAmount || 0;
  
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #ff6b35; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .status-badge { background: ${statusDetails.color}; color: white; padding: 8px 16px; border-radius: 20px; display: inline-block; margin: 10px 0; }
        .order-details { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #ff6b35; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        .cta-button { background: #ff6b35; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏗️ Aggrekart</h1>
            <h2>Order Status Update</h2>
        </div>
        
        <div class="content">
            <h3>Dear ${customerName},</h3>
            
            <p>Your order status has been updated!</p>
            
            <div class="status-badge">${statusDetails.icon} ${status.toUpperCase()}</div>
            
            <div class="order-details">
                <h4>📋 Order Details:</h4>
                <p><strong>Order ID:</strong> ${orderId}</p>
                <p><strong>Status:</strong> ${statusDetails.description}</p>
                <p><strong>Total Amount:</strong> ₹${totalAmount.toLocaleString('en-IN')}</p>
                <p><strong>Updated:</strong> ${new Date().toLocaleString('en-IN', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</p>
            </div>
            
            <div style="background: white; padding: 20px; border-radius: 6px; margin: 20px 0;">
                <h4>${statusDetails.title}</h4>
                <p>${statusDetails.message}</p>
                ${statusDetails.nextSteps ? `<p><strong>What's Next:</strong> ${statusDetails.nextSteps}</p>` : ''}
            </div>
            
            <div style="text-align: center;">
                <a href="https://aggrekart-com.onrender.com/orders/${orderId}" class="cta-button">Track Your Order</a>
            </div>
            
            <div class="footer">
                <p>Thank you for choosing Aggrekart for your construction needs!</p>
                <p>🏗️ <strong>Building Dreams, Delivering Quality</strong></p>
                <hr style="margin: 20px 0; border: 1px solid #eee;">
                <p>Need help? Contact us: <a href="mailto:support@aggrekart.com">support@aggrekart.com</a> | +91-XXXXXXXXXX</p>
                <p style="font-size: 12px; color: #999;">This is an automated message. Please do not reply to this email.</p>
            </div>
        </div>
    </div>
</body>
</html>
`;
}

// Helper function to get status-specific email details
function getStatusEmailDetails(status) {
  const details = {
    confirmed: {
      icon: '🎉',
      title: 'Order Confirmed!',
      description: 'Your order has been confirmed by our supplier',
      message: 'Great news! Your order has been confirmed and our supplier is preparing to fulfill it. You can expect regular updates as your order progresses.',
      nextSteps: 'Your order will move to preparation phase soon. We\'ll notify you of each step.',
      color: '#28a745'
    },
    preparing: {
      icon: '🔧',
      title: 'Order Being Prepared',
      description: 'Your order is currently being prepared',
      message: 'Our supplier is carefully preparing your order items. This ensures quality and proper packaging for safe delivery.',
      nextSteps: 'Materials will be loaded for dispatch once preparation is complete.',
      color: '#ffc107'
    },
    material_loading: {
      icon: '🚛',
      title: 'Materials Loading',
      description: 'Your order materials are being loaded for dispatch',
      message: 'Your order is being loaded onto the delivery vehicle. The dispatch process has begun and your items are on their way!',
      nextSteps: 'Your order will be marked as dispatched once loading is complete.',
      color: '#17a2b8'
    },
    processing: {
      icon: '⚡',
      title: 'Order Processing',
      description: 'Your order is being processed for dispatch',
      message: 'Your order is in the final processing stage. All quality checks are being completed before dispatch.',
      nextSteps: 'Your order will be dispatched within the next few hours.',
      color: '#6f42c1'
    },
    dispatched: {
      icon: '🚛',
      title: 'Order Dispatched!',
      description: 'Your order is on its way to you',
      message: 'Excellent! Your order has been dispatched and is now on its way to your delivery address. Our delivery partner will contact you soon.',
      nextSteps: 'You should receive your order within 1-2 business days. Keep your phone handy for delivery updates.',
      color: '#007bff'
    },
    delivered: {
      icon: '✅',
      title: 'Order Delivered Successfully!',
      description: 'Your order has been delivered',
      message: 'Congratulations! Your order has been successfully delivered. We hope you\'re satisfied with your purchase.',
      nextSteps: 'Please rate your experience and let us know if you need anything else.',
      color: '#28a745'
    },
    cancelled: {
      icon: '❌',
      title: 'Order Cancelled',
      description: 'Your order has been cancelled',
      message: 'We regret to inform you that your order has been cancelled. If this was unexpected, please contact our support team.',
      nextSteps: 'If you have any questions, our support team is here to help you.',
      color: '#dc3545'
    }
  };
  
  return details[status] || {
    icon: '📝',
    title: 'Order Status Update',
    description: `Order status updated to ${status}`,
    message: 'Your order status has been updated. Please check your account for more details.',
    nextSteps: 'We\'ll keep you informed of any further updates.',
    color: '#6c757d'
  };
}

// Helper function to generate status messages
function getStatusMessage(status, orderId) {
  const messages = {
    confirmed: `Your order ${orderId} has been confirmed by the supplier. Preparation will begin soon.`,
    preparing: `Your order ${orderId} is now being prepared by the supplier.`,
    material_loading: `Your order ${orderId} materials are being loaded for dispatch.`,
    processing: `Your order ${orderId} is being processed and will be dispatched soon.`,
    dispatched: `Your order ${orderId} has been dispatched and is on its way to you.`,
    delivered: `Your order ${orderId} has been delivered successfully. Thank you for choosing AggreKart!`,
    cancelled: `Your order ${orderId} has been cancelled. If you have any questions, please contact support.`
  };
  
  return messages[status] || `Your order ${orderId} status has been updated to ${status}.` + ' - AggreKart';
}

module.exports = router;