const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { auth, authorize, canPlaceOrders } = require('../middleware/auth');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { ErrorHandler } = require('../utils/errorHandler');
const router = express.Router();

// @route   GET /api/cart
// @desc    Get user's cart
// @access  Private (Customer)
router.get('/', auth, authorize('customer'), async (req, res, next) => {
  try {
    console.log('🛒 Getting cart for user:', req.user._id);
    
    let cart = await Cart.findOne({ user: req.user._id })
      .populate({
        path: 'items.product',
        populate: {
          path: 'supplier',
          select: 'companyName dispatchLocation businessName'
        }
      });

    if (!cart) {
      console.log('🛒 No cart found, creating new cart');
      cart = new Cart({ 
        user: req.user._id, 
        items: [],
        totalAmount: 0,
        totalItems: 0
      });
      await cart.save();
      console.log('✅ New cart created:', cart._id);
    }

    // Remove expired/inactive products
    if (cart.removeExpiredItems) {
      await cart.removeExpiredItems();
    }
    
    // Validate stock for all items
    let stockIssues = [];
    if (cart.validateStock) {
      stockIssues = await cart.validateStock();
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
    if (cart.calculateTotals) {
      await cart.calculateTotals();
      await cart.save();
    }

    res.json({
      success: true,
      data: { 
        cart,
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
    if (cart.calculateTotals) {
      await cart.calculateTotals();
    }
    await cart.save();

    // Populate the cart for response
    await cart.populate({
      path: 'items.product',
      populate: {
        path: 'supplier',
        select: 'companyName'
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
    cart.items[itemIndex].quantity = quantity;
    if (cart.calculateTotals) {
      await cart.calculateTotals();
    }
    await cart.save();

    // Populate the cart for response
    await cart.populate({
      path: 'items.product',
      populate: {
        path: 'supplier',
        select: 'companyName'
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

module.exports = router;
