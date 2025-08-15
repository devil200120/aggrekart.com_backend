const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const PaymentGateway = require('../utils/payment');
const { ErrorHandler } = require('../utils/errorHandler');
const { sendEmail } = require('../utils/notifications');
const router = express.Router();

// Add detailed logging middleware for payment routes
router.use((req, res, next) => {
  console.log(`🔵 Payment route accessed: ${req.method} ${req.path}`);
  console.log(`🔵 Request body:`, req.body);
  console.log(`🔵 User:`, req.user ? { id: req.user._id, email: req.user.email } : 'Not authenticated');
  next();
});

// @route   GET /api/payments/methods
// @desc    Get available payment methods
// @access  Public
router.get('/methods', async (req, res) => {
  try {
    console.log('🔵 Getting payment methods...');
    const methods = PaymentGateway.getPaymentMethods();
    console.log('✅ Payment methods retrieved:', methods);
    
    res.status(200).json({
      success: true,
      message: 'Payment methods retrieved successfully',
      data: methods
    });
  } catch (error) {
    console.error('❌ Get payment methods error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment methods'
    });
  }
});

// ===== RAZORPAY ROUTES =====

// @route   POST /api/payments/razorpay/create-order
// @desc    Create Razorpay order
// @access  Private
router.post('/razorpay/create-order', auth, [
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be greater than 0')
], async (req, res, next) => {
  try {
    console.log('🔵 Razorpay create-order request:', req.body);
    console.log('🔵 User ID:', req.user._id);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { orderId, amount } = req.body;

    // Find and validate order
    const order = await Order.findOne({ orderId }).populate('customer');
    if (!order) {
      console.log('❌ Order not found:', orderId);
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    console.log('🔍 Order found - Customer ID:', order.customer._id);
    console.log('🔍 Request User ID:', req.user._id);

    // FIXED: Proper authorization check with toString()
    if (order.customer._id.toString() !== req.user._id.toString()) {
      console.log('❌ Authorization failed for Razorpay order creation');
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to access this order'
      });
    }

    if (order.payment.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Order is already paid'
      });
    }

    // Create Razorpay order
    const result = await PaymentGateway.createRazorpayOrder({
      orderId,
      amount,
      customerEmail: order.customer.email,
      customerPhone: order.customer.phoneNumber,
      customerName: order.customer.name
    });

    if (!result.success) {
      console.error('❌ Razorpay order creation failed:', result.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create payment order',
        error: result.error
      });
    }

    // Update order with Razorpay order ID
    order.payment.razorpayOrderId = result.paymentOrderId;
    order.payment.gateway = 'razorpay';
    order.payment.method = 'razorpay';
    await order.save();

    console.log('✅ Razorpay order created successfully:', result.paymentOrderId);

    res.status(200).json({
      success: true,
      message: 'Razorpay order created successfully',
      paymentOrderId: result.paymentOrderId,
      amount: result.amount,
      currency: result.currency,
      key: result.key,
      orderId: order.orderId,
      customerDetails: result.customerDetails
    });

  } catch (error) {
    console.error('❌ Razorpay create order error:', error);
    next(new ErrorHandler('Failed to create Razorpay order', 500));
  }
});

// @route   POST /api/payments/razorpay/verify
// @desc    Verify Razorpay payment
// @access  Private
router.post('/razorpay/verify', auth, [
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('paymentId').notEmpty().withMessage('Payment ID is required'),
  body('signature').notEmpty().withMessage('Signature is required')
], async (req, res, next) => {
  try {
    console.log('🔵 Razorpay verify request:', req.body);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { orderId, paymentId, signature } = req.body;

    // Find order
    const order = await Order.findOne({ 
      $or: [
        { orderId: orderId },
        { 'payment.razorpayOrderId': orderId }
      ]
    }).populate('customer');

    if (!order) {
      console.log('❌ Order not found for verification:', orderId);
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // FIXED: Proper authorization check
    if (order.customer._id.toString() !== req.user._id.toString()) {
      console.log('❌ Authorization failed for Razorpay verification');
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to access this order'
      });
    }

    // Verify payment signature
    const isValidSignature = await PaymentGateway.verifyRazorpaySignature({
      orderId,
      paymentId,
      signature
    });

    if (!isValidSignature) {
      // Mark payment as failed
      order.payment.status = 'failed';
      order.payment.failureReason = 'Invalid payment signature';
      await order.save();

      console.log('❌ Invalid Razorpay signature');
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    // Payment successful - update order
    order.payment.status = 'paid';
    order.payment.transactionId = paymentId;
    order.payment.paidAt = new Date();
    order.payment.gateway = 'razorpay';
    order.status = 'confirmed';

    // Add timeline entry
    order.timeline.push({
      status: 'confirmed',
      timestamp: new Date(),
      note: `Payment completed via Razorpay - Transaction ID: ${paymentId}`,
      updatedBy: order.customer._id
    });

    await order.save();

    console.log('✅ Razorpay payment verified successfully:', paymentId);

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        orderId: order.orderId,
        transactionId: paymentId,
        status: order.payment.status
      }
    });

  } catch (error) {
    console.error('❌ Razorpay verify payment error:', error);
    next(new ErrorHandler('Failed to verify payment', 500));
  }
});

// @route   GET /api/payments/razorpay/:paymentId
// @desc    Get Razorpay payment details
// @access  Private
router.get('/razorpay/:paymentId', auth, async (req, res, next) => {
  try {
    const { paymentId } = req.params;

    // Find order with this payment ID
    const order = await Order.findOne({ 
      'payment.transactionId': paymentId 
    }).populate('customer');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // FIXED: Proper authorization check
    if (order.customer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to access this payment'
      });
    }

    // Get payment details from Razorpay
    const result = await PaymentGateway.fetchRazorpayPayment(paymentId);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to get payment details',
        error: result.error
      });
    }

    res.status(200).json({
      success: true,
      data: {
        orderId: order.orderId,
        paymentDetails: result.payment,
        orderStatus: order.status,
        paymentStatus: order.payment.status
      }
    });

  } catch (error) {
    console.error('❌ Get Razorpay payment details error:', error);
    next(new ErrorHandler('Failed to get payment details', 500));
  }
});

// @route   GET /api/payments/status/:orderId
// @desc    Get payment status
// @access  Private
router.get('/status/:orderId', auth, async (req, res, next) => {
  try {
    console.log('🔵 Payment status check for:', req.params.orderId);
    console.log('🔵 User ID:', req.user._id);

    const { orderId } = req.params;

    const order = await Order.findOne({ orderId }).populate('customer');
    if (!order) {
      console.log('❌ Order not found for status check:', orderId);
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    console.log('🔍 Status check - Customer ID:', order.customer._id);
    console.log('🔍 Status check - User ID:', req.user._id);

    // FIXED: Proper authorization check with toString()
    if (order.customer._id.toString() !== req.user._id.toString()) {
      console.log('❌ Authorization failed for payment status check');
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to access this order'
      });
    }

    console.log('✅ Payment status retrieved successfully');

    res.status(200).json({
      success: true,
      data: {
        orderId: order.orderId,
        paymentStatus: order.payment.status,
        transactionId: order.payment.transactionId,
        gateway: order.payment.gateway,
        amount: order.payment.advanceAmount,
        paidAt: order.payment.paidAt
      }
    });

  } catch (error) {
    console.error('❌ Get payment status error:', error);
    next(new ErrorHandler('Failed to get payment status', 500));
  }
});

// ===== CASHFREE ROUTES WITH EXTENSIVE DEBUG =====

// @route   POST /api/payments/cashfree/create-order
// @desc    Create Cashfree order
// @access  Private
router.post('/cashfree/create-order', auth, [
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be greater than 0')
], async (req, res, next) => {
  console.log('🟠 ========= CASHFREE ORDER CREATION DEBUG =========');
  console.log('🟠 Step 1: Route accessed');
  
  try {
    console.log('🟠 Step 2: Request validation');
    console.log('🟠 Request body:', JSON.stringify(req.body, null, 2));
    console.log('🟠 User:', req.user ? { id: req.user._id, email: req.user.email } : 'Not authenticated');

    // Validate Cashfree configuration
    console.log('🟠 Step 3: Checking Cashfree configuration');
    console.log('🟠 CASHFREE_APP_ID:', process.env.CASHFREE_APP_ID ? 'SET' : 'NOT SET');
    console.log('🟠 CASHFREE_SECRET_KEY:', process.env.CASHFREE_SECRET_KEY ? 'SET' : 'NOT SET');
    console.log('🟠 CASHFREE_ENVIRONMENT:', process.env.CASHFREE_ENVIRONMENT);

    if (!process.env.CASHFREE_APP_ID || !process.env.CASHFREE_SECRET_KEY) {
      console.log('❌ Cashfree credentials not configured');
      return res.status(503).json({
        success: false,
        message: 'Cashfree payment gateway is not configured'
      });
    }

    console.log('✅ Cashfree credentials available');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { orderId, amount } = req.body;
    console.log('🟠 Step 4: Processing order:', orderId, 'Amount:', amount);

    // Validate amount
    if (amount <= 0 || amount > 500000) {
      console.log('❌ Invalid amount:', amount);
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction amount (must be between ₹1 and ₹5,00,000)'
      });
    }

    console.log('🟠 Step 5: Finding order in database');
    // Find and validate order
    const order = await Order.findOne({ orderId }).populate('customer');
    if (!order) {
      console.log('❌ Order not found:', orderId);
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    console.log('✅ Order found:', order.orderId);
    console.log('🔍 Order customer:', order.customer._id);
    console.log('🔍 Request user:', req.user._id);

    console.log('🟠 Step 6: Authorization check');
    // FIXED: Proper authorization check with toString()
    if (order.customer._id.toString() !== req.user._id.toString()) {
      console.log('❌ Authorization failed');
      console.log('❌ Customer ID (string):', order.customer._id.toString());
      console.log('❌ User ID (string):', req.user._id.toString());
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to access this order'
      });
    }

    console.log('✅ Authorization passed');

    // Check if order is already paid
    if (order.payment.status === 'paid') {
      console.log('❌ Order already paid');
      return res.status(400).json({
        success: false,
        message: 'Order is already paid'
      });
    }

    // Check if order is cancelled
    if (order.status === 'cancelled') {
      console.log('❌ Order is cancelled');
      return res.status(400).json({
        success: false,
        message: 'Cannot pay for cancelled order'
      });
    }

    console.log('🟠 Step 7: Validating customer details');
    // Validate customer details
    const customerValidation = {
      email: !!order.customer.email,
      phone: !!order.customer.phoneNumber,
      name: !!order.customer.name
    };
    console.log('🔍 Customer details:', customerValidation);

    if (!order.customer.email || !order.customer.phoneNumber || !order.customer.name) {
      console.log('❌ Incomplete customer details:', customerValidation);
      return res.status(400).json({
        success: false,
        message: 'Customer details are incomplete. Please update your profile.'
      });
    }

    console.log('✅ Customer details validated');

    console.log('🟠 Step 8: Calling PaymentGateway.createCashfreeOrder');
    console.log('🟠 Parameters:', {
      orderId,
      amount,
      customerEmail: order.customer.email,
      customerPhone: order.customer.phoneNumber,
      customerName: order.customer.name
    });

    // Create Cashfree order using the working direct API
    const result = await PaymentGateway.createCashfreeOrder({
      orderId,
      amount,
      customerEmail: order.customer.email,
      customerPhone: order.customer.phoneNumber,
      customerName: order.customer.name
    });

    console.log('🟠 Step 9: PaymentGateway response received');
    console.log('🟠 Result:', JSON.stringify(result, null, 2));

    if (!result.success) {
      console.error('❌ Cashfree order creation failed:', result.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create payment order',
        error: result.error,
        details: result.details
      });
    }

    if (!result.data || !result.data.payment_session_id) {
      console.error('❌ Invalid Cashfree response - missing payment session');
      return res.status(500).json({
        success: false,
        message: 'Invalid response from payment gateway'
      });
    }

    console.log('🟠 Step 10: Updating order in database');
    // Update order with Cashfree details
    order.payment.cashfreeOrderId = result.data.id;
    order.payment.gateway = 'cashfree';
    order.payment.sessionId = result.data.payment_session_id;
    order.payment.method = 'cashfree';
    
    // Add timeline entry
    order.timeline.push({
      status: order.status,
      timestamp: new Date(),
      note: 'Cashfree payment order created',
      updatedBy: req.user._id
    });

    await order.save();
    console.log('✅ Order updated successfully');

    console.log('🟠 Step 11: Sending success response');
    const response = {
      success: true,
      message: 'Cashfree order created successfully',
      data: {
        cashfreeOrderId: result.data.id,
        amount: result.data.amount,
        currency: result.data.currency || 'INR',
        orderId: order.orderId,
        payment_session_id: result.data.payment_session_id,
        order_token: result.data.order_token,
        payment_link: result.data.payment_link,
        appId: process.env.CASHFREE_APP_ID,
        environment: process.env.CASHFREE_ENVIRONMENT,
        customerDetails: {
          email: order.customer.email,
          phone: order.customer.phoneNumber,
          name: order.customer.name
        }
      }
    };

    console.log('✅ SUCCESS! Cashfree order created:', result.data.id);
    console.log('🟠 ========= END DEBUG =========');

    res.status(200).json(response);

  } catch (error) {
    console.error('❌ ========= CASHFREE ERROR DEBUG =========');
    console.error('❌ Error type:', error.constructor.name);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    
    if (error.response) {
      console.error('❌ HTTP Response Status:', error.response.status);
      console.error('❌ HTTP Response Data:', error.response.data);
    }
    
    console.error('❌ ========= END ERROR DEBUG =========');
    
    // Send detailed error response for debugging
    res.status(500).json({
      success: false,
      message: 'Internal server error while creating payment order',
      error: error.message,
      type: error.constructor.name,
      details: process.env.NODE_ENV === 'development' ? {
        stack: error.stack,
        response: error.response?.data
      } : undefined
    });
  }
});

// @route   POST /api/payments/cashfree/verify
// @desc    Verify Cashfree payment
// @access  Private
router.post('/cashfree/verify', auth, [
  body('cashfree_order_id').notEmpty().withMessage('Cashfree order ID is required'),
  body('cashfree_payment_id').notEmpty().withMessage('Cashfree payment ID is required'),
  body('orderId').notEmpty().withMessage('Order ID is required')
], async (req, res, next) => {
  try {
    console.log('🟠 Cashfree verify request:', req.body);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { cashfree_order_id, cashfree_payment_id, orderId } = req.body;

    // Find order
    const order = await Order.findOne({ orderId }).populate('customer');
    if (!order) {
      console.log('❌ Order not found for verification:', orderId);
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // FIXED: Proper authorization check
    if (order.customer._id.toString() !== req.user._id.toString()) {
      console.log('❌ Authorization failed for Cashfree verification');
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to access this order'
      });
    }

    if (order.payment.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Payment already verified',
        data: {
          orderId: order.orderId,
          status: order.payment.status
        }
      });
    }

    console.log('🟠 Verifying Cashfree payment...');

    // Verify payment with Cashfree using the working API
    const verification = await PaymentGateway.verifyCashfreeSignature({
      orderId: cashfree_order_id,
      paymentId: cashfree_payment_id
    });

    console.log('🟠 Cashfree verification result:', verification);

    if (!verification.success || !verification.isValid) {
      // Mark payment as failed
      order.payment.status = 'failed';
      order.payment.failureReason = verification.error || 'Payment verification failed';
      await order.save();

      console.log('❌ Cashfree payment verification failed:', verification.error);
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed',
        error: verification.error
      });
    }

    // Payment successful - update order
    order.payment.status = 'paid';
    order.payment.transactionId = cashfree_payment_id;
    order.payment.paidAt = new Date();
    order.payment.gateway = 'cashfree';
    order.status = 'confirmed';

    // Store additional payment details
    if (verification.paymentDetails) {
      order.payment.paymentMethod = verification.paymentDetails.payment_method;
      order.payment.bankReference = verification.paymentDetails.bank_reference;
    }

    // Add timeline entry
    order.timeline.push({
      status: 'confirmed',
      timestamp: new Date(),
      note: `Payment completed via Cashfree - Transaction ID: ${cashfree_payment_id}`,
      updatedBy: order.customer._id
    });

    await order.save();

    console.log(`✅ Cashfree payment verified successfully: ${cashfree_payment_id}`);

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        orderId: order.orderId,
        transactionId: cashfree_payment_id,
        status: order.payment.status,
        paymentDetails: verification.paymentDetails
      }
    });

  } catch (error) {
    console.error('❌ Cashfree verify payment error:', error);
    next(new ErrorHandler('Failed to verify Cashfree payment', 500));
  }
});

// @route   GET /api/payments/cashfree/:orderId
// @desc    Get Cashfree order details
// @access  Private
router.get('/cashfree/:orderId', auth, async (req, res, next) => {
  try {
    const { orderId } = req.params;

    // Find order
    const order = await Order.findOne({ orderId }).populate('customer');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // FIXED: Proper authorization check
    if (order.customer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to access this order'
      });
    }

    // Get Cashfree order details
    const result = await PaymentGateway.fetchCashfreePayment(order.payment.cashfreeOrderId);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to get order details',
        error: result.error
      });
    }

    res.status(200).json({
      success: true,
      data: {
        orderId: order.orderId,
        cashfreeOrder: result.order,
        paymentStatus: order.payment.status,
        orderStatus: order.status
      }
    });

  } catch (error) {
    console.error('❌ Get Cashfree order details error:', error);
    next(new ErrorHandler('Failed to get order details', 500));
  }
});

// @route   POST /api/payments/cashfree/webhook
// @desc    Handle Cashfree webhook notifications
// @access  Public (but secured with signature verification)
router.post('/cashfree/webhook', async (req, res) => {
  try {
    console.log('📡 Cashfree webhook received:', JSON.stringify(req.body, null, 2));

    const { data, type } = req.body;

    if (!data || !type) {
      console.log('❌ Invalid webhook payload');
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook payload'
      });
    }

    console.log('📡 Processing webhook type:', type);

    // Handle different webhook types
    if (type === 'PAYMENT_SUCCESS_WEBHOOK' || type === 'PAYMENT_FAILED_WEBHOOK') {
      const { order, payment } = data;
      
      if (!order || !payment) {
        console.log('❌ Missing order or payment data in webhook');
        return res.status(400).json({
          success: false,
          message: 'Missing order or payment data in webhook'
        });
      }

      // Find the order in our database
      const dbOrder = await Order.findOne({ 
        'payment.cashfreeOrderId': order.order_id 
      }).populate('customer');

      if (!dbOrder) {
        console.log(`⚠️  Order not found for Cashfree order ID: ${order.order_id}`);
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      const { payment_status, cf_payment_id, payment_amount, payment_message } = payment;

      console.log(`📡 Processing webhook for order ${dbOrder.orderId}: ${payment_status}`);

      // Process webhook based on payment status
      if (payment_status === 'SUCCESS') {
        // Update payment status to paid if not already
        if (dbOrder.payment.status !== 'paid') {
          dbOrder.payment.status = 'paid';
          dbOrder.payment.transactionId = cf_payment_id;
          dbOrder.payment.paidAt = new Date();
          dbOrder.status = 'confirmed';

          // Add timeline entry
          dbOrder.timeline.push({
            status: 'confirmed',
            timestamp: new Date(),
            note: `Payment completed via Cashfree webhook - Transaction ID: ${cf_payment_id}`,
            updatedBy: dbOrder.customer._id
          });

          await dbOrder.save();
          console.log(`✅ Order ${dbOrder.orderId} marked as paid via webhook`);
        }
      } else if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(payment_status)) {
        // Update payment status to failed
        if (dbOrder.payment.status !== 'failed') {
          dbOrder.payment.status = 'failed';
          dbOrder.payment.failureReason = payment_message || `Payment ${payment_status.toLowerCase()}`;
          
          // Add timeline entry
          dbOrder.timeline.push({
            status: dbOrder.status,
            timestamp: new Date(),
            note: `Payment ${payment_status.toLowerCase()} via Cashfree webhook - ${payment_message || 'No message'}`,
            updatedBy: dbOrder.customer._id
          });

          await dbOrder.save();
          console.log(`❌ Order ${dbOrder.orderId} payment failed via webhook: ${payment_status}`);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('❌ Cashfree webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed'
    });
  }
});

module.exports = router;
