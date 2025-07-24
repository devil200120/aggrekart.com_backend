const axios = require('axios');

// GST API configuration
const GST_API_BASE_URL = process.env.GST_API_URL || 'https://api.gst.gov.in';
const GST_API_KEY = process.env.GST_API_KEY;

// Get GST details from government API
const getGSTDetails = async (gstNumber) => {
  try {
    if (!GST_API_KEY) {
      console.log('GST API not configured, using mock data for development');
      return getMockGSTDetails(gstNumber);
    }

    const response = await axios.get(`${GST_API_BASE_URL}/taxpayer/${gstNumber}`, {
      headers: {
        'Authorization': `Bearer ${GST_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    if (response.data && response.data.taxpayerInfo) {
      const info = response.data.taxpayerInfo;
      return {
        gstNumber: info.gstin,
        legalName: info.legalName,
        tradeName: info.tradeName,
        registrationDate: new Date(info.registrationDate),
        status: info.status,
        taxpayerType: info.taxpayerType,
        address: info.address,
        lastUpdated: new Date(),
        isVerified: true
      };
    }

    throw new Error('Invalid GST number or no data found');

  } catch (error) {
    console.error('GST API Error:', error.message);
    
    if (error.response) {
      // API responded with error status
      const status = error.response.status;
      if (status === 404) {
        throw new Error('GST number not found');
      } else if (status === 400) {
        throw new Error('Invalid GST number format');
      } else if (status === 429) {
        throw new Error('Too many requests. Please try again later');
      }
    }
    
    throw new Error('GST verification service unavailable');
  }
};

// Mock GST details for development/testing
const getMockGSTDetails = (gstNumber) => {
  // Validate GST format
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstRegex.test(gstNumber)) {
    throw new Error('Invalid GST number format');
  }

  // Return mock data for testing
  return {
    gstNumber: gstNumber,
    legalName: 'Sample Construction Materials Pvt Ltd',
    tradeName: 'Sample Construction',
    registrationDate: new Date('2020-01-15'),
    status: 'Active',
    taxpayerType: 'Regular',
    address: {
      building: 'Sample Building',
      street: 'Industrial Area',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001'
    },
    lastUpdated: new Date(),
    isVerified: true,
    isMockData: true
  };
};

// Validate GST number format
const validateGSTFormat = (gstNumber) => {
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstRegex.test(gstNumber);
};

// Extract state code from GST number
const getStateFromGST = (gstNumber) => {
  if (!validateGSTFormat(gstNumber)) {
    throw new Error('Invalid GST number format');
  }

  const stateCode = gstNumber.substring(0, 2);
  const stateCodes = {
    '01': 'Jammu and Kashmir',
    '02': 'Himachal Pradesh',
    '03': 'Punjab',
    '04': 'Chandigarh',
    '05': 'Uttarakhand',
    '06': 'Haryana',
    '07': 'Delhi',
    '08': 'Rajasthan',
    '09': 'Uttar Pradesh',
    '10': 'Bihar',
    '11': 'Sikkim',
    '12': 'Arunachal Pradesh',
    '13': 'Nagaland',
    '14': 'Manipur',
    '15': 'Mizoram',
    '16': 'Tripura',
    '17': 'Meghalaya',
    '18': 'Assam',
    '19': 'West Bengal',
    '20': 'Jharkhand',
    '21': 'Odisha',
    '22': 'Chhattisgarh',
    '23': 'Madhya Pradesh',
    '24': 'Gujarat',
    '25': 'Daman and Diu',
    '26': 'Dadra and Nagar Haveli',
    '27': 'Maharashtra',
    '28': 'Andhra Pradesh',
    '29': 'Karnataka',
    '30': 'Goa',
    '31': 'Lakshadweep',
    '32': 'Kerala',
    '33': 'Tamil Nadu',
    '34': 'Puducherry',
    '35': 'Andaman and Nicobar Islands',
    '36': 'Telangana',
    '37': 'Andhra Pradesh'
  };

  return stateCodes[stateCode] || 'Unknown State';
};

// Check if GST is valid for a specific state
const isGSTValidForState = (gstNumber, stateName) => {
  try {
    const gstState = getStateFromGST(gstNumber);
    return gstState.toLowerCase() === stateName.toLowerCase();
  } catch (error) {
    return false;
  }
};

module.exports = {
  getGSTDetails,
  getMockGSTDetails,
  validateGSTFormat,
  getStateFromGST,
  isGSTValidForState
};