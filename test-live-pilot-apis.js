// 🌐 PRODUCTION Pilot API Testing Script for Render.com
// Tests all pilot APIs on your live production server
const axios = require('axios');
const https = require('https');

// Production server configuration
const PRODUCTION_BASE_URL = 'https://aggrekart-com-backend.onrender.com/api/pilot';
const HEALTH_CHECK_URL = 'https://aggrekart-com-backend.onrender.com/api/health';

// Test configuration for production
const liveTestData = {
  pilot: {
    name: "Test Pilot Live",
    phoneNumber: "9876543210", // Use your actual pilot phone number
    email: "testpilot.live@example.com",
    vehicleDetails: {
      registrationNumber: "LIVE123",
      vehicleType: "truck",
      capacity: 5
    },
    drivingLicense: {
      number: "LIVE123456789",
      validTill: "2025-12-31"
    },
    emergencyContact: {
      name: "Emergency Contact",
      phoneNumber: "9876543211"
    }
  },
  orderId: "AGK1756201614516ANT" // Update with actual production order ID
};

let PILOT_TOKEN = null;
let PILOT_ID = null;

// Helper function for making live requests
function makeLiveRequest(endpoint, method = 'GET', data = null, token = null) {
  return new Promise((resolve) => {
    const url = new URL(`${PRODUCTION_BASE_URL}${endpoint}`);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AggrekartPilotApp/1.0.0'
      }
    };
    
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          console.log(`🌐 ${method} ${endpoint}`);
          console.log(`📊 Status: ${res.statusCode}`);
          console.log(`📋 Response:`, JSON.stringify(result, null, 2));
          console.log('─'.repeat(50));
          
          resolve({
            status: res.statusCode,
            data: result,
            success: res.statusCode >= 200 && res.statusCode < 300
          });
        } catch (parseError) {
          console.error(`❌ JSON Parse Error for ${endpoint}:`, parseError.message);
          console.log('Raw response:', body);
          resolve({
            status: res.statusCode,
            error: `JSON Parse Error: ${parseError.message}`,
            rawBody: body,
            success: false
          });
        }
      });
    });

    req.on('error', (error) => {
      console.error(`❌ Request Error for ${endpoint}:`, error.message);
      resolve({
        status: 0,
        error: error.message,
        success: false
      });
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Helper function for health check
function healthCheck(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname,
      method: 'GET',
      headers: {
        'User-Agent': 'Node.js Health Check'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve({
            status: res.statusCode,
            data: result,
            success: res.statusCode >= 200 && res.statusCode < 300
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            error: `JSON Parse Error: ${error.message}`,
            rawBody: body,
            success: false
          });
        }
      });
    });

    req.on('error', (error) => {
      resolve({
        status: 0,
        error: error.message,
        success: false
      });
    });
    
    req.end();
  });
}

// Live API Tests
async function runLiveTests() {
  console.log('🚀 Starting Live Pilot API Tests on Render...\n');
  
  let pilotToken = null;
  let pilotId = null;
  
  // 1. Health Check
  console.log('1️⃣ HEALTH CHECK');
  try {
    const health = await healthCheck('https://aggrekart-com-backend.onrender.com/api/health');
    console.log('Health Status:', health.data);
    console.log('─'.repeat(50));
    
    if (!health.success) {
      console.log('❌ Health check failed. Server might be down.');
      return;
    }
  } catch (error) {
    console.log('❌ Health check error:', error.message);
    return;
  }
  
  // 2. Register Pilot (if needed)
  console.log('2️⃣ PILOT REGISTRATION');
  await makeLiveRequest('/register', 'POST', liveTestData.pilot);
  
  // Wait a bit between requests to avoid rate limiting
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 3. Request OTP
  console.log('3️⃣ REQUEST OTP');
  const otpResponse = await makeLiveRequest('/login', 'POST', {
    phoneNumber: liveTestData.pilot.phoneNumber
  });
  
  if (otpResponse.success && otpResponse.data.data) {
    const receivedOTP = otpResponse.data.data.otp;
    console.log(`📱 OTP Received: ${receivedOTP}`);
    
    // Wait a bit before verifying OTP
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 4. Verify OTP (use received OTP)
    if (receivedOTP) {
      console.log('4️⃣ VERIFY OTP & LOGIN');
      const loginResponse = await makeLiveRequest('/login', 'POST', {
        phoneNumber: liveTestData.pilot.phoneNumber,
        otp: receivedOTP
      });
      
      if (loginResponse.success && loginResponse.data.data) {
        pilotToken = loginResponse.data.data.token;
        pilotId = loginResponse.data.data.pilot._id || loginResponse.data.data.pilot.pilotId;
        console.log(`🔑 Token: ${pilotToken?.substring(0, 20)}...`);
        console.log(`👤 Pilot ID: ${pilotId}`);
      }
    }
  }
  
  // Continue with authenticated requests
  if (pilotToken) {
    // Wait between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 5. Scan Order
    console.log('5️⃣ SCAN ORDER');
    await makeLiveRequest('/scan-order', 'POST', {
      orderId: liveTestData.orderId
    }, pilotToken);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 6. Get Profile
    console.log('6️⃣ GET PROFILE');
    await makeLiveRequest(`/profile/${pilotId}`, 'GET', null, pilotToken);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 7. Get Stats
    console.log('7️⃣ GET STATS');
    await makeLiveRequest('/stats', 'GET', null, pilotToken);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 8. Dashboard Stats
    console.log('8️⃣ DASHBOARD STATS');
    await makeLiveRequest('/dashboard/stats', 'GET', null, pilotToken);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 9. Delivery History
    console.log('9️⃣ DELIVERY HISTORY');
    await makeLiveRequest('/delivery-history?page=1&limit=5', 'GET', null, pilotToken);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 10. Update Location
    console.log('🔟 UPDATE LOCATION');
    await makeLiveRequest('/update-location', 'POST', {
      latitude: 20.2961,
      longitude: 85.8245
    }, pilotToken);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 11. App Config (public endpoint)
    console.log('1️⃣1️⃣ APP CONFIG');
    await makeLiveRequest('/app/config', 'GET', null);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 12. Support FAQs (public endpoint)
    console.log('1️⃣2️⃣ SUPPORT FAQs');
    await makeLiveRequest('/support/faqs', 'GET', null);
    
  } else {
    console.log('❌ Could not authenticate. Skipping protected endpoints.');
  }
  
  console.log('\n🎉 Live API Testing Complete!');
  console.log('\n📊 SUMMARY:');
  console.log('✅ Health Check: Passed');
  console.log(`✅ Authentication: ${pilotToken ? 'Success' : 'Failed'}`);
  console.log('✅ API Endpoints: Tested');
  console.log('\n🔗 Frontend URL: https://aggrekart-com.onrender.com');
  console.log('🔗 Backend URL: https://aggrekart-com-backend.onrender.com');
}

// Error handling wrapper
async function main() {
  try {
    await runLiveTests();
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
    console.error(error.stack);
  }
}

// Run the tests
console.log('🌐 Live Pilot API Testing Tool');
console.log('🚀 Target: Render Production Environment');
console.log('📅 Date:', new Date().toISOString());
console.log('═'.repeat(60));

main();