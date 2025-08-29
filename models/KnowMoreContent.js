const mongoose = require('mongoose');

const knowMoreContentSchema = new mongoose.Schema({
  // Unique identifier for the content
  contentId: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  
  // Content type - either 'product' or 'subcategory'
  type: {
    type: String,
    enum: ['product', 'subcategory'],
    required: true,
    index: true
  },
  
  // For products - links to specific product
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: function() { return this.type === 'product'; },
    index: true
  },
  
  // For subcategories - category and subcategory combination
  category: {
    type: String,
    enum: ['aggregate', 'sand', 'tmt_steel', 'bricks_blocks', 'cement'],
    required: function() { return this.type === 'subcategory'; },
    index: true
  },
  
  subcategory: {
    type: String,
    required: function() { return this.type === 'subcategory'; },
    index: true
  },
  
  // Main content structure
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  
  subtitle: {
    type: String,
    trim: true,
    maxlength: [300, 'Subtitle cannot exceed 300 characters']
  },
  
  // Rich content sections
  sections: [{
    heading: {
      type: String,
      required: true,
      trim: true,
      maxlength: [150, 'Section heading cannot exceed 150 characters']
    },
    content: {
      type: String,
      required: true,
      maxlength: [5000, 'Section content cannot exceed 5000 characters']
    },
    type: {
      type: String,
      enum: ['text', 'html', 'list', 'table'],
      default: 'text'
    },
    order: {
      type: Number,
      default: 0
    }
  }],
  
  // Media content
  images: [{
    url: {
      type: String,
      required: true
    },
    alt: {
      type: String,
      required: true
    },
    caption: String,
    order: {
      type: Number,
      default: 0
    },
    cloudinaryId: String
  }],
  
  videos: [{
    url: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true
    },
    thumbnail: String,
    duration: Number, // in seconds
    order: {
      type: Number,
      default: 0
    }
  }],
  
  // Key features/highlights
  highlights: [{
    icon: {
      type: String,
      required: true // emoji or icon class
    },
    title: {
      type: String,
      required: true,
      maxlength: [100, 'Highlight title cannot exceed 100 characters']
    },
    description: {
      type: String,
      required: true,
      maxlength: [300, 'Highlight description cannot exceed 300 characters']
    },
    order: {
      type: Number,
      default: 0
    }
  }],
  
  // Technical specifications (for products)
  specifications: [{
    name: {
      type: String,
      required: true
    },
    value: {
      type: String,
      required: true
    },
    unit: String,
    category: String, // group specifications
    order: {
      type: Number,
      default: 0
    }
  }],
  
  // FAQ section
  faqs: [{
    question: {
      type: String,
      required: true,
      maxlength: [300, 'FAQ question cannot exceed 300 characters']
    },
    answer: {
      type: String,
      required: true,
      maxlength: [1000, 'FAQ answer cannot exceed 1000 characters']
    },
    order: {
      type: Number,
      default: 0
    }
  }],
  // Add this field after the faqs field (around line 175):

// WordPress-like flexible content blocks
contentBlocks: [{
  id: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'heading', 'image', 'list', 'quote', 'video', 'spacer', 'divider'],
    required: true
  },
  content: mongoose.Schema.Types.Mixed, // Flexible content structure
  position: {
    type: Number,
    required: true
  },
  styles: {
    textAlign: String,
    fontSize: String,
    fontWeight: String,
    color: String,
    backgroundColor: String,
    margin: String,
    padding: String
  },
  settings: mongoose.Schema.Types.Mixed, // Block-specific settings
  createdAt: {
    type: Date,
    default: Date.now
  }
}],

  
  // Call to action
  cta: {
    enabled: {
      type: Boolean,
      default: true
    },
    text: {
      type: String,
      default: 'Learn More',
      maxlength: [50, 'CTA text cannot exceed 50 characters']
    },
    action: {
      type: String,
      enum: ['contact', 'quote', 'external_link', 'modal'],
      default: 'contact'
    },
    link: String, // for external_link action
    phoneNumber: String, // for contact action
    email: String // for contact action
  },
  
  // SEO and metadata
  metaTitle: {
    type: String,
    maxlength: [60, 'Meta title cannot exceed 60 characters']
  },
  
  metaDescription: {
    type: String,
    maxlength: [160, 'Meta description cannot exceed 160 characters']
  },
  
  keywords: [String],
  
  // Content management
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  publishedAt: {
    type: Date,
    default: Date.now
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Analytics
  viewCount: {
    type: Number,
    default: 0
  },
  
  clickCount: {
    type: Number,
    default: 0
  },
  
  lastViewedAt: Date,
  
  // Scheduling
  scheduledPublishAt: Date,
  scheduledUnpublishAt: Date

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient querying
knowMoreContentSchema.index({ type: 1, category: 1, subcategory: 1 });
knowMoreContentSchema.index({ type: 1, productId: 1 });
knowMoreContentSchema.index({ isActive: 1, publishedAt: -1 });
knowMoreContentSchema.index({ createdBy: 1, createdAt: -1 });

// Virtuals
knowMoreContentSchema.virtual('isPublished').get(function() {
  const now = new Date();
  return this.isActive && 
         this.publishedAt <= now &&
         (!this.scheduledUnpublishAt || this.scheduledUnpublishAt > now);
});

// Pre-save middleware
knowMoreContentSchema.pre('save', function(next) {
  // Generate contentId if not provided
  if (!this.contentId) {
    if (this.type === 'product') {
      this.contentId = `product_${this.productId}`;
    } else {
      this.contentId = `${this.category}_${this.subcategory}`.toLowerCase();
    }
  }
  
  // Sort arrays by order
  if (this.sections) {
    this.sections.sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  if (this.images) {
    this.images.sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  if (this.highlights) {
    this.highlights.sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  if (this.specifications) {
    this.specifications.sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  if (this.faqs) {
    this.faqs.sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  
  next();
});

// Static methods
knowMoreContentSchema.statics.getByProduct = function(productId) {
  return this.findOne({
    type: 'product',
    productId: productId,
    isActive: true,
    publishedAt: { $lte: new Date() }
  });
};

knowMoreContentSchema.statics.getBySubcategory = function(category, subcategory) {
  return this.findOne({
    type: 'subcategory',
    category: category,
    subcategory: subcategory,
    isActive: true,
    publishedAt: { $lte: new Date() }
  });
};

// Instance methods
knowMoreContentSchema.methods.incrementView = function() {
  this.viewCount += 1;
  this.lastViewedAt = new Date();
  return this.save();
};

knowMoreContentSchema.methods.incrementClick = function() {
  this.clickCount += 1;
  return this.save();
};

module.exports = mongoose.model('KnowMoreContent', knowMoreContentSchema);