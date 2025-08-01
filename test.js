const axios = require('axios');

const testGSTRoute = async () => {
  console.log('🧪 Testing GST route locally...');
  
  try {
    // Test health endpoint first
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get('http://localhost:5000/api/health');
    console.log('✅ Health check passed:', healthResponse.data);
    
    // Test GST verify endpoint
    console.log('2. Testing GST verify endpoint...');
    const gstResponse = await axios.post('http://localhost:5000/api/gst/verify', {
      gstNumber: '21AAGCL2673MIZD'
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    console.log('✅ GST verify response status:', gstResponse.status);
    console.log('✅ GST verify response data:', JSON.stringify(gstResponse.data, null, 2));
    
  } catch (error) {
    console.error('❌ Test failed:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Message:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('🚨 Backend server is not running! Start it with: npm start');
    }
  }
};

testGSTRoute();