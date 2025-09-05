// 🚀 Corrected Local Pilot API Testing Script
// Tests actual endpoints available in your pilot.js route
const axios = require('axios');

// Local server configuration
const LOCAL_ENDPOINTS = [
  'http://127.0.0.1:5000',
  'http://localhost:5000',
  'http://0.0.0.0:5000'
];

// Test configuration based on your actual data
const TEST_DATA = {
  pilot: {
    name: "Test Pilot Local",
    phoneNumber: "9876543210", // Your existing pilot phone
    email: "testpilot@local.com",
    vehicleDetails: {
      registrationNumber: "KA01TL1234",
      vehicleType: "truck", // Valid types: truck, mini_truck, pickup, tractor, trailer
      capacity: 5
    },
    drivingLicense: {
      number: "DL1234567890",
      validTill: "2026-12-31"
    },
    emergencyContact: {
      name: "Emergency Contact",
      phoneNumber: "9876543211"
    }
  },
  orderId: "AGK1756201614516ANT" // Your actual order ID
};

let WORKING_BASE_URL = null;
let PILOT_TOKEN = null;
let PILOT_ID = null;

// Find working server endpoint
async function findWorkingEndpoint() {
  console.log('🔍 Finding working local server...\n');
  
  for (const baseUrl of LOCAL_ENDPOINTS) {
    try {
      console.log(`Testing: ${baseUrl}`);
      
      const response = await axios.get(`${baseUrl}/api/health`, {
        timeout: 3000
      });
      
      console.log(`✅ SUCCESS: ${baseUrl}`);
      console.log(`📊 Health: ${response.data.message}`);
      console.log(`🌍 Environment: ${response.data.environment}\n`);
      
      WORKING_BASE_URL = `${baseUrl}/api/pilot`;
      return true;
      
    } catch (error) {
      console.log(`❌ Failed: ${baseUrl} - ${error.message}`);
    }
  }
  
  console.log('\n❌ No working server found!');
  return false;
}

// Test function with detailed response logging
async function testAPI(endpoint, method = 'GET', data = null, token = null, description = '') {
  try {
    console.log(`\n🧪 ${description || `${method} ${endpoint}`}`);
    console.log('='.repeat(60));
    
    const config = {
      method: method.toLowerCase(),
      url: `${WORKING_BASE_URL}${endpoint}`,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    console.log(`📤 Request: ${method} ${endpoint}`);
    if (data) {
      console.log(`📦 Data: ${JSON.stringify(data, null, 2)}`);
    }
    
    const response = await axios(config);
    
    console.log(`✅ Status: ${response.status} ${response.statusText}`);
    console.log(`📥 Response:`);
    console.log(JSON.stringify(response.data, null, 2));
    
    return {
      success: true,
      status: response.status,
      data: response.data
    };
    
  } catch (error) {
    console.log(`❌ Error: ${error.response?.status || 'Network'} - ${error.message}`);
    
    if (error.response?.data) {
      console.log(`📥 Error Response:`);
      console.log(JSON.stringify(error.response.data, null, 2));
    }
    
    return {
      success: false,
      status: error.response?.status || 0,
      error: error.message,
      data: error.response?.data
    };
  }
}

// Test actual endpoints from your pilot.js
async function runCorrectPilotTests() {
  console.log('🚚 CORRECTED Local Pilot API Testing');
  console.log('=====================================');
  console.log(`📞 Test Phone: ${TEST_DATA.pilot.phoneNumber}`);
  console.log(`📋 Test Order: ${TEST_DATA.orderId}`);
  console.log('=====================================\n');
  
  // Find working server
  const connected = await findWorkingEndpoint();
  if (!connected) {
    console.log('💡 TROUBLESHOOTING:');
    console.log('1. Start server: npm start');
    console.log('2. Check port 5000 is free');
    console.log('3. Verify .env configuration');
    return;
  }
  
  console.log(`🌐 Using: ${WORKING_BASE_URL}\n`);
  
  const results = {};
  
  // Test 1: App Config (Public endpoint)
  console.log('1️⃣ APP CONFIGURATION');
  const configResult = await testAPI('/app/config', 'GET', null, null, 'Get App Configuration');
  results.appConfig = configResult;
  
  // Test 2: Support FAQs (Public endpoint)
  console.log('\n2️⃣ SUPPORT FAQs');
  const faqResult = await testAPI('/support/faqs', 'GET', null, null, 'Get Support FAQs');
  results.faqs = faqResult;
  
  // Test 3: Request OTP for Login
  console.log('\n3️⃣ REQUEST LOGIN OTP');
  const otpResult = await testAPI('/login', 'POST', {
    phoneNumber: TEST_DATA.pilot.phoneNumber
  }, null, 'Request Login OTP');
  results.requestOTP = otpResult;
  
  // Test 4: Login with OTP (if OTP received)
  if (otpResult.success && otpResult.data?.data?.otp) {
    const otp = otpResult.data.data.otp;
    console.log(`\n📱 Received OTP: ${otp}`);
    
    console.log('\n4️⃣ LOGIN WITH OTP');
    const loginResult = await testAPI('/login', 'POST', {
      phoneNumber: TEST_DATA.pilot.phoneNumber,
      otp: otp
    }, null, 'Login with OTP');
    results.login = loginResult;
    
    if (loginResult.success && loginResult.data?.data) {
      PILOT_TOKEN = loginResult.data.data.token;
      PILOT_ID = loginResult.data.data.pilot?.pilotId;
      console.log(`\n🔑 Token received: ${PILOT_TOKEN?.substring(0, 30)}...`);
      console.log(`👤 Pilot ID: ${PILOT_ID}`);
    }
  } else {
    console.log('\n❌ No OTP received - cannot test authenticated endpoints');
  }
  
  // AUTHENTICATED ENDPOINT TESTS
  if (PILOT_TOKEN && PILOT_ID) {
    
    // Test 5: Get Pilot Profile
    console.log('\n5️⃣ GET PILOT PROFILE');
    const profileResult = await testAPI(`/profile/${PILOT_ID}`, 'GET', null, PILOT_TOKEN, 'Get Pilot Profile');
    results.profile = profileResult;
    
    // Test 6: Get Pilot Stats
    console.log('\n6️⃣ GET PILOT STATS');
    const statsResult = await testAPI('/stats', 'GET', null, PILOT_TOKEN, 'Get Pilot Statistics');
    results.stats = statsResult;
    
    // Test 7: Dashboard Stats
    console.log('\n7️⃣ GET DASHBOARD STATS');
    const dashboardResult = await testAPI('/dashboard/stats', 'GET', null, PILOT_TOKEN, 'Get Dashboard Statistics');
    results.dashboard = dashboardResult;
    
    // Test 8: Dashboard Notifications
    console.log('\n8️⃣ GET DASHBOARD NOTIFICATIONS');
    const notificationResult = await testAPI('/dashboard/notifications', 'GET', null, PILOT_TOKEN, 'Get Dashboard Notifications');
    results.notifications = notificationResult;
    
    // Test 9: SCAN ORDER (Critical test for address field)
    console.log('\n9️⃣ 🔍 SCAN ORDER - ADDRESS BUG TEST');
    const scanResult = await testAPI('/scan-order', 'POST', {
      orderId: TEST_DATA.orderId
    }, PILOT_TOKEN, '🚨 TESTING ADDRESS FIELD BUG');
    results.scanOrder = scanResult;
    
    // 🔍 DETAILED ADDRESS ANALYSIS
    if (scanResult.success && scanResult.data?.data?.order?.customer?.address) {
      const address = scanResult.data.data.order.customer.address;
      console.log('\n🏠 ========== ADDRESS FIELD ANALYSIS ==========');
      console.log(`📊 Type: ${typeof address}`);
      console.log(`📝 Raw Value: "${address}"`);
      console.log(`📏 Length: ${address.length} characters`);
      
      if (typeof address === 'string') {
        if (address === 'NA') {
          console.log('🚨 ❌ BUG CONFIRMED: Address returns "NA"');
          console.log('🔧 Status: NEEDS BACKEND FIX');
        } else if (address.toLowerCase().includes('not available')) {
          console.log('⚠️  Address shows as not available');
        } else if (address.trim().length === 0) {
          console.log('🚨 Empty address string');
        } else {
          console.log('✅ ✅ Address has proper value');
          console.log('🔧 Status: BACKEND FIX WORKING');
        }
      } else if (typeof address === 'object') {
        console.log('🚨 POTENTIAL BUG: Address is object instead of string');
        console.log(`🔍 Object contents: ${JSON.stringify(address, null, 2)}`);
      }
      console.log('===============================================');
    } else if (scanResult.success) {
      console.log('\n🚨 NO ADDRESS FIELD FOUND in response');
      console.log('🔍 Customer object:', JSON.stringify(scanResult.data?.data?.order?.customer, null, 2));
    }
    
    // Test 10: Update Location
    console.log('\n🔟 UPDATE PILOT LOCATION');
    const locationResult = await testAPI('/update-location', 'POST', {
      latitude: 12.9716,
      longitude: 77.5946
    }, PILOT_TOKEN, 'Update Pilot Location');
    results.updateLocation = locationResult;
    
    // Test 11: Accept Order (needs pilotId in body)
    console.log('\n1️⃣1️⃣ ACCEPT ORDER');
    const acceptResult = await testAPI('/accept-order', 'POST', {
      orderId: TEST_DATA.orderId,
      pilotId: PILOT_ID // Required field
    }, PILOT_TOKEN, 'Accept Order Assignment');
    results.acceptOrder = acceptResult;
    
    // Test 12: Start Journey
    console.log('\n1️⃣2️⃣ START JOURNEY');
    const journeyResult = await testAPI('/start-journey', 'POST', {
      orderId: TEST_DATA.orderId,
      currentLocation: {
        latitude: 12.9716,
        longitude: 77.5946
      }
    }, PILOT_TOKEN, 'Start Journey to Customer');
    results.startJourney = journeyResult;
    
    // Test 13: Complete Delivery
    console.log('\n1️⃣3️⃣ COMPLETE DELIVERY');
    const completeResult = await testAPI('/complete-delivery', 'POST', {
      orderId: TEST_DATA.orderId,
      deliveryOTP: '123456', // Test OTP
      deliveryNotes: 'Delivered successfully - test',
      customerRating: 5
    }, PILOT_TOKEN, 'Complete Delivery with OTP');
    results.completeDelivery = completeResult;
    
    // Test 14: Get Delivery History (with pagination)
    console.log('\n1️⃣4️⃣ GET DELIVERY HISTORY');
    const historyResult = await testAPI('/delivery-history?page=1&limit=5', 'GET', null, PILOT_TOKEN, 'Get Delivery History');
    results.deliveryHistory = historyResult;
    
    // Test 15: Support Contact
    console.log('\n1️⃣5️⃣ SUBMIT SUPPORT REQUEST');
    const supportResult = await testAPI('/support/contact', 'POST', {
      subject: 'Test Support Request',
      message: 'This is a test support message from pilot API testing',
      priority: 'medium'
    }, PILOT_TOKEN, 'Submit Support Request');
    results.supportContact = supportResult;
    
  } else {
    console.log('\n❌ Skipping authenticated endpoints - no token available');
    console.log('💡 Make sure pilot exists and is approved in database');
  }
  
  // Final Summary with Address Bug Status
  console.log('\n🎉 TESTING COMPLETE!');
  console.log('='.repeat(50));
  console.log('📊 RESULTS SUMMARY:');
  
  const testResults = Object.entries(results);
  let successCount = 0;
  
  testResults.forEach(([testName, result]) => {
    const status = result.success ? '✅' : '❌';
    const statusCode = result.status || 'N/A';
    console.log(`${status} ${testName}: ${statusCode}`);
    if (result.success) successCount++;
  });
  
  console.log(`\n📈 Success Rate: ${successCount}/${testResults.length} (${Math.round(successCount/testResults.length*100)}%)`);
  console.log(`🌐 Server: ${WORKING_BASE_URL}`);
  console.log(`🔑 Authentication: ${PILOT_TOKEN ? 'Success' : 'Failed'}`);
  
  // Address Bug Status Report
  if (results.scanOrder) {
    console.log('\n🏠 ADDRESS BUG STATUS REPORT:');
    console.log('='.repeat(30));
    if (results.scanOrder.success) {
      const address = results.scanOrder.data?.data?.order?.customer?.address;
      if (address === 'NA') {
        console.log('🚨 BUG STATUS: CONFIRMED - Address returns "NA"');
        console.log('🔧 ACTION NEEDED: Apply backend fix in pilot.js line 245');
      } else if (address && address !== 'NA') {
        console.log('✅ BUG STATUS: FIXED - Address returns proper value');
        console.log('🎉 BACKEND FIX: WORKING CORRECTLY');
      } else {
        console.log('⚠️  BUG STATUS: UNKNOWN - No address field found');
      }
    } else {
      console.log('❌ BUG STATUS: CANNOT TEST - Scan order failed');
      console.log(`❓ Reason: ${results.scanOrder.error}`);
    }
    console.log('='.repeat(30));
  }
  
  return results;
}

// Error handling wrapper
async function main() {
  try {
    const results = await runCorrectPilotTests();
    
    // Save results to file for analysis
    const fs = require('fs');
    const resultsFile = `pilot-api-corrected-results-${Date.now()}.json`;
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${resultsFile}`);
    
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
    console.error(error.stack);
  }
}

// Install axios if not available
try {
  require.resolve('axios');
} catch (e) {
  console.log('❌ axios not found. Please install it:');
  console.log('npm install axios');
  process.exit(1);
}

// Run the corrected tests
main();