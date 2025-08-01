const express = require('express');
const router = express.Router();
const { 
  getGSTDetails, 
  validateGSTNumber, 
  testAPIConnectivity
} = require('../utils/gstAPI');

// Add debugging middleware
router.use((req, res, next) => {
  console.log(`🌐 [GST Route] ${new Date().toISOString()} ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('📥 Request body:', req.body);
  }
  next();
});

// @route   POST /api/gst/verify
// @desc    Verify GST number and get business details using Masters India API
// @access  Public
router.post('/verify', async (req, res) => {
  console.log('🚀 [GST Verify] Starting verification process...');
  
  try {
    const { gstNumber } = req.body;
    
    // Validate input
    if (!gstNumber) {
      console.log('❌ [GST Verify] Missing GST number in request');
      return res.status(400).json({
        success: false,
        error: 'MISSING_GST_NUMBER',
        message: 'GST number is required'
      });
    }

    const cleanGST = gstNumber.replace(/\s/g, '').toUpperCase();
    console.log('🔍 [GST Verify] Processing GST:', cleanGST);
    
    // Validate GST format
    if (!validateGSTNumber(cleanGST)) {
      console.log('❌ [GST Verify] Invalid GST format:', cleanGST);
      return res.status(400).json({
        success: false,
        error: 'INVALID_GST_FORMAT',
        message: 'Invalid GST number format. Please enter a valid 15-digit GST number.',
        providedGST: cleanGST
      });
    }

    console.log('📡 [GST Verify] Calling Masters India API...');
    
    // Call the GST API
    const result = await getGSTDetails(cleanGST);
    
    if (result.success) {
      console.log('✅ [GST Verify] Successfully retrieved GST details');
      return res.json({
        success: true,
        message: 'GST details retrieved successfully',
        data: result.data,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log('❌ [GST Verify] GST API call failed:', result.error);
      
      // Handle different error types
      const statusCode = result.error === 'GST_NOT_FOUND' ? 404 : 
                        result.error === 'INVALID_GST_FORMAT' ? 400 :
                        result.error === 'AUTHENTICATION_FAILED' ? 401 : 500;
      
      return res.status(statusCode).json({
        success: false,
        error: result.error,
        message: result.message,
        gstNumber: cleanGST,
        timestamp: new Date().toISOString(),
        details: process.env.NODE_ENV === 'development' ? result.details : undefined
      });
    }

  } catch (error) {
    console.error('💥 [GST Verify] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred while processing GST verification',
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @route   GET /api/gst/validate/:gstNumber
// @desc    Quick GST format validation
// @access  Public
router.get('/validate/:gstNumber', (req, res) => {
  try {
    const { gstNumber } = req.params;
    const cleanGST = gstNumber.replace(/\s/g, '').toUpperCase();
    const isValid = validateGSTNumber(cleanGST);
    
    console.log(`🔍 [GST Validate] ${cleanGST} -> ${isValid ? 'VALID' : 'INVALID'}`);
    
    res.json({
      success: true,
      gstNumber: cleanGST,
      isValid,
      message: isValid ? 'GST number format is valid' : 'GST number format is invalid'
    });
  } catch (error) {
    console.error('💥 [GST Validate] Error:', error);
    res.status(500).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Error validating GST number format'
    });
  }
});

// @route   GET /api/gst/test
// @desc    Test Masters India API connectivity
// @access  Public (for debugging)
router.get('/test', async (req, res) => {
  console.log('🧪 [GST Test] Testing API connectivity...');
  
  try {
    const result = await testAPIConnectivity();
    
    const statusCode = result.success ? 200 : 503;
    res.status(statusCode).json({
      ...result,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    console.error('💥 [GST Test] Error:', error);
    res.status(500).json({
      success: false,
      message: 'API connectivity test failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// @route   GET /api/gst/health
// @desc    Health check for GST service
// @access  Public
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'GST Verification Service',
    status: 'operational',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

module.exports = router;