const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  customerId: {
    type: String,
    unique: true,
    required: true
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email']
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    validate: {
      validator: function(v) {
        return /^[6-9]\d{9}$/.test(v);
      },
      message: 'Please provide a valid Indian phone number'
    }
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  role: {
    type: String,
    enum: ['customer', 'supplier', 'admin'],
    default: 'customer'
  },
  customerType: {
    type: String,
    enum: ['house_owner', 'mason', 'builder_contractor', 'others'],
    required: function() {
      return this.role === 'customer';
    }
  },
  addresses: [{
    type: {
      type: String,
      enum: ['home', 'work', 'other'],
      default: 'home'
    },
    address: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    pincode: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^[1-9][0-9]{5}$/.test(v);
        },
        message: 'Please provide a valid pincode'
      }
    },
    coordinates: {
      latitude: Number,
      longitude: Number
    },
    isDefault: {
      type: Boolean,
      default: false
    }
  }],
  gstNumber: {
    type: String,
    validate: {
      validator: function(v) {
        if (!v) return true;
        return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v);
      },
      message: 'Please provide a valid GST number'
    }
  },
  membershipTier: {
    type: String,
    enum: ['silver', 'gold', 'platinum'],
    default: 'silver'
  },
  orderCount: {
    type: Number,
    default: 0
  },
  totalOrderValue: {
    type: Number,
    default: 0
  },
  aggreCoins: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: false // Changed to false - activated after phone verification
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  // Password reset
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  
  // Email verification
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationOTP: String,
  emailOTPExpire: Date,
  
  // Phone verification
  phoneVerified: {
    type: Boolean,
    default: false
  },
  phoneVerificationOTP: String,
  phoneOTPExpire: Date,
  
  // User preferences
  preferences: {
    language: {
      type: String,
      enum: ['english', 'hindi', 'telugu'],
      default: 'english'
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      },
      emailNotifications: {
        type: Boolean,
        default: true
      },
      smsNotifications: {
        type: Boolean,
        default: true
      },
      orderUpdates: {
        type: Boolean,
        default: true
      },
      promotionalEmails: {
        type: Boolean,
        default: false
      },
      securityAlerts: {
        type: Boolean,
        default: true
      },
      newsletterSubscription: {
        type: Boolean,
        default: false
      }
    },
    privacy: {
      profileVisibility: {
        type: String,
        enum: ['private', 'suppliers', 'public'],
        default: 'private'
      },
      dataSharing: {
        type: Boolean,
        default: false
      },
      marketingCommunications: {
        type: Boolean,
        default: false
      },
      thirdPartySharing: {
        type: Boolean,
        default: false
      }
    },
    currency: {
      type: String,
      default: 'INR'
    }
  },
  
  // Profile completion status
  profileCompletionStatus: {
    basicInfo: {
      type: Boolean,
      default: false
    },
    addressAdded: {
      type: Boolean,
      default: false
    },
    phoneVerified: {
      type: Boolean,
      default: false
    },
    emailVerified: {
      type: Boolean,
      default: false
    }
  },

  // Account management - ADDED MISSING FIELD
  deactivatedAt: Date,
  deactivationReason: String,
  dataExportRequests: [{
    requestedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'expired'],
      default: 'pending'
    },
    downloadUrl: String,
    expiresAt: Date
  }]
}, {
  timestamps: true
});

// Generate unique customer ID
userSchema.pre('save', async function(next) {
  if (!this.customerId) {
    const count = await mongoose.models.User.countDocuments();
    this.customerId = `AGK${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Password hashing middleware
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Update profile completion status
userSchema.pre('save', function(next) {
  this.profileCompletionStatus.basicInfo = !!(this.name && this.email && this.phoneNumber);
  this.profileCompletionStatus.addressAdded = this.addresses && this.addresses.length > 0;
  this.profileCompletionStatus.phoneVerified = this.phoneVerified;
  this.profileCompletionStatus.emailVerified = this.emailVerified;
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Calculate profile completion percentage
userSchema.methods.getProfileCompletionPercentage = function() {
  let completionScore = 0;
  const totalFields = 6;
  
  // Basic info (name, email, phone) - 30%
  if (this.name && this.email && this.phoneNumber) {
    completionScore += 30;
  }
  
  // Phone verification - 20%
  if (this.phoneVerified) {
    completionScore += 20;
  }
  
  // Email verification - 15%
  if (this.emailVerified) {
    completionScore += 15;
  }
  
  // Customer type - 15%
  if (this.customerType) {
    completionScore += 15;
  }
  
  // Address added - 15%
  if (this.addresses && this.addresses.length > 0) {
    completionScore += 15;
  }
  
  // GST number (optional but adds value) - 5%
  if (this.gstNumber) {
    completionScore += 5;
  }
  
  return Math.min(completionScore, 100);
};

// Check if user can place orders
userSchema.methods.canPlaceOrders = function() {
  return this.phoneVerified && this.isActive && this.addresses.length > 0;
};

// Generate password reset token
userSchema.methods.getResetPasswordToken = function() {
  const resetToken = crypto.randomBytes(20).toString('hex');
  
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
    
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

// Virtual for membership benefits
userSchema.virtual('membershipBenefits').get(function() {
  const benefits = {
    silver: {
      discountPercentage: 2,
      freeDeliveryThreshold: 2000,
      aggreCoinsMultiplier: 1,
      prioritySupport: false
    },
    gold: {
      discountPercentage: 5,
      freeDeliveryThreshold: 1500,
      aggreCoinsMultiplier: 1.5,
      prioritySupport: true
    },
    platinum: {
      discountPercentage: 10,
      freeDeliveryThreshold: 1000,
      aggreCoinsMultiplier: 2,
      prioritySupport: true
    }
  };
  
  return benefits[this.membershipTier] || benefits.silver;
});

// Ensure only one default address
userSchema.pre('save', function(next) {
  if (this.addresses && this.addresses.length > 0) {
    let defaultCount = 0;
    this.addresses.forEach(address => {
      if (address.isDefault) defaultCount++;
    });
    
    if (defaultCount === 0) {
      this.addresses[0].isDefault = true;
    } else if (defaultCount > 1) {
      let defaultFound = false;
      this.addresses.forEach(address => {
        if (address.isDefault && defaultFound) {
          address.isDefault = false;
        } else if (address.isDefault) {
          defaultFound = true;
        }
      });
    }
  }
  next();
});

// JSON transform to remove sensitive data
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.resetPasswordToken;
  delete userObject.resetPasswordExpire;
  delete userObject.emailVerificationOTP;
  delete userObject.emailOTPExpire;
  delete userObject.phoneVerificationOTP;
  delete userObject.phoneOTPExpire;
  return userObject;
};

module.exports = mongoose.model('User', userSchema);