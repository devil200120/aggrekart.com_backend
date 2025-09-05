# 🚚 Aggrekart Pilot API - Postman Documentation

## 📋 Overview
This documentation covers all pilot-related API endpoints for the Aggrekart platform. Use this collection to test pilot registration, authentication, order management, and delivery operations.

## 🌐 Base URLs
- **Local Development**: `http://localhost:5000/api/pilot`
- **Production**: `https://aggrekart-com-backend.onrender.com/api/pilot`

## 🔧 Environment Variables
Create the following environment variables in Postman:

```json
{
  "base_url": "https://aggrekart-com-backend.onrender.com/api/pilot",
  "local_url": "http://localhost:5000/api/pilot",
  "pilot_token": "",
  "pilot_id": "",
  "test_phone": "9876543210",
  "test_order_id": "AGK1756201614516ANT"
}
```

---

## 📁 Collection Structure

### 1️⃣ **PUBLIC ENDPOINTS**

#### 🏥 Health Check
```http
GET {{base_url}}/../health
```
**Description**: Check if the server is running
**Response**:
```json
{
  "success": true,
  "message": "Aggrekart API is running",
  "environment": "development",
  "timestamp": "2025-09-03T14:36:47.986Z"
}
```

#### ⚙️ App Configuration
```http
GET {{base_url}}/app/config
```
**Description**: Get app configuration and support information
**Response**:
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

#### ❓ Support FAQs
```http
GET {{base_url}}/support/faqs
```
**Description**: Get frequently asked questions for pilots
**Response**:
```json
{
  "success": true,
  "data": {
    "faqs": [
      {
        "question": "How do I accept an order?",
        "answer": "Tap on the order notification and click 'Accept Order' button."
      }
    ]
  }
}
```

---

### 2️⃣ **AUTHENTICATION**

#### 📱 Request Login OTP
```http
POST {{base_url}}/login
Content-Type: application/json

{
  "phoneNumber": "{{test_phone}}"
}
```
**Description**: Request OTP for pilot login
**Response**:
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "otpSent": true,
    "otp": "123456"
  }
}
```

**Test Script** (Add to Tests tab):
```javascript
if (pm.response.code === 200) {
    const response = pm.response.json();
    if (response.data && response.data.otp) {
        pm.environment.set("otp", response.data.otp);
    }
}
```

#### 🔑 Login with OTP
```http
POST {{base_url}}/login
Content-Type: application/json

{
  "phoneNumber": "{{test_phone}}",
  "otp": "{{otp}}"
}
```
**Description**: Login with OTP and get authentication token
**Response**:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "pilot": {
      "pilotId": "PIL000001",
      "name": "Test Pilot",
      "phoneNumber": "9876543210"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Test Script**:
```javascript
if (pm.response.code === 200) {
    const response = pm.response.json();
    if (response.data && response.data.token) {
        pm.environment.set("pilot_token", response.data.token);
        pm.environment.set("pilot_id", response.data.pilot.pilotId);
    }
}
```

---

### 3️⃣ **PILOT MANAGEMENT** (Requires Authentication)

#### 👤 Get Pilot Profile
```http
GET {{base_url}}/profile/{{pilot_id}}
Authorization: Bearer {{pilot_token}}
```
**Description**: Get detailed pilot profile information
**Response**:
```json
{
  "success": true,
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
      "rating": {
        "average": 5,
        "count": 1
      }
    },
    "recentDeliveries": [],
    "stats": {
      "totalDeliveries": 1,
      "documentsValid": false
    }
  }
}
```

#### 📊 Get Pilot Statistics
```http
GET {{base_url}}/stats
Authorization: Bearer {{pilot_token}}
```
**Description**: Get pilot performance statistics and earnings

#### 📱 Dashboard Stats
```http
GET {{base_url}}/dashboard/stats
Authorization: Bearer {{pilot_token}}
```
**Description**: Get today's dashboard statistics
**Response**:
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
      }
    }
  }
}
```

#### 🔔 Dashboard Notifications
```http
GET {{base_url}}/dashboard/notifications
Authorization: Bearer {{pilot_token}}
```
**Description**: Get pilot notifications and alerts

#### 📍 Update Pilot Location
```http
POST {{base_url}}/update-location
Authorization: Bearer {{pilot_token}}
Content-Type: application/json

{
  "latitude": 12.9716,
  "longitude": 77.5946
}
```
**Description**: Update pilot's current GPS location
**Response**:
```json
{
  "success": true,
  "message": "Location updated successfully",
  "data": {
    "location": {
      "latitude": 12.9716,
      "longitude": 77.5946,
      "lastUpdated": "2025-09-03T14:36:57.475Z"
    }
  }
}
```

---

### 4️⃣ **ORDER MANAGEMENT** (Critical Endpoints)

#### 🔍 Scan Order QR Code
```http
POST {{base_url}}/scan-order
Authorization: Bearer {{pilot_token}}
Content-Type: application/json

{
  "orderId": "{{test_order_id}}"
}
```
**Description**: **[RECENTLY FIXED]** Scan order to get pickup/delivery details
**Response**:
```json
{
  "success": true,
  "data": {
    "order": {
      "orderId": "AGK1756201614516ANT",
      "customer": {
        "name": "Subhankar Dash",
        "phoneNumber": "7681879862",
        "address": "Suchitra X Rd, Ramraju Nagar, Jeedimetla, Hyderabad"
      },
      "supplier": {
        "companyName": "subankar trader",
        "contactNumber": "7681879863",
        "address": "Saheed Nagar, Bhubaneswar, Odisha, India"
      },
      "deliveryAddress": {
        "pickup": "Saheed Nagar, Bhubaneswar, Odisha, India",
        "drop": "Suchitra X Rd, Ramraju Nagar, Jeedimetla, Hyderabad"
      },
      "items": [
        {
          "name": "aggregate_bala_product",
          "quantity": 29,
          "unit": "pieces",
          "totalPrice": 11600
        }
      ],
      "pricing": {
        "subtotal": 11600,
        "transportCost": 124883.33,
        "gstAmount": 2088,
        "totalAmount": 14268
      },
      "totalAmount": 14268,
      "status": "dispatched"
    }
  }
}
```

**✅ Fix Summary**: This endpoint now correctly returns:
- Customer delivery address (not "N/A")
- Supplier pickup address (not "N/A") 
- Correct total amount (not ₹0)

#### ✅ Accept Order Assignment
```http
POST {{base_url}}/accept-order
Authorization: Bearer {{pilot_token}}
Content-Type: application/json

{
  "orderId": "{{test_order_id}}",
  "pilotId": "{{pilot_id}}"
}
```
**Description**: Accept an order for delivery

#### 🚛 Start Journey
```http
POST {{base_url}}/start-journey
Authorization: Bearer {{pilot_token}}
Content-Type: application/json

{
  "orderId": "{{test_order_id}}",
  "currentLocation": {
    "latitude": 12.9716,
    "longitude": 77.5946
  }
}
```
**Description**: Start journey to delivery location

#### ✅ Complete Delivery
```http
POST {{base_url}}/complete-delivery
Authorization: Bearer {{pilot_token}}
Content-Type: application/json

{
  "orderId": "{{test_order_id}}",
  "deliveryOTP": "123456",
  "deliveryNotes": "Package delivered successfully",
  "customerRating": 5
}
```
**Description**: Complete delivery with OTP verification

---

### 5️⃣ **DELIVERY HISTORY**

#### 📋 Get Delivery History
```http
GET {{base_url}}/delivery-history?page=1&limit=5
Authorization: Bearer {{pilot_token}}
```
**Description**: Get paginated delivery history
**Query Parameters**:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 50)
- `status`: Filter by status (optional)

**Response**:
```json
{
  "success": true,
  "data": {
    "deliveries": [
      {
        "orderId": "AGK1755273478411UWC",
        "customer": {
          "name": "Subhankar Dash",
          "phoneNumber": "7681879862"
        },
        "supplier": {
          "companyName": "subankar trader"
        },
        "deliveryAddress": {
          "address": "Suchitra X Rd, Ramraju Nagar, Jeedimetla, Hyderabad",
          "city": "Hyderabad",
          "state": "Telangana",
          "pincode": "500067"
        },
        "totalAmount": 148,
        "status": "delivered",
        "deliveredAt": "2025-09-01T19:38:31.034Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalItems": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
}
```

---

### 6️⃣ **SUPPORT**

#### 🆘 Submit Support Request
```http
POST {{base_url}}/support/contact
Authorization: Bearer {{pilot_token}}
Content-Type: application/json

{
  "subject": "Test Support Request",
  "message": "This is a test support message",
  "priority": "medium"
}
```
**Description**: Submit a support ticket
**Priority Options**: `low`, `medium`, `high`
**Response**:
```json
{
  "success": true,
  "message": "Support request submitted successfully",
  "data": {
    "ticketId": "1756910219614",
    "status": "submitted"
  }
}
```

---

## 🧪 **TESTING WORKFLOW**

### Quick Test Sequence:
1. **Health Check** → Verify server is running
2. **Request OTP** → Get OTP for test phone number
3. **Login** → Get authentication token
4. **Scan Order** → Test the fixed address endpoint
5. **Update Location** → Test location tracking
6. **Get Stats** → Verify pilot data

### Test Data:
- **Test Phone**: `9876543210`
- **Test Order ID**: `AGK1756201614516ANT`
- **Test Location**: `12.9716, 77.5946` (Bangalore)

---

## 🚨 **RECENT BUG FIXES**

### ✅ Scan Order Address Fix
**Issue**: Pilot app was showing "N/A" for pickup/drop addresses and ₹0 amount
**Fix Applied**: Updated scan-order endpoint to correctly fetch:
- Customer address from `deliveryAddress.address`
- Supplier address from `companyAddress` or `dispatchLocation.address`
- Proper amount calculation

**Status**: ✅ **FIXED** - Both local and production environments working correctly

---

## 📱 **Mobile App Integration**

### Authentication Flow:
```
1. POST /login (phone) → Get OTP
2. POST /login (phone + OTP) → Get Token
3. Use Token in Authorization header for all subsequent requests
```

### Order Workflow:
```
1. POST /scan-order → Get order details
2. POST /accept-order → Accept the order
3. POST /start-journey → Begin delivery
4. POST /complete-delivery → Finish with OTP
```

### Real-time Updates:
```
- POST /update-location → Send GPS coordinates
- GET /dashboard/notifications → Check for new orders
- GET /dashboard/stats → Update dashboard
```

---

## 🔗 **Import Instructions**

1. **Create New Collection** in Postman
2. **Import** this documentation as Markdown
3. **Set Environment Variables**:
   - `base_url`: Your server URL
   - `test_phone`: Your pilot phone number
   - `test_order_id`: Valid order ID from your database
4. **Run Collection** or individual requests

**Collection JSON Export** available on request for direct import.

---

## 📞 **Support**
- **API Issues**: Contact backend team
- **Mobile Integration**: Refer to mobile development docs
- **Production Access**: Use Render.com URL with proper environment variables

**Last Updated**: September 3, 2025
**API Version**: 1.0.0