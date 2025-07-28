const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { auth, authorize, canPlaceOrders } = require('../middleware/auth');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const User = require('../models/User');
const { ErrorHandler } = require('../utils/errorHandler');
const { sendOrderNotification, sendSMS } = require('../utils/notifications');
const { initiatePayment, verifyPayment } = require('../utils/payment');
const router = express.Router();

// @route   POST /api/orders/checkout
// @desc    Create order from cart
// @access  Private (Customer)
// ... existing imports remain the same ...

// @route   POST /api/orders/checkout
// @desc    Create order from cart
// @access  Private (Customer)
router.post('/checkout', auth, authorize('customer'), [
  body('deliveryAddressId').isMongoId().withMessage('Valid delivery address is required'),
  body('paymentMethod').isIn(['cod', 'card', 'upi', 'netbanking', 'wallet']).withMessage('Valid payment method is required'),
  body('advancePercentage').optional().isInt({ min: 25, max: 100 }).withMessage('Advance percentage must be between 25-100'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
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

    console.log('✅ Checkout request body:', req.body);

    const { deliveryAddressId, paymentMethod, advancePercentage = 25, notes } = req.body;

    // Check user verification status
    const currentUser = await User.findById(req.user._id);
    
    if (!currentUser.phoneVerified) {
      return res.status(403).json({
        success: false,
        message: 'Phone number must be verified to place orders',
        requiresVerification: true,
        verificationType: 'phone'
      });
    }

    if (!currentUser.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account must be activated to place orders',
        requiresVerification: true,
        verificationType: 'account_activation'
      });
    }

    // Get user's cart
    const cart = await Cart.findOne({ user: req.user._id })
      .populate({
        path: 'items.product',
        populate: {
          path: 'supplier'
        }
      });

    if (!cart || cart.items.length === 0) {
      return next(new ErrorHandler('Cart is empty', 400));
    }

    // Validate delivery address
    const user = await User.findById(req.user._id);
    const deliveryAddress = user.addresses.id(deliveryAddressId);

    if (!deliveryAddress) {
      return next(new ErrorHandler('Delivery address not found', 404));
    }

    // Validate cart items
    await cart.removeExpiredItems();
    const stockIssues = await cart.validateStock();
    
    if (stockIssues.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Some items in your cart are no longer available',
        errors: stockIssues
      });
    }

    // Group items by supplier (each supplier gets separate order)
    const supplierGroups = {};
    cart.items.forEach(item => {
      const supplierId = item.product.supplier._id.toString();
      if (!supplierGroups[supplierId]) {
        supplierGroups[supplierId] = {
          supplier: item.product.supplier,
          items: []
        };
      }
      supplierGroups[supplierId].items.push(item);
    });

    const orders = [];

    // Create order for each supplier
    for (const [supplierId, group] of Object.entries(supplierGroups)) {
      // Calculate pricing
      const subtotal = group.items.reduce((sum, item) => 
        sum + (item.quantity * item.priceAtTime), 0
      );
      
      const commissionRate = group.supplier.commissionRate || 5;
      const commission = Math.round((subtotal * commissionRate) / 100);
      
      // Calculate GST (simplified - should be per item)
      const gstAmount = Math.round((subtotal * 18) / 100);
      
      // Payment gateway charges (2.5% + GST) - Only for online payments
      let paymentGatewayCharges = 0;
      
      if (paymentMethod !== 'cod') {
        paymentGatewayCharges = Math.round(((subtotal + commission + gstAmount) * 2.5) / 100);
      }
      
      const totalAmount = subtotal + commission + gstAmount + paymentGatewayCharges;

      // Generate order ID
      const orderId = `AGK${Date.now()}${Math.random().toString(36).substr(2, 3).toUpperCase()}`;
      
      // FIXED: Create order with correct structure matching the model
      const order = new Order({
        orderId,
        customer: req.user._id, // FIXED: Use 'customer' instead of 'user'
        supplier: supplierId,
        
        // FIXED: Items with required unitPrice and totalPrice
        items: group.items.map(item => ({
          product: item.product._id,
          quantity: item.quantity,
          unitPrice: item.priceAtTime, // FIXED: Added required unitPrice
          totalPrice: item.quantity * item.priceAtTime, // FIXED: Added required totalPrice
          specifications: item.specifications || {},
          productSnapshot: {
            name: item.product.name,
            description: item.product.description,
            category: item.product.category,
            brand: item.product.brand || 'Unknown',
            imageUrl: item.product.images && item.product.images.length > 0 ? item.product.images[0] : null
          }
        })),
        
        // FIXED: Pricing structure matching the model
        pricing: {
          subtotal: subtotal, // FIXED: Required field
          transportCost: 0,
          gstAmount: gstAmount,
          commission: commission,
          paymentGatewayCharges: paymentGatewayCharges,
          totalAmount: totalAmount // FIXED: Required field
        },
        
        // FIXED: Payment structure matching the model
        payment: {
          method: paymentMethod, // FIXED: Required field
          status: 'pending',
          advancePercentage: paymentMethod === 'cod' ? 100 : advancePercentage,
          advanceAmount: paymentMethod === 'cod' ? totalAmount : Math.round((totalAmount * advancePercentage) / 100),
          remainingAmount: paymentMethod === 'cod' ? 0 : totalAmount - Math.round((totalAmount * advancePercentage) / 100)
        },
        
        // Delivery address
        deliveryAddress: {
          address: deliveryAddress.address,
          city: deliveryAddress.city,
          state: deliveryAddress.state,
          pincode: deliveryAddress.pincode,
          coordinates: deliveryAddress.coordinates || { latitude: 0, longitude: 0 }
        },
        
        // FIXED: Status using valid enum value
        status: 'pending', // FIXED: Use 'pending' instead of 'pending_confirmation'
        
        // FIXED: Cooling period (will be auto-set by pre-save middleware, but we can set startTime)
        coolingPeriod: {
          startTime: new Date(),
          // endTime will be set automatically by pre-save middleware
          isActive: true,
          canModify: true
        },
        
        // Timeline
        timeline: [{
          status: 'pending',
          timestamp: new Date(),
          note: 'Order created',
          updatedBy: req.user._id
        }],
        
        // Additional fields
        notes: notes || '',
        delivery: {
          estimatedTime: '2-3 business days'
        }
      });

      console.log('🛍️ Creating order with structure:', {
        orderId: order.orderId,
        customer: order.customer,
        supplier: order.supplier,
        itemsCount: order.items.length,
        pricing: order.pricing,
        payment: order.payment,
        status: order.status,
        coolingPeriod: order.coolingPeriod
      });

      await order.save();
      orders.push(order);

      // Update product stock
      for (const item of group.items) {
        await Product.findByIdAndUpdate(item.product._id, {
          $inc: { 
            'stock.reserved': item.quantity,
            'stock.available': -item.quantity
          }
        });
      }

      // Send notifications
      try {
        await sendOrderNotification(order, 'new_order');
      } catch (error) {
        console.error('Failed to send order notification:', error);
      }
    }

    // Clear cart after successful order creation
    await Cart.findOneAndUpdate(
      { user: req.user._id },
      { $set: { items: [] } }
    );

    console.log('✅ Orders created successfully:', orders.length);

    res.status(201).json({
      success: true,
      message: `${orders.length} order(s) created successfully`,
      data: {
        orders: orders.map(order => ({
          orderId: order.orderId,
          totalAmount: order.pricing.totalAmount,
          advanceAmount: order.payment.advanceAmount,
          balanceAmount: order.payment.remainingAmount,
          paymentMethod: order.payment.method,
          status: order.status,
          coolingPeriod: order.coolingPeriod
        })),
        // Return first order for payment processing
        order: orders[0]
      }
    });

  } catch (error) {
    console.error('❌ Checkout error:', error);
    next(error);
  }
});

// ... rest of the existing routes remain the same// @route   POST /api/orders/:orderId/payment/verify
// @desc    Verify payment and update order
// @access  Private (Customer)
router.post('/:orderId/payment/verify', auth, authorize('customer'), [
  param('orderId').notEmpty().withMessage('Order ID is required'),
  body('paymentId').notEmpty().withMessage('Payment ID is required'),
  body('signature').notEmpty().withMessage('Payment signature is required')
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
    const { paymentId, signature } = req.body;

    // Find order
    const order = await Order.findOne({
      $or: [{ _id: orderId }, { orderId }],
      customer: req.user._id
    });

    if (!order) {
      return next(new ErrorHandler('Order not found', 404));
    }

    // Verify payment
    const isPaymentValid = await verifyPayment({
      orderId: order.orderId,
      paymentId,
      signature
    });

    if (!isPaymentValid) {
      order.payment.status = 'failed';
      await order.save();
      
      return next(new ErrorHandler('Payment verification failed', 400));
    }

    // Update order payment status
    order.payment.status = 'paid';
    order.payment.transactionId = paymentId;
    order.payment.paidAt = new Date();
    order.updateStatus('preparing', 'Payment verified. Order is being prepared.', req.user._id);

    await order.save();

    // Update customer order count and membership tier
    const user = await User.findById(req.user._id);
    user.orderCount += 1;
    user.totalOrderValue += order.pricing.totalAmount;
    user.updateMembershipTier();
    
    // Award aggre coins (2% of order value)
    const coinsEarned = Math.floor(order.pricing.totalAmount * 0.02);
    user.aggreCoins += coinsEarned;
    
    await user.save();

    res.json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        order: {
          orderId: order.orderId,
          status: order.status,
          paymentStatus: order.payment.status
        },
        coinsEarned
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/orders
// @desc    Get user's orders
// @access  Private (Customer)
router.get('/', auth, authorize('customer'), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive'),
  query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Limit must be between 1 and 20'),
  query('status').optional().isIn(['pending', 'preparing', 'processing', 'dispatched', 'delivered', 'cancelled']).withMessage('Invalid status')
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

    const { page = 1, limit = 10, status } = req.query;

    const filter = { customer: req.user._id };
    if (status) filter.status = status;

    const orders = await Order.getOrdersWithFilters(filter, {
      page: parseInt(page),
      limit: parseInt(limit),
      populate: ['supplier']
    });

    const total = await Order.countDocuments(filter);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/orders/:orderId
// @desc    Get single order details
// @access  Private (Customer/Supplier)
router.get('/:orderId', auth, [
  param('orderId').notEmpty().withMessage('Order ID is required')
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

    // Build filter based on user role
    let filter = {
      $or: [{ _id: orderId }, { orderId }]
    };

    if (req.user.role === 'customer') {
      filter.customer = req.user._id;
    } else if (req.user.role === 'supplier') {
      const supplier = await Supplier.findOne({ user: req.user._id });
      if (!supplier) {
        return next(new ErrorHandler('Supplier profile not found', 404));
      }
      filter.supplier = supplier._id;
    }

    const order = await Order.findOne(filter)
      .populate('customer', 'name email phoneNumber customerId')
      .populate('supplier', 'companyName contactPersonName contactPersonNumber')
      .populate('items.product', 'name category pricing.unit');

    if (!order) {
      return next(new ErrorHandler('Order not found', 404));
    }

    // Add cooling period status
    const orderResponse = {
      ...order.toObject(),
      isCoolingPeriodActive: order.isCoolingPeriodActive(),
      canModify: order.isCoolingPeriodActive() && order.coolingPeriod.canModify
    };

    res.json({
      success: true,
      data: { order: orderResponse }
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/orders/:orderId/cancel
// @desc    Cancel order (during cooling period)
// @access  Private (Customer)
router.put('/:orderId/cancel', auth, authorize('customer'), [
  param('orderId').notEmpty().withMessage('Order ID is required'),
  body('reason').trim().isLength({ min: 5 }).withMessage('Cancellation reason must be at least 5 characters')
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
    const { reason } = req.body;

    const order = await Order.findOne({
      $or: [{ _id: orderId }, { orderId }],
      customer: req.user._id
    });

    if (!order) {
      return next(new ErrorHandler('Order not found', 404));
    }

    if (!order.isCoolingPeriodActive()) {
      return next(new ErrorHandler('Order cannot be cancelled. Cooling period has expired.', 400));
    }

    if (order.status === 'cancelled') {
      return next(new ErrorHandler('Order is already cancelled', 400));
    }

    // Calculate refund amount
    const refundCalculation = order.calculateCoolingPeriodRefund();
    
    if (!refundCalculation.canRefund) {
      return next(new ErrorHandler(refundCalculation.message, 400));
    }

    // Update order status
    order.updateStatus('cancelled', 'Order cancelled by customer', req.user._id);
    order.cancellation = {
      reason,
      cancelledBy: req.user._id,
      cancelledAt: new Date(),
      refundAmount: refundCalculation.refundAmount,
      deductionAmount: refundCalculation.deductionAmount,
      deductionPercentage: refundCalculation.deductionPercentage
    };
    order.payment.status = 'refunded';

    await order.save();

    // Release reserved stock
    for (const item of order.items) {
      const product = await Product.findById(item.product);
      if (product) {
        product.stock.reserved = Math.max(0, product.stock.reserved - item.quantity);
        await product.save();
      }
    }

    // Process refund (integrate with payment gateway)
    // await processRefund(order.payment.transactionId, refundCalculation.refundAmount);

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: {
        order: {
          orderId: order.orderId,
          status: order.status,
          refundDetails: order.cancellation
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/orders/:orderId/modify
// @desc    Modify order (during cooling period)
// @access  Private (Customer)
router.put('/:orderId/modify', auth, authorize('customer'), [
  param('orderId').notEmpty().withMessage('Order ID is required'),
  body('deliveryAddressId').optional().isMongoId().withMessage('Valid delivery address required'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
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
    const { deliveryAddressId, notes } = req.body;

    const order = await Order.findOne({
      $or: [{ _id: orderId }, { orderId }],
      customer: req.user._id
    });

    if (!order) {
      return next(new ErrorError('Order not found', 404));
    }

    if (!order.isCoolingPeriodActive()) {
      return next(new ErrorHandler('Order cannot be modified. Cooling period has expired.', 400));
    }

    const user = await User.findById(req.user._id);
    let updated = false;

    // Update delivery address if provided
    if (deliveryAddressId) {
      const newAddress = user.addresses.id(deliveryAddressId);
      if (!newAddress) {
        return next(new ErrorHandler('Delivery address not found', 404));
      }
      
      order.deliveryAddress = {
        address: newAddress.address,
        city: newAddress.city,
        state: newAddress.state,
        pincode: newAddress.pincode,
        coordinates: newAddress.coordinates
      };
      updated = true;
    }

    // Update notes if provided
    if (notes !== undefined) {
      order.notes = notes;
      updated = true;
    }

    if (!updated) {
      return next(new ErrorHandler('No modifications provided', 400));
    }

    order.timeline.push({
      status: order.status,
      timestamp: new Date(),
      note: 'Order modified by customer',
      updatedBy: req.user._id
    });

    await order.save();

    res.json({
      success: true,
      message: 'Order modified successfully',
      data: { order }
    });

  } catch (error) {
    next(error);
  }
});
// ...existing code...

// Add this route before the last export statement

// @route   GET /api/orders/history
// @desc    Get order history with analytics data
// @access  Private (Customer)
router.get('/history', auth, authorize('customer'), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('analytics').optional().isBoolean().withMessage('Analytics must be boolean'),
  query('timeRange').optional().isIn(['1month', '3months', '6months', '1year', 'all']).withMessage('Invalid time range')
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

    const { page = 1, limit = 50, analytics = false, timeRange = 'all' } = req.query;

    const filter = { customer: req.user._id };

    // Add time range filter
    if (timeRange !== 'all') {
      const now = new Date();
      let startDate;
      
      switch (timeRange) {
        case '1month':
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          break;
        case '3months':
          startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
          break;
        case '6months':
          startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
          break;
        case '1year':
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        default:
          startDate = null;
      }
      
      if (startDate) {
        filter.createdAt = { $gte: startDate };
      }
    }

    const orders = await Order.find(filter)
      .populate('supplier', 'name businessName')
      .populate('items.product', 'name category subcategory')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) * parseInt(page))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Order.countDocuments(filter);

    // If analytics requested, add summary data
    let analyticsData = null;
    if (analytics || analytics === 'true') {
      const allOrdersForAnalytics = await Order.find(filter)
        .populate('items.product', 'name category subcategory');

      const totalSpent = allOrdersForAnalytics.reduce((sum, order) => sum + (order.pricing?.totalAmount || 0), 0);
      const completedOrders = allOrdersForAnalytics.filter(order => order.status === 'delivered');
      const averageOrderValue = allOrdersForAnalytics.length > 0 ? totalSpent / allOrdersForAnalytics.length : 0;

      // Monthly spending
      const monthlySpending = {};
      allOrdersForAnalytics.forEach(order => {
        const month = new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        monthlySpending[month] = (monthlySpending[month] || 0) + (order.pricing?.totalAmount || 0);
      });

      // Top categories
      const categorySpending = {};
      allOrdersForAnalytics.forEach(order => {
        order.items?.forEach(item => {
          const category = item.product?.category || item.productSnapshot?.category || 'Other';
          categorySpending[category] = (categorySpending[category] || 0) + (item.totalPrice || 0);
        });
      });

      const topCategories = Object.entries(categorySpending)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([name, amount]) => ({ name, amount }));

      analyticsData = {
        totalOrders: allOrdersForAnalytics.length,
        totalSpent,
        averageOrderValue,
        completedOrders: completedOrders.length,
        monthlySpending,
        topCategories,
        timeRange
      };
    }

    res.json({
      success: true,
      data: {
        orders,
        analytics: analyticsData,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });

  } catch (error) {
    next(error);
  }
});


module.exports = router;
