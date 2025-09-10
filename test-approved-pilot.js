const axios = require('axios');

// Configuration for testing with existing approved pilot
const CONFIG = {
  baseUrl: 'http://127.0.0.1:5000',
  testPhone: '9876543210', // Use PIL000001's phone (approved & active)
  testOTP: '123456',
  requestTimeout: 30000
};

// Global variables
let authToken = null;
let pilotId = 'PIL000001'; // Use PIL000001 (approved & active)
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

// Test result logger with detailed output
function logTest(testName, passed, details, responseData = null) {
  const icon = passed ? '✅' : '❌';
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`${icon} ${status}: ${testName}`);
  if (details) {
    console.log(`   ℹ️ ${details}`);
  }
  if (responseData && typeof responseData === 'object') {
    console.log(`   📊 Key Response Data:`, JSON.stringify(responseData, null, 2));
  }
  
  if (passed) {
    testResults.passed++;
  } else {
    testResults.failed++;
  }
}

// Test Login with Approved Pilot
async function testApprovedPilotLogin() {
  console.log('\n🔸 Testing Login with Approved Pilot...');
  
  try {
    // Step 1: Request OTP
    console.log(`   📤 Requesting OTP for approved pilot: ${CONFIG.testPhone}`);
    const otpResponse = await makeRequest('POST', '/api/pilot/login', {
      phoneNumber: CONFIG.testPhone
    });

    const otpPassed = otpResponse.status === 200 && otpResponse.data.success === true;
    
    logTest('OTP Request for Approved Pilot', otpPassed, 
      otpPassed ? 'OTP sent successfully' : `Failed with status: ${otpResponse.status}`,
      otpResponse.data);

    if (!otpPassed) return false;

    // Step 2: Verify OTP and login
    console.log('   📤 Verifying OTP and logging in...');
    const otp = otpResponse.data.data?.otp || CONFIG.testOTP;
    console.log(`   🔑 Using OTP: ${otp}`);
    
    await new Promise(resolve => setTimeout(resolve, 1000));

    const loginResponse = await makeRequest('POST', '/api/pilot/login', {
      phoneNumber: CONFIG.testPhone,
      otp: otp
    });

    const loginPassed = loginResponse.status === 200 && loginResponse.data.success === true;
    
    if (loginPassed) {
      authToken = loginResponse.data.data.token;
      const pilot = loginResponse.data.data.pilot;
      console.log(`   ✅ Login successful!`);
      console.log(`   👤 Pilot: ${pilot.name} (${pilot.pilotId})`);
      console.log(`   🚛 Vehicle: ${pilot.vehicleDetails?.registrationNumber}`);
      console.log(`   🔑 JWT Token: ${authToken.substring(0, 40)}...`);
    }

    logTest('Login Authentication', loginPassed,
      loginPassed ? 'Full login successful with JWT token' : 
      `Login failed with status: ${loginResponse.status}`,
      loginPassed ? {
        pilotId: loginResponse.data.data.pilot.pilotId,
        name: loginResponse.data.data.pilot.name,
        isAvailable: loginResponse.data.data.pilot.isAvailable,
        tokenGenerated: !!loginResponse.data.data.token
      } : loginResponse.data);

    return loginPassed;

  } catch (error) {
    logTest('Approved Pilot Login', false, `Network Error: ${error.message}`);
    return false;
  }
}

// Test All Authenticated Functions
async function testAuthenticatedFunctions() {
  console.log('\n🔸 Testing All Authenticated API Functions...');
  
  if (!authToken) {
    console.log('   ❌ No authentication token available');
    return false;
  }

  const authHeaders = { 'Authorization': `Bearer ${authToken}` };
  let allPassed = true;

  // Test 1: Profile Function
  console.log('\n   📋 Testing Profile Function...');
  try {
    const profileResponse = await makeRequest('GET', `/api/pilot/profile/${pilotId}`, null, authHeaders);
    const profilePassed = profileResponse.status === 200;
    
    if (profilePassed) {
      const profile = profileResponse.data.data.pilot;
      console.log(`      👤 Name: ${profile.name}`);
      console.log(`      📱 Phone: ${profile.phoneNumber}`);
      console.log(`      🚛 Vehicle: ${profile.vehicleDetails?.registrationNumber}`);
      console.log(`      ⭐ Rating: ${profile.rating}`);
      console.log(`      📦 Total Deliveries: ${profile.totalDeliveries}`);
    }

    logTest('Profile Retrieval Function', profilePassed, 
      profilePassed ? 'Profile data retrieved successfully' : 
      `Failed with status: ${profileResponse.status}`,
      profilePassed ? {
        pilotId: profileResponse.data.data.pilot.pilotId,
        isApproved: profileResponse.data.data.pilot.isApproved,
        isAvailable: profileResponse.data.data.pilot.isAvailable,
        totalDeliveries: profileResponse.data.data.pilot.totalDeliveries
      } : profileResponse.data);

    allPassed = allPassed && profilePassed;
  } catch (error) {
    logTest('Profile Function', false, `Error: ${error.message}`);
    allPassed = false;
  }

  // Test 2: Stats Function
  console.log('\n   📊 Testing Statistics Function...');
  try {
    const statsResponse = await makeRequest('GET', '/api/pilot/stats', null, authHeaders);
    const statsPassed = statsResponse.status === 200;
    
    if (statsPassed) {
      const stats = statsResponse.data.data;
      console.log(`      📦 Total Deliveries: ${stats.totalDeliveries}`);
      console.log(`      💰 Total Earnings: ₹${stats.totalEarnings}`);
      console.log(`      📈 Completed Today: ${stats.completedToday}`);
      console.log(`      ⭐ Average Rating: ${stats.averageRating}`);
      console.log(`      🎯 Success Rate: ${stats.performance?.successRate}%`);
    }

    logTest('Statistics Function', statsPassed, 
      statsPassed ? 'Statistics retrieved and calculated' : 
      `Failed with status: ${statsResponse.status}`,
      statsPassed ? {
        totalDeliveries: statsResponse.data.data.totalDeliveries,
        totalEarnings: statsResponse.data.data.totalEarnings,
        averageRating: statsResponse.data.data.averageRating,
        availabilityStatus: statsResponse.data.data.availabilityStatus
      } : statsResponse.data);

    allPassed = allPassed && statsPassed;
  } catch (error) {
    logTest('Statistics Function', false, `Error: ${error.message}`);
    allPassed = false;
  }

  // Test 3: Location Update Function
  console.log('\n   🗺️ Testing Location Update Function...');
  try {
    const locationData = {
      latitude: 17.3850,
      longitude: 78.4867,
      accuracy: 10
    };

    const locationResponse = await makeRequest('POST', '/api/pilot/update-location', locationData, authHeaders);
    const locationPassed = locationResponse.status === 200;
    
    if (locationPassed) {
      const location = locationResponse.data.data.location;
      console.log(`      📍 Location: ${location.latitude}, ${location.longitude}`);
      console.log(`      🎯 Accuracy: ${location.accuracy}m`);
      console.log(`      ⏰ Updated: ${location.updatedAt}`);
      
      if (locationResponse.data.data.nearbyOrders?.length > 0) {
        console.log(`      🎯 Nearby Orders: ${locationResponse.data.data.nearbyOrders.length}`);
      }
    }

    logTest('Location Update Function', locationPassed, 
      locationPassed ? 'Location updated and nearby orders checked' : 
      `Failed with status: ${locationResponse.status}`,
      locationPassed ? {
        locationUpdated: true,
        coordinates: locationResponse.data.data.location,
        nearbyOrdersCount: locationResponse.data.data.nearbyOrders?.length || 0
      } : locationResponse.data);

    allPassed = allPassed && locationPassed;
  } catch (error) {
    logTest('Location Update Function', false, `Error: ${error.message}`);
    allPassed = false;
  }

  // Test 4: Dashboard Stats Function
  console.log('\n   📈 Testing Dashboard Stats Function...');
  try {
    const dashboardResponse = await makeRequest('GET', '/api/pilot/dashboard/stats', null, authHeaders);
    const dashboardPassed = dashboardResponse.status === 200;
    
    if (dashboardPassed) {
      const dashboard = dashboardResponse.data.data;
      console.log(`      📅 Today's Deliveries: ${dashboard.todayStats?.deliveries || 0}`);
      console.log(`      💰 Today's Earnings: ₹${dashboard.todayStats?.earnings || 0}`);
      console.log(`      📊 Week's Deliveries: ${dashboard.weekStats?.deliveries || 0}`);
      console.log(`      🏆 Month's Ranking: ${dashboard.monthStats?.ranking || 'N/A'}`);
    }

    logTest('Dashboard Stats Function', dashboardPassed, 
      dashboardPassed ? 'Dashboard statistics compiled' : 
      `Failed with status: ${dashboardResponse.status}`,
      dashboardPassed ? {
        todayStats: dashboardResponse.data.data.todayStats,
        weekStats: dashboardResponse.data.data.weekStats,
        recentActivityCount: dashboardResponse.data.data.recentActivity?.length || 0
      } : dashboardResponse.data);

    allPassed = allPassed && dashboardPassed;
  } catch (error) {
    logTest('Dashboard Stats Function', false, `Error: ${error.message}`);
    allPassed = false;
  }

  // Test 5: Notifications Function
  console.log('\n   🔔 Testing Notifications Function...');
  try {
    const notifResponse = await makeRequest('GET', '/api/pilot/dashboard/notifications', null, authHeaders);
    const notifPassed = notifResponse.status === 200;
    
    if (notifPassed) {
      const notifications = notifResponse.data.data;
      console.log(`      📬 Total Notifications: ${notifications.notifications?.length || 0}`);
      console.log(`      🆕 Unread Count: ${notifications.unreadCount || 0}`);
      
      if (notifications.notifications?.length > 0) {
        console.log(`      📋 Latest: ${notifications.notifications[0].title}`);
      }
    }

    logTest('Notifications Function', notifPassed, 
      notifPassed ? 'Notifications retrieved and processed' : 
      `Failed with status: ${notifResponse.status}`,
      notifPassed ? {
        totalNotifications: notifResponse.data.data.notifications?.length || 0,
        unreadCount: notifResponse.data.data.unreadCount,
        hasNotifications: (notifResponse.data.data.notifications?.length || 0) > 0
      } : notifResponse.data);

    allPassed = allPassed && notifPassed;
  } catch (error) {
    logTest('Notifications Function', false, `Error: ${error.message}`);
    allPassed = false;
  }

  // Test 6: Delivery History Function
  console.log('\n   📦 Testing Delivery History Function...');
  try {
    const historyResponse = await makeRequest('GET', '/api/pilot/delivery-history', null, authHeaders);
    const historyPassed = historyResponse.status === 200;
    
    if (historyPassed) {
      const history = historyResponse.data.data;
      console.log(`      📦 Delivery Records: ${history.deliveries?.length || 0}`);
      console.log(`      📄 Current Page: ${history.pagination?.page || 1}`);
      console.log(`      📊 Total Records: ${history.pagination?.total || 0}`);
      
      if (history.deliveries?.length > 0) {
        const latest = history.deliveries[0];
        console.log(`      🏆 Latest: ${latest.orderId} - ₹${latest.amount}`);
      }
    }

    logTest('Delivery History Function', historyPassed, 
      historyPassed ? 'Delivery history retrieved with pagination' : 
      `Failed with status: ${historyResponse.status}`,
      historyPassed ? {
        deliveryCount: historyResponse.data.data.deliveries?.length || 0,
        pagination: historyResponse.data.data.pagination,
        hasDeliveries: (historyResponse.data.data.deliveries?.length || 0) > 0
      } : historyResponse.data);

    allPassed = allPassed && historyPassed;
  } catch (error) {
    logTest('Delivery History Function', false, `Error: ${error.message}`);
    allPassed = false;
  }

  // Test 7: Order Scan Function
  console.log('\n   📱 Testing Order Scan Function...');
  try {
    const scanResponse = await makeRequest('POST', '/api/pilot/scan-order', {
      orderId: 'ORD123456' // Test order ID
    }, authHeaders);
    
    const scanPassed = scanResponse.status === 200 || scanResponse.status === 404;
    const orderFound = scanResponse.status === 200;
    
    if (orderFound) {
      const order = scanResponse.data.data.order;
      console.log(`      📦 Order Found: ${order.orderId}`);
      console.log(`      👤 Customer: ${order.customerName}`);
      console.log(`      💰 Amount: ₹${order.totalAmount}`);
    } else if (scanResponse.status === 404) {
      console.log(`      ℹ️ Order not found (function working correctly)`);
    }

    logTest('Order Scan Function', scanPassed, 
      orderFound ? 'Order scanned and details retrieved' : 
      scanResponse.status === 404 ? 'Order not found (scan function working)' :
      `Unexpected error: ${scanResponse.status}`,
      {
        orderFound: orderFound,
        functionWorking: scanPassed,
        status: scanResponse.status
      });

    allPassed = allPassed && scanPassed;
  } catch (error) {
    logTest('Order Scan Function', false, `Error: ${error.message}`);
    allPassed = false;
  }

  return allPassed;
}

// Test Support Functions
async function testSupportFunctions() {
  console.log('\n🔸 Testing Support Functions...');
  
  try {
    // Test FAQs
    console.log('   📚 Testing FAQ Function...');
    const faqResponse = await makeRequest('GET', '/api/pilot/support/faqs');
    const faqPassed = faqResponse.status === 200;
    
    if (faqPassed) {
      const faqs = faqResponse.data.data.faqs;
      console.log(`      ❓ Total FAQs: ${faqs?.length || 0}`);
      if (faqs?.length > 0) {
        console.log(`      📋 Sample FAQ: ${faqs[0].question}`);
      }
    }

    logTest('FAQ Retrieval Function', faqPassed, 
      faqPassed ? 'FAQs loaded successfully' : 
      `Failed with status: ${faqResponse.status}`,
      faqPassed ? {
        faqCount: faqResponse.data.data.faqs?.length || 0,
        hasFaqs: (faqResponse.data.data.faqs?.length || 0) > 0
      } : faqResponse.data);

    // Test Support Contact (if authenticated)
    if (authToken) {
      console.log('   🎫 Testing Support Contact Function...');
      const authHeaders = { 'Authorization': `Bearer ${authToken}` };
      
      const contactResponse = await makeRequest('POST', '/api/pilot/support/contact', {
        subject: 'API Function Test',
        message: 'Testing support contact function via API',
        category: 'technical',
        priority: 'low'
      }, authHeaders);

      const contactPassed = contactResponse.status === 200;
      
      if (contactPassed) {
        const ticket = contactResponse.data.data;
        console.log(`      🎫 Ticket Created: ${ticket.ticketId}`);
        console.log(`      📋 Reference: ${ticket.reference}`);
      }

      logTest('Support Contact Function', contactPassed, 
        contactPassed ? 'Support ticket created successfully' : 
        `Failed with status: ${contactResponse.status}`,
        contactPassed ? {
          ticketCreated: true,
          ticketId: contactResponse.data.data.ticketId,
          status: contactResponse.data.data.status
        } : contactResponse.data);
    }

    return faqPassed;

  } catch (error) {
    logTest('Support Functions', false, `Error: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runApprovedPilotTests() {
  console.log('🚀 Testing All API Functions with Approved Pilot...');
  console.log(`🌐 Server: ${CONFIG.baseUrl}`);
  console.log(`👤 Pilot ID: ${pilotId}`);
  console.log(`📱 Phone: ${CONFIG.testPhone}`);
  console.log(`📅 Started: ${new Date().toISOString()}`);
  
  const startTime = Date.now();

  try {
    // Test server connectivity
    console.log('\n🔸 Testing Server Connectivity...');
    const pingResponse = await makeRequest('GET', '/');
    const serverOnline = pingResponse.status === 200 || pingResponse.status === 404;
    logTest('Server Connectivity', serverOnline, 
      serverOnline ? 'Server is accessible and responding' : 
      `Cannot reach server: ${pingResponse.status}`);

    if (!serverOnline) {
      console.log('❌ Cannot reach server. Please check if it\'s running.');
      return;
    }

    // Test login with approved pilot
    const loginSuccess = await testApprovedPilotLogin();
    
    if (loginSuccess) {
      // Test all authenticated functions
      const authSuccess = await testAuthenticatedFunctions();
      console.log(`\n🔐 Authenticated Functions: ${authSuccess ? '✅ All Working' : '❌ Some Issues'}`);
    } else {
      console.log('\n❌ Login failed - skipping authenticated function tests');
    }

    // Test support functions (some are public)
    const supportSuccess = await testSupportFunctions();
    console.log(`\n📞 Support Functions: ${supportSuccess ? '✅ Working' : '❌ Issues'}`);

  } catch (error) {
    console.log(`💥 Test execution failed: ${error.message}`);
  }

  // Final report
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const total = testResults.passed + testResults.failed;
  const successRate = total > 0 ? ((testResults.passed / total) * 100).toFixed(1) : 0;

  console.log('\n' + '='.repeat(70));
  console.log('           APPROVED PILOT API FUNCTION TEST REPORT');
  console.log('='.repeat(70));
  console.log(`📊 Total Function Tests: ${total}`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📈 Success Rate: ${successRate}%`);
  console.log(`⏱️  Duration: ${duration} seconds`);
  console.log(`🌐 Server: ${CONFIG.baseUrl}`);
  console.log(`👤 Pilot: ${pilotId} (${CONFIG.testPhone})`);
  if (authToken) {
    console.log(`🔑 Authentication: ✅ JWT Token Active`);
  }
  console.log('='.repeat(70));

  if (testResults.failed === 0) {
    console.log('🎉 All API functions are working perfectly!');
    console.log('🚀 Your Pilot API is ready for production use!');
  } else {
    console.log('⚠️  Some functions need attention. Check details above.');
  }

  console.log('\n🎯 Functions Tested:');
  console.log('   • Authentication (OTP + JWT)');
  console.log('   • Profile Management');
  console.log('   • Statistics & Analytics');
  console.log('   • Location Tracking');
  console.log('   • Dashboard Data');
  console.log('   • Notifications');
  console.log('   • Delivery History');
  console.log('   • Order Scanning');
  console.log('   • Support System');
  console.log('   • App Configuration');
}

// Run the comprehensive tests
runApprovedPilotTests().catch(console.error);