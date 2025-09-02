
# 🚚 Aggrekart Pilot API - Quick Reference

**Base URL:** `http://localhost:5000/api/pilot`

## 🔐 Authentication Flow

```bash
# 1. Register Pilot
curl -X POST /api/pilot/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "phoneNumber": "9876543210",
    "vehicleDetails": {
      "registrationNumber": "KA01AB1234",
      "vehicleType": "truck",
      "capacity": 5.0
    },
    "drivingLicense": {
      "number": "KA12345678",
      "validTill": "2025-12-31"
    }
  }'

# 2. Request OTP
curl -X POST /api/pilot/login \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "9876543210"}'

# 3. Verify OTP & Get Token
curl -X POST /api/pilot/login \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "9876543210", "otp": "123456"}'
```

## 📦 Order Management Flow

```bash
# Set token from login response
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 1. Scan Order QR Code
curl -X POST /api/pilot/scan-order \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orderId": "AGK1755273478411UWC"}'

# 2. Accept Order
curl -X POST /api/pilot/accept-order \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orderId": "AGK1755273478411UWC", "pilotId": "PIL000001"}'

# 3. Start Journey
curl -X POST /api/pilot/start-journey \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "AGK1755273478411UWC",
    "currentLocation": {"latitude": 17.4735, "longitude": 78.3773}
  }'

# 4. Complete Delivery (with OTP)
curl -X POST /api/pilot/complete-delivery \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "AGK1755273478411UWC",
    "deliveryOTP": "716169",
    "deliveryNotes": "Delivered successfully",
    "customerRating": 5
  }'
```

## 👨‍✈️ Profile & Stats

```bash
# Get Pilot Profile
curl -X GET /api/pilot/profile/PIL000001 \
  -H "Authorization: Bearer $TOKEN"

# Get Statistics
curl -X GET /api/pilot/stats \
  -H "Authorization: Bearer $TOKEN"

# Get Delivery History
curl -X GET "/api/pilot/delivery-history?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"

# Update Location
curl -X POST /api/pilot/update-location \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"latitude": 17.4735, "longitude": 78.3773}'
```

## 📊 Dashboard & Support

```bash
# Dashboard Stats
curl -X GET /api/pilot/dashboard/stats \
  -H "Authorization: Bearer $TOKEN"

# Notifications
curl -X GET /api/pilot/dashboard/notifications \
  -H "Authorization: Bearer $TOKEN"

# App Config (No auth needed)
curl -X GET /api/pilot/app/config

# Support FAQs (No auth needed)
curl -X GET /api/pilot/support/faqs

# Contact Support
curl -X POST /api/pilot/support/contact \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Payment Issue",
    "message": "Issue description",
    "priority": "medium"
  }'
```

## 🎯 Key Response Formats

### Success Response:
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { /* response data */ }
}
```

### Error Response:
```json
{
  "success": false,
  "message": "Error description",
  "error": { "statusCode": 400 }
}
```

## 📱 Mobile Integration Tips

### Headers for All Authenticated Requests:
```javascript
headers: {
  'Authorization': 'Bearer ' + token,
  'Content-Type': 'application/json'
}
```

### Order Status Flow:
1. **`confirmed`** → **`dispatched`** → **`delivered`**
2. Use `scan-order` to check if order is ready for pickup
3. Order must be in `dispatched` status for delivery completion

### Vehicle Types:
- `truck`
- `mini_truck` 
- `pickup`
- `tractor`
- `trailer`

### Phone Number Format:
- 10 digits only: `9876543210`
- Must start with 6, 7, 8, or 9

## 🚨 Important Notes

1. **Order ID Format:** Use AGK format (`AGK1755273478411UWC`)
2. **Token Expiry:** 30 days - implement refresh mechanism
3. **OTP Validity:** 10 minutes for login OTP
4. **Delivery OTP:** Required for completing delivery
5. **Notifications:** Automatically sent on delivery completion
6. **Location Updates:** Send regularly for live tracking

## 🔧 Development Environment

- **Server:** Node.js + Express
- **Database:** MongoDB
- **Auth:** JWT Bearer Token
- **SMS:** Twilio integration
- **Email:** Nodemailer

## 📞 Support
- **Email:** support@aggrekart.com
- **Phone:** +91-9876543210
- **Documentation:** Full API docs available in `PILOT_API_DOCUMENTATION.md`

---
**🚀 Ready to integrate!** Use this quick reference for rapid development.