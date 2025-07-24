const mongoose = require('mongoose');

const pilotSchema = new mongoose.Schema({
  pilotId: {
    type: String,
    unique: true,
    required: true
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    validate: {
      validator: function(v) {
        return /^[6-9]\d{9}$/.test(v);
      },
      message: 'Please provide a valid Indian phone number'
    }
  },
  email: {
    type: String,
    validate: {
      validator: function(v) {
        if (!v) return true;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Please provide a valid email'
    }
  },
  vehicleDetails: {
    registrationNumber: {
      type: String,
      required: [true, 'Vehicle registration number is required'],
      unique: true,
      validate: {
        validator: function(v) {
          return /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/.test(v.replace(/[-\s]/g, ''));
        },
        message: 'Please provide a valid vehicle registration number'
      }
    },
    vehicleType: {
      type: String,
      enum: ['truck', 'mini_truck', 'pickup', 'tractor', 'trailer'],
      required: true
    },
    capacity: {
      type: Number,
      required: [true, 'Vehicle capacity is required'],
      min: 1,
      max: 50 // in metric tons
    },
    insuranceValid: {
      type: Boolean,
      default: false
    },
    insuranceExpiry: Date,
    rcValid: {
      type: Boolean,
      default: false
    },
    rcExpiry: Date
  },
  drivingLicense: {
    number: {
      type: String,
      required: [true, 'Driving license number is required']
    },
    validTill: {
      type: Date,
      required: [true, 'License validity date is required']
    },
    isValid: {
      type: Boolean,
      default: false
    }
  },
  documents: [{
    type: {
      type: String,
      enum: ['license', 'rc', 'insurance', 'photo', 'aadhar']
    },
    url: String,
    verified: {
      type: Boolean,
      default: false
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
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
    }
  },
  totalDeliveries: {
    type: Number,
    default: 0
  },
  currentOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  workingAreas: [{
    pincode: String,
    area: String
  }],
  emergencyContact: {
    name: String,
    phoneNumber: String,
    relation: String
  }
}, {
  timestamps: true
});

// Generate unique pilot ID
pilotSchema.pre('save', async function(next) {
  if (!this.pilotId) {
    const count = await mongoose.models.Pilot.countDocuments();
    this.pilotId = `PIL${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Check if documents are valid
pilotSchema.methods.areDocumentsValid = function() {
  const now = new Date();
  return (
    this.drivingLicense.isValid &&
    this.drivingLicense.validTill > now &&
    this.vehicleDetails.rcValid &&
    this.vehicleDetails.rcExpiry > now &&
    this.vehicleDetails.insuranceValid &&
    this.vehicleDetails.insuranceExpiry > now
  );
};

// Update location
pilotSchema.methods.updateLocation = function(longitude, latitude) {
  this.currentLocation = {
    type: 'Point',
    coordinates: [longitude, latitude],
    lastUpdated: new Date()
  };
};

// Add rating
pilotSchema.methods.addRating = function(rating) {
  const total = (this.rating.average * this.rating.count) + rating;
  this.rating.count += 1;
  this.rating.average = Number((total / this.rating.count).toFixed(1));
};

module.exports = mongoose.model('Pilot', pilotSchema);