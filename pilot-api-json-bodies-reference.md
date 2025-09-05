# 🚚 Aggrekart Pilot API - JSON Request Bodies Reference

## Quick Reference for All API Endpoints

### 1. 🔐 AUTHENTICATION ENDPOINTS

#### Register New Pilot
**POST** `/api/pilot/register`
```json
{
  "name": "Rajesh Kumar",
  "phoneNumber": "9876543210",
  "email": "rajesh.kumar@example.com",
  "vehicleDetails": {
    "registrationNumber": "MH12AB1234",
    "vehicleType": "truck",
    "capacity": 10
  },
  "drivingLicense": {
    "number": "MH1234567890123",
    "validTill": "2025-12-31T00:00:00.000Z"
  },
  "emergencyContact": {
    "name": "Sunita Kumar",
    "phoneNumber": "9876543211",
    "relation": "spouse"
  },
  "workingAreas": [
    {
      "pincode": "400001",
      "area": "Mumbai Central"
    },
    {
      "pincode": "400002", 
      "area": "Fort"
    }
  ]
}
```

#### Request OTP for Login
**POST** `/api/pilot/login`
```json
{
  "phoneNumber": "9876543210"
}
```

#### Login with OTP
**POST** `/api/pilot/login`
```json
{
  "phoneNumber": "9876543210",
  "otp": "123456"
}
```

---

### 2. 📦 ORDER MANAGEMENT ENDPOINTS

#### Scan Order QR Code
**POST** `/api/pilot/scan-order`
**Headers**: `Authorization: Bearer {token}`
```json
{
  "orderId": "ORD001234567890"
}
```

#### Accept Order Assignment
**POST** `/api/pilot/accept-order`
**Headers**: `Authorization: Bearer {token}`
```json
{
  "orderId": "ORD001234567890",
  "pilotId": "PIL000001"
}
```

#### Start Journey to Delivery
**POST** `/api/pilot/start-journey`
**Headers**: `Authorization: Bearer {token}`
```json
{
  "orderId": "ORD001234567890",
  "currentLocation": {
    "latitude": 19.0760,
    "longitude": 72.8777
  }
}
```

#### Complete Delivery with OTP
**POST** `/api/pilot/complete-delivery`
**Headers**: `Authorization: Bearer {token}`
```json
{
  "orderId": "ORD001234567890",
  "deliveryOTP": "123456",
  "deliveryNotes": "Delivered successfully at main gate",
  "customerRating": 5
}
```

---

### 3. 📍 LOCATION & TRACKING ENDPOINTS

#### Update Current Location
**POST** `/api/pilot/update-location`
**Headers**: `Authorization: Bearer {token}`
```json
{
  "latitude": 19.0850,
  "longitude": 72.8810
}
```

---

### 4. 📊 DASHBOARD & ANALYTICS ENDPOINTS

#### Get Dashboard Statistics
**GET** `/api/pilot/dashboard/stats`
**Headers**: `Authorization: Bearer {token}`
*No request body required*

#### Get Push Notifications
**GET** `/api/pilot/dashboard/notifications`
**Headers**: `Authorization: Bearer {token}`
*No request body required*

#### Get Delivery History (with pagination)
**GET** `/api/pilot/delivery-history?page=1&limit=10&status=delivered`
**Headers**: `Authorization: Bearer {token}`
*No request body required*

#### Get Pilot Profile
**GET** `/api/pilot/profile/{pilotId}`
**Headers**: `Authorization: Bearer {token}`
*No request body required*

#### Get Performance Stats
**GET** `/api/pilot/stats`
**Headers**: `Authorization: Bearer {token}`
*No request body required*

---

### 5. 🎫 SUPPORT & HELP ENDPOINTS

#### Submit Support Request
**POST** `/api/support/contact`
**Headers**: `Authorization: Bearer {token}`
```json
{
  "subject": "Payment Issue",
  "message": "I haven't received payment for order ORD001234567890. Please check and resolve this issue urgently.",
  "priority": "high"
}
```

#### Get FAQ Information
**GET** `/api/support/faqs`
*No request body required*

#### Get App Configuration
**GET** `/api/app/config`
*No request body required*

---

## 🌐 Base URLs

### Production (Render.com)
```
https://aggrekart-backend.onrender.com
```

### Local Development
```
http://localhost:5000
```

---

## 🔧 Sample Vehicle Types & Validation

### Vehicle Types (for registration)
```json
{
  "vehicleType": "truck",      // or "mini_truck", "pickup", "tractor", "trailer"
  "capacity": 10               // 1-50 MT (metric tons)
}
```

### Phone Number Format
```json
{
  "phoneNumber": "9876543210"  // 10-digit Indian mobile number starting with 6-9
}
```

### Registration Number Format
```json
{
  "registrationNumber": "MH12AB1234"  // Indian vehicle registration format
}
```

### Priority Levels (for support)
```json
{
  "priority": "high"           // "low", "medium", "high"
}
```

---

## 📱 Testing Flow

1. **Register** → Get pilot ID
2. **Login** → Get auth token
3. **Scan Order** → Get order details
4. **Accept Order** → Confirm assignment
5. **Start Journey** → Begin delivery
6. **Update Location** → Track progress
7. **Complete Delivery** → Finish with OTP

---

## 🔑 Authentication Headers

All protected endpoints require:
```
Authorization: Bearer {your_jwt_token}
Content-Type: application/json
```

---

## ⚠️ Important Notes

- **OTP Expiry**: 10 minutes
- **Token Expiry**: Check your JWT configuration
- **Rate Limiting**: Be mindful of API call frequency
- **Required Fields**: All fields marked as required must be included
- **Production SMS**: Real SMS will be sent in production environment

---

**File Location**: `Aggrekart_Pilot_APIs_Complete.postman_collection.json`
**Documentation**: `PILOT_API_POSTMAN_COMPLETE_GUIDE.md`