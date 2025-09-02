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
  required: function() {
    return !(this.isBaseProduct && this.createdByAdmin);
  },
  validate: {
    validator: function(value) {
      if (this.isBaseProduct && this.createdByAdmin) return true;
      if (!value) return false;
      
      // More flexible validation - accept both keys and display names
      const validSubcategories = {
  'aggregate': [
    'stone_aggregate', 'Stone Aggregate', // Accept both key and display name
    'dust', 'Dust',
    '10_mm_metal', '10 MM Metal',
    '20_mm_metal', '20 MM Metal', 
    '40_mm_metal', '40 MM Metal',
    'gsb', 'GSB',
    'wmm', 'WMM',
    'm_sand', 'M.sand', 'M Sand'
  ],
  'sand': [
    'river_sand_plastering', 'River sand (Plastering)', 'River Sand (Plastering)',
    'river_sand', 'River sand', 'River Sand'
  ],
  'tmt_steel': [
    'fe_415', 'FE-415', 'fe-415',
    'fe_500', 'FE-500', 'fe-500',
    'fe_550', 'FE-550', 'fe-550', 
    'fe_600', 'FE-600', 'fe-600'
  ],
  'bricks_blocks': [
    'solid_blocks', 'Solid Blocks',
    'hollow_blocks', 'Hollow Blocks',
    'aac_blocks', 'AAC Blocks',
    'fly_ash_bricks', 'Fly Ash Bricks',
    'clay_bricks', 'Clay Bricks'
  ],
  'cement': [
    'opc_53', 'OPC 53 Grade',
    'opc_43', 'OPC 43 Grade', 
    'ppc', 'PPC',
    'white_cement', 'White Cement'
  ]
};
      
      const categorySubcategories = validSubcategories[this.category];
      return categorySubcategories && categorySubcategories.includes(value);
    },
    message: function(props) {
      return `Invalid subcategory "${props.value}" for category "${this.category}"`;
    }
  }
},
    brand: {
    type: String,
    required: function() {
      return ['tmt_steel', 'bricks_blocks', 'cement'].includes(this.category) && !(this.isBaseProduct && this.createdByAdmin);
    }
  },
  // Update the specifications section around lines 33-65:

specifications: {
  // For TMT Steel
  grade: {
    type: String,
    enum: ['FE-415', 'FE-500', 'FE-550', 'FE-600'],
    required: function() { 
      return this.category === 'tmt_steel' && !(this.isBaseProduct && this.createdByAdmin); 
    }
  },
  diameter: {
    type: String,
        enum: ['6mm', '8mm', '10mm', '12mm', '16mm', '20mm', '25mm', '32mm', '6', '8', '10', '12', '16', '20', '25', '32'],

    required: function() { 
      return this.category === 'tmt_steel' && !(this.isBaseProduct && this.createdByAdmin); 
    }
  },
  
  // For Cement
  cementGrade: {
    type: String,
    enum: ['33_grade', '43_grade', '53_grade'],
    required: function() { 
      return this.category === 'cement' && !(this.isBaseProduct && this.createdByAdmin); 
    }
  },
  cementType: {
    type: String,
    enum: ['OPC', 'PPC'],
    required: function() { 
      return this.category === 'cement' && !(this.isBaseProduct && this.createdByAdmin); 
    }
  },
  
  // For Bricks & Blocks
  size: {
    type: String,
    required: function() { 
      return this.category === 'bricks_blocks' && !(this.isBaseProduct && this.createdByAdmin); 
    }
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
    required: function() {
      return !(this.isBaseProduct && this.createdByAdmin);
    }
  },
  pricing: {
       basePrice: {
      type: Number,
      required: function() {
        return !(this.isBaseProduct && this.createdByAdmin);
      },
      min: [0, 'Price cannot be negative'],
      default: 0
    },
    unit: {
      type: String,
      required: [true, 'Unit is required'],
      enum: ['MT', 'bags', 'numbers']
    },
      minimumQuantity: {
      type: Number,
      required: function() {
        return !(this.isBaseProduct && this.createdByAdmin);
      },
      min: [0.1, 'Minimum quantity must be at least 0.1'],
      default: 1
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
      required: function() {
        return !(this.isBaseProduct && this.createdByAdmin);
      },
      min: 0,
      default: 0
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
    required: false
  },
    // Admin control fields
  isBaseProduct: {
    type: Boolean,
    default: false
  },
  createdByAdmin: {
    type: Boolean,
    default: false
  },
  adminUploaded: {
    type: Boolean,
    default: false
  },
  
supplierCanModify: {
  type: Boolean,
  default: false // Admin controls if supplier can modify
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
    required: function() {
      return !(this.isBaseProduct && this.createdByAdmin);
    },
    default: 'To be set by supplier'
  },
  // Add these fields around line 190 (after deliveryTime field):

  // Approval tracking
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  approvalNotes: String,
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: Date,
  rejectionReason: String,
  isFeatured: {
    type: Boolean,
    default: false
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
productSchema.index({ isBaseProduct: 1, createdByAdmin: 1 });

// Text index for search
productSchema.index({
  name: 'text',
  description: 'text',
  tags: 'text',
  brand: 'text'
});

// Generate unique product ID
// Replace the existing pre-save middleware (around line 219-225) with this:

// Generate unique product ID - FIXED VERSION
productSchema.pre('save', async function(next) {
  if (!this.productId) {
    try {
      // Use a more robust method to generate unique IDs
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10;
      
      while (!isUnique && attempts < maxAttempts) {
        // Generate a random number component to avoid duplicates
        const randomComponent = Math.floor(Math.random() * 1000);
        const timestamp = Date.now().toString().slice(-4);
        const count = await mongoose.models.Product.countDocuments();
        
        // Combine multiple factors for uniqueness
        const idNumber = count + 1 + randomComponent;
        const candidateId = `PRD${String(idNumber).padStart(6, '0')}${timestamp.slice(-2)}`;
        
        // Check if this ID already exists
        const existingProduct = await mongoose.models.Product.findOne({ productId: candidateId });
        
        if (!existingProduct) {
          this.productId = candidateId;
          isUnique = true;
        }
        
        attempts++;
      }
      
      // Fallback: use UUID-like approach if all attempts failed
      if (!isUnique) {
        const uuid = require('crypto').randomBytes(4).toString('hex').toUpperCase();
        this.productId = `PRD${uuid}`;
      }
      
      console.log('✅ Generated productId:', this.productId);
      
    } catch (error) {
      console.error('❌ ProductId generation error:', error);
      // Fallback to timestamp-based ID
      this.productId = `PRD${Date.now()}`;
    }
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
  // Fix: Ensure we never have negative available stock
  const available = Math.max(0, this.stock.available || 0);
  const reserved = Math.max(0, this.stock.reserved || 0);
  
  // Calculate actual available stock (never negative)
  const actualAvailable = Math.max(0, available - reserved);
  
  return actualAvailable >= quantity;
};
productSchema.methods.getAvailableStock = function() {
  const available = Math.max(0, this.stock.available || 0);
  const reserved = Math.max(0, this.stock.reserved || 0);
  return Math.max(0, available - reserved);
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
// Find the searchProducts method around line 433 and replace it with:

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
    isApproved: true,
    // 🚫 ONLY SHOW PRODUCTS WITH AVAILABLE STOCK
    
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
// Add these methods before module.exports (around line 390):

// Method to get display price
productSchema.methods.getDisplayPrice = function() {
  return this.pricing?.basePrice || 0;
};

// Method to get price with GST
productSchema.methods.getPriceWithGST = function() {
  const basePrice = this.pricing?.basePrice || 0;
  if (this.pricing?.includesGST) {
    return basePrice;
  }
  const gstRate = this.pricing?.gstRate || 18;
  return basePrice * (1 + gstRate / 100);
};

// Virtual for frontend compatibility
productSchema.virtual('price').get(function() {
  return this.pricing?.basePrice || 0;
});

// Ensure virtual fields are serialized
productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });


// Method to get display price
productSchema.methods.getDisplayPrice = function() {
  return this.pricing?.basePrice || 0;
};

// Method to get price with GST
productSchema.methods.getPriceWithGST = function() {
  const basePrice = this.pricing?.basePrice || 0;
  if (this.pricing?.includesGST) {
    return basePrice;
  }
  const gstRate = this.pricing?.gstRate || 18;
  return basePrice * (1 + gstRate / 100);
};

// Virtual for frontend compatibility
productSchema.virtual('price').get(function() {
  return this.pricing?.basePrice || 0;
});
// Add static method around line 500 (before module.exports):

// Static method to find products from enabled suppliers only
productSchema.statics.findActiveWithEnabledSuppliers = function(query = {}) {
  return this.aggregate([
    {
      $lookup: {
        from: 'suppliers',
        localField: 'supplier',
        foreignField: '_id',
        as: 'supplierInfo'
      }
    },
    {
      $match: {
        ...query,
        isActive: true,
        isApproved: true,
        'supplierInfo.profileEnabled': true,
        'supplierInfo.isActive': true,
        'supplierInfo.isApproved': true
      }
    },
    {
      $unwind: '$supplierInfo'
    }
  ]);
};
// Add these methods to your existing Product schema (after existing methods)

// ...existing code...

// ADD THESE METHODS:

// Calculate delivery cost to specific location
productSchema.methods.calculateDeliveryCost = async function(customerLocation, quantity = 1) {
  const distanceCalculator = require('../utils/distanceCalculator');
  
  // Get supplier location (assuming supplier has coordinates)
  await this.populate('supplier', 'coordinates businessAddress');
  
  if (!this.supplier.coordinates) {
    throw new Error('Supplier location not available');
  }

  const distanceInfo = await distanceCalculator.calculateDistanceGoogle(
    this.supplier.coordinates,
    customerLocation
  );

  const itemWeight = (this.specifications?.weight || 1) * quantity;
  const transportCost = distanceCalculator.calculateTransportCost(
    distanceInfo.distance,
    itemWeight
  );

  return {
    distance: distanceInfo.distance,
    duration: distanceInfo.duration,
    transportCost,
    totalWeight: itemWeight,
    zone: distanceCalculator.getDistanceZone(distanceInfo.distance)
  };
};

// Get delivery information for product
productSchema.methods.getDeliveryInfo = async function(customerLocation) {
  try {
    const deliveryInfo = await this.calculateDeliveryCost(customerLocation, 1);
    const distanceCalculator = require('../utils/distanceCalculator');
    const deliveryEstimate = distanceCalculator.getDeliveryEstimate(deliveryInfo.distance);

    return {
      available: true,
      distance: `${deliveryInfo.distance} km`,
      zone: deliveryInfo.zone,
      transportCost: deliveryInfo.transportCost,
      estimatedDelivery: deliveryEstimate,
      deliveryDate: {
        earliest: new Date(Date.now() + deliveryEstimate.min * 60 * 60 * 1000),
        latest: new Date(Date.now() + deliveryEstimate.max * 60 * 60 * 1000)
      }
    };
  } catch (error) {
    return {
      available: false,
      error: error.message
    };
  }
};

// ...existing code...

// Static method to check if product is visible (supplier profile enabled)
productSchema.methods.isVisible = async function() {
  if (this.isBaseProduct && this.createdByAdmin) {
    return this.isActive && this.isApproved;
  }
  
  const supplier = await mongoose.model('Supplier').findById(this.supplier);
  return this.isActive && 
         this.isApproved && 
         supplier && 
         supplier.isActive && 
         supplier.isApproved && 
         supplier.profileEnabled;
};

// Ensure virtual fields are serialized
productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
