const express = require('express');
const router = express.Router();
const { 
  getGSTDetails, 
  validateGSTNumber, 
  testAPIConnectivity
} = require('../utils/gstAPI');

// Add debugging middleware
router.use((req, res, next) => {
  console.log(`🌐 [GST Route] ${req.method} ${req.path}`, req.body);
  next();
});

// @route   POST /api/gst/verify
// @desc    Verify GST number and get business details - REAL DATA ONLY
// @access  Public
router.post('/verify', async (req, res) => {
  console.log('🚀 Starting GST verification route...');
  
  try {
    const { gstNumber } = req.body;
    console.log('📥 GST verification request received:', { gstNumber });

    if (!gstNumber) {
      console.log('❌ Missing GST number');
      return res.status(400).json({
        success: false,
        error: 'MISSING_GST_NUMBER',
        message: 'GST number is required'
      });
    }

    const cleanGST = gstNumber.replace(/\s/g, '').toUpperCase();
    console.log('🧹 Cleaned GST:', cleanGST);
    
    if (!validateGSTNumber(cleanGST)) {
      console.log('❌ Invalid GST format');
      return res.status(400).json({
        success: false,
        error: 'INVALID_GST_FORMAT',
        message: 'Invalid GST number format. Please enter a valid 15-digit GST number.'
      });
    }

    console.log('🔍 Processing GST verification for:', cleanGST);

    // This will throw an error if GST is not found or API fails
    const gstDetails = await getGSTDetails(cleanGST);
    console.log('📊 GST details received:', {
      gstNumber: gstDetails.gstNumber,
      businessName: gstDetails.businessName,
      isFallback: gstDetails.isFallback
    });

    const responseData = {
      success: true,
      message: 'GST number verified successfully',
      data: {
        gstDetails,
        verifiedAt: new Date().toISOString(),
        apiProvider: gstDetails.apiProvider || 'Masters India'
      }
    };

    console.log('✅ Sending successful response');
    return res.status(200).json(responseData);

  } catch (error) {
    console.error('❌ GST verification error in route:', error);
    
    // Determine error type and return appropriate status
    let statusCode = 500;
    let errorCode = 'VERIFICATION_FAILED';
    
    if (error.message.includes('not found')) {
      statusCode = 404;
      errorCode = 'GST_NOT_FOUND';
    } else if (error.message.includes('Authentication failed')) {
      statusCode = 503;
      errorCode = 'API_AUTHENTICATION_FAILED';
    } else if (error.message.includes('Network error')) {
      statusCode = 503;
      errorCode = 'NETWORK_ERROR';
    } else if (error.message.includes('Invalid GST')) {
      statusCode = 400;
      errorCode = 'INVALID_GST_FORMAT';
    }

    const errorResponse = {
      success: false,
      error: errorCode,
      message: error.message,
      timestamp: new Date().toISOString()
    };

    console.log('❌ Sending error response:', errorResponse);
    return res.status(statusCode).json(errorResponse);
  }
});

// @route   GET /api/gst/test
// @desc    Test GST API connectivity
// @access  Public
router.get('/test', async (req, res) => {
  try {
    console.log('🧪 Testing GST API connectivity...');
    const connectivityResult = await testAPIConnectivity();
    
    const statusCode = connectivityResult.isReachable ? 200 : 503;
    
    return res.status(statusCode).json({
      success: connectivityResult.isReachable,
      message: 'GST API connectivity test completed',
      data: {
        connectivity: connectivityResult,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ GST test failed:', error);
    return res.status(500).json({
      success: false,
      error: 'TEST_FAILED',
      message: 'GST API test failed',
      details: error.message
    });
  }
});

// @route   GET /api/gst/search/:gstin
// @desc    Direct GST search endpoint for testing
// @access  Public
router.get('/search/:gstin', async (req, res) => {
  try {
    const { gstin } = req.params;
    
    if (!validateGSTNumber(gstin)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_GST_FORMAT',
        message: 'Invalid GST number format'
      });
    }

    console.log('🔍 Direct GST search for:', gstin);
    const gstDetails = await getGSTDetails(gstin);

    return res.status(200).json({
      success: true,
      message: 'GST search completed',
      data: {
        gstDetails,
        searchedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ GST search failed:', error);
    
    let statusCode = 500;
    if (error.message.includes('not found')) {
      statusCode = 404;
    } else if (error.message.includes('Authentication failed')) {
      statusCode = 503;
    }
    
    return res.status(statusCode).json({
      success: false,
      error: 'SEARCH_FAILED',
      message: error.message
    });
  }
});

// Health check for GST routes
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'GST routes are working',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
