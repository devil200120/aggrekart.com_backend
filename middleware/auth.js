const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Pilot = require('../models/Pilot');
const { ErrorHandler } = require('../utils/errorHandler');

// Verify JWT token
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return next(new ErrorHandler('No token provided, authorization denied', 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return next(new ErrorHandler('User not found', 401));
    }

    if (!user.isActive) {
      return next(new ErrorHandler('Account is deactivated. Please contact support', 401));
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new ErrorHandler('Invalid token', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new ErrorHandler('Token expired', 401));
    }
    next(error);
  }
};

// Check user role
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ErrorHandler('User not authenticated', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ErrorHandler('Access denied. Insufficient permissions', 403));
    }

    next();
  };
};

// Check if user can place orders
const canPlaceOrders = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new ErrorHandler('User not authenticated', 401));
    }

    if (!req.user.phoneVerified) {
      return next(new ErrorHandler('Phone number must be verified to place orders', 403));
    }

    if (!req.user.addresses || req.user.addresses.length === 0) {
      return next(new ErrorHandler('Please add at least one address to place orders', 403));
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Optional auth - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (user && user.isActive) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication for optional auth
    next();
  }
};

// Rate limiting for sensitive operations
const sensitiveOperation = (req, res, next) => {
  // Check if user has made too many sensitive operations recently
  // This is a placeholder - implement Redis-based rate limiting for production
  next();
};
// Add this new middleware function after the existing authorize function:

// Check if supplier is suspended
const checkSupplierSuspension = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new ErrorHandler('User not authenticated', 401));
    }

    // Only check for suppliers
    if (req.user.role === 'supplier') {
      const Supplier = require('../models/Supplier');
      
      const supplier = await Supplier.findOne({ user: req.user._id });
      
      if (!supplier) {
        return next(new ErrorHandler('Supplier profile not found', 404));
      }

      // Check if supplier is suspended (isActive: false means suspended)
            // FIXED: Distinguish between suspended and pending approval
      if (!supplier.isApproved && !supplier.isActive) {
        // New supplier pending approval
        return res.status(403).json({
          success: false,
          message: 'Your supplier account is pending admin approval.',
          error: 'SUPPLIER_PENDING_APPROVAL',
          data: {
            supplierId: supplier.supplierId || supplier._id,
            companyName: supplier.companyName,
            submittedAt: supplier.createdAt,
            status: 'pending_approval',
            nextSteps: [
              'Your application is being reviewed by our admin team',
              'You will receive an email notification once approved',
              'Approval typically takes 2-3 business days'
            ],
            contactSupport: {
              email: 'support@aggrekart.com',
              phone: '+91-XXXXXXXXXX'
            }
          }
        });
      }

      // Check if supplier is suspended (was approved but then deactivated)
      if (supplier.isApproved && !supplier.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Your supplier account has been suspended.',
          error: 'SUPPLIER_SUSPENDED',
          data: {
            suspendedAt: supplier.suspendedAt,
            suspensionReason: supplier.suspensionReason || 'Administrative decision',
            contactSupport: {
              email: 'support@aggrekart.com',
              phone: '+91-XXXXXXXXXX',
              message: 'Contact support to resolve the suspension'
            }
          }
        });
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Export the new middleware

// Pilot authentication middleware
const pilotAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return next(new ErrorHandler('No token provided, authorization denied', 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const pilot = await Pilot.findById(decoded.pilotId).select('-documents');

    if (!pilot) {
      return next(new ErrorHandler('Pilot not found', 401));
    }

    if (!pilot.isActive) {
      return next(new ErrorHandler('Pilot account is deactivated. Please contact support', 401));
    }

    if (!pilot.isApproved) {
      return next(new ErrorHandler('Pilot account is not yet approved', 401));
    }

    req.pilot = pilot;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new ErrorHandler('Invalid token', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new ErrorHandler('Token expired', 401));
    }
    next(error);
  }
};

// Generate JWT token for pilot
const generatePilotToken = (pilotId) => {
  return jwt.sign(
    { pilotId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
};


module.exports = { 
  auth, 
  authorize, 
  canPlaceOrders, 
  optionalAuth, 
  sensitiveOperation ,
  checkSupplierSuspension,  // Add this export
  pilotAuth,
  generatePilotToken
};