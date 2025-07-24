const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: [0.1, 'Quantity must be at least 0.1']
  },
  priceAtTime: {
    type: Number,
    required: true,
    min: 0
  },
  specifications: {
    // For products with variants (like TMT steel diameter)
    selectedVariant: String,
    customRequirements: String
  }
}, {
  timestamps: true
});

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [cartItemSchema],
  totalAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalItems: {
    type: Number,
    default: 0,
    min: 0
  },
  deliveryAddress: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User.addresses'
  },
  estimatedDeliveryTime: String,
  notes: String,
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Update totals before saving
cartSchema.pre('save', function(next) {
  this.totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);
  this.totalAmount = this.items.reduce((sum, item) => sum + (item.quantity * item.priceAtTime), 0);
  this.lastUpdated = new Date();
  next();
});

// Method to clear expired items
cartSchema.methods.removeExpiredItems = async function() {
  const validProductIds = [];
  
  for (let item of this.items) {
    const product = await mongoose.model('Product').findById(item.product);
    if (product && product.isActive && product.isApproved) {
      validProductIds.push(item.product.toString());
    }
  }
  
  this.items = this.items.filter(item => 
    validProductIds.includes(item.product.toString())
  );
};

// Method to validate item quantities against stock
cartSchema.methods.validateStock = async function() {
  const stockIssues = [];
  
  for (let item of this.items) {
    const product = await mongoose.model('Product').findById(item.product);
    if (product) {
      const availableStock = product.stock.available - product.stock.reserved;
      if (item.quantity > availableStock) {
        stockIssues.push({
          productId: item.product,
          productName: product.name,
          requestedQuantity: item.quantity,
          availableQuantity: availableStock
        });
      }
      
      if (item.quantity < product.pricing.minimumQuantity) {
        stockIssues.push({
          productId: item.product,
          productName: product.name,
          requestedQuantity: item.quantity,
          minimumQuantity: product.pricing.minimumQuantity,
          type: 'minimum_quantity'
        });
      }
    }
  }
  
  return stockIssues;
};

module.exports = mongoose.model('Cart', cartSchema);