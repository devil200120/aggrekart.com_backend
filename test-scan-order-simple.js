// Simple test for scan-order endpoint with debug
const axios = require('axios');

async function testScanOrder() {
  try {
    // Login first
    console.log('🔑 Logging in...');
    const loginResponse = await axios.post('http://127.0.0.1:5000/api/pilot/login', {
      phoneNumber: '9876543210'
    });
    
    if (!loginResponse.data.success) {
      console.log('❌ Login failed');
      return;
    }
    
    const otp = loginResponse.data.data.otp;
    console.log('📱 OTP:', otp);
    
    const otpResponse = await axios.post('http://127.0.0.1:5000/api/pilot/login', {
      phoneNumber: '9876543210',
      otp: otp
    });
    
    const token = otpResponse.data.data.token;
    console.log('✅ Login successful');
    
    // Test scan-order
    console.log('\n🧪 Testing scan-order endpoint...');
    const scanResponse = await axios.post('http://127.0.0.1:5000/api/pilot/scan-order', {
      orderId: 'AGK1756201614516ANT'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ Scan-order response:');
    console.log('Status:', scanResponse.status);
    console.log('Supplier address:', scanResponse.data.data.order.supplier.address);
    console.log('Pickup address:', scanResponse.data.data.order.deliveryAddress.pickup);
    console.log('Drop address:', scanResponse.data.data.order.deliveryAddress.drop);
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testScanOrder();