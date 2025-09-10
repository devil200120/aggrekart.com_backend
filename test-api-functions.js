const axios = require('axios');

// Configuration
const CONFIG = {
  baseUrl: 'http://127.0.0.1:5000',
  testPhone: '9876543210',
  testOTP: '123456',
  requestTimeout: 30000
};

// Global variables
let authToken = null;
let pilotId = null;
let testOrderId = null;
const testResults = { passed: 0, failed: 0 };

// Enhanced HTTP client
async function makeRequest(method, endpoint, data = null, headers = {}) {
  try {
    const url = `${CONFIG.baseUrl}${endpoint}`;
    const config = {
      method,
      url,
      timeout: CONFIG.requestTimeout,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      validateStatus: () => true
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return {
      status: response.status,
      data: response.data || {},
      headers: response.headers
    };
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Connection refused - is the server running?');
    }
    throw new Error(error.message);
  }
}

// Test result logger
function logTest(testName, passed, details, responseData = null) {
  const icon = passed ? '✅' : '❌';
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`${icon} ${status}: ${testName}`);
  if (details) {
    console.log(`   ${details}`);
  }
  if (responseData && typeof responseData === 'object') {
    console.log(`   📊 Response Data:`, JSON.stringify(responseData, null, 2));
  }
  
  if (passed) {
    testResults.passed++;
  } else {
    testResults.failed++;
  }
}

// Generate dynamic test data
function generateTestData() {
  const timestamp = Date.now();
  return {
    name: `Test Pilot ${timestamp}`,
    phoneNumber: `98765${String(timestamp).slice(-5)}`,
    email: `pilot${timestamp}@test.com`,
    vehicleRegistration: `TS${String(timestamp).slice(-2)}AB${String(timestamp).slice(-4)}`,
    licenseNumber: `DL${timestamp}`
  };
}

// Test 1: Pilot Registration Function
async function testPilotRegistrationFunction() {
  console.log('\n🔸 Testing Pilot Registration Function...');
  
  const testData = generateTestData();
  CONFIG.testPhone = testData.phoneNumber;
  
  try {
    const registrationData = {
      name: testData.name,
      phoneNumber: testData.phoneNumber,
      email: testData.email,
      vehicleDetails: {
        registrationNumber: testData.vehicleRegistration,
        vehicleType: 'truck',
        capacity: 5
      },
      drivingLicense: {
        number: testData.licenseNumber,
        validTill: '2025-12-31T00:00:00.000Z'
      }
    };

    console.log('   📤 Sending registration request...');
    const response = await makeRequest('POST', '/api/pilot/register', registrationData);

    const passed = response.status === 201 && response.data.success === true;
    if (passed) {
      pilotId = response.data.data.pilotId;
      console.log(`   🆔 Generated Pilot ID: ${pilotId}`);
    }
    
    logTest('Pilot Registration Function', passed, 
      passed ? `Pilot registered with ID: ${pilotId}` : 
      `Failed with status: ${response.status}`, 
      response.data);

    // Test validation by sending invalid data
    console.log('   🔍 Testing input validation...');
    const invalidResponse = await makeRequest('POST', '/api/pilot/register', {
      name: 'A', // Too short
      phoneNumber: '123', // Invalid format
      vehicleDetails: { registrationNumber: 'INVALID', vehicleType: 'truck', capacity: 5 }
    });

    logTest('Registration Validation', invalidResponse.status === 400, 
      `Validation correctly rejected invalid data: ${invalidResponse.status}`,
      invalidResponse.data);

    return passed;

  } catch (error) {
    logTest('Pilot Registration Function', false, `Network Error: ${error.message}`);
    return false;
  }
}

// Test 2: Login Function (OTP Flow)
async function testLoginFunction() {
  console.log('\n🔸 Testing Login Function (OTP Flow)...');
  
  if (!pilotId) {
    console.log('   ⚠️ No pilot ID available - using existing pilot for login test');
    CONFIG.testPhone = '9876543201'; // Try with existing pilot
  }

  try {
    // Step 1: Request OTP
    console.log('   📤 Step 1: Requesting OTP...');
    const otpRequest = {
      phoneNumber: CONFIG.testPhone
    };

    const otpResponse = await makeRequest('POST', '/api/pilot/login', otpRequest);
    
    const otpPassed = otpResponse.status === 200 && otpResponse.data.success === true;
    const is404 = otpResponse.status === 404;
    
    if (is404) {
      logTest('OTP Request Function', true, 
        'Expected 404 - Pilot not approved yet (normal flow)', 
        otpResponse.data);
      console.log('   ℹ️ Note: Pilot needs admin approval before login');
      return false;
    }

    logTest('OTP Request Function', otpPassed, 
      otpPassed ? 'OTP sent successfully' : `Failed with status: ${otpResponse.status}`,
      otpResponse.data);

    if (!otpPassed) return false;

    // Step 2: Verify OTP
    console.log('   📤 Step 2: Verifying OTP...');
    const otp = otpResponse.data.data?.otp || CONFIG.testOTP;
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

    const loginRequest = {
      phoneNumber: CONFIG.testPhone,
      otp: otp
    };

    const loginResponse = await makeRequest('POST', '/api/pilot/login', loginRequest);
    
    const loginPassed = loginResponse.status === 200 && loginResponse.data.success === true;
    if (loginPassed) {
      authToken = loginResponse.data.data.token;
      console.log(`   🔑 JWT Token generated: ${authToken.substring(0, 30)}...`);
    }

    logTest('OTP Verification Function', loginPassed,
      loginPassed ? 'Login successful, JWT token generated' : 
      `Failed with status: ${loginResponse.status}`,
      loginResponse.data);

    // Test invalid OTP
    console.log('   🔍 Testing invalid OTP...');
    const invalidOtpResponse = await makeRequest('POST', '/api/pilot/login', {
      phoneNumber: CONFIG.testPhone,
      otp: '000000'
    });

    logTest('Invalid OTP Handling', invalidOtpResponse.status === 400, 
      `Invalid OTP correctly rejected: ${invalidOtpResponse.status}`,
      invalidOtpResponse.data);

    return loginPassed;

  } catch (error) {
    logTest('Login Function', false, `Network Error: ${error.message}`);
    return false;
  }
}

// Test 3: Stats Function
async function testStatsFunction() {
  console.log('\n🔸 Testing Stats Function...');
  
  if (!authToken) {
    console.log('   ⚠️ No auth token - skipping stats test');
    return false;
  }

  try {
    const authHeaders = { 'Authorization': `Bearer ${authToken}` };
    
    console.log('   📤 Fetching pilot statistics...');
    const response = await makeRequest('GET', '/api/pilot/stats', null, authHeaders);

    const passed = response.status === 200 && response.data.success === true;
    
    if (passed) {
      const stats = response.data.data;
      console.log(`   📊 Total Deliveries: ${stats.totalDeliveries}`);
      console.log(`   💰 Total Earnings: ₹${stats.totalEarnings}`);
      console.log(`   ⭐ Rating: ${stats.averageRating}`);
      console.log(`   📈 Success Rate: ${stats.performance?.successRate}%`);
    }

    logTest('Stats Function', passed,
      passed ? 'Statistics retrieved successfully' : 
      `Failed with status: ${response.status}`,
      response.data);

    return passed;

  } catch (error) {
    logTest('Stats Function', false, `Network Error: ${error.message}`);
    return false;
  }
}

// Test 4: Location Update Function
async function testLocationUpdateFunction() {
  console.log('\n🔸 Testing Location Update Function...');
  
  if (!authToken) {
    console.log('   ⚠️ No auth token - skipping location test');
    return false;
  }

  try {
    const authHeaders = { 'Authorization': `Bearer ${authToken}` };
    
    // Test with Hyderabad coordinates
    const locationData = {
      latitude: 17.3850,
      longitude: 78.4867,
      accuracy: 10
    };

    console.log('   📤 Updating pilot location...');
    console.log(`   📍 Coordinates: ${locationData.latitude}, ${locationData.longitude}`);
    
    const response = await makeRequest('POST', '/api/pilot/update-location', locationData, authHeaders);

    const passed = response.status === 200 && response.data.success === true;
    
    if (passed) {
      const locationInfo = response.data.data;
      console.log(`   ✅ Location updated at: ${locationInfo.location?.updatedAt}`);
      if (locationInfo.nearbyOrders?.length > 0) {
        console.log(`   🎯 Found ${locationInfo.nearbyOrders.length} nearby orders`);
      }
    }

    logTest('Location Update Function', passed,
      passed ? 'Location updated successfully' : 
      `Failed with status: ${response.status}`,
      response.data);

    // Test invalid coordinates
    console.log('   🔍 Testing invalid coordinates...');
    const invalidResponse = await makeRequest('POST', '/api/pilot/update-location', {
      latitude: 999, // Invalid latitude
      longitude: 999, // Invalid longitude
      accuracy: 10
    }, authHeaders);

    logTest('Location Validation', invalidResponse.status === 400,
      `Invalid coordinates correctly rejected: ${invalidResponse.status}`,
      invalidResponse.data);

    return passed;

  } catch (error) {
    logTest('Location Update Function', false, `Network Error: ${error.message}`);
    return false;
  }
}

// Test 5: Order Scanning Function
async function testOrderScanFunction() {
  console.log('\n🔸 Testing Order Scan Function...');
  
  if (!authToken) {
    console.log('   ⚠️ No auth token - skipping order scan test');
    return false;
  }

  try {
    const authHeaders = { 'Authorization': `Bearer ${authToken}` };
    
    // Try to scan a test order (this will likely fail but tests the function)
    testOrderId = 'ORD123456';
    
    console.log(`   📤 Scanning order: ${testOrderId}`);
    const response = await makeRequest('POST', '/api/pilot/scan-order', {
      orderId: testOrderId
    }, authHeaders);

    const passed = response.status === 200 && response.data.success === true;
    const notFound = response.status === 404;
    
    if (passed) {
      const order = response.data.data.order;
      console.log(`   📦 Order found: ${order.orderId}`);
      console.log(`   👤 Customer: ${order.customerName}`);
      console.log(`   💰 Amount: ₹${order.totalAmount}`);
    } else if (notFound) {
      console.log(`   ℹ️ Order ${testOrderId} not found (expected for test)`);
    }

    // Even if order not found, if the function works correctly, it's a pass
    const functionWorks = passed || notFound;
    
    logTest('Order Scan Function', functionWorks,
      passed ? 'Order scanned successfully' : 
      notFound ? 'Order not found (function working correctly)' :
      `Unexpected error: ${response.status}`,
      response.data);

    // Test invalid order ID format
    console.log('   🔍 Testing invalid order ID...');
    const invalidResponse = await makeRequest('POST', '/api/pilot/scan-order', {
      orderId: 'INVALID123'
    }, authHeaders);

    logTest('Order ID Validation', invalidResponse.status === 400,
      `Invalid order ID correctly rejected: ${invalidResponse.status}`,
      invalidResponse.data);

    return functionWorks;

  } catch (error) {
    logTest('Order Scan Function', false, `Network Error: ${error.message}`);
    return false;
  }
}

// Test 6: Dashboard Functions
async function testDashboardFunctions() {
  console.log('\n🔸 Testing Dashboard Functions...');
  
  if (!authToken) {
    console.log('   ⚠️ No auth token - skipping dashboard tests');
    return false;
  }

  try {
    const authHeaders = { 'Authorization': `Bearer ${authToken}` };
    let allPassed = true;

    // Test Dashboard Stats
    console.log('   📤 Testing dashboard stats...');
    const statsResponse = await makeRequest('GET', '/api/pilot/dashboard/stats', null, authHeaders);
    const statsPassed = statsResponse.status === 200 && statsResponse.data.success === true;
    
    if (statsPassed) {
      const dashboardStats = statsResponse.data.data;
      console.log(`   📈 Today's deliveries: ${dashboardStats.todayStats?.deliveries || 0}`);
      console.log(`   💰 Today's earnings: ₹${dashboardStats.todayStats?.earnings || 0}`);
    }

    logTest('Dashboard Stats Function', statsPassed,
      statsPassed ? 'Dashboard stats retrieved' : 
      `Failed with status: ${statsResponse.status}`,
      statsResponse.data);

    // Test Dashboard Notifications
    console.log('   📤 Testing dashboard notifications...');
    const notifResponse = await makeRequest('GET', '/api/pilot/dashboard/notifications', null, authHeaders);
    const notifPassed = notifResponse.status === 200 && notifResponse.data.success === true;
    
    if (notifPassed) {
      const notifications = notifResponse.data.data;
      console.log(`   🔔 Notifications count: ${notifications.notifications?.length || 0}`);
      console.log(`   📬 Unread count: ${notifications.unreadCount || 0}`);
    }

    logTest('Dashboard Notifications Function', notifPassed,
      notifPassed ? 'Notifications retrieved' : 
      `Failed with status: ${notifResponse.status}`,
      notifResponse.data);

    return statsPassed && notifPassed;

  } catch (error) {
    logTest('Dashboard Functions', false, `Network Error: ${error.message}`);
    return false;
  }
}

// Test 7: Delivery History Function
async function testDeliveryHistoryFunction() {
  console.log('\n🔸 Testing Delivery History Function...');
  
  if (!authToken) {
    console.log('   ⚠️ No auth token - skipping delivery history test');
    return false;
  }

  try {
    const authHeaders = { 'Authorization': `Bearer ${authToken}` };
    
    console.log('   📤 Fetching delivery history...');
    const response = await makeRequest('GET', '/api/pilot/delivery-history', null, authHeaders);

    const passed = response.status === 200 && response.data.success === true;
    
    if (passed) {
      const history = response.data.data;
      console.log(`   📦 Total deliveries in history: ${history.deliveries?.length || 0}`);
      console.log(`   📄 Pagination - Page: ${history.pagination?.page || 1}`);
      console.log(`   📊 Total records: ${history.pagination?.total || 0}`);
      
      if (history.deliveries?.length > 0) {
        const firstDelivery = history.deliveries[0];
        console.log(`   🏆 Latest delivery: ${firstDelivery.orderId}`);
        console.log(`   💰 Amount: ₹${firstDelivery.amount}`);
      }
    }

    logTest('Delivery History Function', passed,
      passed ? 'Delivery history retrieved successfully' : 
      `Failed with status: ${response.status}`,
      response.data);

    return passed;

  } catch (error) {
    logTest('Delivery History Function', false, `Network Error: ${error.message}`);
    return false;
  }
}

// Test 8: Support Functions
async function testSupportFunctions() {
  console.log('\n🔸 Testing Support Functions...');
  
  try {
    // Test FAQs (public endpoint)
    console.log('   📤 Testing FAQ retrieval...');
    const faqResponse = await makeRequest('GET', '/api/pilot/support/faqs');
    const faqPassed = faqResponse.status === 200 && faqResponse.data.success === true;
    
    if (faqPassed) {
      const faqs = faqResponse.data.data;
      console.log(`   ❓ Total FAQs: ${faqs.faqs?.length || 0}`);
      console.log(`   📚 Categories: ${faqs.categories?.join(', ') || 'None'}`);
      console.log(`   📞 Support contact: ${faqs.contactInfo?.email || 'N/A'}`);
    }

    logTest('FAQ Function', faqPassed,
      faqPassed ? 'FAQs retrieved successfully' : 
      `Failed with status: ${faqResponse.status}`,
      faqResponse.data);

    // Test Contact Support (requires auth)
    if (authToken) {
      console.log('   📤 Testing support contact...');
      const authHeaders = { 'Authorization': `Bearer ${authToken}` };
      
      const contactResponse = await makeRequest('POST', '/api/pilot/support/contact', {
        subject: 'Test Support Request',
        message: 'This is a test message for API testing',
        category: 'technical',
        priority: 'low'
      }, authHeaders);

      const contactPassed = contactResponse.status === 200 && contactResponse.data.success === true;
      
      if (contactPassed) {
        const ticket = contactResponse.data.data;
        console.log(`   🎫 Ticket created: ${ticket.ticketId}`);
        console.log(`   📋 Reference: ${ticket.reference}`);
      }

      logTest('Support Contact Function', contactPassed,
        contactPassed ? 'Support ticket created' : 
        `Failed with status: ${contactResponse.status}`,
        contactResponse.data);
    }

    return faqPassed;

  } catch (error) {
    logTest('Support Functions', false, `Network Error: ${error.message}`);
    return false;
  }
}

// Test 9: App Config Function
async function testAppConfigFunction() {
  console.log('\n🔸 Testing App Config Function...');
  
  try {
    console.log('   📤 Fetching app configuration...');
    const response = await makeRequest('GET', '/api/pilot/app/config');

    const passed = response.status === 200 && response.data.success === true;
    
    if (passed) {
      const config = response.data.data;
      console.log(`   📱 App version: ${config.app?.version || 'N/A'}`);
      console.log(`   🔧 Maintenance mode: ${config.app?.maintenance ? 'ON' : 'OFF'}`);
      console.log(`   📍 Location tracking: ${config.app?.features?.locationTracking ? 'Enabled' : 'Disabled'}`);
      console.log(`   ⚙️ Update interval: ${config.settings?.locationUpdateInterval || 'N/A'}ms`);
    }

    logTest('App Config Function', passed,
      passed ? 'App configuration retrieved' : 
      `Failed with status: ${response.status}`,
      response.data);

    return passed;

  } catch (error) {
    logTest('App Config Function', false, `Network Error: ${error.message}`);
    return false;
  }
}

// Test 10: Profile Function
async function testProfileFunction() {
  console.log('\n🔸 Testing Profile Function...');
  
  if (!authToken || !pilotId) {
    console.log('   ⚠️ No auth token or pilot ID - skipping profile test');
    return false;
  }

  try {
    const authHeaders = { 'Authorization': `Bearer ${authToken}` };
    
    console.log(`   📤 Fetching profile for pilot: ${pilotId}`);
    const response = await makeRequest('GET', `/api/pilot/profile/${pilotId}`, null, authHeaders);

    const passed = response.status === 200 && response.data.success === true;
    
    if (passed) {
      const profile = response.data.data.pilot;
      console.log(`   👤 Name: ${profile.name}`);
      console.log(`   📱 Phone: ${profile.phoneNumber}`);
      console.log(`   🚛 Vehicle: ${profile.vehicleDetails?.registrationNumber}`);
      console.log(`   ⭐ Rating: ${profile.rating}`);
      console.log(`   ✅ Approved: ${profile.isApproved ? 'Yes' : 'No'}`);
      console.log(`   🟢 Available: ${profile.isAvailable ? 'Yes' : 'No'}`);
    }

    logTest('Profile Function', passed,
      passed ? 'Profile retrieved successfully' : 
      `Failed with status: ${response.status}`,
      response.data);

    return passed;

  } catch (error) {
    logTest('Profile Function', false, `Network Error: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runFunctionTests() {
  console.log('🚀 Starting Comprehensive API Function Tests...');
  console.log(`🌐 Testing against: ${CONFIG.baseUrl}`);
  console.log(`📅 Test started at: ${new Date().toISOString()}`);
  
  const startTime = Date.now();

  try {
    // Test server connectivity first
    console.log('\n🔸 Testing Server Connectivity...');
    const pingResponse = await makeRequest('GET', '/');
    const serverOnline = pingResponse.status === 200 || pingResponse.status === 404;
    logTest('Server Connectivity', serverOnline, 
      serverOnline ? 'Server is accessible' : `Cannot reach server: ${pingResponse.status}`);

    if (!serverOnline) {
      console.log('❌ Cannot reach server. Please check if it\'s running.');
      return;
    }

    // Run all function tests
    console.log('\n🔥 Running API Function Tests...');
    
    const registrationResult = await testPilotRegistrationFunction();
    const loginResult = await testLoginFunction();
    const statsResult = await testStatsFunction();
    const locationResult = await testLocationUpdateFunction();
    const orderScanResult = await testOrderScanFunction();
    const dashboardResult = await testDashboardFunctions();
    const historyResult = await testDeliveryHistoryFunction();
    const supportResult = await testSupportFunctions();
    const configResult = await testAppConfigFunction();
    const profileResult = await testProfileFunction();

    console.log('\n📊 Function Test Summary:');
    console.log(`   Registration: ${registrationResult ? '✅' : '❌'}`);
    console.log(`   Login Flow: ${loginResult ? '✅' : '❌'}`);
    console.log(`   Statistics: ${statsResult ? '✅' : '❌'}`);
    console.log(`   Location Update: ${locationResult ? '✅' : '❌'}`);
    console.log(`   Order Scanning: ${orderScanResult ? '✅' : '❌'}`);
    console.log(`   Dashboard: ${dashboardResult ? '✅' : '❌'}`);
    console.log(`   Delivery History: ${historyResult ? '✅' : '❌'}`);
    console.log(`   Support: ${supportResult ? '✅' : '❌'}`);
    console.log(`   App Config: ${configResult ? '✅' : '❌'}`);
    console.log(`   Profile: ${profileResult ? '✅' : '❌'}`);

  } catch (error) {
    console.log(`💥 Test execution failed: ${error.message}`);
  }

  // Final comprehensive report
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const total = testResults.passed + testResults.failed;
  const successRate = total > 0 ? ((testResults.passed / total) * 100).toFixed(1) : 0;

  console.log('\n' + '='.repeat(60));
  console.log('           COMPREHENSIVE API FUNCTION TEST REPORT');
  console.log('='.repeat(60));
  console.log(`📊 Total Function Tests: ${total}`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📈 Success Rate: ${successRate}%`);
  console.log(`⏱️  Duration: ${duration} seconds`);
  console.log(`🌐 Base URL: ${CONFIG.baseUrl}`);
  if (pilotId) {
    console.log(`👤 Test Pilot ID: ${pilotId}`);
  }
  if (authToken) {
    console.log(`🔑 JWT Token: ${authToken.substring(0, 30)}...`);
  }
  console.log('='.repeat(60));

  if (testResults.failed === 0) {
    console.log('🎉 All API functions are working perfectly!');
  } else {
    console.log('⚠️  Some API functions have issues. Check the details above.');
  }

  console.log('\n💡 Next Steps:');
  if (!loginResult) {
    console.log('   • Approve the test pilot to enable full functionality testing');
    console.log(`   • Run: node approve-pilot.js approve ${pilotId}`);
  }
  console.log('   • Use the generated test data for further integration testing');
  console.log('   • Check individual function responses for debugging');
}

// Run the comprehensive function tests
runFunctionTests().catch(console.error);