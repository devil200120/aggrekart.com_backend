const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { globalErrorHandler } = require('./utils/errorHandler');
require('dotenv').config();

const app = express();

// Trust proxy for Render deployment
app.set('trust proxy', 1);

// Security middleware - UPDATED FOR RENDER
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https:", "wss:"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "https:"],
      frameSrc: ["'self'", "https:"],
    },
  },
}));

// CORS configuration - COMPREHENSIVE FIX FOR RENDER
const corsOptions = {
  origin: function (origin, callback) {
    // In production, be more permissive for deployment debugging
    if (process.env.NODE_ENV === 'development') {
      // Allow Render URLs and common patterns
      const renderPatterns = [
        /^https:\/\/.*\.onrender\.com$/,
        /^https:\/\/aggrekart.*\.onrender\.com$/,
        /^https:\/\/aggrekart-com\.onrender\.com$/,
        /^https:\/\/aggrekart-backend\.onrender\.com$/,
        /^https:\/\/aggrekart\.onrender\.com$/,
      ];
      
      // Allow requests with no origin (mobile apps, Postman, server-to-server)
      if (!origin) {
        console.log('✅ CORS: Allowing request with no origin');
        return callback(null, true);
      }
      
      // Check against Render patterns
      const isRenderUrl = renderPatterns.some(pattern => pattern.test(origin));
      if (isRenderUrl) {
        console.log('✅ CORS: Allowing Render URL:', origin);
        return callback(null, true);
      }
      
      // Specific allowed origins for production
      const allowedOrigins = [
        'https://aggrekart-com.onrender.com',
        'https://aggrekart.onrender.com',
        process.env.FRONTEND_URL,
        process.env.CLIENT_URL,
      ].filter(Boolean);
      
      if (allowedOrigins.includes(origin)) {
        console.log('✅ CORS: Allowing specified origin:', origin);
        return callback(null, true);
      }
      
      console.log('❌ CORS: Blocking origin:', origin);
      console.log('🔍 Allowed patterns checked, allowed origins:', allowedOrigins);
      return callback(new Error(`CORS blocked: ${origin}`));
      
    } else {
      // Development - be permissive
      const devOrigins = [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:4173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
        process.env.FRONTEND_URL
      ].filter(Boolean);
      
      if (!origin || devOrigins.includes(origin)) {
        console.log('✅ CORS: Development - allowing origin:', origin || 'no-origin');
        return callback(null, true);
      }
      
      console.log('❌ CORS: Development - blocking origin:', origin);
      return callback(new Error(`CORS blocked in dev: ${origin}`));
    }
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
    'X-Forwarded-For',
    'X-Real-IP',
    'User-Agent',
    'Referer'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range', 'X-Total-Count'],
  optionsSuccessStatus: 200,
  maxAge: 86400, // Cache preflight for 24 hours
  preflightContinue: false
};

app.use(cors(corsOptions));

// Handle preflight requests explicitly for all routes
app.options('*', cors(corsOptions));

// Add CORS headers manually as backup
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Set CORS headers for Render deployment
  if (process.env.NODE_ENV === 'development') {
    if (origin && (origin.includes('.onrender.com') || origin === process.env.FRONTEND_URL)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
  } else {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS,PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma');
  res.header('Access-Control-Expose-Headers', 'Content-Range, X-Content-Range, X-Total-Count');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

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
    // Skip rate limiting for health checks and preflight
    return req.path === '/api/health' || req.path === '/health' || req.method === 'OPTIONS';
  }
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Request logging for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
  next();
});

// Health check endpoint - FIRST
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    cors: 'enabled'
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    cors: 'enabled'
  });
});

// MongoDB connection
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoURI) {
      throw new Error('MongoDB URI not found in environment variables');
    }
    
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

// Connect to database
connectDB();

// Routes
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
app.use('/api/gst', require('./routes/gst'));

// Catch-all route for frontend (if serving static files)
if (process.env.NODE_ENV === 'development') {
  app.get('*', (req, res) => {
    res.status(200).json({
      message: 'Aggrekart API Server',
      timestamp: new Date().toISOString(),
      environment: 'development'
    });
  });
}

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: [
      '/health',
      '/api/health',
      '/api/auth',
      '/api/users',
      '/api/products',
      '/api/cart',
      '/api/orders',
      '/api/gst'
    ]
  });
});

// Global error handler
app.use(globalErrorHandler);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error('❌ Unhandled Promise Rejection:', err.message);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  process.exit(1);
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  if (process.env.NODE_ENV === 'production') {
    console.log('🔒 CORS configured for production deployment');
  }
});

module.exports = app;
