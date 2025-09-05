# 🚀 Quick Start - Test Live Pilot APIs (5 Minutes)

## 📋 **Instant Setup Checklist**

### **1. Import Environment (30 seconds)**
1. Open Postman
2. Click gear icon ⚙️ (top-right)
3. Click "Import"
4. Select `Postman_Environment_Live_Render.json`
5. Click "Import"
6. **Select** "Aggrekart Pilot APIs - Live (Render)" from dropdown

### **2. Quick Health Check (15 seconds)**
```
GET https://aggrekart-com-backend.onrender.com/api/health
Expected: Status 200, "success": true
```

### **3. Login Test (2 minutes)**
**Step 1: Request OTP**
```json
POST {{base_url}}/login
Body: {
  "phoneNumber": "9876543210"
}
```
**✅ You'll get SMS OTP + see OTP in response**

**Step 2: Login with OTP**
```json
POST {{base_url}}/login
Body: {
  "phoneNumber": "9876543210", 
  "otp": "YOUR_OTP_HERE"
}
```
**✅ Token automatically saved to environment**

### **4. Test Core APIs (2 minutes)**
**Scan Real Order:**
```json
POST {{base_url}}/scan-order
Headers: Authorization: Bearer {{pilot_token}}
Body: {
  "orderId": "AGK1755273478411UWC"
}
```

**Get Profile:**
```
GET {{base_url}}/profile/{{pilot_id}}
Headers: Authorization: Bearer {{pilot_token}}
```

**Get Stats:**
```
GET {{base_url}}/stats
Headers: Authorization: Bearer {{pilot_token}}
```

---

## ✅ **Expected Results**

### **Login Success:**
```json
{
  "success": true,
  "data": {
    "pilot": {
      "pilotId": "PIL000001",
      "name": "Test Pilot",
      "totalDeliveries": 1
    },
    "token": "eyJ..."
  }
}
```

### **Order Scan Success:**
```json
{
  "success": true,
  "data": {
    "order": {
      "orderId": "AGK1755273478411UWC",
      "customer": {
        "name": "Subhankar Dash"
      },
      "deliveryAddress": {
        "city": "Hyderabad"
      },
      "pricing": {
        "totalAmount": 148
      }
    }
  }
}
```

---

## 🎯 **Success = All APIs Return Status 200 + Real Data!**

**🔗 Full Documentation:** `POSTMAN_RENDER_LIVE_GUIDE.md`

**🌐 Live URLs:**
- **Backend:** https://aggrekart-com-backend.onrender.com
- **Frontend:** https://aggrekart-com.onrender.com