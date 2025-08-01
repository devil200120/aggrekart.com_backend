const express = require('express');
const router = express.Router();

// For debugging, let's create a simple fallback function
const generateSampleGSTData = (gstNumber) => {
  const stateCode = gstNumber.substring(0, 2);
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
  
  const stateName = stateMapping[stateCode] || 'Unknown State';
  const panCode = gstNumber.substring(2, 12);
  
  return {
    gstNumber: gstNumber,
    businessName: `Sample Business ${panCode.substring(0, 5)}`,
    tradeName: `Trade Name ${panCode.substring(0, 5)}`,
    legalName: `Sample Business ${panCode.substring(0, 5)} Private Limited`,
    businessType: 'Private Limited Company',
    status: 'Active',
    registrationDate: '01/01/2020',
    lastUpdated: new Date().toLocaleDateString('en-IN'),
    businessAddress: {
      buildingNumber: '123',
      buildingName: 'Sample Building',
      floorNumber: 'Ground Floor',
      street: 'Sample Street',
      location: 'Sample Location',
      district: 'Sample District',
      state: stateName,
      city: 'Sample City',
      pincode: '123456',
      fullAddress: `123, Sample Building, Ground Floor, Sample Street, Sample Location, Sample District, ${stateName}, Sample City - 123456`
    },
    businessActivities: ['Supplier of Services'],
    jurisdiction: {
      center: 'Sample Center',
      state: `${stateName} State`,
      centerCode: 'SC001',
      stateCode: stateCode
    },
    eInvoiceStatus: 'No',
    isActive: true,
    verifiedAt: new Date().toISOString(),
    apiProvider: 'Fallback Sample Data',
    isFallback: true,
    notice: 'This is sample data based on GST format. Please verify and update business details as needed.'
  };
};

// Validate GST number format
const validateGSTNumber = (gstNumber) => {
  if (!gstNumber) return false;
  const cleaned = gstNumber.replace(/\s/g, '').toUpperCase();
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstRegex.test(cleaned);
};

// @route   POST /api/gst/verify
// @desc    Verify GST number and get business details
// @access  Public
router.post('/verify', async (req, res) => {
  try {
    console.log('📥 GST verification request received:', req.body);

    const { gstNumber } = req.body;

    if (!gstNumber) {
      return res.status(400).json({
        success: false,
        message: 'GST number is required'
      });
    }

    const cleanGST = gstNumber.replace(/\s/g, '').toUpperCase();
    
    if (!validateGSTNumber(cleanGST)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid GST number format. Please enter a valid 15-digit GST number.'
      });
    }

    console.log('🔍 Processing GST verification for:', cleanGST);

    // For now, always use sample data to avoid API issues
    const gstDetails = generateSampleGSTData(cleanGST);

    console.log('✅ GST verification completed:', {
      gstNumber: gstDetails.gstNumber,
      businessName: gstDetails.businessName,
      isFallback: gstDetails.isFallback
    });

    return res.status(200).json({
      success: true,
      message: 'GST number format verified successfully (using sample data)',
      data: {
        gstDetails,
        verifiedAt: new Date().toISOString(),
        isFallback: true,
        notice: 'This is sample data based on your GST format. To use live data, please configure valid Masters India API credentials.'
      }
    });

  } catch (error) {
    console.error('❌ GST verification error:', error);
    
    return res.status(500).json({
      success: false,
      message: 'GST verification failed: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : 'Internal server error'
    });
  }
});

// @route   GET /api/gst/test
// @desc    Test GST API connectivity
// @access  Public
router.get('/test', async (req, res) => {
  try {
    console.log('🧪 Testing GST API connectivity...');
    
    const testResult = {
      isReachable: false,
      status: 'using_fallback',
      message: 'API connectivity test completed (using fallback mode)',
      details: {
        timestamp: new Date().toISOString(),
        mode: 'fallback',
        reason: 'API credentials need to be verified'
      }
    };
    
    return res.status(200).json({
      success: true,
      message: 'GST API test completed',
      data: {
        connectivity: testResult,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ GST test failed:', error);
    return res.status(500).json({
      success: false,
      message: 'GST test failed',
      error: error.message
    });
  }
});

// @route   POST /api/gst/sample
// @desc    Generate sample GST data for testing
// @access  Public
router.post('/sample', async (req, res) => {
  try {
    const { gstNumber } = req.body;

    if (!gstNumber) {
      return res.status(400).json({
        success: false,
        message: 'GST number is required'
      });
    }

    const cleanGST = gstNumber.replace(/\s/g, '').toUpperCase();
    
    if (!validateGSTNumber(cleanGST)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid GST number format'
      });
    }

    const sampleData = generateSampleGSTData(cleanGST);

    return res.status(200).json({
      success: true,
      message: 'Sample GST data generated successfully',
      data: {
        gstDetails: sampleData,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Sample data generation failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate sample data',
      error: error.message
    });
  }
});

module.exports = router;