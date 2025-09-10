const mongoose = require('mongoose');

const advancePaymentConfigSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['aggregate', 'sand', 'tmt_steel', 'bricks_blocks', 'cement'],
    required: true,
    unique: true
  },
  percentageOptions: [{
    percentage: {
      type: Number,
      required: true,
      min: 10,
      max: 100
    },
    label: {
      type: String,
      required: true,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  defaultPercentage: {
    type: Number,
    required: true,
    min: 10,
    max: 100
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
advancePaymentConfigSchema.index({ category: 1, isActive: 1 });

// Static method to get default configuration
advancePaymentConfigSchema.statics.getDefaultConfig = function() {
  return [
    {
      category: 'sand',
      percentageOptions: [
        { percentage: 25, label: 'Standard', isActive: true },
        { percentage: 50, label: 'Higher Security', isActive: true },
        { percentage: 75, label: 'Premium', isActive: true }
      ],
      defaultPercentage: 25,
      isActive: true
    },
    {
      category: 'aggregate',
      percentageOptions: [
        { percentage: 30, label: 'Standard', isActive: true },
        { percentage: 50, label: 'Secure', isActive: true },
        { percentage: 80, label: 'Premium', isActive: true }
      ],
      defaultPercentage: 30,
      isActive: true
    },
    {
      category: 'cement',
      percentageOptions: [
        { percentage: 40, label: 'Standard', isActive: true },
        { percentage: 60, label: 'Secure', isActive: true },
        { percentage: 90, label: 'Premium', isActive: true }
      ],
      defaultPercentage: 40,
      isActive: true
    },
    {
      category: 'tmt_steel',
      percentageOptions: [
        { percentage: 50, label: 'Standard', isActive: true },
        { percentage: 75, label: 'Secure', isActive: true },
        { percentage: 100, label: 'Full Payment', isActive: true }
      ],
      defaultPercentage: 50,
      isActive: true
    },
    {
      category: 'bricks_blocks',
      percentageOptions: [
        { percentage: 25, label: 'Standard', isActive: true },
        { percentage: 40, label: 'Secure', isActive: true },
        { percentage: 60, label: 'Premium', isActive: true }
      ],
      defaultPercentage: 25,
      isActive: true
    }
  ];
};

// Static method to get advance options for a specific category
advancePaymentConfigSchema.statics.getAdvanceOptionsForCategory = async function(category) {
  const config = await this.findOne({ category, isActive: true });
  
  if (!config) {
    // Return default options if no config found
    const defaultConfigs = this.getDefaultConfig();
    const defaultConfig = defaultConfigs.find(c => c.category === category);
    return defaultConfig || { 
      percentageOptions: [{ percentage: 25, label: 'Standard', isActive: true }],
      defaultPercentage: 25 
    };
  }
  
  return {
    percentageOptions: config.percentageOptions.filter(option => option.isActive),
    defaultPercentage: config.defaultPercentage
  };
};

module.exports = mongoose.model('AdvancePaymentConfig', advancePaymentConfigSchema);