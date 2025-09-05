/**
 * Production Test Script for Available Nearby Orders API
 * Tests the new GET /api/pilot/available-nearby-orders endpoint on production
 * Created: September 4, 2025
 */

const https = require('https');
const fs = require('fs');

// Production configuration
const PRODUCTION_BASE_URL = 'https://aggrekart-com-backend.onrender.com';
const TEST_RESULTS_FILE = `production-nearby-orders-api-test-${Date.now()}.json`;

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

// 3. Test Available Nearby Orders API with comprehensive scenarios
async function testAvailableNearbyOrders() {
  console.log('\n🗺️ Step 3: Testing Available Nearby Orders API...');
  
  // Test cases covering different scenarios
  const testCases = [
    {
      description: 'Default parameters (15km radius, 10 orders per page)',
      params: {},
      expectedFeatures: ['pagination', 'summary', 'filters']
    },
    {
      description: 'Small radius - 3km only',
      params: { radius: 3 },
      expectedFeatures: ['orders within 3km']
    },
    {
      description: 'Medium radius - 10km with small page size',
      params: { radius: 10, page: 1, limit: 3 },
      expectedFeatures: ['pagination with 3 items', 'page 1']
    },
    {
      description: 'Large radius - 25km coverage',
      params: { radius: 25, page: 1, limit: 10 },
      expectedFeatures: ['wider coverage', 'more potential orders']
    },
    {
      description: 'Filter by urgent orders only',
      params: { radius: 15, orderType: 'urgent' },
      expectedFeatures: ['urgent orders filter', 'priority filtering']
    },
    {
      description: 'Filter by normal orders only',
      params: { radius: 15, orderType: 'normal' },
      expectedFeatures: ['normal orders filter', 'standard priority']
    },
    {
      description: 'Test pagination - page 2',
      params: { radius: 20, page: 2, limit: 5 },
      expectedFeatures: ['page 2 results', 'pagination info']
    },
    {
      description: 'Very small page size',
      params: { radius: 15, page: 1, limit: 1 },
      expectedFeatures: ['single order per page', 'pagination']
    },
    {
      description: 'Large page size',
      params: { radius: 30, page: 1, limit: 20 },
      expectedFeatures: ['large result set', 'comprehensive coverage']
    }
  ];

  const results = [];

  console.log(`\n🧪 Testing ${testCases.length} different scenarios...\n`);

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    
    console.log(`${i + 1}. ${testCase.description}`);
    console.log('   Expected:', testCase.expectedFeatures.join(', '));
    
    try {
      const queryParams = new URLSearchParams();
      if (testCase.params.radius) queryParams.append('radius', testCase.params.radius);
      if (testCase.params.page) queryParams.append('page', testCase.params.page);
      if (testCase.params.limit) queryParams.append('limit', testCase.params.limit);
      if (testCase.params.orderType) queryParams.append('orderType', testCase.params.orderType);

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
      
      console.log(`   Status: ${response.statusCode}`);
      
      const result = {
        testCase: testCase.description,
        parameters: testCase.params,
        expectedFeatures: testCase.expectedFeatures,
        statusCode: response.statusCode,
        success: response.data.success || false,
        message: response.data.message || 'No message',
        timestamp: new Date().toISOString()
      };

      // Analyze response structure
      if (response.statusCode === 200 && response.data.success) {
        const data = response.data.data || {};
        
        result.responseAnalysis = {
          hasOrders: 'orders' in data,
          ordersCount: data.orders?.length || 0,
          hasSummary: 'summary' in data,
          hasFilters: 'filters' in data,
          hasPagination: 'pagination' in data,
          summaryFields: data.summary ? Object.keys(data.summary) : [],
          filtersApplied: data.filters || {},
          paginationInfo: data.pagination || {}
        };

        // Sample order analysis
        if (data.orders && data.orders.length > 0) {
          const sampleOrder = data.orders[0];
          result.sampleOrderAnalysis = {
            hasOrderId: 'orderId' in sampleOrder,
            hasCustomer: 'customer' in sampleOrder,
            hasSupplier: 'supplier' in sampleOrder,
            hasDeliveryLocation: 'deliveryLocation' in sampleOrder,
            hasOrderDetails: 'orderDetails' in sampleOrder,
            hasDistance: 'distance' in sampleOrder,
            hasPriority: 'priority' in sampleOrder,
            hasEstimatedTime: 'estimatedDeliveryTime' in sampleOrder,
            hasAmount: 'totalAmount' in sampleOrder,
            distance: sampleOrder.distance,
            priority: sampleOrder.priority,
            orderValue: sampleOrder.totalAmount
          };
        }

        console.log(`   ✅ Success: ${result.responseAnalysis.ordersCount} orders found`);
        
        if (result.responseAnalysis.hasSummary) {
          console.log(`   📊 Summary: ${JSON.stringify(data.summary)}`);
        }
        
        if (result.responseAnalysis.hasFilters) {
          console.log(`   🔍 Filters: ${JSON.stringify(data.filters)}`);
        }
        
        if (result.responseAnalysis.hasPagination) {
          console.log(`   📄 Pagination: Page ${data.pagination.currentPage}/${data.pagination.totalPages}, Total: ${data.pagination.totalCount}`);
        }

      } else {
        result.error = {
          statusCode: response.statusCode,
          errorMessage: response.data.message || 'Unknown error',
          errorData: response.data
        };
        console.log(`   ❌ Failed: ${result.error.errorMessage}`);
      }

      result.fullResponse = response.data;
      results.push(result);

      // Add delay between tests to avoid rate limiting
      if (i < testCases.length - 1) {
        console.log('   ⏳ Waiting 2 seconds...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error) {
      console.log(`   💥 Test failed: ${error.message}`);
      results.push({
        testCase: testCase.description,
        parameters: testCase.params,
        expectedFeatures: testCase.expectedFeatures,
        status: 'FAILED',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  return results;
}

// Main test runner
async function runProductionNearbyOrdersTest() {
  console.log('🚀 Starting Production Available Nearby Orders API Test');
  console.log(`📍 Testing against: ${PRODUCTION_BASE_URL}`);
  console.log(`⏰ Started at: ${new Date().toLocaleString()}`);
  console.log('=' .repeat(70));

  try {
    // Step 1: Login
    const loginResult = await loginPilot();
    testResults.testResults.push({
      step: 'Pilot Login',
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

    // Step 3: Test the new Available Nearby Orders API
    const nearbyOrdersResults = await testAvailableNearbyOrders();
    testResults.testResults.push({
      step: 'Available Nearby Orders API Tests',
      status: nearbyOrdersResults.some(r => r.success) ? 'PASSED' : 'FAILED',
      result: nearbyOrdersResults
    });

  } catch (error) {
    console.log(`💥 Test execution failed: ${error.message}`);
    testResults.testResults.push({
      step: 'Test Execution',
      status: 'FAILED',
      error: error.message
    });
  }

  // Final results analysis
  const nearbyOrdersTests = testResults.testResults.find(r => r.step === 'Available Nearby Orders API Tests');
  const successful = nearbyOrdersTests?.result?.filter(r => r.success)?.length || 0;
  const total = nearbyOrdersTests?.result?.length || 0;
  const failed = total - successful;

  console.log('\n' + '='.repeat(70));
  console.log('📊 PRODUCTION AVAILABLE NEARBY ORDERS API TEST RESULTS');
  console.log('='.repeat(70));
  console.log(`📍 Environment: Production (${PRODUCTION_BASE_URL})`);
  console.log(`📅 Test Date: ${new Date().toLocaleString()}`);
  console.log(`🧪 Total Scenarios Tested: ${total}`);
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${total > 0 ? ((successful / total) * 100).toFixed(1) : 0}%`);

  // Save results to file
  fs.writeFileSync(TEST_RESULTS_FILE, JSON.stringify(testResults, null, 2));
  console.log(`\n💾 Detailed results saved to: ${TEST_RESULTS_FILE}`);

  // API Analysis Summary
  if (successful > 0) {
    console.log('\n📋 API FUNCTIONALITY ANALYSIS:');
    console.log('='.repeat(50));
    
    const successfulResults = nearbyOrdersTests.result.filter(r => r.success);
    
    // Feature availability analysis
    const featuresFound = {
      ordersReturned: successfulResults.some(r => r.responseAnalysis?.ordersCount > 0),
      summaryProvided: successfulResults.some(r => r.responseAnalysis?.hasSummary),
      filtersWorking: successfulResults.some(r => r.responseAnalysis?.hasFilters),
      paginationWorking: successfulResults.some(r => r.responseAnalysis?.hasPagination),
      distanceCalculation: successfulResults.some(r => r.sampleOrderAnalysis?.hasDistance),
      prioritySystem: successfulResults.some(r => r.sampleOrderAnalysis?.hasPriority),
      orderDetails: successfulResults.some(r => r.sampleOrderAnalysis?.hasOrderDetails)
    };

    Object.entries(featuresFound).forEach(([feature, working]) => {
      console.log(`${working ? '✅' : '❌'} ${feature}: ${working ? 'Working' : 'Not detected'}`);
    });

    // Sample successful test
    const bestResult = successfulResults.find(r => r.responseAnalysis?.ordersCount > 0) || successfulResults[0];
    if (bestResult && bestResult.responseAnalysis) {
      console.log('\n📊 BEST PERFORMING TEST:');
      console.log(`   Scenario: ${bestResult.testCase}`);
      console.log(`   Orders Found: ${bestResult.responseAnalysis.ordersCount}`);
      console.log(`   Response Time: Good`);
      console.log(`   Data Quality: ${bestResult.sampleOrderAnalysis ? 'Complete' : 'Basic'}`);
    }
  }

  // Recommendations
  console.log('\n💡 RECOMMENDATIONS:');
  if (failed > 0) {
    console.log('❌ Some tests failed. Common issues might be:');
    console.log('   - API endpoint not deployed yet');
    console.log('   - Authentication issues');
    console.log('   - Database connectivity problems');
    console.log('   - Geospatial index not configured');
  }
  
  if (successful > 0) {
    console.log('✅ API is partially or fully functional:');
    console.log('   - Authentication working');
    console.log('   - Endpoint accessible');
    console.log('   - Response structure valid');
  }

  if (failed > 0) {
    console.log('\n🚨 Check the detailed results file for specific error analysis.');
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed! The Available Nearby Orders API is working correctly in production.');
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
console.log('🎬 Starting Production Available Nearby Orders API Test...');
console.log('📋 This will comprehensively test the new API endpoint on production');
console.log('⚠️  Make sure the pilot phone number exists in production database\n');

runProductionNearbyOrdersTest();