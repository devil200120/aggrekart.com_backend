const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { globalErrorHandler } = require('./utils/errorHandler');
const os = require('os');
require('dotenv').config();

const app = express();

// Security middleware - UPDATED FOR LOCAL NETWORK
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'", "https:", "http:", "ws:", "wss:"],
      fontSrc: ["'self'", "data:", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'"]
    },
  },
}));

// CORS configuration - UPDATED FOR LOCAL NETWORK ACCESS
const corsOptions = {
  origin: function (origin, callback) {
    console.log('🌐 Incoming request from origin:', origin);
    
    // ALWAYS allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      console.log('✅ No origin - allowing request');
      return callback(null, true);
    }
    
    // For development mode - allow EVERYTHING
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ Development mode - allowing all origins');
      return callback(null, true);
    }
    
    // Production whitelist (only when NODE_ENV is production)
    const productionOrigins = [
      'https://aggrekart-com.onrender.com',
      'https://aggrekart-com.onrender.com/',
      process.env.FRONTEND_URL
    ].filter(Boolean);
    
    if (productionOrigins.includes(origin)) {
      console.log('✅ Production origin allowed:', origin);
      return callback(null, true);
    }
    
    // If we reach here in production, block it
    console.log('❌ Production origin blocked:', origin);
    callback(new Error(`Not allowed by CORS in production. Origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'Pragma',
    'User-Agent',
    'Referer',
    'X-CSRF-Token',
    'X-Forwarded-For',
    'X-Real-IP'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range', 'set-cookie'],
  optionsSuccessStatus: 200,
  preflightContinue: false
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
    environment: process.env.NODE_ENV || 'development',
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
    environment: process.env.NODE_ENV || 'development',
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
    app.use(express.static(path.join(__dirname, 'front-end/app/dist')));
    
    // Catch all handler for React Router (only for non-API routes)
    app.get('*', (req, res, next) => {
      // Skip API routes
      if (req.path.startsWith('/api/') || req.path === '/health') {
        return next();
      }
      
      res.sendFile(path.join(__dirname, 'front-end/app/dist', 'index.html'));
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

// Get local IP address for network access
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      if (interface.family === 'IPv4' && !interface.internal) {
        return interface.address;
      }
    }
  }
  return 'localhost';
}

const localIP = getLocalIpAddress();

// Create server and store reference for graceful shutdown
const server = app.listen(PORT,  () => {
  console.log(`🚀 Aggrekart server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 Local: http://localhost:${PORT}`);
  console.log(`🌐 Network: http://${localIP}:${PORT}`);
  console.log(`📱 Mobile Access: http://${localIP}:${PORT}/api/health`);
  console.log(`🧪 CORS Test: http://${localIP}:${PORT}/api/test-cors`);
  console.log(`📋 Available endpoints:`);
  console.log(`   Authentication: http://${localIP}:${PORT}/api/auth`);
  console.log(`   Products: http://${localIP}:${PORT}/api/products`);
  console.log(`   Orders: http://${localIP}:${PORT}/api/orders`);
  console.log(`   Payments: http://${localIP}:${PORT}/api/payments`);
  console.log(`   Suppliers: http://${localIP}:${PORT}/api/suppliers`);
  console.log(`   Admin: http://${localIP}:${PORT}/api/admin`);
  console.log(`🔗 Frontend should connect to: http://${localIP}:${PORT}/api`);
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


module.exports = app;
