const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const os = require('os');
require('dotenv').config();

const { globalErrorHandler } = require('./utils/errorHandler');

const app = express();

// --- Helmet security middleware with adjusted CSP ---
app.use(
  helmet({
    crossOriginEmbedderPolicy: false, // necessary if you serve fonts or cross-origin scripts
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https:", "http:", "ws:", "wss:"],
        fontSrc: ["'self'", "data:", "https:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'self'"],
      },
    },
  })
);

// --- CORS setup ---
const allowedOrigins = [
  'https://aggrekart-com.onrender.com',
  process.env.FRONTEND_URL, // Ensure set in env vars, like https://aggrekart-com.onrender.com
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    console.log('🌐 Incoming request from origin:', origin);
    
    // Allow requests with no origin (Postman, curl, mobile apps, same-origin)
    if (!origin) {
      console.log('✅ No origin - allowing request');
      return callback(null, true);
    }
    
    // Allow all origins during development
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ Development mode - allowing all origins');
      return callback(null, true);
    }
    
    // In production, allow only whitelisted origins
    if (allowedOrigins.includes(origin)) {
      console.log('✅ Production origin allowed:', origin);
      return callback(null, true);
    }
    
    console.log('❌ Production origin blocked:', origin);
    callback(new Error(`Not allowed by CORS in production. Origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS','PATCH','HEAD'],
  allowedHeaders: [
    'Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin',
    'Cache-Control', 'Pragma', 'User-Agent', 'Referer', 'X-CSRF-Token',
    'X-Forwarded-For', 'X-Real-IP'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range', 'set-cookie'],
  optionsSuccessStatus: 200,
  preflightContinue: false
};

app.use(cors(corsOptions));
// Handle preflight requests explicitly for all routes
app.options('*', cors(corsOptions));

// --- Rate limiting ---
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: process.env.NODE_ENV === 'development' ? 200 : 1000,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => ['/api/health', '/health'].includes(req.path)
});
app.use('/api/', limiter);

// --- Body parsers ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- Logging ---
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// --- MongoDB connection ---
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

// --- Health check endpoints ---
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'OK',
    message: 'Aggrekart server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'OK',
    message: 'Aggrekart API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    cors: {
      allowedOrigins
    },
    features: [
      'User Authentication',
      'Product Management',
      'Order Management',
      'Supplier Management',
      'Admin Panel',
      'Payment Integration',
      'Supplier Onboarding'
    ],
  });
});

// --- CORS test endpoint ---
app.get('/api/test-cors', (req, res) => {
  res.json({
    success: true,
    message: 'CORS is working!',
    origin: req.headers.origin,
    timestamp: new Date().toISOString(),
    requestHeaders: {
      origin: req.headers.origin,
      referer: req.headers.referer,
      host: req.headers.host
    }
  });
});

// --- API routes ---
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

// --- Root endpoint ---
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

// --- Serve React build in production ---
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, 'front-end/app/dist'); // Adjust if your build folder path differs
  app.use(express.static(buildPath));

  // Catch-all handler for client-side routing (except API and health)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

// --- 404 handlers ---
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API route ${req.originalUrl} not found`,
    suggestion: 'Try /api/health for API status'
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    suggestion: 'Try /api/health for API status'
  });
});

// --- Global error handler ---
app.use(globalErrorHandler);

// --- Helper: get local IP for console logs ---
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const PORT = process.env.PORT || 5000;
const localIP = getLocalIpAddress();

// --- Start server ---
const server = app.listen(PORT, () => {
  console.log(`🚀 Aggrekart server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 Local: http://localhost:${PORT}`);
  console.log(`🌐 Network: http://${localIP}:${PORT}`);
  console.log(`📱 Mobile Access: http://${localIP}:${PORT}/api/health`);
  console.log(`🧪 CORS Test: http://${localIP}:${PORT}/api/test-cors`);
  console.log('📋 Available endpoints:');
  console.log(`   Authentication: http://${localIP}:${PORT}/api/auth`);
  console.log(`   Products: http://${localIP}:${PORT}/api/products`);
  console.log(`   Orders: http://${localIP}:${PORT}/api/orders`);
  console.log(`   Payments: http://${localIP}:${PORT}/api/payments`);
  console.log(`   Suppliers: http://${localIP}:${PORT}/api/suppliers`);
  console.log(`   Admin: http://${localIP}:${PORT}/api/admin`);
  console.log(`🔗 Frontend should connect to: http://${localIP}:${PORT}/api`);
});

// --- Graceful shutdown & error handling ---
process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled Promise Rejection:', err.message || err);
  console.log('Shutting down server...');
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err.message || err);
  console.log('Shutting down server...');
  process.exit(1);
});

module.exports = app;
