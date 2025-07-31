const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { globalErrorHandler } = require('./utils/errorHandler');
require('dotenv').config();

const app = express();

// 🔥 SECURE TRUST PROXY CONFIGURATION FOR RENDER
// Instead of 'true', use specific trusted proxies for security
if (process.env.NODE_ENV === 'development') {
  // Render uses internal IP ranges - trust only these
  app.set('trust proxy', ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '::1/128', '127.0.0.1']);
  console.log('✅ Trust proxy configured for Render production');
} else {
  // Development - trust loopback only
  app.set('trust proxy', 'loopback');
  console.log('✅ Trust proxy configured for development');
}

// Environment validation
console.log('🔍 Environment Check:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Trust Proxy:', app.get('trust proxy'));
console.log('TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? 'SET' : 'MISSING');
console.log('TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? 'SET' : 'MISSING');
console.log('TWILIO_PHONE_NUMBER:', process.env.TWILIO_PHONE_NUMBER);
console.log('SMTP_EMAIL:', process.env.SMTP_EMAIL);

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

// CORS configuration
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
    ].filter(Boolean);
    
    if (allowedOrigins.includes(origin)) {
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
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'Pragma'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  optionsSuccessStatus: 200,
  maxAge: 86400
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// 🔥 SECURE RATE LIMITING with proper proxy configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 200 : 1000,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // 🔥 SECURE: Don't set trustProxy here, rely on app-level setting
  keyGenerator: (req) => {
    // Get the real client IP with fallbacks
    const clientIP = req.ip || 
                    req.connection?.remoteAddress || 
                    req.socket?.remoteAddress ||
                    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                    req.headers['x-real-ip'] ||
                    'unknown';
    
    console.log(`🔍 Rate limit key for IP: ${clientIP}`);
    return clientIP;
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/api/health' || 
           req.path === '/health' ||
           req.path.startsWith('/favicon');
  },
  onLimitReached: (req, res) => {
    console.log(`🚨 Rate limit reached for IP: ${req.ip}, Path: ${req.path}`);
  }
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Enhanced logging with IP information
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('combined'));
} else {
  app.use(morgan(':remote-addr :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'));
}

// Request debugging middleware
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`🌐 ${req.method} ${req.path} from IP: ${req.ip}`);
  }
  next();
});

// Database connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
};

// Connect to database
connectDB();

// Test notification functions during startup
(async () => {
  try {
    const { testNotificationServices } = require('./utils/notifications');
    const status = await testNotificationServices();
    console.log('📊 Notification Services Status:', status);
  } catch (error) {
    console.error('❌ Notification service test failed:', error.message);
  }
})();

// Health check endpoint (before routes)
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    server: {
      trustProxy: app.get('trust proxy'),
      clientIP: req.ip,
      headers: {
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-real-ip': req.headers['x-real-ip']
      }
    }
  });
});

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

// Enhanced API health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    server: {
      trustProxy: app.get('trust proxy'),
      clientIP: req.ip,
      userAgent: req.headers['user-agent']
    },
    services: {
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      notifications: {
        sms: !!process.env.TWILIO_ACCOUNT_SID,
        email: !!process.env.SMTP_EMAIL
      }
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Global error handler (must be last)
app.use(globalErrorHandler);

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 API base: http://localhost:${PORT}/api`);
  console.log(`📡 Trust proxy: ${app.get('trust proxy')}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('💤 Process terminated');
    mongoose.connection.close();
  });
});

process.on('SIGINT', () => {
  console.log('👋 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('💤 Process terminated');
    mongoose.connection.close();
  });
});

module.exports = app;
