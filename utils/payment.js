const crypto = require('crypto');
const Razorpay = require('razorpay');

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create payment order
const initiatePayment = async (orderDetails) => {
  try {
    const { orderId, amount, currency = 'INR', customerEmail, customerPhone, customerName } = orderDetails;

    const options = {
      amount: Math.round(amount * 100), // Amount in paise
      currency: currency,
      receipt: orderId,
      notes: {
        orderId: orderId,
        customerEmail: customerEmail,
        customerPhone: customerPhone
      }
    };

    const order = await razorpay.orders.create(options);

    return {
      success: true,
      paymentOrderId: order.id,
      amount: amount,
      currency: currency,
      key: process.env.RAZORPAY_KEY_ID,
      orderId: orderId,
      customerDetails: {
        name: customerName,
        email: customerEmail,
        contact: customerPhone
      }
    };

  } catch (error) {
    console.error('Payment initiation error:', error);
    throw new Error('Failed to initiate payment');
  }
};

// Verify payment signature
const verifyPayment = async (paymentDetails) => {
  try {
    const { orderId, paymentId, signature } = paymentDetails;

    // Create signature
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    return expectedSignature === signature;

  } catch (error) {
    console.error('Payment verification error:', error);
    return false;
  }
};

// Process refund
const processRefund = async (paymentId, amount, notes = {}) => {
  try {
    const refund = await razorpay.payments.refund(paymentId, {
      amount: Math.round(amount * 100), // Amount in paise
      notes: notes
    });

    return {
      success: true,
      refundId: refund.id,
      amount: refund.amount / 100,
      status: refund.status
    };

  } catch (error) {
    console.error('Refund processing error:', error);
    throw new Error('Failed to process refund');
  }
};

// Get payment details
const getPaymentDetails = async (paymentId) => {
  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return {
      success: true,
      payment: {
        id: payment.id,
        amount: payment.amount / 100,
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        createdAt: new Date(payment.created_at * 1000)
      }
    };

  } catch (error) {
    console.error('Get payment details error:', error);
    throw new Error('Failed to get payment details');
  }
};

// Mock functions for development (when Razorpay is not configured)
const mockInitiatePayment = async (orderDetails) => {
  const { orderId, amount, customerEmail, customerPhone, customerName } = orderDetails;
  
  return {
    success: true,
    paymentOrderId: `mock_order_${Date.now()}`,
    amount: amount,
    currency: 'INR',
    key: 'mock_key',
    orderId: orderId,
    customerDetails: {
      name: customerName,
      email: customerEmail,
      contact: customerPhone
    },
    mock: true
  };
};

const mockVerifyPayment = async (paymentDetails) => {
  // In development, always return true
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  return verifyPayment(paymentDetails);
};

const mockProcessRefund = async (paymentId, amount, notes = {}) => {
  return {
    success: true,
    refundId: `mock_refund_${Date.now()}`,
    amount: amount,
    status: 'processed',
    mock: true
  };
};

// Export appropriate functions based on environment
module.exports = {
  initiatePayment: process.env.RAZORPAY_KEY_ID ? initiatePayment : mockInitiatePayment,
  verifyPayment: process.env.RAZORPAY_KEY_ID ? verifyPayment : mockVerifyPayment,
  processRefund: process.env.RAZORPAY_KEY_ID ? processRefund : mockProcessRefund,
  getPaymentDetails: process.env.RAZORPAY_KEY_ID ? getPaymentDetails : null
};