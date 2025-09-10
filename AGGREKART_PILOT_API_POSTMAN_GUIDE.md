# Aggrekart Pilot API - Postman Testing Guide

## Overview
This guide provides comprehensive Postman collection setup for testing all Aggrekart Pilot APIs in both local development and production environments.

**Base URLs:**
- **Local**: `http://localhost:5000`
- **Production**: `https://aggrekart-com-backend.onrender.com`

---

## 🚀 Quick Setup

### 1. Create Postman Environment

**Environment Name:** `Aggrekart Pilot - Production`

**Variables:**
```json
{
  "baseUrl": "https://aggrekart-com-backend.onrender.com",
  "pilotToken": "",
  "pilotPhoneNumber": "9876543210",
  "testOrderId": "AGK1756349965508KF3"
}
```

**Environment Name:** `Aggrekart Pilot - Local`

**Variables:**
```json
{
  "baseUrl": "http://localhost:5000",
  "pilotToken": "",
  "pilotPhoneNumber": "9876543210",
  "testOrderId": "AGK1756349965508KF3"
}
```

---

## 📱 API Endpoints Collection

### 1. 🔐 Authentication APIs

#### 1.1 Request OTP (Login Step 1)
```
POST {{baseUrl}}/api/pilot/login
Content-Type: application/json

{
  "phoneNumber": "{{pilotPhoneNumber}}"
}
```

**Response Example:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "otpSent": true,
    "otp": "393741"
  }
}
```

**Test Script (Auto-extract OTP):**
```javascript
pm.test("OTP Request Successful", function () {
    pm.response.to.have.status(200);
    var jsonData = pm.response.json();
    pm.expect(jsonData.success).to.be.true;
    
    // Auto-extract OTP for next request
    if (jsonData.data && jsonData.data.otp) {
        pm.environment.set("receivedOTP", jsonData.data.otp);
        console.log("OTP extracted: " + jsonData.data.otp);
    }
});
```

#### 1.2 Complete Login (Login Step 2)
```
POST {{baseUrl}}/api/pilot/login
Content-Type: application/json

{
  "phoneNumber": "{{pilotPhoneNumber}}",
  "otp": "{{receivedOTP}}"
}
```

**Response Example:**
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
      "isAvailable": false,
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

**Test Script (Auto-extract Token):**
```javascript
pm.test("Login Successful", function () {
    pm.response.to.have.status(200);
    var jsonData = pm.response.json();
    pm.expect(jsonData.success).to.be.true;
    
    // Auto-extract token for subsequent requests
    if (jsonData.data && jsonData.data.token) {
        pm.environment.set("pilotToken", jsonData.data.token);
        console.log("Token extracted and saved");
    }
});
```

---

### 2. 📊 Profile & Stats APIs

#### 2.1 Get Pilot Profile
```
GET {{baseUrl}}/api/pilot/profile
Authorization: Bearer {{pilotToken}}
```

#### 2.2 Get Pilot Statistics
```
GET {{baseUrl}}/api/pilot/stats
Authorization: Bearer {{pilotToken}}
```

**Response Example:**
```json
{
  "success": true,
  "data": {
    "pilot": {
      "pilotId": "PIL000001",
      "name": "Test Pilot",
      "rating": {
        "average": 5,
        "count": 1
      },
      "totalDeliveries": 1,
      "isAvailable": false
    },
    "stats": {
      "totalDeliveries": 1,
      "totalRevenue": 148,
      "avgDeliveryTime": 148,
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

### 3. 📍 Location & Availability APIs

#### 3.1 Update Pilot Location
```
POST {{baseUrl}}/api/pilot/update-location
Authorization: Bearer {{pilotToken}}
Content-Type: application/json

{
  "latitude": 20.2961,
  "longitude": 85.8245
}
```

**Response Example:**
```json
{
  "success": true,
  "message": "Location updated successfully",
  "data": {
    "location": {
      "latitude": 20.2961,
      "longitude": 85.8245,
      "lastUpdated": "2025-09-04T09:46:42.558Z"
    }
  }
}
```

#### 3.2 Update Pilot Availability
```
POST {{baseUrl}}/api/pilot/availability
Authorization: Bearer {{pilotToken}}
Content-Type: application/json

{
  "isAvailable": true,
  "location": {
    "latitude": 20.2961,
    "longitude": 85.8245
  }
}
```

---

### 4. 🗺️ Available Nearby Orders API (NEW)

#### 4.1 Get Available Nearby Orders (Default)
```
GET {{baseUrl}}/api/pilot/available-nearby-orders
Authorization: Bearer {{pilotToken}}
```

#### 4.2 Get Available Nearby Orders (Custom Radius)
```
GET {{baseUrl}}/api/pilot/available-nearby-orders?radius=5
Authorization: Bearer {{pilotToken}}
```

#### 4.3 Get Available Nearby Orders (With Pagination)
```
GET {{baseUrl}}/api/pilot/available-nearby-orders?radius=10&page=1&limit=3
Authorization: Bearer {{pilotToken}}
```

#### 4.4 Get Available Nearby Orders (Urgent Only)
```
GET {{baseUrl}}/api/pilot/available-nearby-orders?radius=15&orderType=urgent
Authorization: Bearer {{pilotToken}}
```

#### 4.5 Get Available Nearby Orders (Normal Only)
```
GET {{baseUrl}}/api/pilot/available-nearby-orders?radius=15&orderType=normal
Authorization: Bearer {{pilotToken}}
```

**Response Example:**
```json
{
  "success": true,
  "message": "Found 2 available orders within 15km radius",
  "data": {
    "orders": [
      {
        "_id": "689e24d2ee6b31be0f10a1d3",
        "orderId": "AGK17551945784118TC",
        "customer": {
          "name": "Subhankar Dash",
          "phoneNumber": "7681879862",
          "address": "6 Nandankanan Road, Patia"
        },
        "supplier": {
          "companyName": "subankar trader",
          "contactNumber": "7681879863",
          "address": "Saheed Nagar, Bhubaneswar, Odisha, India"
        },
        "deliveryLocation": {
          "pickup": "Saheed Nagar, Bhubaneswar, Odisha, India",
          "drop": "6 Nandankanan Road, Patia",
          "coordinates": {
            "latitude": 20.338594,
            "longitude": 85.822235
          }
        },
        "orderDetails": {
          "totalAmount": 246,
          "transportCost": 236.79,
          "itemsCount": 1,
          "estimatedEarning": 165.75,
          "orderTime": "2025-08-14T18:02:58.433Z",
          "status": "processing"
        },
        "distance": 4.73,
        "priority": "high",
        "notes": "",
        "estimatedDeliveryTime": "2-3 business days"
      }
    ],
    "summary": {
      "totalAvailableOrders": 2,
      "ordersInCurrentPage": 2,
      "totalPotentialEarnings": 18149.28,
      "averageDistance": 4.73
    },
    "filters": {
      "radius": 15,
      "orderType": "all",
      "pilotLocation": {
        "latitude": 20.2961,
        "longitude": 85.8245,
        "lastUpdated": "2025-09-04T09:46:42.558Z"
      }
    },
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalItems": 2,
      "hasNext": false,
      "hasPrev": false,
      "itemsPerPage": 10
    }
  }
}
```

**Query Parameters:**
- `radius` (optional): Search radius in kilometers (default: 15)
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Items per page (default: 10, max: 20)
- `orderType` (optional): Filter by order type (`urgent`, `normal`, `all`)

---

### 5. 📦 Order Management APIs

#### 5.1 Scan Order
```
POST {{baseUrl}}/api/pilot/scan-order
Authorization: Bearer {{pilotToken}}
Content-Type: application/json

{
  "orderId": "{{testOrderId}}"
}
```

#### 5.2 Accept Order
```
POST {{baseUrl}}/api/pilot/accept-order
Authorization: Bearer {{pilotToken}}
Content-Type: application/json

{
  "orderId": "{{testOrderId}}",
  "pilotId": "PIL000001"
}
```

#### 5.3 Update Order Status
```
POST {{baseUrl}}/api/pilot/update-order-status
Authorization: Bearer {{pilotToken}}
Content-Type: application/json

{
  "orderId": "{{testOrderId}}",
  "status": "picked_up"
}
```

**Valid Status Values:**
- `assigned`
- `picked_up`
- `in_transit`
- `delivered`
- `cancelled`

---

### 6. 📋 History & Records APIs

#### 6.1 Get Delivery History
```
GET {{baseUrl}}/api/pilot/delivery-history
Authorization: Bearer {{pilotToken}}
```

#### 6.2 Get Delivery History (With Pagination)
```
GET {{baseUrl}}/api/pilot/delivery-history?page=1&limit=5
Authorization: Bearer {{pilotToken}}
```

**Response Example:**
```json
{
  "success": true,
  "data": {
    "deliveries": [
      {
        "orderId": "AGK1755273478411UWC",
        "customer": {
          "_id": "689209c693ad74cc3ed85507",
          "name": "Subhankar Dash",
          "phoneNumber": "7681879862"
        },
        "supplier": {
          "_id": "6883d69df2e9353f0a533ed9",
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
        "deliveredAt": "2025-09-01T19:38:31.034Z",
        "orderDate": "2025-08-15T15:57:58.432Z",
        "deliveryNotes": "Package delivered successfully to customer"
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

### 7. 🔔 Support & Configuration APIs

#### 7.1 Get App Configuration
```
GET {{baseUrl}}/api/pilot/app/config
Authorization: Bearer {{pilotToken}}
```

**Response Example:**
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

#### 7.2 Get Notifications
```
GET {{baseUrl}}/api/pilot/notifications
Authorization: Bearer {{pilotToken}}
```

#### 7.3 Get Support Information
```
GET {{baseUrl}}/api/pilot/support
Authorization: Bearer {{pilotToken}}
```

---

## 🧪 Comprehensive Test Scenarios

### Test Scenario 1: Complete Authentication Flow
1. **Request OTP** → Extract OTP from response
2. **Complete Login** → Extract token from response
3. **Get Profile** → Verify pilot details

### Test Scenario 2: Location & Nearby Orders Flow
1. **Update Location** → Set pilot coordinates
2. **Get Nearby Orders (Default)** → Test default parameters
3. **Get Nearby Orders (5km)** → Test custom radius
4. **Get Nearby Orders (Urgent)** → Test filtering
5. **Get Nearby Orders (Paginated)** → Test pagination

### Test Scenario 3: Order Management Flow
1. **Scan Order** → Test order scanning
2. **Accept Order** → Test order acceptance
3. **Update Status** → Test status updates
4. **Get Delivery History** → Verify completed deliveries

---

## 📝 Postman Collection JSON

```json
{
  "info": {
    "name": "Aggrekart Pilot APIs",
    "description": "Complete collection for testing Aggrekart Pilot APIs",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "https://aggrekart-com-backend.onrender.com"
    },
    {
      "key": "pilotToken",
      "value": ""
    },
    {
      "key": "pilotPhoneNumber",
      "value": "9876543210"
    }
  ],
  "item": [
    {
      "name": "Authentication",
      "item": [
        {
          "name": "Request OTP",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"phoneNumber\": \"{{pilotPhoneNumber}}\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/api/pilot/login",
              "host": ["{{baseUrl}}"],
              "path": ["api", "pilot", "login"]
            }
          },
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test(\"OTP Request Successful\", function () {",
                  "    pm.response.to.have.status(200);",
                  "    var jsonData = pm.response.json();",
                  "    pm.expect(jsonData.success).to.be.true;",
                  "    ",
                  "    if (jsonData.data && jsonData.data.otp) {",
                  "        pm.environment.set(\"receivedOTP\", jsonData.data.otp);",
                  "        console.log(\"OTP extracted: \" + jsonData.data.otp);",
                  "    }",
                  "});"
                ]
              }
            }
          ]
        },
        {
          "name": "Complete Login",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"phoneNumber\": \"{{pilotPhoneNumber}}\",\n  \"otp\": \"{{receivedOTP}}\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/api/pilot/login",
              "host": ["{{baseUrl}}"],
              "path": ["api", "pilot", "login"]
            }
          },
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test(\"Login Successful\", function () {",
                  "    pm.response.to.have.status(200);",
                  "    var jsonData = pm.response.json();",
                  "    pm.expect(jsonData.success).to.be.true;",
                  "    ",
                  "    if (jsonData.data && jsonData.data.token) {",
                  "        pm.environment.set(\"pilotToken\", jsonData.data.token);",
                  "        console.log(\"Token extracted and saved\");",
                  "    }",
                  "});"
                ]
              }
            }
          ]
        }
      ]
    },
    {
      "name": "Nearby Orders API",
      "item": [
        {
          "name": "Update Location",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              },
              {
                "key": "Authorization",
                "value": "Bearer {{pilotToken}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"latitude\": 20.2961,\n  \"longitude\": 85.8245\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/api/pilot/update-location",
              "host": ["{{baseUrl}}"],
              "path": ["api", "pilot", "update-location"]
            }
          }
        },
        {
          "name": "Get Nearby Orders - Default",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{pilotToken}}"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/pilot/available-nearby-orders",
              "host": ["{{baseUrl}}"],
              "path": ["api", "pilot", "available-nearby-orders"]
            }
          }
        },
        {
          "name": "Get Nearby Orders - 5km Radius",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{pilotToken}}"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/pilot/available-nearby-orders?radius=5",
              "host": ["{{baseUrl}}"],
              "path": ["api", "pilot", "available-nearby-orders"],
              "query": [
                {
                  "key": "radius",
                  "value": "5"
                }
              ]
            }
          }
        },
        {
          "name": "Get Nearby Orders - Urgent Only",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{pilotToken}}"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/pilot/available-nearby-orders?radius=15&orderType=urgent",
              "host": ["{{baseUrl}}"],
              "path": ["api", "pilot", "available-nearby-orders"],
              "query": [
                {
                  "key": "radius",
                  "value": "15"
                },
                {
                  "key": "orderType",
                  "value": "urgent"
                }
              ]
            }
          }
        },
        {
          "name": "Get Nearby Orders - Paginated",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{pilotToken}}"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/pilot/available-nearby-orders?radius=10&page=1&limit=3",
              "host": ["{{baseUrl}}"],
              "path": ["api", "pilot", "available-nearby-orders"],
              "query": [
                {
                  "key": "radius",
                  "value": "10"
                },
                {
                  "key": "page",
                  "value": "1"
                },
                {
                  "key": "limit",
                  "value": "3"
                }
              ]
            }
          }
        }
      ]
    }
  ]
}
```

---

## 🎯 Quick Testing Guide

### 1. **Import Collection**
- Copy the JSON above into a new Postman collection
- Set up environment variables as shown

### 2. **Authentication Sequence**
1. Run "Request OTP" → Check console for extracted OTP
2. Run "Complete Login" → Check console for extracted token
3. All subsequent requests will use the auto-extracted token

### 3. **Test Nearby Orders API**
1. Run "Update Location" first
2. Test different radius values (3km, 5km, 10km, 25km)
3. Test filtering by order type (urgent/normal)
4. Test pagination with different page sizes

### 4. **Analyze Results**
- Check response times
- Verify data structure
- Test edge cases (no orders, large radius, etc.)

---

## 🔧 Environment Setup Tips

**For Production Testing:**
- Use real pilot phone numbers from your database
- Test with actual order data
- Monitor API rate limits

**For Local Testing:**
- Ensure MongoDB is running
- Check that pilot data exists in local database
- Use `http://localhost:5000` as base URL

---

## 📞 Support

If you encounter issues:
1. Check authentication token validity
2. Verify pilot exists in database
3. Ensure location is updated before testing nearby orders
4. Check API logs for detailed error messages

**Contact:** support@aggrekart.com  
**Developer:** 📧 dev@aggrekart.com

---

*Last Updated: September 4, 2025*