# Pilot API Testing Suite 🚁

A comprehensive testing suite for the Pilot API endpoints with automated testing, pilot approval, and complete flow validation.

## 📋 Available Testing Scripts

### 1. `test.js` - Basic API Testing
Tests core API functionality including registration, login attempts, and security.

**Usage:**
```bash
node test.js
```

**Features:**
- ✅ Server connectivity test
- ✅ Pilot registration with dynamic data
- ✅ Login flow testing (handles pending approval)
- ✅ Security endpoint testing
- ✅ Protected route validation
- ✅ Input validation testing

### 2. `approve-pilot.js` - Pilot Approval Helper
Utility script to approve pilots in the database for testing purposes.

**Usage:**
```bash
# List all pilots
node approve-pilot.js list

# Approve a specific pilot
node approve-pilot.js approve PIL000001
```

**Features:**
- 📋 List all pilots with approval status
- ✅ Approve pending pilots
- 📱 Display pilot information

### 3. `test-complete-flow.js` - Complete Flow Testing
Tests the entire pilot lifecycle from registration to authenticated operations.

**Usage:**
```bash
# Test complete flow (registration + approval instructions)
node test-complete-flow.js

# Test with existing approved pilot
node test-complete-flow.js PIL000001
```

**Features:**
- 🔄 Complete pilot lifecycle testing
- 🔐 Authentication flow validation
- 📊 All authenticated endpoint testing
- 📈 Comprehensive reporting

## 🚀 Quick Start Testing Guide

### Step 1: Basic API Validation
```bash
node test.js
```
This will test basic functionality and create a new pilot (pending approval).

### Step 2: Approve a Pilot (if needed)
```bash
# List pilots to see the latest registered pilot
node approve-pilot.js list

# Approve the pilot (use the PIL ID from step 1)
node approve-pilot.js approve PIL000006
```

### Step 3: Test Complete Flow
```bash
# Test complete authenticated flow
node test-complete-flow.js PIL000006
```

## 📊 Test Coverage

### Registration & Authentication
- [x] Pilot registration with validation
- [x] Phone number validation
- [x] Vehicle registration format validation
- [x] OTP request and verification
- [x] Login with approved/pending pilots
- [x] Token generation and validation

### Protected Endpoints
- [x] Dashboard access
- [x] Pilot statistics
- [x] Delivery history
- [x] Location updates
- [x] Notifications
- [x] Order scanning
- [x] Order acceptance
- [x] Journey management

### Security
- [x] Unauthorized access blocking
- [x] Invalid token handling
- [x] Input validation
- [x] Authentication middleware

### Order Management
- [x] Order scanning by ID
- [x] Order acceptance flow
- [x] Journey start/completion
- [x] Order status updates

## 🔧 Configuration

### Environment Variables
Ensure your `.env` file contains:
```
MONGODB_URI=mongodb://localhost:27017/your-database
NODE_ENV=development
JWT_SECRET=your-jwt-secret
```

### Test Configuration
Edit the CONFIG object in test files to customize:
```javascript
const CONFIG = {
  baseUrl: 'http://127.0.0.1:5000',  // API server URL
  testPhone: '9876543210',           // Test phone number
  testOTP: '123456',                 // Default OTP for development
  requestTimeout: 30000              // Request timeout in ms
};
```

## 📝 Test Data Generation

All tests use dynamic data generation to avoid conflicts:
- 📱 **Phone Numbers**: Generated with timestamp for uniqueness
- 🚗 **Vehicle Registration**: Follows Indian format (e.g., TS12AB3456)
- 📧 **Email Addresses**: Timestamped for uniqueness
- 🆔 **License Numbers**: Generated with timestamp

## 🐛 Troubleshooting

### Common Issues

**1. Connection Refused (ECONNREFUSED)**
```
✅ Solution: Ensure your server is running on port 5000
node server.js
```

**2. Pilot Not Found (404 during login)**
```
✅ Solution: Approve the pilot first
node approve-pilot.js approve PIL000001
```

**3. Invalid Phone Number**
```
✅ Solution: Ensure phone numbers are 10 digits starting with 6-9
```

**4. Vehicle Registration Validation**
```
✅ Solution: Use format like TS12AB3456 (2 letters, 2 numbers, 2 letters, 4 numbers)
```

**5. Database Connection Issues**
```
✅ Solution: Check MongoDB is running and MONGODB_URI is correct
```

### Test Results Interpretation

**🟢 All Tests Pass (100% Success Rate)**
- Server is running correctly
- All endpoints are functional
- Authentication is working
- Database operations are successful

**🟡 Partial Success (60-99% Success Rate)**
- Some endpoints may have issues
- Check specific failed tests for details
- May need pilot approval for full testing

**🔴 Low Success Rate (<60%)**
- Server connectivity issues
- Database connection problems
- Configuration errors

## 📈 Performance Testing

The test suite includes performance metrics:
- ⏱️ **Response Times**: Individual endpoint timing
- 📊 **Success Rates**: Overall test success percentage
- 🔄 **Concurrent Testing**: Multiple request handling
- 📈 **Load Testing**: Stress testing capabilities

## 🔒 Security Testing

Comprehensive security validation:
- 🚫 **Unauthorized Access**: Blocks requests without tokens
- 🔐 **Token Validation**: Verifies JWT token integrity
- 📝 **Input Validation**: Tests malformed requests
- 🛡️ **SQL Injection Protection**: Tests for injection attacks
- 🔍 **Data Sanitization**: Validates input sanitization

## 📚 API Documentation

For detailed API documentation, refer to:
- `Pilot_API_Documentation.md` - Complete endpoint documentation
- `Pilot_Postman_Collection.json` - Postman collection for manual testing
- `Pilot_Test_Data.json` - Sample test data for Postman

## 🤝 Contributing

To add new tests:

1. **Add Test Function**: Create a new test function in the appropriate file
2. **Update Test Runner**: Add the function to the main test execution
3. **Document Test**: Add description and expected behavior
4. **Validate**: Ensure test passes/fails appropriately

Example:
```javascript
async function testNewFeature() {
  console.log('\n🔸 Testing New Feature...');
  
  try {
    const response = await makeRequest('GET', '/api/pilot/new-endpoint', null, authHeaders);
    const passed = response.status === 200;
    logTest('New Feature Test', passed, `Response: ${response.status}`);
  } catch (error) {
    logTest('New Feature Test', false, `Error: ${error.message}`);
  }
}
```

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Verify server and database are running
3. Ensure all environment variables are set
4. Review test output for specific error messages

---
*Happy Testing! 🚀*