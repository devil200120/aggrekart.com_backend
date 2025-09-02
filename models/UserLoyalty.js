const mongoose = require('mongoose');

const userLoyaltySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  aggreCoins: {
    balance: {
      type: Number,
      default: 0,
      min: 0
    },
    totalEarned: {
      type: Number,
      default: 0
    },
    totalRedeemed: {
      type: Number,
      default: 0
    }
  },
  // Update the transactions type enum (around line 33)

  transactions: [{
    type: {
      type: String,
      enum: ['earned', 'redeemed', 'expired', 'bonus', 'referral', 'admin_award', 'coupon_awarded', 'coupon_used'],
      required: true
    },
    amount: {
      type: Number,
      required: function() {
        return ['earned', 'redeemed', 'expired', 'bonus', 'referral', 'admin_award'].includes(this.type);
      }
    },
    description: String,
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoyaltyProgram'
    },
    metadata: mongoose.Schema.Types.Mixed, // For storing additional data like coupon details
    expiresAt: Date,
    date: {
      type: Date,
      default: Date.now
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  referrals: [{
    referredUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    referralCode: String,
    status: {
      type: String,
      enum: ['pending', 'completed'],
      default: 'pending'
    },
    rewardEarned: {
      type: Number,
      default: 0
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  referralCode: {
    type: String,
    unique: true
  },
  referredBy: {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    code: String,
    rewardClaimed: {
      type: Boolean,
      default: false
    }
  },
  programUsage: [{
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoyaltyProgram'
    },
    usageCount: {
      type: Number,
      default: 0
    },
    lastUsed: Date,
    totalSavings: {
      type: Number,
      default: 0
    },
    enrolledAt: {
      type: Date,
      default: Date.now
    }
  }],
  milestones: [{
    type: {
      type: String,
      enum: ['first_order', 'orders_5', 'orders_20', 'orders_50', 'orders_100', 'value_10k', 'value_50k', 'value_100k']
    },
    achievedAt: {
      type: Date,
      default: Date.now
    },
    rewardEarned: Number
  }],
  coupons: [{
    couponProgram: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoyaltyProgram',
      required: true
    },
    awardedAt: {
      type: Date,
      default: Date.now
    },
    awardedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    used: {
      type: Boolean,
      default: false
    },
    usedAt: Date,
    usedInOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    discountApplied: Number
  }]
}, {
  timestamps: true
});

// Generate unique referral code
userLoyaltySchema.pre('save', async function(next) {
  if (!this.referralCode) {
    const user = await mongoose.model('User').findById(this.user);
    const name = user.name.replace(/\s+/g, '').toUpperCase().substring(0, 4);
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.referralCode = `${name}${random}`;
  }
  next();
});

// Add coins
userLoyaltySchema.methods.addCoins = function(amount, type, description, order = null, program = null) {
  this.aggreCoins.balance += amount;
  this.aggreCoins.totalEarned += amount;
  
  this.transactions.push({
    type,
    amount,
    description,
    order,
    program,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year expiry
  });
};

// Redeem coins
userLoyaltySchema.methods.redeemCoins = function(amount, description, order = null) {
  if (this.aggreCoins.balance < amount) {
    throw new Error('Insufficient coin balance');
  }
  
  this.aggreCoins.balance -= amount;
  this.aggreCoins.totalRedeemed += amount;
  
  this.transactions.push({
    type: 'redeemed',
    amount: -amount,
    description,
    order
  });
};

// Add referral
userLoyaltySchema.methods.addReferral = function(referredUserId, referralCode) {
  this.referrals.push({
    referredUser: referredUserId,
    referralCode,
    status: 'pending'
  });
};

// Complete referral (when referred user makes first order)
userLoyaltySchema.methods.completeReferral = function(referredUserId, reward) {
  const referral = this.referrals.find(r => 
    r.referredUser.toString() === referredUserId.toString() && 
    r.status === 'pending'
  );
  
  if (referral) {
    referral.status = 'completed';
    referral.rewardEarned = reward;
    this.addCoins(reward, 'referral', `Referral bonus for inviting friend`);
  }
};

// Check and award milestones
// Update the checkMilestones method around line 220
userLoyaltySchema.methods.checkMilestones = async function(orderCount, totalOrderValue) {
  const milestoneRewards = {
    first_order: 100,
    orders_5: 250,
    orders_20: 500,
    orders_50: 1000,
    orders_100: 2000,
    value_10k: 300,
    value_50k: 1500,
    value_100k: 3000
  };

  const newMilestones = [];

  // Order count milestones - check >= instead of === to catch missed milestones
  if (orderCount >= 1 && !this.milestones.some(m => m.type === 'first_order')) {
    newMilestones.push('first_order');
  }
  if (orderCount >= 5 && !this.milestones.some(m => m.type === 'orders_5')) {
    newMilestones.push('orders_5');
  }
  if (orderCount >= 20 && !this.milestones.some(m => m.type === 'orders_20')) {
    newMilestones.push('orders_20');
  }
  if (orderCount >= 50 && !this.milestones.some(m => m.type === 'orders_50')) {
    newMilestones.push('orders_50');
  }
  if (orderCount >= 100 && !this.milestones.some(m => m.type === 'orders_100')) {
    newMilestones.push('orders_100');
  }

  // Order value milestones
  if (totalOrderValue >= 10000 && !this.milestones.some(m => m.type === 'value_10k')) {
    newMilestones.push('value_10k');
  }
  if (totalOrderValue >= 50000 && !this.milestones.some(m => m.type === 'value_50k')) {
    newMilestones.push('value_50k');
  }
  if (totalOrderValue >= 100000 && !this.milestones.some(m => m.type === 'value_100k')) {
    newMilestones.push('value_100k');
  }

  // Award new milestones
  newMilestones.forEach(milestone => {
    const reward = milestoneRewards[milestone];
    this.milestones.push({
      type: milestone,
      rewardEarned: reward
    });
    this.addCoins(reward, 'bonus', `Milestone reward: ${milestone}`);
  });

  return newMilestones;
};

userLoyaltySchema.methods.addCoupon = function(couponProgramId, awardedBy, reason) {
  this.coupons.push({
    couponProgram: couponProgramId,
    awardedBy,
    reason,
    used: false
  });
  
  this.transactions.push({
    type: 'coupon_awarded',
    description: `Coupon awarded: ${reason}`,
    metadata: {
      couponProgramId,
      awardedBy,
      reason
    }
  });
};

// Use coupon
userLoyaltySchema.methods.useCoupon = function(couponId, orderId, discountApplied) {
  const coupon = this.coupons.id(couponId);
  if (!coupon || coupon.used) {
    throw new Error('Coupon not found or already used');
  }
  
  coupon.used = true;
  coupon.usedAt = new Date();
  coupon.usedInOrder = orderId;
  coupon.discountApplied = discountApplied;
  
  this.transactions.push({
    type: 'coupon_used',
    description: `Coupon used in order`,
    metadata: {
      couponId,
      orderId,
      discountApplied
    }
  });
};

// Get available coupons for user
userLoyaltySchema.methods.getAvailableCoupons = function() {
  return this.coupons.filter(coupon => !coupon.used);
};
// Expire old coins
userLoyaltySchema.methods.expireOldCoins = function() {
  const now = new Date();
  const expiredTransactions = this.transactions.filter(t => 
    t.type === 'earned' && t.expiresAt && t.expiresAt < now
  );

  let totalExpired = 0;
  expiredTransactions.forEach(t => {
    totalExpired += t.amount;
    this.transactions.push({
      type: 'expired',
      amount: -t.amount,
      description: `Coins expired from ${t.description}`,
      createdAt: now
    });
  });

  this.aggreCoins.balance -= totalExpired;
  return totalExpired;
};

module.exports = mongoose.model('UserLoyalty', userLoyaltySchema);