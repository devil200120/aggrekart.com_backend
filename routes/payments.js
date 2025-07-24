const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { body, param, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const Order = require('../models/Order');
const User = require('../models/User');
const { ErrorHandler } = require('../utils/errorHandler');
const { sendEmail } = require('../utils/notifications');
const router = express.Router();

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// @route   POST /api/payments/create-order
// @desc    Create Razorpay order for payment
// @access  Private
router.post('/create-order', auth, [
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),
  body('currency').optional().isIn(['INR']).withMessage('Currency must be INR')
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

    const { orderId, amount, currency = 'INR' } = req.body;

    // Find the order
    const order = await Order.findOne({ orderId }).populate('customer');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Verify order belongs to user
    if (order.customer._id.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to access this order'
      });
    }

    // Check if order is already paid
    if (order.payment.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Order is already paid'
      });
    }

    // Verify amount matches order amount
    const expectedAmount = Math.round(amount * 100); // Convert to paise
    if (expectedAmount !== Math.round(order.payment.advanceAmount * 100)) {
      return res.status(400).json({
        success: false,
        message: 'Amount mismatch'
      });
    }

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: expectedAmount, // Amount in paise
      currency: currency,
      receipt: orderId,
      payment_capture: 1,
      notes: {
        orderId: order.orderId,
        customerId: order.customer._id.toString(),
        customerEmail: order.customer.email,
        customerPhone: order.customer.phoneNumber
      }
    });

    // Update order with Razorpay order ID
    order.payment.razorpayOrderId = razorpayOrder.id;
    await order.save();

    res.status(200).json({
      success: true,
      message: 'Payment order created successfully',
      data: {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        orderId: order.orderId,
        key: process.env.RAZORPAY_KEY_ID
      }
    });

  } catch (error) {
    console.error('Create payment order error:', error);
    next(new ErrorHandler('Failed to create payment order', 500));
  }
});

// @route   POST /api/payments/verify
// @desc    Verify Razorpay payment signature
// @access  Private
router.post('/verify', auth, [
  body('razorpay_order_id').notEmpty().withMessage('Razorpay order ID is required'),
  body('razorpay_payment_id').notEmpty().withMessage('Razorpay payment ID is required'),
  body('razorpay_signature').notEmpty().withMessage('Razorpay signature is required'),
  body('orderId').notEmpty().withMessage('Order ID is required')
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

    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature, 
      orderId 
    } = req.body;

    // Find the order
    const order = await Order.findOne({ orderId }).populate('customer supplier');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Verify order belongs to user
    if (order.customer._id.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to access this order'
      });
    }

    // Verify signature
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest("hex");

    if (razorpay_signature !== expectedSign) {
      // Mark payment as failed
      order.payment.status = 'failed';
      order.payment.paymentGatewayResponse = {
        error: 'Invalid signature',
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      };
      await order.save();

      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    // Fetch payment details from Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    // Update order with payment details
    order.payment.status = 'paid';
    order.payment.transactionId = razorpay_payment_id;
    order.payment.paidAt = new Date();
    order.payment.method = payment.method;
    order.payment.paymentGatewayResponse = {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      payment_details: payment
    };

    // Update order status to preparing
    order.updateStatus('preparing', 'Payment completed successfully', req.user.userId);

    await order.save();

    // Send confirmation emails
    try {
      // Email to customer
      await sendEmail({
        to: order.customer.email,
        subject: 'Payment Successful - Order Confirmed',
        template: 'payment-success',
        data: {
          customerName: order.customer.name,
          orderId: order.orderId,
          amount: order.payment.advanceAmount,
          transactionId: razorpay_payment_id
        }
      });

      // Email to supplier
      await sendEmail({
        to: order.supplier.email,
        subject: 'New Order Received - Payment Confirmed',
        template: 'new-order-supplier',
        data: {
          supplierName: order.supplier.companyName,
          orderId: order.orderId,
          customerName: order.customer.name,
          amount: order.payment.advanceAmount
        }
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Don't fail the payment verification for email errors
    }

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        orderId: order.orderId,
        transactionId: razorpay_payment_id,
        amount: order.payment.advanceAmount,
        status: order.payment.status,
        paidAt: order.payment.paidAt
      }
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    next(new ErrorHandler('Payment verification failed', 500));
  }
});

// @route   POST /api/payments/webhook
// @desc    Handle Razorpay webhooks
// @access  Public (but verified)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    const body = req.body;

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

    if (webhookSignature !== expectedSignature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }

    const event = JSON.parse(body.toString());
    const { event: eventType, payload } = event;

    console.log('Webhook received:', eventType);

    switch (eventType) {
      case 'payment.captured':
        await handlePaymentCaptured(payload.payment.entity);
        break;
      
      case 'payment.failed':
        await handlePaymentFailed(payload.payment.entity);
        break;
      
      case 'refund.processed':
        await handleRefundProcessed(payload.refund.entity);
        break;
      
      default:
        console.log('Unhandled webhook event:', eventType);
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
});

// Helper function to handle payment captured
async function handlePaymentCaptured(payment) {
  try {
    const order = await Order.findOne({ 
      'payment.razorpayOrderId': payment.order_id 
    }).populate('customer supplier');

    if (order && order.payment.status !== 'paid') {
      order.payment.status = 'paid';
      order.payment.transactionId = payment.id;
      order.payment.paidAt = new Date();
      order.payment.paymentGatewayResponse = payment;
      
      order.updateStatus('preparing', 'Payment captured via webhook', null);
      await order.save();

      console.log('Payment captured for order:', order.orderId);
    }
  } catch (error) {
    console.error('Error handling payment captured:', error);
  }
}

// Helper function to handle payment failed
async function handlePaymentFailed(payment) {
  try {
    const order = await Order.findOne({ 
      'payment.razorpayOrderId': payment.order_id 
    });

    if (order) {
      order.payment.status = 'failed';
      order.payment.paymentGatewayResponse = payment;
      await order.save();

      console.log('Payment failed for order:', order.orderId);
    }
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
}

// Helper function to handle refund processed
async function handleRefundProcessed(refund) {
  try {
    const order = await Order.findOne({ 
      'payment.transactionId': refund.payment_id 
    });

    if (order) {
      order.payment.status = refund.amount === order.payment.advanceAmount ? 'refunded' : 'partial_refund';
      order.payment.refundDetails = {
        amount: refund.amount / 100, // Convert from paise
        processedAt: new Date(),
        refundId: refund.id
      };
      await order.save();

      console.log('Refund processed for order:', order.orderId);
    }
  } catch (error) {
    console.error('Error handling refund processed:', error);
  }
}

// @route   GET /api/payments/status/:orderId
// @desc    Get payment status for an order
// @access  Private
router.get('/status/:orderId', auth, [
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

    const order = await Order.findOne({ orderId }).populate('customer');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check authorization (customer, supplier, or admin)
    const isAuthorized = order.customer._id.toString() === req.user.userId ||
                        order.supplier.toString() === req.user.supplierId ||
                        req.user.role === 'admin';

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to access this order'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        orderId: order.orderId,
        paymentStatus: order.payment.status,
        transactionId: order.payment.transactionId,
        amount: order.payment.advanceAmount,
        method: order.payment.method,
        paidAt: order.payment.paidAt,
        refundDetails: order.payment.refundDetails
      }
    });

  } catch (error) {
    console.error('Get payment status error:', error);
    next(new ErrorHandler('Failed to get payment status', 500));
  }
});

// @route   POST /api/payments/refund/:orderId
// @desc    Process refund for an order
// @access  Private (Admin only or customer within cooling period)
router.post('/refund/:orderId', auth, [
  param('orderId').notEmpty().withMessage('Order ID is required'),
  body('reason').notEmpty().withMessage('Refund reason is required'),
  body('amount').optional().isFloat({ min: 1 }).withMessage('Amount must be greater than 0')
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
    const { reason, amount } = req.body;

    const order = await Order.findOne({ orderId }).populate('customer');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if payment is eligible for refund
    if (order.payment.status !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Order payment is not in paid status'
      });
    }

    // Authorization check
    let refundAmount = amount || order.payment.advanceAmount;
    let isAuthorized = false;

    if (req.user.role === 'admin') {
      isAuthorized = true;
    } else if (order.customer._id.toString() === req.user.userId) {
      // Customer can request refund only during cooling period
      const refundCalc = order.calculateCoolingPeriodRefund();
      if (!refundCalc.canRefund) {
        return res.status(400).json({
          success: false,
          message: refundCalc.message
        });
      }
      refundAmount = refundCalc.refundAmount;
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to process refund'
      });
    }

    // Process refund with Razorpay
    const refund = await razorpay.payments.refund(order.payment.transactionId, {
      amount: Math.round(refundAmount * 100), // Convert to paise
      notes: {
        reason: reason,
        orderId: order.orderId,
        refundedBy: req.user.userId
      }
    });

    // Update order with refund details
    order.payment.status = refundAmount === order.payment.advanceAmount ? 'refunded' : 'partial_refund';
    order.payment.refundDetails = {
      amount: refundAmount,
      reason: reason,
      processedAt: new Date(),
      refundId: refund.id
    };

    // If full refund, cancel the order
    if (refundAmount === order.payment.advanceAmount) {
      order.updateStatus('cancelled', `Order cancelled - Refund processed: ${reason}`, req.user.userId);
      order.cancellation = {
        reason: reason,
        cancelledBy: req.user.userId,
        cancelledAt: new Date(),
        refundAmount: refundAmount
      };
    }

    await order.save();

    // Send refund confirmation email
    try {
      await sendEmail({
        to: order.customer.email,
        subject: 'Refund Processed - Order Cancellation',
        template: 'refund-processed',
        data: {
          customerName: order.customer.name,
          orderId: order.orderId,
          refundAmount: refundAmount,
          refundId: refund.id,
          reason: reason
        }
      });
    } catch (emailError) {
      console.error('Refund email failed:', emailError);
    }

    res.status(200).json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        refundId: refund.id,
        amount: refundAmount,
        status: refund.status,
        orderId: order.orderId
      }
    });

  } catch (error) {
    console.error('Refund processing error:', error);
    
    if (error.error && error.error.code === 'BAD_REQUEST_ERROR') {
      return next(new ErrorHandler(error.error.description, 400));
    }
    
    next(new ErrorHandler('Failed to process refund', 500));
  }
});

// @route   GET /api/payments/methods
// @desc    Get available payment methods
// @access  Public
router.get('/methods', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      methods: [
        {
          id: 'card',
          name: 'Credit/Debit Card',
          description: 'Visa, Mastercard, RuPay',
          icon: 'credit-card',
          enabled: true
        },
        {
          id: 'upi',
          name: 'UPI',
          description: 'Google Pay, PhonePe, Paytm',
          icon: 'smartphone',
          enabled: true
        },
        {
          id: 'netbanking',
          name: 'Net Banking',
          description: 'All major banks supported',
          icon: 'building',
          enabled: true
        },
        {
          id: 'wallet',
          name: 'Wallet',
          description: 'Paytm, Mobikwik, etc.',
          icon: 'wallet',
          enabled: true
        }
      ],
      currency: 'INR',
      minAmount: 1,
      maxAmount: 1000000,
      supportedBanks: [
        'State Bank of India',
        'HDFC Bank',
        'ICICI Bank',
        'Axis Bank',
        'Kotak Mahindra Bank',
        'Punjab National Bank',
        'Bank of Baroda',
        'Canara Bank',
        'Union Bank of India',
        'Indian Bank'
      ]
    }
  });
});

module.exports = router;