# 🚚 Aggrekart Pilot API Documentation

**Version:** 1.0  
**Base URL:** `http://localhost:5000/api/pilot`  
**Authentication:** JWT Bearer Token  

## 📋 Table of Contents

1. [Authentication APIs](#authentication-apis)
2. [Order Management APIs](#order-management-apis)
3. [Pilot Profile APIs](#pilot-profile-apis)
4. [Dashboard APIs](#dashboard-apis)
5. [Support & Configuration APIs](#support--configuration-apis)
6. [Error Handling](#error-handling)
7. [Common Response Formats](#common-response-formats)

---

## 🔐 Authentication APIs

### 1. Register as Pilot
**Endpoint:** `POST /api/pilot/register`  
**Access:** Public  
**Description:** Register a new pilot/driver account

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "pilot@example.com",
  "phoneNumber": "9876543210",
  "vehicleDetails": {
    "registrationNumber": "KA01AB1234",
    "vehicleType": "truck",
    "capacity": 5.0
  },
  "drivingLicense": {
    "number": "KA12345678",
    "validTill": "2025-12-31"
  },
  "documents": {
    "license": "license-document-url",
    "rc": "rc-document-url",
    "insurance": "insurance-document-url"
  }
}
```

**Vehicle Types:** `truck`, `mini_truck`, `pickup`, `tractor`, `trailer`

**Success Response (201):**
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

**Validation Errors (400):**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "type": "field",
      "msg": "Name must be at least 2 characters",
      "path": "name",
      "location": "body"
    }
  ]
}
```

---

### 2. Login (Request OTP)
**Endpoint:** `POST /api/pilot/login`  
**Access:** Public  
**Description:** Request OTP for pilot login

**Request Body:**
```json
{
  "phoneNumber": "9876543210"
}
```

**Success Response (200):**
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

---

### 3. Login (Verify OTP)
**Endpoint:** `POST /api/pilot/login`  
**Access:** Public  
**Description:** Verify OTP and get authentication token

**Request Body:**
```json
{
  "phoneNumber": "9876543210",
  "otp": "123456"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "pilot": {
      "pilotId": "PIL000001",
      "name": "John Doe",
      "phoneNumber": "9876543210",
      "vehicleDetails": {
        "registrationNumber": "KA01AB1234",
        "vehicleType": "truck",
        "capacity": 5,
        "insuranceValid": true,
        "rcValid": true
      },
      "isAvailable": true,
      "currentOrder": null,
      "totalDeliveries": 15,
      "rating": {
        "average": 4.8,
        "count": 12
      }
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

## 📦 Order Management APIs

### 4. Scan Order
**Endpoint:** `POST /api/pilot/scan-order`  
**Access:** Private (Pilot)  
**Description:** Scan QR code to get order details

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "orderId": "AGK1755273478411UWC"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "order": {
      "orderId": "AGK1755273478411UWC",
      "customer": {
        "name": "Customer Name",
        "phoneNumber": "9876543210",
        "address": {
          "coordinates": {},
          "address": "Delivery Address",
          "city": "Hyderabad",
          "state": "Telangana",
          "pincode": "500067"
        }
      },
      "supplier": {
        "companyName": "Supplier Company",
        "contactNumber": "9876543210"
      },
      "items": [
        {
          "name": "Construction Material",
          "quantity": 10,
          "unit": "pieces",
          "totalPrice": 1500
        }
      ],
      "pricing": {
        "subtotal": 1500,
        "transportCost": 200,
        "gstAmount": 270,
        "totalAmount": 1970
      },
      "totalAmount": 1970,
      "estimatedDeliveryTime": "2-3 business days",
      "specialInstructions": "Handle with care",
      "status": "dispatched"
    }
  }
}
```

---

### 5. Accept Order
**Endpoint:** `POST /api/pilot/accept-order`  
**Access:** Private (Pilot)  
**Description:** Accept delivery order assignment

**Request Body:**
```json
{
  "orderId": "AGK1755273478411UWC",
  "pilotId": "PIL000001"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Order accepted successfully",
  "data": {
    "orderId": "AGK1755273478411UWC",
    "customerDetails": {
      "name": "Customer Name",
      "phoneNumber": "9876543210"
    },
    "deliveryAddress": {
      "address": "Complete Delivery Address",
      "coordinates": {
        "latitude": 17.4735,
        "longitude": 78.3773
      }
    },
    "estimatedDeliveryTime": "2-3 business days",
    "deliveryOTP": "716169"
  }
}
```

---

### 6. Start Journey
**Endpoint:** `POST /api/pilot/start-journey`  
**Access:** Private (Pilot)  
**Description:** Start journey to delivery location

**Request Body:**
```json
{
  "orderId": "AGK1755273478411UWC",
  "currentLocation": {
    "latitude": 17.4735,
    "longitude": 78.3773
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Journey started successfully",
  "data": {
    "estimatedDeliveryTime": "2-3 business days",
    "customerLocation": {
      "latitude": 17.4735,
      "longitude": 78.3773
    }
  }
}
```

---

### 7. Complete Delivery
**Endpoint:** `POST /api/pilot/complete-delivery`  
**Access:** Private (Pilot)  
**Description:** Complete delivery with OTP verification

**Request Body:**
```json
{
  "orderId": "AGK1755273478411UWC",
  "deliveryOTP": "716169",
  "deliveryNotes": "Package delivered successfully",
  "customerRating": 5
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Delivery completed successfully",
  "data": {
    "order": {
      "orderId": "AGK1755273478411UWC",
      "status": "delivered",
      "deliveredAt": "2025-09-01T19:38:31.034Z"
    },
    "pilot": {
      "totalDeliveries": 16,
      "rating": {
        "average": 4.9,
        "count": 13
      },
      "isAvailable": true
    }
  }
}
```

**Features:**
- ✅ Sends SMS notification to customer: "Order delivered successfully! Thank you for choosing Aggrekart"
- ✅ Sends SMS notification to supplier about delivery completion
- ✅ Updates pilot statistics and rating
- ✅ Makes pilot available for new orders

---

### 8. Update Location
**Endpoint:** `POST /api/pilot/update-location`  
**Access:** Private (Pilot)  
**Description:** Update pilot's current location

**Request Body:**
```json
{
  "latitude": 17.4735,
  "longitude": 78.3773
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Location updated successfully",
  "data": {
    "location": {
      "latitude": 17.4735,
      "longitude": 78.3773,
      "lastUpdated": "2025-09-01T19:45:32.123Z"
    }
  }
}
```

---

## 👨‍✈️ Pilot Profile APIs

### 9. Get Pilot Profile
**Endpoint:** `GET /api/pilot/profile/:pilotId`  
**Access:** Private (Pilot)  
**Description:** Get pilot profile and delivery history

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "pilot": {
      "pilotId": "PIL000001",
      "name": "John Doe",
      "phoneNumber": "9876543210",
      "email": "pilot@example.com",
      "vehicleDetails": {
        "registrationNumber": "KA01AB1234",
        "vehicleType": "truck",
        "capacity": 5,
        "insuranceValid": true,
        "rcValid": true
      },
      "drivingLicense": {
        "number": "KA12345678",
        "validTill": "2025-12-31",
        "isValid": true
      },
      "currentLocation": {
        "type": "Point",
        "coordinates": [78.3773, 17.4735],
        "lastUpdated": "2025-09-01T19:45:32.123Z"
      },
      "rating": {
        "average": 4.8,
        "count": 12
      },
      "isAvailable": true,
      "isApproved": true,
      "totalDeliveries": 15,
      "currentOrder": null,
      "workingAreas": ["Hyderabad", "Secunderabad"],
      "createdAt": "2025-08-01T10:30:00.000Z"
    },
    "recentDeliveries": [
      {
        "orderId": "AGK1755273478411UWC",
        "customerName": "Customer Name",
        "deliveredAt": "2025-09-01T18:30:00.000Z",
        "amount": 1970,
        "rating": 5
      }
    ],
    "stats": {
      "totalDeliveries": 15,
      "rating": {
        "average": 4.8,
        "count": 12
      },
      "documentsValid": true
    }
  }
}
```

---

### 10. Get Pilot Statistics
**Endpoint:** `GET /api/pilot/stats`  
**Access:** Private (Pilot)  
**Description:** Get pilot statistics and performance data

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "pilot": {
      "pilotId": "PIL000001",
      "name": "John Doe",
      "rating": {
        "average": 4.8,
        "count": 12
      },
      "totalDeliveries": 15,
      "isAvailable": true,
      "vehicleDetails": {
        "registrationNumber": "KA01AB1234",
        "vehicleType": "truck",
        "capacity": 5,
        "insuranceValid": true,
        "rcValid": true
      },
      "joinedDate": "2025-08-01T10:30:00.000Z"
    },
    "stats": {
      "totalDeliveries": 15,
      "totalRevenue": 25000,
      "avgDeliveryTime": 45,
      "lastMonth": 8,
      "thisWeek": 3,
      "monthlyEarnings": 12000,
      "monthlyDeliveries": 8
    },
    "recentDeliveries": [
      {
        "orderId": "AGK1755273478411UWC",
        "customerName": "Customer Name",
        "amount": 1970,
        "deliveredAt": "2025-09-01T18:30:00.000Z"
      }
    ],
    "performance": {
      "averageRating": 4.8,
      "totalRatings": 12,
      "onTimeDeliveryRate": 95,
      "customerSatisfactionRate": 98
    }
  }
}
```

---

### 11. Get Delivery History
**Endpoint:** `GET /api/pilot/delivery-history`  
**Access:** Private (Pilot)  
**Description:** Get paginated delivery history

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

**Example:** `GET /api/pilot/delivery-history?page=1&limit=10`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "deliveries": [
      {
        "orderId": "AGK1755273478411UWC",
        "customerName": "Customer Name",
        "customerPhone": "9876543210",
        "deliveryAddress": "Complete Address",
        "items": [
          {
            "name": "Construction Material",
            "quantity": 10
          }
        ],
        "amount": 1970,
        "deliveredAt": "2025-09-01T18:30:00.000Z",
        "rating": 5,
        "deliveryNotes": "Package delivered successfully"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalItems": 25,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

---

## 📊 Dashboard APIs

### 12. Dashboard Statistics
**Endpoint:** `GET /api/pilot/dashboard/stats`  
**Access:** Private (Pilot)  
**Description:** Get pilot dashboard statistics

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "todayStats": {
      "totalOrders": 3,
      "totalEarnings": 5500,
      "completedOrders": 2
    },
    "pilotInfo": {
      "name": "John Doe",
      "vehicleNumber": "KA01AB1234",
      "rating": {
        "average": 4.8,
        "count": 12
      },
      "totalDeliveries": 15
    }
  }
}
```

---

### 13. Dashboard Notifications
**Endpoint:** `GET /api/pilot/dashboard/notifications`  
**Access:** Private (Pilot)  
**Description:** Get pilot notifications

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "notif_001",
        "title": "New Order Available",
        "message": "Order AGK1755273478411UWC is ready for pickup",
        "type": "order",
        "isRead": false,
        "createdAt": "2025-09-01T18:00:00.000Z"
      },
      {
        "id": "notif_002",
        "title": "Payment Received",
        "message": "Payment of ₹1,500 has been credited to your account",
        "type": "payment",
        "isRead": true,
        "createdAt": "2025-09-01T17:30:00.000Z"
      }
    ],
    "unreadCount": 1
  }
}
```

---

## 🛠️ Support & Configuration APIs

### 14. App Configuration
**Endpoint:** `GET /api/pilot/app/config`  
**Access:** Public  
**Description:** Get app configuration settings

**Success Response (200):**
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

### 15. Support FAQs
**Endpoint:** `GET /api/pilot/support/faqs`  
**Access:** Public  
**Description:** Get frequently asked questions

**Success Response (200):**
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

---

### 16. Contact Support
**Endpoint:** `POST /api/pilot/support/contact`  
**Access:** Private (Pilot)  
**Description:** Send support request

**Request Body:**
```json
{
  "subject": "Payment Issue",
  "message": "I haven't received payment for my last 3 deliveries",
  "priority": "high"
}
```

**Priority Options:** `low`, `medium`, `high`

**Success Response (200):**
```json
{
  "success": true,
  "message": "Support request submitted successfully",
  "data": {
    "ticketId": "TKT001234567890",
    "status": "submitted"
  }
}
```

---

## 🚨 Error Handling

### Common Error Response Format:
```json
{
  "success": false,
  "error": {
    "statusCode": 400,
    "isOperational": true
  },
  "message": "Error description",
  "stack": "Error stack trace (development only)"
}
```

### HTTP Status Codes:
- **200** - Success
- **201** - Created
- **400** - Bad Request (Validation errors)
- **401** - Unauthorized (Invalid/missing token)
- **403** - Forbidden (Access denied)
- **404** - Not Found (Resource not found)
- **500** - Internal Server Error

### Common Error Messages:
- `"Order not found or not ready for pickup"` - Order doesn't exist or wrong status
- `"Invalid delivery OTP"` - Wrong OTP provided for delivery completion
- `"Pilot not found"` - Invalid pilot ID
- `"Order already assigned to another pilot"` - Order already taken
- `"User not found"` - Invalid authentication token

---

## 📝 Common Response Formats

### Success Response:
```json
{
  "success": true,
  "message": "Operation successful",
  "data": {
    // Response data
  }
}
```

### Validation Error Response:
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "type": "field",
      "msg": "Field is required",
      "path": "fieldName",
      "location": "body"
    }
  ]
}
```

---

## 🔑 Authentication Setup

### Getting Started:
1. Register as pilot using `/api/pilot/register`
2. Wait for admin approval
3. Login using `/api/pilot/login` (OTP-based)
4. Use the received JWT token in all subsequent requests

### Token Usage:
```javascript
// Add to request headers
headers: {
  'Authorization': 'Bearer YOUR_JWT_TOKEN',
  'Content-Type': 'application/json'
}
```

### Token Expiry:
- JWT tokens expire after 30 days
- Use the refresh token mechanism or login again when expired

---

## 📱 Integration Notes

### Mobile App Integration:
- All APIs support both Android and iOS applications
- Use secure HTTPS in production
- Implement proper error handling for network issues
- Cache configuration data locally

### Real-time Features:
- Location tracking via `/api/pilot/update-location`
- Push notifications for new orders
- Live order status updates

### Testing:
- Base URL for development: `http://localhost:5000`
- Use Postman collection for API testing
- Test with valid order IDs in AGK format

---

## 🔧 Development Tips

### Order ID Formats:
- **AGK Format:** `AGK1755273478411UWC` (used in production)
- **ObjectId Format:** `507f1f77bcf86cd799439011` (MongoDB ObjectId)

### Phone Number Validation:
- Must be 10 digits
- Must start with 6, 7, 8, or 9
- Example: `9876543210`

### Location Coordinates:
- Latitude: -90 to 90
- Longitude: -180 to 180
- Format: Decimal degrees

---

**💡 Need Help?**
- Email: support@aggrekart.com
- Phone: +91-9876543210
- WhatsApp: +91-9876543210

**📅 Last Updated:** September 2, 2025  
**👨‍💻 Prepared by:** Aggrekart Development Team