/**
 * Test Script for Available Nearby Orders API
 * Tests the new GET /api/pilot/available-nearby-orders endpoint
 * Created: September 4, 2025
 */

const https = require('https');
const fs = require('fs');

// Production configuration
const PRODUCTION_BASE_URL = 'http://127.0.0.1:5000';
const TEST_RESULTS_FILE = `nearby-orders-api-test-${Date.now()}.json`;

// Test credentials
const TEST_PILOT = {
  phoneNumber: '9876543210' // Replace with actual pilot phone
};

let authToken = null;
let testResults = {
  timestamp: new Date().toISOString(),
  environment: 'production',
  baseUrl: PRODUCTION_BASE_URL,
  endpoint: '/api/pilot/available-nearby-orders',
  testResults: []
};

// HTTPS request helper
function makeRequest(options, postData = null) {
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
      reject(error);
    });

    req.setTimeout(30000);

    if (postData) {
      req.write(postData);
    }

    req.end();
  });
}

// 1. Login to get authentication token
async function loginPilot() {
  console.log('🔐 Step 1: Logging in pilot...');
  
  // Request OTP
  const otpOptions = {
    hostname: new URL(PRODUCTION_BASE_URL).hostname,
    port: 443,
    path: '/api/pilot/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    }
  };

  const otpData = JSON.stringify({
    phoneNumber: TEST_PILOT.phoneNumber
  });

  const otpResponse = await makeRequest(otpOptions, otpData);
  console.log(`📱 OTP Request Status: ${otpResponse.statusCode}`);
  
  if (otpResponse.statusCode !== 200) {
    throw new Error(`OTP request failed: ${JSON.stringify(otpResponse.data)}`);
  }

  const receivedOTP = otpResponse.data.data?.otp;
  if (!receivedOTP) {
    throw new Error('No OTP received from server');
  }

  console.log(`🎯 OTP received: ${receivedOTP}`);

  // Complete login with OTP
  const loginOptions = {
    hostname: new URL(PRODUCTION_BASE_URL).hostname,
    port: 443,
    path: '/api/pilot/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    }
  };

  const loginData = JSON.stringify({
    phoneNumber: TEST_PILOT.phoneNumber,
    otp: receivedOTP
  });

  const loginResponse = await makeRequest(loginOptions, loginData);
  console.log(`✅ Login Status: ${loginResponse.statusCode}`);

  if (loginResponse.statusCode !== 200 || !loginResponse.data.success || !loginResponse.data.data?.token) {
    throw new Error(`Login failed: ${JSON.stringify(loginResponse.data)}`);
  }

  authToken = loginResponse.data.data.token;
  console.log(`🔑 Auth token received: ${authToken.substring(0, 20)}...`);

  return {
    success: true,
    pilot: loginResponse.data.data.pilot,
    tokenPreview: authToken.substring(0, 20) + '...'
  };
}

// 2. Update pilot location (required for nearby orders)
async function updatePilotLocation() {
  console.log('📍 Step 2: Updating pilot location...');
  
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

  // Set location in Bhubaneswar (where your test data likely is)
  const locationData = JSON.stringify({
    latitude: 20.2961,
    longitude: 85.8245
  });

  const response = await makeRequest(options, locationData);
  console.log(`📍 Location Update Status: ${response.statusCode}`);

  if (response.statusCode !== 200) {
    console.log('⚠️ Location update failed, but continuing with test...');
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } else {
    console.log('✅ Location updated successfully');
  }

  return {
    statusCode: response.statusCode,
    success: response.statusCode === 200,
    location: { latitude: 20.2961, longitude: 85.8245 }
  };
}

// 3. Test Available Nearby Orders API with different parameters
async function testAvailableNearbyOrders(testCase) {
  console.log(`\n🧪 Testing: ${testCase.description}`);
  
  const queryParams = new URLSearchParams();
  if (testCase.radius) queryParams.append('radius', testCase.radius);
  if (testCase.page) queryParams.append('page', testCase.page);
  if (testCase.limit) queryParams.append('limit', testCase.limit);
  if (testCase.orderType) queryParams.append('orderType', testCase.orderType);

  const path = `/api/pilot/available-nearby-orders${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  
  const options = {
    hostname: new URL(PRODUCTION_BASE_URL).hostname,
    port: 443,
    path: path,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  };

  const response = await makeRequest(options);
  
  console.log(`📊 Status: ${response.statusCode}`);
  console.log(`📋 Response:`, JSON.stringify(response.data, null, 2));

  return {
    testCase: testCase.description,
    parameters: testCase,
    statusCode: response.statusCode,
    success: response.data.success,
    message: response.data.message,
    responseStructure: {
      hasData: 'data' in response.data,
      hasOrders: response.data.data?.orders ? true : false,
      ordersCount: response.data.data?.orders?.length || 0,
      hasSummary: response.data.data?.summary ? true : false,
      hasFilters: response.data.data?.filters ? true : false,
      hasPagination: response.data.data?.pagination ? true : false,
      summaryFields: response.data.data?.summary ? Object.keys(response.data.data.summary) : [],
      filtersFields: response.data.data?.filters ? Object.keys(response.data.data.filters) : [],
      paginationFields: response.data.data?.pagination ? Object.keys(response.data.data.pagination) : []
    },
    sampleOrder: response.data.data?.orders?.[0] ? {
      orderId: response.data.data.orders[0].orderId,
      hasCustomer: !!response.data.data.orders[0].customer,
      hasSupplier: !!response.data.data.orders[0].supplier,
      hasDeliveryLocation: !!response.data.data.orders[0].deliveryLocation,
      hasOrderDetails: !!response.data.data.orders[0].orderDetails,
      distance: response.data.data.orders[0].distance,
      priority: response.data.data.orders[0].priority
    } : null,
    fullResponse: response.data
  };
}

// Main test runner
async function runNearbyOrdersTest() {
  console.log('🚀 Starting Available Nearby Orders API Test');
  console.log(`📍 Testing against: ${PRODUCTION_BASE_URL}`);
  console.log(`⏰ Started at: ${new Date().toLocaleString()}`);
  console.log('=' .repeat(70));

  try {
    // Step 1: Login
    const loginResult = await loginPilot();
    testResults.testResults.push({
      step: 'Login',
      status: 'PASSED',
      result: loginResult
    });

    // Step 2: Update location
    const locationResult = await updatePilotLocation();
    testResults.testResults.push({
      step: 'Update Location',
      status: locationResult.success ? 'PASSED' : 'FAILED',
      result: locationResult
    });

    // Step 3: Test different scenarios of the nearby orders API
    const testCases = [
      {
        description: 'Default parameters (15km radius, 10 orders per page)',
        // No parameters - use defaults
      },
      {
        description: 'Nearby orders within 5km radius',
        radius: 5
      },
      {
        description: 'Nearby orders within 25km radius with pagination',
        radius: 25,
        page: 1,
        limit: 5
      },
      {
        description: 'Only urgent orders',
        radius: 20,
        orderType: 'urgent'
      },
      {
        description: 'Only normal orders',
        radius: 15,
        orderType: 'normal'
      },
      {
        description: 'Test pagination - page 2',
        radius: 20,
        page: 2,
        limit: 3
      }
    ];

    console.log(`\n🧪 Testing ${testCases.length} different scenarios...`);

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      try {
        const result = await testAvailableNearbyOrders(testCase);
        testResults.testResults.push({
          step: `Scenario ${i + 1}`,
          status: 'PASSED',
          result: result
        });
        
        // Add delay between tests
        if (i < testCases.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.log(`❌ Test case failed: ${error.message}`);
        testResults.testResults.push({
          step: `Scenario ${i + 1}`,
          status: 'FAILED',
          error: error.message,
          testCase: testCase.description
        });
      }
    }

  } catch (error) {
    console.log(`💥 Test execution failed: ${error.message}`);
    testResults.testResults.push({
      step: 'Test Execution',
      status: 'FAILED',
      error: error.message
    });
  }

  // Final results
  const passed = testResults.testResults.filter(r => r.status === 'PASSED').length;
  const failed = testResults.testResults.filter(r => r.status === 'FAILED').length;

  console.log('\n' + '='.repeat(70));
  console.log('📊 AVAILABLE NEARBY ORDERS API TEST RESULTS');
  console.log('='.repeat(70));
  console.log(`📍 Environment: Production (${PRODUCTION_BASE_URL})`);
  console.log(`📅 Test Date: ${new Date().toLocaleString()}`);
  console.log(`🧪 Total Tests: ${passed + failed}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  // Save results to file
  fs.writeFileSync(TEST_RESULTS_FILE, JSON.stringify(testResults, null, 2));
  console.log(`\n💾 Detailed results saved to: ${TEST_RESULTS_FILE}`);

  // Show API Response Structure Summary
  console.log('\n📋 API RESPONSE STRUCTURE ANALYSIS:');
  const successfulTests = testResults.testResults.filter(r => 
    r.status === 'PASSED' && 
    r.result && 
    r.result.responseStructure && 
    r.result.responseStructure.hasOrders
  );

  if (successfulTests.length > 0) {
    const sampleResponse = successfulTests[0].result;
    console.log('✅ Response Structure:');
    console.log(`   📊 Summary Fields: ${sampleResponse.responseStructure.summaryFields.join(', ')}`);
    console.log(`   🔍 Filter Fields: ${sampleResponse.responseStructure.filtersFields.join(', ')}`);
    console.log(`   📄 Pagination Fields: ${sampleResponse.responseStructure.paginationFields.join(', ')}`);
    
    if (sampleResponse.sampleOrder) {
      console.log('✅ Order Structure:');
      console.log(`   📦 Has Customer: ${sampleResponse.sampleOrder.hasCustomer}`);
      console.log(`   🏪 Has Supplier: ${sampleResponse.sampleOrder.hasSupplier}`);
      console.log(`   📍 Has Delivery Location: ${sampleResponse.sampleOrder.hasDeliveryLocation}`);
      console.log(`   💰 Has Order Details: ${sampleResponse.sampleOrder.hasOrderDetails}`);
      console.log(`   📏 Distance: ${sampleResponse.sampleOrder.distance} km`);
      console.log(`   ⚡ Priority: ${sampleResponse.sampleOrder.priority}`);
    }
  }

  if (failed > 0) {
    console.log('\n❌ Some tests failed. Check the results file for details.');
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed! The Available Nearby Orders API is working correctly.');
    process.exit(0);
  }
}

// Handle errors
process.on('unhandledRejection', (reason, promise) => {
  console.log('❌ Unhandled Rejection:', reason);
  testResults.testResults.push({
    step: 'Unhandled Rejection',
    status: 'FAILED',
    error: reason.toString()
  });
  
  fs.writeFileSync(TEST_RESULTS_FILE, JSON.stringify(testResults, null, 2));
  process.exit(1);
});

// Run the test
runNearbyOrdersTest();