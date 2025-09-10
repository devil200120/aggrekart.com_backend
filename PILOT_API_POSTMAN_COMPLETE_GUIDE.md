# 🚚 Aggrekart Pilot API - Complete Postman Testing Guide

## 📋 Table of Contents
1. [Environment Setup](#environment-setup)
2. [Authentication Flow](#authentication-flow)
3. [API Endpoints with JSON Bodies](#api-endpoints)
4. [Step-by-Step Testing Guide](#testing-guide)
5. [Postman Collection JSON](#postman-collection)
6. [Error Handling](#error-handling)
7. [Testing Scenarios](#testing-scenarios)

---

## 🌐 Environment Setup

### Base URLs
- **Local Development**: `http://localhost:5000`
- **Production (Render)**: `https://aggrekart-backend.onrender.com`

### Postman Environment Variables
```json
{
  "baseUrl": "{{base_url}}",
  "authToken": "{{auth_token}}",
  "pilotId": "{{pilot_id}}",
  "orderId": "{{order_id}}"
}
```

---

## 🔐 Authentication Flow

### Step 1: Pilot Registration
**Endpoint**: `POST {{baseUrl}}/api/pilot/register`

**JSON Request Body**:
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

**Expected Response**:
```json
{
  "success": true,
  "message": "Pilot registration submitted successfully. You will be notified once approved.",
  "data": {
    "pilotId": "PIL000001",
    "status": "pending_approval"
  }
}
```

### Step 2: Request OTP for Login
**Endpoint**: `POST {{baseUrl}}/api/pilot/login`

**JSON Request Body**:
```json
{
  "phoneNumber": "9876543210"
}
```

**Expected Response**:
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

### Step 3: Verify OTP and Login
**Endpoint**: `POST {{baseUrl}}/api/pilot/login`

**JSON Request Body**:
```json
{
  "phoneNumber": "9876543210",
  "otp": "123456"
}
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "pilot": {
      "pilotId": "PIL000001",
      "name": "Rajesh Kumar",
      "phoneNumber": "9876543210",
      "vehicleDetails": {
        "registrationNumber": "MH12AB1234",
        "vehicleType": "truck",
        "capacity": 10
      },
      "isAvailable": true,
      "currentOrder": null,
      "totalDeliveries": 0,
      "rating": {
        "average": 0,
        "count": 0
      }
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**⚠️ Important**: Save the `token` to Postman environment variable `auth_token` for subsequent requests.

---

## 🚀 API Endpoints with JSON Bodies

### 1. 📱 Scan Order QR Code
**Endpoint**: `POST {{baseUrl}}/api/pilot/scan-order`
**Headers**: `Authorization: Bearer {{auth_token}}`

**JSON Request Body**:
```json
{
  "orderId": "ORD001234567890"
}
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "order": {
      "orderId": "ORD001234567890",
      "customer": {
        "name": "Amit Sharma",
        "phoneNumber": "9123456789",
        "address": "123 MG Road, Mumbai, Maharashtra 400001"
      },
      "supplier": {
        "companyName": "Mumbai Cement Supplies",
        "contactNumber": "9876543210",
        "address": "45 Industrial Area, Mumbai, Maharashtra 400002"
      },
      "deliveryAddress": {
        "pickup": "45 Industrial Area, Mumbai, Maharashtra 400002",
        "drop": "123 MG Road, Mumbai, Maharashtra 400001"
      },
      "items": [
        {
          "name": "OPC 53 Grade Cement",
          "quantity": 10,
          "unit": "bags",
          "totalPrice": 3500
        }
      ],
      "pricing": {
        "subtotal": 3500,
        "gst": 630,
        "transportCost": 500,
        "totalAmount": 4630
      },
      "totalAmount": 4630,
      "estimatedDeliveryTime": "2-4 hours",
      "specialInstructions": "Handle with care",
      "status": "confirmed"
    }
  }
}
```

### 2. ✅ Accept Order
**Endpoint**: `POST {{baseUrl}}/api/pilot/accept-order`
**Headers**: `Authorization: Bearer {{auth_token}}`

**JSON Request Body**:
```json
{
  "orderId": "ORD001234567890",
  "pilotId": "PIL000001"
}
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Order accepted successfully",
  "data": {
    "order": {
      "orderId": "ORD001234567890",
      "customerName": "Amit Sharma",
      "deliveryAddress": {
        "address": "123 MG Road, Mumbai, Maharashtra 400001",
        "coordinates": [72.8777, 19.0760]
      },
      "customerPhone": "9123456789"
    }
  }
}
```

### 3. 🚛 Start Journey
**Endpoint**: `POST {{baseUrl}}/api/pilot/start-journey`
**Headers**: `Authorization: Bearer {{auth_token}}`

**JSON Request Body**:
```json
{
  "orderId": "ORD001234567890",
  "currentLocation": {
    "latitude": 19.0760,
    "longitude": 72.8777
  }
}
```

**Expected Response**:
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

### 4. 📍 Update Location
**Endpoint**: `POST {{baseUrl}}/api/pilot/update-location`
**Headers**: `Authorization: Bearer {{auth_token}}`

**JSON Request Body**:
```json
{
  "latitude": 19.0850,
  "longitude": 72.8810
}
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Location updated successfully",
  "data": {
    "location": {
      "latitude": 19.0850,
      "longitude": 72.8810,
      "lastUpdated": "2025-01-15T10:30:00.000Z"
    }
  }
}
```

### 5. 🎯 Complete Delivery
**Endpoint**: `POST {{baseUrl}}/api/pilot/complete-delivery`
**Headers**: `Authorization: Bearer {{auth_token}}`

**JSON Request Body**:
```json
{
  "orderId": "ORD001234567890",
  "deliveryOTP": "123456",
  "deliveryNotes": "Delivered successfully at main gate",
  "customerRating": 5
}
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Delivery completed successfully",
  "data": {
    "order": {
      "orderId": "ORD001234567890",
      "status": "delivered",
      "deliveredAt": "2025-01-15T12:30:00.000Z"
    },
    "pilot": {
      "totalDeliveries": 1,
      "rating": {
        "average": 5.0,
        "count": 1
      },
      "isAvailable": true
    }
  }
}
```

### 6. 📊 Get Dashboard Stats
**Endpoint**: `GET {{baseUrl}}/api/pilot/dashboard/stats`
**Headers**: `Authorization: Bearer {{auth_token}}`

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "todayStats": {
      "totalOrders": 3,
      "totalEarnings": 1500,
      "completedOrders": 2
    },
    "pilotInfo": {
      "name": "Rajesh Kumar",
      "vehicleNumber": "MH12AB1234",
      "rating": 4.5,
      "totalDeliveries": 15
    }
  }
}
```

### 7. 🔔 Get Notifications
**Endpoint**: `GET {{baseUrl}}/api/pilot/dashboard/notifications`
**Headers**: `Authorization: Bearer {{auth_token}}`

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "60f7b3b3b3b3b3b3b3b3b3b3",
        "title": "New order from Amit Sharma",
        "message": "Order ORD001234567890 needs pickup",
        "type": "new_order",
        "timestamp": "2025-01-15T09:00:00.000Z"
      }
    ],
    "unreadCount": 1
  }
}
```

### 8. 📜 Get Delivery History
**Endpoint**: `GET {{baseUrl}}/api/pilot/delivery-history?page=1&limit=10&status=delivered`
**Headers**: `Authorization: Bearer {{auth_token}}`

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "deliveries": [
      {
        "orderId": "ORD001234567890",
        "customer": {
          "name": "Amit Sharma",
          "phoneNumber": "9123456789"
        },
        "supplier": {
          "companyName": "Mumbai Cement Supplies"
        },
        "deliveryAddress": {
          "address": "123 MG Road, Mumbai, Maharashtra 400001"
        },
        "totalAmount": 4630,
        "status": "delivered",
        "deliveredAt": "2025-01-15T12:30:00.000Z",
        "orderDate": "2025-01-15T08:00:00.000Z",
        "deliveryNotes": "Delivered successfully at main gate"
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

### 9. 👤 Get Pilot Profile
**Endpoint**: `GET {{baseUrl}}/api/pilot/profile/{{pilot_id}}`
**Headers**: `Authorization: Bearer {{auth_token}}`

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "pilot": {
      "pilotId": "PIL000001",
      "name": "Rajesh Kumar",
      "phoneNumber": "9876543210",
      "vehicleDetails": {
        "registrationNumber": "MH12AB1234",
        "vehicleType": "truck",
        "capacity": 10
      },
      "rating": {
        "average": 4.5,
        "count": 10
      },
      "totalDeliveries": 15,
      "isAvailable": true
    },
    "recentDeliveries": [
      {
        "orderId": "ORD001234567890",
        "deliveryAddress": {
          "address": "123 MG Road, Mumbai, Maharashtra 400001"
        },
        "pricing": {
          "totalAmount": 4630
        }
      }
    ],
    "stats": {
      "totalDeliveries": 15,
      "rating": {
        "average": 4.5,
        "count": 10
      },
      "documentsValid": true
    }
  }
}
```

### 10. 🎫 Submit Support Request
**Endpoint**: `POST {{baseUrl}}/api/support/contact`
**Headers**: `Authorization: Bearer {{auth_token}}`

**JSON Request Body**:
```json
{
  "subject": "Payment Issue",
  "message": "I haven't received payment for order ORD001234567890",
  "priority": "high"
}
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Support request submitted successfully",
  "data": {
    "ticketId": "1705312800000",
    "status": "submitted"
  }
}
```

### 11. ❓ Get FAQs
**Endpoint**: `GET {{baseUrl}}/api/support/faqs`

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "faqs": [
      {
        "question": "How do I accept an order?",
        "answer": "Tap on the order notification and click 'Accept Order' button."
      },
      {
        "question": "What if customer is not available?",
        "answer": "Call the customer and wait for 10 minutes. If still not available, contact support."
      },
      {
        "question": "How do I complete delivery?",
        "answer": "Get the OTP from customer and enter it in the app to complete delivery."
      }
    ]
  }
}
```

### 12. ⚙️ Get App Configuration
**Endpoint**: `GET {{baseUrl}}/api/app/config`

**Expected Response**:
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

## 📝 Step-by-Step Testing Guide

### Phase 1: Registration & Authentication
1. **Test Pilot Registration**
   - Send POST request to `/api/pilot/register`
   - Verify registration response with `pilotId`
   - Note: Pilot needs admin approval to become active

2. **Test Login Flow**
   - Send OTP request with phone number
   - Verify OTP response (check console in development)
   - Complete login with OTP
   - Save authentication token for subsequent requests

### Phase 2: Order Management
3. **Test Order Scanning**
   - Use a valid `orderId` from your database
   - Verify order details are returned correctly
   - Check pickup and delivery addresses

4. **Test Order Acceptance**
   - Accept the scanned order
   - Verify pilot status changes to unavailable
   - Check order assignment confirmation

5. **Test Journey Management**
   - Start journey with current location
   - Update location periodically
   - Verify location tracking works

6. **Test Delivery Completion**
   - Use correct delivery OTP from order
   - Complete delivery with rating
   - Verify pilot becomes available again

### Phase 3: Dashboard & Analytics
7. **Test Dashboard Features**
   - Get dashboard statistics
   - Check notification system
   - Verify delivery history pagination

8. **Test Profile Management**
   - Get pilot profile information
   - Verify statistics accuracy
   - Check document validation status

### Phase 4: Support & Configuration
9. **Test Support System**
   - Submit support requests
   - Get FAQ information
   - Verify ticket creation

10. **Test App Configuration**
    - Get app configuration
    - Verify support contact information
    - Check feature flags

---

## 🔧 Postman Collection JSON

```json
{
  "info": {
    "name": "Aggrekart Pilot API",
    "description": "Complete API collection for Aggrekart Pilot mobile app",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "base_url",
      "value": "http://localhost:5000",
      "type": "string"
    },
    {
      "key": "auth_token",
      "value": "",
      "type": "string"
    },
    {
      "key": "pilot_id", 
      "value": "",
      "type": "string"
    },
    {
      "key": "order_id",
      "value": "",
      "type": "string"
    }
  ],
  "item": [
    {
      "name": "Authentication",
      "item": [
        {
          "name": "Register Pilot",
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
              "raw": "{\n  \"name\": \"Rajesh Kumar\",\n  \"phoneNumber\": \"9876543210\",\n  \"email\": \"rajesh.kumar@example.com\",\n  \"vehicleDetails\": {\n    \"registrationNumber\": \"MH12AB1234\",\n    \"vehicleType\": \"truck\",\n    \"capacity\": 10\n  },\n  \"drivingLicense\": {\n    \"number\": \"MH1234567890123\",\n    \"validTill\": \"2025-12-31T00:00:00.000Z\"\n  },\n  \"emergencyContact\": {\n    \"name\": \"Sunita Kumar\",\n    \"phoneNumber\": \"9876543211\",\n    \"relation\": \"spouse\"\n  },\n  \"workingAreas\": [\n    {\n      \"pincode\": \"400001\",\n      \"area\": \"Mumbai Central\"\n    }\n  ]\n}"
            },
            "url": {
              "raw": "{{base_url}}/api/pilot/register",
              "host": ["{{base_url}}"],
              "path": ["api", "pilot", "register"]
            }
          }
        },
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
              "raw": "{\n  \"phoneNumber\": \"9876543210\"\n}"
            },
            "url": {
              "raw": "{{base_url}}/api/pilot/login",
              "host": ["{{base_url}}"],
              "path": ["api", "pilot", "login"]
            }
          }
        },
        {
          "name": "Login with OTP",
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
              "raw": "{\n  \"phoneNumber\": \"9876543210\",\n  \"otp\": \"123456\"\n}"
            },
            "url": {
              "raw": "{{base_url}}/api/pilot/login",
              "host": ["{{base_url}}"],
              "path": ["api", "pilot", "login"]
            }
          },
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "if (pm.response.code === 200) {",
                  "    const response = pm.response.json();",
                  "    if (response.success && response.data.token) {",
                  "        pm.environment.set('auth_token', response.data.token);",
                  "        pm.environment.set('pilot_id', response.data.pilot.pilotId);",
                  "    }",
                  "}"
                ]
              }
            }
          ]
        }
      ]
    },
    {
      "name": "Order Management",
      "item": [
        {
          "name": "Scan Order",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              },
              {
                "key": "Authorization",
                "value": "Bearer {{auth_token}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"orderId\": \"{{order_id}}\"\n}"
            },
            "url": {
              "raw": "{{base_url}}/api/pilot/scan-order",
              "host": ["{{base_url}}"],
              "path": ["api", "pilot", "scan-order"]
            }
          }
        },
        {
          "name": "Accept Order",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              },
              {
                "key": "Authorization",
                "value": "Bearer {{auth_token}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"orderId\": \"{{order_id}}\",\n  \"pilotId\": \"{{pilot_id}}\"\n}"
            },
            "url": {
              "raw": "{{base_url}}/api/pilot/accept-order",
              "host": ["{{base_url}}"],
              "path": ["api", "pilot", "accept-order"]
            }
          }
        },
        {
          "name": "Start Journey",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              },
              {
                "key": "Authorization",
                "value": "Bearer {{auth_token}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"orderId\": \"{{order_id}}\",\n  \"currentLocation\": {\n    \"latitude\": 19.0760,\n    \"longitude\": 72.8777\n  }\n}"
            },
            "url": {
              "raw": "{{base_url}}/api/pilot/start-journey",
              "host": ["{{base_url}}"],
              "path": ["api", "pilot", "start-journey"]
            }
          }
        },
        {
          "name": "Complete Delivery",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              },
              {
                "key": "Authorization",
                "value": "Bearer {{auth_token}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"orderId\": \"{{order_id}}\",\n  \"deliveryOTP\": \"123456\",\n  \"deliveryNotes\": \"Delivered successfully at main gate\",\n  \"customerRating\": 5\n}"
            },
            "url": {
              "raw": "{{base_url}}/api/pilot/complete-delivery",
              "host": ["{{base_url}}"],
              "path": ["api", "pilot", "complete-delivery"]
            }
          }
        }
      ]
    },
    {
      "name": "Dashboard & Analytics",
      "item": [
        {
          "name": "Get Dashboard Stats",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{auth_token}}"
              }
            ],
            "url": {
              "raw": "{{base_url}}/api/pilot/dashboard/stats",
              "host": ["{{base_url}}"],
              "path": ["api", "pilot", "dashboard", "stats"]
            }
          }
        },
        {
          "name": "Get Notifications",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{auth_token}}"
              }
            ],
            "url": {
              "raw": "{{base_url}}/api/pilot/dashboard/notifications",
              "host": ["{{base_url}}"],
              "path": ["api", "pilot", "dashboard", "notifications"]
            }
          }
        },
        {
          "name": "Get Delivery History",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{auth_token}}"
              }
            ],
            "url": {
              "raw": "{{base_url}}/api/pilot/delivery-history?page=1&limit=10&status=delivered",
              "host": ["{{base_url}}"],
              "path": ["api", "pilot", "delivery-history"],
              "query": [
                {
                  "key": "page",
                  "value": "1"
                },
                {
                  "key": "limit", 
                  "value": "10"
                },
                {
                  "key": "status",
                  "value": "delivered"
                }
              ]
            }
          }
        },
        {
          "name": "Get Pilot Profile",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{auth_token}}"
              }
            ],
            "url": {
              "raw": "{{base_url}}/api/pilot/profile/{{pilot_id}}",
              "host": ["{{base_url}}"],
              "path": ["api", "pilot", "profile", "{{pilot_id}}"]
            }
          }
        }
      ]
    },
    {
      "name": "Location & Tracking",
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
                "value": "Bearer {{auth_token}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"latitude\": 19.0850,\n  \"longitude\": 72.8810\n}"
            },
            "url": {
              "raw": "{{base_url}}/api/pilot/update-location",
              "host": ["{{base_url}}"],
              "path": ["api", "pilot", "update-location"]
            }
          }
        }
      ]
    },
    {
      "name": "Support & Configuration",
      "item": [
        {
          "name": "Submit Support Request",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              },
              {
                "key": "Authorization",
                "value": "Bearer {{auth_token}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"subject\": \"Payment Issue\",\n  \"message\": \"I haven't received payment for order ORD001234567890\",\n  \"priority\": \"high\"\n}"
            },
            "url": {
              "raw": "{{base_url}}/api/support/contact",
              "host": ["{{base_url}}"],
              "path": ["api", "support", "contact"]
            }
          }
        },
        {
          "name": "Get FAQs",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{base_url}}/api/support/faqs",
              "host": ["{{base_url}}"],
              "path": ["api", "support", "faqs"]
            }
          }
        },
        {
          "name": "Get App Configuration",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{base_url}}/api/app/config",
              "host": ["{{base_url}}"],
              "path": ["api", "app", "config"]
            }
          }
        }
      ]
    }
  ]
}
```

---

## ⚠️ Error Handling

### Common Error Responses

#### 400 - Bad Request
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "phoneNumber",
      "message": "Please provide a valid phone number"
    }
  ]
}
```

#### 401 - Unauthorized
```json
{
  "success": false,
  "message": "Access denied. No token provided"
}
```

#### 404 - Not Found
```json
{
  "success": false,
  "message": "Pilot not found or not approved"
}
```

#### 500 - Server Error
```json
{
  "success": false,
  "message": "Internal server error"
}
```

---

## 🧪 Testing Scenarios

### Scenario 1: New Pilot Registration & First Order
1. Register new pilot with valid details
2. Wait for admin approval (manually approve in database)
3. Login with OTP verification
4. Scan available order
5. Accept and complete delivery

### Scenario 2: Daily Operations
1. Login with existing pilot credentials
2. Check dashboard stats and notifications
3. Scan and accept multiple orders
4. Update location during delivery
5. Complete deliveries with customer ratings

### Scenario 3: Error Handling
1. Try login with invalid phone number
2. Scan non-existent order
3. Accept order without being available
4. Complete delivery with wrong OTP
5. Verify appropriate error responses

### Scenario 4: Support & Profile Management
1. Get pilot profile information
2. Submit support request
3. View delivery history with pagination
4. Check FAQ information
5. Get app configuration

---

## 📱 Production Testing Notes

1. **Environment Switching**: Change `base_url` variable to production URL for live testing
2. **Real OTP**: In production, actual SMS will be sent - no OTP in response
3. **Database Dependency**: Ensure test orders exist in production database
4. **Admin Approval**: New pilots need manual approval before they can login
5. **Rate Limiting**: Be mindful of API rate limits in production

---

## 🔧 Quick Setup Commands

### Import Collection to Postman:
1. Open Postman
2. Click "Import"
3. Copy and paste the JSON collection above
4. Set environment variables:
   - `base_url`: `http://localhost:5000` or `https://aggrekart-backend.onrender.com`
   - `auth_token`: Will be set automatically after login
   - `pilot_id`: Will be set automatically after login  
   - `order_id`: Set manually with a valid order ID

### Environment Variables Setup:
```json
{
  "name": "Aggrekart Pilot API",
  "values": [
    {
      "key": "base_url",
      "value": "http://localhost:5000",
      "enabled": true
    },
    {
      "key": "auth_token",
      "value": "",
      "enabled": true
    },
    {
      "key": "pilot_id",
      "value": "",
      "enabled": true
    },
    {
      "key": "order_id",
      "value": "ORD001234567890",
      "enabled": true
    }
  ]
}
```

---

## 📞 Support Information

- **API Support**: support@aggrekart.com
- **Phone**: +91-9876543210
- **WhatsApp**: +91-9876543210
- **Documentation**: This guide covers all pilot API endpoints
- **Testing Environment**: Available 24/7 for development testing

---

**Happy Testing! 🚀**

*This documentation is comprehensive and covers all aspects of the Aggrekart Pilot API. Use it for thorough testing and integration with the pilot mobile application.*