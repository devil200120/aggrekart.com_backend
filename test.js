const axios = require('axios');

// Try multiple localhost configurations
const LOCAL_ENDPOINTS = [
  'http://127.0.0.1:5000',     // IPv4 localhost
  'http://localhost:5000',      // Standard localhost
  'http://0.0.0.0:5000'        // All interfaces (if accessible)
];

// Test configuration
const TEST_PHONE_NUMBER = '9876543210';
const TEST_ORDER_ID = 'AGK1755273478411UWC';

let WORKING_BASE_URL = null;
let PILOT_TOKEN = null;

async function findWorkingEndpoint() {
  console.log('🔍 Finding working server endpoint...\n');
  
  for (const baseUrl of LOCAL_ENDPOINTS) {
    try {
      console.log(`Testing: ${baseUrl}`);
      
      const healthResponse = await axios.get(`${baseUrl}/api/health`, {
        timeout: 3000
      });
      
      console.log(`✅ SUCCESS: ${baseUrl}`);
      console.log(`📊 Status: ${healthResponse.data.message}\n`);
      
      WORKING_BASE_URL = `${baseUrl}/api/pilot`;
      return true;
      
    } catch (error) {
      console.log(`❌ Failed: ${baseUrl} - ${error.message}`);
    }
  }
  
  console.log('\n❌ Could not connect to any endpoint!');
  return false;
}

async function checkServerDetails() {
  console.log('🔍 Getting server details...');
  
  try {
    const response = await axios.get(`${WORKING_BASE_URL.replace('/api/pilot', '/api/health')}`);
    console.log('✅ Server Info:');
    console.log(`   Environment: ${response.data.environment}`);
    console.log(`   Version: ${response.data.version}`);
    console.log(`   Trust Proxy: ${response.data.trustProxy}`);
    console.log('');
  } catch (error) {
    console.log('⚠️  Could not get server details');
  }
}

async function loginPilot() {
  try {
    console.log('🔐 Testing pilot login...');
    console.log(`📞 Phone: ${TEST_PHONE_NUMBER}`);
    
    // Request OTP
    const otpResponse = await axios.post(`${WORKING_BASE_URL}/login`, {
      phoneNumber: TEST_PHONE_NUMBER
    });
    
    console.log('✅ OTP request successful');
    
    if (otpResponse.data.data.otp) {
      // Development mode - OTP in response
      const otp = otpResponse.data.data.otp;
      console.log(`📱 Dev OTP: ${otp}`);
      
      // Login with OTP
      const loginResponse = await axios.post(`${WORKING_BASE_URL}/login`, {
        phoneNumber: TEST_PHONE_NUMBER,
        otp: otp
      });
      
      PILOT_TOKEN = loginResponse.data.data.token;
      const pilot = loginResponse.data.data.pilot;
      
      console.log('✅ Login successful!');
      console.log(`👤 Name: ${pilot.name}`);
      console.log(`🆔 ID: ${pilot.pilotId}`);
      console.log(`🚗 Vehicle: ${pilot.vehicleDetails?.registrationNumber}`);
      console.log(`📍 Available: ${pilot.isAvailable}`);
      console.log('');
      return true;
      
    } else {
      console.log('📱 OTP sent via SMS');
      console.log('❌ Cannot proceed without development OTP');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Login failed!');
    
    if (error.response) {
      console.error(`📊 Status: ${error.response.status}`);
      console.error(`📄 Error: ${error.response.data?.message}`);
      
      if (error.response.status === 404) {
        console.log('\n💡 PILOT NOT FOUND:');
        console.log('1. Phone number not registered as pilot');
        console.log('2. Pilot not approved/active');
        console.log('3. Check database for registered pilots');
      }
    } else {
      console.error(`Network: ${error.message}`);
    }
    
    return false;
  }
}

async function testScanOrderAPI() {
  try {
    console.log('🔍 Testing scan-order API...');
    console.log(`📋 Order ID: ${TEST_ORDER_ID}`);
    
    const response = await axios.post(`${WORKING_BASE_URL}/scan-order`, {
      orderId: TEST_ORDER_ID
    }, {
      headers: {
        'Authorization': `Bearer ${PILOT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Scan-order API SUCCESS!\n');
    
    // Show full response
    console.log('📋 COMPLETE API RESPONSE:');
    console.log('='.repeat(60));
    console.log(JSON.stringify(response.data, null, 2));
    console.log('='.repeat(60));
    
    // Analyze address field specifically
    const order = response.data.data?.order;
    const customer = order?.customer;
    
    console.log('\n🏠 ADDRESS FIELD ANALYSIS:');
    console.log('='.repeat(40));
    
    if (customer?.address !== undefined) {
      console.log(`📊 Type: ${typeof customer.address}`);
      console.log(`📄 Value: ${JSON.stringify(customer.address)}`);
      
      if (typeof customer.address === 'string') {
        if (customer.address === 'NA') {
          console.log('🚨 BUG CONFIRMED: Address returns "NA"');
          console.log('📝 This is the bug that needs fixing!');
        } else if (customer.address.includes('not available')) {
          console.log('⚠️  Address shows as not available');
        } else {
          console.log('✅ Address has proper value');
        }
      } else if (typeof customer.address === 'object') {
        console.log('🚨 ISSUE: Address is object instead of string');
        if (customer.address?.address) {
          console.log(`📍 String inside object: "${customer.address.address}"`);
        }
      }
    } else {
      console.log('❌ NO ADDRESS FIELD FOUND');
      console.log(`🔍 Customer fields: ${Object.keys(customer || {}).join(', ')}`);
    }
    
    console.log('='.repeat(40));
    
    // Show key order info
    if (order) {
      console.log('\n📦 ORDER SUMMARY:');
      console.log(`🆔 ID: ${order.orderId}`);
      console.log(`📊 Status: ${order.status}`);
      console.log(`👤 Customer: ${customer?.name || 'Unknown'}`);
      console.log(`📞 Phone: ${customer?.phoneNumber || 'Unknown'}`);
      
      if (order.supplier) {
        console.log(`🏢 Supplier: ${order.supplier.companyName || 'Unknown'}`);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Scan-order failed!');
    
    if (error.response) {
      const { status, data } = error.response;
      console.error(`📊 Status: ${status}`);
      console.error(`📄 Response: ${JSON.stringify(data, null, 2)}`);
      
      if (status === 404) {
        console.log('\n💡 ORDER NOT FOUND:');
        console.log(`1. Order "${TEST_ORDER_ID}" does not exist`);
        console.log('2. Order not in correct status');
        console.log('3. Wrong order ID format');
        console.log('\n🔧 SOLUTIONS:');
        console.log('1. Check database for actual orders');
        console.log('2. Create test order');
        console.log('3. Update TEST_ORDER_ID variable');
      }
    } else {
      console.error(`Error: ${error.message}`);
    }
  }
}

async function runTest() {
  console.log('🚚 FIXED Local Pilot API Test');
  console.log('==============================');
  console.log(`📞 Test Phone: ${TEST_PHONE_NUMBER}`);
  console.log(`📋 Test Order: ${TEST_ORDER_ID}`);
  console.log('==============================\n');
  
  // Step 1: Find working endpoint
  const connected = await findWorkingEndpoint();
  if (!connected) {
    console.log('💡 TROUBLESHOOTING:');
    console.log('1. Make sure server is running (npm start)');
    console.log('2. Check if port 5000 is free');
    console.log('3. Try restarting the server');
    console.log('4. Check server logs for errors');
    return;
  }
  
  console.log(`✅ Connected to: ${WORKING_BASE_URL}\n`);
  
  // Step 2: Get server info
  await checkServerDetails();
  
  // Step 3: Login
  const loginOk = await loginPilot();
  if (!loginOk) return;
  
  // Step 4: Test scan-order
  await testScanOrderAPI();
  
  console.log('\n🎉 TEST COMPLETE!');
  console.log(`🌐 Server: ${WORKING_BASE_URL}`);
}

// Run the test
runTest().catch(error => {
  console.error('💥 Unexpected error:', error.message);
  console.error('Stack:', error.stack);
});