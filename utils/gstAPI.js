const axios = require('axios');

// GST API configuration - Multiple providers
const GST_API_PROVIDERS = {
  mastersindia: {
    baseURL: 'https://commonapi.mastersindia.co',
    apiKey: process.env.MASTERS_INDIA_API_KEY,
    endpoint: '/get-gstin-details'
  },
  gstapi: {
    baseURL: 'https://gstapi.in',
    apiKey: process.env.GSTAPI_IN_KEY,
    endpoint: '/gst/details'
  },
  cleartax: {
    baseURL: 'https://api.cleartax.in',
    apiKey: process.env.CLEARTAX_API_KEY,
    endpoint: '/v2/gst/gstin'
  }
};

// Primary API provider
const PRIMARY_PROVIDER = process.env.GST_API_PROVIDER || 'mastersindia';
const GST_API_KEY = process.env.GST_API_KEY || process.env.MASTERS_INDIA_API_KEY;

// Main function to get GST details - NOW PRIORITIZES REAL DATA
const getGSTDetails = async (gstNumber) => {
  try {
    console.log('🔍 Processing GST:', gstNumber);

    // Step 1: Validate and format GST number
    const formattedGST = validateAndFormatGST(gstNumber);
    if (!formattedGST) {
      throw new Error('Invalid GST number format');
    }

    // Step 2: Try real API first (CHANGED PRIORITY)
    if (GST_API_KEY) {
      console.log('🌐 Attempting real GST API verification...');
      
      // Try primary provider
      const realData = await fetchRealGSTData(formattedGST, PRIMARY_PROVIDER);
      if (realData) {
        console.log('✅ Real GST data retrieved from', PRIMARY_PROVIDER);
        return realData;
      }

      // Try fallback providers
      for (const provider of Object.keys(GST_API_PROVIDERS)) {
        if (provider !== PRIMARY_PROVIDER && GST_API_PROVIDERS[provider].apiKey) {
          console.log(`🔄 Trying fallback provider: ${provider}`);
          const fallbackData = await fetchRealGSTData(formattedGST, provider);
          if (fallbackData) {
            console.log('✅ Real GST data retrieved from fallback:', provider);
            return fallbackData;
          }
        }
      }
    }

    // Step 3: If real API fails, generate mock data only in development
    if (process.env.NODE_ENV === 'development') {
      console.log('⚠️ All real APIs failed, using generated data in development');
      return generateValidGSTData(formattedGST);
    } else {
      // In production, fail if real API doesn't work
      throw new Error('GST verification service temporarily unavailable');
    }

  } catch (error) {
    console.error('❌ GST API Error:', error.message);
    
    // Only return mock data in development
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 Returning mock data for development');
      return generateValidGSTData(gstNumber || generateRandomGST());
    } else {
      throw error;
    }
  }
};

// Fetch real GST data from specific provider
const fetchRealGSTData = async (gstNumber, providerName = PRIMARY_PROVIDER) => {
  const provider = GST_API_PROVIDERS[providerName];
  if (!provider || !provider.apiKey) {
    console.log(`❌ Provider ${providerName} not configured`);
    return null;
  }

  try {
    console.log(`📡 Calling ${providerName} API for GST:`, gstNumber);

    let response;
    
    switch (providerName) {
      case 'mastersindia':
        response = await axios.post(`${provider.baseURL}${provider.endpoint}`, {
          gstin: gstNumber
        }, {
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        });
        break;

      case 'gstapi':
        response = await axios.get(`${provider.baseURL}${provider.endpoint}/${gstNumber}`, {
          headers: {
            'X-API-Key': provider.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        });
        break;

      case 'cleartax':
        response = await axios.get(`${provider.baseURL}${provider.endpoint}/${gstNumber}`, {
          headers: {
            'X-Cleartax-Auth-Token': provider.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        });
        break;

      default:
        console.log(`❌ Unknown provider: ${providerName}`);
        return null;
    }

    if (response.data) {
      console.log(`✅ ${providerName} API response received`);
      return formatRealGSTResponse(response.data, gstNumber, providerName);
    }

  } catch (error) {
    console.log(`❌ ${providerName} API call failed:`, error.message);
    
    // Log specific error details for debugging
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Error: ${error.response.data?.message || error.response.statusText}`);
    }
  }
  
  return null;
};

// Format real API response to standardized format
const formatRealGSTResponse = (apiData, gstNumber, provider) => {
  try {
    let parsedData;

    switch (provider) {
      case 'mastersindia':
        parsedData = apiData.data || apiData;
        return {
          gstNumber: gstNumber,
          legalName: parsedData.lgnm || parsedData.legalName || 'N/A',
          tradeName: parsedData.tradeNam || parsedData.tradeName || parsedData.lgnm,
          registrationDate: new Date(parsedData.rgdt || parsedData.registrationDate),
          status: parsedData.sts || parsedData.status || 'Active',
          taxpayerType: parsedData.dty || parsedData.taxpayerType || 'Regular',
          address: parseRealAddress(parsedData.addr || parsedData.address),
          lastUpdated: new Date(),
          isVerified: true,
          apiSource: provider
        };

      case 'gstapi':
        return {
          gstNumber: gstNumber,
          legalName: apiData.legal_name || apiData.legalName,
          tradeName: apiData.trade_name || apiData.tradeName,
          registrationDate: new Date(apiData.registration_date),
          status: apiData.status || 'Active',
          taxpayerType: apiData.taxpayer_type || 'Regular',
          address: parseRealAddress(apiData.address),
          lastUpdated: new Date(),
          isVerified: true,
          apiSource: provider
        };

      case 'cleartax':
        return {
          gstNumber: gstNumber,
          legalName: apiData.legalName,
          tradeName: apiData.tradeName,
          registrationDate: new Date(apiData.registrationDate),
          status: apiData.gstinStatus || 'Active',
          taxpayerType: apiData.taxpayerType || 'Regular',
          address: parseRealAddress(apiData.addresses?.[0]),
          lastUpdated: new Date(),
          isVerified: true,
          apiSource: provider
        };

      default:
        return formatGSTResponse(apiData, gstNumber, provider);
    }

  } catch (error) {
    console.error('Error formatting real GST response:', error);
    return null;
  }
};

// Parse real address data
const parseRealAddress = (addressData) => {
  if (!addressData) {
    return {
      building: 'N/A',
      street: 'N/A', 
      city: 'N/A',
      state: 'N/A',
      pincode: 'N/A'
    };
  }

  // Handle array format (common in government APIs)
  if (Array.isArray(addressData) && addressData.length > 0) {
    const addr = addressData[0];
    return {
      building: addr.bno || addr.building || 'N/A',
      street: addr.st || addr.street || 'N/A',
      city: addr.city || addr.dst || 'N/A',
      state: getStateName(addr.stcd) || addr.state || 'N/A',
      pincode: addr.pncd || addr.pincode || 'N/A'
    };
  }

  // Handle object format
  return {
    building: addressData.building || addressData.bno || 'N/A',
    street: addressData.street || addressData.st || 'N/A',
    city: addressData.city || addressData.dst || 'N/A',
    state: addressData.state || getStateName(addressData.stcd) || 'N/A',
    pincode: addressData.pincode || addressData.pncd || 'N/A'
  };
};

// Get state name from state code
const getStateName = (stateCode) => {
  const stateCodes = {
    '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
    '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
    '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
    '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
    '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
    '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
    '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
    '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
    '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli', '27': 'Maharashtra',
    '28': 'Andhra Pradesh', '29': 'Karnataka', '30': 'Goa',
    '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
    '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana',
    '37': 'Andhra Pradesh', '38': 'Ladakh'
  };
  return stateCodes[stateCode] || stateCode;
};

// Validate and format GST number
const validateAndFormatGST = (gstNumber) => {
  if (!gstNumber || typeof gstNumber !== 'string') return null;
  
  const cleaned = gstNumber.toString().replace(/[^A-Z0-9]/g, '').toUpperCase();
  
  // Check if it matches GST format
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  
  if (gstRegex.test(cleaned)) {
    return cleaned;
  }
  
  return null;
};

// Keep existing mock data functions for development fallback
const generateValidGSTData = (gstNumber) => {
  const validGST = validateAndFormatGST(gstNumber) || generateRandomGST();
  const stateCode = validGST.substring(0, 2);
  const stateInfo = getStateInfo(stateCode);
  const businessData = generateBusinessData(stateInfo);
  
  return {
    gstNumber: validGST,
    legalName: businessData.legalName,
    tradeName: businessData.tradeName,
    registrationDate: businessData.registrationDate,
    status: 'Active',
    taxpayerType: 'Regular',
    address: {
      building: businessData.address.building,
      street: businessData.address.street,
      city: businessData.address.city,
      state: stateInfo.name,
      pincode: businessData.address.pincode
    },
    lastUpdated: new Date(),
    isVerified: true,
    isGenerated: true,
    apiSource: 'generated',
    confidence: 'high'
  };
};

// ... (keep all existing helper functions like generateRandomGST, getStateInfo, etc.)

// Generate random valid GST number
const generateRandomGST = () => {
  const stateCodes = ['27', '07', '29', '24', '33', '19', '09', '32'];
  const stateCode = stateCodes[Math.floor(Math.random() * stateCodes.length)];
  
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const nums = '0123456789';
  
  let gst = stateCode;
  
  // 5 letters
  for (let i = 0; i < 5; i++) {
    gst += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // 4 numbers
  for (let i = 0; i < 4; i++) {
    gst += nums.charAt(Math.floor(Math.random() * nums.length));
  }
  
  // 1 letter
  gst += chars.charAt(Math.floor(Math.random() * chars.length));
  
  // 1 number/letter
  gst += (Math.random() > 0.5 ? nums : chars).charAt(Math.floor(Math.random() * (Math.random() > 0.5 ? nums.length : chars.length)));
  
  // Z
  gst += 'Z';
  
  // Final digit
  gst += nums.charAt(Math.floor(Math.random() * nums.length));
  
  return gst;
};

// Get state information
const getStateInfo = (stateCode) => {
  const states = {
    '27': { name: 'Maharashtra', prefix: '40', cities: ['Mumbai', 'Pune', 'Nagpur', 'Nashik'] },
    '07': { name: 'Delhi', prefix: '11', cities: ['New Delhi', 'Delhi'] },
    '29': { name: 'Karnataka', prefix: '56', cities: ['Bangalore', 'Mysore', 'Hubli'] },
    '24': { name: 'Gujarat', prefix: '38', cities: ['Ahmedabad', 'Surat', 'Vadodara'] },
    '33': { name: 'Tamil Nadu', prefix: '60', cities: ['Chennai', 'Coimbatore', 'Madurai'] },
    '19': { name: 'West Bengal', prefix: '70', cities: ['Kolkata', 'Howrah', 'Durgapur'] },
    '09': { name: 'Uttar Pradesh', prefix: '20', cities: ['Lucknow', 'Kanpur', 'Agra'] },
    '32': { name: 'Kerala', prefix: '68', cities: ['Kochi', 'Thiruvananthapuram', 'Kozhikode'] }
  };
  
  return states[stateCode] || { name: 'Unknown State', prefix: '40', cities: ['Unknown City'] };
};

// Generate business data
const generateBusinessData = (stateInfo) => {
  const businessPrefixes = ['Shree', 'Sri', 'Bharat', 'National', 'Royal', 'Prime', 'Global', 'Supreme'];
  const businessTypes = ['Enterprises', 'Industries', 'Trading Company', 'Builders', 'Construction'];
  
  const prefix = businessPrefixes[Math.floor(Math.random() * businessPrefixes.length)];
  const type = businessTypes[Math.floor(Math.random() * businessTypes.length)];
  const city = stateInfo.cities[Math.floor(Math.random() * stateInfo.cities.length)];
  
  const legalName = `${prefix} ${type} Private Limited`;
  const tradeName = `${prefix} ${type.split(' ')[0]}`;
  
  const registrationDate = new Date();
  registrationDate.setFullYear(registrationDate.getFullYear() - Math.floor(Math.random() * 10 + 1));
  
  return {
    legalName,
    tradeName,
    registrationDate,
    address: {
      building: `Building ${Math.floor(Math.random() * 999 + 1)}`,
      street: `Industrial Area, Sector ${Math.floor(Math.random() * 50 + 1)}`,
      city,
      pincode: stateInfo.prefix + String(Math.floor(Math.random() * 9000 + 1000))
    }
  };
};

// Keep existing helper functions...
const formatGSTResponse = (apiData, gstNumber, source) => {
  return {
    gstNumber: gstNumber,
    legalName: apiData.legalName || apiData.tradeNam || 'Valid Business Name',
    tradeName: apiData.tradeNam || apiData.legalName || 'Valid Trade Name',
    registrationDate: new Date(apiData.rgdt || '2020-01-01'),
    status: apiData.sts === 'Active' ? 'Active' : 'Active',
    taxpayerType: apiData.dty || 'Regular',
    address: parseAPIAddress(apiData.addr),
    lastUpdated: new Date(),
    isVerified: true,
    apiSource: source
  };
};

const parseAPIAddress = (addressArray) => {
  if (!addressArray || !Array.isArray(addressArray) || addressArray.length === 0) {
    return {
      building: 'Valid Building',
      street: 'Valid Street',
      city: 'Valid City',
      state: 'Valid State',
      pincode: '400001'
    };
  }
  
  const addr = addressArray[0];
  return {
    building: addr.bno || 'Building No. 1',
    street: addr.st || 'Main Street',
    city: addr.city || addr.dst || 'Valid City',
    state: addr.stcd ? getStateInfo(addr.stcd).name : 'Valid State',
    pincode: addr.pncd || '400001'
  };
};

const getStateFromGST = (gstNumber) => {
  const validGST = validateAndFormatGST(gstNumber) || generateRandomGST();
  const stateCode = validGST.substring(0, 2);
  const stateInfo = getStateInfo(stateCode);
  return stateInfo.name;
};

module.exports = {
  getGSTDetails,
  validateAndFormatGST,
  getStateFromGST,
  generateValidGSTData
};
