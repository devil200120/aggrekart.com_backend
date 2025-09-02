const mongoose = require('mongoose');

const supplierPromotionSchema = new mongoose.Schema({
  promotionId: {
    type: String,
    unique: true,
    required: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  title: {
    type: String,
    required: [true, 'Promotion title is required'],
    trim: true,
    maxLength: 100
  },
  description: {
    type: String,
    required: [true, 'Promotion description is required'],
    trim: true,
    maxLength: 500
  },
  type: {
    type: String,
    enum: ['discount', 'coupon', 'free_delivery', 'bulk_discount', 'seasonal', 'referral'],
    required: true
  },
  
  // Targeting Configuration
  targeting: {
    customerTypes: [{
      type: String,
      enum: ['house_owner', 'mason', 'builder_contractor', 'others']
    }],
    membershipTiers: [{
      type: String,
      enum: ['silver', 'gold', 'platinum']
    }],
    locations: {
      states: [String],
      cities: [String],
      pincodes: [String],
      radius: {
        type: Number, // in kilometers
        default: 0
      }
    },
    newCustomersOnly: {
      type: Boolean,
      default: false
    },
    returningCustomersOnly: {
      type: Boolean,
      default: false
    }
  },
  
  // Promotion Conditions
  conditions: {
    minOrderValue: {
      type: Number,
      default: 0
    },
    maxOrderValue: {
      type: Number
    },
    categories: [{
      type: String,
      enum: ['aggregate', 'sand', 'tmt_steel', 'bricks_blocks', 'cement']
    }],
    specificProducts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }],
    minQuantity: {
      type: Number,
      default: 1
    },
    validDays: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }],
    validHours: {
      start: String, // "09:00"
      end: String    // "18:00"
    }
  },
  
  // Promotion Benefits
  benefits: {
    discountType: {
      type: String,
      enum: ['percentage', 'fixed_amount', 'free_delivery', 'coins_multiplier'],
      required: true
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0
    },
    maxDiscount: {
      type: Number
    },
    freeDeliveryRadius: {
      type: Number, // in kilometers
      default: 0
    },
    coinsMultiplier: {
      type: Number,
      default: 1,
      min: 1,
      max: 5
    },
    additionalBenefits: {
      priorityDelivery: {
        type: Boolean,
        default: false
      },
      freeLoading: {
        type: Boolean,
        default: false
      },
      extendedWarranty: {
        type: Boolean,
        default: false
      }
    }
  },
  
  // Promotion Validity
  validity: {
    startDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    endDate: {
      type: Date,
      required: true
    },
    timezone: {
      type: String,
      default: 'Asia/Kolkata'
    }
  },
  
  // Usage Limits
  usage: {
    totalLimit: {
      type: Number,
      default: null // unlimited if null
    },
    perUserLimit: {
      type: Number,
      default: 1
    },
    dailyLimit: {
      type: Number,
      default: null
    },
    currentUsage: {
      type: Number,
      default: 0
    },
    usedBy: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      usageCount: {
        type: Number,
        default: 1
      },
      lastUsed: {
        type: Date,
        default: Date.now
      }
    }]
  },
  
  // Budget Management
  budget: {
    totalBudget: {
      type: Number,
      default: 0
    },
    usedBudget: {
      type: Number,
      default: 0
    },
    remainingBudget: {
      type: Number,
      default: function() {
        return this.budget.totalBudget - this.budget.usedBudget;
      }
    }
  },
  
  // Status and Approval
  status: {
    type: String,
    enum: ['draft', 'pending_approval', 'active', 'paused', 'expired', 'rejected'],
    default: 'draft'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Admin Approval
  adminApproval: {
    isRequired: {
      type: Boolean,
      default: true
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: Date,
    rejectionReason: String,
    notes: String  // Add this field for admin approval notes
  },
  
  // Analytics
  analytics: {
    views: {
      type: Number,
      default: 0
    },
    clicks: {
      type: Number,
      default: 0
    },
    conversions: {
      type: Number,
      default: 0
    },
    totalSavings: {
      type: Number,
      default: 0
    },
    averageOrderValue: {
      type: Number,
      default: 0
    }
  },
  
  // Coupon Code (if type is 'coupon')
  couponCode: {
    type: String,
    unique: true,
    sparse: true, // Only unique if not null
    uppercase: true,
    validate: {
      validator: function(v) {
        if (this.type === 'coupon' && !v) {
          return false;
        }
        return !v || /^[A-Z0-9]{4,15}$/.test(v);
      },
      message: 'Coupon code must be 4-15 characters long and contain only uppercase letters and numbers'
    }
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
}, {
  timestamps: true
});

// Indexes for performance
supplierPromotionSchema.index({ supplier: 1, status: 1 });
supplierPromotionSchema.index({ 'validity.startDate': 1, 'validity.endDate': 1 });
supplierPromotionSchema.index({ couponCode: 1 }, { sparse: true });
supplierPromotionSchema.index({ 'targeting.locations.states': 1 });
supplierPromotionSchema.index({ 'targeting.customerTypes': 1 });

// Pre-save middleware to generate promotion ID
supplierPromotionSchema.pre('save', function(next) {
  if (!this.promotionId) {
    this.promotionId = `PROMO${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
  }
  
  // Auto-generate coupon code if type is coupon and no code provided
  if (this.type === 'coupon' && !this.couponCode) {
    this.couponCode = `${this.supplier.toString().slice(-4).toUpperCase()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  }
  
  next();
});

// Method to check if promotion is valid for a user
supplierPromotionSchema.methods.isValidForUser = function(user, orderValue = 0, location = {}) {
  // Check if promotion is active
  if (!this.isActive || this.status !== 'active') {
    return { valid: false, reason: 'Promotion is not active' };
  }
  
  // Check validity dates
  const now = new Date();
  if (now < this.validity.startDate || now > this.validity.endDate) {
    return { valid: false, reason: 'Promotion has expired' };
  }
  
  // Check usage limits
  if (this.usage.totalLimit && this.usage.currentUsage >= this.usage.totalLimit) {
    return { valid: false, reason: 'Promotion usage limit exceeded' };
  }
  
  // Check per-user limit
  const userUsage = this.usage.usedBy.find(u => u.user.toString() === user._id.toString());
  if (userUsage && this.usage.perUserLimit && userUsage.usageCount >= this.usage.perUserLimit) {
    return { valid: false, reason: 'User usage limit exceeded' };
  }
  
  // Check minimum order value
  if (orderValue < this.conditions.minOrderValue) {
    return { valid: false, reason: `Minimum order value ₹${this.conditions.minOrderValue} required` };
  }
  
  // Check maximum order value
  if (this.conditions.maxOrderValue && orderValue > this.conditions.maxOrderValue) {
    return { valid: false, reason: `Order value exceeds maximum limit of ₹${this.conditions.maxOrderValue}` };
  }
  
  // Check customer type targeting
  if (this.targeting.customerTypes.length > 0) {
    if (!this.targeting.customerTypes.includes(user.customerType)) {
      return { valid: false, reason: 'Not eligible for your customer type' };
    }
  }
  
  // Check membership tier targeting
  if (this.targeting.membershipTiers.length > 0) {
    if (!this.targeting.membershipTiers.includes(user.membershipTier)) {
      return { valid: false, reason: 'Not eligible for your membership tier' };
    }
  }
  
  // Check location targeting
  if (this.targeting.locations.states.length > 0 || this.targeting.locations.cities.length > 0) {
    const userState = location.state || user.addresses?.[0]?.state;
    const userCity = location.city || user.addresses?.[0]?.city;
    
    if (this.targeting.locations.states.length > 0 && !this.targeting.locations.states.includes(userState)) {
      return { valid: false, reason: 'Not available in your location' };
    }
    
    if (this.targeting.locations.cities.length > 0 && !this.targeting.locations.cities.includes(userCity)) {
      return { valid: false, reason: 'Not available in your city' };
    }
  }
  
  // Check new customers only
  if (this.targeting.newCustomersOnly && user.orderCount > 0) {
    return { valid: false, reason: 'Only for new customers' };
  }
  
  // Check returning customers only
  if (this.targeting.returningCustomersOnly && user.orderCount === 0) {
    return { valid: false, reason: 'Only for returning customers' };
  }
  
  return { valid: true };
};

// Method to apply promotion and track usage
supplierPromotionSchema.methods.applyPromotion = function(user, orderValue) {
  const validation = this.isValidForUser(user, orderValue);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }
  
  // Calculate discount
  let discountAmount = 0;
  
  switch (this.benefits.discountType) {
    case 'percentage':
      discountAmount = (orderValue * this.benefits.discountValue) / 100;
      if (this.benefits.maxDiscount) {
        discountAmount = Math.min(discountAmount, this.benefits.maxDiscount);
      }
      break;
      
    case 'fixed_amount':
      discountAmount = this.benefits.discountValue;
      break;
      
    case 'free_delivery':
      discountAmount = 0; // Handle delivery fee waiver separately
      break;
      
    case 'coins_multiplier':
      discountAmount = 0; // Handle coins multiplier separately
      break;
  }
  
  // Track usage
  const userUsageIndex = this.usage.usedBy.findIndex(u => u.user.toString() === user._id.toString());
  if (userUsageIndex >= 0) {
    this.usage.usedBy[userUsageIndex].usageCount += 1;
    this.usage.usedBy[userUsageIndex].lastUsed = new Date();
  } else {
    this.usage.usedBy.push({
      user: user._id,
      usageCount: 1,
      lastUsed: new Date()
    });
  }
  
  this.usage.currentUsage += 1;
  this.analytics.conversions += 1;
  this.analytics.totalSavings += discountAmount;
  this.budget.usedBudget += discountAmount;
  
  return {
    discountAmount,
    benefits: this.benefits,
    promotionId: this.promotionId
  };
};

// Static method to find valid promotions for user
supplierPromotionSchema.statics.findValidPromotions = function(filters = {}) {
  const query = {
    status: 'active',
    isActive: true,
    'validity.startDate': { $lte: new Date() },
    'validity.endDate': { $gte: new Date() }
  };
  
  if (filters.supplier) {
    query.supplier = filters.supplier;
  }
  
  if (filters.customerType) {
    query.$or = [
      { 'targeting.customerTypes': { $size: 0 } },
      { 'targeting.customerTypes': filters.customerType }
    ];
  }
  
  if (filters.membershipTier) {
    query.$or = [
      { 'targeting.membershipTiers': { $size: 0 } },
      { 'targeting.membershipTiers': filters.membershipTier }
    ];
  }
  
  if (filters.location) {
    if (filters.location.state) {
      query.$or = [
        { 'targeting.locations.states': { $size: 0 } },
        { 'targeting.locations.states': filters.location.state }
      ];
    }
  }
  
  return this.find(query)
    .populate('supplier', 'companyName state city')
    .sort({ 'benefits.discountValue': -1 }); // Sort by highest discount first
};
// Add this method
supplierPromotionSchema.methods.calculateDiscount = function(orderValue) {
  let discountAmount = 0;
  
  switch (this.benefits.discountType) {
    case 'percentage':
      discountAmount = (orderValue * this.benefits.discountValue) / 100;
      if (this.benefits.maxDiscount) {
        discountAmount = Math.min(discountAmount, this.benefits.maxDiscount);
      }
      break;
      
    case 'fixed_amount':
      discountAmount = this.benefits.discountValue;
      break;
      
    case 'free_delivery':
      discountAmount = 0;
      break;
      
    case 'coins_multiplier':
      discountAmount = 0;
      break;
  }
  
  return discountAmount;
};
module.exports = mongoose.model('SupplierPromotion', supplierPromotionSchema);