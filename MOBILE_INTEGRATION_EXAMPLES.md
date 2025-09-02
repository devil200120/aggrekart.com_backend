

# 📱 Mobile App Integration Examples

## React Native Example

```javascript
// PilotAPI.js - API Service Class
class PilotAPI {
  constructor() {
    this.baseURL = 'http://localhost:5000/api/pilot';
    this.token = null;
  }

  // Set auth token
  setToken(token) {
    this.token = token;
  }

  // Helper method for API calls
  async apiCall(endpoint, method = 'GET', data = null) {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const config = {
      method,
      headers,
    };

    if (data) {
      config.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, config);
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'API call failed');
      }
      
      return result;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Authentication methods
  async registerPilot(pilotData) {
    return this.apiCall('/register', 'POST', pilotData);
  }

  async requestOTP(phoneNumber) {
    return this.apiCall('/login', 'POST', { phoneNumber });
  }

  async verifyOTP(phoneNumber, otp) {
    const response = await this.apiCall('/login', 'POST', { phoneNumber, otp });
    if (response.success && response.data.token) {
      this.setToken(response.data.token);
    }
    return response;
  }

  // Order management methods
  async scanOrder(orderId) {
    return this.apiCall('/scan-order', 'POST', { orderId });
  }

  async acceptOrder(orderId, pilotId) {
    return this.apiCall('/accept-order', 'POST', { orderId, pilotId });
  }

  async startJourney(orderId, currentLocation) {
    return this.apiCall('/start-journey', 'POST', { orderId, currentLocation });
  }

  async completeDelivery(orderId, deliveryOTP, deliveryNotes, customerRating) {
    return this.apiCall('/complete-delivery', 'POST', {
      orderId,
      deliveryOTP,
      deliveryNotes,
      customerRating
    });
  }

  async updateLocation(latitude, longitude) {
    return this.apiCall('/update-location', 'POST', { latitude, longitude });
  }

  // Profile methods
  async getProfile(pilotId) {
    return this.apiCall(`/profile/${pilotId}`);
  }

  async getStats() {
    return this.apiCall('/stats');
  }

  async getDeliveryHistory(page = 1, limit = 10) {
    return this.apiCall(`/delivery-history?page=${page}&limit=${limit}`);
  }

  // Dashboard methods
  async getDashboardStats() {
    return this.apiCall('/dashboard/stats');
  }

  async getNotifications() {
    return this.apiCall('/dashboard/notifications');
  }

  // Support methods
  async getAppConfig() {
    return this.apiCall('/app/config');
  }

  async getFAQs() {
    return this.apiCall('/support/faqs');
  }

  async contactSupport(subject, message, priority = 'medium') {
    return this.apiCall('/support/contact', 'POST', { subject, message, priority });
  }
}

// Usage Example
const pilotAPI = new PilotAPI();

// Login flow
const handleLogin = async (phoneNumber) => {
  try {
    // Step 1: Request OTP
    await pilotAPI.requestOTP(phoneNumber);
    
    // Step 2: Show OTP input screen
    // Step 3: Verify OTP
    const loginResult = await pilotAPI.verifyOTP(phoneNumber, otpCode);
    
    if (loginResult.success) {
      // Store pilot data and navigate to main app
      await AsyncStorage.setItem('pilot_token', loginResult.data.token);
      await AsyncStorage.setItem('pilot_data', JSON.stringify(loginResult.data.pilot));
    }
  } catch (error) {
    Alert.alert('Login Error', error.message);
  }
};

// Order scanning flow
const handleOrderScan = async (scannedOrderId) => {
  try {
    const orderDetails = await pilotAPI.scanOrder(scannedOrderId);
    
    if (orderDetails.success) {
      // Show order details to pilot
      navigation.navigate('OrderDetails', { order: orderDetails.data.order });
    }
  } catch (error) {
    Alert.alert('Scan Error', error.message);
  }
};

// Complete delivery flow
const handleCompleteDelivery = async (orderId, otp, notes, rating) => {
  try {
    const result = await pilotAPI.completeDelivery(orderId, otp, notes, rating);
    
    if (result.success) {
      Alert.alert('Success', 'Delivery completed successfully!');
      navigation.navigate('Dashboard');
    }
  } catch (error) {
    Alert.alert('Delivery Error', error.message);
  }
};

export default pilotAPI;
```

## Flutter/Dart Example

```dart
// pilot_api_service.dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class PilotApiService {
  static const String baseUrl = 'http://localhost:5000/api/pilot';
  String? _token;

  void setToken(String token) {
    _token = token;
  }

  Map<String, String> get _headers {
    Map<String, String> headers = {
      'Content-Type': 'application/json',
    };
    
    if (_token != null) {
      headers['Authorization'] = 'Bearer $_token';
    }
    
    return headers;
  }

  Future<Map<String, dynamic>> _makeRequest(
    String endpoint, 
    String method, 
    [Map<String, dynamic>? data]
  ) async {
    final url = Uri.parse('$baseUrl$endpoint');
    http.Response response;

    switch (method.toUpperCase()) {
      case 'GET':
        response = await http.get(url, headers: _headers);
        break;
      case 'POST':
        response = await http.post(
          url, 
          headers: _headers,
          body: data != null ? jsonEncode(data) : null,
        );
        break;
      default:
        throw Exception('Unsupported HTTP method: $method');
    }

    final Map<String, dynamic> responseData = jsonDecode(response.body);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return responseData;
    } else {
      throw Exception(responseData['message'] ?? 'Request failed');
    }
  }

  // Authentication
  Future<Map<String, dynamic>> requestOTP(String phoneNumber) async {
    return _makeRequest('/login', 'POST', {'phoneNumber': phoneNumber});
  }

  Future<Map<String, dynamic>> verifyOTP(String phoneNumber, String otp) async {
    final response = await _makeRequest('/login', 'POST', {
      'phoneNumber': phoneNumber,
      'otp': otp,
    });
    
    if (response['success'] && response['data']['token'] != null) {
      setToken(response['data']['token']);
    }
    
    return response;
  }

  // Order Management
  Future<Map<String, dynamic>> scanOrder(String orderId) async {
    return _makeRequest('/scan-order', 'POST', {'orderId': orderId});
  }

  Future<Map<String, dynamic>> acceptOrder(String orderId, String pilotId) async {
    return _makeRequest('/accept-order', 'POST', {
      'orderId': orderId,
      'pilotId': pilotId,
    });
  }

  Future<Map<String, dynamic>> completeDelivery({
    required String orderId,
    required String deliveryOTP,
    String? deliveryNotes,
    int? customerRating,
  }) async {
    return _makeRequest('/complete-delivery', 'POST', {
      'orderId': orderId,
      'deliveryOTP': deliveryOTP,
      'deliveryNotes': deliveryNotes,
      'customerRating': customerRating,
    });
  }

  // Location tracking
  Future<Map<String, dynamic>> updateLocation(double latitude, double longitude) async {
    return _makeRequest('/update-location', 'POST', {
      'latitude': latitude,
      'longitude': longitude,
    });
  }

  // Profile and stats
  Future<Map<String, dynamic>> getProfile(String pilotId) async {
    return _makeRequest('/profile/$pilotId', 'GET');
  }

  Future<Map<String, dynamic>> getDashboardStats() async {
    return _makeRequest('/dashboard/stats', 'GET');
  }
}

// Usage example in Flutter widget
class DeliveryCompletionScreen extends StatefulWidget {
  final String orderId;
  
  DeliveryCompletionScreen({required this.orderId});

  @override
  _DeliveryCompletionScreenState createState() => _DeliveryCompletionScreenState();
}

class _DeliveryCompletionScreenState extends State<DeliveryCompletionScreen> {
  final PilotApiService _apiService = PilotApiService();
  final TextEditingController _otpController = TextEditingController();
  final TextEditingController _notesController = TextEditingController();
  int _rating = 5;

  Future<void> _completeDelivery() async {
    try {
      final result = await _apiService.completeDelivery(
        orderId: widget.orderId,
        deliveryOTP: _otpController.text,
        deliveryNotes: _notesController.text,
        customerRating: _rating,
      );

      if (result['success']) {
        // Show success message and navigate
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Delivery completed successfully!')),
        );
        Navigator.pushReplacementNamed(context, '/dashboard');
      }
    } catch (error) {
      // Show error message
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $error')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Complete Delivery')),
      body: Padding(
        padding: EdgeInsets.all(16.0),
        child: Column(
          children: [
            TextField(
              controller: _otpController,
              decoration: InputDecoration(labelText: 'Delivery OTP'),
              keyboardType: TextInputType.number,
              maxLength: 6,
            ),
            TextField(
              controller: _notesController,
              decoration: InputDecoration(labelText: 'Delivery Notes'),
              maxLines: 3,
            ),
            // Rating widget here
            ElevatedButton(
              onPressed: _completeDelivery,
              child: Text('Complete Delivery'),
            ),
          ],
        ),
      ),
    );
  }
}
```

## Android (Kotlin) Example

```kotlin
// PilotApiService.kt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException

class PilotApiService {
    private val baseUrl = "http://localhost:5000/api/pilot"
    private var token: String? = null
    private val client = OkHttpClient()

    fun setToken(token: String) {
        this.token = token
    }

    private suspend fun makeRequest(
        endpoint: String,
        method: String,
        data: JSONObject? = null
    ): JSONObject = withContext(Dispatchers.IO) {
        val requestBuilder = Request.Builder()
            .url("$baseUrl$endpoint")
            .addHeader("Content-Type", "application/json")

        token?.let {
            requestBuilder.addHeader("Authorization", "Bearer $it")
        }

        when (method.toUpperCase()) {
            "GET" -> requestBuilder.get()
            "POST" -> {
                val body = data?.toString()?.toRequestBody("application/json".toMediaTypeOrNull())
                requestBuilder.post(body ?: "".toRequestBody())
            }
        }

        val response = client.newCall(requestBuilder.build()).execute()
        val responseBody = response.body?.string() ?: ""
        
        if (!response.isSuccessful) {
            throw IOException("Request failed with code: ${response.code}")
        }

        JSONObject(responseBody)
    }

    suspend fun requestOTP(phoneNumber: String): JSONObject {
        val data = JSONObject().apply {
            put("phoneNumber", phoneNumber)
        }
        return makeRequest("/login", "POST", data)
    }

    suspend fun verifyOTP(phoneNumber: String, otp: String): JSONObject {
        val data = JSONObject().apply {
            put("phoneNumber", phoneNumber)
            put("otp", otp)
        }
        val response = makeRequest("/login", "POST", data)
        
        if (response.getBoolean("success")) {
            val token = response.getJSONObject("data").getString("token")
            setToken(token)
        }
        
        return response
    }

    suspend fun scanOrder(orderId: String): JSONObject {
        val data = JSONObject().apply {
            put("orderId", orderId)
        }
        return makeRequest("/scan-order", "POST", data)
    }

    suspend fun completeDelivery(
        orderId: String,
        deliveryOTP: String,
        deliveryNotes: String? = null,
        customerRating: Int? = null
    ): JSONObject {
        val data = JSONObject().apply {
            put("orderId", orderId)
            put("deliveryOTP", deliveryOTP)
            deliveryNotes?.let { put("deliveryNotes", it) }
            customerRating?.let { put("customerRating", it) }
        }
        return makeRequest("/complete-delivery", "POST", data)
    }
}

// Usage in Activity
class DeliveryActivity : AppCompatActivity() {
    private val apiService = PilotApiService()
    
    private fun completeDelivery() {
        lifecycleScope.launch {
            try {
                val result = apiService.completeDelivery(
                    orderId = intent.getStringExtra("orderId")!!,
                    deliveryOTP = otpEditText.text.toString(),
                    deliveryNotes = notesEditText.text.toString(),
                    customerRating = ratingBar.rating.toInt()
                )
                
                if (result.getBoolean("success")) {
                    Toast.makeText(this@DeliveryActivity, "Delivery completed!", Toast.LENGTH_SHORT).show()
                    finish()
                }
            } catch (e: Exception) {
                Toast.makeText(this@DeliveryActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
```

## JavaScript/Web Example

```javascript
// pilot-api.js
class PilotWebAPI {
  constructor(baseUrl = 'http://localhost:5000/api/pilot') {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem('pilot_token');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('pilot_token', token);
  }

  async request(endpoint, method = 'GET', data = null) {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const config = {
      method,
      headers,
    };

    if (data) {
      config.body = JSON.stringify(data);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, config);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Request failed');
    }

    return result;
  }

  async login(phoneNumber, otp) {
    const result = await this.request('/login', 'POST', { phoneNumber, otp });
    if (result.success && result.data.token) {
      this.setToken(result.data.token);
    }
    return result;
  }

  async scanOrder(orderId) {
    return this.request('/scan-order', 'POST', { orderId });
  }

  async completeDelivery(orderId, deliveryOTP, deliveryNotes, customerRating) {
    return this.request('/complete-delivery', 'POST', {
      orderId,
      deliveryOTP,
      deliveryNotes,
      customerRating
    });
  }

  async getDashboardStats() {
    return this.request('/dashboard/stats');
  }
}

// Usage
const pilotAPI = new PilotWebAPI();

document.getElementById('complete-delivery-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  try {
    const result = await pilotAPI.completeDelivery(
      document.getElementById('order-id').value,
      document.getElementById('otp').value,
      document.getElementById('notes').value,
      parseInt(document.getElementById('rating').value)
    );
    
    if (result.success) {
      alert('Delivery completed successfully!');
      window.location.href = '/dashboard';
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
});
```

## Key Integration Points

### 1. Error Handling
```javascript
try {
  const result = await pilotAPI.someMethod();
  // Handle success
} catch (error) {
  if (error.message.includes('unauthorized')) {
    // Redirect to login
  } else if (error.message.includes('not found')) {
    // Handle not found
  } else {
    // Handle generic error
  }
}
```

### 2. Token Management
```javascript
// Store token securely
await SecureStore.setItemAsync('pilot_token', token);

// Auto-refresh on app start
const token = await SecureStore.getItemAsync('pilot_token');
if (token) {
  pilotAPI.setToken(token);
}
```

### 3. Location Tracking
```javascript
// Update location every 30 seconds
setInterval(async () => {
  const position = await getCurrentPosition();
  await pilotAPI.updateLocation(
    position.coords.latitude,
    position.coords.longitude
  );
}, 30000);
```

### 4. Offline Handling
```javascript
// Queue actions when offline
const offlineQueue = [];

if (!navigator.onLine) {
  offlineQueue.push({ method: 'updateLocation', data: locationData });
} else {
  // Process queue when back online
  for (const action of offlineQueue) {
    await pilotAPI[action.method](action.data);
  }
}
```

---

**💡 Pro Tips:**
- Always handle errors gracefully
- Store tokens securely
- Implement offline queue for critical actions
- Use loading states for better UX
- Validate data before sending to API