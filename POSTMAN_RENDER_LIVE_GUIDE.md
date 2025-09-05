# 📮 Complete Postman Guide - Live Aggrekart Pilot APIs on Render
*Production Environment Testing - Comprehensive Guide*

## 🌐 **Live Environment Details**

**Frontend URL**: https://aggrekart-com.onrender.com
**Backend API URL**: https://aggrekart-com-backend.onrender.com
**API Base Path**: `/api/pilot`
**Environment**: Production (Render Cloud)

---

## 📚 **Table of Contents**
1. [Prerequisites & Setup](#prerequisites--setup)
2. [Environment Configuration](#environment-configuration)
3. [Collection Import](#collection-import)
4. [Live API Testing Guide](#live-api-testing-guide)
5. [Production Considerations](#production-considerations)
6. [Troubleshooting](#troubleshooting)
7. [Mobile Integration](#mobile-integration)

---

## 🛠️ **Prerequisites & Setup**

### Step 1: Install Postman
1. Download from [https://www.postman.com/downloads/](https://www.postman.com/downloads/)
2. Install and create account (recommended for syncing)
3. Open Postman application

### Step 2: Verify Live Backend
First, let's confirm your backend is accessible:
1. Open browser
2. Visit: `https://aggrekart-com-backend.onrender.com`
3. You should see: `Cannot GET /` (this is normal - means server is running)

---

## 🌍 **Environment Configuration (CRITICAL STEP)**

### Create Live Production Environment

#### Step 1: Create New Environment
1. Click **"Environments"** tab (left sidebar) or gear icon ⚙️
2. Click **"Create Environment"** 
3. **Name**: `Aggrekart Live Production`
4. **Add these variables exactly:**

#### Environment Variables (Copy these exactly):

| Variable | Initial Value | Current Value | Description |
|----------|---------------|---------------|-------------|
| `base_url` | `https://aggrekart-com-backend.onrender.com/api/pilot` | `https://aggrekart-com-backend.onrender.com/api/pilot` | Live production API URL |
| `pilot_token` | *(empty)* | *(empty)* | JWT token (auto-filled after login) |
| `pilot_id` | *(empty)* | *(empty)* | Pilot ID (auto-filled after login) |
| `phone_number` | `9876543210` | `9876543210` | Live registered pilot phone |
| `order_id` | `AGK1755273478411UWC` | `AGK1755273478411UWC` | Real order ID from production |
| `customer_otp` | `123456` | `123456` | Test delivery OTP |
| `frontend_url` | `https://aggrekart-com.onrender.com` | `https://aggrekart-com.onrender.com` | Live frontend URL |

#### Step 2: Save & Activate Environment
1. **Click "Save"** (Ctrl+S)
2. **Select environment** from dropdown (top-right)
3. **Verify**: You should see `Aggrekart Live Production` selected

#### 🔍 **Environment Verification:**
```
✅ Correct Base URL: https://aggrekart-com-backend.onrender.com/api/pilot
✅ Real Order ID: AGK1755273478411UWC (exists in your database)
✅ Live Phone Number: 9876543210 (registered pilot)
```

---

## 📥 **Collection Import & Setup**

### Import Existing Collection
1. **Open Postman**
2. **Click "Import"** button (top-left)
3. **Select "Upload Files"**
4. **Choose**: `Aggrekart_Pilot_APIs.postman_collection.json`
5. **Click "Import"**

### Update Collection for Live Testing
After import, you'll see:
```
📂 Aggrekart Pilot APIs
├── 🔐 Authentication
│   ├── 1. Register Pilot
│   ├── 2. Request OTP
│   └── 3. Verify OTP & Login
├── 📦 Order Management  
│   ├── 4. Scan Order
│   ├── 5. Accept Order
│   ├── 6. Start Journey
│   ├── 7. Update Location
│   └── 8. Complete Delivery
├── 👤 Profile & Stats
│   ├── 9. Get Profile
│   ├── 10. Get Stats
│   └── 11. Delivery History
└── 📊 Dashboard & Support
    ├── 12. Dashboard Stats
    ├── 13. Get Notifications
    ├── 14. App Config
    ├── 15. Get FAQs
    └── 16. Contact Support
```


---

## 🧪 **Live API Testing Guide (Step-by-Step)**

### 🚨 **IMPORTANT: Testing Sequence**
**Always follow this order for live testing:**

1. Health Check → 2. Login → 3. Test APIs → 4. Logout (optional)

---

### **0️⃣ HEALTH CHECK (Start Here)**

#### Purpose: Verify live backend is responding

**Manual Test:**
1. **Create new request**
2. **Method**: `GET`
3. **URL**: `https://aggrekart-com-backend.onrender.com/api/health`
4. **Click "Send"**

**Expected Response:**
```json
{
  "success": true,
  "status": "OK",
  "message": "Aggrekart API is running",
  "timestamp": "2025-09-02T10:30:00.000Z",
  "version": "1.0.0",
  "environment": "production"
}
```

**✅ If you get this response, proceed to authentication**
**❌ If you get errors, check troubleshooting section**

---

### **1️⃣ REQUEST OTP (LIVE SMS)**

#### 🎯 Purpose: Get real SMS OTP to your phone

**Step-by-Step:**
1. **Click "Request OTP"** request
2. **Verify URL**: `{{base_url}}/login` (should show live URL)
3. **Method**: `POST`
4. **Body** (Raw JSON):
```json
{
  "phoneNumber": "{{phone_number}}"
}
```

**Click "Send"**

**Expected Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "otpSent": true,
    "otp": "586317"
  }
}
```

**🔍 What Happens:**
- ✅ Real SMS sent to phone number 9876543210
- ✅ OTP visible in response for testing
- ✅ OTP expires in 10 minutes

**📱 CHECK YOUR PHONE**: You should receive SMS with OTP!

---

### **2️⃣ VERIFY OTP & LOGIN (CRITICAL STEP)**

#### 🎯 Purpose: Complete login and get authentication token

**Step-by-Step:**
1. **Click "Verify OTP & Login"** request
2. **Copy the OTP** from previous response (e.g., "586317")
3. **Body** (Raw JSON):
```json
{
  "phoneNumber": "{{phone_number}}",
  "otp": "586317"
}
```
**⚠️ Replace "586317" with actual OTP from step 1**

**Click "Send"**

**Expected Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "pilot": {
      "pilotId": "PIL000001",
      "name": "Test Pilot",
      "phoneNumber": "9876543210",
      "vehicleDetails": {
        "registrationNumber": "KA01AB1234",
        "vehicleType": "truck",
        "capacity": 5
      },
      "isAvailable": true,
      "totalDeliveries": 1,
      "rating": {
        "average": 5,
        "count": 1
      }
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**🔑 Auto-Token Setup:**
The collection has a script that automatically:
- Saves token to `{{pilot_token}}`
- Saves pilot ID to `{{pilot_id}}`

**✅ Verify Token Saved:**
1. Go to environment variables
2. Check `pilot_token` has long string value
3. Check `pilot_id` has value like "PIL000001"

---

### **3️⃣ SCAN ORDER (WITH REAL DATA)**

#### 🎯 Purpose: Test order scanning with real production order

**Step-by-Step:**
1. **Click "Scan Order"** request
2. **Headers** (Auto-added): `Authorization: Bearer {{pilot_token}}`
3. **Body**:
```json
{
  "orderId": "{{order_id}}"
}
```

**Click "Send"**

**Expected Response (Real Order):**
```json
{
  "success": true,
  "message": "Order details retrieved successfully",
  "data": {
    "order": {
      "_id": "689f5906a93dac5fd8b77078",
      "orderId": "AGK1755273478411UWC",
      "status": "delivered",
      "pricing": {
        "totalAmount": 148
      },
      "deliveryAddress": {
        "address": "Suchitra X Rd, Ramraju Nagar, Jeedimetla, Hyderabad",
        "city": "Hyderabad",
        "state": "Telangana",
        "pincode": "500067"
      },
      "customer": {
        "name": "Subhankar Dash"
      },
      "items": [
        {
          "name": "Sand",
          "quantity": 1,
          "unit": "cubic meter"
        }
      ]
    }
  }
}
```

**🔍 This shows:**
- ✅ Real customer: Subhankar Dash
- ✅ Real address: Hyderabad, Telangana
- ✅ Real order: ₹148 for sand delivery
- ✅ Order already completed (status: "delivered")

---

### **4️⃣ GET PROFILE (LIVE PILOT DATA)**

#### 🎯 Purpose: View real pilot profile information

**Step-by-Step:**
1. **Click "Get Profile"** request
2. **URL**: `{{base_url}}/profile/{{pilot_id}}` (auto-populated)
3. **Method**: `GET`
4. **Click "Send"**

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "pilot": {
      "pilotId": "PIL000001",
      "name": "Test Pilot",
      "phoneNumber": "9876543210",
      "email": "testpilot@test.com",
      "vehicleDetails": {
        "registrationNumber": "KA01AB1234",
        "vehicleType": "truck",
        "capacity": 5,
        "insuranceValid": false,
        "rcValid": false
      },
      "isAvailable": true,
      "totalDeliveries": 1,
      "rating": {
        "average": 5,
        "count": 1
      },
      "currentLocation": {
        "coordinates": [77.5956, 12.9726],
        "lastUpdated": "2025-09-02T06:11:22.677Z"
      }
    },
    "recentDeliveries": [
      {
        "orderId": "AGK1755273478411UWC",
        "pricing": {
          "totalAmount": 148
        },
        "deliveryAddress": {
          "city": "Hyderabad"
        }
      }
    ]
  }
}
```

---

### **5️⃣ GET STATS (PERFORMANCE METRICS)**

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "pilot": {
      "pilotId": "PIL000001",
      "totalDeliveries": 1,
      "rating": {
        "average": 5,
        "count": 1
      }
    },
    "stats": {
      "totalDeliveries": 1,
      "totalRevenue": 148,
      "monthlyEarnings": 1435818.95,
      "monthlyDeliveries": 1
    },
    "performance": {
      "averageRating": 5,
      "totalRatings": 1,
      "onTimeDeliveryRate": 95,
      "customerSatisfactionRate": 98
    }
  }
}
```

---

### **6️⃣ DASHBOARD STATS**

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "todayStats": {
      "totalOrders": 0,
      "totalEarnings": 0,
      "completedOrders": 0
    },
    "pilotInfo": {
      "name": "Test Pilot",
      "vehicleNumber": "KA01AB1234",
      "rating": {
        "average": 5,
        "count": 1
      },
      "totalDeliveries": 1
    }
  }
}
```

---

### **7️⃣ APP CONFIG**

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "supportInfo": {
      "phone": "+91-9876543210",
      "email": "support@aggrekart.com",
      "whatsapp": "+91-9876543210"
    },
    "appVersion": {
      "current": "1.0.0",
      "minimum": "1.0.0"
    },
    "features": {
      "liveTracking": true,
      "otpDelivery": true,
      "cashCollection": true
    }
  }
}
```

---

## 🔄 **Complete Testing Workflow**

### **Recommended Daily Testing Sequence:**

1. **Health Check** ✅
   ```
   GET https://aggrekart-com-backend.onrender.com/api/health
   Expected: Status 200, success: true
   ```

2. **Authentication Flow** ✅
   ```
   POST /login (phone only) → Get OTP via SMS
   POST /login (phone + OTP) → Get JWT token
   ```

3. **Core APIs** ✅
   ```
   POST /scan-order → Test with real order ID
   GET /profile → View pilot details
   GET /stats → Check performance
   GET /dashboard/stats → Today's overview
   ```

4. **Support Features** ✅
   ```
   GET /app/config → App configuration
   GET /support/faqs → Help content
   POST /support/contact → Create support ticket
   ```

---

## ⚠️ **Production Considerations**

### **Real SMS Costs**
- 🔴 **Warning**: Each OTP request sends real SMS via Twilio
- 💰 **Cost**: ~₹0.50 per SMS (charged to your Twilio account)
- 📊 **Recommendation**: Limit OTP testing to avoid unnecessary charges

### **Rate Limiting**
- 🚦 **Limit**: 5 OTP requests per phone number per hour
- ⏰ **Reset**: Hourly reset
- 🔄 **Best Practice**: Use test environment for frequent testing

### **Real Database**
- 📊 **Live Data**: All APIs use production database
- ⚠️ **Caution**: Don't create test orders in production
- 🎯 **Use**: Existing order ID `AGK1755273478411UWC` for testing

---

## 🚨 **Troubleshooting Guide**

### **Common Issues & Solutions**

#### ❌ "Cannot reach server"
**Problem**: Network or server issues
**Solutions:**
1. Check internet connection
2. Verify Render app is not sleeping: https://aggrekart-com-backend.onrender.com
3. Wait 30 seconds for Render cold start
4. Check Render dashboard for app status

#### ❌ "Invalid OTP" 
**Problem**: Wrong or expired OTP
**Solutions:**
1. Use exact OTP from response (not SMS sometimes delayed)
2. Request new OTP if >10 minutes old
3. Check phone number matches registration

#### ❌ "Order not found"
**Problem**: Using non-existent order ID
**Solutions:**
1. Use provided order ID: `AGK1755273478411UWC`
2. Check order exists in production database
3. Use recent order from pilot's delivery history

#### ❌ "Unauthorized" or "No token"
**Problem**: Authentication token missing/expired
**Solutions:**
1. Complete login flow first
2. Check `{{pilot_token}}` environment variable is set
3. Re-login if token expired (2 hours)

#### ❌ "Validation failed"
**Problem**: Incorrect request body format
**Solutions:**
1. Ensure JSON format is correct
2. Check all required fields present
3. Use exact examples from documentation

---

## 📱 **Mobile App Integration**

### **Ready for Production Use**

Your mobile app can now connect to:
```javascript
const API_BASE_URL = 'https://aggrekart-com-backend.onrender.com/api/pilot';

// Example implementation
const loginPilot = async (phoneNumber, otp) => {
  const response = await fetch(`${API_BASE_URL}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phoneNumber, otp }),
  });
  return response.json();
};
```

### **Flutter/Dart Example**
```dart
class PilotApiService {
  static const String baseUrl = 'https://aggrekart-com-backend.onrender.com/api/pilot';
  
  Future<Map<String, dynamic>> requestOTP(String phoneNumber) async {
    final response = await http.post(
      Uri.parse('$baseUrl/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'phoneNumber': phoneNumber}),
    );
    return jsonDecode(response.body);
  }
}
```

### **React Native Example**
```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = 'https://aggrekart-com-backend.onrender.com/api/pilot';

export const pilotApi = {
  async scanOrder(orderId) {
    const token = await AsyncStorage.getItem('pilot_token');
    const response = await fetch(`${API_BASE}/scan-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ orderId }),
    });
    return response.json();
  }
};
```

---

## 📋 **Testing Checklist**

### **Pre-Testing Checklist:**
- [ ] Postman installed and updated
- [ ] Environment variables configured correctly
- [ ] Collection imported successfully
- [ ] Internet connection stable
- [ ] Phone ready to receive SMS

### **Authentication Testing:**
- [ ] Health check returns 200 status
- [ ] OTP request sends real SMS
- [ ] OTP verification returns JWT token
- [ ] Token saved to environment variables
- [ ] Protected endpoints accept token

### **Core API Testing:**
- [ ] Scan order with real order ID works
- [ ] Profile returns pilot details
- [ ] Stats show performance metrics
- [ ] Dashboard shows today's data
- [ ] App config loads support info

### **Production Readiness:**
- [ ] All APIs return expected response format
- [ ] Error handling works correctly
- [ ] Response times acceptable (<2 seconds)
- [ ] Authentication flow secure
- [ ] Real data displayed correctly

---

## 🏆 **Success Criteria**

### **✅ Your Live APIs are Production Ready When:**

1. **Authentication System:**
   - ✅ SMS OTP delivered to phone
   - ✅ Login returns valid JWT token
   - ✅ Token works across all endpoints
   - ✅ Secure session management

2. **Data Consistency:**
   - ✅ Profile shows accurate pilot info
   - ✅ Stats reflect real performance
   - ✅ Orders display correctly
   - ✅ Real delivery history visible

3. **Performance:**
   - ✅ Response times under 2 seconds
   - ✅ Server handles concurrent requests
   - ✅ No memory leaks or crashes
   - ✅ Proper error handling

4. **Mobile Integration:**
   - ✅ CORS configured correctly
   - ✅ HTTPS secure connections
   - ✅ JSON responses formatted properly
   - ✅ Authentication headers accepted

---

## 📞 **Support & Help**

### **Need Assistance?**

**API Issues:**
- 📧 Email: support@aggrekart.com
- 📱 Phone: +91-9876543210
- 💬 WhatsApp: +91-9876543210

**Technical Support:**
- 🔧 Backend Issues: Check Render logs
- 📱 Mobile Integration: Use provided code examples
- 🧪 Testing Problems: Follow troubleshooting guide
- 📖 Documentation: Refer to this guide

**Render Platform:**
- 🌐 Dashboard: https://dashboard.render.com
- 📊 App Logs: Available in Render console
- 🔄 App Status: Check deployment status
- ⚡ Cold Starts: Normal behavior on free tier

---

## 🎉 **Congratulations!**

**Your Aggrekart Pilot API System is fully deployed and tested on Render!**

### **What You've Achieved:**
✅ **Live Production Environment** - APIs running on Render cloud
✅ **Real SMS Integration** - Twilio working in production  
✅ **Secure Authentication** - JWT tokens and OTP system
✅ **Complete API Suite** - All pilot operations available
✅ **Mobile App Ready** - Production URLs and examples provided
✅ **Comprehensive Testing** - Full Postman documentation
✅ **Real User Data** - Actual deliveries and pilot information

### **Next Steps:**
1. **Connect Mobile App** - Use production URLs
2. **Deploy Mobile App** - Submit to app stores
3. **Monitor Performance** - Watch Render metrics
4. **Scale as Needed** - Upgrade Render plan when required

**🚀 Your pilot management system is now live and ready for production use!**