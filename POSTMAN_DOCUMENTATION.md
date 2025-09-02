# 📮 Complete Postman Documentation - Aggrekart Pilot APIs
*A Comprehensive Guide for Beginners to Advanced Users*

## 📚 Table of Contents
1. [What is Postman?](#what-is-postman)
2. [Installing Postman](#installing-postman)
3. [Setting Up the Collection](#setting-up-the-collection)
4. [Understanding API Basics](#understanding-api-basics)
5. [Environment Setup](#environment-setup)
6. [Complete API Testing Guide](#complete-api-testing-guide)
7. [Troubleshooting](#troubleshooting)
8. [Best Practices](#best-practices)

---

## 🤔 What is Postman?

**Postman** is a popular tool used by developers to test APIs (Application Programming Interfaces). Think of it as a way to "talk" to your web application and test if it's working correctly.

### Why Use Postman?
- ✅ Test APIs without writing code
- ✅ Save and organize API requests
- ✅ Share collections with your team
- ✅ Automate testing workflows
- ✅ Monitor API performance

---

## 💻 Installing Postman

### Step 1: Download Postman
1. Go to [https://www.postman.com/downloads/](https://www.postman.com/downloads/)
2. Choose your operating system (Windows, Mac, or Linux)
3. Download and install the application

### Step 2: Create Account (Optional but Recommended)
1. Open Postman
2. Click "Sign Up" or "Create Account"
3. Use email or sign up with Google/GitHub
4. This allows you to sync collections across devices

### Step 3: Choose Workspace
1. Create a new workspace or use "My Workspace"
2. Workspaces help organize your API collections

---

## 🚀 Setting Up the Collection

### Step 1: Import the Collection

#### Method 1: Import from File
1. **Open Postman** and you'll see the main interface
2. **Click "Import"** button (located in top-left area)
   ```
   [Import] [New] [Runner] [Mock Server]
   ```
3. **Select "Upload Files"** tab
4. **Click "Choose Files"** and navigate to your project folder
5. **Select** `Aggrekart_Pilot_APIs.postman_collection.json`
6. **Click "Import"** button
7. ✅ **Success!** You'll see "Aggrekart Pilot APIs" in your Collections panel

#### Method 2: Drag and Drop
1. Open your file explorer
2. Navigate to your project folder
3. Find `Aggrekart_Pilot_APIs.postman_collection.json`
4. Drag and drop it into Postman interface
5. ✅ **Success!** Collection imported automatically

### Step 2: Verify Import
After importing, you should see:
```
📁 Collections
  📂 Aggrekart Pilot APIs
    📂 🔐 Authentication
      📄 1. Register Pilot
      📄 2. Request OTP
      📄 3. Verify OTP & Login
    📂 📦 Order Management
      📄 4. Scan Order
      📄 5. Accept Order
      📄 6. Start Journey
      📄 7. Update Location
      📄 8. Complete Delivery
    📂 👤 Profile & Stats
      📄 9. Get Profile
      📄 10. Get Stats
      📄 11. Delivery History
    📂 📊 Dashboard & Support
      📄 12. Dashboard Stats
      📄 13. Get Notifications
      📄 14. App Config
      📄 15. Get FAQs
      📄 16. Contact Support
```

---

## 🌍 Environment Setup (VERY IMPORTANT!)

### What are Environment Variables?
Environment variables are like "settings" that store values you use repeatedly across multiple API requests. Instead of typing the same server URL or token in every request, you store them once and reuse them.

### Step 1: Create New Environment
1. **Click the "Environments" tab** (left sidebar) or the gear icon ⚙️ in top-right
2. **Click "Create Environment"** or the "+" button
3. **Name your environment**: `Aggrekart Pilot APIs - Local`
4. **Click "Create"**

### Step 2: Add Environment Variables
Add these variables one by one:

#### Variable 1: base_url
- **Variable**: `base_url`
- **Initial Value**: `http://localhost:5000/api/pilot`
- **Current Value**: `http://localhost:5000/api/pilot`
- **Description**: Main API server URL

#### Variable 2: pilot_token
- **Variable**: `pilot_token`
- **Initial Value**: *(leave empty)*
- **Current Value**: *(leave empty)*
- **Description**: JWT authentication token (auto-filled after login)

#### Variable 3: pilot_id
- **Variable**: `pilot_id`
- **Initial Value**: *(leave empty)*
- **Current Value**: *(leave empty)*
- **Description**: Logged-in pilot's ID (auto-filled after login)

#### Variable 4: phone_number
- **Variable**: `phone_number`
- **Initial Value**: `9876543210`
- **Current Value**: `9876543210`
- **Description**: Test phone number for pilot

#### Variable 5: order_id
- **Variable**: `order_id`
- **Initial Value**: `AGK-ORD-001`
- **Current Value**: `AGK-ORD-001`
- **Description**: Test order ID

#### Variable 6: customer_otp
- **Variable**: `customer_otp`
- **Initial Value**: `123456`
- **Current Value**: `123456`
- **Description**: Test delivery OTP

### Step 3: Save and Activate Environment
1. **Click "Save"** (Ctrl+S)
2. **Select your environment** from dropdown in top-right corner
3. You should see: `Aggrekart Pilot APIs - Local` selected

### Visual Guide for Environment Setup:
```
📊 Environment Variables Table:
┌─────────────────┬──────────────────────────────────┬─────────────────────────────────┐
│ Variable        │ Initial Value                    │ Description                     │
├─────────────────┼──────────────────────────────────┼─────────────────────────────────┤
│ base_url        │ http://localhost:5000/api/pilot  │ API server URL                  │
│ pilot_token     │ (empty - auto-filled)            │ Authentication token            │
│ pilot_id        │ (empty - auto-filled)            │ Pilot ID after login           │
│ phone_number    │ 9876543210                       │ Test phone number              │
│ order_id        │ AGK-ORD-001                      │ Test order ID                  │
│ customer_otp    │ 123456                           │ Test delivery OTP              │
└─────────────────┴──────────────────────────────────┴─────────────────────────────────┘
```

---

## � Understanding API Basics

### What is an API Request?
An API request is like asking a question to a server and getting an answer back.

### Types of HTTP Methods:
- **GET**: "Give me information" (like reading)
- **POST**: "Create something new" or "Send data" (like writing)
- **PUT**: "Update existing information" (like editing)
- **DELETE**: "Remove something" (like deleting)

### Parts of an API Request:
1. **URL**: Where to send the request (`http://localhost:5000/api/pilot/login`)
2. **Method**: What type of request (`POST`, `GET`, etc.)
3. **Headers**: Additional information (like "Content-Type: application/json")
4. **Body**: Data you're sending (in JSON format)

### Understanding Response Codes:
- **200**: ✅ Success - Everything worked perfectly
- **201**: ✅ Created - Something new was created successfully
- **400**: ❌ Bad Request - You sent wrong data
- **401**: ❌ Unauthorized - You need to login first
- **404**: ❌ Not Found - The thing you're looking for doesn't exist
- **500**: ❌ Server Error - Something went wrong on the server

---

## 📁 Collection Structure & Overview

```
📂 Aggrekart Pilot APIs (Main Collection)
├── 🔐 Authentication (Login & Registration)
│   ├── 1️⃣ Register Pilot (Create new pilot account)
│   ├── 2️⃣ Request OTP (Get SMS OTP for login)
│   └── 3️⃣ Verify OTP & Login (Complete login process)
├── 📦 Order Management (Core delivery operations)
│   ├── 4️⃣ Scan Order (Get order details by ID)
│   ├── 5️⃣ Accept Order (Accept delivery assignment)
│   ├── 6️⃣ Start Journey (Begin delivery trip)
│   ├── 7️⃣ Update Location (Track pilot movement)
│   └── 8️⃣ Complete Delivery (Finish with OTP verification)
├── 👤 Profile & Stats (Pilot information)
│   ├── 9️⃣ Get Profile (View pilot details)
│   ├── 🔟 Get Stats (Performance metrics)
│   └── 1️⃣1️⃣ Delivery History (Past deliveries)
└── 📊 Dashboard & Support (Additional features)
    ├── 1️⃣2️⃣ Dashboard Stats (Today's overview)
    ├── 1️⃣3️⃣ Get Notifications (Messages & alerts)
    ├── 1️⃣4️⃣ App Config (App settings)
    ├── 1️⃣5️⃣ Get FAQs (Help & support)
    └── 1️⃣6️⃣ Contact Support (Send support ticket)
```

---

## 🔐 Complete Authentication Flow (Step-by-Step)

### 🎯 Goal: Login as a pilot to access protected APIs

---

### 1️⃣ Register Pilot (OPTIONAL - One Time Only)

**Purpose**: Create a new pilot account in the system

#### Step-by-Step Instructions:
1. **Click** on "Register Pilot" request
2. **Verify the URL**: Should show `{{base_url}}/register`
3. **Check Method**: Should be `POST`
4. **Go to Body tab** and select "raw" → "JSON"

#### Request Body (Copy this exactly):
```json
{
  "name": "Test Pilot",
  "phoneNumber": "{{phone_number}}",
  "email": "testpilot@example.com",
  "aadharNumber": "123456789012",
  "address": "123 Test St, Bangalore",
  "emergencyContact": "9876543211",
  "vehicleDetails": {
    "registrationNumber": "KA01AB1234",
    "vehicleType": "truck",
    "capacity": 5
  },
  "drivingLicense": {
    "number": "KA1234567890",
    "validTill": "2026-12-31"
  }
}
```

#### What Each Field Means:
- `name`: Pilot's full name
- `phoneNumber`: Mobile number for SMS OTP
- `email`: Email address
- `aadharNumber`: 12-digit Aadhar card number
- `address`: Current residential address
- `emergencyContact`: Emergency contact number
- `vehicleDetails.registrationNumber`: Vehicle registration number
- `vehicleDetails.vehicleType`: Type of vehicle (truck, tempo, pickup)
- `vehicleDetails.capacity`: Vehicle capacity in metric tons
- `drivingLicense.number`: Driving license number
- `drivingLicense.validTill`: License expiry date

#### Expected Responses:

**✅ Success (201 Created):**
```json
{
  "success": true,
  "message": "Pilot registered successfully",
  "data": {
    "pilotId": "PIL000001",
    "name": "Test Pilot",
    "phoneNumber": "9876543210",
    "isActive": true
  }
}
```

**❌ Already Exists (400 Bad Request):**
```json
{
  "success": false,
  "message": "Pilot already registered with this phone number"
}
```

**📝 Note**: If you get "already exists" error, that's normal! Skip to step 2.

---

### 2️⃣ Request OTP (LOGIN STEP 1)

**Purpose**: Send SMS OTP to pilot's phone for secure login

#### Step-by-Step Instructions:
1. **Click** on "Request OTP" request
2. **Verify URL**: `{{base_url}}/login`
3. **Method**: `POST`
4. **Body → Raw → JSON**:

#### Request Body:
```json
{
  "phoneNumber": "{{phone_number}}"
}
```

#### What Happens:
1. System checks if phone number is registered
2. Generates 6-digit OTP
3. Sends SMS via Twilio to pilot's phone
4. Stores OTP temporarily for verification

#### Expected Response:
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "otpSent": true,
    "otp": "175992"
  }
}
```

#### 🔍 Important Notes:
- The `otp` field shows the actual OTP sent (for testing)
- In production, OTP won't be visible in response
- OTP expires in 10 minutes
- **Write down the OTP number** - you'll need it for step 3!

---

### 3️⃣ Verify OTP & Login (LOGIN STEP 2)

**Purpose**: Verify the SMS OTP and complete the login process

#### Step-by-Step Instructions:
1. **Click** on "Verify OTP & Login" request
2. **Verify URL**: `{{base_url}}/login`
3. **Method**: `POST`
4. **Body → Raw → JSON**:

#### Request Body:
```json
{
  "phoneNumber": "{{phone_number}}",
  "otp": "175992"
}
```

**🚨 IMPORTANT**: Replace `"175992"` with the actual OTP you received in step 2!

#### What Happens:
1. System verifies the OTP is correct and not expired
2. Generates JWT authentication token
3. Returns pilot details and token
4. Token is automatically saved to environment variables

#### Expected Response:
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
        "average": 5.0,
        "count": 1
      }
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwaWxvdElkIjoiNjhiNWU4OTUxODcyYmZmNTU0OGYxYWI5IiwiaWF0IjoxNzU2NzkzMjQ4LCJleHAiOjE3NTkzODUyNDh9.lV_ai7VAUJPlHNz_OHikDh80ZgjXh57b8iv7L0V0_8w"
  }
}
```

#### Auto-Scripts Explanation:
This request has a "Post-response Script" that automatically:
1. Extracts the `token` from response
2. Saves it to `{{pilot_token}}` environment variable
3. Saves `pilot._id` to `{{pilot_id}}` environment variable

#### Post-Response Script (Already included):
```javascript
// This script runs automatically after successful login
if (pm.response.json().success) {
    const responseData = pm.response.json().data;
    pm.environment.set("pilot_token", responseData.token);
    pm.environment.set("pilot_id", responseData.pilot._id);
    console.log("✅ Token and Pilot ID saved to environment");
}
```

#### 🎉 Success Indicator:
After successful login, you should see in environment variables:
- `pilot_token`: Contains long JWT token
- `pilot_id`: Contains pilot's database ID

---

## 📦 Order Management APIs (Complete Delivery Workflow)

### 🎯 Goal: Complete a full delivery from scanning to completion

**⚠️ PREREQUISITE**: You must be logged in (completed authentication steps above)

---

### 4️⃣ Scan Order

**Purpose**: Get complete order details by scanning order ID or QR code

#### Step-by-Step Instructions:
1. **Click** "Scan Order" request
2. **URL**: `{{base_url}}/scan-order`
3. **Method**: `POST`
4. **Headers** (Auto-added): `Authorization: Bearer {{pilot_token}}`
5. **Body → Raw → JSON**:

#### Request Body:
```json
{
  "orderId": "{{order_id}}"
}
```

#### What This API Does:
1. Validates pilot is authenticated
2. Searches for order by ID (supports both ObjectId and AGK format)
3. Returns complete order details including customer, supplier, and items
4. Shows delivery address and special instructions

#### Expected Response:
```json
{
  "success": true,
  "message": "Order details retrieved successfully",
  "data": {
    "order": {
      "_id": "66d1234567890abcdef12346",
      "orderId": "AGK-ORD-001",
      "status": "pending",
      "totalAmount": 1500,
      "deliveryAddress": {
        "street": "123 Customer Street",
        "city": "Bangalore",
        "state": "Karnataka",
        "pincode": "560001",
        "coordinates": {
          "latitude": 12.9716,
          "longitude": 77.5946
        }
      },
      "customer": {
        "name": "Alice Johnson",
        "phoneNumber": "9876543211",
        "email": "alice@example.com"
      },
      "supplier": {
        "name": "ABC Suppliers",
        "phoneNumber": "9876543200",
        "address": "456 Supplier Road, Bangalore"
      },
      "items": [
        {
          "name": "Cement",
          "quantity": 10,
          "unit": "bags",
          "pricePerUnit": 350,
          "totalPrice": 3500
        }
      ],
      "deliveryOTP": "123456",
      "specialInstructions": "Call before delivery",
      "createdAt": "2025-09-02T10:00:00.000Z"
    }
  }
}
```

#### Understanding the Response:
- `orderId`: Unique order identifier
- `status`: Current order status (pending, accepted, in-transit, delivered)
- `deliveryAddress`: Where to deliver the order
- `customer`: Who is receiving the order
- `supplier`: Who is sending the order
- `items`: What needs to be delivered
- `deliveryOTP`: Code needed to complete delivery
- `specialInstructions`: Important delivery notes

---

### 5️⃣ Accept Order

**Purpose**: Accept the delivery assignment and get customer details

#### Step-by-Step Instructions:
1. **Click** "Accept Order" request
2. **URL**: `{{base_url}}/accept-order`
3. **Method**: `POST`
4. **Headers**: Auto-included authentication
5. **Body**:

#### Request Body:
```json
{
  "orderId": "{{order_id}}",
  "pilotId": "{{pilot_id}}"
}
```

#### What Happens:
1. Assigns the order to the pilot
2. Changes order status to "accepted"
3. Marks pilot as "busy"
4. Returns customer contact details for communication

#### Expected Response:
```json
{
  "success": true,
  "message": "Order accepted successfully",
  "data": {
    "order": {
      "orderId": "AGK-ORD-001",
      "status": "accepted",
      "assignedPilot": "PIL000001",
      "acceptedAt": "2025-09-02T10:15:00.000Z"
    },
    "customer": {
      "name": "Alice Johnson",
      "phoneNumber": "9876543211",
      "address": "123 Customer Street, Bangalore"
    },
    "estimatedDeliveryTime": "45 minutes"
  }
}
```

---

### 6️⃣ Start Journey

**Purpose**: Begin the delivery trip with location tracking

#### Request Body:
```json
{
  "orderId": "{{order_id}}",
  "currentLocation": {
    "latitude": 12.9716,
    "longitude": 77.5946
  }
}
```

#### What This Does:
- Changes order status to "in-transit"
- Records start time and location
- Calculates estimated delivery time
- Enables location tracking

#### Expected Response:
```json
{
  "success": true,
  "message": "Journey started successfully",
  "data": {
    "order": {
      "orderId": "AGK-ORD-001",
      "status": "in-transit",
      "startedAt": "2025-09-02T10:20:00.000Z",
      "estimatedDelivery": "2025-09-02T11:05:00.000Z"
    },
    "route": {
      "distance": "12.5 km",
      "estimatedTime": "45 minutes"
    }
  }
}
```

---

### 7️⃣ Update Location

**Purpose**: Track pilot's real-time location during delivery

#### Request Body:
```json
{
  "latitude": 12.9800,
  "longitude": 77.6000
}
```

**📝 Usage**: Call this API every 30 seconds during delivery to track pilot movement

---

### 8️⃣ Complete Delivery

**Purpose**: Finish the delivery with OTP verification

#### Request Body:
```json
{
  "orderId": "{{order_id}}",
  "deliveryOTP": "{{customer_otp}}",
  "deliveryNotes": "Delivered at main gate",
  "customerRating": 5
}
```

#### What Happens:
1. Verifies delivery OTP from customer
2. Changes order status to "delivered"
3. Calculates pilot earnings
4. Sends SMS notifications to customer and supplier
5. Updates pilot statistics
6. Makes pilot available for new orders

#### Expected Response:
```json
{
  "success": true,
  "message": "Delivery completed successfully",
  "data": {
    "order": {
      "orderId": "AGK-ORD-001",
      "status": "delivered",
      "deliveredAt": "2025-09-02T11:00:00.000Z",
      "deliveryNotes": "Delivered at main gate",
      "customerRating": 5
    },
    "earnings": 250,
    "notification": {
      "customerSMS": "sent",
      "supplierSMS": "sent"
    },
    "updatedStats": {
      "totalDeliveries": 2,
      "totalEarnings": 500,
      "averageRating": 4.8
    }
  }
}
```

---

## 👤 Profile & Statistics APIs

### 🎯 Goal: View pilot information and performance metrics

---

### 9️⃣ Get Profile

**Purpose**: View detailed pilot profile information

#### Step-by-Step Instructions:
1. **Click** "Get Profile" request
2. **URL**: `{{base_url}}/profile/{{pilot_id}}`
3. **Method**: `GET`
4. **Headers**: Auto-included authentication
5. **No Body Required** (GET requests don't need body data)

#### What You'll Get:
```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "data": {
    "pilot": {
      "pilotId": "PIL000001",
      "name": "Test Pilot",
      "phoneNumber": "9876543210",
      "email": "testpilot@example.com",
      "aadharNumber": "123456789012",
      "address": "123 Test St, Bangalore",
      "emergencyContact": "9876543211",
      "vehicleDetails": {
        "registrationNumber": "KA01AB1234",
        "vehicleType": "truck",
        "capacity": 5,
        "insuranceValid": true,
        "rcValid": true
      },
      "drivingLicense": {
        "number": "KA1234567890",
        "validTill": "2026-12-31",
        "isValid": true
      },
      "joinDate": "2025-08-15T09:30:00.000Z",
      "isActive": true,
      "isAvailable": true,
      "currentOrder": null
    }
  }
}
```

---

### 🔟 Get Stats

**Purpose**: View pilot's performance statistics and metrics

#### Request Details:
- **URL**: `{{base_url}}/stats`
- **Method**: `GET`
- **Authentication**: Required

#### Expected Response:
```json
{
  "success": true,
  "message": "Stats retrieved successfully",
  "data": {
    "stats": {
      "totalDeliveries": 45,
      "completedToday": 3,
      "completedThisWeek": 18,
      "completedThisMonth": 45,
      "totalEarnings": 12500,
      "earningsToday": 750,
      "earningsThisWeek": 3200,
      "earningsThisMonth": 12500,
      "averageRating": 4.8,
      "totalRatings": 42,
      "successRate": 98.5,
      "activeHours": "8.5 hours",
      "rankThisMonth": 12,
      "badges": [
        "Top Performer",
        "5-Star Delivery",
        "Speed Demon"
      ],
      "performance": {
        "onTimeDeliveries": 44,
        "lateDeliveries": 1,
        "cancelledOrders": 0,
        "averageDeliveryTime": "42 minutes"
      }
    }
  }
}
```

#### Understanding Your Stats:
- **totalDeliveries**: How many orders you've completed
- **earningsToday**: Money earned today
- **averageRating**: Customer satisfaction score (1-5)
- **successRate**: Percentage of successful deliveries
- **rankThisMonth**: Your ranking among all pilots
- **onTimeDeliveries**: Orders delivered within estimated time

---

### 1️⃣1️⃣ Delivery History

**Purpose**: View list of past deliveries with pagination

#### Request Details:
- **URL**: `{{base_url}}/delivery-history?page=1&limit=10`
- **Method**: `GET`
- **Query Parameters**:
  - `page`: Which page of results (starts from 1)
  - `limit`: How many results per page (default: 10, max: 50)

#### Example URLs:
- First 10 deliveries: `{{base_url}}/delivery-history?page=1&limit=10`
- Next 10 deliveries: `{{base_url}}/delivery-history?page=2&limit=10`
- Last 5 deliveries: `{{base_url}}/delivery-history?page=1&limit=5`

#### Expected Response:
```json
{
  "success": true,
  "message": "Delivery history retrieved successfully",
  "data": {
    "deliveries": [
      {
        "orderId": "AGK-ORD-045",
        "customer": {
          "name": "John Smith",
          "phone": "9876543221"
        },
        "deliveryAddress": "789 New Street, Bangalore",
        "items": [
          {
            "name": "Sand",
            "quantity": 5,
            "unit": "cubic meters"
          }
        ],
        "status": "delivered",
        "deliveredAt": "2025-09-01T16:30:00.000Z",
        "earnings": 180,
        "customerRating": 5,
        "deliveryTime": "38 minutes"
      },
      {
        "orderId": "AGK-ORD-044",
        "customer": {
          "name": "Mary Johnson",
          "phone": "9876543222"
        },
        "deliveryAddress": "456 Old Road, Bangalore",
        "items": [
          {
            "name": "Cement",
            "quantity": 8,
            "unit": "bags"
          }
        ],
        "status": "delivered",
        "deliveredAt": "2025-09-01T14:15:00.000Z",
        "earnings": 220,
        "customerRating": 4,
        "deliveryTime": "45 minutes"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalResults": 45,
      "hasNext": true,
      "hasPrevious": false
    }
  }
}
```

---

## 📊 Dashboard & Support APIs

### 🎯 Goal: Get daily overview and access support features

---

### 1️⃣2️⃣ Dashboard Stats

**Purpose**: Get today's overview and key metrics for pilot dashboard

#### Request Details:
- **URL**: `{{base_url}}/dashboard/stats`
- **Method**: `GET`

#### Expected Response:
```json
{
  "success": true,
  "message": "Dashboard stats retrieved successfully",
  "data": {
    "today": {
      "deliveries": 3,
      "earnings": 750,
      "hours": "6.5",
      "avgRating": 4.7,
      "status": "Available"
    },
    "thisWeek": {
      "deliveries": 18,
      "earnings": 3200,
      "bestDay": "Tuesday",
      "totalHours": "42.5"
    },
    "currentOrder": null,
    "notifications": {
      "unread": 2,
      "urgent": 0
    },
    "weather": {
      "condition": "Partly Cloudy",
      "temperature": "28°C",
      "advice": "Good conditions for delivery"
    },
    "announcements": [
      {
        "title": "New Bonus Program",
        "message": "Earn extra ₹50 for every 5-star rating!",
        "type": "promotion",
        "date": "2025-09-01"
      }
    ]
  }
}
```

---

### 1️⃣3️⃣ Get Notifications

**Purpose**: Retrieve notifications, messages, and alerts for the pilot

#### Request Details:
- **URL**: `{{base_url}}/dashboard/notifications`
- **Method**: `GET`

#### Expected Response:
```json
{
  "success": true,
  "message": "Notifications retrieved successfully",
  "data": {
    "notifications": [
      {
        "_id": "notif001",
        "title": "New Order Available",
        "message": "Order AGK-ORD-046 is available for pickup in your area",
        "type": "order",
        "priority": "high",
        "isRead": false,
        "createdAt": "2025-09-02T09:30:00.000Z",
        "action": {
          "type": "scan_order",
          "orderId": "AGK-ORD-046"
        }
      },
      {
        "_id": "notif002", 
        "title": "Payment Processed",
        "message": "Your earnings of ₹750 have been processed for yesterday's deliveries",
        "type": "payment",
        "priority": "medium",
        "isRead": false,
        "createdAt": "2025-09-02T08:00:00.000Z"
      },
      {
        "_id": "notif003",
        "title": "Profile Verification",
        "message": "Please update your driving license expiry date",
        "type": "profile",
        "priority": "low",
        "isRead": true,
        "createdAt": "2025-09-01T15:20:00.000Z",
        "action": {
          "type": "update_profile"
        }
      }
    ],
    "summary": {
      "total": 15,
      "unread": 2,
      "high_priority": 1,
      "types": {
        "order": 3,
        "payment": 2,
        "system": 1,
        "profile": 1
      }
    }
  }
}
```

---

### 1️⃣4️⃣ App Config

**Purpose**: Get app configuration and settings

#### Request Details:
- **URL**: `{{base_url}}/app/config`
- **Method**: `GET`
- **Authentication**: NOT required (public endpoint)

#### Expected Response:
```json
{
  "success": true,
  "message": "App configuration retrieved",
  "data": {
    "config": {
      "app": {
        "version": "1.2.3",
        "minimumVersion": "1.0.0",
        "updateRequired": false,
        "maintenanceMode": false
      },
      "features": {
        "locationTracking": true,
        "pushNotifications": true,
        "voiceNavigation": true,
        "cameraScanner": true
      },
      "settings": {
        "locationUpdateInterval": 30,
        "maxDeliveryRadius": 25,
        "supportPhone": "1800-123-4567",
        "supportEmail": "support@aggrekart.com"
      },
      "payment": {
        "instantPayout": true,
        "weeklyPayout": true,
        "minimumEarnings": 100
      }
    }
  }
}
```

---

### 1️⃣5️⃣ Get FAQs

**Purpose**: Retrieve frequently asked questions and help content

#### Request Details:
- **URL**: `{{base_url}}/support/faqs`
- **Method**: `GET`

#### Expected Response:
```json
{
  "success": true,
  "message": "FAQs retrieved successfully",
  "data": {
    "faqs": [
      {
        "id": 1,
        "category": "Delivery",
        "question": "What should I do if customer is not available?",
        "answer": "Try calling the customer 2-3 times. If still no response, contact support and wait for 10 minutes before marking as attempted delivery.",
        "helpful": 95,
        "priority": "high"
      },
      {
        "id": 2,
        "category": "Payment",
        "question": "When will I receive my earnings?",
        "answer": "Earnings are processed daily and transferred to your bank account within 24-48 hours after delivery completion.",
        "helpful": 87,
        "priority": "high"
      },
      {
        "id": 3,
        "category": "App",
        "question": "How do I update my vehicle information?",
        "answer": "Go to Profile → Vehicle Details → Edit. You can update registration number, insurance validity, and capacity.",
        "helpful": 92,
        "priority": "medium"
      },
      {
        "id": 4,
        "category": "Orders",
        "question": "Can I cancel an accepted order?",
        "answer": "Orders can be cancelled only in emergency situations. Contact support immediately with valid reason. Frequent cancellations may affect your rating.",
        "helpful": 78,
        "priority": "medium"
      }
    ],
    "categories": [
      "Delivery",
      "Payment", 
      "App",
      "Orders",
      "Account",
      "Technical"
    ]
  }
}
```

---

### 1️⃣6️⃣ Contact Support

**Purpose**: Send support ticket or contact customer service

#### Request Details:
- **URL**: `{{base_url}}/support/contact`
- **Method**: `POST`
- **Authentication**: Required

#### Request Body:
```json
{
  "subject": "Payment Issue",
  "message": "I haven't received payment for order AGK-ORD-043 delivered on 2025-09-01. Please check and resolve.",
  "priority": "high",
  "category": "payment"
}
```

#### Field Explanations:
- `subject`: Brief description of the issue
- `message`: Detailed explanation of the problem
- `priority`: `low` | `medium` | `high` | `urgent`
- `category`: `payment` | `delivery` | `technical` | `account` | `other`

#### Expected Response:
```json
{
  "success": true,
  "message": "Support ticket created successfully",
  "data": {
    "ticket": {
      "ticketId": "SUP-2025-001234",
      "subject": "Payment Issue", 
      "status": "open",
      "priority": "high",
      "category": "payment",
      "createdAt": "2025-09-02T10:45:00.000Z",
      "estimatedResponse": "Within 2 hours",
      "assignedAgent": "Support Team"
    },
    "message": "Your ticket has been created. You will receive updates via SMS and app notifications.",
    "supportPhone": "1800-123-4567"
  }
}
```

---

## 🧪 Complete Testing Workflow

### 🎯 Recommended Testing Sequence

#### Phase 1: Authentication (Must Complete First)
1. ✅ **Test Server Health** - Verify API is running
2. ✅ **Register Pilot** (if new) - Create account
3. ✅ **Request OTP** - Get SMS code
4. ✅ **Verify OTP** - Complete login and get token

#### Phase 2: Order Management (Core Features)
5. ✅ **Scan Order** - Get order details
6. ✅ **Accept Order** - Take delivery assignment
7. ✅ **Start Journey** - Begin delivery trip
8. ✅ **Update Location** - Track movement
9. ✅ **Complete Delivery** - Finish with OTP

#### Phase 3: Profile & Stats (Information)
10. ✅ **Get Profile** - View pilot details
11. ✅ **Get Stats** - Check performance metrics
12. ✅ **Delivery History** - See past orders

#### Phase 4: Dashboard & Support (Additional)
13. ✅ **Dashboard Stats** - Today's overview
14. ✅ **Get Notifications** - Check messages
15. ✅ **App Config** - Get app settings
16. ✅ **Get FAQs** - Browse help content
17. ✅ **Contact Support** - Test support system

---

## 🚨 Troubleshooting Guide

### Common Issues & Solutions

#### ❌ "Cannot connect to server"
**Problem**: Server is not running or wrong URL
**Solution**: 
1. Verify server is running on port 5000
2. Check environment variable `base_url` is correct
3. Try: `http://127.0.0.1:5000/api/pilot` instead of `localhost`

#### ❌ "Access denied. No token provided"
**Problem**: Authentication token missing
**Solution**:
1. Complete login flow first (Request OTP → Verify OTP)
2. Check `{{pilot_token}}` environment variable is set
3. Ensure Authorization header is included

#### ❌ "Invalid or expired OTP"
**Problem**: Wrong OTP or OTP expired
**Solution**:
1. Use exact OTP from "Request OTP" response
2. Request new OTP if expired (10 minute limit)
3. Check phone number matches registration

#### ❌ "Order not found" 
**Problem**: Invalid order ID or order doesn't exist
**Solution**:
1. Check `{{order_id}}` environment variable
2. Ensure test data exists in database
3. Try with different order ID format

#### ❌ "Pilot already registered"
**Problem**: Phone number already exists
**Solution**:
1. This is normal! Skip registration step
2. Proceed directly to OTP login
3. Use different phone number for new test

#### ❌ JSON parse error
**Problem**: Request body format is wrong
**Solution**:
1. Ensure Body is set to "raw" and "JSON"
2. Check JSON syntax (proper quotes and commas)
3. Use Postman's JSON formatter

---

## 🎯 Best Practices & Tips

### 🔥 Pro Tips for Efficient Testing

#### 1. Organization
- ✅ Create separate environments for different setups (Local, Staging, Production)
- ✅ Use folders to group related requests
- ✅ Add descriptions to requests for team clarity

#### 2. Environment Variables
- ✅ Use variables for all dynamic values
- ✅ Don't hardcode URLs, tokens, or IDs
- ✅ Create different variable sets for different test scenarios

#### 3. Testing Strategy
- ✅ Always test happy path (success scenarios) first  
- ✅ Then test error cases (wrong data, missing auth, etc.)
- ✅ Use realistic test data that matches production

#### 4. Automation
- ✅ Add test scripts to validate responses
- ✅ Use pre-request scripts for data setup
- ✅ Create test suites for regression testing

#### 5. Documentation
- ✅ Document expected responses
- ✅ Add examples for different scenarios
- ✅ Keep documentation updated with API changes

### 📊 Advanced Features

#### Collection Runner
Use for automated testing of entire workflow:
1. Click "Runner" button
2. Select "Aggrekart Pilot APIs" collection  
3. Choose environment
4. Set iterations and delay
5. Run complete test suite

#### Monitors
Set up automated health checks:
1. Click "Monitors" tab
2. Create new monitor
3. Schedule regular API health checks
4. Get email alerts for failures

#### Mock Servers
Create fake responses for development:
1. Right-click collection → "Mock Collection"
2. Use mock URL during frontend development
3. Test UI without backend dependencies

---

## 📱 Integration with Mobile Apps

### React Native Example
```javascript
// Example integration in React Native app
const API_BASE_URL = 'http://your-server.com/api/pilot';

const loginPilot = async (phoneNumber, otp) => {
  try {
    const response = await fetch(`${API_BASE_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phoneNumber, otp }),
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Store token for future requests
      await AsyncStorage.setItem('pilot_token', data.data.token);
      return data.data.pilot;
    }
  } catch (error) {
    console.error('Login error:', error);
  }
};
```

### Flutter/Dart Example  
```dart
Future<Map<String, dynamic>> scanOrder(String orderId) async {
  final token = await getStoredToken();
  
  final response = await http.post(
    Uri.parse('$baseUrl/scan-order'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    },
    body: jsonEncode({'orderId': orderId}),
  );
  
  return jsonDecode(response.body);
}
```

---

## 🏆 Success Criteria

### ✅ Your APIs are working correctly when:

1. **Authentication Flow**: 
   - ✅ OTP sent via SMS successfully
   - ✅ Login returns valid JWT token
   - ✅ Token is accepted by protected endpoints

2. **Order Management**:
   - ✅ Order scanning returns complete details
   - ✅ Order acceptance updates status correctly
   - ✅ Delivery completion triggers notifications

3. **Data Consistency**:
   - ✅ Profile information matches registration data
   - ✅ Statistics update after each delivery
   - ✅ History shows chronological order list

4. **Error Handling**:
   - ✅ Invalid requests return clear error messages
   - ✅ Authentication failures are handled gracefully
   - ✅ Missing data validations work properly

### 🎉 Congratulations!

If all tests pass, your Aggrekart Pilot API system is **production-ready** and fully functional for mobile app integration!

---

**📞 Need Help?**
- 📧 Email: support@aggrekart.com
- 📱 Phone: 1800-123-4567
- 💬 Documentation Issues: Create GitHub issue
- 🔧 Technical Support: Contact development team