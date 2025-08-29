const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { auth, authorize, canPlaceOrders } = require('../middleware/auth');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { ErrorHandler } = require('../utils/errorHandler');
const router = express.Router();
const User = require('../models/User');
const LoyaltyProgram = require('../models/LoyaltyProgram');
const UserLoyalty = require('../models/UserLoyalty'); // Add this import
const SupplierPromotion = require('../models/SupplierPromotion');
// REPLACE LINES 12-45 with:
const validateAndUpdatePromotions = async (cart) => {
  console.log('🔍 Validating existing promotions after cart change...');
  
  // Check supplier promotion validity
  if (cart.appliedSupplierPromotion) {
    try {
      const promotion = await SupplierPromotion.findById(cart.appliedSupplierPromotion.promotionId)
        .populate('supplier');
      
      if (!promotion) {
        console.log('❌ Supplier promotion no longer exists, removing...');
        cart.appliedSupplierPromotion = null;
        return;
      }
      
      // Populate cart items with supplier information
      await cart.populate({
        path: 'items.product',
        populate: {
          path: 'supplier',
          select: '_id companyName transportRates dispatchLocation'
        }
      });
      
      // Check if cart has products from the promotion's supplier
      const hasSupplierProducts = cart.items.some(item => 
        item.product?.supplier?._id.toString() === promotion.supplier._id.toString()
      );
      
      if (!hasSupplierProducts) {
        console.log('❌ No products from promotion supplier in cart, removing promotion...');
        cart.appliedSupplierPromotion = null;
        return;
      }
      
      // Check minimum order value (if promotion has this requirement)
      if (promotion.criteria?.minimumOrderValue && cart.totalAmount < promotion.criteria.minimumOrderValue) {
        console.log(`❌ Cart total (₹${cart.totalAmount}) below minimum required (₹${promotion.criteria.minimumOrderValue}), removing promotion...`);
        cart.appliedSupplierPromotion = null;
        return;
      }
      
      console.log('✅ Supplier promotion still valid');
      
    } catch (error) {
      console.error('Error validating supplier promotion:', error);
      // Remove promotion on error to be safe
      cart.appliedSupplierPromotion = null;
    }
  }
};
// @route   GET /api/cart
// @desc    Get user's cart
// @access  Private (Customer)
router.get('/', auth, authorize('customer'), async (req, res, next) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id })
      .populate({
        path: 'items.product',
        populate: {
          path: 'supplier',
          select: 'companyName dispatchLocation businessName transportRates '
        }
      });

    if (!cart) {
      try {
        cart = new Cart({ 
          user: req.user._id, 
          items: [],
          totalAmount: 0,
          totalItems: 0
        });
        await cart.save();
      } catch (createError) {
        if (createError.code === 11000) {
          cart = await Cart.findOne({ user: req.user._id });
          if (!cart) {
            await Cart.deleteMany({ user: req.user._id });
            cart = await Cart.create({ 
              user: req.user._id, 
              items: [],
              totalAmount: 0,
              totalItems: 0
            });
          }
        } else {
          throw createError;
        }
      }
    }
    // Remove expired/inactive products
        // Remove expired/inactive products
    try {
      if (cart.removeExpiredItems) {
        await cart.removeExpiredItems();
      }
    } catch (error) {
      console.error('Error removing expired items:', error);
    }
    
    // Validate stock for all items
    let stockIssues = [];
    try {
      if (cart.validateStock) {
        stockIssues = await cart.validateStock();
      }
    } catch (error) {
      console.error('Error validating stock:', error);
      stockIssues = [];
    }
    
    // Ensure all items have proper price structure
    cart.items.forEach(item => {
      if (item.product) {
        if (!item.priceAtTime && item.product.pricing?.basePrice) {
          item.priceAtTime = item.product.pricing.basePrice;
        }
        
        if (!item.price) {
          item.price = item.priceAtTime || item.product.pricing?.basePrice || 0;
        }
      }
    });

    // Recalculate totals
    try {
      if (cart.calculateTotals) {
        await cart.calculateTotals();
        await cart.save();
      }
    } catch (error) {
      console.error('Error calculating totals:', error);
      await cart.save();
    }

    // Recalculate totals
    if (cart.calculateTotals) {
      await cart.calculateTotals();
      await cart.save();
    }

    const cartResponse = cart.toObject();
    if (cartResponse.appliedCoins && (!cartResponse.appliedCoins.amount || cartResponse.appliedCoins.amount <= 0)) {
      delete cartResponse.appliedCoins;
    }

    res.json({
      success: true,
      data: { 
        cart: cartResponse,
        stockIssues: stockIssues.length > 0 ? stockIssues : undefined
      }
    });

  } catch (error) {
    console.error('❌ Cart fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve cart',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   POST /api/cart/items
// @desc    Add item to cart
// @access  Private (Customer)
router.post('/items', auth, authorize('customer'), [
  body('productId').notEmpty().withMessage('Product ID is required'),
  body('quantity').isFloat({ min: 0.1 }).withMessage('Quantity must be at least 0.1'),
  body('specifications.selectedVariant').optional().isString(),
  body('specifications.customRequirements').optional().isString()
], async (req, res, next) => {
  try {
    console.log('🛒 Adding item to cart for user:', req.user._id);
    console.log('📦 Request data:', req.body);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { productId, quantity, specifications } = req.body;

    // Find product with detailed error logging
    console.log('🔍 Looking for product:', productId);
    const product = await Product.findOne({
      $or: [{ _id: productId }, { productId }],
      isActive: true,
      isApproved: true
    }).populate('supplier');

    if (!product) {
      console.log('❌ Product not found or not available:', productId);
      return res.status(404).json({
        success: false,
        message: 'Product not found or not available'
      });
    }

    console.log('✅ Product found:', product.name);

    // Check minimum quantity
    if (quantity < product.pricing.minimumQuantity) {
      return res.status(400).json({
        success: false,
        message: `Minimum quantity for this product is ${product.pricing.minimumQuantity} ${product.pricing.unit}`
      });
    }

    // Check stock availability
    if (product.stock && !product.isInStock(quantity)) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Available: ${product.getAvailableStock()} ${product.pricing.unit}`
      });
    }

    // Find or create cart with better error handling
    let cart = await Cart.findOne({ user: req.user._id });
    
    if (!cart) {
      console.log('🛒 Creating new cart for user:', req.user._id);
      cart = new Cart({ 
        user: req.user._id, 
        items: [],
        totalAmount: 0,
        totalItems: 0
      });
      await cart.save();
      console.log('✅ New cart created:', cart._id);
    }

    // Check if item already exists in cart
    const existingItemIndex = cart.items.findIndex(
      item => item.product.toString() === product._id.toString()
    );

    if (existingItemIndex !== -1) {
      // Update existing item
      const newQuantity = cart.items[existingItemIndex].quantity + quantity;
      
      if (product.stock && !product.isInStock(newQuantity)) {
        return res.status(400).json({
          success: false,
          message: 'Cannot add more items. Total quantity would exceed available stock.'
        });
      }
      
      cart.items[existingItemIndex].quantity = newQuantity;
      cart.items[existingItemIndex].specifications = specifications || {};
      console.log('📝 Updated existing cart item');
    } else {
      // Add new item
      cart.items.push({
        product: product._id,
        quantity,
        priceAtTime: product.pricing.basePrice,
        specifications: specifications || {}
      });
      console.log('➕ Added new item to cart');
    }

    // Calculate totals
        // Calculate totals
    if (cart.calculateTotals) {
      await cart.calculateTotals();
    }

    // ✅ Validate existing promotions after cart change
    await validateAndUpdatePromotions(cart);

    // Recalculate totals after promotion validation
    if (cart.calculateTotals) {
      await cart.calculateTotals();
    }

    await cart.save();

    // Populate the cart for response
    await cart.populate({
      path: 'items.product',
      populate: {
        path: 'supplier',
         select: 'companyName transportRates dispatchLocation'
      }
    });

    console.log('✅ Cart updated successfully');

    res.json({
      success: true,
      message: 'Item added to cart successfully',
      data: { cart }
    });

  } catch (error) {
    console.error('❌ Cart add item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add item to cart',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   PUT /api/cart/items/:itemId
// @desc    Update cart item quantity
// @access  Private (Customer)
router.put('/items/:itemId', auth, authorize('customer'), [
  param('itemId').isMongoId().withMessage('Invalid item ID'),
  body('quantity').isFloat({ min: 0.1 }).withMessage('Quantity must be at least 0.1')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { itemId } = req.params;
    const { quantity } = req.body;

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
    }

    // Get product details for validation
    const product = await Product.findById(cart.items[itemIndex].product);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Validate quantity
    if (quantity < product.pricing.minimumQuantity) {
      return res.status(400).json({
        success: false,
        message: `Minimum quantity for this product is ${product.pricing.minimumQuantity} ${product.pricing.unit}`
      });
    }

    if (product.stock && !product.isInStock(quantity)) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Available: ${product.getAvailableStock()} ${product.pricing.unit}`
      });
    }

    // Update quantity
        // Update quantity
    cart.items[itemIndex].quantity = quantity;
    if (cart.calculateTotals) {
      await cart.calculateTotals();
    }

    // ✅ Validate existing promotions after cart change
    await validateAndUpdatePromotions(cart);

    // Recalculate totals after promotion validation
    if (cart.calculateTotals) {
      await cart.calculateTotals();
    }

    await cart.save();
    // Populate the cart for response
    await cart.populate({
      path: 'items.product',
      populate: {
        path: 'supplier',
         select: 'companyName transportRates dispatchLocation'
      }
    });

    res.json({
      success: true,
      message: 'Cart item updated successfully',
      data: { cart }
    });

  } catch (error) {
    console.error('❌ Cart update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cart item',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   DELETE /api/cart/items/:itemId
// @desc    Remove item from cart
// @access  Private (Customer)
router.delete('/items/:itemId', auth, authorize('customer'), [
  param('itemId').isMongoId().withMessage('Invalid item ID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { itemId } = req.params;

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
    }

        cart.items.splice(itemIndex, 1);
    if (cart.calculateTotals) {
      await cart.calculateTotals();
    }

    // ✅ Validate existing promotions after cart change
    await validateAndUpdatePromotions(cart);

    // Recalculate totals after promotion validation
    if (cart.calculateTotals) {
      await cart.calculateTotals();
    }

    await cart.save();

    res.json({
      success: true,
      message: 'Item removed from cart successfully',
      data: { cart }
    });

  } catch (error) {
    console.error('❌ Cart remove item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove item from cart',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   DELETE /api/cart
// @desc    Clear entire cart
// @access  Private (Customer)
router.delete('/', auth, authorize('customer'), async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    cart.items = [];
    if (cart.calculateTotals) {
      await cart.calculateTotals();
    }
    await cart.save();

    res.json({
      success: true,
      message: 'Cart cleared successfully',
      data: { cart }
    });

  } catch (error) {
    console.error('❌ Cart clear error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cart',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   POST /api/cart/validate
// @desc    Validate cart items before checkout
// @access  Private (Customer)
router.post('/validate', auth, authorize('customer'), canPlaceOrders, async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id })
      .populate('items.product');

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
    }

    // Validate all items
    if (cart.removeExpiredItems) {
      await cart.removeExpiredItems();
    }
    
    let stockIssues = [];
    if (cart.validateStock) {
      stockIssues = await cart.validateStock();
    }
    
    if (stockIssues.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart validation failed',
        errors: stockIssues
      });
    }

    // Group items by supplier
    const supplierGroups = {};
    cart.items.forEach(item => {
      const supplierId = item.product.supplier.toString();
      if (!supplierGroups[supplierId]) {
        supplierGroups[supplierId] = {
          supplier: item.product.supplier,
          items: [],
          subtotal: 0
        };
      }
      supplierGroups[supplierId].items.push(item);
      supplierGroups[supplierId].subtotal += item.quantity * item.priceAtTime;
    });

    const multipleSuppliers = Object.keys(supplierGroups).length > 1;

    res.json({
      success: true,
      message: 'Cart validation successful',
      data: {
        isValid: true,
        supplierGroups,
        multipleSuppliers,
        totalAmount: cart.totalAmount,
        totalItems: cart.totalItems
      }
    });

  } catch (error) {
    console.error('❌ Cart validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate cart',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});
// Add these routes to your cart.js file

// @route   POST /api/cart/apply-coupon
// @desc    Apply coupon to cart
// @access  Private (Customer)
router.post('/apply-coupon', 
  auth, 
  authorize('customer'),
  body('couponCode').notEmpty().withMessage('Coupon code is required'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { couponCode } = req.body;
      
      // Get user's cart
      const cart = await Cart.findOne({ user: req.user._id })
        .populate('items.product');
        
      if (!cart || cart.items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cart is empty'
        });
      }

      // Find the coupon program
      const couponProgram = await LoyaltyProgram.findOne({
        type: 'coupon',
        'couponDetails.code': couponCode.toUpperCase(),
        isActive: true
      });

      if (!couponProgram) {
        return res.status(400).json({
          success: false,
          message: 'Invalid coupon code'
        });
      }

      // Check if coupon is valid
      const now = new Date();
      if (now < couponProgram.conditions.validFrom || now > couponProgram.conditions.validTill) {
        return res.status(400).json({
          success: false,
          message: 'Coupon has expired or not yet active'
        });
      }

      // Check minimum order value
      if (cart.totalAmount < couponProgram.couponDetails.minOrderAmount) {
        return res.status(400).json({
          success: false,
          message: `Minimum order value of ₹${couponProgram.couponDetails.minOrderAmount} required`
        });
      }

      // Check if user is eligible
      if (couponProgram.couponDetails.customerTypes.length > 0 && 
          !couponProgram.couponDetails.customerTypes.includes(req.user.customerType)) {
        return res.status(400).json({
          success: false,
          message: 'You are not eligible for this coupon'
        });
      }

      // Calculate discount
      let discountAmount = 0;
      if (couponProgram.couponDetails.discountType === 'percentage') {
        discountAmount = (cart.totalAmount * couponProgram.couponDetails.discountValue) / 100;
        if (couponProgram.couponDetails.maxDiscount) {
          discountAmount = Math.min(discountAmount, couponProgram.couponDetails.maxDiscount);
        }
      } else {
        discountAmount = couponProgram.couponDetails.discountValue;
      }

      // Update cart with coupon
      cart.appliedCoupon = {
        code: couponCode.toUpperCase(),
        programId: couponProgram._id,
        discountAmount: Math.round(discountAmount),
        discountType: couponProgram.couponDetails.discountType,
        discountValue: couponProgram.couponDetails.discountValue
      };

      // Recalculate totals
      const newTotal = Math.max(0, cart.totalAmount - discountAmount);
      cart.finalAmount = newTotal;

      await cart.save();

      res.json({
        success: true,
        message: 'Coupon applied successfully',
        data: {
          couponCode: couponCode.toUpperCase(),
          discountAmount: Math.round(discountAmount),
          originalAmount: cart.totalAmount,
          finalAmount: newTotal
        }
      });

    } catch (error) {
      console.error('Apply coupon error:', error);
      next(error);
    }
  }
);

// @route   POST /api/cart/remove-coupon
// @desc    Remove applied coupon from cart
// @access  Private (Customer)
router.post('/remove-coupon', auth, authorize('customer'), async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    cart.appliedCoupon = undefined;
    cart.finalAmount = cart.totalAmount;
    
    await cart.save();

    res.json({
      success: true,
      message: 'Coupon removed successfully',
      data: {
        finalAmount: cart.totalAmount
      }
    });

  } catch (error) {
    console.error('Remove coupon error:', error);
    next(error);
  }
});

// @route   POST /api/cart/apply-coins
// @desc    Apply aggre coins to cart
// @access  Private (Customer)
router.post('/apply-coins', 
  auth, 
  authorize('customer'),
  body('coinsToUse').isInt({ min: 1 }).withMessage('Valid coin amount required'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { coinsToUse } = req.body;
      
      // Get user's cart and current coins (use same logic as loyalty dashboard)
      const cart = await Cart.findOne({ user: req.user._id });
      const user = await User.findById(req.user._id);
      const userLoyalty = await UserLoyalty.findOne({ user: req.user._id });
      
      if (!cart || cart.items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cart is empty'
        });
      }

      // Get available coins using same logic as dashboard and /coins endpoint
      const availableCoins = Number(userLoyalty?.aggreCoins?.balance || user.aggreCoins || 0);
      
      console.log('🔍 Apply coins - Available coins check:', {
        userAggreCoins: user.aggreCoins,
        userLoyaltyBalance: userLoyalty?.aggreCoins?.balance,
        availableCoins: availableCoins,
        coinsToUse: coinsToUse
      });

      if (availableCoins < coinsToUse) {
        return res.status(400).json({
          success: false,
          message: `Insufficient coins. You have ${availableCoins} coins available`
        });
      }

      // Calculate current amount (after coupon if applied)
      let currentAmount = cart.appliedCoupon ? 
        (cart.totalAmount - cart.appliedCoupon.discountAmount) : 
        cart.totalAmount;

      // Each coin = ₹1, but can't use more coins than the order amount
      const maxCoinsUsable = Math.floor(currentAmount);
      const coinsToApply = Math.min(coinsToUse, maxCoinsUsable);

      if (coinsToApply === 0) {
        return res.status(400).json({
          success: false,
          message: 'No coins can be applied to this order'
        });
      }

      // Update cart with coins
      cart.appliedCoins = {
        amount: coinsToApply,
        discount: coinsToApply // 1 coin = ₹1
      };

      // Recalculate final amount
      cart.finalAmount = currentAmount - coinsToApply;

      await cart.save();

      res.json({
        success: true,
        message: 'Coins applied successfully',
        data: {
          coinsUsed: coinsToApply,
          coinDiscount: coinsToApply,
          finalAmount: cart.finalAmount,
          availableCoins: availableCoins - coinsToApply // Update available coins
        }
      });

    } catch (error) {
      console.error('Apply coins error:', error);
      next(error);
    }
  }
);
// @route   POST /api/cart/remove-coins
// @desc    Remove applied coins from cart
// @access  Private (Customer)
router.post('/remove-coins', auth, authorize('customer'), async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    cart.appliedCoins = undefined;
    
    // Recalculate final amount (with coupon if applied)
    cart.finalAmount = cart.appliedCoupon ? 
      (cart.totalAmount - cart.appliedCoupon.discountAmount) : 
      cart.totalAmount;
    
    await cart.save();

    res.json({
      success: true,
      message: 'Coins removed successfully',
      data: {
        finalAmount: cart.finalAmount
      }
    });

  } catch (error) {
    console.error('Remove coins error:', error);
    next(error);
  }
});
// Add this new route after your existing apply coupon route (around line 780):

// @route   POST /api/cart/apply-supplier-promotion
// @desc    Apply supplier promotion to cart
// @access  Private (Customer)
router.post('/apply-supplier-promotion', auth, authorize('customer'), [
  body('promotionId').notEmpty().withMessage('Promotion ID is required'),
  body('discountAmount').isFloat({ min: 0 }).withMessage('Discount amount must be positive'),
  body('title').notEmpty().withMessage('Promotion title is required'),
  body('supplier').notEmpty().withMessage('Supplier name is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { promotionId, discountAmount, title, supplier, couponCode } = req.body;

    let cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Validate the promotion discount against cart total
    if (discountAmount > cart.totalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Discount amount cannot exceed cart total'
      });
    }

    // Apply the supplier promotion
    cart.appliedSupplierPromotion = {
      promotionId,
      title,
      discountAmount,
      supplier,
      couponCode: couponCode || null,
      appliedAt: new Date()
    };

    // Recalculate final amount including all discounts
    let finalAmount = cart.totalAmount;
    
    // Apply coupon discount if exists
    if (cart.appliedCoupon && cart.appliedCoupon.discountAmount) {
      finalAmount -= cart.appliedCoupon.discountAmount;
    }
    
    // Apply coin discount if exists
    if (cart.appliedCoins && cart.appliedCoins.discount) {
      finalAmount -= cart.appliedCoins.discount;
    }
    
    // Apply supplier promotion discount
    finalAmount -= discountAmount;
    
    cart.finalAmount = Math.max(0, finalAmount);

    await cart.save();

    console.log('✅ Supplier promotion applied to cart:', {
      cartId: cart._id,
      promotionTitle: title,
      discountAmount,
      supplier,
      finalAmount: cart.finalAmount
    });

    res.json({
      success: true,
      message: 'Supplier promotion applied successfully',
      data: {
        cart: {
          _id: cart._id,
          items: cart.items,
          totalAmount: cart.totalAmount,
          totalItems: cart.totalItems,
          appliedCoupon: cart.appliedCoupon,
          appliedCoins: cart.appliedCoins,
          appliedSupplierPromotion: cart.appliedSupplierPromotion,
          finalAmount: cart.finalAmount
        },
        savings: {
          couponSavings: cart.appliedCoupon?.discountAmount || 0,
          coinSavings: cart.appliedCoins?.discount || 0,
          supplierPromotionSavings: discountAmount,
          totalSavings: (cart.appliedCoupon?.discountAmount || 0) + 
                       (cart.appliedCoins?.discount || 0) + 
                       discountAmount
        }
      }
    });

  } catch (error) {
    console.error('❌ Error applying supplier promotion to cart:', error);
    next(error);
  }
});

// @route   DELETE /api/cart/remove-supplier-promotion
// @desc    Remove supplier promotion from cart
// @access  Private (Customer)
router.delete('/remove-supplier-promotion', auth, authorize('customer'), async (req, res, next) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Remove supplier promotion
    cart.appliedSupplierPromotion = undefined;

    // Recalculate final amount
    let finalAmount = cart.totalAmount;
    
    if (cart.appliedCoupon && cart.appliedCoupon.discountAmount) {
      finalAmount -= cart.appliedCoupon.discountAmount;
    }
    
    if (cart.appliedCoins && cart.appliedCoins.discount) {
      finalAmount -= cart.appliedCoins.discount;
    }
    
    cart.finalAmount = Math.max(0, finalAmount);

    await cart.save();

    res.json({
      success: true,
      message: 'Supplier promotion removed successfully',
      data: {
        cart: {
          _id: cart._id,
          items: cart.items,
          totalAmount: cart.totalAmount,
          totalItems: cart.totalItems,
          appliedCoupon: cart.appliedCoupon,
          appliedCoins: cart.appliedCoins,
          appliedSupplierPromotion: null,
          finalAmount: cart.finalAmount
        }
      }
    });

  } catch (error) {
    console.error('❌ Error removing supplier promotion from cart:', error);
    next(error);
  }
});
// Line 881 - ADD this new route AFTER the existing routes:

// Add new route to get GST breakdown
router.get('/gst-breakdown', auth, authorize('customer'), async (req, res, next) => {
  try {
    const { customerState } = req.query;
    
    if (!customerState) {
      return res.status(400).json({
        success: false,
        message: 'Customer state is required for GST calculation'
      });
    }
    
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }
    
    const gstBreakdown = await cart.calculateGSTBreakdown(customerState);
    
    res.json({
      success: true,
      data: gstBreakdown
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;