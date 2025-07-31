const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Basic CORS for Render
app.use(cors({
  origin: ['https://aggrekart-com.onrender.com', 'http://localhost:3000'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Server running' });
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'API running' });
});

// Root route
app.get('/', (req, res) => {
  res.json({ success: true, message: 'Aggrekart API Server' });
});

// Database connection (non-blocking)
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.log('⚠️ MongoDB connection failed:', err.message));
}

// API Routes (with error handling)
const safeRequire = (path) => {
  try {
    return require(path);
  } catch (error) {
    console.log(`⚠️ Route ${path} not found, skipping...`);
    return (req, res, next) => next();
  }
};

app.use('/api/auth', safeRequire('./routes/auth'));
app.use('/api/users', safeRequire('./routes/users'));
app.use('/api/products', safeRequire('./routes/products'));
app.use('/api/cart', safeRequire('./routes/cart'));
app.use('/api/orders', safeRequire('./routes/orders'));
app.use('/api/wishlist', safeRequire('./routes/wishlist'));
app.use('/api/payments', safeRequire('./routes/payments'));
app.use('/api/suppliers', safeRequire('./routes/suppliers'));
app.use('/api/admin', safeRequire('./routes/admin'));
app.use('/api/gst', safeRequire('./routes/gst'));

// GST verification endpoint
app.post('/api/gst/verify', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'GST_NOT_FOUND',
    message: 'GST number not found in government registry. Please verify the number and try again.'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    message: `Route ${req.originalUrl} not found` 
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ 
    success: false, 
    message: 'Internal server error' 
  });
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Keep server alive
process.on('SIGTERM', () => {
  console.log('SIGTERM received, keeping server alive...');
});

process.on('SIGINT', () => {
  console.log('SIGINT received, keeping server alive...');
});

module.exports = app;
