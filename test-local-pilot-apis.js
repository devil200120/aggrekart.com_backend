/**
 * Local Test Script for Pilot APIs
 * Tests all pilot endpoints against localhost server
 * Updated: September 4, 2025 - Added nearby orders API
 */

const axios = require('axios');
const fs = require('fs');

// Local server configuration - try multiple endpoints
const LOCAL_ENDPOINTS = [
  'http://127.0.0.1:5000',
  'http://localhost:5000',
  'http://0.0.0.0:5000'
];

// Test configuration
const TEST_DATA = {
  pilot: {
    name: "Test Pilot Local",
    phoneNumber: "9876543210", // Update with actual pilot phone
    email: "testpilot@local.com",
    aadharNumber: "123456789012",
    address: "123 Test Street, Bangalore",
    emergencyContact: "9876543211",
    vehicleDetails: {
      registrationNumber: "KA01TL1234",
      vehicleType: "motorcycle",
      capacity: 2
    },
    drivingLicense: {
      number: "KA1234567890",
      validTill: "2026-12-31"
    }
  },
  orderId: "AGK1756349965508KF3" // Update with actual order ID
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

// Test the new Available Nearby Orders API
async function testAvailableNearbyOrders(token) {
  console.log('\n🗺️ AVAILABLE NEARBY ORDERS API (NEW)');
  console.log('='.repeat(60));
  
  // Test different scenarios
  const testCases = [
    { description: 'Default parameters', params: '' },
    { description: '5km radius', params: '?radius=5' },
    { description: '10km with pagination', params: '?radius=10&page=1&limit=5' },
    { description: 'Urgent orders only', params: '?radius=15&orderType=urgent' },
    { description: 'Normal orders only', params: '?radius=15&orderType=normal' }
  ];

  const results = [];

  for (const testCase of testCases) {
    console.log(`\n  🧪 Testing: ${testCase.description}`);
    
    const result = await testAPI(
      `/available-nearby-orders${testCase.params}`,
      'GET',
      null,
      token,
      `Available Nearby Orders - ${testCase.description}`
    );

    results.push({
      testCase: testCase.description,
      success: result.success,
      status: result.status,
      data: result.data,
      hasOrders: !!(result.data?.data?.orders),
      ordersCount: result.data?.data?.orders?.length || 0,
      hasSummary: !!(result.data?.data?.summary),
      hasFilters: !!(result.data?.data?.filters),
      hasPagination: !!(result.data?.data?.pagination)
    });

    // Analysis for each test case
    if (result.success && result.data?.data) {
      console.log(`    📊 Orders Found: ${result.data.data.orders?.length || 0}`);
      if (result.data.data.summary) {
        console.log(`    📋 Summary: ${JSON.stringify(result.data.data.summary)}`);
      }
      if (result.data.data.filters) {
        console.log(`    🔍 Filters Applied: ${JSON.stringify(result.data.data.filters)}`);
      }
      if (result.data.data.pagination) {
        console.log(`    📄 Pagination: ${JSON.stringify(result.data.data.pagination)}`);
      }
    }

    // Add delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}

// Comprehensive pilot API tests
async function runAllPilotTests() {
  console.log('🚚 Comprehensive Local Pilot API Testing');
  console.log('========================================');
  console.log(`📞 Test Phone: ${TEST_DATA.pilot.phoneNumber}`);
  console.log(`📋 Test Order: ${TEST_DATA.orderId}`);
  console.log('========================================\n');
  
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
  
  // Test 1: Health Check (Server level)
  console.log('1️⃣ HEALTH CHECK');
  const healthResult = await testAPI('../health', 'GET', null, null, 'Server Health Check');
  results.health = healthResult;
  
  // Test 2: App Config (Public endpoint)
  console.log('\n2️⃣ APP CONFIG');
  const configResult = await testAPI('/app/config', 'GET', null, null, 'Get App Configuration');
  results.appConfig = configResult;
  
  // Test 3: Pilot Registration
  console.log('\n3️⃣ PILOT REGISTRATION');
  const registerResult = await testAPI('/register', 'POST', TEST_DATA.pilot, null, 'Register New Pilot');
  results.register = registerResult;
  
  // Test 4: Request OTP
  console.log('\n4️⃣ REQUEST OTP');
  const otpResult = await testAPI('/login', 'POST', {
    phoneNumber: TEST_DATA.pilot.phoneNumber
  }, null, 'Request Login OTP');
  results.requestOTP = otpResult;
  
  // Test 5: Login with OTP (if OTP received)
  if (otpResult.success && otpResult.data?.data?.otp) {
    const otp = otpResult.data.data.otp;
    console.log(`\n📱 Received OTP: ${otp}`);
    
    console.log('\n5️⃣ LOGIN WITH OTP');
    const loginResult = await testAPI('/login', 'POST', {
      phoneNumber: TEST_DATA.pilot.phoneNumber,
      otp: otp
    }, null, 'Login with OTP');
    results.login = loginResult;
    
    if (loginResult.success && loginResult.data?.data) {
      PILOT_TOKEN = loginResult.data.data.token;
      PILOT_ID = loginResult.data.data.pilot?._id || loginResult.data.data.pilot?.pilotId;
      console.log(`\n🔑 Token received: ${PILOT_TOKEN?.substring(0, 30)}...`);
      console.log(`👤 Pilot ID: ${PILOT_ID}`);
    }
  } else {
    console.log('\n❌ No OTP received - cannot test authenticated endpoints');
  }
  
  // Authenticated endpoint tests
  if (PILOT_TOKEN) {
    // Test 6: Get Profile
    console.log('\n6️⃣ GET PILOT PROFILE');
    const profileResult = await testAPI(`/profile`, 'GET', null, PILOT_TOKEN, 'Get Pilot Profile');
    results.profile = profileResult;
    
    // Test 7: Update Location (Required for nearby orders)
    console.log('\n7️⃣ UPDATE LOCATION');
    const locationResult = await testAPI('/update-location', 'POST', {
      latitude: 20.2961,
      longitude: 85.8245
    }, PILOT_TOKEN, 'Update Pilot Location');
    results.updateLocation = locationResult;
    
    // Test 8: Update Availability
    console.log('\n8️⃣ UPDATE AVAILABILITY');
    const availabilityResult = await testAPI('/availability', 'POST', {
      isAvailable: true,
      location: {
        latitude: 20.2961,
        longitude: 85.8245
      }
    }, PILOT_TOKEN, 'Update Pilot Availability');
    results.availability = availabilityResult;
    
    // Test 9: Get Stats
    console.log('\n9️⃣ GET PILOT STATS');
    const statsResult = await testAPI('/stats', 'GET', null, PILOT_TOKEN, 'Get Pilot Statistics');
    results.stats = statsResult;
    
    // Test 10: Dashboard Stats
    console.log('\n🔟 DASHBOARD STATS');
    const dashboardResult = await testAPI('/dashboard-stats', 'GET', null, PILOT_TOKEN, 'Get Dashboard Statistics');
    results.dashboard = dashboardResult;
    
    // Test 11: Available Nearby Orders (NEW API - MAIN FOCUS)
    console.log('\n1️⃣1️⃣ AVAILABLE NEARBY ORDERS (NEW API)');
    const nearbyOrdersResults = await testAvailableNearbyOrders(PILOT_TOKEN);
    results.availableNearbyOrders = nearbyOrdersResults;
    
    // Test 12: Scan Order (Critical test for address bug)
    console.log('\n1️⃣2️⃣ SCAN ORDER (Address Bug Test)');
    const scanResult = await testAPI('/scan-order', 'POST', {
      orderId: TEST_DATA.orderId
    }, PILOT_TOKEN, 'Scan Order - Testing Address Field');
    results.scanOrder = scanResult;
    
    // Special analysis for scan-order address field
    if (scanResult.success && scanResult.data?.data?.order?.customer?.address) {
      const address = scanResult.data.data.order.customer.address;
      console.log('\n🏠 ADDRESS FIELD ANALYSIS:');
      console.log('='.repeat(40));
      console.log(`📊 Type: ${typeof address}`);
      console.log(`📄 Value: ${JSON.stringify(address)}`);
      
      if (typeof address === 'string') {
        if (address === 'NA' || address === 'N/A') {
          console.log('🚨 BUG CONFIRMED: Address returns "NA"');
        } else if (address.includes('not available')) {
          console.log('⚠️  Address shows as not available');
        } else {
          console.log('✅ Address has proper value');
        }
      } else if (typeof address === 'object') {
        console.log('🚨 POTENTIAL BUG: Address is object instead of string');
        if (address?.address) {
          console.log(`📍 Actual address: "${address.address}"`);
        }
      }
      console.log('='.repeat(40));
    }
    
    // Test 13: Accept Order
    console.log('\n1️⃣3️⃣ ACCEPT ORDER');
    const acceptResult = await testAPI('/accept-order', 'POST', {
      orderId: TEST_DATA.orderId
    }, PILOT_TOKEN, 'Accept Order Assignment');
    results.acceptOrder = acceptResult;
    
    // Test 14: Get Assigned Orders
    console.log('\n1️⃣4️⃣ GET ASSIGNED ORDERS');
    const ordersResult = await testAPI('/assigned-orders', 'GET', null, PILOT_TOKEN, 'Get Assigned Orders');
    results.assignedOrders = ordersResult;
    
    // Test 15: Get Delivery History
    console.log('\n1️⃣5️⃣ GET DELIVERY HISTORY');
    const historyResult = await testAPI('/delivery-history', 'GET', null, PILOT_TOKEN, 'Get Delivery History');
    results.deliveryHistory = historyResult;
    
    // Test 16: Notifications
    console.log('\n1️⃣6️⃣ GET NOTIFICATIONS');
    const notificationsResult = await testAPI('/notifications', 'GET', null, PILOT_TOKEN, 'Get Pilot Notifications');
    results.notifications = notificationsResult;
    
    // Test 17: Support
    console.log('\n1️⃣7️⃣ GET SUPPORT');
    const supportResult = await testAPI('/support', 'GET', null, PILOT_TOKEN, 'Get Support Information');
    results.support = supportResult;
    
  } else {
    console.log('\n❌ Skipping authenticated endpoints - no token available');
  }
  
  // Final Summary
  console.log('\n🎉 TESTING COMPLETE!');
  console.log('='.repeat(50));
  console.log('📊 RESULTS SUMMARY:');
  
  const testResults = Object.entries(results);
  let successCount = 0;
  
  testResults.forEach(([testName, result]) => {
    if (Array.isArray(result)) {
      // Handle array results (like availableNearbyOrders)
      const arraySuccessCount = result.filter(r => r.success).length;
      const status = arraySuccessCount > 0 ? '✅' : '❌';
      console.log(`${status} ${testName}: ${arraySuccessCount}/${result.length} passed`);
      if (arraySuccessCount > 0) successCount++;
    } else {
      const status = result.success ? '✅' : '❌';
      const statusCode = result.status || 'N/A';
      console.log(`${status} ${testName}: ${statusCode}`);
      if (result.success) successCount++;
    }
  });
  
  console.log(`\n📈 Success Rate: ${successCount}/${testResults.length} (${Math.round(successCount/testResults.length*100)}%)`);
  console.log(`🌐 Server: ${WORKING_BASE_URL}`);
  console.log(`🔑 Authentication: ${PILOT_TOKEN ? 'Success' : 'Failed'}`);
  
  // Special focus on nearby orders API
  const nearbyOrdersTest = results.availableNearbyOrders;
  if (nearbyOrdersTest && Array.isArray(nearbyOrdersTest)) {
    console.log('\n🗺️ NEARBY ORDERS API ANALYSIS:');
    console.log('='.repeat(40));
    nearbyOrdersTest.forEach(test => {
      console.log(`${test.success ? '✅' : '❌'} ${test.testCase}: ${test.ordersCount} orders found`);
    });
    console.log('='.repeat(40));
  }
  
  return results;
}

// Error handling wrapper
async function main() {
  try {
    const results = await runAllPilotTests();
    
    // Save results to file for analysis
    const resultsFile = `pilot-api-local-test-results-${Date.now()}.json`;
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

// Run the comprehensive tests
console.log('🎬 Starting Local Pilot API Test Suite...');
console.log('📋 This will test all pilot endpoints including the NEW Available Nearby Orders API');
console.log('⚠️  Make sure your server is running: node server.js\n');

main();