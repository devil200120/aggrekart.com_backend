// 🌐 PRODUCTION Pilot API Testing Script for Render.com
// Tests all pilot APIs on your live production server
const axios = require('axios');

// Production server configuration
const PRODUCTION_BASE_URL = 'https://aggrekart-com-backend.onrender.com/api/pilot';
const HEALTH_CHECK_URL = 'https://aggrekart-com-backend.onrender.com/api/health';

// Test configuration for production
const PROD_TEST_DATA = {
  pilot: {
    phoneNumber: "9876543210", // Use your actual pilot phone number
  },
  orderId: "AGK1756201614516ANT" // Update with actual production order ID
};

let PILOT_TOKEN = null;
let PILOT_ID = null;

// Test function with detailed response logging
async function testProdAPI(endpoint, method = 'GET', data = null, token = null, description = '') {
  try {
    console.log(`\n🧪 ${description || `${method} ${endpoint}`}`);
    console.log('='.repeat(60));
    
    const config = {
      method: method.toLowerCase(),
      url: `${PRODUCTION_BASE_URL}${endpoint}`,
      timeout: 30000, // Longer timeout for production
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AggrekartPilotApp/1.0.0'
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    console.log(`🌐 Request: ${method} ${PRODUCTION_BASE_URL}${endpoint}`);
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

// Health check for production server
async function checkProductionHealth() {
  console.log('🔍 Checking Production Server Health...\n');
  
  try {
    console.log(`Testing: ${HEALTH_CHECK_URL}`);
    
    const response = await axios.get(HEALTH_CHECK_URL, {
      timeout: 15000
    });
    
    console.log(`✅ SUCCESS: Production server is running`);
    console.log(`📊 Health: ${response.data.message}`);
    console.log(`🌍 Environment: ${response.data.environment}`);
    console.log(`⏰ Server Time: ${response.data.timestamp}\n`);
    
    return true;
    
  } catch (error) {
    console.log(`❌ Production server health check failed: ${error.message}`);
    console.log('💡 Possible issues:');
    console.log('   - Server is starting up (Render cold start)');
    console.log('   - Network connectivity issues');
    console.log('   - Server deployment issues\n');
    return false;
  }
}

// Comprehensive production pilot API tests
async function runProductionPilotTests() {
  console.log('🌐 PRODUCTION Pilot API Testing - Render.com');
  console.log('==============================================');
  console.log(`📞 Production Phone: ${PROD_TEST_DATA.pilot.phoneNumber}`);
  console.log(`📋 Test Order: ${PROD_TEST_DATA.orderId}`);
  console.log(`🌐 Base URL: ${PRODUCTION_BASE_URL}`);
  console.log('==============================================\n');
  
  // Check server health first
  const isHealthy = await checkProductionHealth();
  if (!isHealthy) {
    console.log('❌ Production server is not accessible. Aborting tests.');
    return;
  }
  
  const results = {};
  
  // Test 1: App Configuration
  console.log('1️⃣ APP CONFIGURATION');
  const configResult = await testProdAPI('/app/config', 'GET', null, null, 'Get Production App Configuration');
  results.appConfig = configResult;
  
  // Test 2: Support FAQs
  console.log('\n2️⃣ SUPPORT FAQs');
  const faqsResult = await testProdAPI('/support/faqs', 'GET', null, null, 'Get Production Support FAQs');
  results.faqs = faqsResult;
  
  // Test 3: Request Login OTP
  console.log('\n3️⃣ REQUEST LOGIN OTP');
  const otpResult = await testProdAPI('/login', 'POST', {
    phoneNumber: PROD_TEST_DATA.pilot.phoneNumber
  }, null, 'Request Production Login OTP');
  results.requestOTP = otpResult;
  
  // Test 4: Login with OTP (if OTP received)
  if (otpResult.success && otpResult.data?.data?.otp) {
    const otp = otpResult.data.data.otp;
    console.log(`\n📱 Received OTP: ${otp}`);
    
    console.log('\n4️⃣ LOGIN WITH OTP');
    const loginResult = await testProdAPI('/login', 'POST', {
      phoneNumber: PROD_TEST_DATA.pilot.phoneNumber,
      otp: otp
    }, null, 'Production Login with OTP');
    results.login = loginResult;
    
    if (loginResult.success && loginResult.data?.data) {
      PILOT_TOKEN = loginResult.data.data.token;
      PILOT_ID = loginResult.data.data.pilot?.pilotId;
      console.log(`\n🔑 Token received: ${PILOT_TOKEN?.substring(0, 30)}...`);
      console.log(`👤 Pilot ID: ${PILOT_ID}`);
    }
  } else {
    console.log('\n❌ No OTP received - cannot test authenticated endpoints');
    console.log('💡 This might be normal in production if OTP is sent via SMS only');
  }
  
  // Authenticated endpoint tests
  if (PILOT_TOKEN && PILOT_ID) {
    // Test 5: Get Profile
    console.log('\n5️⃣ GET PILOT PROFILE');
    const profileResult = await testProdAPI(`/profile/${PILOT_ID}`, 'GET', null, PILOT_TOKEN, 'Get Production Pilot Profile');
    results.profile = profileResult;
    
    // Test 6: Get Stats
    console.log('\n6️⃣ GET PILOT STATS');
    const statsResult = await testProdAPI('/stats', 'GET', null, PILOT_TOKEN, 'Get Production Pilot Statistics');
    results.stats = statsResult;
    
    // Test 7: Dashboard Stats
    console.log('\n7️⃣ DASHBOARD STATS');
    const dashboardResult = await testProdAPI('/dashboard/stats', 'GET', null, PILOT_TOKEN, 'Get Production Dashboard Statistics');
    results.dashboard = dashboardResult;
    
    // Test 8: Dashboard Notifications
    console.log('\n8️⃣ DASHBOARD NOTIFICATIONS');
    const notificationsResult = await testProdAPI('/dashboard/notifications', 'GET', null, PILOT_TOKEN, 'Get Production Dashboard Notifications');
    results.notifications = notificationsResult;
    
    // Test 9: Scan Order (Critical test)
    console.log('\n9️⃣ 🔍 SCAN ORDER - PRODUCTION ADDRESS TEST');
    const scanResult = await testProdAPI('/scan-order', 'POST', {
      orderId: PROD_TEST_DATA.orderId
    }, PILOT_TOKEN, '🚨 PRODUCTION ADDRESS FIELD TEST');
    results.scanOrder = scanResult;
    
    // Special analysis for production scan-order
    if (scanResult.success && scanResult.data?.data?.order) {
      const order = scanResult.data.data.order;
      console.log('\n🏠 PRODUCTION ADDRESS ANALYSIS:');
      console.log('='.repeat(50));
      console.log(`👤 Customer Name: ${order.customer?.name}`);
      console.log(`📱 Customer Phone: ${order.customer?.phoneNumber}`);
      console.log(`🏠 Customer Address: ${order.customer?.address}`);
      console.log(`🏢 Supplier: ${order.supplier?.companyName}`);
      console.log(`📞 Supplier Contact: ${order.supplier?.contactNumber}`);
      console.log(`🏭 Supplier Address: ${order.supplier?.address}`);
      console.log(`📍 Pickup Address: ${order.deliveryAddress?.pickup}`);
      console.log(`🚚 Drop Address: ${order.deliveryAddress?.drop}`);
      console.log(`💰 Total Amount: ₹${order.totalAmount}`);
      console.log(`📦 Order Status: ${order.status}`);
      
      // Check for address bugs
      const addressIssues = [];
      if (!order.customer?.address || order.customer.address === 'Address not available') {
        addressIssues.push('❌ Customer address missing');
      }
      if (!order.supplier?.address || order.supplier.address === 'Supplier address not available') {
        addressIssues.push('❌ Supplier address missing');
      }
      if (!order.deliveryAddress?.pickup || order.deliveryAddress.pickup === 'Supplier address not available') {
        addressIssues.push('❌ Pickup address missing');
      }
      if (!order.deliveryAddress?.drop || order.deliveryAddress.drop === 'Delivery address not available') {
        addressIssues.push('❌ Drop address missing');
      }
      if (!order.totalAmount || order.totalAmount === 0) {
        addressIssues.push('❌ Total amount is 0 or missing');
      }
      
      if (addressIssues.length > 0) {
        console.log('\n🚨 PRODUCTION ISSUES FOUND:');
        addressIssues.forEach(issue => console.log(`   ${issue}`));
      } else {
        console.log('\n✅ ALL ADDRESS FIELDS LOOK GOOD IN PRODUCTION!');
      }
      console.log('='.repeat(50));
    }
    
    // Test 10: Update Location
    console.log('\n🔟 UPDATE PILOT LOCATION');
    const locationResult = await testProdAPI('/update-location', 'POST', {
      latitude: 12.9716,
      longitude: 77.5946
    }, PILOT_TOKEN, 'Update Production Pilot Location');
    results.updateLocation = locationResult;
    
    // Test 11: Get Delivery History
    console.log('\n1️⃣1️⃣ GET DELIVERY HISTORY');
    const historyResult = await testProdAPI('/delivery-history?page=1&limit=5', 'GET', null, PILOT_TOKEN, 'Get Production Delivery History');
    results.deliveryHistory = historyResult;
    
    // Test 12: Submit Support Request
    console.log('\n1️⃣2️⃣ SUBMIT SUPPORT REQUEST');
    const supportResult = await testProdAPI('/support/contact', 'POST', {
      subject: 'Production API Test Support Request',
      message: 'This is a test support message from production API testing',
      priority: 'low'
    }, PILOT_TOKEN, 'Submit Production Support Request');
    results.supportContact = supportResult;
    
  } else {
    console.log('\n❌ Skipping authenticated endpoints - no token available');
    console.log('💡 In production, OTP is usually sent via SMS and not returned in API response');
  }
  
  // Final Production Summary
  console.log('\n🎉 PRODUCTION TESTING COMPLETE!');
  console.log('='.repeat(60));
  console.log('📊 PRODUCTION RESULTS SUMMARY:');
  
  const testResults = Object.entries(results);
  let successCount = 0;
  
  testResults.forEach(([testName, result]) => {
    const status = result.success ? '✅' : '❌';
    const statusCode = result.status || 'N/A';
    console.log(`${status} ${testName}: ${statusCode}`);
    if (result.success) successCount++;
  });
  
  console.log(`\n📈 Production Success Rate: ${successCount}/${testResults.length} (${Math.round(successCount/testResults.length*100)}%)`);
  console.log(`🌐 Production Server: ${PRODUCTION_BASE_URL}`);
  console.log(`🔑 Authentication: ${PILOT_TOKEN ? 'Success' : 'Failed/OTP not available'}`);
  console.log(`⏰ Test completed at: ${new Date().toLocaleString()}`);
  
  // Save production results
  const fs = require('fs');
  const resultsFile = `production-pilot-api-test-results-${Date.now()}.json`;
  fs.writeFileSync(resultsFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    server: PRODUCTION_BASE_URL,
    results: results,
    summary: {
      totalTests: testResults.length,
      successful: successCount,
      failed: testResults.length - successCount,
      successRate: Math.round(successCount/testResults.length*100)
    }
  }, null, 2));
  console.log(`💾 Production results saved to: ${resultsFile}`);
  
  return results;
}

// Error handling wrapper
async function main() {
  try {
    const results = await runProductionPilotTests();
    
    // Check if critical endpoints failed
    const criticalEndpoints = ['login', 'scanOrder'];
    const failedCritical = criticalEndpoints.filter(endpoint => 
      results[endpoint] && !results[endpoint].success
    );
    
    if (failedCritical.length > 0) {
      console.log(`\n⚠️  CRITICAL PRODUCTION ISSUES:`);
      failedCritical.forEach(endpoint => {
        console.log(`   - ${endpoint} endpoint failed`);
      });
    }
    
  } catch (error) {
    console.error('❌ Production test execution failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Check if axios is available
try {
  require.resolve('axios');
} catch (e) {
  console.log('❌ axios not found. Please install it:');
  console.log('npm install axios');
  process.exit(1);
}

// Run the comprehensive production tests
main();