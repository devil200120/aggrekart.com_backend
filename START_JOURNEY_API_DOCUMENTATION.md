# 🚛 Start Journey API - Complete Documentation

## 📋 API Overview

**Endpoint**: `POST /api/pilot/start-journey`  
**Description**: Start journey to delivery location  
**Access**: Private (Pilot Authentication Required)  
**Purpose**: Notify system and customer that pilot has started journey to delivery location

---

## 🔐 Authentication

### Required Headers
```json
{
  "Authorization": "Bearer {your_jwt_token}",
  "Content-Type": "application/json"
}
```

**Note**: JWT token obtained from pilot login API is required.

---

## 📤 Request Structure

### HTTP Method
```
POST /api/pilot/start-journey
```

### Request Body
```json
{
  "orderId": "ORD001234567890",
  "currentLocation": {
    "latitude": 19.0760,
    "longitude": 72.8777
  }
}
```

### Field Validation
| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `orderId` | String | ✅ Yes | Non-empty | Order ID from scan-order API |
| `currentLocation.latitude` | Number | ✅ Yes | -90 to 90 | Current GPS latitude |
| `currentLocation.longitude` | Number | ✅ Yes | -180 to 180 | Current GPS longitude |

---

## 📥 Response Structure

### Success Response (200)
```json
{
  "success": true,
  "message": "Journey started successfully",
  "data": {
    "estimatedDeliveryTime": "2-4 hours",
    "customerLocation": [72.8777, 19.0760]
  }
}
```

### Response Fields
| Field | Type | Description |
|-------|------|-------------|
| `success` | Boolean | Always `true` for successful requests |
| `message` | String | Success confirmation message |
| `data.estimatedDeliveryTime` | String | Expected delivery time from order |
| `data.customerLocation` | Array | Customer coordinates [longitude, latitude] |

---

## ❌ Error Responses

### Validation Error (400)
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "currentLocation.latitude",
      "message": "Valid latitude required"
    }
  ]
}
```

### Authentication Error (401)
```json
{
  "success": false,
  "message": "Access denied. No token provided"
}
```

### Order Not Found (404)
```json
{
  "success": false,
  "message": "Order not found"
}
```

### Server Error (500)
```json
{
  "success": false,
  "message": "Internal server error"
}
```

---

## 🔄 Business Logic Flow

### What Happens When API is Called:

1. **🔍 Validation**
   - Validates JWT token (pilotAuth middleware)
   - Validates orderId (non-empty)
   - Validates latitude (-90 to 90 range)
   - Validates longitude (-180 to 180 range)

2. **📋 Order Lookup**
   - Searches for order by `orderId` with status `'dispatched'`
   - If orderId is ObjectId format, also searches by `_id`
   - Populates customer phone number for notifications

3. **📝 Order Timeline Update**
   - Adds new timeline entry:
     ```json
     {
       "status": "dispatched",
       "timestamp": "2025-01-15T10:30:00.000Z",
       "note": "Driver started journey to delivery location"
     }
     ```

4. **📍 Pilot Location Update**
   - Finds pilot by `order.delivery.pilotAssigned`
   - Updates pilot's current location using `pilot.updateLocation()`
   - Saves new coordinates and timestamp

5. **📱 Customer Notification**
   - Sends SMS to customer with message:
     > "Your order {orderId} is on the way! Expected delivery: {estimatedTime}. Track your order in the app."

6. **✅ Response Generation**
   - Returns success response with delivery time and customer location

---

## 🔧 Prerequisites

### Before Calling This API:
1. **Pilot Authentication**: Must have valid JWT token from login
2. **Order Status**: Order must have status `'dispatched'`
3. **Pilot Assignment**: Order must have `delivery.pilotAssigned` field
4. **Previous API Calls**: 
   - `POST /api/pilot/login` (to get token)
   - `POST /api/pilot/scan-order` (to get order details)
   - `POST /api/pilot/accept-order` (to accept the order)

---

## 📱 Usage Examples

### Example 1: Mumbai Delivery
```json
{
  "orderId": "ORD001234567890",
  "currentLocation": {
    "latitude": 19.0760,
    "longitude": 72.8777
  }
}
```

### Example 2: Delhi Delivery
```json
{
  "orderId": "ORD987654321098",
  "currentLocation": {
    "latitude": 28.6139,
    "longitude": 77.2090
  }
}
```

### Example 3: Bangalore Delivery
```json
{
  "orderId": "ORD456789012345",
  "currentLocation": {
    "latitude": 12.9716,
    "longitude": 77.5946
  }
}
```

---

## 🚨 Common Error Scenarios

### 1. Invalid Coordinates
**Request**:
```json
{
  "orderId": "ORD001234567890",
  "currentLocation": {
    "latitude": 95.0000,  // Invalid: > 90
    "longitude": 72.8777
  }
}
```

**Response (400)**:
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "currentLocation.latitude",
      "message": "Valid latitude required"
    }
  ]
}
```

### 2. Missing Order ID
**Request**:
```json
{
  "currentLocation": {
    "latitude": 19.0760,
    "longitude": 72.8777
  }
}
```

**Response (400)**:
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "orderId",
      "message": "Order ID is required"
    }
  ]
}
```

### 3. Order Not in Dispatched Status
**Response (404)**:
```json
{
  "success": false,
  "message": "Order not found"
}
```

---

## 🔗 API Sequence Flow

```
1. POST /api/pilot/login
   ↓
2. POST /api/pilot/scan-order
   ↓
3. POST /api/pilot/accept-order
   ↓
4. POST /api/pilot/start-journey  ← YOU ARE HERE
   ↓
5. POST /api/pilot/update-location (optional, multiple times)
   ↓
6. POST /api/pilot/complete-delivery
```

---

## 📍 GPS Coordinate Guidelines

### Latitude Range
- **Valid**: -90.0000 to 90.0000
- **Examples**: 
  - Mumbai: 19.0760
  - Delhi: 28.6139
  - Bangalore: 12.9716

### Longitude Range
- **Valid**: -180.0000 to 180.0000
- **Examples**:
  - Mumbai: 72.8777
  - Delhi: 77.2090
  - Bangalore: 77.5946

### Decimal Precision
- **Recommended**: 4-6 decimal places for accuracy
- **Example**: `19.076040, 72.877660`

---

## 📞 Support Information

### API Support
- **Email**: support@aggrekart.com
- **Phone**: +91-9876543210
- **Documentation**: This API guide
- **Environment**: Available for testing 24/7

### Development Notes
- **Base URL (Local)**: `http://localhost:5000`
- **Base URL (Production)**: `https://aggrekart-backend.onrender.com`
- **Rate Limiting**: Standard API rate limits apply
- **SMS Integration**: Real SMS sent in production environment

---

## 📊 Success Metrics

After successful API call:
- ✅ Order timeline updated with journey start
- ✅ Pilot location updated in database
- ✅ Customer notified via SMS
- ✅ Delivery tracking activated
- ✅ System ready for location updates

---

**Document Version**: 1.0  
**Last Updated**: September 5, 2025  
**API Version**: Current Production  
**File**: `START_JOURNEY_API_DOCUMENTATION.md`