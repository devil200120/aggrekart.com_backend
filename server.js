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
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      // Production URLs
      'https://aggrekart-com.onrender.com',
      'https://aggrekart-com.onrender.com/',
      
      // Local development
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      process.env.FRONTEND_URL
    ].filter(Boolean);
    
    // Local network patterns (for mobile devices and other computers)
    const localNetworkPatterns = [
      /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:3000$/,  // 192.168.x.x:3000
      /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:3000$/,   // 10.x.x.x:3000
      /^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}:3000$/, // 172.16-31.x.x:3000
      /^http:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:3000$/ // Any IP:3000 (for local testing)
    ];
    
    console.log('🌐 Request from origin:', origin);
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      console.log('✅ CORS allowed (whitelist):', origin);
      return callback(null, true);
    }
    
    // Check if origin matches local network patterns
    const isLocalNetwork = localNetworkPatterns.some(pattern => pattern.test(origin));
    if (isLocalNetwork) {
      console.log('✅ CORS allowed (local network):', origin);
      return callback(null, true);
    }
    
    // For development, be more permissive
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ CORS allowed (development mode):', origin);
      return callback(null, true);
    }
    
    console.log('❌ CORS blocked origin:', origin);
    console.log('📋 Allowed origins:', allowedOrigins);
    callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'Pragma',
    'User-Agent',
    'Referer'
  ],
  exposedHeaders: ['Content-Range', 'set-cookie'],
  optionsSuccessStatus: 200,
  maxAge: 86400
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
const server = app.listen(PORT, '0.0.0.0', () => {
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
