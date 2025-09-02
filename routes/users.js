const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const User = require('../models/User');
const { ErrorHandler } = require('../utils/errorHandler');
const { sendWelcomeEmail } = require('../utils/notifications');
const geocodingService = require('../utils/geocoding');
const router = express.Router();
const ReportGenerator = require('../utils/reports');
// @route   GET /api/users/profile
// @desc    Get user profile with completion status
// @access  Private
router.get('/profile', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    const profileData = {
      ...user.toObject(),
      profileCompletionPercentage: user.getProfileCompletionPercentage(),
      canPlaceOrders: user.canPlaceOrders()
    };

    res.json({
      success: true,
      data: { user: profileData }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('phoneNumber').optional().matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid Indian phone number'),
  body('gstNumber').optional().custom((value) => {
    if (value && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(value)) {
      throw new Error('Please provide a valid GST number');
    }
    return true;
  }),
  body('customerType').optional().isIn(['house_owner', 'mason', 'builder_contractor', 'others']).withMessage('Invalid customer type')
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

    const { name, phoneNumber, gstNumber, customerType } = req.body;
    
    const user = await User.findById(req.user._id);
    
    // Check if phone number is being changed and if it already exists
    if (phoneNumber && phoneNumber !== user.phoneNumber) {
      const existingUser = await User.findOne({ phoneNumber, _id: { $ne: user._id } });
      if (existingUser) {
        return next(new ErrorHandler('Phone number already exists', 400));
      }
      user.phoneNumber = phoneNumber;
      user.phoneVerified = false; // Need to verify new phone number
    }
    
    if (name) user.name = name;
    if (gstNumber !== undefined) user.gstNumber = gstNumber;
    if (customerType) user.customerType = customerType;
    
    await user.save();
    
    const userResponse = user.toObject();
    delete userResponse.password;
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { 
        user: {
          ...userResponse,
          profileCompletionPercentage: user.getProfileCompletionPercentage()
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/users/addresses
// @desc    Add new address
// @access  Private
router.post('/addresses', auth, [
  body('address').notEmpty().withMessage('Address is required'),
  body('city').notEmpty().withMessage('City is required'),
  body('state').notEmpty().withMessage('State is required'),
  body('pincode').matches(/^[1-9][0-9]{5}$/).withMessage('Please provide a valid pincode'),
  body('type').optional().isIn(['home', 'work', 'other']).withMessage('Invalid address type'),
  body('coordinates.latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
  body('coordinates.longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required')
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

    const { address, city, state, pincode, type, isDefault, coordinates } = req.body;
    
    console.log('📍 Adding address with coordinate detection...');
    console.log('Address details:', { address, city, state, pincode });

    const user = await User.findById(req.user._id);
    
    // If this is set as default, remove default from other addresses
    if (isDefault) {
      user.addresses.forEach(addr => {
        addr.isDefault = false;
      });
    }

    let finalCoordinates = {};
    let geocodingInfo = null;

    try {
      // Priority 1: Use manual coordinates if provided (from frontend GPS)
      if (coordinates && coordinates.latitude && coordinates.longitude) {
        if (geocodingService.validateCoordinates(coordinates.latitude, coordinates.longitude)) {
          finalCoordinates = {
            latitude: coordinates.latitude,
            longitude: coordinates.longitude
          };
          geocodingInfo = {
            source: 'manual',
            method: 'user_provided'
          };
          console.log('✅ Using manual coordinates:', finalCoordinates);
        }
      }

      // Priority 2: Geocode the address automatically
      if (!finalCoordinates.latitude) {
        console.log('🔍 Auto-geocoding address...');
        const addressComponents = { address, city, state, pincode };
        const result = await geocodingService.getCoordinates(addressComponents);
        
        if (result && result.latitude && result.longitude) {
          finalCoordinates = {
            latitude: result.latitude,
            longitude: result.longitude
          };
          geocodingInfo = {
            source: result.source,
            method: 'geocoded',
            formattedAddress: result.formattedAddress,
            geocodedAt: new Date()
          };
          console.log(`✅ Address geocoded: [${result.latitude}, ${result.longitude}] (${result.source})`);
        }
      }
    } catch (geocodeError) {
      console.error('❌ Geocoding failed:', geocodeError.message);
      // Continue without coordinates - better than failing the entire request
    }
    
    // Create new address with coordinates
    const newAddress = {
      address,
      city,
      state,
      pincode,
      type: type || 'home',
      isDefault: isDefault || user.addresses.length === 0,
      coordinates: finalCoordinates,
      geocodingInfo
    };
    
    user.addresses.push(newAddress);
    await user.save();
    
    console.log(`✅ Address added successfully for ${user.name}`);
    console.log('Final coordinates stored:', finalCoordinates);
    
    res.status(201).json({
      success: true,
      message: 'Address added successfully',
      data: { 
        address: user.addresses[user.addresses.length - 1],
        geocoding: geocodingInfo
      }
    });
  } catch (error) {
    console.error('❌ Error adding address:', error);
    next(error);
  }
});

// @route   PUT /api/users/addresses/:addressId
// @desc    Update address
// @access  Private
router.put('/addresses/:addressId', auth, [
  body('address').optional().notEmpty().withMessage('Address cannot be empty'),
  body('city').optional().notEmpty().withMessage('City cannot be empty'),
  body('state').optional().notEmpty().withMessage('State cannot be empty'),
  body('pincode').optional().matches(/^[1-9][0-9]{5}$/).withMessage('Please provide a valid pincode'),
  body('type').optional().isIn(['home', 'work', 'other']).withMessage('Invalid address type'),
  body('coordinates.latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
  body('coordinates.longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required')
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

    const { addressId } = req.params;
    const { address, city, state, pincode, type, isDefault, coordinates } = req.body;
    
    console.log(`🔍 [ADDRESS UPDATE] User: ${req.user._id}, AddressID: ${addressId}`);
    console.log(`📝 [ADDRESS UPDATE] Data:`, { address, city, state, pincode, type, isDefault });
    
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const addressToUpdate = user.addresses.id(addressId);
    
    if (!addressToUpdate) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }
    
    console.log(`✅ [ADDRESS UPDATE] Found address: ${addressToUpdate.address}`);
    
    // Store old address for comparison
    const oldAddress = {
      address: addressToUpdate.address,
      city: addressToUpdate.city,
      state: addressToUpdate.state,
      pincode: addressToUpdate.pincode
    };

    // If setting as default, remove default from other addresses
    if (isDefault) {
      user.addresses.forEach(addr => {
        if (addr._id.toString() !== addressId) {
          addr.isDefault = false;
        }
      });
      console.log(`🔄 [ADDRESS UPDATE] Set as default, cleared other defaults`);
    }

    // Update address fields
    if (address !== undefined) addressToUpdate.address = address;
    if (city !== undefined) addressToUpdate.city = city;
    if (state !== undefined) addressToUpdate.state = state;
    if (pincode !== undefined) addressToUpdate.pincode = pincode;
    if (type !== undefined) addressToUpdate.type = type;
    if (isDefault !== undefined) addressToUpdate.isDefault = isDefault;

    // Check if address components changed to determine if we need to re-geocode
    const addressChanged = (
      oldAddress.address !== addressToUpdate.address ||
      oldAddress.city !== addressToUpdate.city ||
      oldAddress.state !== addressToUpdate.state ||
      oldAddress.pincode !== addressToUpdate.pincode
    );

    let geocodingInfo = null;
    let finalCoordinates = addressToUpdate.coordinates || {};

    // Update coordinates if address changed or new coordinates provided
    if (addressChanged || coordinates) {
      try {
        // Priority 1: Use manual coordinates if provided
        if (coordinates && coordinates.latitude && coordinates.longitude) {
          if (geocodingService.validateCoordinates(coordinates.latitude, coordinates.longitude)) {
            finalCoordinates = {
              latitude: coordinates.latitude,
              longitude: coordinates.longitude
            };
            geocodingInfo = {
              source: 'manual',
              method: 'user_provided',
              updatedAt: new Date()
            };
            console.log('✅ Using updated manual coordinates:', finalCoordinates);
          }
        } 
        // Priority 2: Re-geocode if address changed
        else if (addressChanged) {
          console.log('🔍 Address changed, re-geocoding...');
          
          const addressComponents = {
            address: addressToUpdate.address,
            city: addressToUpdate.city,
            state: addressToUpdate.state,
            pincode: addressToUpdate.pincode
          };

          const result = await geocodingService.getCoordinates(addressComponents);
          
          if (result && result.latitude && result.longitude) {
            finalCoordinates = {
              latitude: result.latitude,
              longitude: result.longitude
            };
            geocodingInfo = {
              source: result.source,
              method: 'geocoded',
              formattedAddress: result.formattedAddress,
              geocodedAt: new Date()
            };
            console.log(`✅ Re-geocoded: [${result.latitude}, ${result.longitude}] (${result.source})`);
          } else {
            console.log('⚠️ Re-geocoding failed, keeping existing coordinates');
          }
        }
      } catch (geocodeError) {
        console.error('❌ Geocoding error:', geocodeError.message);
        // Continue with existing coordinates
      }
    }

    // Update coordinates and geocoding info
    addressToUpdate.coordinates = finalCoordinates;
    if (geocodingInfo) {
      addressToUpdate.geocodingInfo = geocodingInfo;
    }
    
    await user.save();
    
    console.log(`✅ [ADDRESS UPDATE] Successfully updated address for ${user.name}`);
    console.log('Updated coordinates:', finalCoordinates);

    res.json({
      success: true,
      message: 'Address updated successfully',
      data: { 
        address: addressToUpdate,
        geocoding: geocodingInfo
      }
    });
  } catch (error) {
    console.error(`❌ [ADDRESS UPDATE] Error:`, error);
    next(error);
  }
});

// @route   PUT /api/users/addresses/:addressId/geocode
// @desc    Manually geocode/refresh coordinates for an existing address
// @access  Private
router.put('/addresses/:addressId/geocode', auth, async (req, res, next) => {
  try {
    const { addressId } = req.params;
    
    console.log(`🔍 [MANUAL GEOCODE] User: ${req.user._id}, AddressID: ${addressId}`);
    
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const addressToGeocode = user.addresses.id(addressId);
    
    if (!addressToGeocode) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }
    
    console.log(`📍 [MANUAL GEOCODE] Geocoding: ${addressToGeocode.address}, ${addressToGeocode.city}`);

    try {
      const addressComponents = {
        address: addressToGeocode.address,
        city: addressToGeocode.city,
        state: addressToGeocode.state,
        pincode: addressToGeocode.pincode
      };

      const result = await geocodingService.getCoordinates(addressComponents);
      
      if (result && result.latitude && result.longitude) {
        addressToGeocode.coordinates = {
          latitude: result.latitude,
          longitude: result.longitude
        };
        addressToGeocode.geocodingInfo = {
          source: result.source,
          method: 'manual_refresh',
          formattedAddress: result.formattedAddress,
          geocodedAt: new Date()
        };
        
        await user.save();
        
        console.log(`✅ [MANUAL GEOCODE] Success: [${result.latitude}, ${result.longitude}] (${result.source})`);

        res.json({
          success: true,
          message: 'Address coordinates updated successfully',
          data: {
            address: addressToGeocode,
            geocoding: addressToGeocode.geocodingInfo
          }
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Failed to geocode address'
        });
      }
    } catch (geocodeError) {
      console.error('❌ [MANUAL GEOCODE] Error:', geocodeError.message);
      res.status(400).json({
        success: false,
        message: 'Geocoding failed',
        error: geocodeError.message
      });
    }

  } catch (error) {
    console.error(`❌ [MANUAL GEOCODE] Error:`, error);
    next(error);
  }
});

// @route   DELETE /api/users/addresses/:addressId
// @desc    Delete address
// @access  Private
router.delete('/addresses/:addressId', auth, async (req, res, next) => {
  try {
    const { addressId } = req.params;
    
    const user = await User.findById(req.user._id);
    const addressToDelete = user.addresses.id(addressId);
    
    if (!addressToDelete) {
      return next(new ErrorHandler('Address not found', 404));
    }
    
    // If deleting default address and there are other addresses, make first one default
    const wasDefault = addressToDelete.isDefault;
    
    user.addresses.pull(addressId);
    
    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Address deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/users/addresses
// @desc    Get all user addresses
// @access  Private
router.get('/addresses', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    
    res.json({
      success: true,
      data: { addresses: user.addresses }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/users/preferences
// @desc    Update user preferences (Enhanced for comprehensive settings)
// @access  Private
router.put('/preferences', auth, [
  body('language').optional().isIn(['english', 'hindi', 'telugu']).withMessage('Invalid language'),
  body('notifications').optional().isObject().withMessage('Notifications must be an object'),
  body('privacy').optional().isObject().withMessage('Privacy must be an object'),
  body('currency').optional().isIn(['INR', 'USD']).withMessage('Invalid currency')
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

    const { language, notifications, privacy, currency } = req.body;
    
    const user = await User.findById(req.user._id);
    
    // Update language preference
    if (language) {
      user.preferences.language = language;
    }
    
    // Update currency preference
    if (currency) {
      user.preferences.currency = currency;
    }
    
    // Update notification preferences
    if (notifications) {
      Object.keys(notifications).forEach(key => {
        if (notifications[key] !== undefined) {
          if (user.preferences.notifications[key] !== undefined) {
            user.preferences.notifications[key] = notifications[key];
          }
        }
      });
    }
    
    // Update privacy preferences
    if (privacy) {
      Object.keys(privacy).forEach(key => {
        if (privacy[key] !== undefined) {
          if (user.preferences.privacy[key] !== undefined) {
            user.preferences.privacy[key] = privacy[key];
          }
        }
      });
    }
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: { 
        preferences: user.preferences 
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/users/dashboard
// @desc    Get user dashboard data
// @access  Private
// Replace the existing dashboard route with this enhanced version

// @route   GET /api/users/dashboard
// @desc    Get user dashboard data with analytics
// @access  Private
router.get('/dashboard', auth, async (req, res, next) => {
  try {
    const { timeRange = 'all' } = req.query;
    
    const user = await User.findById(req.user._id).select('-password');
    
    // Get actual orders from database
    const Order = require('../models/Order');
    
    let orderFilter = { customer: req.user._id };
    
    // Add time range filter
    if (timeRange !== 'all') {
      const now = new Date();
      let startDate;
      
      switch (timeRange) {
        case '1month':
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          break;
        case '3months':
          startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
          break;
        case '6months':
          startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
          break;
        case '1year':
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        default:
          startDate = null;
      }
      
      if (startDate) {
        orderFilter.createdAt = { $gte: startDate };
      }
    }

    // Get recent orders
    const recentOrders = await Order.find(orderFilter)
      .populate('supplier', 'name businessName')
      .sort({ createdAt: -1 })
      .limit(5);

    // Calculate real statistics
    const allOrders = await Order.find(orderFilter);
    const totalSpent = allOrders.reduce((sum, order) => sum + (order.pricing?.totalAmount || 0), 0);
    const completedOrders = allOrders.filter(order => order.status === 'delivered');
    const activeOrders = allOrders.filter(order => !['delivered', 'cancelled'].includes(order.status));
    
    // Update user model with real data (optional)
    if (timeRange === 'all') {
      user.orderCount = allOrders.length;
      user.totalOrderValue = totalSpent;
      await user.save();
    }
    
    // Calculate membership progress
    let nextTierRequirement = null;
    if (user.membershipTier === 'silver') {
      nextTierRequirement = {
        tier: 'gold',
        ordersNeeded: Math.max(0, 20 - allOrders.length),
        spendingNeeded: Math.max(0, 50000 - totalSpent),
        currentOrders: allOrders.length,
        currentSpending: totalSpent
      };
    } else if (user.membershipTier === 'gold') {
      nextTierRequirement = {
        tier: 'platinum',
        ordersNeeded: Math.max(0, 50 - allOrders.length),
        spendingNeeded: Math.max(0, 200000 - totalSpent),
        currentOrders: allOrders.length,
        currentSpending: totalSpent
      };
    }
    
    const dashboardData = {
      user: {
        name: user.name,
        customerId: user.customerId,
        membershipTier: user.membershipTier,
        aggreCoins: user.aggreCoins,
        profileCompletionPercentage: user.getProfileCompletionPercentage()
      },
      stats: {
        totalOrders: allOrders.length,
        totalSpent: totalSpent,
        activeOrders: activeOrders.length,
        completedOrders: completedOrders.length,
        averageOrderValue: allOrders.length > 0 ? totalSpent / allOrders.length : 0
      },
      membership: {
        current: user.membershipTier,
        nextTier: nextTierRequirement,
        benefits: user.membershipBenefits
      },
      recentOrders: recentOrders.map(order => ({
        orderId: order.orderId,
        totalAmount: order.pricing?.totalAmount || 0,
        status: order.status,
        createdAt: order.createdAt,
        supplier: order.supplier?.businessName || order.supplier?.name
      })),
      notifications: {
        unread: 0 // Placeholder
      },
      timeRange
    };
    
    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    next(error);
  }
});
// @route   POST /api/users/deactivate
// @desc    Deactivate user account
// @access  Private
router.post('/deactivate', auth, [
  body('reason').optional().trim().isLength({ min: 10 }).withMessage('Reason must be at least 10 characters'),
  body('password').notEmpty().withMessage('Password is required for account deactivation')
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

    const { reason, password } = req.body;
    
    const user = await User.findById(req.user._id).select('+password');
    
    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return next(new ErrorHandler('Invalid password', 400));
    }
    
    // Deactivate account
    user.isActive = false;
    user.deactivatedAt = new Date();
    user.deactivationReason = reason;
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Account deactivated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/users/request-data-export
// @desc    Request user data export
// @access  Private
// @route   POST /api/users/request-data-export
// @desc    Instant user data export
// @access  Private
// @route   POST /api/users/request-data-export
// @desc    Instant user data export as PDF
// @access  Private
router.post('/request-data-export', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    
    // Generate PDF using existing ReportGenerator
    const pdfBuffer = await ReportGenerator.generateUserDataPDF(user);
    
    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${user.role}-data-${Date.now()}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    // Send PDF buffer
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('PDF export error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export data as PDF',
      error: error.message
    });
  }
});

// @route   GET /api/users/data-export-status
// @desc    Get data export request status
// @access  Private
router.get('/data-export-status', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    
    const exportRequests = user.dataExportRequests
      .sort({ requestedAt: -1 })
      .slice(0, 5); // Get last 5 requests
    
    res.json({
      success: true,
      data: { exportRequests }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/users/membership-benefits
// @desc    Get membership benefits for current user
// @access  Private
router.get('/membership-benefits', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    
    const benefits = {
      current: user.membershipBenefits,
      tier: user.membershipTier,
      nextTierBenefits: null
    };
    
    // Get next tier benefits
    if (user.membershipTier === 'silver') {
      benefits.nextTierBenefits = {
        tier: 'gold',
        discountPercentage: 5,
        freeDeliveryThreshold: 1500,
        aggreCoinsMultiplier: 1.5,
        prioritySupport: true
      };
    } else if (user.membershipTier === 'gold') {
      benefits.nextTierBenefits = {
        tier: 'platinum',
        discountPercentage: 10,
        freeDeliveryThreshold: 1000,
        aggreCoinsMultiplier: 2,
        prioritySupport: true
      };
    }
    
    res.json({
      success: true,
      data: benefits
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
