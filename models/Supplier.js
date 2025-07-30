const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  supplierId: {
    type: String,
    unique: true,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Business Details
  // Replace the gstNumber field definition (around line 15-25):

gstNumber: {
  type: String,
  sparse: true, // Allows multiple null values, but unique non-null values
  unique: true,
  validate: {
    validator: function(v) {
      // Allow empty/null GST numbers
      if (!v || v === '') return true;
      return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v);
    },
    message: 'Please provide a valid GST number'
  }
},
  companyName: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true
  },
  companyAddress: {
    type: String,
    required: [true, 'Company address is required']
  },
  panNumber: {
    type: String,
    validate: {
      validator: function(v) {
        if (!v) return true;
        return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v);
      },
      message: 'Please provide a valid PAN number'
    }
  },
  state: {
    type: String,
    required: [true, 'State is required']
  },
  city: {
    type: String,
    required: [true, 'City is required']
  },
  pincode: {
    type: String,
    required: [true, 'Pincode is required'],
    validate: {
      validator: function(v) {
        return /^[1-9][0-9]{5}$/.test(v);
      },
      message: 'Please provide a valid pincode'
    }
  },
  
  // Contact Details
  tradeOwnerName: {
    type: String,
    required: [true, 'Trade owner name is required']
  },
  contactPersonName: {
    type: String,
    required: [true, 'Contact person name is required']
  },
  contactPersonNumber: {
    type: String,
    required: [true, 'Contact person number is required'],
    validate: {
      validator: function(v) {
        return /^[6-9]\d{9}$/.test(v);
      },
      message: 'Please provide a valid contact number'
    }
  },
  businessNumber: {
    type: String,
    required: [true, 'Business number is required'],
    validate: {
      validator: function(v) {
        return /^[6-9]\d{9}$/.test(v);
      },
      message: 'Please provide a valid business number'
    }
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Please provide a valid email'
    }
  },
  
  // Location Details
  // Around line 108-125, update the dispatchLocation schema:

// COMPLETELY REPLACE the dispatchLocation section (around line 107-126):

  // Location Details
  // REPLACE the dispatchLocation section (around line 107-126):

  // Location Details
  dispatchLocation: {
    address: {
      type: String,
      required: [true, 'Dispatch address is required']
    },
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0],
      index: '2dsphere'
    }
  },  
  // Bank Details
  bankDetails: {
    bankName: {
      type: String,
      required: [true, 'Bank name is required']
    },
    accountNumber: {
      type: String,
      required: [true, 'Account number is required']
    },
    ifscCode: {
      type: String,
      required: [true, 'IFSC code is required'],
      validate: {
        validator: function(v) {
          return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v);
        },
        message: 'Please provide a valid IFSC code'
      }
    },
    branchName: {
      type: String,
      required: [true, 'Branch name is required']
    },
    // Supplier can only modify these fields
supplierControls: {
  pricing: {
    basePrice: {
      type: Number,
      required: true
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  deliveryTime: {
    estimatedTime: String,
    lastUpdated: Date,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  stock: {
    available: Number,
    lastUpdated: Date,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }
},
// Admin controls base product creation
isBaseProduct: {
  type: Boolean,
  default: false // Only admin creates base products
},
createdByAdmin: {
  type: Boolean,
  default: false
},
    // Around line 155, update the upiId field:

// REPLACE the upiId field (around line 154-162):

    upiId: {
      type: String,
      required: false,
      validate: {
        validator: function(v) {
          if (!v) return true;
          return /^[\w\.\-_]{3,}@[a-zA-Z]{3,}$/.test(v);
        },
        message: 'Please provide a valid UPI ID'
      }
    }
  },
  
  // Transport Rates
  transportRates: {
    upTo5km: {
      costPerKm: {
        type: Number,
        min: 0,
        default: 0
      },
      estimatedDeliveryTime: {
        type: String,
        default: '2-4 hours'
      }
    },
    upTo10km: {
      costPerKm: {
        type: Number,
        min: 0,
        default: 0
      },
      estimatedDeliveryTime: {
        type: String,
        default: '4-6 hours'
      }
    },
    upTo20km: {
      costPerKm: {
        type: Number,
        min: 0,
        default: 0
      },
      estimatedDeliveryTime: {
        type: String,
        default: '6-8 hours'
      }
    },
    above20km: {
      costPerKm: {
        type: Number,
        min: 0,
        default: 0
      },
      estimatedDeliveryTime: {
        type: String,
        default: '1-2 days'
      }
    }
  },
  
  // Business Settings
  commissionRate: {
    type: Number,
    default: 5,
    min: 0,
    max: 100
  },
  
  // Status
  isApproved: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Approval/Rejection Details
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: Date,
  rejectionReason: String,
  
  // Documents
  documentsUploaded: [{
    type: {
      type: String,
      enum: ['gst_certificate', 'pan_card', 'bank_statement', 'address_proof', 'license']
    },
    url: String,
    originalName: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    isVerified: {
      type: Boolean,
      default: false
    }
  }],
  
  // GST Verification
  gstVerificationDetails: {
    legalName: String,
    tradeName: String,
    registrationDate: Date,
    status: String,
    taxpayerType: String,
    lastUpdated: Date,
    isVerified: {
      type: Boolean,
      default: false
    }
  },
  
  // Performance Metrics
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    },
    breakdown: {
      5: { type: Number, default: 0 },
      4: { type: Number, default: 0 },
      3: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      1: { type: Number, default: 0 }
    }
  },
  totalOrders: {
    type: Number,
    default: 0
  },
  totalRevenue: {
    type: Number,
    default: 0
  },
  completedOrders: {
    type: Number,
    default: 0
  },
  cancelledOrders: {
    type: Number,
    default: 0
  },
  
  // Service Areas (pincodes where they deliver)
  serviceAreas: [{
    pincode: String,
    area: String,
    deliveryCharges: Number,
    estimatedTime: String
  }],
  
  // Product Categories they deal with
  categories: [{
    type: String,
    enum: ['aggregate', 'sand', 'tmt_steel', 'bricks_blocks', 'cement']
  }],
  
  // Settings
  settings: {
    acceptOnlinePayments: {
      type: Boolean,
      default: true
    },
    minimumOrderValue: {
      type: Number,
      default: 0
    },
    autoAcceptOrders: {
      type: Boolean,
      default: false
    },
    workingHours: {
      start: {
        type: String,
        default: '09:00'
      },
      end: {
        type: String,
        default: '18:00'
      }
    },
    workingDays: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      default: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    }]
  }
}, {
  timestamps: true
});

// Indexes
supplierSchema.index({ gstNumber: 1 });
supplierSchema.index({ 'dispatchLocation.coordinates': '2dsphere' });
supplierSchema.index({ isApproved: 1, isActive: 1 });
supplierSchema.index({ categories: 1 });
supplierSchema.index({ 'serviceAreas.pincode': 1 });

// Generate unique supplier ID
supplierSchema.pre('save', async function(next) {
  if (!this.supplierId) {
    const count = await mongoose.models.Supplier.countDocuments();
    this.supplierId = `SUP${String(count + 1).padStart(6, '0')}`;
  }
  
  // Set coordinates format for geospatial queries
  if (this.dispatchLocation && this.dispatchLocation.coordinates) {
    if (!this.dispatchLocation.coordinates.type) {
      this.dispatchLocation.coordinates = {
        type: 'Point',
        coordinates: [
          this.dispatchLocation.coordinates.longitude,
          this.dispatchLocation.coordinates.latitude
        ]
      };
    }
  }
  
  next();
});

// Method to calculate average rating
supplierSchema.methods.calculateAverageRating = function() {
  const total = this.rating.breakdown[5] * 5 + 
                this.rating.breakdown[4] * 4 + 
                this.rating.breakdown[3] * 3 + 
                this.rating.breakdown[2] * 2 + 
                this.rating.breakdown[1] * 1;
  
  this.rating.count = Object.values(this.rating.breakdown).reduce((sum, count) => sum + count, 0);
  this.rating.average = this.rating.count > 0 ? Number((total / this.rating.count).toFixed(1)) : 0;
};

// Method to add rating
supplierSchema.methods.addRating = function(rating) {
  this.rating.breakdown[rating] += 1;
  this.calculateAverageRating();
};

// Method to check if supplier can deliver to pincode
supplierSchema.methods.canDeliverTo = function(pincode) {
  return this.serviceAreas.some(area => area.pincode === pincode);
};

// Method to get delivery info for pincode
supplierSchema.methods.getDeliveryInfo = function(pincode) {
  return this.serviceAreas.find(area => area.pincode === pincode);
};

// Method to calculate distance from location
supplierSchema.methods.calculateDistance = function(latitude, longitude) {
  const [suppLng, suppLat] = this.dispatchLocation.coordinates.coordinates;
  
  const R = 6371; // Radius of Earth in kilometers
  const dLat = (latitude - suppLat) * Math.PI / 180;
  const dLng = (longitude - suppLng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(suppLat * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c; // Distance in kilometers
};

// Static method to find suppliers near location
supplierSchema.statics.findNearby = function(latitude, longitude, maxDistance = 10) {
  return this.aggregate([
    {
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [longitude, latitude]
        },
        distanceField: "distance",
        maxDistance: maxDistance * 1000, // Convert km to meters
        query: { isApproved: true, isActive: true },
        spherical: true
      }
    },
    {
      $addFields: {
        distance: { $divide: ["$distance", 1000] } // Convert back to km
      }
    }
  ]);
};

module.exports = mongoose.model('Supplier', supplierSchema);
