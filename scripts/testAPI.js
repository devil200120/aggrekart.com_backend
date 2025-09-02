const axios = require('axios');

async function testAPI() {
  try {
    const response = await axios.post('http://localhost:5000/api/auth/login', {
      identifier: 'admin@aggrekart.com',
      password: 'admin123'
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    console.log('✅ API Success:', response.data);
  } catch (error) {
    if (error.response) {
      console.log('❌ API Error Status:', error.response.status);
      console.log('❌ API Error Data:', error.response.data);
    } else {
      console.log('❌ Network Error:', error.message);
    }
  }
}

testAPI();