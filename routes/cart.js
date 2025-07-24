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
    let cart = await Cart.findOne({ user: req.user._id })
      .populate({
        path: 'items.product',
        populate: {
          path: 'supplier',
          select: 'companyName dispatchLocation'
        }
      });

    if (!cart) {
      cart = new Cart({ user: req.user._id, items: [] });
      await cart.save();
    }

    // Remove expired/inactive products
    await cart.removeExpiredItems();
    
    // Validate stock for all items
    const stockIssues = await cart.validateStock();
    
    if (cart.isModified()) {
      await cart.save();
    }

    res.json({
      success: true,
      data: { 
        cart,
        stockIssues: stockIssues.length > 0 ? stockIssues : null
      }
    });

  } catch (error) {
    next(error);
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { productId, quantity, specifications } = req.body;

    // Find product
    const product = await Product.findOne({
      $or: [{ _id: productId }, { productId }],
      isActive: true,
      isApproved: true
    });

    if (!product) {
      return next(new ErrorHandler('Product not found or not available', 404));
    }

    // Check minimum quantity
    if (quantity < product.pricing.minimumQuantity) {
      return next(new ErrorHandler(
        `Minimum quantity for this product is ${product.pricing.minimumQuantity} ${product.pricing.unit}`,
        400
      ));
    }

    // Check stock availability
    if (!product.isInStock(quantity)) {
      return next(new ErrorHandler(
        `Insufficient stock. Available: ${product.stock.available - product.stock.reserved} ${product.pricing.unit}`,
        400
      ));
    }

    // Find or create cart
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = new Cart({ user: req.user._id, items: [] });
    }

    // Check if item already exists in cart
    const existingItemIndex = cart.items.findIndex(
      item => item.product.toString() === product._id.toString()
    );

    if (existingItemIndex !== -1) {
      // Update existing item
      const newQuantity = cart.items[existingItemIndex].quantity + quantity;
      
      if (!product.isInStock(newQuantity)) {
        return next(new ErrorHandler(
          `Cannot add more items. Total quantity would exceed available stock.`,
          400
        ));
      }
      
      cart.items[existingItemIndex].quantity = newQuantity;
      cart.items[existingItemIndex].specifications = specifications || {};
    } else {
      // Add new item
      cart.items.push({
        product: product._id,
        quantity,
        priceAtTime: product.pricing.basePrice,
        specifications: specifications || {}
      });
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
      message: 'Item added to cart successfully',
      data: { cart }
    });

  } catch (error) {
    next(error);
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
      return next(new ErrorHandler('Cart not found', 404));
    }

    const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) {
      return next(new ErrorHandler('Item not found in cart', 404));
    }

    // Get product details
    const product = await Product.findById(cart.items[itemIndex].product);
    if (!product) {
      return next(new ErrorHandler('Product not found', 404));
    }

    // Validate quantity
    if (quantity < product.pricing.minimumQuantity) {
      return next(new ErrorHandler(
        `Minimum quantity for this product is ${product.pricing.minimumQuantity} ${product.pricing.unit}`,
        400
      ));
    }

    if (!product.isInStock(quantity)) {
      return next(new ErrorHandler(
        `Insufficient stock. Available: ${product.stock.available - product.stock.reserved} ${product.pricing.unit}`,
        400
      ));
    }

    // Update quantity
    cart.items[itemIndex].quantity = quantity;
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
    next(error);
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
      return next(new ErrorHandler('Cart not found', 404));
    }

    const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) {
      return next(new ErrorHandler('Item not found in cart', 404));
    }

    cart.items.splice(itemIndex, 1);
    await cart.save();

    res.json({
      success: true,
      message: 'Item removed from cart successfully',
      data: { cart }
    });

  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/cart
// @desc    Clear entire cart
// @access  Private (Customer)
router.delete('/', auth, authorize('customer'), async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return next(new ErrorHandler('Cart not found', 404));
    }

    cart.items = [];
    await cart.save();

    res.json({
      success: true,
      message: 'Cart cleared successfully',
      data: { cart }
    });

  } catch (error) {
    next(error);
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
      return next(new ErrorHandler('Cart is empty', 400));
    }

    // Validate all items
    await cart.removeExpiredItems();
    const stockIssues = await cart.validateStock();
    
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

    // Note: Multiple suppliers will require multiple orders
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
    next(error);
  }
});

module.exports = router;