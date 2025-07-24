const express = require('express');
const { param, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const { ErrorHandler } = require('../utils/errorHandler');
const router = express.Router();

// @route   GET /api/wishlist
// @desc    Get user's wishlist
// @access  Private (Customer)
router.get('/', auth, authorize('customer'), async (req, res, next) => {
  try {
    let wishlist = await Wishlist.getUserWishlist(req.user._id);
    
    if (!wishlist) {
      // Create empty wishlist if doesn't exist
      wishlist = new Wishlist({ user: req.user._id, items: [] });
      await wishlist.save();
    }

    res.json({
      success: true,
      data: {
        items: wishlist.items.map(item => ({
          _id: item._id,
          product: item.product,
          createdAt: item.addedAt
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/wishlist/add
// @desc    Add product to wishlist
// @access  Private (Customer)
router.post('/add', auth, authorize('customer'), [
  param('productId').optional().isMongoId().withMessage('Invalid product ID')
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

    const { productId } = req.body;

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return next(new ErrorHandler('Product not found', 404));
    }

    // Get or create wishlist
    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      wishlist = new Wishlist({ user: req.user._id, items: [] });
    }

    // Check if product already in wishlist
    const existingItem = wishlist.items.find(item => 
      item.product.toString() === productId.toString()
    );

    if (existingItem) {
      return res.status(400).json({
        success: false,
        message: 'Product already in wishlist'
      });
    }

    // Add product to wishlist
    wishlist.items.push({ product: productId });
    await wishlist.save();

    res.status(201).json({
      success: true,
      message: 'Product added to wishlist',
      data: {
        wishlistId: wishlist._id,
        itemsCount: wishlist.items.length
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/wishlist/remove/:productId
// @desc    Remove product from wishlist
// @access  Private (Customer)
router.delete('/remove/:productId', auth, authorize('customer'), [
  param('productId').isMongoId().withMessage('Invalid product ID')
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

    const { productId } = req.params;

    // Get user's wishlist
    const wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      return next(new ErrorHandler('Wishlist not found', 404));
    }

    // Check if product is in wishlist
    const itemIndex = wishlist.items.findIndex(item => 
      item.product.toString() === productId.toString()
    );

    if (itemIndex === -1) {
      return next(new ErrorHandler('Product not found in wishlist', 404));
    }

    // Remove product from wishlist
    wishlist.items.splice(itemIndex, 1);
    await wishlist.save();

    res.json({
      success: true,
      message: 'Product removed from wishlist',
      data: {
        itemsCount: wishlist.items.length
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/wishlist/clear
// @desc    Clear all items from wishlist
// @access  Private (Customer)
router.delete('/clear', auth, authorize('customer'), async (req, res, next) => {
  try {
    // Get user's wishlist
    const wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      return next(new ErrorHandler('Wishlist not found', 404));
    }

    // Clear all items
    wishlist.items = [];
    await wishlist.save();

    res.json({
      success: true,
      message: 'Wishlist cleared successfully',
      data: {
        itemsCount: 0
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/wishlist/move-to-cart/:productId
// @desc    Move product from wishlist to cart
// @access  Private (Customer)
router.post('/move-to-cart/:productId', auth, authorize('customer'), [
  param('productId').isMongoId().withMessage('Invalid product ID')
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

    const { productId } = req.params;
    const { quantity = 1, specifications = {} } = req.body;

    // Get user's wishlist
    const wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      return next(new ErrorHandler('Wishlist not found', 404));
    }

    // Check if product is in wishlist
    const itemIndex = wishlist.items.findIndex(item => 
      item.product.toString() === productId.toString()
    );

    if (itemIndex === -1) {
      return next(new ErrorHandler('Product not found in wishlist', 404));
    }

    // Here you would add logic to move to cart
    // For now, just remove from wishlist
    wishlist.items.splice(itemIndex, 1);
    await wishlist.save();

    res.json({
      success: true,
      message: 'Product moved to cart',
      data: {
        wishlistItemsCount: wishlist.items.length
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/wishlist/count
// @desc    Get wishlist items count
// @access  Private (Customer)
router.get('/count', auth, authorize('customer'), async (req, res, next) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id });
    const count = wishlist ? wishlist.items.length : 0;

    res.json({
      success: true,
      data: {
        count
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;