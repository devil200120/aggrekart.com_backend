const jwt = require('jsonwebtoken');
const User = require('../models/User');
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

module.exports = { 
  auth, 
  authorize, 
  canPlaceOrders, 
  optionalAuth, 
  sensitiveOperation 
};