const { body, param, query } = require('express-validator');

// Common validation rules
const commonValidations = {
  phoneNumber: body('phoneNumber')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please provide a valid Indian phone number'),
    
  email: body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
    
  password: body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
    
  gstNumber: body('gstNumber')
    .optional()
    .custom((value) => {
      if (value && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(value)) {
        throw new Error('Please provide a valid GST number');
      }
      return true;
    }),
    
  pincode: body('pincode')
    .matches(/^[1-9][0-9]{5}$/)
    .withMessage('Please provide a valid pincode'),
    
  name: body('name')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters'),
    
  otp: body('otp')
    .isLength({ min: 6, max: 6 })
    .withMessage('Please provide a valid 6-digit OTP')
};

// Registration validation
const registerValidation = [
  commonValidations.name,
  commonValidations.email,
  commonValidations.phoneNumber,
  commonValidations.password,
  body('customerType')
    .isIn(['house_owner', 'mason', 'builder_contractor', 'others'])
    .withMessage('Invalid customer type'),
  body('address').notEmpty().withMessage('Address is required'),
  body('city').notEmpty().withMessage('City is required'),
  body('state').notEmpty().withMessage('State is required'),
  commonValidations.pincode,
  commonValidations.gstNumber
];

// Login validation
const loginValidation = [
  body('identifier').notEmpty().withMessage('Email or phone number is required'),
  body('password').notEmpty().withMessage('Password is required')
];

// OTP verification validation
const otpVerificationValidation = [
  commonValidations.otp
];

// Phone OTP validation
const phoneOTPValidation = [
  commonValidations.phoneNumber,
  commonValidations.otp
];

// Password reset validation
const passwordResetValidation = [
  body('identifier').notEmpty().withMessage('Email or phone number is required'),
  commonValidations.otp,
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
];

// Change password validation
const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
];

// Profile update validation
const profileUpdateValidation = [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  commonValidations.gstNumber,
  body('customerType').optional().isIn(['house_owner', 'mason', 'builder_contractor', 'others']).withMessage('Invalid customer type')
];

// Address validation
const addressValidation = [
  body('address').notEmpty().withMessage('Address is required'),
  body('city').notEmpty().withMessage('City is required'),
  body('state').notEmpty().withMessage('State is required'),
  commonValidations.pincode,
  body('type').optional().isIn(['home', 'work', 'other']).withMessage('Invalid address type')
];

// Address update validation
const addressUpdateValidation = [
  param('addressId').isMongoId().withMessage('Invalid address ID'),
  body('address').optional().notEmpty().withMessage('Address cannot be empty'),
  body('city').optional().notEmpty().withMessage('City cannot be empty'),
  body('state').optional().notEmpty().withMessage('State cannot be empty'),
  body('pincode').optional().matches(/^[1-9][0-9]{5}$/).withMessage('Please provide a valid pincode'),
  body('type').optional().isIn(['home', 'work', 'other']).withMessage('Invalid address type')
];

// Preferences validation
const preferencesValidation = [
  body('language').optional().isIn(['english', 'hindi', 'telugu']).withMessage('Invalid language'),
  body('notifications.email').optional().isBoolean().withMessage('Email notification must be boolean'),
  body('notifications.sms').optional().isBoolean().withMessage('SMS notification must be boolean'),
  body('notifications.push').optional().isBoolean().withMessage('Push notification must be boolean')
];

// Pagination validation
const paginationValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

// Search validation
const searchValidation = [
  query('q').optional().trim().isLength({ min: 2 }).withMessage('Search query must be at least 2 characters')
];

module.exports = {
  commonValidations,
  registerValidation,
  loginValidation,
  otpVerificationValidation,
  phoneOTPValidation,
  passwordResetValidation,
  changePasswordValidation,
  profileUpdateValidation,
  addressValidation,
  addressUpdateValidation,
  preferencesValidation,
  paginationValidation,
  searchValidation
};