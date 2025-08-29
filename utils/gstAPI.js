const axios = require('axios');

// Masters India API Configuration - CORRECTED FROM POSTMAN
const MASTERS_INDIA_CONFIG = {
  baseURL: 'https://commonapi.mastersindia.co',
  username: process.env.MASTERS_INDIA_USERNAME || 'aggrekart.com@gmail.com',
  password: process.env.MASTERS_INDIA_PASSWORD || 'Masters@1234567',
  client_id: process.env.MASTERS_INDIA_CLIENT_ID || 'JapKhzIHwAVpIxgYjB', // CORRECTED FROM POSTMAN
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

// Step 1: Authenticate and get access token - FIXED
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
    
    debugLog('📤 Auth request data:', {
      username: MASTERS_INDIA_CONFIG.username,
      client_id: MASTERS_INDIA_CONFIG.client_id,
      grant_type: 'password'
    });
    
    const response = await axios({
      method: 'POST',
      url: `${MASTERS_INDIA_CONFIG.baseURL}/oauth/access_token`,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'client_id': MASTERS_INDIA_CONFIG.client_id // FIXED: Added correct client_id
      },
      data: requestData,
      timeout: 30000
    });
    
    debugLog('📥 Auth response:', {
      status: response.status,
      hasAccessToken: !!response.data?.access_token,
      tokenType: response.data?.token_type,
      expiresIn: response.data?.expires_in
    });
    
    if (response.status === 200 && response.data && response.data.access_token) {
      debugLog('✅ Authentication successful');
      return {
        success: true,
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type || 'Bearer'
      };
    } else {
      debugLog('❌ Authentication failed - no access token', response.data);
      return {
        success: false,
        error: 'AUTHENTICATION_FAILED',
        message: 'No access token received from API'
      };
    }
    
  } catch (error) {
    debugLog('❌ Authentication error', { 
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });
    return {
      success: false,
      error: 'AUTH_REQUEST_FAILED',
      message: error.message,
      details: error.response?.data
    };
  }
};

// Step 2: Search GST details using CORRECT headers from Postman
const searchGSTDetails = async (gstNumber, accessToken) => {
  debugLog('🔍 Searching GST details for:', gstNumber);
  
  try {
    const cleanGST = gstNumber.replace(/\s/g, '').toUpperCase();
    
    // Headers EXACTLY as shown in Postman screenshot
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'client_id': MASTERS_INDIA_CONFIG.client_id,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    debugLog('📤 Request headers:', headers);
    debugLog('📤 Request URL:', `${MASTERS_INDIA_CONFIG.baseURL}/commonapis/searchgstin?gstin=${cleanGST}`);
    
    const response = await axios({
      method: 'GET',
      url: `${MASTERS_INDIA_CONFIG.baseURL}/commonapis/searchgstin`,
      headers: headers,
      params: {
        gstin: cleanGST
      },
      timeout: 30000
    });
    
    debugLog('📥 GST search response:', {
      status: response.status,
      hasData: !!response.data,
      error: response.data?.error,
      dataExists: !!response.data?.data
    });
    
    debugLog('📥 Full response data:', response.data);
    
    // Handle response based on the EXACT structure from Postman
    if (response.status === 200) {
      if (response.data.error === false && response.data.data) {
        // Success case - GST found (as shown in Postman)
        debugLog('✅ GST details found successfully');
        return {
          success: true,
          data: response.data.data,
          rawResponse: response.data
        };
      } else if (response.data.error === true) {
        // Error case - GST not found
        const errorMessage = response.data.message || response.data.data || 'GST number not found';
        debugLog('❌ GST not found', { 
          error: response.data.error,
          message: errorMessage,
          data: response.data.data
        });
        return {
          success: false,
          error: 'GST_NOT_FOUND',
          message: errorMessage,
          apiResponse: response.data
        };
      } else {
        // Unexpected response format
        debugLog('❌ Unexpected API response format', response.data);
        return {
          success: false,
          error: 'UNEXPECTED_RESPONSE',
          message: 'API returned unexpected response format',
          apiResponse: response.data
        };
      }
    } else {
      debugLog('❌ GST search failed with HTTP status', response.status);
      return {
        success: false,
        error: 'HTTP_ERROR',
        message: `API returned HTTP ${response.status}`,
        status: response.status
      };
    }
    
  } catch (error) {
    debugLog('❌ GST search network error', { 
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers
      }
    });
    
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message: error.message,
      details: error.response?.data,
      status: error.response?.status
    };
  }
};

// Parse GST data from Masters India API response (based on Postman structure)
// Parse GST data from Masters India API response - FIXED VERSION
const parseGSTData = (gstData) => {
  debugLog('📊 Parsing GST data structure:', {
    gstin: gstData.gstin,
    lgnm: gstData.lgnm,
    dty: gstData.dty,
    stj: gstData.stj,
    hasAddr: !!gstData.adadr,
    hasPrimaryAddr: !!gstData.pradr,
    hasNba: !!gstData.nba
  });
  
  try {
    // FIXED: Extract MAIN ADDRESS from pradr (primary address)
    let mainAddress = '';
    let mainPincode = '';
    let mainCity = '';
    let mainDistrict = '';
    
    if (gstData.pradr && gstData.pradr.addr) {
      const addr = gstData.pradr.addr;
      
      // Build complete address from components
      const addressComponents = [
        addr.bno,    // Building Number  
        addr.bnm,    // Building Name
        addr.st,     // Street
        addr.loc,    // Location
        addr.dst,    // District
      ].filter(component => component && component.trim() && component !== 'null');
      
      mainAddress = addressComponents.join(', ');
      mainPincode = addr.pncd || '';
      mainCity = addr.loc || addr.dst || '';
      mainDistrict = addr.dst || '';
    }
    
    // FIXED: If main address is empty, use FIRST additional address with pincode
    if (!mainAddress || !mainPincode) {
      const addressesWithPincode = (gstData.adadr || []).filter(addr => 
        addr.addr && addr.addr.pncd && addr.addr.pncd.trim()
      );
      
      if (addressesWithPincode.length > 0) {
        const firstAddr = addressesWithPincode[0].addr;
        
        if (!mainAddress) {
          const addrComponents = [
            firstAddr.bno,
            firstAddr.bnm, 
            firstAddr.st,
            firstAddr.loc,
            firstAddr.dst,
          ].filter(c => c && c.trim() && c !== 'null');
          
          mainAddress = addrComponents.join(', ');
        }
        
        if (!mainPincode) mainPincode = firstAddr.pncd;
        if (!mainCity) mainCity = firstAddr.loc || firstAddr.dst;
        if (!mainDistrict) mainDistrict = firstAddr.dst;
      }
    }
    
    // State code to name mapping
    const stateMapping = {
      '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
      '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
      '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
      '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
      '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
      '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
      '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
      '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
      '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli', '27': 'Maharashtra',
      '28': 'Andhra Pradesh', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep',
      '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
      '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh'
    };
    
    const stateCode = gstData.gstin?.substring(0, 2) || '24';
    const stateName = stateMapping[stateCode] || 'Gujarat';
    const extractPANFromGST = (gstNumber) => {
  if (gstNumber && gstNumber.length === 15) {
    return gstNumber.substring(2, 12); // Characters 3-12 are PAN
  }
  return '';
};
const panNumber = extractPANFromGST(gstData.gstin);
    // Parse business nature from 'nba' array
    let businessNature = 'Not specified';
    if (gstData.nba && Array.isArray(gstData.nba) && gstData.nba.length > 0) {
      businessNature = gstData.nba.join(', ');
    }
    
    const parsedData = {
      // Basic GST Information
      gstNumber: gstData.gstin || '',
      legalName: gstData.lgnm || '',
      panNumber: panNumber, // EXTRACTED PAN NUMBER
      tradeName: gstData.tradeNam || gstData.lgnm || '',
      registrationDate: gstData.rgdt || '',
      gstStatus: gstData.sts || '',
      taxpayerType: gstData.dty || '',
      // Line 301 - ADD THIS NEW LINE:
       
      // FIXED: Address Information using extracted data
      address: mainAddress,
      city: mainCity,
      district: mainDistrict,
      state: stateName,
      stateCode: stateCode,
      pincode: mainPincode,
      
      // Business Information
      businessNature: businessNature,
      constitutionOfBusiness: gstData.ctb || '',
      centerJurisdiction: gstData.ctj || '',
      stateJurisdiction: gstData.stj || '',
      
      // Additional Details
      additionalPlaceOfBusiness: gstData.adadr || [],
      filingStatus: gstData.lstupdt || '',
      cancellationDate: gstData.cxdt || '',
      
      // Metadata
      apiProvider: 'Masters India',
      verifiedAt: new Date().toISOString(),
      rawData: gstData // Include raw data for debugging
    };
    
    debugLog('✅ Successfully parsed GST data:', {
      gstNumber: parsedData.gstNumber,
      legalName: parsedData.legalName,
      address: parsedData.address?.substring(0, 50) + '...',
      city: parsedData.city,
      state: parsedData.state,
      pincode: parsedData.pincode,
      businessNature: parsedData.businessNature?.substring(0, 50) + '...'
    });
    
    return parsedData;
    
  } catch (error) {
    debugLog('❌ Error parsing GST data:', error.message);
    throw new Error(`Failed to parse GST data: ${error.message}`);
  }
};
// Main function to get GST details
const getGSTDetails = async (gstNumber) => {
  debugLog('🚀 Starting GST details retrieval process...');
  
  try {
    // Validate GST format
    if (!validateGSTNumber(gstNumber)) {
      return {
        success: false,
        error: 'INVALID_GST_FORMAT',
        message: 'Invalid GST number format'
      };
    }
    
    // Step 1: Authenticate
    const authResult = await authenticateAPI();
    if (!authResult.success) {
      return {
        success: false,
        error: 'AUTHENTICATION_FAILED',
        message: 'Failed to authenticate with GST API',
        details: authResult
      };
    }
    
    debugLog('🔑 Authentication successful, proceeding with GST search...');
    
    // Step 2: Search GST details
    const searchResult = await searchGSTDetails(gstNumber, authResult.accessToken);
    if (!searchResult.success) {
      return searchResult; // Return the error as-is
    }
    
    debugLog('📋 GST search successful, parsing data...');
    
    // Step 3: Parse the data
    const parsedData = parseGSTData(searchResult.data);
    
    return {
      success: true,
      data: parsedData,
      message: 'GST details retrieved successfully',
      apiResponse: searchResult.rawResponse
    };
    
  } catch (error) {
    debugLog('❌ GST details retrieval failed:', error.message);
    return {
      success: false,
      error: 'PROCESS_FAILED',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
};

// Test API connectivity
const testAPIConnectivity = async () => {
  debugLog('🧪 Testing Masters India API connectivity...');
  
  try {
    const authResult = await authenticateAPI();
    return {
      success: authResult.success,
      message: authResult.success ? 'API connectivity test passed' : 'API connectivity test failed',
      details: authResult,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      message: 'API connectivity test failed',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

module.exports = {
  getGSTDetails,
  validateGSTNumber,
  testAPIConnectivity,
  authenticateAPI,
  searchGSTDetails,
  parseGSTData,
  MASTERS_INDIA_CONFIG

};
