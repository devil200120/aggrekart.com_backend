const mongoose = require('mongoose');

const newsletterSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      'Please provide a valid email address'
    ]
  },
  isActive: {
    type: Boolean,
    default: true
  },
  source: {
    type: String,
    default: 'homepage'
  },
  subscribedAt: {
    type: Date,
    default: Date.now
  },
  unsubscribedAt: {
    type: Date,
    default: null
  },
  preferences: {
    productUpdates: {
      type: Boolean,
      default: true
    },
    priceAlerts: {
      type: Boolean,
      default: true
    },
    industryNews: {
      type: Boolean,
      default: true
    },
    promotions: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

// Index for email lookup
newsletterSchema.index({ email: 1 });

// Instance method to unsubscribe
newsletterSchema.methods.unsubscribe = function() {
  this.isActive = false;
  this.unsubscribedAt = new Date();
  return this.save();
};

// Static method to find active subscribers
newsletterSchema.statics.findActiveSubscribers = function() {
  return this.find({ isActive: true });
};

module.exports = mongoose.model('Newsletter', newsletterSchema);