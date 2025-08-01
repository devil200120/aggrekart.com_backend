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

// @route   GET /api/payments/methods
// @desc    Get available payment methods
// @access  Public
router.get('/methods', async (req, res) => {
  try {
    const methods = PaymentGateway.getPaymentMethods();
    
    res.status(200).json({
      success: true,
      message: 'Payment methods retrieved successfully',
      data: methods
    });
  } catch (error) {
    console.error('Get payment methods error:', error);
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
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
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.customer._id.toString() !== req.user.userId) {
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
      amount,
      receipt: orderId,
      notes: {
        orderId: order.orderId,
        customerId: order.customer._id.toString(),
        customerEmail: order.customer.email
      }
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create payment order',
        error: result.error
      });
    }

    // Update order with Razorpay order ID
    order.payment.razorpayOrderId = result.data.id;
    order.payment.gateway = 'razorpay';
    await order.save();

    res.status(200).json({
      success: true,
      message: 'Razorpay order created successfully',
      data: {
        razorpayOrderId: result.data.id,
        amount: result.data.amount,
        currency: result.data.currency,
        orderId: order.orderId,
        key: process.env.RAZORPAY_KEY_ID,
        customerEmail: order.customer.email,
        customerPhone: order.customer.phoneNumber
      }
    });

  } catch (error) {
    console.error('Razorpay create order error:', error);
    next(new ErrorHandler('Failed to create Razorpay order', 500));
  }
});

// @route   POST /api/payments/razorpay/verify
// @desc    Verify Razorpay payment
// @access  Private
router.post('/razorpay/verify', auth, [
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

    // Find order
    const order = await Order.findOne({ orderId }).populate('customer supplier');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.customer._id.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to access this order'
      });
    }

    // Verify signature
    const isValid = PaymentGateway.verifyRazorpaySignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature
    });

    if (!isValid) {
      order.payment.status = 'failed';
      await order.save();
      await releaseReservedStock(order);

      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    // Fetch payment details
    const paymentResult = await PaymentGateway.fetchRazorpayPayment(razorpay_payment_id);
    
    if (!paymentResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch payment details'
      });
    }

    // Update order
    await updateOrderAfterPayment(order, {
      transactionId: razorpay_payment_id,
      gateway: 'razorpay',
      method: paymentResult.data.method,
      gatewayResponse: {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        payment_details: paymentResult.data
      }
    });

    await sendPaymentSuccessEmails(order, razorpay_payment_id);

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        orderId: order.orderId,
        transactionId: razorpay_payment_id,
        amount: order.payment.advanceAmount,
        status: order.payment.status
      }
    });

  } catch (error) {
    console.error('Razorpay verify error:', error);
    next(new ErrorHandler('Payment verification failed', 500));
  }
});

// ===== PAYTM ROUTES =====

// @route   POST /api/payments/paytm/create-order
// @desc    Create Paytm order
// @access  Private
router.post('/paytm/create-order', auth, [
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be greater than 0')
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

    const { orderId, amount } = req.body;

    // Find and validate order
    const order = await Order.findOne({ orderId }).populate('customer');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.customer._id.toString() !== req.user.userId) {
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

    // Create Paytm transaction
    const { params, txnId } = PaymentGateway.createPaytmTransaction({
      orderId,
      amount,
      customerId: order.customer._id.toString(),
      email: order.customer.email,
      phone: order.customer.phoneNumber
    });

    // Generate checksum
    const checksumResult = await PaymentGateway.generatePaytmChecksum(params);
    
    if (!checksumResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate checksum',
        error: checksumResult.error
      });
    }

    // Update order
    order.payment.paytmTxnId = txnId;
    order.payment.gateway = 'paytm';
    await order.save();

    res.status(200).json({
      success: true,
      message: 'Paytm order created successfully',
      data: {
        ...params,
        CHECKSUMHASH: checksumResult.checksum,
        txnId,
        paytmUrl: process.env.PAYTM_TRANSACTION_URL
      }
    });

  } catch (error) {
    console.error('Paytm create order error:', error);
    next(new ErrorHandler('Failed to create Paytm order', 500));
  }
});

// @route   POST /api/payments/paytm/callback
// @desc    Handle Paytm payment callback
// @access  Public
router.post('/paytm/callback', async (req, res, next) => {
  try {
    const { CHECKSUMHASH, ...paytmParams } = req.body;

    // Verify checksum
    const isValid = await PaymentGateway.verifyPaytmChecksum(paytmParams, CHECKSUMHASH);
    
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid checksum'
      });
    }

    const { ORDERID, STATUS, TXNID, RESPCODE, RESPMSG } = paytmParams;

    // Find order
    const order = await Order.findOne({ orderId: ORDERID }).populate('customer supplier');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (STATUS === 'TXN_SUCCESS' && RESPCODE === '01') {
      // Payment successful
      await updateOrderAfterPayment(order, {
        transactionId: TXNID,
        gateway: 'paytm',
        method: 'paytm_wallet',
        gatewayResponse: paytmParams
      });

      await sendPaymentSuccessEmails(order, TXNID);

      // Redirect to success page
      res.redirect(`${process.env.FRONTEND_URL}/payment/success?orderId=${ORDERID}&txnId=${TXNID}`);
    } else {
      // Payment failed
      order.payment.status = 'failed';
      order.payment.failureReason = RESPMSG;
      await order.save();
      await releaseReservedStock(order);

      // Redirect to failure page
      res.redirect(`${process.env.FRONTEND_URL}/payment/failed?orderId=${ORDERID}&reason=${encodeURIComponent(RESPMSG)}`);
    }

  } catch (error) {
    console.error('Paytm callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/payment/failed?error=processing_failed`);
  }
});

// @route   GET /api/payments/status/:orderId
// @desc    Get payment status
// @access  Private
router.get('/status/:orderId', auth, async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId }).populate('customer');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.customer._id.toString() !== req.user.userId) {
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
        gateway: order.payment.gateway,
        amount: order.payment.advanceAmount,
        paidAt: order.payment.paidAt
      }
    });

  } catch (error) {
    console.error('Get payment status error:', error);
    next(new ErrorHandler('Failed to get payment status', 500));
  }
});

// ===== HELPER FUNCTIONS =====

async function updateOrderAfterPayment(order, paymentData) {
  order.payment.status = 'paid';
  order.payment.transactionId = paymentData.transactionId;
  order.payment.gateway = paymentData.gateway;
  order.payment.method = paymentData.method;
  order.payment.paidAt = new Date();
  order.payment.paymentGatewayResponse = paymentData.gatewayResponse;
  
  order.updateStatus('preparing', 'Payment completed successfully');
  await order.save();
}

async function releaseReservedStock(order) {
  console.log('Releasing reserved stock for failed payment...');
  for (const item of order.items) {
    const product = await Product.findById(item.product);
    if (product) {
      product.stock.reserved = Math.max(0, product.stock.reserved - item.quantity);
      product.stock.available = product.stock.available + item.quantity;
      await product.save();
    }
  }
}

async function sendPaymentSuccessEmails(order, transactionId) {
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
        transactionId
      }
    });

    // Email to supplier
    if (order.supplier) {
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
    }
  } catch (emailError) {
    console.error('Email sending failed:', emailError);
  }
}

module.exports = router;