const axios = require('axios');

// Configuration
const CONFIG = {
  baseUrl: 'http://127.0.0.1:5000',
  testPhone: '9876543210',
  testOTP: '123456', // Default OTP for development
  requestTimeout: 30000
};

// Global variables
let authToken = null;
let pilotId = null;
const testResults = { passed: 0, failed: 0 };

// Enhanced HTTP client with better error handling
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
      validateStatus: () => true // Don't throw on any status code
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
function logTest(testName, passed, details) {
  const icon = passed ? '✅' : '❌';
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`${icon} ${status}: ${testName}`);
  if (details) {
    console.log(`   ${details}`);
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
    phoneNumber: `98765${String(timestamp).slice(-5)}`, // Generate unique phone
    email: `pilot${timestamp}@test.com`,
    vehicleRegistration: `TS${String(timestamp).slice(-2)}AB${String(timestamp).slice(-4)}`,
    licenseNumber: `DL${timestamp}`
  };
}

// Test pilot registration and approval flow
async function testPilotRegistrationAndApproval() {
  console.log('\n🔸 Testing Complete Pilot Registration & Approval Flow...');
  
  const testData = generateTestData();
  CONFIG.testPhone = testData.phoneNumber;
  
  try {
    // Step 1: Register pilot
    console.log('   Step 1: Registering pilot...');
    const response = await makeRequest('POST', '/api/pilot/register', {
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
    });

    const registrationPassed = response.status === 201 && response.data.success === true;
    if (registrationPassed) {
      pilotId = response.data.data.pilotId;
      console.log(`   ✅ Registration successful! Pilot ID: ${pilotId}`);
    }
    
    logTest('Pilot Registration', registrationPassed, 
      registrationPassed ? `Pilot ID: ${pilotId}` : 
      `Status: ${response.status}, Error: ${response.data.message || 'Unknown error'}`);

    if (!registrationPassed) return false;

    // Step 2: Test login before approval (should fail)
    console.log('   Step 2: Testing login before approval...');
    const preApprovalLogin = await makeRequest('POST', '/api/pilot/login', {
      phoneNumber: testData.phoneNumber
    });
    
    const preApprovalFailed = preApprovalLogin.status === 404;
    logTest('Login Before Approval', preApprovalFailed, 
      preApprovalFailed ? 'Correctly rejected - pilot not approved' : 
      `Unexpected: ${preApprovalLogin.status}`);

    // Step 3: Instructions for manual approval
    console.log('   Step 3: Manual approval required...');
    console.log(`   📋 To test the complete flow, run:`);
    console.log(`   📋 node approve-pilot.js approve ${pilotId}`);
    console.log(`   📋 Then run: node test-complete-flow.js`);
    
    return pilotId;

  } catch (error) {
    logTest('Registration & Approval Flow', false, `Network Error: ${error.message}`);
    return false;
  }
}

// Test complete login flow with approved pilot
async function testCompleteLoginFlow() {
  console.log('\n🔸 Testing Complete Login Flow...');
  
  if (!pilotId) {
    console.log('   ⚠️ No pilot ID available for login test');
    return false;
  }

  try {
    // Step 1: Request OTP
    console.log('   Step 1: Requesting OTP...');
    const otpResponse = await makeRequest('POST', '/api/pilot/login', {
      phoneNumber: CONFIG.testPhone
    });

    const otpPassed = otpResponse.status === 200 && otpResponse.data.success === true;
    logTest('OTP Request', otpPassed, 
      otpPassed ? 'OTP sent successfully' : `Status: ${otpResponse.status}`);

    if (!otpPassed) {
      if (otpResponse.status === 404) {
        console.log('   ℹ️ Pilot not approved yet. Use approve-pilot.js to approve first.');
      }
      return false;
    }

    // Step 2: Verify OTP and login
    console.log('   Step 2: Verifying OTP and logging in...');
    const otp = otpResponse.data.data?.otp || CONFIG.testOTP;
    await new Promise(resolve => setTimeout(resolve, 1000));

    const loginResponse = await makeRequest('POST', '/api/pilot/login', {
      phoneNumber: CONFIG.testPhone,
      otp: otp
    });

    const loginPassed = loginResponse.status === 200 && loginResponse.data.success === true;
    if (loginPassed) {
      authToken = loginResponse.data.data.token;
    }

    logTest('OTP Verification & Login', loginPassed,
      loginPassed ? 'Login successful, token stored' : `Status: ${loginResponse.status}`);

    return loginPassed;

  } catch (error) {
    logTest('Complete Login Flow', false, `Network Error: ${error.message}`);
    return false;
  }
}

// Test all authenticated endpoints
async function testAllAuthenticatedEndpoints() {
  console.log('\n🔸 Testing All Authenticated Endpoints...');
  
  if (!authToken) {
    console.log('   ⚠️ No auth token available - skipping authenticated tests');
    return;
  }

  const authHeaders = { 'Authorization': `Bearer ${authToken}` };

  // Test dashboard stats
  try {
    const dashboardResponse = await makeRequest('GET', '/api/pilot/dashboard/stats', null, authHeaders);
    logTest('Dashboard Stats Access', dashboardResponse.status === 200, 
      `Dashboard stats retrieved: ${dashboardResponse.status}`);
  } catch (error) {
    logTest('Dashboard Stats Access', false, error.message);
  }

  // Test stats
  try {
    const statsResponse = await makeRequest('GET', '/api/pilot/stats', null, authHeaders);
    logTest('Stats Access', statsResponse.status === 200, 
      `Stats retrieved: ${statsResponse.status}`);
  } catch (error) {
    logTest('Stats Access', false, error.message);
  }

  // Test delivery history
  try {
    const historyResponse = await makeRequest('GET', '/api/pilot/delivery-history', null, authHeaders);
    logTest('Delivery History', historyResponse.status === 200, 
      `History retrieved: ${historyResponse.status}`);
  } catch (error) {
    logTest('Delivery History', false, error.message);
  }

  // Test location update
  try {
    const locationResponse = await makeRequest('POST', '/api/pilot/update-location', {
      latitude: 17.3850,
      longitude: 78.4867,
      accuracy: 10
    }, authHeaders);
    logTest('Location Update', locationResponse.status === 200, 
      `Location updated: ${locationResponse.status}`);
  } catch (error) {
    logTest('Location Update', false, error.message);
  }

  // Test notifications
  try {
    const notificationsResponse = await makeRequest('GET', '/api/pilot/dashboard/notifications', null, authHeaders);
    logTest('Dashboard Notifications', notificationsResponse.status === 200, 
      `Notifications retrieved: ${notificationsResponse.status}`);
  } catch (error) {
    logTest('Dashboard Notifications', false, error.message);
  }

  // Test app config (public endpoint)
  try {
    const configResponse = await makeRequest('GET', '/api/pilot/app/config');
    logTest('App Config', configResponse.status === 200, 
      `App config retrieved: ${configResponse.status}`);
  } catch (error) {
    logTest('App Config', false, error.message);
  }

  // Test support FAQs (public endpoint)
  try {
    const faqResponse = await makeRequest('GET', '/api/pilot/support/faqs');
    logTest('Support FAQs', faqResponse.status === 200, 
      `FAQs retrieved: ${faqResponse.status}`);
  } catch (error) {
    logTest('Support FAQs', false, error.message);
  }

  // Test profile access
  try {
    // We need a pilot ID for this test - we'll use the one we have
    const profileResponse = await makeRequest('GET', `/api/pilot/profile/${pilotId}`, null, authHeaders);
    logTest('Profile Access', profileResponse.status === 200, 
      `Profile retrieved: ${profileResponse.status}`);
  } catch (error) {
    logTest('Profile Access', false, error.message);
  }
}

// Main test runner
async function runCompleteFlow() {
  console.log('🚀 Starting Complete Pilot API Flow Test...');
  console.log(`🌐 Testing against: ${CONFIG.baseUrl}`);
  
  const startTime = Date.now();

  try {
    // Test server connectivity
    console.log('\n🔸 Testing Server Connectivity...');
    const pingResponse = await makeRequest('GET', '/');
    const serverOnline = pingResponse.status === 200 || pingResponse.status === 404;
    logTest('Server Connectivity', serverOnline, 
      serverOnline ? 'Server is accessible' : `Cannot reach server: ${pingResponse.status}`);

    if (!serverOnline) {
      console.log('❌ Cannot reach server. Please check if it\'s running.');
      return;
    }

    // Check if this is a test with existing pilot ID
    const existingPilotId = process.argv[2];
    if (existingPilotId && existingPilotId.startsWith('PIL')) {
      console.log(`\n🔸 Testing with existing pilot: ${existingPilotId}`);
      pilotId = existingPilotId;
      // We need to get the phone number for this pilot - skip registration
      const loginSuccess = await testCompleteLoginFlow();
      if (loginSuccess) {
        await testAllAuthenticatedEndpoints();
      }
    } else {
      // Full flow: registration -> approval -> login -> endpoints
      const newPilotId = await testPilotRegistrationAndApproval();
      if (newPilotId) {
        const loginSuccess = await testCompleteLoginFlow();
        if (loginSuccess) {
          await testAllAuthenticatedEndpoints();
        }
      }
    }

  } catch (error) {
    console.log(`💥 Test execution failed: ${error.message}`);
  }

  // Final report
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const total = testResults.passed + testResults.failed;
  const successRate = total > 0 ? ((testResults.passed / total) * 100).toFixed(1) : 0;

  console.log('\n' + '='.repeat(50));
  console.log('           COMPLETE FLOW TEST REPORT');
  console.log('='.repeat(50));
  console.log(`📊 Total Tests: ${total}`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📈 Success Rate: ${successRate}%`);
  console.log(`⏱️  Duration: ${duration} seconds`);
  console.log(`🌐 Base URL: ${CONFIG.baseUrl}`);
  if (pilotId) {
    console.log(`👤 Pilot ID: ${pilotId}`);
  }
  console.log('='.repeat(50));

  if (testResults.failed === 0) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('⚠️  Some tests failed. Check the details above.');
  }
}

// Run the complete flow test
runCompleteFlow().catch(console.error);