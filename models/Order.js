const mongoose = require('mongoose');
const loyaltyService = require('../utils/loyaltyService');

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
    imageUrl: String,
    images: [{
      url: String,
      alt: String,
      isPrimary: {
        type: Boolean,
        default: false
      },
      cloudinaryId: String
    }]
  },
  distancePricing: {
  supplierLocation: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: String
  },
  customerLocation: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: String
  },
  distance: {
    value: { type: Number, required: true }, // in km
    source: { type: String, enum: ['google', 'haversine'], required: true }
  },
  transportCost: { type: Number, required: true },
  deliveryZone: { type: String, enum: ['0-5km', '5-10km', '10-20km', '20km+'], required: true },
  deliveryEstimate: {
    min: Number, // minimum hours
    max: Number, // maximum hours
    estimatedDate: Date
  }
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
  

// Payment details - Updated for Production
payment: {
  method: {
    type: String,
    enum: ['cod', 'card', 'upi', 'netbanking', 'wallet', 'razorpay', 'cashfree', 'paytm'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded', 'partial_refund'],
    default: 'pending'
  },
  gateway: {
    type: String,
    enum: ['razorpay', 'cashfree', 'paytm', 'cod'],
    default: 'cod'
  },
  transactionId: {
    type: String,
    index: true // Add index for faster queries
  },
  razorpayOrderId: String,
  cashfreeOrderId: {
    type: String,
    index: true // Add index for webhook lookups
  },
  sessionId: String, // Cashfree payment session ID
  paytmTxnId: String,
  paymentGatewayResponse: mongoose.Schema.Types.Mixed,
  advancePercentage: {
    type: Number,
    min: 25,
    max: 100,
    default: 25
  },
  advanceAmount: {
    type: Number,
    min: 0,
    required: function() {
      return this.method !== 'cod';
    }
  },
  remainingAmount: {
    type: Number,
    default: function() {
      if (this.method === 'cod') return 0;
      return this.parent().pricing.totalAmount - (this.advanceAmount || 0);
    }
  },
  paidAt: Date,
  failureReason: String, // Store payment failure reasons
  refundDetails: [{
    refundId: String,
    amount: Number,
    reason: String,
    status: String,
    processedAt: Date,
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }]
},

// ...rest of existing schema...
  // Order status and timeline - FIXED: Added 'confirmed' status
 // Update the status enum (around lines 180-185):

  status: {
    type: String,
    enum: ['pending_payment', 'pending', 'confirmed', 'preparing', 'material_loading', 'processing', 'dispatched', 'delivered', 'cancelled'],
    default: 'pending'
  },
  
  timeline: [{
   status: {
  type: String,
  enum: ['pending_payment', 'pending', 'confirmed', 'preparing', 'material_loading', 'processing', 'dispatched', 'delivered', 'cancelled']
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
    pilotAssigned: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pilot',
      default: null
    },
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
   this.payment.remainingAmount = Math.max(0, Math.round((this.pricing.totalAmount - this.payment.advanceAmount) * 100) / 100);
  }
  
  next();
});
orderSchema.methods.getDeliveryInfo = function() {
  if (!this.distancePricing) return null;

  return {
    distance: `${this.distancePricing.distance.value} km`,
    zone: this.distancePricing.deliveryZone,
    transportCost: this.distancePricing.transportCost,
    estimatedDelivery: this.distancePricing.deliveryEstimate.estimatedDate,
    deliveryRange: `${this.distancePricing.deliveryEstimate.min}-${this.distancePricing.deliveryEstimate.max} hours`
  };
};

// Method to check if cooling period is active
orderSchema.methods.isCoolingPeriodActive = function() {
  return this.coolingPeriod.isActive && 
         new Date() < this.coolingPeriod.endTime &&
         ['pending', 'confirmed', 'preparing'].includes(this.status);
};

// Method to update order status
orderSchema.methods.updateStatus = function(newStatus, note, updatedBy) {
  const previousStatus = this.status;
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

  // NEW: Award AggreCoins when order is delivered
  if (newStatus === 'delivered' && previousStatus !== 'delivered') {
    // Use setTimeout to avoid blocking the main operation
    setTimeout(async () => {
      try {
        const result = await loyaltyService.awardOrderCompletionCoins(
          this._id,
          this.customer,
          this.totalAmount
        );
        
        console.log(`🎉 AggreCoin Award Result for Order ${this._id}:`, result);
        
        // Send notification to customer about coins earned
        if (result.success && result.coinsAwarded > 0) {
          // Import notification service
          const { sendSMS } = require('../utils/notifications');
          
          // Get customer details
          const User = require('./User');
          const customer = await User.findById(this.customer);
          
          if (customer && customer.phoneNumber) {
            const message = `🎉 Congratulations! You've earned ${result.coinsAwarded} AggreCoins for your order! ${result.tierUpgrade?.upgraded ? `\n🌟 You've been upgraded to ${result.tierUpgrade.newTier.toUpperCase()} membership!` : ''}`;
            
            await sendSMS(customer.phoneNumber, message);
          }
        }
      } catch (error) {
        console.error('❌ Error awarding completion coins:', error);
      }
    }, 2000); // Delay by 2 seconds to ensure order is saved
  }
};

// ...existing code...

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
  // Method to start material loading phase
orderSchema.methods.startMaterialLoading = function(updatedBy) {
  if (!this.isCoolingPeriodActive()) {
    throw new Error('Cannot start material loading - cooling period expired');
  }
  
  this.updateStatus('material_loading', 'Material loading started within cooling period', updatedBy);
  this.coolingPeriod.isActive = false; // End cooling period
  this.coolingPeriod.canModify = false;
  
  return this;
};
  
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
orderSchema.methods.calculateTotalWithDistance = function() {
  const itemsTotal = this.items.reduce((sum, item) => {
    return sum + (item.quantity * item.priceAtTime);
  }, 0);

  const gstAmount = itemsTotal * (this.gstRate / 100);
  const transportCost = this.distancePricing?.transportCost || 0;
  
  return {
    itemsTotal,
    gstAmount,
    transportCost,
    totalAmount: itemsTotal + gstAmount + transportCost
  };
};

// Add this BEFORE the module.exports line (replace line 383)

// Pre-save middleware to handle floating point precision issues


module.exports = mongoose.model('Order', orderSchema);
