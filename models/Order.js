const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productSnapshot: {
    name: String,
    description: String,
    category: String,
    subcategory: String,
    brand: String,
    hsnCode: String,
    imageUrl: String
  },
  quantity: {
    type: Number,
    required: true,
    min: 0.1
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0
  },
  specifications: {
    selectedVariant: String,
    customRequirements: String
  },
  actualQuantityDelivered: {
    type: Number,
    default: null
  },
  weighBillUrl: String
});

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  items: [orderItemSchema],
  
  // Pricing details
  pricing: {
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    transportCost: {
      type: Number,
      default: 0,
      min: 0
    },
    gstAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    commission: {
      type: Number,
      default: 0,
      min: 0
    },
    paymentGatewayCharges: {
      type: Number,
      default: 0,
      min: 0
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    }
  },
  
  // Address details
  deliveryAddress: {
    address: String,
    city: String,
    state: String,
    pincode: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  
  // Payment details - FIXED: Added 'cod' to enum
  payment: {
    method: {
      type: String,
      enum: ['cod', 'card', 'upi', 'netbanking', 'wallet'], // FIXED: Added 'cod'
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded', 'partial_refund'],
      default: 'pending'
    },
    transactionId: String, // Razorpay payment ID
    razorpayOrderId: String, // Razorpay order ID
    paymentGatewayResponse: mongoose.Schema.Types.Mixed,
    advancePercentage: {
      type: Number,
      min: 25,
      max: 100,
      default: 25
    },
    advanceAmount: {
      type: Number,
      min: 0
    },
    remainingAmount: {
      type: Number,
      min: 0
    },
    paidAt: Date,
    refundDetails: {
      amount: Number,
      reason: String,
      processedAt: Date,
      refundId: String
    }
  },
  
  // Order status and timeline - FIXED: Added 'confirmed' status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'processing', 'dispatched', 'delivered', 'cancelled'], // FIXED: Added 'confirmed'
    default: 'pending'
  },
  
  timeline: [{
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'preparing', 'processing', 'dispatched', 'delivered', 'cancelled'] // FIXED: Added 'confirmed'
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // Cooling period management
  coolingPeriod: {
    startTime: {
      type: Date,
      required: true,
      default: Date.now
    },
    endTime: {
  type: Date,
  required: false,  // ← Change this from true to false
  default: function() {
    // Default to 2 hours from now
    return new Date(Date.now() + (2 * 60 * 60 * 1000));
  }
},
    isActive: {
      type: Boolean,
      default: true
    },
    canModify: {
      type: Boolean,
      default: true
    }
  },
  
  // Delivery details
  delivery: {
    estimatedTime: String,
    actualDeliveryTime: Date,
    driverDetails: {
      name: String,
      phoneNumber: String,
      vehicleNumber: String
    },
    deliveryOTP: String,
    deliveryNotes: String
  },
  
  // Invoice details
  invoice: {
    invoiceNumber: String,
    generatedAt: Date,
    updatedAt: Date,
    isUpdated: {
      type: Boolean,
      default: false
    },
    originalInvoiceUrl: String,
    updatedInvoiceUrl: String
  },
  
  // Additional fields
  notes: String,
  internalNotes: String,
  customerRating: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    review: String,
    ratedAt: Date
  },
  
  // Cancellation details
  cancellation: {
    reason: String,
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    cancelledAt: Date,
    refundAmount: Number,
    deductionAmount: Number,
    deductionPercentage: Number
  }
}, {
  timestamps: true
});

// Indexes for better performance
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ supplier: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'coolingPeriod.endTime': 1 });
orderSchema.index({ orderId: 1 });
orderSchema.index({ 'payment.transactionId': 1 });
orderSchema.index({ 'payment.razorpayOrderId': 1 });

// Generate unique order ID
orderSchema.pre('save', async function(next) {
  if (!this.orderId) {
    const count = await mongoose.models.Order.countDocuments();
    this.orderId = `ORD${String(count + 1).padStart(8, '0')}`;
  }
  
  // Set cooling period end time (2 hours from start)
  if (!this.coolingPeriod.endTime) {
    this.coolingPeriod.endTime = new Date(
      this.coolingPeriod.startTime.getTime() + (2 * 60 * 60 * 1000)
    );
  }
  
  // Calculate advance and remaining amounts
  if (this.payment.advancePercentage && this.pricing.totalAmount) {
    this.payment.advanceAmount = Math.round(
      (this.pricing.totalAmount * this.payment.advancePercentage) / 100
    );
    this.payment.remainingAmount = this.pricing.totalAmount - this.payment.advanceAmount;
  }
  
  next();
});

// Method to check if cooling period is active
orderSchema.methods.isCoolingPeriodActive = function() {
  return this.coolingPeriod.isActive && 
         new Date() < this.coolingPeriod.endTime &&
         ['pending', 'confirmed', 'preparing'].includes(this.status);
};

// Method to update order status
orderSchema.methods.updateStatus = function(newStatus, note, updatedBy) {
  this.status = newStatus;
  this.timeline.push({
    status: newStatus,
    timestamp: new Date(),
    note,
    updatedBy
  });
  
  // Deactivate cooling period if status changes beyond preparing
  if (['processing', 'dispatched', 'delivered', 'cancelled'].includes(newStatus)) {
    this.coolingPeriod.isActive = false;
    this.coolingPeriod.canModify = false;
  }
};

// Method to calculate refund amount during cooling period
orderSchema.methods.calculateCoolingPeriodRefund = function() {
  if (!this.isCoolingPeriodActive()) {
    return { canRefund: false, message: 'Cooling period expired' };
  }
  
  const timeElapsed = new Date() - this.coolingPeriod.startTime;
  const totalCoolingTime = this.coolingPeriod.endTime - this.coolingPeriod.startTime;
  const elapsedPercentage = (timeElapsed / totalCoolingTime) * 100;
  
  let deductionPercentage = 0;
  
  // Deduction rules based on time elapsed
  if (elapsedPercentage <= 50) { // First hour (0-50%)
    deductionPercentage = 1; // 1% deduction
  } else { // Second hour (50-100%)
    deductionPercentage = 2; // 2% deduction
  }
  
  const deductionAmount = Math.round((this.payment.advanceAmount * deductionPercentage) / 100);
  const refundAmount = this.payment.advanceAmount - deductionAmount;
  
  return {
    canRefund: true,
    refundAmount,
    deductionAmount,
    deductionPercentage
  };
};

// Method to generate delivery OTP
orderSchema.methods.generateDeliveryOTP = function() {
  this.delivery.deliveryOTP = Math.floor(100000 + Math.random() * 900000).toString();
  return this.delivery.deliveryOTP;
};

// Static method to get orders with filters
orderSchema.statics.getOrdersWithFilters = function(filters = {}, options = {}) {
  const {
    page = 1,
    limit = 10,
    sort = { createdAt: -1 },
    populate = ['customer', 'supplier', 'items.product']
  } = options;
  
  const skip = (page - 1) * limit;
  
  return this.find(filters)
    .populate(populate.join(' '))
    .sort(sort)
    .skip(skip)
    .limit(limit);
};

module.exports = mongoose.model('Order', orderSchema);