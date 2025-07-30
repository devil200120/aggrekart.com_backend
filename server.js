const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { globalErrorHandler } = require('./utils/errorHandler');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:"],
    },
  },
}));

// CORS configuration - FIXED FOR YOUR DEPLOYMENT
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://aggrekart-com.onrender.com',           // Your frontend URL
      'https://aggrekart-com.onrender.com/',         // With trailing slash
      'http://localhost:3000',                       // Development
      'http://localhost:5173',                       // Vite dev server
      'http://127.0.0.1:3000',                      // Alternative localhost
      process.env.FRONTEND_URL                       // Environment variable
    ].filter(Boolean); // Remove undefined values
    
    console.log('🌐 Request from origin:', origin);
    console.log('✅ Allowed origins:', allowedOrigins);
    
    if (allowedOrigins.includes(origin)) {
      console.log('✅ CORS allowed for:', origin);
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    
    'Accept',
    'Origin',
    'Cache-Control',
    'Pragma',
    'User-Agent', // Important for mobile
   
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  optionsSuccessStatus: 200, // Support legacy browsers
  maxAge: 86400 // Cache preflight for 24 hours
};

app.use(cors(corsOptions));

// Handle preflight requests explicitly for all routes
app.options('*', cors(corsOptions));

// Rate limiting - More lenient for production cold starts
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 200 : 1000, // More requests for production
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/api/health' || req.path === '/health';
  }
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/aggrekart', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ MongoDB connected successfully');
  console.log(`📊 Database: ${mongoose.connection.name}`);
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Health check endpoint (before other routes)
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'OK',
    message: 'Aggrekart server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    success: true,
    status: 'OK', 
    message: 'Aggrekart API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment:'development',
    cors: {
      allowedOrigins: [
        'https://aggrekart-com.onrender.com',
        'http://localhost:3000',
        process.env.FRONTEND_URL
      ].filter(Boolean)
    },
    features: [
      'User Authentication',
      'Product Management', 
      'Order Management',
      'Supplier Management',
      'Admin Panel',
      'Payment Integration',
      'Supplier Onboarding'
    ]
  });
});

// CORS test endpoint for debugging
app.get('/api/test-cors', (req, res) => {
  res.json({
    success: true,
    message: 'CORS is working!',
    origin: req.headers.origin,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString(),
    requestHeaders: {
      origin: req.headers.origin,
      referer: req.headers.referer,
      host: req.headers.host
    }
  });
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/products', require('./routes/products'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/wishlist', require('./routes/wishlist'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/supplier/orders', require('./routes/supplier-orders'));
app.use('/api/supplier/onboarding', require('./routes/supplier-onboarding'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/loyalty', require('./routes/loyalty'));
app.use('/api/pilot', require('./routes/pilot'));
app.use('/api/reports', require('./routes/reports'));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to Aggrekart API',
    version: '1.0.0',
    documentation: '/api/health',
    cors_test: '/api/test-cors',
    environment: 'development',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      products: '/api/products',
      cart: '/api/cart',
      orders: '/api/orders',
      payments: '/api/payments',
      suppliers: '/api/suppliers',
      admin: '/api/admin',
      loyalty: '/api/loyalty',
      pilot: '/api/pilot',
      reports: '/api/reports'
    }
  });
});

// Serve static files in production (if you have a build folder)
if (process.env.NODE_ENV === 'development') {
  const path = require('path');
  
  // Check if build directory exists
  try {
    app.use(express.static(path.join(__dirname, 'build')));
    
    // Catch all handler for React Router (only for non-API routes)
    app.get('*', (req, res, next) => {
      // Skip API routes
      if (req.path.startsWith('/api/') || req.path === '/health') {
        return next();
      }
      
      res.sendFile(path.join(__dirname, 'build', 'index.html'));
    });
  } catch (error) {
    console.log('No build folder found, serving API only');
  }
}

// Global error handling middleware
app.use(globalErrorHandler);

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    success: false,
    message: `API route ${req.originalUrl} not found`,
    availableRoutes: [
      '/api/auth',
      '/api/users',
      '/api/products',
      '/api/cart',
      '/api/orders',
      '/api/payments',
      '/api/suppliers',
      '/api/admin'
    ]
  });
});

// 404 handler for all other routes
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false,
    message: `Route ${req.originalUrl} not found`,
    suggestion: 'Try /api/health for API status'
  });
});

const PORT = process.env.PORT || 5000;

// Create server and store reference for graceful shutdown
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Aggrekart server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 API Health: http://localhost:${PORT}/api/health`);
  console.log(`🧪 CORS Test: http://localhost:${PORT}/api/test-cors`);
  console.log(`📋 Available endpoints:`);
  console.log(`   Authentication: http://localhost:${PORT}/api/auth`);
  console.log(`   Products: http://localhost:${PORT}/api/products`);
  console.log(`   Orders: http://localhost:${PORT}/api/orders`);
  console.log(`   Payments: http://localhost:${PORT}/api/payments`);
  console.log(`   Suppliers: http://localhost:${PORT}/api/suppliers`);
  console.log(`   Admin: http://localhost:${PORT}/api/admin`);
  console.log(`🌐 CORS configured for: https://aggrekart-com.onrender.com`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log('💥 Unhandled Promise Rejection:', err.message);
  console.log('Shutting down server...');
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.log('💥 Uncaught Exception:', err.message);
  console.log('Shutting down server...');
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received');
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    mongoose.connection.close();
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received');
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    mongoose.connection.close();
    process.exit(0);
  });
});

module.exports = app;
