const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const Supplier = require('../models/Supplier');
const User = require('../models/User');
const Product = require('../models/Product');
const GeocodingService = require('../utils/geocoding');
const { ErrorHandler } = require('../utils/errorHandler');
const { validateGST, validatePAN, validateIFSC, validateUPI } = require('../utils/validators');
const { sendEmail, sendSMS } = require('../utils/notifications');
const { getGSTDetails, getStateFromGST } = require('../utils/gstAPI'); // Add getStateFromGST here
const Order = require('../models/Order'); // Add this line
const { auth, authorize, checkSupplierSuspension } = require('../middleware/auth');
const router = express.Router();
(async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.collection('suppliers').dropIndex('gstin_1');
      console.log('✅ Fixed GST index issue');
    }
  } catch (error) {
    console.log('ℹ️ Index already fixed or doesn\'t exist');
  }
})();
// Add this function after the imports
const normalizeSubcategory = (subcategory, category) => {
  if (!subcategory) return subcategory;
  
  if (category === 'tmt_steel') {
    return subcategory.toLowerCase().replace('-', '_');
  }
  
  if (category === 'bricks_blocks') {
    // Convert "Fly Ash Bricks" -> "fly_ash_bricks"
    return subcategory.toLowerCase().replace(/\s+/g, '_');
  }
  
  if (category === 'cement') {
    // Convert cement subcategories
    const lowerSub = subcategory.toLowerCase();
    if (lowerSub.includes('opc') && lowerSub.includes('53')) return 'opc_53';
    if (lowerSub.includes('opc') && lowerSub.includes('43')) return 'opc_43';
    if (lowerSub.includes('opc') && !lowerSub.includes('53') && !lowerSub.includes('43')) return 'opc_53';
    if (lowerSub.includes('ppc')) return 'ppc';
    if (lowerSub.includes('white')) return 'white_cement';
    return 'opc_53';
  }
  
  if (category === 'sand') {
    // Convert sand subcategories
    const lowerSub = subcategory.toLowerCase();
    if (lowerSub.includes('plastering')) return 'river_sand_plastering';
    if (lowerSub.includes('river')) return 'river_sand';
    return subcategory.toLowerCase().replace(/\s+/g, '_');
  }
  
  return subcategory;
};

async function updateCoordinatesIfAddressChanged(supplier, reqBody) {
  // Check if any address field is being updated
  const addressFields = ['companyAddress', 'city', 'state', 'pincode'];
  const addressUpdated = addressFields.some(field => reqBody[field] !== undefined);
  const dispatchUpdated = reqBody.dispatchLocation?.address !== undefined;
  
  if (addressUpdated || dispatchUpdated) {
    try {
      console.log('📍 Address updated, getting new coordinates...');
      
      const geocodeResult = await GeocodingService.getCoordinates({
        address: reqBody.dispatchLocation?.address || supplier.dispatchLocation?.address,
        city: reqBody.city || supplier.city,
        state: reqBody.state || supplier.state
      });
      
      if (geocodeResult && geocodeResult.latitude && geocodeResult.longitude) {
        supplier.dispatchLocation.coordinates = [geocodeResult.longitude, geocodeResult.latitude];
        console.log(`✅ Updated coordinates: [${geocodeResult.longitude}, ${geocodeResult.latitude}]`);
        return true;
      }
    } catch (error) {
      console.log('⚠️ Coordinate update failed:', error.message);
    }
  }
  return false;
}
// @route   POST /api/suppliers/register-new
// @desc    Register new supplier (creates user + supplier profile)
// @access  Public
router.post('/register-new', [
  // User validation
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('phoneNumber').matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid phone number'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('contactPersonName').trim().isLength({ min: 2 }).withMessage('Contact person name is required'),
  
  // Supplier validation
  body('gstNumber').custom((value) => {
    if (!validateGST(value)) {
      throw new Error('Please provide a valid GST number');
    }
    return true;
  }),
  body('businessName').trim().isLength({ min: 2 }).withMessage('Business name must be at least 2 characters'),
  body('businessAddress').trim().isLength({ min: 10 }).withMessage('Business address must be at least 10 characters'),
  body('city').notEmpty().withMessage('City is required'),
  body('state').notEmpty().withMessage('State is required'),
  body('pincode').matches(/^[1-9][0-9]{5}$/).withMessage('Please provide a valid pincode'),
  body('bankDetails.bankName').notEmpty().withMessage('Bank name is required'),
  body('bankDetails.accountNumber').isLength({ min: 9, max: 18 }).withMessage('Account number must be 9-18 digits'),
  body('bankDetails.ifscCode').custom((value) => {
    if (!validateIFSC(value)) {
      throw new Error('Please provide a valid IFSC code');
    }
    return true;
  })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      // User fields
      email,
      phoneNumber,
      password,
      contactPersonName,
      businessName,
      gstNumber,
      panNumber,
      businessAddress,
      city,
      state,
      pincode,
      bankDetails,
      productCategories,
      yearEstablished,
      numberOfEmployees,
      annualTurnover
    } = req.body;

  console.log('=== BACKEND RECEIVED DATA ===');
console.log('Email:', email);
console.log('Phone:', phoneNumber);
console.log('Business Name:', businessName);
console.log('GST Number:', gstNumber);
console.log('Bank Details:', JSON.stringify(bankDetails, null, 2));
console.log('Full Request Body:', JSON.stringify(req.body, null, 2));
console.log('=== END BACKEND DATA ===');
    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { phoneNumber }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email or phone number'
      });
    }

    // Check if GST number is already registered
//     if (gstNumber && gstNumber.trim()) {
//   const gstExists = await Supplier.findOne({ 
//     gstNumber: gstNumber.trim(),
//     isActive: true 
//   });
  
//   if (gstExists) {
//     return res.status(400).json({
//       success: false,
//       message: 'A supplier is already registered with this GST number. Please contact support if you need additional access.'
//     });
//   }
// }
    // Generate customer ID
    const generateCustomerId = () => {
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `SUP${timestamp}${random}`;
    };

    // Create user account
    const user = new User({
      name: contactPersonName,
      email: email.toLowerCase().trim(),
      phoneNumber,
      password,
      role: 'supplier',
      customerId: generateCustomerId(),
      addresses: [{
        address: businessAddress,
        city,
        state,
        pincode,
        type: 'work',
        isDefault: true
      }],
      isActive: true,
      phoneVerified: false, // Will need to verify
      emailVerified: false  // Will need to verify
    });

    await user.save();

    // Create supplier profile
    const supplier = new Supplier({
      user: user._id,
      supplierId: `SUP${Date.now()}${Math.random().toString(36).substr(2, 3)}`,
      gstNumber,
      companyName: businessName,
      companyAddress: businessAddress,
      panNumber: panNumber || '',
      state,
      city,
      pincode,
      tradeOwnerName: contactPersonName,
      contactPersonName,
      contactPersonNumber: phoneNumber,
      businessNumber: phoneNumber,
      email: email.toLowerCase(),
      bankDetails: {
        bankName: bankDetails.bankName,
        accountNumber: bankDetails.accountNumber,
        ifscCode: bankDetails.ifscCode,
        accountHolderName: bankDetails.accountHolderName || contactPersonName,
        branchName: bankDetails.branchName || 'Main Branch',
        upiId: bankDetails.upiId || ''
      },
      businessCategories: productCategories || [],
      businessDetails: {
        yearEstablished: yearEstablished ? parseInt(yearEstablished) : new Date().getFullYear(),
        numberOfEmployees: numberOfEmployees || '1-10',
        annualTurnover: annualTurnover || 'below_1_crore'
      },
      isApproved: false, // Will need admin approval
      isActive: false,   // Will be activated after approval
      // REPLACE the dispatchLocation creation (around line 158-165):

      dispatchLocation: {
        address: businessAddress,
        type: 'Point',
        coordinates: [0, 0] // [longitude, latitude]
      }
    });

    await supplier.save();

    // Generate OTPs for verification
    const phoneOTP = Math.floor(100000 + Math.random() * 900000);
    const emailOTP = Math.floor(100000 + Math.random() * 900000);

    user.phoneVerificationOTP = phoneOTP;
    user.phoneOTPExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
    user.emailVerificationOTP = emailOTP;
    user.emailOTPExpire = Date.now() + 10 * 60 * 1000;

    await user.save();
// Send OTPs via SMS and Email
    try {
      // Send SMS OTP
      await sendSMS(
        phoneNumber, 
        `Your Aggrekart supplier verification OTP is: ${phoneOTP}. Valid for 10 minutes. Do not share this OTP.`
      );
      console.log(`📱 SMS OTP sent to ${phoneNumber}: ${phoneOTP}`);
    } catch (smsError) {
      console.error('📱 SMS sending failed:', smsError.message);
      // Continue registration even if SMS fails
    }

    try {
  // Send Email OTP - Clean HTML without line breaks
  const htmlContent = `<h2>Welcome to Aggrekart!</h2><p>Thank you for registering as a supplier. Please verify your email with the OTP below:</p><h3 style="background: #fc8019; color: white; padding: 10px; text-align: center;">${emailOTP}</h3><p>This OTP is valid for 10 minutes.</p><p>If you didn't register for this account, please ignore this email.</p>`;
  
  await sendEmail(
    email,
    'Verify Your Aggrekart Supplier Account',
    htmlContent
  );
  console.log(`📧 Email OTP sent to ${email}: ${emailOTP}`);
} catch (emailError) {
  console.error('📧 Email sending failed:', emailError.message);
}

    // Prepare response
    const responseData = {
      message: 'Supplier registration successful! Your application is under review.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role
      },
      supplier: {
        id: supplier._id,
        companyName: supplier.companyName,
        gstNumber: supplier.gstNumber,
        isApproved: supplier.isApproved
      }
    };

    // Include OTPs in development
    if (process.env.NODE_ENV === 'development') {
      responseData.dev_otps = {
        phoneOTP,
        emailOTP
      };
    }

    res.status(201).json({
      success: true,
      data: responseData
    });

  } catch (error) {
  // Enhanced error logging for debugging
  console.error('=== SUPPLIER REGISTRATION ERROR ===');
  console.error('Error Name:', error.name);
  console.error('Error Message:', error.message);
  
  // Log validation errors if they exist
  if (error.errors) {
    console.error('Validation Errors:', error.errors);
  }
  
  // Log the full error object for debugging
  console.error('Full Error Object:', {
    name: error.name,
    message: error.message,
    errors: error.errors,
    code: error.code,
    keyPattern: error.keyPattern,
    keyValue: error.keyValue
  });
  
  // Log the stack trace for debugging
  if (process.env.NODE_ENV === 'development') {
    console.error('Stack Trace:', error.stack);
  }
  
  console.error('=== END ERROR LOG ===');
  
  next(error);
}
})

// Keep the existing auth-required route below...

// @route   POST /api/suppliers/register
// @desc    Register as supplier
// @access  Private (User must be logged in)
router.post('/register', auth, [
  body('gstNumber').custom((value) => {
    if (!validateGST(value)) {
      throw new Error('Please provide a valid GST number');
    }
    return true;
  }),
  body('companyName').trim().isLength({ min: 2 }).withMessage('Company name must be at least 2 characters'),
  body('companyAddress').trim().isLength({ min: 10 }).withMessage('Company address must be at least 10 characters'),
  body('panNumber').optional().custom((value) => {
    if (value && !validatePAN(value)) {
      throw new Error('Please provide a valid PAN number');
    }
    return true;
  }),
  body('state').notEmpty().withMessage('State is required'),
  body('city').notEmpty().withMessage('City is required'),
  body('pincode').matches(/^[1-9][0-9]{5}$/).withMessage('Please provide a valid pincode'),
  body('tradeOwnerName').trim().isLength({ min: 2 }).withMessage('Trade owner name is required'),
  body('contactPersonName').trim().isLength({ min: 2 }).withMessage('Contact person name is required'),
  body('contactPersonNumber').matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid contact number'),
  body('businessNumber').matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid business number'),
  body('dispatchLocation.address').notEmpty().withMessage('Dispatch address is required'),
  body('dispatchLocation.coordinates.latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
  body('dispatchLocation.coordinates.longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('bankDetails.bankName').notEmpty().withMessage('Bank name is required'),
  body('bankDetails.accountNumber').isLength({ min: 9, max: 18 }).withMessage('Account number must be 9-18 digits'),
  body('bankDetails.confirmAccountNumber').custom((value, { req }) => {
    if (value !== req.body.bankDetails.accountNumber) {
      throw new Error('Account numbers do not match');
    }
    return true;
  }),
  body('bankDetails.ifscCode').custom((value) => {
    if (!validateIFSC(value)) {
      throw new Error('Please provide a valid IFSC code');
    }
    return true;
  }),
  body('bankDetails.branchName').notEmpty().withMessage('Branch name is required'),
  // body('bankDetails.upiId').custom((value) => {
  //   if (!validateUPI(value)) {
  //     throw new Error('Please provide a valid UPI ID');
  //   }
  //   return true;
  // })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Check if user already has a supplier profile
    const existingSupplier = await Supplier.findOne({ user: req.user._id });
    if (existingSupplier) {
      return next(new ErrorHandler('Supplier profile already exists', 400));
    }

    // Check if GST number is already registered
    const gstExists = await Supplier.findOne({ gstNumber: req.body.gstNumber });
    if (gstExists) {
      return next(new ErrorHandler('GST number already registered', 400));
    }

    const {
      gstNumber,
      companyName,
      companyAddress,
      panNumber,
      state,
      city,
      pincode,
      tradeOwnerName,
      contactPersonName,
      contactPersonNumber,
      businessNumber,
      dispatchLocation,
      email,
      bankDetails
    } = req.body;

    // Verify GST details with government API
    let gstDetails = null;
    try {
      gstDetails = await getGSTDetails(gstNumber);
      
      // Auto-fill data from GST if available
      if (gstDetails) {
        // Validate provided data against GST records
        if (gstDetails.legalName && gstDetails.legalName !== companyName) {
          return next(new ErrorHandler('Company name does not match GST records', 400));
        }
      }
    } catch (error) {
      console.error('GST verification failed:', error);
      // Continue without GST verification in development
      if (process.env.NODE_ENV !== 'development') {
        return next(new ErrorHandler('GST verification failed. Please try again.', 400));
      }
    }

    // Create supplier profile
    const supplier = new Supplier({
      user: req.user._id,
      gstNumber,
      companyName,
      companyAddress,
      panNumber,
      state,
      city,
      pincode,
      tradeOwnerName,
      contactPersonName,
      contactPersonNumber,
      businessNumber,
      dispatchLocation,
      email,
      bankDetails: {
        bankName: bankDetails.bankName,
        accountNumber: bankDetails.accountNumber,
        ifscCode: bankDetails.ifscCode,
        branchName: bankDetails.branchName,
        upiId: bankDetails.upiId
      },
      gstVerificationDetails: gstDetails,
      isApproved: false,
      isActive: false
    });

    await supplier.save();

    // Update user role to supplier
    await User.findByIdAndUpdate(req.user._id, { role: 'supplier' });

    // Send registration confirmation email
    try {
      await sendEmail(
        email,
        'Supplier Registration Received - Aggrekart',
        `Your supplier registration has been received. We will review and get back to you within 2-3 business days.`
      );
    } catch (error) {
      console.error('Failed to send registration email:', error);
    }

    res.status(201).json({
      success: true,
      message: 'Supplier registration submitted successfully. You will be notified once approved.',
      data: {
        supplierId: supplier.supplierId,
        status: 'pending_approval'
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/suppliers/profile
// @desc    Get supplier profile
// @access  Private (Supplier)
router.get('/profile', auth, authorize('supplier'), checkSupplierSuspension,async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id })
      .populate('user', 'name email phoneNumber');

    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    res.json({
      success: true,
      data: { supplier }
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/suppliers/profile
// @desc    Update supplier profile
// @access  Private (Supplier)
router.put('/profile', auth, authorize('supplier'), checkSupplierSuspension, [
  body('contactPersonName').optional().trim().isLength({ min: 2 }).withMessage('Contact person name must be at least 2 characters'),
  body('contactPersonNumber').optional().matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid contact number'),
  body('businessNumber').optional().matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid business number'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('bankDetails.bankName').optional().notEmpty().withMessage('Bank name cannot be empty'),

  body('companyAddress').optional().trim().isLength({ min: 5 }).withMessage('Address too short'),
  body('city').optional().notEmpty().withMessage('City required'),
  body('state').optional().notEmpty().withMessage('State required'),
  body('dispatchLocation.address').optional().trim().isLength({ min: 5 }).withMessage('Dispatch address too short'),
  body('bankDetails.accountNumber').optional().isLength({ min: 9, max: 18 }).withMessage('Account number must be 9-18 digits'),
  body('bankDetails.ifscCode').optional().custom((value) => {
    if (value && !validateIFSC(value)) {
      throw new Error('Please provide a valid IFSC code');
    }
    return true;
  }),
  body('bankDetails.branchName').optional().notEmpty().withMessage('Branch name cannot be empty'),
  // body('bankDetails.upiId').optional().custom((value) => {
  //   if (value && !validateUPI(value)) {
  //     throw new Error('Please provide a valid UPI ID');
  //   }
  //   return true;
  // })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

      const allowedUpdates = [
      'contactPersonName',
      'contactPersonNumber', 
      'businessNumber',
      'email',
      // ADD THESE 3 ADDRESS FIELDS:
      'companyAddress',
      'city', 
      'state'
    ];

    // Update basic fields
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        supplier[field] = req.body[field];
      }
    });

    // Update bank details
    if (req.body.bankDetails) {
      const bankFields = ['bankName', 'accountNumber', 'ifscCode', 'branchName', 'upiId'];
      bankFields.forEach(field => {
        if (req.body.bankDetails[field] !== undefined) {
          supplier.bankDetails[field] = req.body.bankDetails[field];
        }
      });
    }

        // Update coordinates if address changed
    const coordinatesUpdated = await updateCoordinatesIfAddressChanged(supplier, req.body);
    
    // Update dispatch address if provided
    if (req.body.dispatchLocation?.address) {
      supplier.dispatchLocation.address = req.body.dispatchLocation.address;
    }

    await supplier.save();

    res.json({
      success: true,
      message: 'Supplier profile updated successfully',
      data: { supplier }
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/suppliers/transport-rates
// @desc    Update transport rates
// @access  Private (Supplier)
// Replace lines 608-667 in routes/suppliers.js with this:
router.put('/transport-rates', auth, authorize('supplier'), checkSupplierSuspension, async (req, res, next) => {
  try {
    console.log('Transport rates update request:', req.body);

    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    if (!supplier.isApproved) {
      return next(new ErrorHandler('Supplier account not approved yet', 403));
    }

    const { upTo5km, upTo10km, upTo20km, above20km } = req.body;

    // Validate the data exists
    if (!upTo5km || !upTo10km || !upTo20km || !above20km) {
      return res.status(400).json({
        success: false,
        message: 'All transport rate zones are required'
      });
    }

    // Update the transport rates with proper data conversion
    supplier.transportRates = {
      upTo5km: {
        costPerKm: parseFloat(upTo5km.costPerKm) || 0,
        baseCost: parseFloat(upTo5km.baseCost) || 0,
        estimatedDeliveryTime: upTo5km.estimatedDeliveryTime || '2-4 hours',
        maxWeight: parseInt(upTo5km.maxWeight) || 1000
      },
      upTo10km: {
        costPerKm: parseFloat(upTo10km.costPerKm) || 0,
        baseCost: parseFloat(upTo10km.baseCost) || 0,
        estimatedDeliveryTime: upTo10km.estimatedDeliveryTime || '4-6 hours',
        maxWeight: parseInt(upTo10km.maxWeight) || 2000
      },
      upTo20km: {
        costPerKm: parseFloat(upTo20km.costPerKm) || 0,
        baseCost: parseFloat(upTo20km.baseCost) || 0,
        estimatedDeliveryTime: upTo20km.estimatedDeliveryTime || '6-8 hours',
        maxWeight: parseInt(upTo20km.maxWeight) || 3000
      },
      above20km: {
        costPerKm: parseFloat(above20km.costPerKm) || 0,
        baseCost: parseFloat(above20km.baseCost) || 0,
        estimatedDeliveryTime: above20km.estimatedDeliveryTime || '1-2 days',
        maxWeight: parseInt(above20km.maxWeight) || 5000
      }
    };

    console.log('Saving transport rates:', supplier.transportRates);

    await supplier.save();

    console.log('Transport rates saved successfully');

    res.json({
      success: true,
      message: 'Transport rates updated successfully',
      data: { 
        supplier: {
          transportRates: supplier.transportRates
        }
      }
    });

  } catch (error) {
    console.error('Transport rates update error:', error);
    next(error);
  }
});
// @route   GET /api/suppliers/dashboard
// @desc    Get supplier dashboard data
// @access  Private (Supplier)
// Replace the existing dashboard route (lines 575-643) with this enhanced version:

// @route   GET /api/suppliers/dashboard
// @desc    Get supplier dashboard data
// @access  Private (Supplier)
router.get('/dashboard', auth, authorize('supplier'), checkSupplierSuspension, async (req, res, next) => {
    try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }
if (!supplier.isActive) {
      console.log('🚫 Supplier is suspended:', supplier.supplierId);
      return res.status(403).json({
        success: false,
        message: 'Your supplier account has been suspended',
        error: 'SUPPLIER_SUSPENDED',
        data: {
          suspendedAt: supplier.suspendedAt,
          suspensionReason: supplier.suspensionReason,
          contactSupport: 'Please contact support@aggrekart.com for assistance'
        }
      });
    }
    const { days = 30 } = req.query;
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days));

    // Get product statistics
    const productStats = await Product.aggregate([
      { $match: { supplier: supplier._id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $and: ['$isActive', '$isApproved'] }, 1, 0] } },
          pending: { $sum: { $cond: ['$isApproved', 0, 1] } },
          inactive: { $sum: { $cond: ['$isActive', 0, 1] } },
          totalViews: { $sum: '$viewCount' },
          totalSales: { $sum: '$salesCount' },
          avgRating: { $avg: '$averageRating' },
          totalReviews: { $sum: '$totalReviews' }
        }
      }
    ]);

    const productStatsData = productStats[0] || {
      total: 0, active: 0, pending: 0, inactive: 0,
      totalViews: 0, totalSales: 0, avgRating: 0, totalReviews: 0
    };

    // Get recent products
    const recentProducts = await Product.find({ supplier: supplier._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name category subcategory pricing.basePrice stock.available isActive isApproved createdAt images')
      .lean();

    // Get top performing products
    const topProducts = await Product.find({ 
      supplier: supplier._id,
      isActive: true,
      isApproved: true 
    })
      .sort({ salesCount: -1, viewCount: -1 })
      .limit(5)
      .select('name category salesCount viewCount averageRating totalReviews pricing.basePrice images')
      .lean();

    // Mock sales data for the period (replace with actual order data when available)
        // Get real sales data from orders for the specified period
    const daysInt = parseInt(days);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysInt);
    startDate.setHours(0, 0, 0, 0);

    // Aggregate real order data by date
    const orderAggregation = await Order.aggregate([
      {
        $match: {
          supplier: supplier._id,
          createdAt: { $gte: startDate },
          status: { $in: ['confirmed', 'preparing', 'processing', 'dispatched', 'delivered'] } // Exclude cancelled/pending
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          totalRevenue: { $sum: '$pricing.totalAmount' },
          totalOrders: { $sum: 1 },
          averageOrderValue: { $avg: '$pricing.totalAmount' },
          totalItems: { $sum: { $size: '$items' } },
          uniqueCustomers: { $addToSet: '$customer' }
        }
      },
      {
        $project: {
          _id: 1,
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: '$_id.day'
            }
          },
          totalRevenue: 1,
          totalOrders: 1,
          averageOrderValue: { $round: ['$averageOrderValue', 0] },
          totalItems: 1,
          uniqueCustomers: { $size: '$uniqueCustomers' }
        }
      },
      {
        $sort: { date: 1 }
      }
    ]);

    // Create a complete date range with zero values for missing dates
    const salesData = [];
    for (let i = daysInt - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      
      // Find matching order data for this date
      const dayData = orderAggregation.find(item => {
        const itemDate = new Date(item.date).toISOString().split('T')[0];
        return itemDate === dateString;
      });
      
      salesData.push({
        date: dateString,
        revenue: dayData ? dayData.totalRevenue : 0,
        orders: dayData ? dayData.totalOrders : 0,
        totalSales: dayData ? dayData.totalRevenue : 0,
        totalOrders: dayData ? dayData.totalOrders : 0,
        uniqueCustomers: dayData ? dayData.uniqueCustomers : 0,
        avgOrderValue: dayData ? dayData.averageOrderValue : 0,
        totalItems: dayData ? dayData.totalItems : 0
      });
    }

    // Calculate real growth metrics
    const currentPeriodStats = await Order.aggregate([
      {
        $match: {
          supplier: supplier._id,
          createdAt: { $gte: startDate },
          status: { $in: ['confirmed', 'preparing', 'processing', 'dispatched', 'delivered'] }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$pricing.totalAmount' },
          totalOrders: { $sum: 1 },
          averageOrderValue: { $avg: '$pricing.totalAmount' }
        }
      }
    ]);

    // Get previous period stats for comparison
    const previousStartDate = new Date(startDate);
    previousStartDate.setDate(previousStartDate.getDate() - daysInt);
    
    const previousPeriodStats = await Order.aggregate([
      {
        $match: {
          supplier: supplier._id,
          createdAt: { 
            $gte: previousStartDate,
            $lt: startDate
          },
          status: { $in: ['confirmed', 'preparing', 'processing', 'dispatched', 'delivered'] }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$pricing.totalAmount' },
          totalOrders: { $sum: 1 },
          averageOrderValue: { $avg: '$pricing.totalAmount' }
        }
      }
    ]);

    const currentStats = currentPeriodStats[0] || { totalRevenue: 0, totalOrders: 0, averageOrderValue: 0 };
    const previousStats = previousPeriodStats[0] || { totalRevenue: 0, totalOrders: 0, averageOrderValue: 0 };

    // Calculate real growth percentages
    const revenueGrowth = previousStats.totalRevenue > 0 
      ? ((currentStats.totalRevenue - previousStats.totalRevenue) / previousStats.totalRevenue) * 100 
      : currentStats.totalRevenue > 0 ? 100 : 0;

    const ordersGrowth = previousStats.totalOrders > 0 
      ? ((currentStats.totalOrders - previousStats.totalOrders) / previousStats.totalOrders) * 100 
      : currentStats.totalOrders > 0 ? 100 : 0;

    const aovGrowth = previousStats.averageOrderValue > 0 
      ? ((currentStats.averageOrderValue - previousStats.averageOrderValue) / previousStats.averageOrderValue) * 100 
      : currentStats.averageOrderValue > 0 ? 100 : 0;

    // Get overall supplier stats from all orders
    const supplierTotalStats = await Order.aggregate([
      {
        $match: {
          supplier: supplier._id,
          status: { $in: ['confirmed', 'preparing', 'processing', 'dispatched', 'delivered'] }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$pricing.totalAmount' },
          totalOrders: { $sum: 1 },
          averageOrderValue: { $avg: '$pricing.totalAmount' }
        }
      }
    ]);

    const supplierStats = supplierTotalStats[0] || { totalRevenue: 0, totalOrders: 0, averageOrderValue: 0 };

    // Calculate growth metrics (replace mock data with real calculations)
    const previousPeriodRevenue = previousStats.totalRevenue;
    const currentRevenue = supplierStats.totalRevenue;
    const dashboardData = {
      supplier: {
        name: supplier.companyName,
        supplierId: supplier.supplierId,
        isApproved: supplier.isApproved,
        rating: supplier.rating,
        memberSince: supplier.createdAt,
        location: supplier.businessAddress
      },
      stats: {
        totalRevenue: currentRevenue,
        totalOrders: supplierStats.totalOrders || 0,
        totalProducts: productStatsData.total,
        averageOrderValue: supplierStats.totalOrders > 0 ? currentRevenue / supplierStats.totalOrders : 0,
        revenueGrowth: revenueGrowth,
        ordersGrowth: Math.floor(Math.random() * 40) - 20, // Mock data
        productsGrowth: Math.floor(Math.random() * 30) - 10, // Mock data
        aovGrowth: Math.floor(Math.random() * 25) - 10, // Mock data
        productViews: productStatsData.totalViews,
        totalSales: productStatsData.totalSales,
        avgProductRating: productStatsData.avgRating || 0,
        totalReviews: productStatsData.totalReviews
      },
      products: {
        total: productStatsData.total,
        active: productStatsData.active,
        pending: productStatsData.pending,
        inactive: productStatsData.inactive,
        recent: recentProducts,
        topPerforming: topProducts
      },
      salesData,
      approvalStatus: {
        isApproved: supplier.isApproved,
        message: supplier.isApproved 
          ? 'Your account is approved and active' 
          : 'Your account is pending approval. You can add products but they won\'t be visible until approved.'
      },
      notifications: [
        ...(supplier.isApproved ? [] : [{
          type: 'warning',
          title: 'Account Pending Approval',
          message: 'Complete your profile verification to start selling.',
          action: { text: 'Complete Profile', link: '/supplier/profile' }
        }]),
        ...(productStatsData.total < 5 ? [{
          type: 'info',
          title: 'Add More Products',
          message: 'Boost your sales by adding more products to your catalog.',
          action: { text: 'Add Product', link: '/supplier/products/add' }
        }] : []),
        ...(productStatsData.pending > 0 ? [{
          type: 'info',
          title: `${productStatsData.pending} Products Pending`,
          message: 'Your products are being reviewed by our team.',
          action: null
        }] : [])
      ]
    };

    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Dashboard API error:', error);
    next(error);
  }
});
// @route   GET /api/suppliers/nearby
// @desc    Get nearby suppliers for customers
// @access  Public
// Add these new routes around line 1000 (before the products section):

// @route   PUT /api/suppliers/profile/toggle
// @desc    Enable/Disable supplier profile (affects product visibility)
// @access  Private (Supplier only)
router.put('/profile/toggle', auth, authorize('supplier'), checkSupplierSuspension, [
  body('enabled')
    .isBoolean()
    .withMessage('Enabled status must be a boolean'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason must not exceed 500 characters')
], async (req, res, next) => {
  try {
    console.log('🔄 Supplier toggling profile visibility:', req.user._id);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { enabled, reason } = req.body;

    // Find supplier
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier profile not found'
      });
    }

    // Check if supplier is approved and active
    if (!supplier.isApproved || !supplier.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify profile status - supplier is not approved or active'
      });
    }

    const oldStatus = supplier.profileEnabled;
    
    // Update profile status
    supplier.profileEnabled = enabled;
    
    if (!enabled) {
      supplier.profileDisabledAt = new Date();
      supplier.profileDisabledReason = reason || 'Disabled by supplier';
    } else {
      supplier.profileDisabledAt = null;
      supplier.profileDisabledReason = null;
    }

    await supplier.save();

    console.log(`✅ Supplier ${supplier.supplierId} profile ${enabled ? 'enabled' : 'disabled'}`);

    // Get product count affected
    const Product = require('../models/Product');
    const affectedProductsCount = await Product.countDocuments({
      supplier: supplier._id,
      isActive: true,
      isApproved: true
    });

    // Log the change for admin tracking
    const adminLog = {
      action: 'profile_toggle',
      supplierId: supplier._id,
      supplierName: supplier.companyName,
      oldStatus: oldStatus,
      newStatus: enabled,
      reason: reason,
      affectedProducts: affectedProductsCount,
      timestamp: new Date(),
      triggeredBy: 'supplier'
    };

    console.log('📝 Profile toggle log:', adminLog);

    res.json({
      success: true,
      message: `Profile ${enabled ? 'enabled' : 'disabled'} successfully`,
      data: {
        supplier: {
          supplierId: supplier.supplierId,
          companyName: supplier.companyName,
          profileEnabled: supplier.profileEnabled,
          profileDisabledAt: supplier.profileDisabledAt,
          profileDisabledReason: supplier.profileDisabledReason
        },
        impact: {
          affectedProducts: affectedProductsCount,
          productsVisible: enabled ? affectedProductsCount : 0
        }
      }
    });

  } catch (error) {
    console.error('❌ Error toggling supplier profile:', error);
    next(error);
  }
});

// @route   GET /api/suppliers/profile/status
// @desc    Get supplier profile visibility status
// @access  Private (Supplier only)
router.get('/profile/status', auth, authorize('supplier'), checkSupplierSuspension, async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id })
      .select('supplierId companyName profileEnabled profileDisabledAt profileDisabledReason isActive isApproved');

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier profile not found'
      });
    }

    // Get product statistics
    const Product = require('../models/Product');
    const productStats = await Product.aggregate([
      {
        $match: {
          supplier: supplier._id
        }
      },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          activeProducts: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$isActive', true] }, { $eq: ['$isApproved', true] }] },
                1,
                0
              ]
            }
          },
          visibleProducts: {
            $sum: {
              $cond: [
                { 
                  $and: [
                    { $eq: ['$isActive', true] }, 
                    { $eq: ['$isApproved', true] },
                    supplier.profileEnabled
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const stats = productStats[0] || {
      totalProducts: 0,
      activeProducts: 0,
      visibleProducts: 0
    };

    res.json({
      success: true,
      data: {
        supplier: {
          supplierId: supplier.supplierId,
          companyName: supplier.companyName,
          profileEnabled: supplier.profileEnabled,
          profileDisabledAt: supplier.profileDisabledAt,
          profileDisabledReason: supplier.profileDisabledReason,
          isActive: supplier.isActive,
          isApproved: supplier.isApproved
        },
        productStats: {
          totalProducts: stats.totalProducts,
          activeProducts: stats.activeProducts,
          visibleProducts: supplier.profileEnabled ? stats.activeProducts : 0,
          hiddenProducts: supplier.profileEnabled ? 0 : stats.activeProducts
        },
        canToggle: supplier.isActive && supplier.isApproved
      }
    });

  } catch (error) {
    console.error('❌ Error getting supplier profile status:', error);
    next(error);
  }
});

// @route   GET /api/suppliers/profile/impact
// @desc    Get impact preview of enabling/disabling profile
// @access  Private (Supplier only)
router.get('/profile/impact', auth, authorize('supplier'), checkSupplierSuspension, async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier profile not found'
      });
    }

    const Product = require('../models/Product');
    
    // Get detailed product breakdown
    const productBreakdown = await Product.aggregate([
      {
        $match: {
          supplier: supplier._id
        }
      },
      {
        $group: {
          _id: '$category',
          totalProducts: { $sum: 1 },
          activeProducts: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$isActive', true] }, { $eq: ['$isApproved', true] }] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Calculate current visibility status
    const currentlyVisible = supplier.profileEnabled;
    const impactMessage = currentlyVisible 
      ? 'Disabling your profile will hide all your products from customers'
      : 'Enabling your profile will make your approved products visible to customers';

    res.json({
      success: true,
      data: {
        currentStatus: {
          profileEnabled: supplier.profileEnabled,
          impactMessage: impactMessage
        },
        productBreakdown: productBreakdown.map(category => ({
          category: category._id,
          totalProducts: category.totalProducts,
          activeProducts: category.activeProducts,
          willBeVisible: !currentlyVisible ? category.activeProducts : 0,
          willBeHidden: currentlyVisible ? category.activeProducts : 0
        })),
        summary: {
          totalActiveProducts: productBreakdown.reduce((sum, cat) => sum + cat.activeProducts, 0),
          actionResult: currentlyVisible ? 'All products will be hidden' : 'All approved products will be visible'
        }
      }
    });

  } catch (error) {
    console.error('❌ Error getting profile impact:', error);
    next(error);
  }
});
router.get('/nearby', [
  query('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
  query('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
  query('radius').optional().isFloat({ min: 1, max: 50 }).withMessage('Radius must be between 1-50 km'),
  query('category').optional().isIn(['aggregate', 'sand', 'tmt_steel', 'bricks_blocks', 'cement']).withMessage('Invalid category'),
  query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Limit must be between 1 and 20')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { 
      latitude, 
      longitude, 
      radius = 10, 
      category,
      limit = 6 
    } = req.query;

    // Find suppliers within radius using MongoDB geospatial query
    const suppliers = await Supplier.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          distanceField: "distance",
          maxDistance: parseFloat(radius) * 1000, // Convert km to meters
          query: { 
            isApproved: true, 
            isActive: true 
          },
          spherical: true
        }
      },
      {
        $lookup: {
          from: 'products',
          let: { supplierId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$supplier', '$$supplierId'] },
                isActive: true,
                isApproved: true,
                ...(category && { category })
              }
            }
          ],
          as: 'products'
        }
      },
      {
        $match: {
          'products.0': { $exists: true } // Only suppliers with products
        }
      },
      {
        $project: {
          companyName: 1,
          dispatchLocation: 1,
          rating: 1,
          totalOrders: 1,
          distance: { $round: [{ $divide: ['$distance', 1000] }, 2] }, // Convert to km
          productCount: { $size: '$products' },
          categories: {
            $setUnion: ['$products.category']
          }
        }
      },
      {
        $sort: { distance: 1 }
      },
      {
        $limit: parseInt(limit)
      }
    ]);

    res.json({
      success: true,
      data: {
        suppliers,
        searchCenter: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude)
        },
        radius: parseFloat(radius),
        totalFound: suppliers.length
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/suppliers/:supplierId/details
// @desc    Get public supplier details
// @access  Public
// Replace the existing route around line 1360-1450

// @route   GET /api/suppliers/:supplierId/details
// @desc    Get public supplier details
// @access  Public
// Replace the existing route from line 1370 onwards

// @route   GET /api/suppliers/:supplierId/details
// @desc    Get public supplier details
// @access  Public
// Replace the supplier details route completely

// @route   GET /api/suppliers/:supplierId/details
// @desc    Get public supplier details
// @access  Public
// Update the existing supplier details route to include reviews

// @route   GET /api/suppliers/:supplierId/details
// @desc    Get public supplier details with product-based ratings and reviews
// @access  Public
router.get('/:supplierId/details', [
  param('supplierId').notEmpty().withMessage('Supplier ID is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { supplierId } = req.params;

    // Get supplier
    const supplier = await Supplier.findOne({
      $or: [{ _id: supplierId }, { supplierId }],
      isApproved: true,
      isActive: true
    });

    if (!supplier) {
      return next(new ErrorHandler('Supplier not found', 404));
    }

    console.log('=== SUPPLIER DETAILS API ===');
    console.log('Company Name:', supplier.companyName);
    console.log('Supplier ID:', supplierId);

    // Get supplier's products with reviews
    const products = await Product.find({
      supplier: supplier._id,
      isActive: true,
      isApproved: true
    })
      .select('name category subcategory pricing averageRating totalReviews images stock viewCount salesCount reviews')
      .populate('reviews.user', 'name customerType')
      .populate('supplier', 'companyName rating')
      .lean();

    // Calculate aggregated product-based ratings (same as dashboard)
    const productStats = await Product.aggregate([
      { $match: { supplier: supplier._id, isActive: true, isApproved: true } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$averageRating' },
          totalReviews: { $sum: '$totalReviews' },
          totalProducts: { $sum: 1 }
        }
      }
    ]);

    const productStatsData = productStats[0] || {
      avgRating: 0,
      totalReviews: 0, 
      totalProducts: 0
    };

    // Collect all reviews from all products
    const allReviews = [];
    const ratingBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    products.forEach(product => {
      if (product.reviews && product.reviews.length > 0) {
        product.reviews.forEach(review => {
          allReviews.push({
            _id: review._id,
            rating: review.rating,
            comment: review.comment,
            createdAt: review.createdAt,
            isVerifiedPurchase: review.isVerifiedPurchase,
            user: {
              name: review.user?.name || 'Anonymous',
              customerType: review.user?.customerType || 'individual'
            },
            product: {
              _id: product._id,
              name: product.name,
              category: product.category,
              image: product.images?.[0]?.url || product.images?.[0]
            }
          });
          
          // Count rating distribution
          if (review.rating >= 1 && review.rating <= 5) {
            ratingBreakdown[review.rating]++;
          }
        });
      }
    });

    // Sort reviews by most recent first
    allReviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Calculate review statistics
    const reviewStats = {
      totalReviews: allReviews.length,
      averageRating: productStatsData.avgRating,
      ratingBreakdown,
      verifiedReviews: allReviews.filter(r => r.isVerifiedPurchase).length,
      recentReviews: allReviews.slice(0, 10), // Last 10 reviews
      allReviews: allReviews
    };

    console.log('=== REVIEW STATS ===');
    console.log('Total Reviews:', reviewStats.totalReviews);
    console.log('Average Rating:', reviewStats.averageRating);
    console.log('Rating Breakdown:', ratingBreakdown);
    console.log('Verified Reviews:', reviewStats.verifiedReviews);
    console.log('==================');

    // Group products by category
    const productsByCategory = products.reduce((acc, product) => {
      if (!acc[product.category]) {
        acc[product.category] = [];
      }
      // Remove reviews from product data to avoid duplication
      const { reviews, ...productWithoutReviews } = product;
      acc[product.category].push(productWithoutReviews);
      return acc;
    }, {});

    // Calculate years in business
    const yearsInBusiness = supplier.createdAt ? 
      new Date().getFullYear() - new Date(supplier.createdAt).getFullYear() : 0;

    // Format transport rates
    let formattedTransportRates = null;
    if (supplier.transportRates && typeof supplier.transportRates === 'object') {
      formattedTransportRates = [];
      
      if (supplier.transportRates.upTo5km?.costPerKm > 0) {
        formattedTransportRates.push({
          maxDistance: 5,
          ratePerKm: supplier.transportRates.upTo5km.costPerKm,
          estimatedTime: supplier.transportRates.upTo5km.estimatedDeliveryTime || '2-4 hours'
        });
      }
      
      if (supplier.transportRates.upTo10km?.costPerKm > 0) {
        formattedTransportRates.push({
          maxDistance: 10,
          ratePerKm: supplier.transportRates.upTo10km.costPerKm,
          estimatedTime: supplier.transportRates.upTo10km.estimatedDeliveryTime || '4-6 hours'
        });
      }
      
      if (supplier.transportRates.upTo20km?.costPerKm > 0) {
        formattedTransportRates.push({
          maxDistance: 20,
          ratePerKm: supplier.transportRates.upTo20km.costPerKm,
          estimatedTime: supplier.transportRates.upTo20km.estimatedDeliveryTime || '6-8 hours'
        });
      }
      
      if (supplier.transportRates.above20km?.costPerKm > 0) {
        formattedTransportRates.push({
          maxDistance: 999,
          ratePerKm: supplier.transportRates.above20km.costPerKm,
          estimatedTime: supplier.transportRates.above20km.estimatedDeliveryTime || '1-2 days'
        });
      }
    }

    // Format supplier data for frontend with product-based ratings
    const supplierData = {
      _id: supplier._id,
      name: supplier.companyName,
      rating: productStatsData.avgRating,
      ratingCount: productStatsData.totalReviews,
      totalOrders: supplier.totalOrders || 0,
      productStats: {
        avgRating: productStatsData.avgRating,
        totalReviews: productStatsData.totalReviews,
        totalProducts: productStatsData.totalProducts
      },
      transportRates: formattedTransportRates,
      createdAt: supplier.createdAt,
      yearsInBusiness: yearsInBusiness > 0 ? yearsInBusiness : "New",
      businessDetails: {
        businessType: supplier.categories?.length > 0 ? 
          supplier.categories.map(cat => cat.replace('_', ' ').toUpperCase()).join(', ') : 
          "Construction Materials Supplier",
        gstNumber: supplier.gstNumber,
        establishedDate: supplier.createdAt,
        address: {
          city: supplier.city,
          state: supplier.state,
          full: supplier.dispatchLocation?.address
        }
      },
      contactInfo: {
        phone: supplier.contactPersonNumber || supplier.businessNumber,
        email: supplier.email,
        contactPerson: supplier.contactPersonName
      },
      address: {
        city: supplier.city,
        state: supplier.state,
        full: supplier.dispatchLocation?.address
      }
    };

    console.log('=== FINAL SUPPLIER DATA ===');
    console.log('Rating being sent:', supplierData.rating);
    console.log('Rating Count being sent:', supplierData.ratingCount);
    console.log('Product Stats:', supplierData.productStats);
    console.log('===========================');

    res.json({
      success: true,
      data: {
        supplier: supplierData,
        products: productsByCategory,
        totalProducts: products.length,
        categories: Object.keys(productsByCategory),
        reviews: reviewStats // Add reviews data
      }
    });

  } catch (error) {
    console.error('Error fetching supplier details:', error);
    next(error);
  }
});
// @route   POST /api/suppliers/documents/upload
// @desc    Upload supplier documents
// @access  Private (Supplier)
router.post('/documents/upload', auth, authorize('supplier'), async (req, res, next) => {
  try {
    // This would handle document uploads
    // Implementation depends on your file upload setup
    
    res.json({
      success: true,
      message: 'Document upload functionality - To be implemented with file upload middleware'
    });

  } catch (error) {
    next(error);
  }
});
// Add these to your routes/suppliers.js file:

// @route   GET /api/suppliers/stats
// @desc    Get supplier statistics for dashboard
// @access  Private (Supplier)
router.get('/stats', auth, authorize('supplier'), checkSupplierSuspension, async (req, res, next) => {  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Calculate stats here
    const stats = {
      totalRevenue: 0,
      totalOrders: 0,
      totalProducts: 0,
      averageOrderValue: 0,
      revenueGrowth: 0,
      ordersGrowth: 0,
      productsGrowth: 0,
      aovGrowth: 0
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/suppliers/analytics/products
// @desc    Get product analytics
// @access  Private (Supplier)
router.get('/analytics/products', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier profile not found'
      });
    }

    const { period = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Get product performance analytics
    const productAnalytics = await Product.aggregate([
      {
        $match: { supplier: supplier._id }
      },
      {
        $lookup: {
          from: 'orders',
          let: { productId: '$_id' },
          pipeline: [
            { $unwind: '$items' },
            { $match: { 
              $expr: { $eq: ['$items.product', '$$productId'] },
              createdAt: { $gte: startDate }
            }},
            {
              $group: {
                _id: '$items.product',
                totalOrders: { $sum: 1 },
                totalQuantity: { $sum: '$items.quantity' },
                totalRevenue: { $sum: '$items.totalPrice' }
              }
            }
          ],
          as: 'orderStats'
        }
      },
      {
        $project: {
          name: 1,
          category: 1,
          pricing: 1,
          stock: 1,
          isActive: 1,
          isApproved: 1,
          viewCount: { $ifNull: ['$viewCount', 0] },
          salesCount: { $ifNull: ['$salesCount', 0] },
          totalOrders: { $ifNull: [{ $arrayElemAt: ['$orderStats.totalOrders', 0] }, 0] },
          totalQuantity: { $ifNull: [{ $arrayElemAt: ['$orderStats.totalQuantity', 0] }, 0] },
          totalRevenue: { $ifNull: [{ $arrayElemAt: ['$orderStats.totalRevenue', 0] }, 0] }
        }
      },
      { $sort: { totalRevenue: -1 } }
    ]);

    // Product category breakdown
    const categoryBreakdown = await Product.aggregate([
      { $match: { supplier: supplier._id } },
      {
        $group: {
          _id: '$category',
          totalProducts: { $sum: 1 },
          activeProducts: { $sum: { $cond: [{ $and: ['$isActive', '$isApproved'] }, 1, 0] } },
          totalViews: { $sum: { $ifNull: ['$viewCount', 0] } },
          totalSales: { $sum: { $ifNull: ['$salesCount', 0] } }
        }
      }
    ]);

    res.json({ 
      success: true, 
      data: {
        products: productAnalytics,
        categoryBreakdown,
        period: parseInt(period)
      }
    });
  } catch (error) {
    console.error('❌ Product analytics error:', error);
    next(error);
  }
});
// @route   GET /api/suppliers/analytics/sales
// @desc    Get sales analytics
// @access  Private (Supplier)
router.get('/analytics/sales', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier profile not found'
      });
    }

    const { period = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Daily sales analytics
    const dailySales = await Order.aggregate([
      {
        $match: {
          supplier: supplier._id,
          createdAt: { $gte: startDate },
          status: { $in: ['confirmed', 'preparing', 'processing', 'dispatched', 'delivered'] }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$pricing.totalAmount' },
          totalItems: { $sum: { $size: '$items' } },
          averageOrderValue: { $avg: '$pricing.totalAmount' }
        }
      },
      {
        $project: {
          _id: 1,
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: '$_id.day'
            }
          },
          totalOrders: 1,
          totalRevenue: 1,
          totalItems: 1,
          averageOrderValue: { $round: ['$averageOrderValue', 0] }
        }
      },
      { $sort: { date: 1 } }
    ]);

    // Overall statistics for the period
    const overallStats = await Order.aggregate([
      {
        $match: {
          supplier: supplier._id,
          createdAt: { $gte: startDate },
          status: { $in: ['confirmed', 'preparing', 'processing', 'dispatched', 'delivered'] }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$pricing.totalAmount' },
          averageOrderValue: { $avg: '$pricing.totalAmount' },
          totalItems: { $sum: { $size: '$items' } },
          uniqueCustomers: { $addToSet: '$customer' }
        }
      },
      {
        $project: {
          totalOrders: 1,
          totalRevenue: 1,
          averageOrderValue: { $round: ['$averageOrderValue', 0] },
          totalItems: 1,
          uniqueCustomers: { $size: '$uniqueCustomers' }
        }
      }
    ]);

    // Order status breakdown
    const statusBreakdown = await Order.aggregate([
      {
        $match: {
          supplier: supplier._id,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalValue: { $sum: '$pricing.totalAmount' }
        }
      }
    ]);

    res.json({ 
      success: true, 
      data: {
        dailySales,
        overallStats: overallStats[0] || {
          totalOrders: 0,
          totalRevenue: 0,
          averageOrderValue: 0,
          totalItems: 0,
          uniqueCustomers: 0
        },
        statusBreakdown,
        period: parseInt(period)
      }
    });
  } catch (error) {
    console.error('❌ Sales analytics error:', error);
    next(error);
  }
});

// Add this new route after the existing routes

// @route   POST /api/suppliers/verify-gst
// @desc    Verify GST number and return business details for auto-fill
// @access  Public
router.post('/verify-gst', [
  body('gstNumber').custom((value) => {
    if (!validateGST(value)) {
      throw new Error('Please provide a valid GST number');
    }
    return true;
  })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid GST number format',
        errors: errors.array()
      });
    }

    const { gstNumber } = req.body;

    // Check if GST is already registered
    const existingSupplier = await Supplier.findOne({ gstNumber });
    if (existingSupplier) {
      return res.status(409).json({
        success: false,
        message: 'This GST number is already registered with another supplier',
        isRegistered: true
      });
    }

    try {
      // Get GST details from API
      const gstDetails = await getGSTDetails(gstNumber);
      
      if (gstDetails) {
        // Extract state from GST number
        const stateCode = gstNumber.substring(0, 2);
        const stateFromGST = getStateFromGST(gstNumber);
        
        // Parse address for auto-fill
        const addressData = gstDetails.address || {};
        
        const autoFillData = {
          gstNumber: gstDetails.gstNumber,
          companyName: gstDetails.legalName || gstDetails.tradeName || '',
          tradeName: gstDetails.tradeName || '',
          businessAddress: `${addressData.building || ''} ${addressData.street || ''}`.trim(),
          city: addressData.city || '',
          state: stateFromGST || addressData.state || '',
          pincode: addressData.pincode || '',
          registrationDate: gstDetails.registrationDate,
          gstStatus: gstDetails.status,
          taxpayerType: gstDetails.taxpayerType,
          isVerified: gstDetails.isVerified || false,
          lastUpdated: gstDetails.lastUpdated
        };

        res.json({
          success: true,
          message: 'GST details retrieved successfully',
          data: autoFillData,
          isValid: true,
          source: gstDetails.apiSource || 'api'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'GST details not found',
          isValid: false
        });
      }
    } catch (gstError) {
      console.error('GST API Error:', gstError);
      res.status(500).json({
        success: false,
        message: 'Unable to verify GST number at the moment. Please try again.',
        error: process.env.NODE_ENV === 'development' ? gstError.message : undefined
      });
    }

  } catch (error) {
    next(error);
  }
});
router.get('/analytics', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier profile not found'
      });
    }

    const { period = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Get comprehensive analytics for settings page
    const [
      orderStats,
      productStats,
      revenueStats,
      customerStats
    ] = await Promise.all([
      // Order statistics
      Order.aggregate([
        {
          $match: {
            supplier: supplier._id,
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            deliveredOrders: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
            cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
            pendingOrders: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } }
          }
        }
      ]),

      // Product statistics
      Product.aggregate([
        {
          $match: { supplier: supplier._id }
        },
        {
          $group: {
            _id: null,
            totalProducts: { $sum: 1 },
            activeProducts: { $sum: { $cond: [{ $and: ['$isActive', '$isApproved'] }, 1, 0] } },
            pendingProducts: { $sum: { $cond: ['$isApproved', 0, 1] } },
            totalViews: { $sum: { $ifNull: ['$viewCount', 0] } },
            totalSales: { $sum: { $ifNull: ['$salesCount', 0] } }
          }
        }
      ]),

      // Revenue statistics
      Order.aggregate([
        {
          $match: {
            supplier: supplier._id,
            createdAt: { $gte: startDate },
            status: { $in: ['confirmed', 'preparing', 'processing', 'dispatched', 'delivered'] }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$pricing.totalAmount' },
            averageOrderValue: { $avg: '$pricing.totalAmount' }
          }
        }
      ]),

      // Customer statistics
      Order.aggregate([
        {
          $match: {
            supplier: supplier._id,
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            uniqueCustomers: { $addToSet: '$customer' }
          }
        },
        {
          $project: {
            totalCustomers: { $size: '$uniqueCustomers' }
          }
        }
      ])
    ]);

    // Format response for settings page
    const analyticsData = {
      orders: orderStats[0] || {
        totalOrders: 0,
        deliveredOrders: 0,
        cancelledOrders: 0,
        pendingOrders: 0
      },
      products: productStats[0] || {
        totalProducts: 0,
        activeProducts: 0,
        pendingProducts: 0,
        totalViews: 0,
        totalSales: 0
      },
      revenue: revenueStats[0] || {
        totalRevenue: 0,
        averageOrderValue: 0
      },
      customers: customerStats[0] || {
        totalCustomers: 0
      },
      period: parseInt(period)
    };

    res.json({ 
      success: true, 
      data: analyticsData
    });
    
  } catch (error) {
    console.error('❌ General analytics error:', error);
    next(error);
  }
});
// Add this test route at the very end of your file, just before module.exports = router;

// TEST ROUTE - Add this temporarily to isolate the issue
router.post('/test-gst-debug', async (req, res) => {
  console.log('🚀 TEST ROUTE STARTED');
  
  try {
    console.log('1️⃣ Testing basic response...');
    
    // Test 1: Basic response
    const basicTest = { step: 1, status: 'Basic route works' };
    console.log('✅ Basic test passed');
    
    // Test 2: Check imports
    console.log('2️⃣ Testing imports...');
    console.log('getGSTDetails function:', typeof getGSTDetails);
    console.log('getStateFromGST function:', typeof getStateFromGST);
    console.log('Supplier model:', typeof Supplier);
    
    if (typeof getGSTDetails !== 'function') {
      throw new Error('getGSTDetails is not a function');
    }
    
    if (typeof getStateFromGST !== 'function') {
      throw new Error('getStateFromGST is not a function');
    }
    
    console.log('✅ Imports test passed');
    
    // Test 3: Database connection
    console.log('3️⃣ Testing database...');
    const testQuery = await Supplier.countDocuments();
    console.log('Database suppliers count:', testQuery);
    console.log('✅ Database test passed');
    
    // Test 4: GST API call
    console.log('4️⃣ Testing GST API...');
    const testGST = '21XVPFY27901Z1';
    console.log('Calling getGSTDetails with:', testGST);
    
    const gstResult = await getGSTDetails(testGST);
    console.log('GST API result:', !!gstResult);
    console.log('GST data sample:', gstResult ? {
      gstNumber: gstResult.gstNumber,
      legalName: gstResult.legalName,
      hasAddress: !!gstResult.address
    } : 'null');
    
    console.log('✅ GST API test passed');
    
    // Test 5: State extraction
    console.log('5️⃣ Testing state extraction...');
    const stateResult = getStateFromGST(testGST);
    console.log('State result:', stateResult);
    console.log('✅ State extraction test passed');
    
    // Test 6: Full verification simulation
    console.log('6️⃣ Testing full flow...');
    
    const existingSupplier = await Supplier.findOne({ gstNumber: testGST });
    console.log('Existing supplier check:', !!existingSupplier);
    
    if (gstResult) {
      const stateFromGST = getStateFromGST(testGST);
      const addressData = gstResult.address || {};
      
      const autoFillData = {
        gstNumber: gstResult.gstNumber,
        companyName: gstResult.legalName || gstResult.tradeName || '',
        tradeName: gstResult.tradeName || '',
        businessAddress: `${addressData.building || ''} ${addressData.street || ''}`.trim(),
        city: addressData.city || '',
        state: stateFromGST || addressData.state || '',
        pincode: addressData.pincode || '',
        registrationDate: gstResult.registrationDate,
        gstStatus: gstResult.status,
        taxpayerType: gstResult.taxpayerType,
        isVerified: gstResult.isVerified || false,
        lastUpdated: gstResult.lastUpdated
      };
      
      console.log('✅ Full flow test passed');
      console.log('Sample auto-fill data:', {
        companyName: autoFillData.companyName,
        state: autoFillData.state,
        city: autoFillData.city
      });
      
      return res.json({
        success: true,
        message: 'All tests passed!',
        tests: {
          basicResponse: true,
          imports: true,
          database: true,
          gstAPI: true,
          stateExtraction: true,
          fullFlow: true
        },
        sampleData: autoFillData
      });
    } else {
      throw new Error('GST API returned null');
    }
    
  } catch (error) {
    console.error('💥 TEST FAILED at step:', error.message);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5)
    });
    
    return res.status(500).json({
      success: false,
      message: 'Test failed',
      error: error.message,
      errorType: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});
// @route   GET /api/suppliers/base-products
// @desc    Get base products available for pricing (supplier only)
// @access  Private (Supplier)
// Replace the entire base-products route (lines 1192-1268) with this fixed version:

router.get('/base-products', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    // Get base products that supplier hasn't created products from yet
    // The correct logic: exclude base products where supplier has already created 
    // a product that was derived from that base product (not just same name)
    
    // First, find all supplier products that were created from base products
    const supplierProductsFromBase = await Product.find({ 
      supplier: supplier._id,
      isBaseProduct: false,
      createdByAdmin: false,
      // We need to check if this product was created from a base product
      // For now, we'll use a different approach since we don't have sourceBaseProduct field
    }).select('name category subcategory specifications');

    // Get all base products
    const allBaseProducts = await Product.find({
      isBaseProduct: true,
      createdByAdmin: true
    }).select('name description category subcategory images hsnCode specifications');

    // Better filtering logic: exclude base products only if supplier has an EXACT match
    // that was clearly derived from a base product (same name, category, and specifications)
    const availableBaseProducts = allBaseProducts.filter(baseProduct => {
      // Check if supplier has a product that matches this base product exactly
      const hasMatchingProduct = supplierProductsFromBase.some(supplierProduct => {
        return (
          supplierProduct.name === baseProduct.name &&
          supplierProduct.category === baseProduct.category &&
          supplierProduct.subcategory === baseProduct.subcategory &&
          // Additional check: if specs are similar, it's likely from this base product
          JSON.stringify(supplierProduct.specifications) === JSON.stringify(baseProduct.specifications)
        );
      });
      
      return !hasMatchingProduct;
    });

    console.log(`📊 Found ${allBaseProducts.length} total base products`);
    console.log(`📊 Supplier has ${supplierProductsFromBase.length} non-base products`);
    console.log(`📊 Available for pricing: ${availableBaseProducts.length}`);

    res.json({
      success: true,
      data: { baseProducts: availableBaseProducts }
    });

  } catch (error) {
    console.error('❌ Error in base-products route:', error);
    next(error);
  }
});
// @route   POST /api/suppliers/products/:productId/pricing
// @desc    Set pricing for base product (supplier can only set price & delivery time)
// @access  Private (Supplier)
// Replace the POST /products/:productId/pricing route (around lines 1252-1330) with this:

// @route   POST /api/suppliers/products/:baseProductId/pricing
// @desc    Set or update pricing for base product (supplier can only set price & delivery time)
// @access  Private (Supplier)
// Replace the POST /products/:productId/pricing route with this:

router.post('/products/:baseProductId/pricing', auth, authorize('supplier'), [
  param('baseProductId').isMongoId().withMessage('Valid base product ID required'),
  body('pricing.basePrice').isFloat({ min: 0 }).withMessage('Valid base price required'),
  body('pricing.minimumQuantity').isFloat({ min: 0.1 }).withMessage('Valid minimum quantity required'),
  body('deliveryTime').notEmpty().withMessage('Delivery time is required'),
  // Update the validation around line 2106
body('stock.available').isFloat({ min: 0 }).withMessage('Valid total stock quantity required'),
body('stock.reserved').optional().isFloat({ min: 0 }).withMessage('Valid reserved stock quantity required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    const { baseProductId } = req.params;
    const { pricing, deliveryTime, stock } = req.body;

    // Find the base product
    const baseProduct = await Product.findOne({
      _id: baseProductId,
      isBaseProduct: true,
      createdByAdmin: true
    });

    if (!baseProduct) {
      return next(new ErrorHandler('Base product not found', 404));
    }
    if (!baseProduct.category) {
  return res.status(400).json({
    success: false,
    message: 'Base product has invalid category. Please contact admin to fix this product.'
  });
}
if (baseProduct.subcategory) {
  // Replace the validSubcategories object in the validation with this expanded version:

const validSubcategories = {
  'aggregate': [
    'stone_aggregate', 'Stone Aggregate', // Accept both key and display name
    'dust', 'Dust',
    '10_mm_metal', '10 MM Metal',
    '20_mm_metal', '20 MM Metal', 
    '40_mm_metal', '40 MM Metal',
    'gsb', 'GSB',
    'wmm', 'WMM',
    'm_sand', 'M.sand', 'M Sand'
  ],
  'sand': ['river_sand_plastering', 'river_sand'],
  'tmt_steel': ['fe_415', 'fe_500', 'fe_550', 'fe_600'],
  'bricks_blocks': ['solid_blocks', 'hollow_blocks', 'aac_blocks', 'fly_ash_bricks', 'clay_bricks'],
  'cement': ['opc_53', 'opc_43', 'ppc', 'white_cement']
};
  
if (!validSubcategories[baseProduct.category]?.includes(normalizeSubcategory(baseProduct.subcategory, baseProduct.category))) {    return res.status(400).json({
      success: false,
      message: `Base product has invalid subcategory "${baseProduct.subcategory}" for category "${baseProduct.category}". Please contact admin to fix this product.`
    });
  }
}

    // ⭐ KEY FIX: Check if supplier already has a product for this base product
    let supplierProduct = await Product.findOne({
      supplier: supplier._id,
      isBaseProduct: false,
      name: baseProduct.name,
      category: baseProduct.category,
      subcategory: baseProduct.subcategory
    });

    if (supplierProduct) {
      // 🔄 UPDATE existing product instead of creating new one
      console.log('🔄 Updating existing supplier product:', supplierProduct._id);
      
      supplierProduct.pricing = {
        basePrice: pricing.basePrice,
        unit: pricing.unit || baseProduct.pricing.unit,
        minimumQuantity: pricing.minimumQuantity,
        includesGST: pricing.includesGST || false,
        gstRate: pricing.gstRate || 18,
        transportCost: pricing.transportCost || { included: true, costPerKm: 0 }
      };
      
      supplierProduct.stock = {
  available: stock.available,
  reserved: stock.reserved || 0,  // Let supplier set this
  lowStockThreshold: stock.lowStockThreshold || 10
};
      
      supplierProduct.deliveryTime = deliveryTime;
      
      // Reset approval status since pricing changed
      supplierProduct.isApproved = false;
      supplierProduct.isActive = true;
      supplierProduct.approvedAt = null;
      supplierProduct.approvedBy = null;
      
      await supplierProduct.save();
      
      res.json({
        success: true,
        message: 'Pricing updated successfully. Product pending re-approval.',
        data: { product: supplierProduct }
      });
      
    } else {
      // 🆕 CREATE new product only if none exists
      console.log('🆕 Creating new supplier product for base product:', baseProductId);
      
      // Extract supplier-specific data from request body
      const { brand, specifications: reqSpecs } = req.body;
      
      // Build specifications object based on category - ONLY include relevant fields
      const finalSpecifications = {};
      
      // Add category-specific specifications
      if (baseProduct.category === 'tmt_steel') {
        if (reqSpecs?.grade) {
  // Normalize grade format: Fe500 -> FE-500
  let grade = reqSpecs.grade.toString().toUpperCase();
  if (grade.startsWith('FE') && !grade.includes('-')) {
    // Convert FE500 to FE-500
    grade = grade.replace('FE', 'FE-');
  } else if (!grade.startsWith('FE-')) {
    // Convert 500 to FE-500
    grade = `FE-${grade}`;
  }
  finalSpecifications.grade = grade;
}

if (reqSpecs?.diameter) {
  // Normalize diameter format: 20 -> 20mm
  const diameter = reqSpecs.diameter.toString();
  finalSpecifications.diameter = diameter.includes('mm') ? diameter : `${diameter}mm`;
}
      } else if (baseProduct.category === 'cement') {
        if (reqSpecs?.cementGrade) finalSpecifications.cementGrade = reqSpecs.cementGrade;
        if (reqSpecs?.cementType) finalSpecifications.cementType = reqSpecs.cementType;
      } else if (baseProduct.category === 'bricks_blocks') {
        if (reqSpecs?.size) {
          finalSpecifications.size = reqSpecs.size;
        } else {
          // Use a default size if not provided
          finalSpecifications.size = baseProduct.specifications?.size || 'Standard';
        }
      }
      
      // Add general specifications if provided
      if (reqSpecs?.weight) finalSpecifications.weight = reqSpecs.weight;
      if (reqSpecs?.dimensions) finalSpecifications.dimensions = reqSpecs.dimensions;
      
      supplierProduct = new Product({
        name: baseProduct.name,
        description: baseProduct.description,
        category: baseProduct.category,
        subcategory: baseProduct.subcategory,
        // ⭐ KEY FIX: Use filtered specifications instead of copying all
        specifications: finalSpecifications,
        // ⭐ KEY FIX: Only add brand for categories that require it
        ...((() => {
          if (['tmt_steel', 'cement', 'bricks_blocks'].includes(baseProduct.category)) {
            return { 
              brand: brand || baseProduct.brand || 'Generic' 
            };
          }
          return {};
        })()),
        hsnCode: baseProduct.hsnCode,
        images: baseProduct.images,
        supplier: supplier._id,
        pricing: {
          basePrice: pricing.basePrice,
          unit: pricing.unit || baseProduct.pricing?.unit || 'MT',
          minimumQuantity: pricing.minimumQuantity,
          includesGST: pricing.includesGST || false,
          gstRate: pricing.gstRate || 18,
          transportCost: pricing.transportCost || { included: true, costPerKm: 0 }
        },
        stock: {
          available: stock.available,
          reserved: 0,
          lowStockThreshold: stock.lowStockThreshold || 10
        },
        deliveryTime,
        isBaseProduct: false,
        createdByAdmin: false,
        adminUploaded: false,
        supplierCanModify: false,
        isActive: true,
        isApproved: false
      });

      await supplierProduct.save();

      res.status(201).json({
        success: true,
        message: 'Pricing set successfully. Product pending approval.',
        data: { product: supplierProduct }
      });
    }

  } catch (error) {
    next(error);
  }
});
// @route   PUT /api/suppliers/products/:productId/pricing
// @desc    Update pricing for existing supplier product
// @access  Private (Supplier)
router.put('/products/:productId/pricing', auth, authorize('supplier'), [
  param('productId').isMongoId().withMessage('Valid product ID required'),
  body('pricing.basePrice').optional().isFloat({ min: 0 }).withMessage('Valid base price required'),
  body('deliveryTime').optional().notEmpty().withMessage('Delivery time cannot be empty'),
  body('stock.available').optional().isFloat({ min: 0 }).withMessage('Valid stock quantity required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    const { productId } = req.params;
    const { pricing, deliveryTime, stock } = req.body;

    // Find supplier's product
    const product = await Product.findOne({
      _id: productId,
      supplier: supplier._id,
      isBaseProduct: false
    });

    if (!product) {
      return next(new ErrorHandler('Product not found', 404));
    }

    // Update only allowed fields (pricing, delivery time, stock)
    if (pricing) {
      if (pricing.basePrice !== undefined) product.pricing.basePrice = pricing.basePrice;
      if (pricing.minimumQuantity !== undefined) product.pricing.minimumQuantity = pricing.minimumQuantity;
      if (pricing.includesGST !== undefined) product.pricing.includesGST = pricing.includesGST;
      if (pricing.transportCost !== undefined) product.pricing.transportCost = pricing.transportCost;
    }

    if (deliveryTime) {
      product.deliveryTime = deliveryTime;
    }

    if (stock) {
      if (stock.available !== undefined) product.stock.available = stock.available;
      if (stock.lowStockThreshold !== undefined) product.stock.lowStockThreshold = stock.lowStockThreshold;
    }

    await product.save();

    res.json({
      success: true,
      message: 'Pricing updated successfully',
      data: { product }
    });

  } catch (error) {
    next(error);
  }
});

// Add after the PUT /products/:productId/pricing route (around line 2310)

// @route   PUT /api/suppliers/products/:productId/toggle-stock
// @desc    Toggle product stock availability (supplier only)
// @access  Private (Supplier)
router.put('/products/:productId/toggle-stock', 
  auth, 
  authorize('supplier'),
  checkSupplierSuspension,
  async (req, res, next) => {
    try {
      // Find the supplier
      const supplier = await Supplier.findOne({ user: req.user._id });
      if (!supplier) {
        return res.status(404).json({
          success: false,
          message: 'Supplier profile not found'
        });
      }

      // Find the product and verify ownership
      const product = await Product.findOne({
        _id: req.params.productId,
        supplier: supplier._id
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found or you do not have permission to modify it'
        });
      }

      // Toggle the isActive status
      product.isActive = !product.isActive;
      await product.save();

      res.json({
        success: true,
        message: `Product ${product.isActive ? 'activated' : 'deactivated'} successfully`,
        data: {
          productId: product._id,
          name: product.name,
          isActive: product.isActive,
          stockStatus: product.isActive ? 'In Stock' : 'Out of Stock'
        }
      });

    } catch (error) {
      console.error('Toggle stock error:', error);
      next(error);
    }
  }
);
// @route   GET /api/suppliers/stats
// @desc    Get supplier statistics for dashboard
// @access  Private (Supplier)
router.get('/stats', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Calculate stats here
    const stats = {
      totalRevenue: 0,
      totalOrders: 0,
      totalProducts: 0,
      averageOrderValue: 0,
      revenueGrowth: 0,
      ordersGrowth: 0,
      productsGrowth: 0,
      aovGrowth: 0
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/suppliers/analytics/products
// @desc    Get product analytics
// @access  Private (Supplier)
router.get('/analytics/products', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    // Get product performance data
    const products = []; // Implement product analytics logic

    res.json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/suppliers/analytics/sales
// @desc    Get sales analytics
// @access  Private (Supplier)
router.get('/analytics/sales', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    // Get sales analytics data
    // Get sales analytics data
    const { period = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const dailySales = await Order.aggregate([
      {
        $match: {
          supplier: supplier._id,
          createdAt: { $gte: startDate },
          status: { $in: ['confirmed', 'preparing', 'processing', 'dispatched', 'delivered'] }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          sales: { $sum: '$pricing.totalAmount' },
          orders: { $sum: 1 },
          customers: { $addToSet: '$customer' }
        }
      },
      {
        $project: {
          date: '$_id',
          sales: 1,
          orders: 1,
          customers: { $size: '$customers' },
          avgOrderValue: { $divide: ['$sales', '$orders'] },
          _id: 0
        }
      },
      { $sort: { date: 1 } }
    ]);

    // Fill in missing dates with zero values
    const salesData = [];
    for (let i = parseInt(period) - 1; i >= 0; i--) {
      const currentDate = new Date();
      currentDate.setDate(currentDate.getDate() - i);
      const dateStr = currentDate.toISOString().split('T')[0];
      
      const dayData = dailySales.find(d => d.date === dateStr);
      salesData.push({
        date: dateStr,
        sales: dayData ? dayData.sales : 0,
        orders: dayData ? dayData.orders : 0,
        customers: dayData ? dayData.customers : 0,
        avgOrderValue: dayData ? dayData.avgOrderValue : 0
      });
    }
    res.json({ success: true, data: salesData });
  } catch (error) {
    next(error);
  }
});
// Add this new route after the existing routes

// @route   POST /api/suppliers/verify-gst
// @desc    Verify GST number and return business details for auto-fill
// @access  Public
router.post('/verify-gst', [
  body('gstNumber').custom((value) => {
    if (!validateGST(value)) {
      throw new Error('Please provide a valid GST number');
    }
    return true;
  })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid GST number format',
        errors: errors.array()
      });
    }

    const { gstNumber } = req.body;

    // Check if GST is already registered
    const existingSupplier = await Supplier.findOne({ gstNumber });
    if (existingSupplier) {
      return res.status(409).json({
        success: false,
        message: 'This GST number is already registered with another supplier',
        isRegistered: true
      });
    }

    try {
      // Get GST details from API
      const gstDetails = await getGSTDetails(gstNumber);
      
      if (gstDetails) {
        // Extract state from GST number
        const stateCode = gstNumber.substring(0, 2);
        const stateFromGST = getStateFromGST(gstNumber);
        
        // Parse address for auto-fill
        const addressData = gstDetails.address || {};
        
        const autoFillData = {
          gstNumber: gstDetails.gstNumber,
          companyName: gstDetails.legalName || gstDetails.tradeName || '',
          tradeName: gstDetails.tradeName || '',
          businessAddress: `${addressData.building || ''} ${addressData.street || ''}`.trim(),
          city: addressData.city || '',
          state: stateFromGST || addressData.state || '',
          pincode: addressData.pincode || '',
          registrationDate: gstDetails.registrationDate,
          gstStatus: gstDetails.status,
          taxpayerType: gstDetails.taxpayerType,
          isVerified: gstDetails.isVerified || false,
          lastUpdated: gstDetails.lastUpdated
        };

        res.json({
          success: true,
          message: 'GST details retrieved successfully',
          data: autoFillData,
          isValid: true,
          source: gstDetails.apiSource || 'api'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'GST details not found',
          isValid: false
        });
      }
    } catch (gstError) {
      console.error('GST API Error:', gstError);
      res.status(500).json({
        success: false,
        message: 'Unable to verify GST number at the moment. Please try again.',
        error: process.env.NODE_ENV === 'development' ? gstError.message : undefined
      });
    }

  } catch (error) {
    next(error);
  }
});
// Add this test route at the very end of your file, just before module.exports = router;

// TEST ROUTE - Add this temporarily to isolate the issue
router.post('/test-gst-debug', async (req, res) => {
  console.log('🚀 TEST ROUTE STARTED');
  
  try {
    console.log('1️⃣ Testing basic response...');
    
    // Test 1: Basic response
    const basicTest = { step: 1, status: 'Basic route works' };
    console.log('✅ Basic test passed');
    
    // Test 2: Check imports
    console.log('2️⃣ Testing imports...');
    console.log('getGSTDetails function:', typeof getGSTDetails);
    console.log('getStateFromGST function:', typeof getStateFromGST);
    console.log('Supplier model:', typeof Supplier);
    
    if (typeof getGSTDetails !== 'function') {
      throw new Error('getGSTDetails is not a function');
    }
    
    if (typeof getStateFromGST !== 'function') {
      throw new Error('getStateFromGST is not a function');
    }
    
    console.log('✅ Imports test passed');
    
    // Test 3: Database connection
    console.log('3️⃣ Testing database...');
    const testQuery = await Supplier.countDocuments();
    console.log('Database suppliers count:', testQuery);
    console.log('✅ Database test passed');
    
    // Test 4: GST API call
    console.log('4️⃣ Testing GST API...');
    const testGST = '21XVPFY27901Z1';
    console.log('Calling getGSTDetails with:', testGST);
    
    const gstResult = await getGSTDetails(testGST);
    console.log('GST API result:', !!gstResult);
    console.log('GST data sample:', gstResult ? {
      gstNumber: gstResult.gstNumber,
      legalName: gstResult.legalName,
      hasAddress: !!gstResult.address
    } : 'null');
    
    console.log('✅ GST API test passed');
    
    // Test 5: State extraction
    console.log('5️⃣ Testing state extraction...');
    const stateResult = getStateFromGST(testGST);
    console.log('State result:', stateResult);
    console.log('✅ State extraction test passed');
    
    // Test 6: Full verification simulation
    console.log('6️⃣ Testing full flow...');
    
    const existingSupplier = await Supplier.findOne({ gstNumber: testGST });
    console.log('Existing supplier check:', !!existingSupplier);
    
    if (gstResult) {
      const stateFromGST = getStateFromGST(testGST);
      const addressData = gstResult.address || {};
      
      const autoFillData = {
        gstNumber: gstResult.gstNumber,
        companyName: gstResult.legalName || gstResult.tradeName || '',
        tradeName: gstResult.tradeName || '',
        businessAddress: `${addressData.building || ''} ${addressData.street || ''}`.trim(),
        city: addressData.city || '',
        state: stateFromGST || addressData.state || '',
        pincode: addressData.pincode || '',
        registrationDate: gstResult.registrationDate,
        gstStatus: gstResult.status,
        taxpayerType: gstResult.taxpayerType,
        isVerified: gstResult.isVerified || false,
        lastUpdated: gstResult.lastUpdated
      };
      
      console.log('✅ Full flow test passed');
      console.log('Sample auto-fill data:', {
        companyName: autoFillData.companyName,
        state: autoFillData.state,
        city: autoFillData.city
      });
      
      return res.json({
        success: true,
        message: 'All tests passed!',
        tests: {
          basicResponse: true,
          imports: true,
          database: true,
          gstAPI: true,
          stateExtraction: true,
          fullFlow: true
        },
        sampleData: autoFillData
      });
    } else {
      throw new Error('GST API returned null');
    }
    
  } catch (error) {
    console.error('💥 TEST FAILED at step:', error.message);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5)
    });
    
    return res.status(500).json({
      success: false,
      message: 'Test failed',
      error: error.message,
      errorType: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});
// @route   GET /api/suppliers/base-products
// @desc    Get base products available for pricing (supplier only)
// @access  Private (Supplier)
// Replace the entire base-products route (lines 1192-1268) with this fixed version:

router.get('/base-products', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    // Get base products that supplier hasn't created products from yet
    // The correct logic: exclude base products where supplier has already created 
    // a product that was derived from that base product (not just same name)
    
    // First, find all supplier products that were created from base products
    const supplierProductsFromBase = await Product.find({ 
      supplier: supplier._id,
      isBaseProduct: false,
      createdByAdmin: false,
      // We need to check if this product was created from a base product
      // For now, we'll use a different approach since we don't have sourceBaseProduct field
    }).select('name category subcategory specifications');

    // Get all base products
    const allBaseProducts = await Product.find({
      isBaseProduct: true,
      createdByAdmin: true
    }).select('name description category subcategory images hsnCode specifications');

    // Better filtering logic: exclude base products only if supplier has an EXACT match
    // that was clearly derived from a base product (same name, category, and specifications)
    const availableBaseProducts = allBaseProducts.filter(baseProduct => {
      // Check if supplier has a product that matches this base product exactly
      const hasMatchingProduct = supplierProductsFromBase.some(supplierProduct => {
        return (
          supplierProduct.name === baseProduct.name &&
          supplierProduct.category === baseProduct.category &&
          supplierProduct.subcategory === baseProduct.subcategory &&
          // Additional check: if specs are similar, it's likely from this base product
          JSON.stringify(supplierProduct.specifications) === JSON.stringify(baseProduct.specifications)
        );
      });
      
      return !hasMatchingProduct;
    });

    console.log(`📊 Found ${allBaseProducts.length} total base products`);
    console.log(`📊 Supplier has ${supplierProductsFromBase.length} non-base products`);
    console.log(`📊 Available for pricing: ${availableBaseProducts.length}`);

    res.json({
      success: true,
      data: { baseProducts: availableBaseProducts }
    });

  } catch (error) {
    console.error('❌ Error in base-products route:', error);
    next(error);
  }
});
// @route   POST /api/suppliers/products/:productId/pricing
// @desc    Set pricing for base product (supplier can only set price & delivery time)
// @access  Private (Supplier)
// Replace the POST /products/:productId/pricing route (around lines 1252-1330) with this:

// @route   POST /api/suppliers/products/:baseProductId/pricing
// @desc    Set or update pricing for base product (supplier can only set price & delivery time)
// @access  Private (Supplier)
// Replace the POST /products/:productId/pricing route with this:

router.post('/products/:baseProductId/pricing', auth, authorize('supplier'), [
  param('baseProductId').isMongoId().withMessage('Valid base product ID required'),
  body('pricing.basePrice').isFloat({ min: 0 }).withMessage('Valid base price required'),
  body('pricing.minimumQuantity').isFloat({ min: 0.1 }).withMessage('Valid minimum quantity required'),
  body('deliveryTime').notEmpty().withMessage('Delivery time is required'),
  body('stock.available').isFloat({ min: 0 }).withMessage('Valid stock quantity required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    const { baseProductId } = req.params;
    const { pricing, deliveryTime, stock } = req.body;

    // Find the base product
    const baseProduct = await Product.findOne({
      _id: baseProductId,
      isBaseProduct: true,
      createdByAdmin: true
    });

    if (!baseProduct) {
      return next(new ErrorHandler('Base product not found', 404));
    }
if (baseProduct.subcategory) {
  const validSubcategories = {
    'aggregate': ['stone_aggregate', 'dust', '10_mm_metal', '20_mm_metal', '40_mm_metal', 'gsb', 'wmm', 'm_sand'],
    'sand': ['river_sand_plastering', 'river_sand'],
    'tmt_steel': ['fe_415', 'fe_500', 'fe_550', 'fe_600'],
    'bricks_blocks': ['solid_blocks', 'hollow_blocks', 'aac_blocks', 'fly_ash_bricks', 'clay_bricks'],
    'cement': ['opc_53', 'opc_43', 'ppc', 'white_cement']
  };
  
if (!validSubcategories[baseProduct.category]?.includes(normalizeSubcategory(baseProduct.subcategory, baseProduct.category))) {
      return res.status(400).json({
      success: false,
      message: `Base product has invalid subcategory "${baseProduct.subcategory}" for category "${baseProduct.category}". Please contact admin to fix this product.`
    });
  }
}
    // ⭐ KEY FIX: Check if supplier already has a product for this base product
    let supplierProduct = await Product.findOne({
      supplier: supplier._id,
      isBaseProduct: false,
      name: baseProduct.name,
      category: baseProduct.category,
      subcategory: baseProduct.subcategory
    });

    if (supplierProduct) {
      // 🔄 UPDATE existing product instead of creating new one
      console.log('🔄 Updating existing supplier product:', supplierProduct._id);
      
      supplierProduct.pricing = {
        basePrice: pricing.basePrice,
        unit: pricing.unit || baseProduct.pricing.unit,
        minimumQuantity: pricing.minimumQuantity,
        includesGST: pricing.includesGST || false,
        gstRate: pricing.gstRate || 18,
        transportCost: pricing.transportCost || { included: true, costPerKm: 0 }
      };
      
      supplierProduct.stock = {
        available: stock.available,
        reserved: supplierProduct.stock?.reserved || 0,
        lowStockThreshold: stock.lowStockThreshold || 10
      };
      
      supplierProduct.deliveryTime = deliveryTime;
      
      // Reset approval status since pricing changed
      supplierProduct.isApproved = false;
      supplierProduct.isActive = true;
      supplierProduct.approvedAt = null;
      supplierProduct.approvedBy = null;
      
      await supplierProduct.save();
      
      res.json({
        success: true,
        message: 'Pricing updated successfully. Product pending re-approval.',
        data: { product: supplierProduct }
      });
      
    } else {
      // 🆕 CREATE new product only if none exists
      console.log('🆕 Creating new supplier product for base product:', baseProductId);
      
      // Extract supplier-specific data from request body
      const { brand, specifications: reqSpecs } = req.body;
      
      // Build specifications object based on category - ONLY include relevant fields
      const finalSpecifications = {};
      
      // Add category-specific specifications
      if (baseProduct.category === 'tmt_steel') {
        if (reqSpecs?.grade) finalSpecifications.grade = reqSpecs.grade;
        if (reqSpecs?.diameter) finalSpecifications.diameter = reqSpecs.diameter;
      } else if (baseProduct.category === 'cement') {
        if (reqSpecs?.cementGrade) finalSpecifications.cementGrade = reqSpecs.cementGrade;
        if (reqSpecs?.cementType) finalSpecifications.cementType = reqSpecs.cementType;
      } else if (baseProduct.category === 'bricks_blocks') {
        if (reqSpecs?.size) finalSpecifications.size = reqSpecs.size;
      }
      
      // Add general specifications if provided
      if (reqSpecs?.weight) finalSpecifications.weight = reqSpecs.weight;
      if (reqSpecs?.dimensions) finalSpecifications.dimensions = reqSpecs.dimensions;
      
      supplierProduct = new Product({
        name: baseProduct.name,
        description: baseProduct.description,
        category: baseProduct.category,
        subcategory: baseProduct.subcategory,
        // ⭐ KEY FIX: Use filtered specifications instead of copying all
        specifications: finalSpecifications,
        // ⭐ KEY FIX: Only add brand for categories that require it
        ...(brand && ['tmt_steel', 'cement', 'bricks_blocks'].includes(baseProduct.category) && { brand }),
        hsnCode: baseProduct.hsnCode,
        images: baseProduct.images,
        supplier: supplier._id,
        pricing: {
          basePrice: pricing.basePrice,
          unit: pricing.unit || baseProduct.pricing?.unit || 'MT',
          minimumQuantity: pricing.minimumQuantity,
          includesGST: pricing.includesGST || false,
          gstRate: pricing.gstRate || 18,
          transportCost: pricing.transportCost || { included: true, costPerKm: 0 }
        },
        stock: {
          available: stock.available,
          reserved: 0,
          lowStockThreshold: stock.lowStockThreshold || 10
        },
        deliveryTime,
        isBaseProduct: false,
        createdByAdmin: false,
        adminUploaded: false,
        supplierCanModify: false,
        isActive: true,
        isApproved: false
      });

      await supplierProduct.save();

      res.status(201).json({
        success: true,
        message: 'Pricing set successfully. Product pending approval.',
        data: { product: supplierProduct }
      });
    }

  } catch (error) {
    next(error);
  }
});
// @route   PUT /api/suppliers/products/:productId/pricing
// @desc    Update pricing for existing supplier product
// @access  Private (Supplier)
router.put('/products/:productId/pricing', auth, authorize('supplier'), [
  param('productId').isMongoId().withMessage('Valid product ID required'),
  body('pricing.basePrice').optional().isFloat({ min: 0 }).withMessage('Valid base price required'),
  body('deliveryTime').optional().notEmpty().withMessage('Delivery time cannot be empty'),
  body('stock.available').optional().isFloat({ min: 0 }).withMessage('Valid stock quantity required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    const { productId } = req.params;
    const { pricing, deliveryTime, stock } = req.body;

    // Find supplier's product
    const product = await Product.findOne({
      _id: productId,
      supplier: supplier._id,
      isBaseProduct: false
    });

    if (!product) {
      return next(new ErrorHandler('Product not found', 404));
    }

    // Update only allowed fields (pricing, delivery time, stock)
    if (pricing) {
      if (pricing.basePrice !== undefined) product.pricing.basePrice = pricing.basePrice;
      if (pricing.minimumQuantity !== undefined) product.pricing.minimumQuantity = pricing.minimumQuantity;
      if (pricing.includesGST !== undefined) product.pricing.includesGST = pricing.includesGST;
      if (pricing.transportCost !== undefined) product.pricing.transportCost = pricing.transportCost;
    }

    if (deliveryTime) {
      product.deliveryTime = deliveryTime;
    }

    if (stock) {
      if (stock.available !== undefined) product.stock.available = stock.available;
      if (stock.lowStockThreshold !== undefined) product.stock.lowStockThreshold = stock.lowStockThreshold;
    }

    await product.save();

    res.json({
      success: true,
      message: 'Pricing updated successfully',
      data: { product }
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
