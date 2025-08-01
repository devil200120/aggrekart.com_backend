const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const express = require('express');
const validator = require('validator');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { ErrorHandler } = require('../utils/errorHandler');
const { sendSMS, sendEmail } = require('../utils/notifications');
const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d'
  });
};

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// @route   POST /api/auth/register
// @desc    Register a new user with OTP verification
// @access  Public
router.post('/register', [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('phoneNumber').matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid Indian phone number'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('customerType').isIn(['house_owner', 'mason', 'builder_contractor', 'others']).withMessage('Invalid customer type'),
  body('address').notEmpty().withMessage('Address is required'),
  body('city').notEmpty().withMessage('City is required'),
  body('state').notEmpty().withMessage('State is required'),
  body('pincode').matches(/^[1-9][0-9]{5}$/).withMessage('Please provide a valid pincode')
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
      name,
      email,
      phoneNumber,
      password,
      customerType,
      address,
      city,
      state,
      pincode,
      gstNumber,
      coordinates
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { phoneNumber }]
    });

    if (existingUser) {
      return next(new ErrorHandler('User already exists with this email or phone number', 400));
    }
    const generateCustomerId = () => {
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `CUS${timestamp}${random}`;
    };

    // Generate OTP for phone verification
    const phoneOTP = generateOTP();
    const emailOTP = generateOTP();

    // Create new user (not activated yet)
    const user = new User({
      customerId: generateCustomerId(), // ADD THIS LINE
      name,
      email,
      phoneNumber,
      password,
      customerType,
      addresses: [{
        address,
        city,
        state,
        pincode,
        coordinates,
        isDefault: true
      }],
      gstNumber,
      phoneVerificationOTP: phoneOTP,
      emailVerificationOTP: emailOTP,
      phoneOTPExpire: Date.now() + 10 * 60 * 1000, // 10 minutes
      emailOTPExpire: Date.now() + 10 * 60 * 1000, // 10 minutes
      isActive: false // User inactive until phone verification
    });

    await user.save();

    // Send OTP via SMS and Email
    try {
      await sendSMS(phoneNumber, `Your Aggrekart verification code is: ${phoneOTP}. Valid for 10 minutes.`);
      await sendEmail(email, 'Verify Your Email - Aggrekart', `Your email verification code is: ${emailOTP}`);
    } catch (error) {
      console.error('Failed to send OTP:', error);
      // Continue without failing registration
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your phone number and email with the OTP sent.',
      data: {
        userId: user._id,
        phoneNumber: phoneNumber.replace(/(\d{6})(\d{4})/, 'XXXXXX$2'),
        email: email.replace(/(.{2})(.*)(@.*)/, '$1***$3')
      }
    });

  } catch (error) {
    next(error);
  }
});
// Add these routes to your existing auth.js file

// @route   POST /api/auth/send-otp
// @desc    Send OTP for WhatsApp registration
// @access  Public
// Replace the send-otp route (around line 130-200) with this corrected version:

// @route   POST /api/auth/send-otp
// @desc    Send OTP for WhatsApp registration
// @access  Public
router.post('/send-otp', [
  body('phoneNumber').matches(/^\+91[6-9]\d{9}$/).withMessage('Please provide a valid Indian phone number with +91')
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

    const { phoneNumber } = req.body;
    
    // Extract the phone number without +91 prefix for storage
    const cleanPhoneNumber = phoneNumber.replace(/^\+91/, '');

    // Check if user already exists and is active
    const existingUser = await User.findOne({ phoneNumber: cleanPhoneNumber });
    if (existingUser && existingUser.phoneVerified && existingUser.isActive) {
      return res.status(400).json({
        success: false,
        message: 'User with this phone number already exists and is active'
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (existingUser) {
      // Update existing user's OTP
      existingUser.phoneVerificationOTP = otp;
      existingUser.phoneOTPExpire = otpExpiry;
      await existingUser.save();
    } else {
      // Create new user with minimal required fields for OTP verification
      const generateCustomerId = () => {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `WA${timestamp}${random}`;
      };

      const tempUser = new User({
        customerId: generateCustomerId(),
        name: 'Pending WhatsApp User', // Temporary name
        email: `whatsapp_${cleanPhoneNumber}@temp.aggrekart.com`, // Temporary unique email
        phoneNumber: cleanPhoneNumber,
        password: crypto.randomBytes(16).toString('hex'), // Random password
        phoneVerificationOTP: otp,
        phoneOTPExpire: otpExpiry,
        phoneVerified: false,
        emailVerified: false,
        role: 'customer',
        customerType: 'house_owner', // Temporary default
        addresses: [{
          type: 'home',
          address: 'Temporary Address',
          city: 'Temporary City',
          state: 'Temporary State',
          pincode: '123456',
          isDefault: true
        }],
        isActive: false // Will be activated after full registration
      });

      await tempUser.save();
    }

    // Send OTP via SMS
    try {
      await sendSMS(phoneNumber, `Your Aggrekart verification code is: ${otp}. Valid for 10 minutes.`);
      
      res.status(200).json({
        success: true,
        message: 'OTP sent successfully',
        data: {
          phoneNumber,
          otpSent: true
        }
      });
    } catch (smsError) {
      console.error('SMS sending failed:', smsError);
      
      // For development, return OTP in response
      if (process.env.NODE_ENV === 'development') {
        res.status(200).json({
          success: true,
          message: 'OTP generated (SMS service unavailable)',
          data: {
            phoneNumber,
            otpSent: false,
            devOtp: otp // Only for development
          }
        });
      } else {
        return res.status(500).json({
          success: false,
          message: 'Failed to send OTP. Please try again.'
        });
      }
    }

  } catch (error) {
    console.error('Send OTP error:', error);
    next(error);
  }
});// @route   POST /api/auth/verify-otp
// @desc    Verify OTP for WhatsApp registration
// @access  Public
router.post('/verify-otp', [
  body('phoneNumber').matches(/^\+91[6-9]\d{9}$/).withMessage('Please provide a valid phone number'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
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

    const { phoneNumber, otp } = req.body;
    
    // Extract the phone number without +91 prefix
    const cleanPhoneNumber = phoneNumber.replace(/^\+91/, '');

    // Find user with matching phone and OTP using correct field names
    const user = await User.findOne({
      phoneNumber: cleanPhoneNumber,
      phoneVerificationOTP: otp,
      phoneOTPExpire: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    // Mark phone as verified using correct field name
    user.phoneVerified = true;
    user.phoneVerificationOTP = undefined;
    user.phoneOTPExpire = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Phone number verified successfully',
      data: {
        phoneNumber,
        verified: true
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/whatsapp-register
// @desc    Complete WhatsApp registration after OTP verification
// @access  Public
// Replace the whatsapp-register route (around line 270-390) with this corrected version:

// @route   POST /api/auth/whatsapp-register
// @desc    Complete WhatsApp registration after OTP verification
// @access  Public
router.post('/whatsapp-register', [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('phoneNumber').matches(/^\+91[6-9]\d{9}$/).withMessage('Please provide a valid phone number'),
  body('customerType').isIn(['individual', 'contractor', 'architect', 'company']).withMessage('Invalid customer type'),
  body('addresses').isArray().withMessage('Addresses must be an array'),
  body('addresses.*.city').notEmpty().withMessage('City is required'),
  body('addresses.*.state').notEmpty().withMessage('State is required')
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
      name,
      phoneNumber,
      customerType,
      addresses,
      referralCode
    } = req.body;

    // Extract the phone number without +91 prefix
    const cleanPhoneNumber = phoneNumber.replace(/^\+91/, '');

    // Map frontend customerType to backend enum values
    const customerTypeMapping = {
      'individual': 'house_owner',
      'contractor': 'builder_contractor',
      'architect': 'others',
      'company': 'builder_contractor'
    };

    const mappedCustomerType = customerTypeMapping[customerType] || 'house_owner';

    // Find verified user
    const user = await User.findOne({
      phoneNumber: cleanPhoneNumber,
      phoneVerified: true
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Phone number not verified. Please verify first.'
      });
    }

    // Check if user already completed real registration (not temporary)
    if (user.name && 
        user.name !== 'Pending WhatsApp User' && 
        user.isActive && 
        !user.email.includes('@temp.aggrekart.com')) {
      return res.status(400).json({
        success: false,
        message: 'User already registered'
      });
    }

    // Handle referral code
    let referredBy = null;
    if (referralCode) {
      referredBy = await User.findOne({ referralCode });
      if (!referredBy) {
        return res.status(400).json({
          success: false,
          message: 'Invalid referral code'
        });
      }
    }

    // Generate unique customer ID and referral code
    const generateCustomerId = () => {
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `CUS${timestamp}${random}`;
    };
    
    const userReferralCode = crypto.randomBytes(4).toString('hex').toUpperCase();

    // Update user with actual registration details
    user.customerId = generateCustomerId();
    user.name = name;
    user.email = `${cleanPhoneNumber}@whatsapp.aggrekart.com`; // WhatsApp user email
    user.customerType = mappedCustomerType;
    user.addresses = addresses.map((addr, index) => ({
      type: addr.type || 'home',
      address: addr.address,
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      isDefault: index === 0
    }));
    user.referralCode = userReferralCode;
    user.referredBy = referredBy?._id;
    user.registrationDate = new Date();
    user.isActive = true; // Activate user after WhatsApp registration

    // Initialize loyalty system
    user.membershipTier = 'silver';
    user.aggreCoins = referredBy ? 100 : 50; // Bonus for referral

    await user.save();

    // Update referrer's AggreCoins if applicable
    if (referredBy) {
      referredBy.aggreCoins += 200; // Referrer bonus
      await referredBy.save();
    }

    // Generate JWT token
    const token = generateToken(user._id);

    // Set cookie
    res.cookie('aggrekart_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.status(201).json({
      success: true,
      message: 'Registration completed successfully',
      data: {
        token,
        user: {
          id: user._id,
          customerId: user.customerId,
          name: user.name,
          phoneNumber: user.phoneNumber,
          customerType: user.customerType,
          addresses: user.addresses,
          membershipTier: user.membershipTier,
          aggreCoins: user.aggreCoins,
          referralCode: user.referralCode,
          role: user.role,
          phoneVerified: user.phoneVerified,
          emailVerified: user.emailVerified
        }
      }
    });

  } catch (error) {
    console.error('WhatsApp register error:', error);
    next(error);
  }
});// @route   POST /api/auth/verify-phone
// @desc    Verify phone number with OTP
// @access  Public
// Replace the verify-phone route:

// @route   POST /api/auth/verify-phone
// @desc    Verify phone number with OTP
// @access  Public
router.post('/verify-phone', [
  body('phoneNumber').matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid phone number'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('Please provide a valid 6-digit OTP')
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

    const { phoneNumber, otp } = req.body;

    const user = await User.findOne({
      phoneNumber,
      phoneVerificationOTP: otp,
      phoneOTPExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    // Mark phone as verified
    user.phoneVerified = true;
    user.phoneVerificationOTP = undefined;
    user.phoneOTPExpire = undefined;
    
    // Activate user if both phone and email are verified
    if (user.emailVerified) {
      user.isActive = true;
    }

    await user.save();

    // Check if user is fully verified now
    if (user.phoneVerified && user.emailVerified) {
      // Generate token for fully verified user
      const token = generateToken(user._id);
      
      return res.json({
        success: true,
        message: 'Phone verified successfully! Account fully activated.',
        fullyVerified: true,
        data: {
          token,
          user: {
            id: user._id,
            customerId: user.customerId,
            name: user.name,
            email: user.email,
            phoneNumber: user.phoneNumber,
            phoneVerified: user.phoneVerified,
            emailVerified: user.emailVerified,
            isActive: user.isActive,
            role: user.role
          }
        }
      });
    } else {
      // Still need email verification
      return res.json({
        success: true,
        message: 'Phone verified successfully! Please verify your email to complete registration.',
        fullyVerified: false,
        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            phoneNumber: user.phoneNumber,
            phoneVerified: user.phoneVerified,
            emailVerified: user.emailVerified,
            isActive: user.isActive
          },
          nextStep: 'email_verification'
        }
      });
    }

  } catch (error) {
    next(error);
  }
});
// @route   POST /api/auth/verify-email
// @desc    Verify email with OTP
// @access  Private
// Replace the verify-email route:

// @route   POST /api/auth/verify-email
// @desc    Verify email with OTP
// @access  Public (changed from Private)
router.post('/verify-email', [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('Please provide a valid 6-digit OTP')
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

    const { email, otp } = req.body;

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      emailVerificationOTP: otp,
      emailOTPExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    // Mark email as verified
    user.emailVerified = true;
    user.emailVerificationOTP = undefined;
    user.emailOTPExpire = undefined;

    // Activate user if both phone and email are verified
    if (user.phoneVerified) {
      user.isActive = true;
    }

    await user.save();

    // Check if user is fully verified now
    if (user.phoneVerified && user.emailVerified) {
      // Generate token for fully verified user
      const token = generateToken(user._id);
      
      return res.json({
        success: true,
        message: 'Email verified successfully! Account fully activated.',
        fullyVerified: true,
        data: {
          token,
          user: {
            id: user._id,
            customerId: user.customerId,
            name: user.name,
            email: user.email,
            phoneNumber: user.phoneNumber,
            phoneVerified: user.phoneVerified,
            emailVerified: user.emailVerified,
            isActive: user.isActive,
            role: user.role
          }
        }
      });
    } else {
      // Still need phone verification
      return res.json({
        success: true,
        message: 'Email verified successfully! Please verify your phone to complete registration.',
        fullyVerified: false,
        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            phoneNumber: user.phoneNumber,
            phoneVerified: user.phoneVerified,
            emailVerified: user.emailVerified,
            isActive: user.isActive
          },
          nextStep: 'phone_verification'
        }
      });
    }

  } catch (error) {
    next(error);
  }
});
// @route   POST /api/auth/resend-otp
// @desc    Resend OTP for phone or email verification
// @access  Public
router.post('/resend-otp', [
  body('type').isIn(['phone', 'email']).withMessage('Type must be phone or email'),
  body('identifier').notEmpty().withMessage('Phone number or email is required')
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

    const { type, identifier } = req.body;

    const query = type === 'phone' 
      ? { phoneNumber: identifier }
      : { email: identifier };

    const user = await User.findOne(query);

    if (!user) {
      return next(new ErrorHandler('User not found', 404));
    }

    // Check if already verified
    if (type === 'phone' && user.phoneVerified) {
      return next(new ErrorHandler('Phone number already verified', 400));
    }
    if (type === 'email' && user.emailVerified) {
      return next(new ErrorHandler('Email already verified', 400));
    }

    // Generate new OTP
    const newOTP = generateOTP();

    if (type === 'phone') {
      user.phoneVerificationOTP = newOTP;
      user.phoneOTPExpire = Date.now() + 10 * 60 * 1000;
      await sendSMS(identifier, `Your Aggrekart verification code is: ${newOTP}. Valid for 10 minutes.`);
    } else {
      user.emailVerificationOTP = newOTP;
      user.emailOTPExpire = Date.now() + 10 * 60 * 1000;
      await sendEmail(identifier, 'Verify Your Email - Aggrekart', `Your email verification code is: ${newOTP}`);
    }

    await user.save();

    res.json({
      success: true,
      message: `New OTP sent to your ${type}`,
      data: {
        type,
        identifier: type === 'phone' 
          ? identifier.replace(/(\d{6})(\d{4})/, 'XXXXXX$2')
          : identifier.replace(/(.{2})(.*)(@.*)/, '$1***$3')
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
// Replace the login route (around line 313) with this fixed version:

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
// Replace the login route with this enhanced version:

// @route   POST /api/auth/login
// @desc    Login user with verification flow
// @access  Public
// Replace the ENTIRE login route (lines 407-568) with this enhanced version:

router.post('/login', [
  body('identifier').notEmpty().withMessage('Email or phone number is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res, next) => {
  try {
    console.log('🔍 LOGIN ATTEMPT STARTED');
    console.log('Request body:', { 
      identifier: req.body.identifier, 
      loginType: req.body.loginType,
      hasPassword: !!req.body.password 
    });
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { identifier, password, loginType } = req.body;
    
    // Normalize identifier for consistent searching
    const normalizedIdentifier = identifier.toLowerCase().trim();
    
    console.log('🔍 Looking for user with identifier:', normalizedIdentifier);

    // Find user by email or phone number
    const user = await User.findOne({
      $or: [
        { email: normalizedIdentifier },
        { phoneNumber: identifier.trim() }
      ]
    }).select('+password');

    if (!user) {
      console.log('❌ User not found for identifier:', normalizedIdentifier);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    console.log('✅ User found:', {
      id: user._id,
      email: user.email,
      phone: user.phoneNumber,
      isActive: user.isActive,
      phoneVerified: user.phoneVerified,
      emailVerified: user.emailVerified
    });
    console.log('🔐 Password check:', {
      hasStoredPassword: !!user.password,
      providedPassword: password,
      userEmail: user.email
    });

    // Check password first
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      console.log('❌ Invalid password for user:', user.email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    console.log('✅ Password validated for user:', user.email);

    // ⚠️ CRITICAL: Check verification status and handle accordingly
    if (!user.phoneVerified || !user.emailVerified) {
      console.log('🔄 User needs verification:', {
        phoneVerified: user.phoneVerified,
        emailVerified: user.emailVerified
      });
      
      // Generate new OTPs for unverified accounts
      if (!user.phoneVerified) {
        const phoneOTP = generateOTP();
        user.phoneVerificationOTP = phoneOTP;
        user.phoneOTPExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
        
        console.log('📱 Phone OTP generated for', user.phoneNumber, ':', phoneOTP);
        
        // Try to send SMS
        try {
          const smsResult = await sendSMS(user.phoneNumber, `Your Aggrekart verification code is: ${phoneOTP}. Valid for 10 minutes.`);
          console.log('✅ SMS result:', smsResult);
        } catch (smsError) {
          console.error('❌ SMS sending failed:', smsError);
        }
      }
      
      if (!user.emailVerified) {
        const emailOTP = generateOTP();
        user.emailVerificationOTP = emailOTP;
        user.emailOTPExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
        
        console.log('📧 Email OTP generated for', user.email, ':', emailOTP);
        
        // Try to send email
        try {
          const emailResult = await sendEmail(user.email, 'Verify Your Email - Aggrekart', `Your email verification code is: ${emailOTP}. Valid for 10 minutes.`);
          console.log('✅ Email result:', emailResult);
        } catch (emailError) {
          console.error('❌ Email sending failed:', emailError);
        }
      }
      
      await user.save();
      console.log('💾 User saved with new OTPs');

      // ⚠️ CRITICAL: Return verification required response (NOT 401!)
      const response = {
        success: true,
        requiresVerification: true,
        message: 'Account found but verification required',
        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            phoneNumber: user.phoneNumber,
            phoneVerified: user.phoneVerified,
            emailVerified: user.emailVerified,
            isActive: user.isActive
          },
          verificationStatus: {
            phoneVerified: user.phoneVerified,
            emailVerified: user.emailVerified,
            phoneNumber: user.phoneNumber.replace(/(\d{6})(\d{4})/, 'XXXXXX$2'),
            email: user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3')
          },
          // Include OTPs for development
          ...(process.env.NODE_ENV === 'development' && {
            dev_otps: {
              phoneOTP: user.phoneVerificationOTP,
              emailOTP: user.emailVerificationOTP
            }
          })
        }
      };
      
      console.log('📤 Sending verification required response');
      console.log('Response data:', JSON.stringify(response, null, 2));
      return res.status(200).json(response);
    }

    // User is fully verified - proceed with normal login
    console.log('✅ User is fully verified, proceeding with normal login');
    
    if (!user.isActive) {
      user.isActive = true;
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    console.log('✅ Login successful for user:', user.email);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: userResponse
      }
    });

  } catch (error) {
    console.error('💥 Login error:', error);
    next(error);
  }
});// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password');

    res.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Send password reset OTP
// @access  Public
router.post('/forgot-password', [
  body('identifier').notEmpty().withMessage('Email or phone number is required')
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

    const { identifier } = req.body;

    const user = await User.findOne({
      $or: [
        { email: identifier },
        { phoneNumber: identifier }
      ],
      isActive: true
    });

    if (!user) {
      return next(new ErrorHandler('User not found', 404));
    }

    // Generate reset token (6-digit OTP)
    const resetOTP = generateOTP();
    user.resetPasswordToken = resetOTP;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save();

    // Send OTP via SMS or Email
    const isEmail = validator.isEmail(identifier);
    try {
      if (isEmail) {
        await sendEmail(identifier, 'Password Reset - Aggrekart', `Your password reset code is: ${resetOTP}`);
      } else {
        await sendSMS(identifier, `Your Aggrekart password reset code is: ${resetOTP}. Valid for 10 minutes.`);
      }
    } catch (error) {
      console.error('Failed to send reset OTP:', error);
    }

    res.json({
      success: true,
      message: 'Password reset OTP sent successfully',
      data: {
        identifier: isEmail 
          ? identifier.replace(/(.{2})(.*)(@.*)/, '$1***$3')
          : identifier.replace(/(\d{6})(\d{4})/, 'XXXXXX$2')
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password with OTP
// @access  Public
router.post('/reset-password', [
  body('identifier').notEmpty().withMessage('Email or phone number is required'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('Invalid OTP'),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
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

    const { identifier, otp, newPassword } = req.body;

    const user = await User.findOne({
      $or: [
        { email: identifier },
        { phoneNumber: identifier }
      ],
      resetPasswordToken: otp,
      resetPasswordExpire: { $gt: Date.now() },
      isActive: true
    });

    if (!user) {
      return next(new ErrorHandler('Invalid or expired reset OTP', 400));
    }

    // Update password
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/change-password
// @desc    Change password (logged in user)
// @access  Private
router.post('/change-password', auth, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
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

    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');

    // Check current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return next(new ErrorHandler('Current password is incorrect', 400));
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post('/logout', auth, async (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = router;