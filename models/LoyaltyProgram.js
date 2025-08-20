const mongoose = require('mongoose');

const loyaltyProgramSchema = new mongoose.Schema({
  programId: {
    type: String,
    unique: true,
    required: true
  },
  name: {
    type: String,
    required: [true, 'Program name is required'],
    trim: true
  },
  // Update the type enum to include 'coupon' (around line 18)

  type: {
    type: String,
    enum: ['referral', 'purchase', 'milestone', 'seasonal', 'category_specific', 'coupon'],
    required: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: function() {
      return this.scope === 'supplier';
    }
  },
  scope: {
    type: String,
    enum: ['platform', 'supplier', 'state', 'category'],
    default: 'platform'
  },
  targetAudience: {
    customerTypes: [{
      type: String,
      enum: ['house_owner', 'mason', 'builder_contractor', 'others']
    }],
    membershipTiers: [{
      type: String,
      enum: ['silver', 'gold', 'platinum']
    }],
    states: [String],
    cities: [String]
  },
  conditions: {
    minOrderValue: {
      type: Number,
      default: 0
    },
    maxOrderValue: {
      type: Number
    },
    validFrom: {
      type: Date,
      required: true,
      default: Date.now
    },
    validTill: {
      type: Date,
      required: true
    },
    usageLimit: {
      perUser: {
        type: Number,
        default: 1
      },
      total: {
        type: Number
      }
    },
    categories: [{
      type: String,
      enum: ['aggregate', 'sand', 'tmt_steel', 'bricks_blocks', 'cement']
    }],
    firstTimeUser: {
      type: Boolean,
      default: false
    }
  },
  rewards: {
    type: {
      type: String,
      enum: ['percentage', 'fixed_amount', 'coins', 'free_delivery', 'cashback'],
      required: true
    },
    value: {
      type: Number,
      required: true,
      min: 0
    },
    maxDiscount: {
      type: Number
    },
    coinMultiplier: {
      type: Number,
      default: 1
    }
  },
  referralProgram: {
    referrerReward: {
      type: Number,
      default: 0
    },
    refereeReward: {
      type: Number,
      default: 0
    },
    maxReferrals: {
      type: Number,
      default: 10
    }
  },
  couponDetails: {
    code: {
      type: String,
      uppercase: true,
      required: function() {
        return this.type === 'coupon';
      }
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: function() {
        return this.type === 'coupon';
      }
    },
    discountValue: {
      type: Number,
      required: function() {
        return this.type === 'coupon';
      }
    },
    minOrderAmount: {
      type: Number,
      default: 0
    },
    maxDiscount: {
      type: Number,
      required: function() {
        return this.type === 'coupon' && this.discountType === 'percentage';
      }
    },
    usageLimit: {
      type: Number,
      default: null // null means unlimited
    },
    usedCount: {
      type: Number,
      default: 0
    },
    customerTypes: [{
      type: String,
      enum: ['house_owner', 'mason', 'builder_contractor', 'others']
    }]
  },
  validFrom: {
    type: Date,
    default: Date.now
  },
  validUntil: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  usageCount: {
    type: Number,
    default: 0
  },
  totalSavings: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Generate unique program ID
loyaltyProgramSchema.pre('save', async function(next) {
  if (!this.programId) {
    const count = await mongoose.models.LoyaltyProgram.countDocuments();
    this.programId = `LP${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Check if program is valid
loyaltyProgramSchema.methods.isValid = function() {
  const now = new Date();
  return (
    this.isActive &&
    now >= this.conditions.validFrom &&
    now <= this.conditions.validTill &&
    (!this.conditions.usageLimit.total || this.usageCount < this.conditions.usageLimit.total)
  );
};

// Check if user is eligible
loyaltyProgramSchema.methods.isUserEligible = function(user, orderValue, category) {
  if (!this.isValid()) return false;

  // Check customer type
  if (this.targetAudience.customerTypes.length > 0 && 
      !this.targetAudience.customerTypes.includes(user.customerType)) {
    return false;
  }

  // Check membership tier
  if (this.targetAudience.membershipTiers.length > 0 && 
      !this.targetAudience.membershipTiers.includes(user.membershipTier)) {
    return false;
  }

  // Check order value
  if (orderValue < this.conditions.minOrderValue) return false;
  if (this.conditions.maxOrderValue && orderValue > this.conditions.maxOrderValue) return false;

  // Check category
  if (this.conditions.categories.length > 0 && !this.conditions.categories.includes(category)) {
    return false;
  }

  // Check first time user condition
  if (this.conditions.firstTimeUser && user.orderCount > 0) {
    return false;
  }

  return true;
};

// Calculate reward amount
loyaltyProgramSchema.methods.calculateReward = function(orderValue) {
  let reward = 0;

  switch (this.rewards.type) {
    case 'percentage':
      reward = (orderValue * this.rewards.value) / 100;
      if (this.rewards.maxDiscount) {
        reward = Math.min(reward, this.rewards.maxDiscount);
      }
      break;
    case 'fixed_amount':
      reward = this.rewards.value;
      break;
    case 'coins':
      reward = this.rewards.value;
      break;
    case 'cashback':
      reward = (orderValue * this.rewards.value) / 100;
      break;
  }

  return Math.round(reward);
};

module.exports = mongoose.model('LoyaltyProgram', loyaltyProgramSchema);