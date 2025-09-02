const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const BASE_URL = 'http://127.0.0.1:5000/api';

// Test Results Storage
let testResults = {
  passed: [],
  failed: [],
  warnings: []
};

// Tokens for authenticated requests
let tokens = {
  customer: null,
  supplier: null,
  admin: null,
  pilot: null
};

// Test Data
const testData = {
  user: {
    name: 'Test User',
    email: `testuser_${Date.now()}@test.com`,
    password: 'password123',
    phoneNumber: '9876543210'
  },
  supplier: {
    name: 'Test Supplier',
    email: `supplier_${Date.now()}@test.com`,
    password: 'password123',
    phoneNumber: '9876543211'
  },
  pilot: {
    name: 'Test Pilot',
    phoneNumber: '9876543212',
    email: `pilot_${Date.now()}@test.com`,
    vehicleDetails: {
      vehicleType: 'truck',
      registrationNumber: 'KA01AB1234',
      capacity: 5
    },
    drivingLicense: {
      number: 'DL123456789',
      validTill: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    },
    emergencyContact: {
      name: 'Emergency Contact',
      phoneNumber: '9876543213'
    }
  }
};

// Helper Functions
const logTest = (testName, status, message = '', data = null) => {
  const timestamp = new Date().toISOString();
  const result = { testName, status, message, timestamp, data };
  
  if (status === 'PASS') {
    console.log(`✅ ${testName}: ${message}`);
    testResults.passed.push(result);
  } else if (status === 'FAIL') {
    console.log(`❌ ${testName}: ${message}`);
    testResults.failed.push(result);
  } else if (status === 'WARN') {
    console.log(`⚠️  ${testName}: ${message}`);
    testResults.warnings.push(result);
  }
};

const makeRequest = async (method, url, data = null, headers = {}) => {
  try {
    const config = {
      method,
      url: `${BASE_URL}${url}`,
      headers: { 'Content-Type': 'application/json', ...headers },
      timeout: 10000
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message,
      status: error.response?.status || 500
    };
  }
};

// Test Categories

// 1. Health & Connectivity Tests
const testHealthAndConnectivity = async () => {
  console.log('\n🏥 === HEALTH & CONNECTIVITY TESTS ===\n');
  
  // Test server health
  const healthTest = await makeRequest('GET', '/health');
  if (healthTest.success) {
    logTest('Server Health Check', 'PASS', 'Server is running');
  } else {
    logTest('Server Health Check', 'FAIL', 'Server is not accessible');
    return false;
  }
  
  // Test API health
  const apiHealthTest = await makeRequest('GET', '/api/health');
  if (apiHealthTest.success) {
    logTest('API Health Check', 'PASS', 'API endpoints are accessible');
  } else {
    logTest('API Health Check', 'FAIL', 'API endpoints are not accessible');
  }
  
  // Test CORS
  const corsTest = await makeRequest('GET', '/test-cors');
  if (corsTest.success) {
    logTest('CORS Configuration', 'PASS', 'CORS is properly configured');
  } else {
    logTest('CORS Configuration', 'WARN', 'CORS test endpoint not found');
  }
  
  return true;
};

// 2. Authentication API Tests
const testAuthenticationAPIs = async () => {
  console.log('\n🔐 === AUTHENTICATION API TESTS ===\n');
  
  // Test user registration
  const registerTest = await makeRequest('POST', '/auth/register', {
    ...testData.user,
    role: 'customer'
  });
  
  if (registerTest.success) {
    logTest('User Registration', 'PASS', 'User registered successfully');
  } else {
    logTest('User Registration', 'FAIL', registerTest.error?.message || 'Registration failed');
  }
  
  // Test user login
  const loginTest = await makeRequest('POST', '/auth/login', {
    email: testData.user.email,
    password: testData.user.password
  });
  
  if (loginTest.success && loginTest.data.data?.token) {
    tokens.customer = loginTest.data.data.token;
    logTest('User Login', 'PASS', 'User login successful');
  } else {
    logTest('User Login', 'FAIL', loginTest.error?.message || 'Login failed');
  }
  
  // Test OTP sending
  const otpTest = await makeRequest('POST', '/auth/send-otp', {
    phoneNumber: '9876543210',
    type: 'login'
  });
  
  if (otpTest.success) {
    logTest('Send OTP', 'PASS', 'OTP sent successfully');
    
    // Test OTP verification (using development OTP if available)
    if (otpTest.data.data?.otp) {
      const verifyOtpTest = await makeRequest('POST', '/auth/verify-otp', {
        phoneNumber: '9876543210',
        otp: otpTest.data.data.otp,
        type: 'login'
      });
      
      if (verifyOtpTest.success) {
        logTest('Verify OTP', 'PASS', 'OTP verification successful');
      } else {
        logTest('Verify OTP', 'FAIL', verifyOtpTest.error?.message || 'OTP verification failed');
      }
    }
  } else {
    logTest('Send OTP', 'FAIL', otpTest.error?.message || 'OTP sending failed');
  }
  
  // Test token refresh
  if (tokens.customer) {
    const refreshTest = await makeRequest('POST', '/auth/refresh-token', null, {
      'Authorization': `Bearer ${tokens.customer}`
    });
    
    if (refreshTest.success) {
      logTest('Token Refresh', 'PASS', 'Token refreshed successfully');
    } else {
      logTest('Token Refresh', 'FAIL', refreshTest.error?.message || 'Token refresh failed');
    }
  }
  
  // Test logout
  if (tokens.customer) {
    const logoutTest = await makeRequest('POST', '/auth/logout', null, {
      'Authorization': `Bearer ${tokens.customer}`
    });
    
    if (logoutTest.success) {
      logTest('User Logout', 'PASS', 'User logout successful');
    } else {
      logTest('User Logout', 'FAIL', logoutTest.error?.message || 'Logout failed');
    }
  }
  
  // Re-login to get fresh token for subsequent tests
  const reloginTest = await makeRequest('POST', '/auth/login', {
    email: testData.user.email,
    password: testData.user.password
  });
  
  if (reloginTest.success) {
    tokens.customer = reloginTest.data.data.token;
  }
};

// 3. User API Tests
const testUserAPIs = async () => {
  console.log('\n👤 === USER API TESTS ===\n');
  
  if (!tokens.customer) {
    logTest('User APIs', 'FAIL', 'No customer token available');
    return;
  }
  
  // Test get user profile
  const profileTest = await makeRequest('GET', '/users/profile', null, {
    'Authorization': `Bearer ${tokens.customer}`
  });
  
  if (profileTest.success) {
    logTest('Get User Profile', 'PASS', 'Profile retrieved successfully');
  } else {
    logTest('Get User Profile', 'FAIL', profileTest.error?.message || 'Profile retrieval failed');
  }
  
  // Test update user profile
  const updateTest = await makeRequest('PUT', '/users/profile', {
    name: 'Updated Test User',
    phoneNumber: '9876543214'
  }, {
    'Authorization': `Bearer ${tokens.customer}`
  });
  
  if (updateTest.success) {
    logTest('Update User Profile', 'PASS', 'Profile updated successfully');
  } else {
    logTest('Update User Profile', 'FAIL', updateTest.error?.message || 'Profile update failed');
  }
  
  // Test document upload endpoint (if exists)
  const uploadTest = await makeRequest('GET', '/users/upload-documents', null, {
    'Authorization': `Bearer ${tokens.customer}`
  });
  
  if (uploadTest.success) {
    logTest('Upload Documents Endpoint', 'PASS', 'Upload endpoint available');
  } else {
    logTest('Upload Documents Endpoint', 'WARN', 'Upload endpoint not found or not accessible');
  }
};

// 4. Order/Booking API Tests
const testOrderAPIs = async () => {
  console.log('\n📦 === ORDER/BOOKING API TESTS ===\n');
  
  if (!tokens.customer) {
    logTest('Order APIs', 'FAIL', 'No customer token available');
    return;
  }
  
  // Test get orders list
  const ordersTest = await makeRequest('GET', '/orders', null, {
    'Authorization': `Bearer ${tokens.customer}`
  });
  
  if (ordersTest.success) {
    logTest('Get Orders List', 'PASS', 'Orders retrieved successfully');
  } else {
    logTest('Get Orders List', 'FAIL', ordersTest.error?.message || 'Orders retrieval failed');
  }
  
  // Test create order (checkout)
  const checkoutTest = await makeRequest('POST', '/orders/checkout', {
    deliveryAddressId: '507f1f77bcf86cd799439011', // Mock ObjectId
    paymentMethod: 'cod',
    items: [{
      product: '507f1f77bcf86cd799439012',
      quantity: 1,
      price: 100
    }]
  }, {
    'Authorization': `Bearer ${tokens.customer}`
  });
  
  if (checkoutTest.success) {
    logTest('Create Order (Checkout)', 'PASS', 'Order created successfully');
    
    // Test get specific order
    const orderId = checkoutTest.data.data?.order?._id;
    if (orderId) {
      const orderDetailTest = await makeRequest('GET', `/orders/${orderId}`, null, {
        'Authorization': `Bearer ${tokens.customer}`
      });
      
      if (orderDetailTest.success) {
        logTest('Get Order Details', 'PASS', 'Order details retrieved successfully');
      } else {
        logTest('Get Order Details', 'FAIL', orderDetailTest.error?.message || 'Order details retrieval failed');
      }
    }
  } else {
    logTest('Create Order (Checkout)', 'FAIL', checkoutTest.error?.message || 'Order creation failed');
  }
};

// 5. Dashboard API Tests
const testDashboardAPIs = async () => {
  console.log('\n📊 === DASHBOARD API TESTS ===\n');
  
  // Test pilot dashboard (will test after pilot auth)
  logTest('Dashboard APIs', 'WARN', 'Will be tested with pilot authentication');
};

// 6. Location/Map API Tests
const testLocationAPIs = async () => {
  console.log('\n🗺️  === LOCATION/MAP API TESTS ===\n');
  
  // Test nearby suppliers
  const nearbyTest = await makeRequest('GET', '/suppliers/nearby?lat=12.9716&lng=77.5946');
  
  if (nearbyTest.success) {
    logTest('Get Nearby Suppliers', 'PASS', 'Nearby suppliers retrieved successfully');
  } else {
    logTest('Get Nearby Suppliers', 'FAIL', nearbyTest.error?.message || 'Nearby suppliers retrieval failed');
  }
};

// 7. Settings/Support API Tests
const testSettingsAndSupportAPIs = async () => {
  console.log('\n⚙️  === SETTINGS/SUPPORT API TESTS ===\n');
  
  // Test app config
  const configTest = await makeRequest('GET', '/pilot/app/config');
  
  if (configTest.success) {
    logTest('Get App Config', 'PASS', 'App config retrieved successfully');
  } else {
    logTest('Get App Config', 'FAIL', configTest.error?.message || 'App config retrieval failed');
  }
  
  // Test support FAQs
  const faqTest = await makeRequest('GET', '/pilot/support/faqs');
  
  if (faqTest.success) {
    logTest('Get Support FAQs', 'PASS', 'FAQs retrieved successfully');
  } else {
    logTest('Get Support FAQs', 'FAIL', faqTest.error?.message || 'FAQ retrieval failed');
  }
  
  // Test support contact (need pilot auth)
  if (tokens.customer) {
    const supportTest = await makeRequest('POST', '/support/tickets', {
      subject: 'Test Support Request',
      description: 'This is a test support request',
      category: 'technical_support',
      priority: 'medium'
    }, {
      'Authorization': `Bearer ${tokens.customer}`
    });
    
    if (supportTest.success) {
      logTest('Create Support Ticket', 'PASS', 'Support ticket created successfully');
    } else {
      logTest('Create Support Ticket', 'FAIL', supportTest.error?.message || 'Support ticket creation failed');
    }
  }
};

// 8. Pilot API Tests
const testPilotAPIs = async () => {
  console.log('\n🚚 === PILOT API TESTS ===\n');
  
  // Test pilot registration
  const pilotRegTest = await makeRequest('POST', '/pilot/register', testData.pilot);
  
  if (pilotRegTest.success) {
    logTest('Pilot Registration', 'PASS', 'Pilot registered successfully');
    
    // Approve pilot for testing
    try {
      if (!mongoose.connection.readyState) {
        await mongoose.connect(process.env.MONGODB_URI);
      }
      const Pilot = require('../models/Pilot');
      await Pilot.findOneAndUpdate(
        { phoneNumber: testData.pilot.phoneNumber },
        { isApproved: true, isActive: true }
      );
      logTest('Pilot Auto-Approval', 'PASS', 'Pilot approved for testing');
    } catch (error) {
      logTest('Pilot Auto-Approval', 'WARN', 'Could not auto-approve pilot');
    }
    
    // Test pilot login
    const pilotLoginTest = await makeRequest('POST', '/pilot/login', {
      phoneNumber: testData.pilot.phoneNumber
    });
    
    if (pilotLoginTest.success) {
      logTest('Pilot Login (Send OTP)', 'PASS', 'OTP sent to pilot');
      
      // If development OTP is available, test verification
      if (pilotLoginTest.data.data?.otp) {
        const pilotVerifyTest = await makeRequest('POST', '/pilot/login', {
          phoneNumber: testData.pilot.phoneNumber,
          otp: pilotLoginTest.data.data.otp
        });
        
        if (pilotVerifyTest.success) {
          tokens.pilot = pilotVerifyTest.data.data.token;
          logTest('Pilot Login (Verify OTP)', 'PASS', 'Pilot login successful');
          
          // Test pilot dashboard stats
          const dashboardTest = await makeRequest('GET', '/pilot/dashboard/stats', null, {
            'Authorization': `Bearer ${tokens.pilot}`
          });
          
          if (dashboardTest.success) {
            logTest('Pilot Dashboard Stats', 'PASS', 'Dashboard stats retrieved successfully');
          } else {
            logTest('Pilot Dashboard Stats', 'FAIL', dashboardTest.error?.message || 'Dashboard stats failed');
          }
          
          // Test location update
          const locationTest = await makeRequest('POST', '/pilot/update-location', {
            latitude: 12.9716,
            longitude: 77.5946
          }, {
            'Authorization': `Bearer ${tokens.pilot}`
          });
          
          if (locationTest.success) {
            logTest('Pilot Location Update', 'PASS', 'Location updated successfully');
          } else {
            logTest('Pilot Location Update', 'FAIL', locationTest.error?.message || 'Location update failed');
          }
          
          // Test pilot notifications
          const notificationsTest = await makeRequest('GET', '/pilot/dashboard/notifications', null, {
            'Authorization': `Bearer ${tokens.pilot}`
          });
          
          if (notificationsTest.success) {
            logTest('Pilot Notifications', 'PASS', 'Notifications retrieved successfully');
          } else {
            logTest('Pilot Notifications', 'FAIL', notificationsTest.error?.message || 'Notifications failed');
          }
        } else {
          logTest('Pilot Login (Verify OTP)', 'FAIL', pilotVerifyTest.error?.message || 'OTP verification failed');
        }
      }
    } else {
      logTest('Pilot Login (Send OTP)', 'FAIL', pilotLoginTest.error?.message || 'Pilot login failed');
    }
  } else {
    logTest('Pilot Registration', 'FAIL', pilotRegTest.error?.message || 'Pilot registration failed');
  }
  
  // Test pilot support contact
  if (tokens.pilot) {
    const pilotSupportTest = await makeRequest('POST', '/pilot/support/contact', {
      subject: 'Test Pilot Support',
      message: 'This is a test support message from pilot'
    }, {
      'Authorization': `Bearer ${tokens.pilot}`
    });
    
    if (pilotSupportTest.success) {
      logTest('Pilot Support Contact', 'PASS', 'Support request sent successfully');
    } else {
      logTest('Pilot Support Contact', 'FAIL', pilotSupportTest.error?.message || 'Support request failed');
    }
  }
};

// 9. Additional API Tests
const testAdditionalAPIs = async () => {
  console.log('\n🔧 === ADDITIONAL API TESTS ===\n');
  
  // Test products API
  const productsTest = await makeRequest('GET', '/products?limit=5');
  if (productsTest.success) {
    logTest('Get Products', 'PASS', 'Products retrieved successfully');
  } else {
    logTest('Get Products', 'FAIL', productsTest.error?.message || 'Products retrieval failed');
  }
  
  // Test cart APIs (if customer token available)
  if (tokens.customer) {
    const cartTest = await makeRequest('GET', '/cart', null, {
      'Authorization': `Bearer ${tokens.customer}`
    });
    
    if (cartTest.success) {
      logTest('Get Cart', 'PASS', 'Cart retrieved successfully');
    } else {
      logTest('Get Cart', 'FAIL', cartTest.error?.message || 'Cart retrieval failed');
    }
  }
  
  // Test wishlist APIs
  if (tokens.customer) {
    const wishlistTest = await makeRequest('GET', '/wishlist', null, {
      'Authorization': `Bearer ${tokens.customer}`
    });
    
    if (wishlistTest.success) {
      logTest('Get Wishlist', 'PASS', 'Wishlist retrieved successfully');
    } else {
      logTest('Get Wishlist', 'FAIL', wishlistTest.error?.message || 'Wishlist retrieval failed');
    }
  }
  
  // Test payment methods
  const paymentMethodsTest = await makeRequest('GET', '/payments/methods');
  if (paymentMethodsTest.success) {
    logTest('Get Payment Methods', 'PASS', 'Payment methods retrieved successfully');
  } else {
    logTest('Get Payment Methods', 'FAIL', paymentMethodsTest.error?.message || 'Payment methods failed');
  }
};

// Cleanup function
const cleanup = async () => {
  console.log('\n🧹 === CLEANUP ===\n');
  
  try {
    if (!mongoose.connection.readyState) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
    
    const User = require('../models/User');
    const Pilot = require('../models/Pilot');
    const Ticket = require('../models/Ticket');
    
    // Clean up test data
    await User.deleteOne({ email: testData.user.email });
    await User.deleteOne({ email: testData.supplier.email });
    await Pilot.deleteOne({ phoneNumber: testData.pilot.phoneNumber });
    await Ticket.deleteMany({ 
      $or: [
        { subject: 'Test Support Request' },
        { subject: 'Test Pilot Support' }
      ]
    });
    
    logTest('Cleanup', 'PASS', 'Test data cleaned up successfully');
    
    if (mongoose.connection.readyState) {
      await mongoose.connection.close();
    }
  } catch (error) {
    logTest('Cleanup', 'WARN', `Cleanup partially failed: ${error.message}`);
  }
};

// Print test results
const printResults = () => {
  console.log('\n📋 === TEST RESULTS SUMMARY ===\n');
  
  const total = testResults.passed.length + testResults.failed.length + testResults.warnings.length;
  
  console.log(`📊 Total Tests: ${total}`);
  console.log(`✅ Passed: ${testResults.passed.length}`);
  console.log(`❌ Failed: ${testResults.failed.length}`);
  console.log(`⚠️  Warnings: ${testResults.warnings.length}`);
  
  if (testResults.failed.length > 0) {
    console.log('\n❌ FAILED TESTS:');
    testResults.failed.forEach(test => {
      console.log(`   • ${test.testName}: ${test.message}`);
    });
  }
  
  if (testResults.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    testResults.warnings.forEach(test => {
      console.log(`   • ${test.testName}: ${test.message}`);
    });
  }
  
  console.log('\n✅ PASSED TESTS:');
  testResults.passed.forEach(test => {
    console.log(`   • ${test.testName}: ${test.message}`);
  });
  
  const successRate = ((testResults.passed.length / total) * 100).toFixed(2);
  console.log(`\n🎯 Success Rate: ${successRate}%\n`);
};

// Main test runner
const runAllTests = async () => {
  console.log('🚀 Starting Comprehensive API Test Suite...\n');
  console.log(`🔗 Testing against: ${BASE_URL}\n`);
  
  try {
    // Check server connectivity first
    const serverUp = await testHealthAndConnectivity();
    if (!serverUp) {
      console.log('\n❌ Server is not accessible. Please start your server first.\n');
      return;
    }
    
    // Run all test categories
    await testAuthenticationAPIs();
    await testUserAPIs();
    await testOrderAPIs();
    await testDashboardAPIs();
    await testLocationAPIs();
    await testSettingsAndSupportAPIs();
    await testPilotAPIs();
    await testAdditionalAPIs();
    
    // Cleanup test data
    await cleanup();
    
    // Print final results
    printResults();
    
  } catch (error) {
    console.error('\n💥 Test suite failed with error:', error);
    logTest('Test Suite', 'FAIL', `Critical error: ${error.message}`);
  }
};

// Export for external use
module.exports = {
  runAllTests,
  testResults,
  BASE_URL
};

// Run if called directly
if (require.main === module) {
  runAllTests()
    .then(() => {
      console.log('🏁 Test suite completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test suite crashed:', error);
      process.exit(1);
    });
}