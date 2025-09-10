# Pilot API JSON Response Structures 📋

This document contains the complete JSON response structures for all Pilot API endpoints.

## 🔧 Standard Response Format

All API responses follow this basic structure:

```json
{
  "success": boolean,
  "message": "string",
  "data": object
}
```

---

## 🔐 Authentication Endpoints

### 1. POST /api/pilot/register
**Request:**
```json
{
  "name": "John Doe",
  "phoneNumber": "9876543210",
  "email": "john@example.com",
  "vehicleDetails": {
    "registrationNumber": "TS12AB3456",
    "vehicleType": "truck",
    "capacity": 5
  },
  "drivingLicense": {
    "number": "DL123456789",
    "validTill": "2025-12-31T00:00:00.000Z"
  }
}
```

**Response (201):**
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

### 2. POST /api/pilot/login
**Request (OTP Request):**
```json
{
  "phoneNumber": "9876543210"
}
```

**Response (200) - OTP Sent:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "otpSent": true,
    "otp": "123456"  // Only in development mode
  }
}
```

**Request (OTP Verification):**
```json
{
  "phoneNumber": "9876543210",
  "otp": "123456"
}
```

**Response (200) - Login Success:**
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
        "registrationNumber": "TS12AB3456",
        "vehicleType": "truck",
        "capacity": 5
      },
      "isAvailable": true,
      "currentOrder": null,
      "totalDeliveries": 0,
      "rating": 0
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

## 📊 Dashboard Endpoints

### 3. GET /api/pilot/stats
**Response (200):**
```json
{
  "success": true,
  "message": "Pilot statistics retrieved successfully",
  "data": {
    "totalDeliveries": 15,
    "completedToday": 3,
    "totalEarnings": 5500.50,
    "earningsToday": 450.00,
    "averageRating": 4.2,
    "availabilityStatus": "available",
    "currentStreak": 5,
    "thisMonth": {
      "deliveries": 12,
      "earnings": 4200.00
    },
    "performance": {
      "onTimeDeliveries": 14,
      "lateDeliveries": 1,
      "successRate": 93.33
    }
  }
}
```

### 4. GET /api/pilot/dashboard/stats
**Response (200):**
```json
{
  "success": true,
  "message": "Dashboard statistics retrieved successfully",
  "data": {
    "todayStats": {
      "deliveries": 3,
      "earnings": 450.00,
      "hoursWorked": 6.5
    },
    "weekStats": {
      "deliveries": 18,
      "earnings": 2100.00,
      "avgDeliveryTime": 45
    },
    "monthStats": {
      "deliveries": 65,
      "earnings": 8500.00,
      "ranking": 15
    },
    "recentActivity": [
      {
        "orderId": "ORD123456",
        "timestamp": "2025-09-06T10:30:00.000Z",
        "action": "completed",
        "amount": 150.00
      }
    ]
  }
}
```

### 5. GET /api/pilot/delivery-history
**Response (200):**
```json
{
  "success": true,
  "message": "Delivery history retrieved successfully",
  "data": {
    "deliveries": [
      {
        "orderId": "ORD123456",
        "customerName": "Jane Smith",
        "customerPhone": "9876543211",
        "pickupAddress": "Building A, Tech City",
        "deliveryAddress": "House 123, Residential Area",
        "status": "completed",
        "orderDate": "2025-09-06T09:00:00.000Z",
        "completedAt": "2025-09-06T11:30:00.000Z",
        "amount": 150.00,
        "distance": 8.5,
        "rating": 5,
        "feedback": "Great service!"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 15,
      "pages": 2
    }
  }
}
```

### 6. GET /api/pilot/dashboard/notifications
**Response (200):**
```json
{
  "success": true,
  "message": "Notifications retrieved successfully",
  "data": {
    "notifications": [
      {
        "id": "ORD123456",
        "type": "new_order",
        "title": "New Order Available",
        "message": "Order ORD123456 is waiting for pickup",
        "timestamp": "2025-09-06T10:00:00.000Z",
        "read": false,
        "orderId": "ORD123456"
      },
      {
        "id": "NOTIF789",
        "type": "system",
        "title": "Profile Updated",
        "message": "Your profile has been successfully updated",
        "timestamp": "2025-09-05T15:30:00.000Z",
        "read": true
      }
    ],
    "unreadCount": 1
  }
}
```

---

## 📦 Order Management Endpoints

### 7. POST /api/pilot/scan-order
**Request:**
```json
{
  "orderId": "ORD123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Order details retrieved successfully",
  "data": {
    "order": {
      "orderId": "ORD123456",
      "customerName": "Jane Smith",
      "customerPhone": "9876543211",
      "pickupAddress": {
        "street": "Building A, Tech City",
        "city": "Hyderabad",
        "coordinates": {
          "latitude": 17.3850,
          "longitude": 78.4867
        }
      },
      "deliveryAddress": {
        "street": "House 123, Residential Area",
        "city": "Hyderabad",
        "coordinates": {
          "latitude": 17.4065,
          "longitude": 78.4772
        }
      },
      "products": [
        {
          "name": "Red Bricks",
          "quantity": 1000,
          "unit": "pieces"
        }
      ],
      "totalAmount": 5000.00,
      "status": "pending_pickup",
      "estimatedDistance": 8.5,
      "orderDate": "2025-09-06T09:00:00.000Z"
    }
  }
}
```

### 8. POST /api/pilot/accept-order
**Request:**
```json
{
  "orderId": "ORD123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Order accepted successfully",
  "data": {
    "orderId": "ORD123456",
    "status": "accepted",
    "assignedAt": "2025-09-06T10:15:00.000Z",
    "pilotId": "PIL000001",
    "estimatedPickupTime": "2025-09-06T11:00:00.000Z",
    "estimatedDeliveryTime": "2025-09-06T12:30:00.000Z"
  }
}
```

### 9. POST /api/pilot/start-journey
**Request:**
```json
{
  "orderId": "ORD123456",
  "currentLocation": {
    "latitude": 17.3850,
    "longitude": 78.4867
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Journey started successfully",
  "data": {
    "orderId": "ORD123456",
    "status": "in_transit",
    "journeyStartedAt": "2025-09-06T10:30:00.000Z",
    "estimatedDeliveryTime": "2025-09-06T12:30:00.000Z",
    "route": {
      "distance": 8.5,
      "estimatedDuration": 30
    }
  }
}
```

### 10. POST /api/pilot/complete-delivery
**Request:**
```json
{
  "orderId": "ORD123456",
  "deliveryLocation": {
    "latitude": 17.4065,
    "longitude": 78.4772
  },
  "deliveryNotes": "Delivered successfully to customer"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Delivery completed successfully",
  "data": {
    "orderId": "ORD123456",
    "status": "completed",
    "completedAt": "2025-09-06T11:30:00.000Z",
    "deliveryTime": 60,
    "earnings": 150.00,
    "rating": {
      "eligible": true,
      "message": "Customer can now rate this delivery"
    }
  }
}
```

---

## 🗺️ Location & Profile Endpoints

### 11. POST /api/pilot/update-location
**Request:**
```json
{
  "latitude": 17.3850,
  "longitude": 78.4867,
  "accuracy": 10
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Location updated successfully",
  "data": {
    "location": {
      "latitude": 17.3850,
      "longitude": 78.4867,
      "accuracy": 10,
      "updatedAt": "2025-09-06T10:15:00.000Z"
    },
    "nearbyOrders": [
      {
        "orderId": "ORD789012",
        "distance": 2.3,
        "estimatedEarnings": 120.00
      }
    ]
  }
}
```

### 12. GET /api/pilot/profile/:pilotId
**Response (200):**
```json
{
  "success": true,
  "message": "Pilot profile retrieved successfully",
  "data": {
    "pilot": {
      "pilotId": "PIL000001",
      "name": "John Doe",
      "phoneNumber": "9876543210",
      "email": "john@example.com",
      "vehicleDetails": {
        "registrationNumber": "TS12AB3456",
        "vehicleType": "truck",
        "capacity": 5
      },
      "drivingLicense": {
        "number": "DL123456789",
        "validTill": "2025-12-31T00:00:00.000Z"
      },
      "isApproved": true,
      "isAvailable": true,
      "rating": 4.2,
      "totalDeliveries": 15,
      "joinDate": "2025-08-01T00:00:00.000Z",
      "lastActive": "2025-09-06T10:15:00.000Z"
    }
  }
}
```

---

## 🌐 Public Endpoints

### 13. GET /api/pilot/app/config
**Response (200):**
```json
{
  "success": true,
  "message": "App configuration retrieved successfully",
  "data": {
    "app": {
      "version": "1.0.0",
      "minVersion": "1.0.0",
      "maintenance": false,
      "features": {
        "locationTracking": true,
        "pushNotifications": true,
        "offlineMode": false
      }
    },
    "settings": {
      "locationUpdateInterval": 30000,
      "maxDeliveryRadius": 50,
      "supportContact": "support@aggrekart.com",
      "emergencyContact": "+91-9876543210"
    }
  }
}
```

### 14. GET /api/pilot/support/faqs
**Response (200):**
```json
{
  "success": true,
  "message": "FAQs retrieved successfully",
  "data": {
    "faqs": [
      {
        "id": "faq_001",
        "question": "How do I update my availability status?",
        "answer": "You can toggle your availability from the dashboard main screen.",
        "category": "general"
      },
      {
        "id": "faq_002",
        "question": "What to do if I can't find the delivery address?",
        "answer": "Use the in-app navigation or contact customer support for assistance.",
        "category": "delivery"
      }
    ],
    "categories": ["general", "delivery", "payment", "technical"],
    "contactInfo": {
      "email": "support@aggrekart.com",
      "phone": "+91-9876543210",
      "hours": "9 AM - 6 PM, Mon-Sat"
    }
  }
}
```

### 15. POST /api/pilot/support/contact
**Request:**
```json
{
  "subject": "Payment Issue",
  "message": "I haven't received payment for order ORD123456",
  "category": "payment",
  "priority": "medium"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Support ticket created successfully",
  "data": {
    "ticketId": "TICKET_789",
    "subject": "Payment Issue",
    "status": "open",
    "createdAt": "2025-09-06T10:30:00.000Z",
    "estimatedResponse": "24 hours",
    "reference": "REF_789_PIL000001"
  }
}
```

---

## ❌ Error Response Structures

### Standard Error Response:
```json
{
  "success": false,
  "message": "Error description",
  "error": "ERROR_CODE",
  "statusCode": 400
}
```

### Common Error Codes:

**400 - Bad Request:**
```json
{
  "success": false,
  "message": "Invalid phone number format",
  "error": "VALIDATION_ERROR",
  "statusCode": 400
}
```

**401 - Unauthorized:**
```json
{
  "success": false,
  "message": "Access denied. Please login again",
  "error": "UNAUTHORIZED",
  "statusCode": 401
}
```

**404 - Not Found:**
```json
{
  "success": false,
  "message": "Pilot not found or not approved",
  "error": "PILOT_NOT_FOUND",
  "statusCode": 404
}
```

**500 - Server Error:**
```json
{
  "success": false,
  "message": "Internal server error",
  "error": "INTERNAL_ERROR",
  "statusCode": 500
}
```

---

## 🔧 Request Headers

### For Protected Endpoints:
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### For Public Endpoints:
```
Content-Type: application/json
```

---

## 📝 Notes

1. **Timestamps** are in ISO 8601 format (UTC)
2. **Coordinates** use decimal degrees format
3. **Phone numbers** should be 10 digits starting with 6-9
4. **Vehicle registration** follows Indian format: 2 letters + 2 numbers + 2 letters + 4 numbers
5. **JWT tokens** expire after 7 days
6. **OTP codes** are 6 digits and expire after 10 minutes
7. **Pilot IDs** follow format: PIL + 6 digits (e.g., PIL000001)
8. **Order IDs** follow format: ORD + 6 digits (e.g., ORD123456)

This document covers all the JSON structures you need for testing and integration with the Pilot API! 🚀