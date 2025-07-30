const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { globalErrorHandler } = require('./utils/errorHandler');
const path = require('path');
require('dotenv').config();

const app = express();

// ---- Security middleware ----
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https:", "http:"],
      },
    },
  })
);

// ---- CORS configuration (PRODUCTION/DEVELOPMENT SWITCH) ----
const allowedOrigins = [
  'https://aggrekart-com.onrender.com',    // Deployed frontend (no slash at end!)
  'http://localhost:3000',             // Local dev React
  'http://localhost:5173',             // Local Vite
  'http://127.0.0.1:3000',
  process.env.FRONTEND_URL,            // Environment variable (must be set in Render!)
].filter(Boolean); // Remove empty

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
      // No origin header (Postman, server/server, curl)
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Otherwise, block!
    return callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin',
    'Cache-Control', 'Pragma'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  optionsSuccessStatus: 200,
  maxAge: 86400
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ---- Rate limiting ----
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 200 : 1000,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => ['/api/health', '/health'].includes(req.path),
});
app.use('/api', limiter);

// ---- Body parsing middleware ----
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ---- Logging ----
app.use(morgan(process.env.NODE_ENV === 'development' ? 'combined' : 'dev'));

// ---- Database connection ----
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/aggrekart', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    console.log(`📊 Database: ${mongoose.connection.name}`);
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// ---- Health & Debug ----
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
    cors: { allowedOrigins },
    features: [
      'User Authentication', 'Product Management', 'Order Management',
      'Supplier Management', 'Admin Panel', 'Payment Integration', 'Supplier Onboarding'
    ]
  });
});
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
      host: req.headers.host,
    }
  });
});

// ---- API Routes ----
app.use('/api/auth', require('./routes/auth'));
// ... Add other routes the same way as you have

// ---- Root endpoint ----
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to Aggrekart API',
    version: '1.0.0',
    documentation: '/api/health',
    cors_test: '/api/test-cors',
    environment: process.env.NODE_ENV || 'development',
    // endpoints: { ... }
  });
});

// ---- Serve static files in PRODUCTION mode ----
if (process.env.NODE_ENV === 'production') {
  // YOUR BUILD PATH from React: adjust as needed
  app.use(express.static(path.join(__dirname, 'build')));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/health') return next();
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  });
}

// ---- Error handling ----
app.use(globalErrorHandler);

app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API route ${req.originalUrl} not found`,
  });
});
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    suggestion: 'Try /api/health for API status'
  });
});

// ---- Start server ----
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 API Health: http://localhost:${PORT}/api/health`);
  console.log(`🌐 CORS configured for: ${allowedOrigins.join(', ')}`);
});

process.on('unhandledRejection', (err) => {
  console.log('💥 Unhandled Promise Rejection:', err.message);
  server.close(() => process.exit(1));
});
process.on('uncaughtException', (err) => {
  console.log('💥 Uncaught Exception:', err.message);
  process.exit(1);
});
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => { mongoose.connection.close(); });
});
process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => { mongoose.connection.close(); process.exit(0); });
});

module.exports = app;
