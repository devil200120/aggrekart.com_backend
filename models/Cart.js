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
  // ADD THESE FIELDS AFTER LINE 45 (after totalItems field)

  appliedCoupon: {
    code: String,
    programId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoyaltyProgram'
    },
    discountAmount: {
      type: Number,
      default: 0
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed']
    },
    discountValue: Number
  },
  
  appliedCoins: {
    amount: {
      type: Number,
      default: 0
    },
    discount: {
      type: Number,
      default: 0
    }
  },
  // Add this field after the appliedCoins field (around line 70):

  appliedSupplierPromotion: {
    promotionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SupplierPromotion'
    },
    title: String,
    discountAmount: {
      type: Number,
      default: 0
    },
    supplier: String,
    couponCode: String,
    appliedAt: {
      type: Date,
      default: Date.now
    }
  },
  
  finalAmount: {
    type: Number,
    default: 0
  },
  // ADD THESE LINES AFTER LINE 87 (after finalAmount field):

commission: {
  type: Number,
  default: 0,
  min: 0
},
commissionRate: {
  type: Number,
  default: 5,
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
      
      if (product.pricing && item.quantity < (product.pricing.minimumQuantity || 0)) { 
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

// Line 189 - ADD this new method AFTER the existing calculateTotals method:

cartSchema.methods.calculateGSTBreakdown = async function(customerState, supplierState = null) {
  const { calculateGST, extractStateFromGST } = require('../utils/gstCalculator');
  
  await this.populate([
    {
      path: 'items.product',
      populate: {
        path: 'supplier',
        select: 'state gstNumber companyName'
      }
    }
  ]);

  const gstBreakdown = [];
  let totalGSTAmount = 0;

  // Group items by supplier
  const supplierGroups = {};
  
  for (const item of this.items) {
    const product = item.product;
    if (!product) continue;
    
    const supplierId = product.supplier?._id?.toString() || 'unknown';
    const supplierStateFromAddress = product.supplier?.state;
    const supplierStateFromGST = product.supplier?.gstNumber ? 
      extractStateFromGST(product.supplier.gstNumber) : null;
    
// BETTER FIX:
const finalSupplierState = supplierStateFromAddress || supplierState || supplierStateFromGST || 'Unknown';

    if (!supplierGroups[supplierId]) {
      supplierGroups[supplierId] = {
        supplier: product.supplier,
        supplierState: finalSupplierState,
        items: [],
        subtotal: 0
      };
    }
    
    supplierGroups[supplierId].items.push(item);
    supplierGroups[supplierId].subtotal += (item.quantity * item.priceAtTime);
  }
  
  // Calculate GST for each supplier group
  for (const [supplierId, group] of Object.entries(supplierGroups)) {
    const gstCalc = calculateGST(
      group.subtotal,
      customerState,
      group.supplierState,
      'construction'
    );
    
    gstBreakdown.push({
      supplierId,
      supplierName: group.supplier?.companyName || 'Unknown Supplier',
      supplierState: group.supplierState,
      customerState,
      subtotal: group.subtotal,
      ...gstCalc
    });
    
    totalGSTAmount += gstCalc.totalGstAmount;
  }
  
  return {
    gstBreakdown,
    totalGSTAmount,
    summary: {
      totalCGST: gstBreakdown.reduce((sum, item) => sum + (item.cgst?.amount || 0), 0),
      totalSGST: gstBreakdown.reduce((sum, item) => sum + (item.sgst?.amount || 0), 0),
      totalIGST: gstBreakdown.reduce((sum, item) => sum + (item.igst?.amount || 0), 0)
    }
  };
};
cartSchema.methods.calculateTotals = async function() {
  let totalAmount = 0;
  let totalItems = 0;
  
  for (let item of this.items) {
    if (item.quantity && item.priceAtTime && !isNaN(item.quantity) && !isNaN(item.priceAtTime)) {
      totalAmount += item.quantity * item.priceAtTime;
      totalItems += item.quantity;
    }
  }
  
  this.totalAmount = Math.round(totalAmount * 100) / 100;
  this.totalItems = totalItems;
  
  // ✅ CALCULATE 5% COMMISSION
  this.commission = Math.round((this.totalAmount * (this.commissionRate || 5)) / 100);
  
  // Calculate final amount with ALL charges and discounts
  let finalAmount = this.totalAmount + this.commission;
  
  // Apply coupon discount
  if (this.appliedCoupon && this.appliedCoupon.discountAmount) {
    finalAmount -= this.appliedCoupon.discountAmount;
  }
  
  // Apply coin discount
  if (this.appliedCoins && this.appliedCoins.discount) {
    finalAmount -= this.appliedCoins.discount;
  }
  
  // Apply supplier promotion discount
  if (this.appliedSupplierPromotion && this.appliedSupplierPromotion.discountAmount) {
    finalAmount -= this.appliedSupplierPromotion.discountAmount;
  }
  
  this.finalAmount = Math.max(0, Math.round(finalAmount * 100) / 100);
  
  return { 
    totalAmount: this.totalAmount, 
    totalItems: this.totalItems,
    commission: this.commission,
    finalAmount: this.finalAmount 
  };
};

module.exports = mongoose.model('Cart', cartSchema);