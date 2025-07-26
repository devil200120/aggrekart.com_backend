const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productId: {
    type: String,
    unique: true,
  },
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Product description is required']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['aggregate', 'sand', 'tmt_steel', 'bricks_blocks', 'cement']
  },
  subcategory: {
    type: String,
    required: [true, 'Subcategory is required']
  },
  brand: {
    type: String,
    required: function() {
      return ['tmt_steel', 'bricks_blocks', 'cement'].includes(this.category);
    }
  },
  specifications: {
    // For TMT Steel
    grade: {
      type: String,
      enum: ['FE-415', 'FE-500', 'FE-550', 'FE-600'],
      required: function() { return this.category === 'tmt_steel'; }
    },
    diameter: {
      type: String,
      enum: ['6mm', '8mm', '10mm', '12mm', '16mm', '20mm', '25mm', '32mm'],
      required: function() { return this.category === 'tmt_steel'; }
    },
    
    // For Cement
    cementGrade: {
      type: String,
      enum: ['33_grade', '43_grade', '53_grade'],
      required: function() { return this.category === 'cement'; }
    },
    cementType: {
      type: String,
      enum: ['OPC', 'PPC'],
      required: function() { return this.category === 'cement'; }
    },
    
    // For Bricks & Blocks
    size: {
      type: String,
      required: function() { return this.category === 'bricks_blocks'; }
    },
    
    // General specifications
    weight: Number,
    dimensions: {
      length: Number,
      width: Number,
      height: Number
    }
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  pricing: {
    basePrice: {
      type: Number,
      required: [true, 'Base price is required'],
      min: [0, 'Price cannot be negative']
    },
    unit: {
      type: String,
      required: [true, 'Unit is required'],
      enum: ['MT', 'bags', 'numbers']
    },
    minimumQuantity: {
      type: Number,
      required: [true, 'Minimum quantity is required'],
      min: [0.1, 'Minimum quantity must be at least 0.1']
    },
    includesGST: {
      type: Boolean,
      default: false
    },
    gstRate: {
      type: Number,
      default: 18,
      min: 0,
      max: 28
    },
    transportCost: {
      included: {
        type: Boolean,
        default: true
      },
      costPerKm: {
        type: Number,
        default: 0
      }
    }
  },
  stock: {
    available: {
      type: Number,
      required: true,
      min: 0
    },
    reserved: {
      type: Number,
      default: 0,
      min: 0
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
      min: 0
    }
  },
  images: [{
    url: {
      type: String,
      required: true
    },
    alt: String,
    isPrimary: {
      type: Boolean,
      default: false
    },
    cloudinaryId: String
  }],
  hsnCode: {
    type: String,
    required: [true, 'HSN code is required']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  deliveryTime: {
    type: String,
    required: [true, 'Delivery time is required']
  },
  tags: [String],
  reviews: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true
    },
    comment: String,
    images: [String],
    isVerifiedPurchase: {
      type: Boolean,
      default: false
    },
    helpfulCount: {
      type: Number,
      default: 0
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalReviews: {
    type: Number,
    default: 0
  },
  salesCount: {
    type: Number,
    default: 0
  },
  viewCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for better performance
productSchema.index({ category: 1, subcategory: 1 });
productSchema.index({ supplier: 1 });
productSchema.index({ 'pricing.basePrice': 1 });
productSchema.index({ averageRating: -1 });
productSchema.index({ salesCount: -1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ isActive: 1, isApproved: 1 });

// Text index for search
productSchema.index({
  name: 'text',
  description: 'text',
  tags: 'text',
  brand: 'text'
});

// Generate unique product ID
productSchema.pre('save', async function(next) {
  if (!this.productId) {
    const count = await mongoose.models.Product.countDocuments();
    this.productId = `PRD${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Ensure only one primary image
productSchema.pre('save', function(next) {
  if (this.images && this.images.length > 0) {
    let primaryCount = 0;
    this.images.forEach(image => {
      if (image.isPrimary) primaryCount++;
    });
    
    if (primaryCount === 0) {
      this.images[0].isPrimary = true;
    } else if (primaryCount > 1) {
      let primaryFound = false;
      this.images.forEach(image => {
        if (image.isPrimary && primaryFound) {
          image.isPrimary = false;
        } else if (image.isPrimary) {
          primaryFound = true;
        }
      });
    }
  }
  next();
});

// Calculate average rating
productSchema.methods.calculateAverageRating = function() {
  if (this.reviews.length === 0) {
    this.averageRating = 0;
    this.totalReviews = 0;
  } else {
    const sum = this.reviews.reduce((acc, review) => acc + review.rating, 0);
    this.averageRating = Number((sum / this.reviews.length).toFixed(1));
    this.totalReviews = this.reviews.length;
  }
};

// Calculate final price with GST and transport
productSchema.methods.calculateFinalPrice = function(quantity = 1, distance = 0) {
  let finalPrice = this.pricing.basePrice * quantity;
  
  // Add transport cost if not included
  if (!this.pricing.transportCost.included && distance > 0) {
    finalPrice += this.pricing.transportCost.costPerKm * distance;
  }
  
  // Add GST if not included
  if (!this.pricing.includesGST) {
    finalPrice += finalPrice * (this.pricing.gstRate / 100);
  }
  
  return Number(finalPrice.toFixed(2));
};

// Check if product is in stock
productSchema.methods.isInStock = function(quantity = 1) {
  const availableStock = this.stock.available - this.stock.reserved;
  return availableStock >= quantity;
};

// Static method to get products by category
productSchema.statics.getByCategory = function(category, options = {}) {
  const {
    limit = 10,
    sort = { createdAt: -1 },
    populate = 'supplier',
    filter = {}
  } = options;
  
  return this.find({ 
    category, 
    isActive: true, 
    isApproved: true,
    ...filter 
  })
    .populate(populate)
    .limit(limit)
    .sort(sort);
};

// Static method to search products
productSchema.statics.searchProducts = function(query, options = {}) {
  const {
    limit = 20,
    skip = 0,
    category,
    minPrice,
    maxPrice,
    rating,
    sort = { relevance: { $meta: 'textScore' } }
  } = options;
  
  const searchFilter = {
    $text: { $search: query },
    isActive: true,
    isApproved: true
  };
  
  if (category) searchFilter.category = category;
  if (minPrice || maxPrice) {
    searchFilter['pricing.basePrice'] = {};
    if (minPrice) searchFilter['pricing.basePrice'].$gte = minPrice;
    if (maxPrice) searchFilter['pricing.basePrice'].$lte = maxPrice;
  }
  if (rating) searchFilter.averageRating = { $gte: rating };
  
  return this.find(searchFilter, { score: { $meta: 'textScore' } })
    .populate('supplier', 'companyName dispatchLocation rating')
    .sort(sort)
    .skip(skip)
    .limit(limit);
};

module.exports = mongoose.model('Product', productSchema);
