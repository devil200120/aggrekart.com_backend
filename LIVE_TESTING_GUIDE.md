# 🌐 Live Pilot API Testing Guide - Render Deployment

## 🎯 Live URLs
- **Frontend**: https://aggrekart-com.onrender.com
- **Backend API**: https://aggrekart-com-backend.onrender.com

## 🚀 Quick Start Testing

### Step 1: Health Check
Test if your backend is live and running:

```bash
curl https://aggrekart-com-backend.onrender.com/api/health
```

**Expected Response:**
```json
{
  "success": true,
  "status": "OK",
  "message": "Aggrekart API is running",
  "environment": "production"
}
```

### Step 2: Test with Browser
Open your browser and visit:
```
https://aggrekart-com-backend.onrender.com/api/health
```

## 📮 Postman Testing on Live Environment

### Import Live Environment
1. **Import Environment**: 
   - Use `Postman_Environment_Live_Render.json`
   - This sets `base_url` to your live Render backend

2. **Select Live Environment**:
   - Click environment dropdown in Postman
   - Select "Aggrekart Pilot APIs - Live (Render)"

### Live Testing Workflow

#### 🔐 Authentication (IMPORTANT: Use Real Phone Number!)
1. **Register Pilot** (if needed):
   ```json
   POST https://aggrekart-com-backend.onrender.com/api/pilot/register
   {
     "name": "Live Test Pilot",
     "phoneNumber": "YOUR_REAL_PHONE_NUMBER",
     "email": "livepilot@example.com",
     "aadharNumber": "123456789012",
     "address": "123 Live Test St, Bangalore",
     "emergencyContact": "9876543211",
     "vehicleDetails": {
       "registrationNumber": "KA01LV1234",
       "vehicleType": "truck",
       "capacity": 5
     },
     "drivingLicense": {
       "number": "KA1234567890",
       "validTill": "2026-12-31"
     }
   }
   ```

2. **Request OTP** (SMS will be sent to your phone!):
   ```json
   POST https://aggrekart-com-backend.onrender.com/api/pilot/login
   {
     "phoneNumber": "YOUR_REAL_PHONE_NUMBER"
   }
   ```

3. **Verify OTP** (use the OTP you received via SMS):
   ```json
   POST https://aggrekart-com-backend.onrender.com/api/pilot/login
   {
     "phoneNumber": "YOUR_REAL_PHONE_NUMBER",
     "otp": "RECEIVED_OTP_FROM_SMS"
   }
   ```

#### 📦 Order Management Testing
4. **Scan Order**:
   ```json
   POST https://aggrekart-com-backend.onrender.com/api/pilot/scan-order
   Headers: Authorization: Bearer {{pilot_token}}
   {
     "orderId": "REAL_ORDER_ID_FROM_DATABASE"
   }
   ```

5. **Get Profile**:
   ```json
   GET https://aggrekart-com-backend.onrender.com/api/pilot/profile/{{pilot_id}}
   Headers: Authorization: Bearer {{pilot_token}}
   ```

## 🧪 JavaScript Testing Script

Run this in your browser console or Node.js to test live APIs:

### Browser Console Testing:
1. Go to https://aggrekart-com.onrender.com
2. Press F12 → Console tab
3. Copy and paste the testing script from `test-live-pilot-apis.js`

### Node.js Testing:
```bash
# In your project directory
node test-live-pilot-apis.js
```

## 🌐 cURL Commands for Live Testing

### Health Check:
```bash
curl -X GET https://aggrekart-com-backend.onrender.com/api/health
```

### Request OTP:
```bash
curl -X POST https://aggrekart-com-backend.onrender.com/api/pilot/login \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"YOUR_PHONE_NUMBER"}'
```

### Verify OTP:
```bash
curl -X POST https://aggrekart-com-backend.onrender.com/api/pilot/login \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"YOUR_PHONE_NUMBER","otp":"RECEIVED_OTP"}'
```

### Scan Order (with token):
```bash
curl -X POST https://aggrekart-com-backend.onrender.com/api/pilot/scan-order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"orderId":"AGK-ORD-001"}'
```

## 🔍 Common Live Environment Issues & Solutions

### ❌ "Cannot connect to backend"
**Problem**: Frontend can't reach backend
**Solution**: 
- Check if backend service is running on Render
- Verify CORS settings allow your frontend domain
- Check environment variables are set correctly

### ❌ "SMS not received"
**Problem**: Twilio OTP not sending in production
**Solution**:
- Verify Twilio credentials in Render environment variables
- Check Twilio account balance
- Ensure phone number is in correct format

### ❌ "Database connection failed"
**Problem**: MongoDB connection issues
**Solution**:
- Check MongoDB Atlas connection string in environment variables
- Verify database user permissions
- Check if IP whitelist includes Render's IPs

### ❌ "Environment variables not found"
**Problem**: Missing configuration
**Solution**:
- Go to Render Dashboard → Your Service → Environment
- Add all required environment variables:
  - `MONGODB_URI`
  - `JWT_SECRET`
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE_NUMBER`

## 📊 Live API Monitoring

### Check Service Status:
- Go to Render Dashboard
- Check service logs for errors
- Monitor response times

### Database Connection:
```bash
# Test database connectivity
curl -X GET https://aggrekart-com-backend.onrender.com/api/health
```

## 🎉 Success Indicators

### ✅ Your live deployment is working when:
1. **Health endpoint returns 200 OK**
2. **OTP SMS is received on real phone**
3. **Login returns valid JWT token**
4. **Protected endpoints accept the token**
5. **Database operations complete successfully**

## 📱 Mobile App Configuration

Update your mobile app's API base URL to:
```javascript
const API_BASE_URL = 'https://aggrekart-com-backend.onrender.com/api/pilot';
```

## 🔧 Production Checklist

- [ ] Backend service running on Render
- [ ] Environment variables configured
- [ ] CORS settings allow frontend domain
- [ ] Database connection working
- [ ] Twilio SMS working in production
- [ ] All API endpoints responding correctly
- [ ] Mobile app updated with live URLs

---

**🎯 Ready for Production!**

Your pilot APIs are now live and ready for real-world testing and mobile app integration!