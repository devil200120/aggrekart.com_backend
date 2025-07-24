const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const User = require('../models/User');
const { ErrorHandler } = require('../utils/errorHandler');
const { sendWelcomeEmail } = require('../utils/notifications');
const router = express.Router();

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
  body('type').optional().isIn(['home', 'work', 'other']).withMessage('Invalid address type')
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

    const { address, city, state, pincode, type, isDefault } = req.body;
    
    const user = await User.findById(req.user._id);
    
    // If this is set as default, remove default from other addresses
    if (isDefault) {
      user.addresses.forEach(addr => {
        addr.isDefault = false;
      });
    }
    
    // If this is the first address, make it default
    const newAddress = {
      address,
      city,
      state,
      pincode,
      type: type || 'home',
      isDefault: isDefault || user.addresses.length === 0
    };
    
    user.addresses.push(newAddress);
    await user.save();
    
    res.status(201).json({
      success: true,
      message: 'Address added successfully',
      data: { 
        address: user.addresses[user.addresses.length - 1]
      }
    });
  } catch (error) {
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
  body('type').optional().isIn(['home', 'work', 'other']).withMessage('Invalid address type')
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
    const { address, city, state, pincode, type, isDefault } = req.body;
    
    const user = await User.findById(req.user._id);
    const addressToUpdate = user.addresses.id(addressId);
    
    if (!addressToUpdate) {
      return next(new ErrorHandler('Address not found', 404));
    }
    
    // If setting as default, remove default from other addresses
    if (isDefault) {
      user.addresses.forEach(addr => {
        if (addr._id.toString() !== addressId) {
          addr.isDefault = false;
        }
      });
    }
    
    // Update address fields
    if (address) addressToUpdate.address = address;
    if (city) addressToUpdate.city = city;
    if (state) addressToUpdate.state = state;
    if (pincode) addressToUpdate.pincode = pincode;
    if (type) addressToUpdate.type = type;
    if (isDefault !== undefined) addressToUpdate.isDefault = isDefault;
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Address updated successfully',
      data: { address: addressToUpdate }
    });
  } catch (error) {
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
router.get('/dashboard', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    // Get recent orders (placeholder for now)
    const recentOrders = [];
    
    // Calculate membership progress
    let nextTierRequirement = null;
    if (user.membershipTier === 'silver') {
      nextTierRequirement = {
        tier: 'gold',
        ordersNeeded: Math.max(0, 20 - user.orderCount),
        currentOrders: user.orderCount
      };
    } else if (user.membershipTier === 'gold') {
      nextTierRequirement = {
        tier: 'platinum',
        ordersNeeded: Math.max(0, 50 - user.orderCount),
        currentOrders: user.orderCount
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
        totalOrders: user.orderCount,
        totalSpent: user.totalOrderValue,
        activeOrders: 0, // Will be calculated when order system is implemented
        completedOrders: user.orderCount
      },
      membership: {
        current: user.membershipTier,
        nextTier: nextTierRequirement,
        benefits: user.membershipBenefits
      },
      recentOrders,
      notifications: {
        unread: 0 // Placeholder
      }
    };
    
    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
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
router.post('/request-data-export', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    
    // Check if there's already a pending request
    const pendingRequest = user.dataExportRequests.find(req => 
      req.status === 'pending' || req.status === 'processing'
    );
    
    if (pendingRequest) {
      return res.status(400).json({
        success: false,
        message: 'Data export request already in progress'
      });
    }
    
    // Add new export request
    const exportRequest = {
      requestedAt: new Date(),
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    };
    
    user.dataExportRequests.push(exportRequest);
    await user.save();
    
    // TODO: Implement actual data export logic
    // This would typically involve:
    // 1. Gathering all user data
    // 2. Generating a downloadable file
    // 3. Sending email notification
    
    res.json({
      success: true,
      message: 'Data export request submitted successfully. You will receive an email when ready.',
      data: {
        requestId: exportRequest._id,
        estimatedTime: '24-48 hours'
      }
    });
  } catch (error) {
    next(error);
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