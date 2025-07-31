const axios = require('axios');

// Masters India API Configuration
const MASTERS_INDIA_CONFIG = {
  baseURL: 'https://commonapi.mastersindia.co',
  username: process.env.MASTERS_INDIA_USERNAME || 'aggrekart.com@gmail.com',
  password: process.env.MASTERS_INDIA_PASSWORD || 'Masters@1234567',
  client_id: process.env.MASTERS_INDIA_CLIENT_ID || 'rUFnqFmbkIeWzLIgRz',
  client_secret: process.env.MASTERS_INDIA_CLIENT_SECRET || 'djFxym5GGgDbUj3mu0f8Nx9v'
};

// Enhanced debug logging
const debugLog = (message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 🔍 [GST API] ${message}`);
  if (data) {
    try {
      console.log('📊 Data:', JSON.stringify(data, null, 2));
    } catch (e) {
      console.log('📊 Data (non-serializable):', data);
    }
  }
};

// Validate GST number format
const validateGSTNumber = (gstNumber) => {
  if (!gstNumber) return false;
  const cleaned = gstNumber.replace(/\s/g, '').toUpperCase();
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstRegex.test(cleaned);
};

// Step 1: Authenticate and get access token
const authenticateAPI = async () => {
  debugLog('🔐 Starting authentication with Masters India API...');
  
  try {
    const requestData = {
      username: MASTERS_INDIA_CONFIG.username,
      password: MASTERS_INDIA_CONFIG.password,
      client_id: MASTERS_INDIA_CONFIG.client_id,
      client_secret: MASTERS_INDIA_CONFIG.client_secret,
      grant_type: 'password'
    };
    
    const response = await axios({
      method: 'POST',
      url: `${MASTERS_INDIA_CONFIG.baseURL}/oauth/access_token`,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'client_id':''

      },
      data: requestData,
      timeout: 30000
    });
    
    if (response.status === 200 && response.data && response.data.access_token) {
      debugLog('✅ Authentication successful');
      return {
        success: true,
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type
      };
    } else {
      debugLog('❌ Authentication failed', response.data);
      return {
        success: false,
        error: 'Authentication failed',
        message: 'No access token received'
      };
    }
    
  } catch (error) {
    debugLog('❌ Authentication error', { 
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    return {
      success: false,
      error: error.message,
      responseData: error.response?.data
    };
  }
};

// Step 2: Search GST details using official API
const searchGSTDetails = async (gstNumber, accessToken) => {
  debugLog('🔍 Searching GST details for:', gstNumber);
  
  try {
    const cleanGST = gstNumber.replace(/\s/g, '').toUpperCase();
    
    const response = await axios({
      method: 'GET',
      url: `${MASTERS_INDIA_CONFIG.baseURL}/commonapis/searchgstin`,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'client_id': MASTERS_INDIA_CONFIG.client_id
      },
      params: {
        gstin: cleanGST
      },
      timeout: 30000
    });
    
    debugLog('GST search raw response', response.data);
    
    // Handle Masters India API Response - ONLY ACCEPT REAL DATA
    if (response.status === 200) {
      if (response.data.error === false && response.data.data) {
        // GST found successfully - REAL DATA
        debugLog('✅ GST details found successfully');
        return {
          success: true,
          data: response.data.data
        };
      } else if (response.data.error === true) {
        // GST not found or invalid - NO SAMPLE DATA
        const errorMessage = response.data.message || response.data.data || 'GST number not found in registry';
        debugLog('❌ GST not found in registry', { error: errorMessage });
        return {
          success: false,
          error: 'GST_NOT_FOUND',
          message: errorMessage,
          statusCode: 'NOT_FOUND'
        };
      } else {
        // Unexpected response format
        debugLog('❌ Unexpected API response format', response.data);
        return {
          success: false,
          error: 'UNEXPECTED_RESPONSE',
          message: 'API returned unexpected response format',
          statusCode: 'API_ERROR'
        };
      }
    } else {
      debugLog('❌ GST search failed with status', response.status);
      return {
        success: false,
        error: 'API_REQUEST_FAILED',
        message: `API returned status ${response.status}`,
        statusCode: 'HTTP_ERROR'
      };
    }
    
  } catch (error) {
    debugLog('❌ GST search error', { 
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message: error.message,
      statusCode: 'NETWORK_ERROR',
      responseData: error.response?.data
    };
  }
};

// Parse real GST data according to Masters India API response structure
const parseRealGSTData = (gstData) => {
  debugLog('📊 Parsing real GST data', { 
    gstin: gstData.gstin,
    lgnm: gstData.lgnm,
    sts: gstData.sts 
  });
  
  // Handle address data safely
  let address = {};
  if (gstData.pradr && gstData.pradr.addr) {
    address = gstData.pradr.addr;
  } else if (gstData.pradr) {
    address = gstData.pradr;
  }
  
  // Build full address from components
  const addressParts = [
    address.bno,    // Building Number
    address.bnm,    // Building Name  
    address.flno,   // Floor Number
    address.st,     // Street
    address.loc,    // Location
    address.dst,    // District
    address.city,   // City
  ].filter(part => part && part.trim() && part !== 'null' && part !== 'undefined');
  
  const fullAddress = addressParts.join(', ');
  
  // Get state name from state code
  const stateCode = address.stcd || gstData.gstin?.substring(0, 2);
  const stateMapping = {
    '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
    '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
    '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
    '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
    '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
    '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
    '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
    '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
    '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli',
    '27': 'Maharashtra', '28': 'Andhra Pradesh (Old)', '29': 'Karnataka',
    '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
    '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
    '36': 'Telangana', '37': 'Andhra Pradesh (New)', '38': 'Ladakh'
  };
  
  const stateName = stateMapping[stateCode] || address.stcd || 'Unknown State';
  
  return {
    gstNumber: gstData.gstin || '',
    businessName: gstData.lgnm || gstData.tradeNam || '',
    tradeName: gstData.tradeNam || '',
    legalName: gstData.lgnm || '',
    businessType: gstData.ctb || 'Not Specified',
    status: gstData.sts || 'Unknown',
    registrationDate: gstData.rgdt || '',
    lastUpdated: gstData.lstupdt || '',
    businessAddress: {
      buildingNumber: address.bno || '',
      buildingName: address.bnm || '',
      floorNumber: address.flno || '',
      street: address.st || '',
      location: address.loc || '',
      district: address.dst || '',
      state: stateName,
      city: address.city || address.loc || '',
      pincode: address.pncd || '',
      fullAddress: fullAddress + (address.pncd ? ` - ${address.pncd}` : '')
    },
    businessActivities: Array.isArray(gstData.nba) ? gstData.nba : [],
    jurisdiction: {
      center: gstData.ctj || '',
      state: gstData.stj || '',
      centerCode: gstData.ctjCd || '',
      stateCode: stateCode || ''
    },
    eInvoiceStatus: gstData.einvoiceStatus || 'No',
    isActive: gstData.sts === 'Active',
    verifiedAt: new Date().toISOString(),
    apiProvider: 'Masters India',
    isFallback: false
  };
};

// Main GST verification function - REAL DATA ONLY
const getGSTDetails = async (gstNumber) => {
  debugLog('🚀 Starting GST verification process for:', gstNumber);
  
  try {
    if (!validateGSTNumber(gstNumber)) {
      throw new Error('Invalid GST number format. Please enter a valid 15-digit GST number.');
    }

    const cleanGST = gstNumber.replace(/\s/g, '').toUpperCase();
    
    // Step 1: Authenticate
    const authResult = await authenticateAPI();
    
    if (!authResult.success) {
      debugLog('❌ Authentication failed');
      throw new Error(`Authentication failed: ${authResult.error}`);
    }
    
    // Step 2: Search GST Details
    const searchResult = await searchGSTDetails(cleanGST, authResult.accessToken);
    
    if (!searchResult.success) {
      debugLog('❌ GST search failed');
      
      // Return specific error based on type
      if (searchResult.error === 'GST_NOT_FOUND') {
        throw new Error(`GST number not found: ${searchResult.message}`);
      } else if (searchResult.error === 'NETWORK_ERROR') {
        throw new Error(`Network error: ${searchResult.message}`);
      } else if (searchResult.error === 'API_REQUEST_FAILED') {
        throw new Error(`API request failed: ${searchResult.message}`);
      } else {
        throw new Error(`GST verification failed: ${searchResult.message}`);
      }
    }
    
    // Step 3: Parse and return ONLY real data
    debugLog('✅ GST verification successful via Masters India API');
    return parseRealGSTData(searchResult.data);

  } catch (error) {
    debugLog('❌ GST verification failed:', error.message);
    throw error; // Re-throw the error instead of returning sample data
  }
};

// Test API connectivity
const testAPIConnectivity = async () => {
  debugLog('🧪 Testing API connectivity...');
  
  try {
    // Test authentication
    const authTest = await authenticateAPI();
    
    if (!authTest.success) {
      return {
        isReachable: false,
        status: 'failed',
        message: 'API authentication failed',
        error: authTest.error,
        details: {
          authentication: {
            success: false,
            error: authTest.error
          }
        }
      };
    }
    
    // Test with a format-valid GST number
    try {
      const testGST = '27AABCU9603R1ZV';
      const searchTest = await searchGSTDetails(testGST, authTest.accessToken);
      
      return {
        isReachable: true,
        status: 'working',
        message: 'API is fully functional',
        details: {
          authentication: {
            success: true
          },
          gstSearch: {
            tested: true,
            success: searchTest.success,
            error: searchTest.error,
            message: searchTest.message
          },
          credentials: {
            username: MASTERS_INDIA_CONFIG.username,
            client_id: MASTERS_INDIA_CONFIG.client_id,
            baseURL: MASTERS_INDIA_CONFIG.baseURL
          }
        }
      };
    } catch (searchError) {
      return {
        isReachable: true,
        status: 'auth_only',
        message: 'API authentication works, but GST search has issues',
        error: searchError.message,
        details: {
          authentication: {
            success: true
          },
          gstSearch: {
            tested: true,
            success: false,
            error: searchError.message
          }
        }
      };
    }
    
  } catch (error) {
    debugLog('❌ Connectivity test failed:', error.message);
    return {
      isReachable: false,
      status: 'failed',
      message: 'API connectivity failed',
      error: error.message
    };
  }
};

module.exports = {
  getGSTDetails,
  validateGSTNumber,
  testAPIConnectivity,
  authenticateAPI,
  searchGSTDetails,
  parseRealGSTData
};
