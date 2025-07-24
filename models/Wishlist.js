const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Ensure user can't have duplicate products in wishlist
wishlistSchema.index({ user: 1, 'items.product': 1 }, { unique: true });

// Static method to get user's wishlist with populated products
wishlistSchema.statics.getUserWishlist = async function(userId) {
  return await this.findOne({ user: userId })
    .populate({
      path: 'items.product',
      populate: {
        path: 'supplier',
        select: 'businessName location'
      }
    });
};

// Method to add item to wishlist
wishlistSchema.methods.addItem = async function(productId) {
  const existingItem = this.items.find(item => 
    item.product.toString() === productId.toString()
  );
  
  if (existingItem) {
    throw new Error('Product already in wishlist');
  }
  
  this.items.push({ product: productId });
  return await this.save();
};

// Method to remove item from wishlist
wishlistSchema.methods.removeItem = async function(productId) {
  this.items = this.items.filter(item => 
    item.product.toString() !== productId.toString()
  );
  return await this.save();
};

// Method to clear all items
wishlistSchema.methods.clearItems = async function() {
  this.items = [];
  return await this.save();
};

module.exports = mongoose.model('Wishlist', wishlistSchema);