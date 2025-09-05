/**
 * Comprehensive Pilot APIs Test Script
 * Tests all existing pilot endpoints with proper structure analysis
 * Created: September 4, 2025
 */

const https = require('https');
const fs = require('fs');

// Production configuration
const PRODUCTION_BASE_URL = 'https://aggrekart-com-backend.onrender.com';
const TEST_RESULTS_FILE = `pilot-api-comprehensive-test-${Date.now()}.json`;

// Test credentials
const TEST_PILOT = {
  phoneNumber: '9876543210' // Replace with actual pilot phone
};

// Test configuration
const TEST_CONFIG = {
  timeout: 30000,
  retryAttempts: 3,
  delayBetweenTests: 1500
};

let authToken = null;
let testResults = {
  timestamp: new Date().toISOString(),
  environment: 'production',
  baseUrl: PRODUCTION_BASE_URL,
  pilotEndpoints: {
    total: 13,
    tested: 0,
    passed: 0,
    failed: 0
  },
  results: []
};

// HTTPS request helper
function makeRequest(options, postData = null, retries = TEST_CONFIG.retryAttempts) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = data ? JSON.parse(data) : {};
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: jsonData,
            rawData: data
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: data,
            rawData: data,
            parseError: error.message
          });
        }
      });
    });

    req.on('error', (error) => {
      if (retries > 0) {
        console.log(`❌ Request failed, retrying... (${retries} attempts left)`);
        setTimeout(() => {
          makeRequest(options, postData, retries - 1)
            .then(resolve)
            .catch(reject);
        }, 2000);
      } else {
        reject(error);
      }
    });

    req.on('timeout', () => {
      req.destroy();
      if (retries > 0) {
        console.log(`⏰ Request timeout, retrying... (${retries} attempts left)`);
        setTimeout(() => {
          makeRequest(options, postData, retries - 1)
            .then(resolve)
            .catch(reject);
        }, 2000);
      } else {
        reject(new Error('Request timeout'));
      }
    });

    req.setTimeout(TEST_CONFIG.timeout);

    if (postData) {
      req.write(postData);
    }

    req.end();
  });
}

// Test helper function
async function runTest(testName, description, testFunction) {
  console.log(`\n🧪 Testing: ${testName}`);
  console.log(`📝 ${description}`);
  testResults.pilotEndpoints.tested++;

  try {
    const result = await testFunction();
    console.log(`✅ ${testName} - PASSED`);
    testResults.pilotEndpoints.passed++;
    testResults.results.push({
      endpoint: testName,
      description: description,
      status: 'PASSED',
      timestamp: new Date().toISOString(),
      result: result
    });
    return result;
  } catch (error) {
    console.log(`❌ ${testName} - FAILED: ${error.message}`);
    testResults.pilotEndpoints.failed++;
    testResults.results.push({
      endpoint: testName,
      description: description,
      status: 'FAILED',
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// 1. Pilot Registration Test
async function testPilotRegister() {
  const options = {
    hostname: new URL(PRODUCTION_BASE_URL).hostname,
    port: 443,
    path: '/api/pilot/register',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    }
  };

  const testData = {
    name: "Test Pilot Registration",
    phoneNumber: "9876543999", // Different number to avoid conflicts
    email: "testpilot@example.com",
    vehicleDetails: {
      registrationNumber: "TEST123",
      vehicleType: "truck",
      capacity: 5
    },
    drivingLicense: {
      number: "DL123456789",
      validTill: "2025-12-31"
    },
    emergencyContact: {
      name: "Emergency Contact",
      phoneNumber: "9876543998"
    }
  };

  const response = await makeRequest(options, JSON.stringify(testData));

  return {
    statusCode: response.statusCode,
    success: response.data.success,
    message: response.data.message,
    responseStructure: {
      hasSuccess: 'success' in response.data,
      hasMessage: 'message' in response.data,
      hasData: 'data' in response.data,
      dataFields: response.data.data ? Object.keys(response.data.data) : []
    },
    validationHandling: response.statusCode === 400 ? 'Has validation' : 'No validation errors'
  };
}

// 2. Pilot Login (OTP Request)
async function testPilotLoginOTPRequest() {
  const options = {
    hostname: new URL(PRODUCTION_BASE_URL).hostname,
    port: 443,
    path: '/api/pilot/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    }
  };

  const loginData = {
    phoneNumber: TEST_PILOT.phoneNumber
  };

  const response = await makeRequest(options, JSON.stringify(loginData));

  return {
    statusCode: response.statusCode,
    success: response.data.success,
    message: response.data.message,
    responseStructure: {
      hasOtpSent: response.data.data?.otpSent,
      hasOtpInResponse: 'otp' in (response.data.data || {}),
      dataFields: response.data.data ? Object.keys(response.data.data) : []
    },
    actualOTP: response.data.data?.otp // This will show in development
  };
}

// 3. Pilot Login (Complete with OTP)
async function testPilotLoginComplete() {
  // First request OTP
  const otpResponse = await testPilotLoginOTPRequest();
  
  if (!otpResponse.actualOTP) {
    throw new Error('No OTP returned - cannot complete login test');
  }

  const options = {
    hostname: new URL(PRODUCTION_BASE_URL).hostname,
    port: 443,
    path: '/api/pilot/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    }
  };

  const loginData = {
    phoneNumber: TEST_PILOT.phoneNumber,
    otp: otpResponse.actualOTP
  };

  const response = await makeRequest(options, JSON.stringify(loginData));

  if (response.statusCode === 200 && response.data.success && response.data.data?.token) {
    authToken = response.data.data.token;
  }

  return {
    statusCode: response.statusCode,
    success: response.data.success,
    message: response.data.message,
    responseStructure: {
      hasToken: 'token' in (response.data.data || {}),
      hasPilotData: 'pilot' in (response.data.data || {}),
      pilotFields: response.data.data?.pilot ? Object.keys(response.data.data.pilot) : [],
      tokenPreview: response.data.data?.token ? response.data.data.token.substring(0, 20) + '...' : null
    },
    authTokenSet: !!authToken
  };
}

// 4. Scan Order Test
async function testScanOrder() {
  if (!authToken) {
    throw new Error('No auth token available - login test must pass first');
  }

  const options = {
    hostname: new URL(PRODUCTION_BASE_URL).hostname,
    port: 443,
    path: '/api/pilot/scan-order',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  };

  const scanData = {
    orderId: 'AGK1755079698127M9I' // This will likely fail but shows the structure
  };

  const response = await makeRequest(options, JSON.stringify(scanData));

  return {
    statusCode: response.statusCode,
    success: response.data.success,
    message: response.data.message,
    responseStructure: {
      hasData: 'data' in response.data,
      hasOrder: response.data.data?.order ? true : false,
      orderFields: response.data.data?.order ? Object.keys(response.data.data.order) : [],
      hasCustomer: response.data.data?.order?.customer ? true : false,
      hasSupplier: response.data.data?.order?.supplier ? true : false,
      hasItems: response.data.data?.order?.items ? true : false
    },
    expectedBehavior: response.statusCode === 404 ? 'Order not found (expected for test order)' : 'Unexpected response'
  };
}

// 5. Accept Order Test
async function testAcceptOrder() {
  if (!authToken) {
    throw new Error('No auth token available');
  }

  const options = {
    hostname: new URL(PRODUCTION_BASE_URL).hostname,
    port: 443,
    path: '/api/pilot/accept-order',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  };

  const acceptData = {
    orderId: 'TEST_ORDER_001',
    pilotId: 'PIL000001' // From login response
  };

  const response = await makeRequest(options, JSON.stringify(acceptData));

  return {
    statusCode: response.statusCode,
    success: response.data.success,
    message: response.data.message,
    responseStructure: {
      hasData: 'data' in response.data,
      hasOrder: response.data.data?.order ? true : false,
      orderFields: response.data.data?.order ? Object.keys(response.data.data.order) : []
    }
  };
}

// 6. Start Journey Test
async function testStartJourney() {
  if (!authToken) {
    throw new Error('No auth token available');
  }

  const options = {
    hostname: new URL(PRODUCTION_BASE_URL).hostname,
    port: 443,
    path: '/api/pilot/start-journey',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  };

  const journeyData = {
    orderId: 'TEST_ORDER_001',
    currentLocation: {
      latitude: 20.2961,
      longitude: 85.8245
    }
  };

  const response = await makeRequest(options, JSON.stringify(journeyData));

  return {
    statusCode: response.statusCode,
    success: response.data.success,
    message: response.data.message,
    responseStructure: {
      hasData: 'data' in response.data,
      dataFields: response.data.data ? Object.keys(response.data.data) : []
    }
  };
}

// 7. Complete Delivery Test
async function testCompleteDelivery() {
  if (!authToken) {
    throw new Error('No auth token available');
  }

  const options = {
    hostname: new URL(PRODUCTION_BASE_URL).hostname,
    port: 443,
    path: '/api/pilot/complete-delivery',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  };

  const deliveryData = {
    orderId: 'TEST_ORDER_001',
    deliveryOTP: '123456',
    deliveryNotes: 'Test delivery completed',
    customerRating: 5
  };

  const response = await makeRequest(options, JSON.stringify(deliveryData));

  return {
    statusCode: response.statusCode,
    success: response.data.success,
    message: response.data.message,
    responseStructure: {
      hasData: 'data' in response.data,
      hasOrder: response.data.data?.order ? true : false,
      hasPilot: response.data.data?.pilot ? true : false,
      orderFields: response.data.data?.order ? Object.keys(response.data.data.order) : [],
      pilotFields: response.data.data?.pilot ? Object.keys(response.data.data.pilot) : []
    }
  };
}

// 8. Get Pilot Profile Test
async function testGetProfile() {
  if (!authToken) {
    throw new Error('No auth token available');
  }

  const options = {
    hostname: new URL(PRODUCTION_BASE_URL).hostname,
    port: 443,
    path: '/api/pilot/profile/PIL000001',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  };

  const response = await makeRequest(options);

  return {
    statusCode: response.statusCode,
    success: response.data.success,
    message: response.data.message,
    responseStructure: {
      hasData: 'data' in response.data,
      hasPilot: response.data.data?.pilot ? true : false,
      hasRecentDeliveries: response.data.data?.recentDeliveries ? true : false,
      hasStats: response.data.data?.stats ? true : false,
      pilotFields: response.data.data?.pilot ? Object.keys(response.data.data.pilot) : [],
      statsFields: response.data.data?.stats ? Object.keys(response.data.data.stats) : []
    }
  };
}

// 9. Update Location Test
async function testUpdateLocation() {
  if (!authToken) {
    throw new Error('No auth token available');
  }

  const options = {
    hostname: new URL(PRODUCTION_BASE_URL).hostname,
    port: 443,
    path: '/api/pilot/update-location',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  };

  const locationData = {
    latitude: 20.2961,
    longitude: 85.8245
  };

  const response = await makeRequest(options, JSON.stringify(locationData));

  return {
    statusCode: response.statusCode,
    success: response.data.success,
    message: response.data.message,
    responseStructure: {
      hasData: 'data' in response.data,
      hasLocation: response.data.data?.location ? true : false,
      locationFields: response.data.data?.location ? Object.keys(response.data.data.location) : []
    }
  };
}

// 10. Get Stats Test
async function testGetStats() {
  if (!authToken) {
    throw new Error('No auth token available');
  }

  const options = {
    hostname: new URL(PRODUCTION_BASE_URL).hostname,
    port: 443,
    path: '/api/pilot/stats',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  };

  const response = await makeRequest(options);

  return {
    statusCode: response.statusCode,
    success: response.data.success,
    message: response.data.message,
    responseStructure: {
      hasData: 'data' in response.data,
      hasPilot: response.data.data?.pilot ? true : false,
      hasStats: response.data.data?.stats ? true : false,
      hasRecentDeliveries: response.data.data?.recentDeliveries ? true : false,
      hasPerformance: response.data.data?.performance ? true : false,
      dataFields: response.data.data ? Object.keys(response.data.data) : []
    }
  };
}

// 11. Get Delivery History Test
async function testGetDeliveryHistory() {
  if (!authToken) {
    throw new Error('No auth token available');
  }

  const options = {
    hostname: new URL(PRODUCTION_BASE_URL).hostname,
    port: 443,
    path: '/api/pilot/delivery-history?page=1&limit=5',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  };

  const response = await makeRequest(options);

  return {
    statusCode: response.statusCode,
    success: response.data.success,
    message: response.data.message,
    responseStructure: {
      hasData: 'data' in response.data,
      hasDeliveries: response.data.data?.deliveries ? true : false,
      hasPagination: response.data.data?.pagination ? true : false,
      deliveriesCount: response.data.data?.deliveries?.length || 0,
      paginationFields: response.data.data?.pagination ? Object.keys(response.data.data.pagination) : []
    }
  };
}

// 12. Get Dashboard Stats Test
async function testGetDashboardStats() {
  if (!authToken) {
    throw new Error('No auth token available');
  }

  const options = {
    hostname: new URL(PRODUCTION_BASE_URL).hostname,
    port: 443,
    path: '/api/pilot/dashboard/stats',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  };

  const response = await makeRequest(options);

  return {
    statusCode: response.statusCode,
    success: response.data.success,
    message: response.data.message,
    responseStructure: {
      hasData: 'data' in response.data,
      hasTodayStats: response.data.data?.todayStats ? true : false,
      hasPilotInfo: response.data.data?.pilotInfo ? true : false,
      todayStatsFields: response.data.data?.todayStats ? Object.keys(response.data.data.todayStats) : [],
      pilotInfoFields: response.data.data?.pilotInfo ? Object.keys(response.data.data.pilotInfo) : []
    }
  };
}

// 13. Get App Config Test (Public endpoint)
async function testGetAppConfig() {
  const options = {
    hostname: new URL(PRODUCTION_BASE_URL).hostname,
    port: 443,
    path: '/api/pilot/app/config',
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const response = await makeRequest(options);

  return {
    statusCode: response.statusCode,
    success: response.data.success,
    message: response.data.message,
    responseStructure: {
      hasData: 'data' in response.data,
      hasSupportInfo: response.data.data?.supportInfo ? true : false,
      hasAppVersion: response.data.data?.appVersion ? true : false,
      hasFeatures: response.data.data?.features ? true : false,
      configFields: response.data.data ? Object.keys(response.data.data) : []
    }
  };
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Comprehensive Pilot APIs Test Suite');
  console.log(`📍 Testing against: ${PRODUCTION_BASE_URL}`);
  console.log(`⏰ Started at: ${new Date().toLocaleString()}`);
  console.log(`📱 Test Pilot Phone: ${TEST_PILOT.phoneNumber}`);
  console.log('=' .repeat(80));

  try {
    // Test all endpoints
    await runTest('Pilot Registration', 'POST /api/pilot/register - Register new pilot', testPilotRegister);
    await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.delayBetweenTests));

    await runTest('Pilot Login (OTP Request)', 'POST /api/pilot/login - Request OTP', testPilotLoginOTPRequest);
    await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.delayBetweenTests));

    await runTest('Pilot Login (Complete)', 'POST /api/pilot/login - Complete login with OTP', testPilotLoginComplete);
    await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.delayBetweenTests));

    await runTest('Scan Order', 'POST /api/pilot/scan-order - Scan QR code to get order details', testScanOrder);
    await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.delayBetweenTests));

    await runTest('Accept Order', 'POST /api/pilot/accept-order - Accept delivery assignment', testAcceptOrder);
    await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.delayBetweenTests));

    await runTest('Start Journey', 'POST /api/pilot/start-journey - Start delivery journey', testStartJourney);
    await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.delayBetweenTests));

    await runTest('Complete Delivery', 'POST /api/pilot/complete-delivery - Complete with OTP', testCompleteDelivery);
    await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.delayBetweenTests));

    await runTest('Get Profile', 'GET /api/pilot/profile/:id - Get pilot profile', testGetProfile);
    await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.delayBetweenTests));

    await runTest('Update Location', 'POST /api/pilot/update-location - Update GPS location', testUpdateLocation);
    await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.delayBetweenTests));

    await runTest('Get Stats', 'GET /api/pilot/stats - Get performance statistics', testGetStats);
    await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.delayBetweenTests));

    await runTest('Get Delivery History', 'GET /api/pilot/delivery-history - Get past deliveries', testGetDeliveryHistory);
    await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.delayBetweenTests));

    await runTest('Get Dashboard Stats', 'GET /api/pilot/dashboard/stats - Get dashboard data', testGetDashboardStats);
    await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.delayBetweenTests));

    await runTest('Get App Config', 'GET /api/pilot/app/config - Get app configuration', testGetAppConfig);

  } catch (error) {
    console.log(`\n💥 Test suite stopped due to critical error: ${error.message}`);
  }

  // Final results
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPREHENSIVE PILOT APIS TEST RESULTS');
  console.log('='.repeat(80));
  console.log(`📍 Environment: ${testResults.environment}`);
  console.log(`🌐 Base URL: ${testResults.baseUrl}`);
  console.log(`📅 Test Date: ${new Date().toLocaleString()}`);
  console.log(`🧪 Total Endpoints: ${testResults.pilotEndpoints.total}`);
  console.log(`📝 Tested: ${testResults.pilotEndpoints.tested}`);
  console.log(`✅ Passed: ${testResults.pilotEndpoints.passed}`);
  console.log(`❌ Failed: ${testResults.pilotEndpoints.failed}`);
  console.log(`📈 Success Rate: ${((testResults.pilotEndpoints.passed / testResults.pilotEndpoints.tested) * 100).toFixed(1)}%`);

  // Save results to file
  fs.writeFileSync(TEST_RESULTS_FILE, JSON.stringify(testResults, null, 2));
  console.log(`\n💾 Detailed results saved to: ${TEST_RESULTS_FILE}`);

  // Summary of what each API returns
  console.log('\n📋 API RESPONSE STRUCTURES DISCOVERED:');
  testResults.results.forEach(result => {
    if (result.status === 'PASSED') {
      console.log(`\n✅ ${result.endpoint}:`);
      console.log(`   📝 ${result.description}`);
      if (result.result.responseStructure) {
        console.log(`   📊 Structure:`, JSON.stringify(result.result.responseStructure, null, 4));
      }
    }
  });

  if (testResults.pilotEndpoints.failed > 0) {
    console.log('\n❌ Some tests failed. Check the results file for details.');
    process.exit(1);
  } else {
    console.log('\n🎉 All tests completed! Check results file for detailed response structures.');
    process.exit(0);
  }
}

// Handle errors
process.on('unhandledRejection', (reason, promise) => {
  console.log('❌ Unhandled Rejection:', reason);
  testResults.results.push({
    test: 'Unhandled Rejection',
    status: 'FAILED',
    timestamp: new Date().toISOString(),
    error: reason.toString()
  });
  
  fs.writeFileSync(TEST_RESULTS_FILE, JSON.stringify(testResults, null, 2));
  process.exit(1);
});

// Run the tests
runAllTests();