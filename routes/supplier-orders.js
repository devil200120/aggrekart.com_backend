const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const multer = require('multer');
const { auth, authorize } = require('../middleware/auth');
const Order = require('../models/Order');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const { ErrorHandler } = require('../utils/errorHandler');
const { uploadProductImages } = require('../utils/cloudinary');
const { sendSMS, sendOrderNotification } = require('../utils/notifications');
const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new ErrorHandler('Only image and PDF files are allowed', 400), false);
    }
  },
});

// @route   GET /api/supplier/orders
// @desc    Get supplier's orders
// @access  Private (Supplier)
// Replace the existing GET route validation (around line 32-38) with this:

// @route   GET /api/supplier/orders
// @desc    Get supplier's orders
// @access  Private (Supplier)
router.get('/', auth, authorize('supplier'), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('status').optional().custom((value) => {
    // Allow empty string or valid status values
    if (value === '' || ['pending', 'confirmed', 'preparing', 'processing', 'dispatched', 'delivered', 'cancelled'].includes(value)) {
      return true;
    }
    throw new Error('Invalid status');
  }),
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

    // Find supplier with detailed logging
    const supplier = await Supplier.findOne({ user: req.user._id });
    
    if (!supplier) {
      console.log('❌ Supplier profile not found for user:', req.user._id);
      
      // Check if user exists and their role
      const user = await User.findById(req.user._id);
      console.log('User details:', {
        id: user?._id,
        name: user?.name,
        email: user?.email,
        role: user?.role
      });
      
      return res.status(404).json({
        success: false,
        message: 'Supplier profile not found. Please complete your supplier registration.',
        debug: {
          userId: req.user._id,
          userExists: !!user,
          userRole: user?.role
        }
      });
    }

    console.log('✅ Found supplier:', {
      id: supplier._id,
      supplierId: supplier.supplierId,
      companyName: supplier.companyName
    });

    const { page = 1, limit = 10, status, dateFrom, dateTo } = req.query;

    // Build filter - only add status if it's not empty
    const filter = { supplier: supplier._id };
    if (status && status !== '') {
      filter.status = status;
    }
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    console.log('📊 Query filter:', filter);

    // Get orders with enhanced population
    const orders = await Order.find(filter)
      .populate({
        path: 'customer',
        select: 'name email phoneNumber'
      })
      .populate({
        path: 'items.product',
        select: 'name category price images'
      })
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    const total = await Order.countDocuments(filter);

    console.log(`📦 Found ${orders.length} orders out of ${total} total`);

    // Get comprehensive order statistics
    const stats = {
      total: await Order.countDocuments({ supplier: supplier._id }),
      pending: await Order.countDocuments({ supplier: supplier._id, status: 'pending' }),
      confirmed: await Order.countDocuments({ supplier: supplier._id, status: 'confirmed' }),
      preparing: await Order.countDocuments({ supplier: supplier._id, status: 'preparing' }),
      processing: await Order.countDocuments({ supplier: supplier._id, status: 'processing' }),
      dispatched: await Order.countDocuments({ supplier: supplier._id, status: 'dispatched' }),
      delivered: await Order.countDocuments({ supplier: supplier._id, status: 'delivered' }),
      cancelled: await Order.countDocuments({ supplier: supplier._id, status: 'cancelled' })
    };

    console.log('📈 Order statistics:', stats);

    // Log some sample orders for debugging
    if (orders.length > 0) {
      console.log('📋 Sample orders:');
      orders.slice(0, 3).forEach(order => {
        console.log(`- Order ${order.orderId}: ${order.customer?.name} - ${order.status} - ₹${order.pricing?.totalAmount}`);
      });
    }

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        },
        stats
      }
    });

  } catch (error) {
    console.error('❌ Supplier orders error:', error);
    next(error);
  }
});

// @route   PUT /api/supplier/orders/:orderId/status
// @desc    Update order status
// @access  Private (Supplier)
router.put('/:orderId/status', auth, authorize('supplier'), [
  param('orderId').notEmpty().withMessage('Order ID is required'),
  body('status').isIn(['preparing', 'processing', 'dispatched', 'delivered']).withMessage('Invalid status'),
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

    // Find supplier
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    // Find order
    const order = await Order.findOne({
      $or: [{ _id: orderId }, { orderId }],
      supplier: supplier._id
    }).populate('customer');

    if (!order) {
      return next(new ErrorHandler('Order not found', 404));
    }

    // Validate status transition
    const validTransitions = {
      'pending': ['preparing'],
      'preparing': ['processing'],
      'processing': ['dispatched'],
      'dispatched': ['delivered']
    };

    if (!validTransitions[order.status]?.includes(status)) {
      return next(new ErrorHandler(`Cannot change status from ${order.status} to ${status}`, 400));
    }

    // Check cooling period for early status changes
    if (order.isCoolingPeriodActive() && status === 'processing') {
      return next(new ErrorHandler('Cannot move to processing during cooling period', 400));
    }

    // Update order status
    order.updateStatus(status, note || `Order status updated to ${status}`, req.user._id);

    // Generate delivery OTP for dispatched orders
    if (status === 'dispatched') {
      const otp = order.generateDeliveryOTP();
      
      // Send OTP to customer
      try {
        await sendSMS(
          order.customer.phoneNumber,
          `Your order ${order.orderId} has been dispatched. Delivery OTP: ${otp}. Share this with the delivery person.`
        );
      } catch (error) {
        console.error('Failed to send delivery OTP:', error);
      }
    }

    await order.save();

    // Update supplier stats
    if (status === 'delivered') {
      supplier.totalOrders += 1;
      supplier.totalRevenue += order.pricing.totalAmount;
      await supplier.save();

      // Convert reserved stock to sold
      for (const item of order.items) {
        const product = await Product.findById(item.product);
        if (product) {
          product.stock.reserved = Math.max(0, product.stock.reserved - item.quantity);
          product.salesCount += item.quantity;
          await product.save();
        }
      }
    }

    // Send notification to customer
    try {
      await sendOrderNotification(order.customer, order, status);
    } catch (error) {
      console.error('Failed to send order notification:', error);
    }

    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      data: { 
        order: {
          orderId: order.orderId,
          status: order.status,
          timeline: order.timeline
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/supplier/orders/:orderId/invoice
// @desc    Update invoice with actual quantities (for aggregate, sand, steel)
// @access  Private (Supplier)
router.put('/:orderId/invoice', auth, authorize('supplier'), upload.single('weighBill'), [
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
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    // Find order
    const order = await Order.findOne({
      $or: [{ _id: orderId }, { orderId }],
      supplier: supplier._id
    }).populate('customer');

    if (!order) {
      return next(new ErrorHandler('Order not found', 404));
    }

    // Check if order is in processing state
    if (order.status !== 'processing') {
      return next(new ErrorHandler('Invoice can only be updated when order is in processing state', 400));
    }

    // Check if applicable for invoice update (aggregate, sand, steel)
    const updatableCategories = ['aggregate', 'sand', 'tmt_steel'];
    const hasUpdatableItems = order.items.some(item => 
      updatableCategories.includes(item.productSnapshot.category)
    );

    if (!hasUpdatableItems) {
      return next(new ErrorHandler('This order does not contain items that can be updated', 400));
    }

    let totalAmountDifference = 0;

    // Update each item
    for (const updateItem of items) {
      const orderItem = order.items.id(updateItem.itemId);
      if (!orderItem) {
        return next(new ErrorHandler(`Order item ${updateItem.itemId} not found`, 404));
      }

      // Check if category allows quantity update
      if (!updatableCategories.includes(orderItem.productSnapshot.category)) {
        return next(new ErrorHandler(`${orderItem.productSnapshot.name} cannot be updated`, 400));
      }

      const oldTotal = orderItem.totalPrice;
      orderItem.actualQuantityDelivered = updateItem.actualQuantity;
      orderItem.totalPrice = updateItem.actualQuantity * orderItem.unitPrice;
      
      totalAmountDifference += orderItem.totalPrice - oldTotal;
    }

    // Upload weigh bill if provided
    if (req.file) {
      // Handle file upload to cloudinary
      const weighBillUrl = await uploadToCloudinary(req.file);
      order.items.forEach(item => {
        if (items.find(ui => ui.itemId === item._id.toString())) {
          item.weighBillUrl = weighBillUrl;
        }
      });
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
    order.payment.remainingAmount = newTotalAmount - order.payment.advanceAmount;

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
      await sendSMS(
        order.customer.phoneNumber,
        `Invoice updated for order ${order.orderId}. New total: ₹${newTotalAmount.toFixed(2)}. Check app for details.`
      );
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

// @route   POST /api/supplier/orders/:orderId/delivery-complete
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
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    // Find order
    const order = await Order.findOne({
      $or: [{ _id: orderId }, { orderId }],
      supplier: supplier._id
    }).populate('customer');

    if (!order) {
      return next(new ErrorHandler('Order not found', 404));
    }

    if (order.status !== 'dispatched') {
      return next(new ErrorHandler('Order must be in dispatched status', 400));
    }

    // Verify delivery OTP
    if (order.delivery.deliveryOTP !== deliveryOTP) {
      return next(new ErrorHandler('Invalid delivery OTP', 400));
    }

    // Complete delivery
    order.updateStatus('delivered', 'Order delivered successfully', req.user._id);
    order.delivery.actualDeliveryTime = new Date();
    order.delivery.deliveryNotes = deliveryNotes;
    
    await order.save();

    // Process remaining payment if any
    if (order.payment.remainingAmount > 0) {
      // In a real scenario, you would collect the remaining payment here
      order.payment.status = 'paid'; // Assuming cash payment for remaining amount
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

// @route   GET /api/supplier/orders/analytics
// @desc    Get supplier order analytics
// @access  Private (Supplier)
router.get('/analytics', auth, authorize('supplier'), async (req, res, next) => {
  try {
    // Find supplier
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    const { period = '30' } = req.query; // days
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - parseInt(period));

    // Get analytics data
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

// Helper function for file upload
async function uploadToCloudinary(file) {
  // This would integrate with your cloudinary setup
  // For now, return a mock URL
  return `https://cloudinary.com/mock-weigh-bill-${Date.now()}.pdf`;
}

module.exports = router;