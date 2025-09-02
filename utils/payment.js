const crypto = require('crypto');
const Razorpay = require('razorpay');
const axios = require('axios');

// Cashfree Direct API Configuration (WORKING APPROACH)
const CASHFREE_CONFIG = {
  baseURL: process.env.CASHFREE_ENVIRONMENT === 'PROD' ? 
    'https://api.cashfree.com/pg' : 
    'https://sandbox.cashfree.com/pg',
  apiVersion: '2023-08-01',
  appId: process.env.CASHFREE_APP_ID,
  secretKey: process.env.CASHFREE_SECRET_KEY,
  environment: process.env.CASHFREE_ENVIRONMENT || 'SANDBOX'
};

// Helper function to get proper URLs for Cashfree (requires HTTPS)
const getPaymentUrls = (orderId) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // For production
  if (isProduction) {
    return {
      frontend_url: process.env.FRONTEND_URL || 'https://aggrekart-com.onrender.com',
      backend_url: process.env.BACKEND_URL || 'https://aggrekart-com-backend.onrender.com'
    };
  }
  
  // For development - Cashfree requires HTTPS, so we need to use tunneling or test URLs
  // Option 1: Use ngrok or similar tunneling service
  // Option 2: Use Cashfree's test return URLs (they accept these)
  // Option 3: Use localhost with HTTPS setup
  
  // For now, let's use a workaround with test URLs that Cashfree accepts
  const testUrls = {
    frontend_url: process.env.FRONTEND_URL_HTTPS || 'https://test.cashfree.com/billpay/checkout/post/submit',
    backend_url: process.env.BACKEND_URL_HTTPS || 'https://webhook.site/unique-id' // Replace with your webhook.site URL
  };
  
  // If environment variables are set for HTTPS development URLs, use them
  if (process.env.FRONTEND_URL_HTTPS && process.env.BACKEND_URL_HTTPS) {
    return {
      frontend_url: process.env.FRONTEND_URL_HTTPS,
      backend_url: process.env.BACKEND_URL_HTTPS
    };
  }
  
  // Fallback: Use production URLs even in development (for testing)
  return {
    frontend_url: 'https://aggrekart-com.onrender.com',
    backend_url: 'https://aggrekart-com-backend.onrender.com'
  };
};

// Log Cashfree configuration on startup
if (CASHFREE_CONFIG.appId && CASHFREE_CONFIG.secretKey) {
  console.log(`✅ Cashfree configured for ${CASHFREE_CONFIG.environment} environment`);
  console.log(`🔗 API Base URL: ${CASHFREE_CONFIG.baseURL}`);
  console.log(`🔑 App ID: ${CASHFREE_CONFIG.appId}`);
} else {
  console.warn('⚠️  Cashfree credentials not configured');
}

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ENHANCED Helper function for Cashfree API calls with detailed logging
const makeCashfreeAPICall = async (endpoint, method = 'POST', data = null) => {
  try {
    if (!CASHFREE_CONFIG.appId || !CASHFREE_CONFIG.secretKey) {
      throw new Error('Cashfree credentials not configured');
    }

    const config = {
      method,
      url: `${CASHFREE_CONFIG.baseURL}${endpoint}`,
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'x-api-version': CASHFREE_CONFIG.apiVersion,
        'x-client-id': CASHFREE_CONFIG.appId,
        'x-client-secret': CASHFREE_CONFIG.secretKey
      }
    };

    if (data && method !== 'GET') {
      config.data = data;
    }

    console.log('🔗 Making Cashfree API call:');
    console.log(`   Method: ${method}`);
    console.log(`   URL: ${config.url}`);
    console.log('   Headers:', {
      accept: config.headers.accept,
      'content-type': config.headers['content-type'],
      'x-api-version': config.headers['x-api-version'],
      'x-client-id': config.headers['x-client-id'],
      'x-client-secret': '***hidden***'
    });
    if (data) {
      console.log('   Data:', JSON.stringify(data, null, 2));
    }

    const response = await axios(config);
    
    console.log('✅ Cashfree API success:', {
      status: response.status,
      statusText: response.statusText,
      data: response.data
    });

    return {
      success: true,
      data: response.data,
      status: response.status
    };

  } catch (error) {
    console.error('❌ Cashfree API error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      headers: error.response?.headers,
      details: error.response?.data
    });

    if (error.response?.data) {
      console.error('❌ Full error object:', JSON.stringify(error.response.data, null, 2));
    }

    return {
      success: false,
      error: error.message,
      status: error.response?.status,
      details: error.response?.data
    };
  }
};

// Create Razorpay Order
const createRazorpayOrder = async (orderId, amount, currency = 'INR') => {
  try {
    const options = {
      amount: Math.round(amount * 100), // Amount in paise
      currency,
      receipt: orderId,
      notes: {
        order_id: orderId,
      },
    };

    const order = await razorpay.orders.create(options);
    
    return {
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      key_id: process.env.RAZORPAY_KEY_ID
    };
  } catch (error) {
    console.error('Razorpay order creation failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Create Cashfree Order - ENHANCED with proper URL handling

// ===== RAZORPAY FUNCTIONS =====


const verifyRazorpaySignature = async (paymentDetails) => {
  try {
    const { orderId, paymentId, signature } = paymentDetails;

    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    return expectedSignature === signature;

  } catch (error) {
    console.error('Razorpay verification error:', error);
    return false;
  }
};

const fetchRazorpayPayment = async (paymentId) => {
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
    return {
      success: false,
      error: error.message || 'Failed to get payment details'
    };
  }
};

// ===== CASHFREE FUNCTIONS (FIXED WITH CORRECT API FORMAT) =====

const createCashfreeOrder = async (orderDetails) => {
  try {
    console.log('🟠 createCashfreeOrder called with:', orderDetails);

    const { orderId, amount, currency = 'INR', customerEmail, customerPhone, customerName } = orderDetails;

    // Validate required fields
    if (!orderId || !amount || !customerEmail || !customerPhone || !customerName) {
      const missing = [];
      if (!orderId) missing.push('orderId');
      if (!amount) missing.push('amount');
      if (!customerEmail) missing.push('customerEmail');
      if (!customerPhone) missing.push('customerPhone');
      if (!customerName) missing.push('customerName');
      throw new Error(`Missing required order details: ${missing.join(', ')}`);
    }

    console.log('✅ All required fields present');

    // Validate amount
    if (amount <= 0 || amount > 500000) {
      throw new Error('Amount must be between ₹1 and ₹5,00,000');
    }

    console.log('✅ Amount validation passed:', amount);

    // Format phone number (this was likely causing the 400 error)
    let formattedPhone = customerPhone.toString().replace(/\D/g, '');
    console.log('🔍 Original phone:', customerPhone);
    console.log('🔍 Cleaned phone:', formattedPhone);
    
    // Cashfree requires exactly 10 digits for Indian numbers
    if (formattedPhone.length === 10) {
      // Keep as 10 digits, don't add country code
      console.log('✅ Phone format valid (10 digits)');
    } else if (formattedPhone.length === 12 && formattedPhone.startsWith('91')) {
      // Remove country code to get 10 digits
      formattedPhone = formattedPhone.substring(2);
      console.log('✅ Phone format converted from 12 to 10 digits:', formattedPhone);
    } else {
      throw new Error(`Invalid phone number format: ${customerPhone}. Must be 10 digits.`);
    }

    // Generate unique Cashfree order ID (this might also be causing issues)
    const timestamp = Date.now();
    const cashfreeOrderId = `AGK_${orderId}_${timestamp}`;
    console.log('🔍 Generated Cashfree order ID:', cashfreeOrderId);

    // Get HTTPS URLs required by Cashfree
    const paymentUrls = getPaymentUrls(orderId);
    console.log('🔍 Payment URLs:', paymentUrls);

    // FIXED: Use correct Cashfree API format with HTTPS URLs
    const request = {
      order_id: cashfreeOrderId,
      order_amount: parseFloat(amount.toFixed(2)),
      order_currency: currency,
      customer_details: {
        customer_id: `cust_${customerEmail.split('@')[0]}_${timestamp}`.replace(/[^a-zA-Z0-9_]/g, '_'),
        customer_name: customerName.trim().substring(0, 50),
        customer_email: customerEmail.toLowerCase().trim(),
        customer_phone: formattedPhone
      },
      order_meta: {
        return_url: `${paymentUrls.frontend_url}/payment/success?order_id=${orderId}`,
        notify_url: `${paymentUrls.backend_url}/api/payments/cashfree/webhook`
      },
      order_expiry_time: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      order_note: `AggreKart Order ${orderId}`.substring(0, 100)
    };

    console.log('🔍 Final request payload:', JSON.stringify(request, null, 2));
    console.log('🔍 Customer details validation:', {
      customer_id_length: request.customer_details.customer_id.length,
      customer_name_length: request.customer_details.customer_name.length,
      customer_email_format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.customer_details.customer_email),
      customer_phone_length: request.customer_details.customer_phone.length,
      return_url_https: request.order_meta.return_url.startsWith('https://'),
      notify_url_https: request.order_meta.notify_url.startsWith('https://')
    });

    const response = await makeCashfreeAPICall('/orders', 'POST', request);

    if (!response.success) {
      console.error('❌ Cashfree API call failed:', response);
      return {
        success: false,
        error: response.error || 'Failed to create payment order',
        details: response.details
      };
    }

    if (!response.data || !response.data.payment_session_id) {
      console.error('❌ Invalid Cashfree response structure:', response.data);
      return {
        success: false,
        error: 'Invalid response from Cashfree API - missing payment session'
      };
    }

    console.log('✅ Cashfree order created successfully:', response.data.order_id);

    return {
      success: true,
      data: {
        id: response.data.order_id,
        amount: Math.round(amount * 100), // Convert to paise for consistency
        currency: currency,
        payment_session_id: response.data.payment_session_id,
        order_token: response.data.order_token,
        payment_link: response.data.payment_link,
        order_status: response.data.order_status,
        // Add missing fields that frontend expects
        appId: CASHFREE_CONFIG.appId,
        environment: CASHFREE_CONFIG.environment
      }
    };

  } catch (error) {
    console.error('❌ Cashfree order creation error:', {
      message: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      error: error.message || 'Failed to create payment order'
    };
  }
};

const verifyCashfreeSignature = async (paymentData) => {
  try {
    const { orderId, paymentId } = paymentData;

    if (!orderId || !paymentId) {
      throw new Error('Missing payment verification data');
    }

    console.log('🔍 Verifying Cashfree payment:', { orderId, paymentId });

    // Fetch payment details to verify status
    const response = await makeCashfreeAPICall(`/orders/${orderId}/payments`, 'GET');
    
    if (response.success && response.data && Array.isArray(response.data) && response.data.length > 0) {
      // Find the specific payment
      const payment = response.data.find(p => p.cf_payment_id === paymentId);
      
      if (payment) {
        const isValid = payment.payment_status === 'SUCCESS';
        console.log(`${isValid ? '✅' : '❌'} Payment verification result:`, payment.payment_status);
        
        return {
          success: true,
          isValid: isValid,
          paymentDetails: {
            payment_id: payment.cf_payment_id,
            order_id: payment.order_id,
            payment_status: payment.payment_status,
            payment_amount: payment.payment_amount,
            payment_currency: payment.payment_currency,
            payment_message: payment.payment_message,
            payment_time: payment.payment_time,
            payment_method: payment.payment_method,
            bank_reference: payment.bank_reference,
            auth_id: payment.auth_id
          }
        };
      }
    }
    
    return {
      success: false,
      isValid: false,
      error: 'Payment not found or invalid'
    };

  } catch (error) {
    console.error('❌ Cashfree payment verification error:', error);
    return {
      success: false,
      isValid: false,
      error: error.message || 'Payment verification failed'
    };
  }
};

const fetchCashfreePayment = async (orderId) => {
  try {
    console.log('🔍 Fetching Cashfree order:', orderId);

    const response = await makeCashfreeAPICall(`/orders/${orderId}`, 'GET');
    
    if (response.success && response.data) {
      return {
        success: true,
        order: {
          order_id: response.data.order_id,
          order_amount: response.data.order_amount,
          order_currency: response.data.order_currency,
          order_status: response.data.order_status,
          payment_session_id: response.data.payment_session_id,
          customer_details: response.data.customer_details,
          created_at: response.data.created_at
        }
      };
    }
    
    return {
      success: false,
      error: response.error || 'Failed to fetch order details'
    };

  } catch (error) {
    console.error('❌ Cashfree order fetch error:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch order details'
    };
  }
};

// ===== UTILITY FUNCTIONS =====

const getPaymentMethods = () => {
  return {
    razorpay: { 
      name: 'Razorpay', 
      enabled: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
      supports: ['cards', 'upi', 'netbanking', 'wallets']
    },
    cashfree: { 
      name: 'Cashfree', 
      enabled: !!(CASHFREE_CONFIG.appId && CASHFREE_CONFIG.secretKey),
      supports: ['cards', 'upi', 'netbanking', 'wallets', 'emi'],
      environment: CASHFREE_CONFIG.environment
    }
  };
};

// Process refund (Razorpay)
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
    return {
      success: false,
      error: error.message || 'Failed to process refund'
    };
  }
};

// Export all functions
module.exports = {
  // Razorpay
  createRazorpayOrder,
  verifyRazorpaySignature,
  fetchRazorpayPayment,
  
  // Cashfree (Working Direct API)
  createCashfreeOrder,
  verifyCashfreeSignature,
  fetchCashfreePayment,
  
  // Utilities
  getPaymentMethods,
  processRefund,
  
  // Legacy support (for backward compatibility)
  initiatePayment: createRazorpayOrder,
  verifyPayment: verifyRazorpaySignature,
  getPaymentDetails: fetchRazorpayPayment
};