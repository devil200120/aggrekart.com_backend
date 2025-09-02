const mongoose = require('mongoose');

const membershipConfigSchema = new mongoose.Schema({
  tier: {
    type: String,
    enum: ['silver', 'gold', 'platinum'],
    required: true,
    unique: true
  },
  requirements: {
    minOrders: {
      type: Number,
      required: true,
      default: 0
    },
    minSpending: {
      type: Number,
      required: true,
      default: 0
    }
  },
  benefits: {
    discountPercentage: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 50
    },
    freeDeliveryThreshold: {
      type: Number,
      required: true,
      default: 2000
    },
    aggreCoinsMultiplier: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      max: 5
    },
    prioritySupport: {
      type: Boolean,
      default: false
    },
    exclusiveDeals: {
      type: Boolean,
      default: false
    },
    earlyAccess: {
      type: Boolean,
      default: false
    }
  },
  milestoneRewards: {
    firstOrderReward: {
      type: Number,
      default: 100
    },
    tierUpgradeReward: {
      type: Number,
      default: 500
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for quick lookups
membershipConfigSchema.index({ tier: 1, isActive: 1 });

// Static method to get default configuration
membershipConfigSchema.statics.getDefaultConfig = function() {
  return [
    {
      tier: 'silver',
      requirements: { minOrders: 0, minSpending: 0 },
      benefits: {
        discountPercentage: 2,
        freeDeliveryThreshold: 2000,
        aggreCoinsMultiplier: 1,
        prioritySupport: false,
        exclusiveDeals: false,
        earlyAccess: false
      },
      milestoneRewards: { firstOrderReward: 100, tierUpgradeReward: 0 },
      isActive: true
    },
    {
      tier: 'gold',
      requirements: { minOrders: 20, minSpending: 50000 },
      benefits: {
        discountPercentage: 5,
        freeDeliveryThreshold: 1500,
        aggreCoinsMultiplier: 1.5,
        prioritySupport: true,
        exclusiveDeals: true,
        earlyAccess: false
      },
      milestoneRewards: { firstOrderReward: 100, tierUpgradeReward: 1000 },
      isActive: true
    },
    {
      tier: 'platinum',
      requirements: { minOrders: 50, minSpending: 200000 },
      benefits: {
        discountPercentage: 10,
        freeDeliveryThreshold: 1000,
        aggreCoinsMultiplier: 2,
        prioritySupport: true,
        exclusiveDeals: true,
        earlyAccess: true
      },
      milestoneRewards: { firstOrderReward: 100, tierUpgradeReward: 2000 },
      isActive: true
    }
  ];
};

// Method to validate tier progression
membershipConfigSchema.methods.validateTierProgression = function(allConfigs) {
  // Ensure higher tiers have higher requirements
  const silverConfig = allConfigs.find(c => c.tier === 'silver');
  const goldConfig = allConfigs.find(c => c.tier === 'gold');
  const platinumConfig = allConfigs.find(c => c.tier === 'platinum');

  if (!silverConfig || !goldConfig || !platinumConfig) {
    throw new Error('All tiers (silver, gold, platinum) must be configured');
  }

  // Validate order requirements progression
  if (goldConfig.requirements.minOrders <= silverConfig.requirements.minOrders) {
    throw new Error('Gold tier must require more orders than Silver tier');
  }
  if (platinumConfig.requirements.minOrders <= goldConfig.requirements.minOrders) {
    throw new Error('Platinum tier must require more orders than Gold tier');
  }

  // Validate spending requirements progression
  if (goldConfig.requirements.minSpending <= silverConfig.requirements.minSpending) {
    throw new Error('Gold tier must require more spending than Silver tier');
  }
  if (platinumConfig.requirements.minSpending <= goldConfig.requirements.minSpending) {
    throw new Error('Platinum tier must require more spending than Gold tier');
  }

  return true;
};

module.exports = mongoose.model('MembershipConfig', membershipConfigSchema);