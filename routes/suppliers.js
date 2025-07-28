const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const Supplier = require('../models/Supplier');
const User = require('../models/User');
const Product = require('../models/Product');
const { ErrorHandler } = require('../utils/errorHandler');
const { validateGST, validatePAN, validateIFSC, validateUPI } = require('../utils/validators');
const { sendEmail } = require('../utils/notifications');
const { getGSTDetails } = require('../utils/gstAPI');
const router = express.Router();
// Add this right after line 11 (after const router = express.Router();)

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
      
      // Supplier fields
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
    const gstExists = await Supplier.findOne({ gstNumber });
    if (gstExists) {
      return res.status(400).json({
        success: false,
        message: 'GST number already registered'
      });
    }

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
router.get('/profile', auth, authorize('supplier'), async (req, res, next) => {
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
router.put('/profile', auth, authorize('supplier'), [
  body('contactPersonName').optional().trim().isLength({ min: 2 }).withMessage('Contact person name must be at least 2 characters'),
  body('contactPersonNumber').optional().matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid contact number'),
  body('businessNumber').optional().matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid business number'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('bankDetails.bankName').optional().notEmpty().withMessage('Bank name cannot be empty'),
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
      'email'
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
router.put('/transport-rates', auth, authorize('supplier'), [
  body('upTo5km.costPerKm').isFloat({ min: 0 }).withMessage('Cost per km must be positive'),
  body('upTo5km.estimatedDeliveryTime').notEmpty().withMessage('Estimated delivery time is required'),
  body('upTo10km.costPerKm').isFloat({ min: 0 }).withMessage('Cost per km must be positive'),
  body('upTo10km.estimatedDeliveryTime').notEmpty().withMessage('Estimated delivery time is required'),
  body('upTo20km.costPerKm').isFloat({ min: 0 }).withMessage('Cost per km must be positive'),
  body('upTo20km.estimatedDeliveryTime').notEmpty().withMessage('Estimated delivery time is required'),
  body('above20km.costPerKm').isFloat({ min: 0 }).withMessage('Cost per km must be positive'),
  body('above20km.estimatedDeliveryTime').notEmpty().withMessage('Estimated delivery time is required')
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

    if (!supplier.isApproved) {
      return next(new ErrorHandler('Supplier account not approved yet', 403));
    }

    const { upTo5km, upTo10km, upTo20km, above20km } = req.body;

    supplier.transportRates = {
      upTo5km,
      upTo10km,
      upTo20km,
      above20km
    };

    await supplier.save();

    res.json({
      success: true,
      message: 'Transport rates updated successfully',
      data: { transportRates: supplier.transportRates }
    });

  } catch (error) {
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
router.get('/dashboard', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
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
    const salesData = [];
    for (let i = parseInt(days); i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      salesData.push({
        date: date.toISOString().split('T')[0],
        revenue: Math.floor(Math.random() * 50000) + 10000, // Mock data
        orders: Math.floor(Math.random() * 10) + 1 // Mock data
      });
    }

    // Calculate growth metrics (mock data - replace with actual calculations)
    const previousPeriodRevenue = 150000; // Mock previous period
    const currentRevenue = supplier.totalRevenue || 0;
    const revenueGrowth = previousPeriodRevenue > 0 
      ? ((currentRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100 
      : 0;

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
        totalOrders: supplier.totalOrders || 0,
        totalProducts: productStatsData.total,
        averageOrderValue: supplier.totalOrders > 0 ? currentRevenue / supplier.totalOrders : 0,
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

    const supplier = await Supplier.findOne({
      $or: [{ _id: supplierId }, { supplierId }],
      isApproved: true,
      isActive: true
    }).select('companyName dispatchLocation rating totalOrders transportRates createdAt');

    if (!supplier) {
      return next(new ErrorHandler('Supplier not found', 404));
    }

    // Get supplier's products
    const products = await Product.find({
      supplier: supplier._id,
      isActive: true,
      isApproved: true
    }).select('name category subcategory pricing.basePrice pricing.unit averageRating totalReviews images');

    // Group products by category
    const productsByCategory = products.reduce((acc, product) => {
      if (!acc[product.category]) {
        acc[product.category] = [];
      }
      acc[product.category].push(product);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        supplier,
        products: productsByCategory,
        totalProducts: products.length,
        categories: Object.keys(productsByCategory)
      }
    });

  } catch (error) {
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
    const salesData = []; // Implement sales analytics logic

    res.json({ success: true, data: salesData });
  } catch (error) {
    next(error);
  }
});
module.exports = router;
