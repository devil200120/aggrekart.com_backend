const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { auth, authorize, optionalAuth } = require('../middleware/auth');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const { ErrorHandler } = require('../utils/errorHandler');
const { uploadImages } = require('../utils/cloudinary');
const router = express.Router();

// Product categories and subcategories
const productCategories = {
  aggregate: {
    name: 'Aggregate',
    subcategories: {
      dust: 'Dust',
      '10mm_metal': '10 MM Metal',
      '20mm_metal': '20 MM Metal',
      '40mm_metal': '40 MM Metal',
      gsb: 'GSB',
      wmm: 'WMM',
      m_sand: 'M.sand'
    },
    unit: 'MT',
    hsnCode: '2517'
  },
  sand: {
    name: 'Sand',
    subcategories: {
      river_sand_plastering: 'River sand (Plastering)',
      river_sand: 'River sand'
    },
    unit: 'MT',
    hsnCode: '2505'
  },
  tmt_steel: {
    name: 'TMT Steel',
    subcategories: {
      fe_415: 'FE-415',
      fe_500: 'FE-500',
      fe_550: 'FE-550',
      fe_600: 'FE-600'
    },
    unit: 'MT',
    hsnCode: '7213'
  },
  bricks_blocks: {
    name: 'Bricks & Blocks',
    subcategories: {
      red_bricks: 'Red Bricks',
      fly_ash_bricks: 'Fly Ash Bricks',
      concrete_blocks: 'Concrete Blocks',
      aac_blocks: 'AAC Blocks'
    },
    unit: 'numbers',
    hsnCode: '6901'
  },
  cement: {
    name: 'Cement',
    subcategories: {
      opc: 'OPC',
      ppc: 'PPC'
    },
    unit: 'bags',
    hsnCode: '2523'
  }
};

// @route   GET /api/products/categories
// @desc    Get product categories and subcategories
// @access  Public
router.get('/categories', async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: { categories: productCategories }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/products
// @desc    Get products with filtering, sorting, and pagination
// @access  Public
router.get('/', optionalAuth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('category').optional().isIn(Object.keys(productCategories)).withMessage('Invalid category'),
  query('subcategory').optional().isString(),
  query('minPrice').optional().isFloat({ min: 0 }).withMessage('Minimum price must be positive'),
  query('maxPrice').optional().isFloat({ min: 0 }).withMessage('Maximum price must be positive'),
  query('rating').optional().isFloat({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5'),
  query('sort').optional().isIn(['price_low', 'price_high', 'rating', 'newest', 'popular']).withMessage('Invalid sort option'),
  query('search').optional().trim().isLength({ min: 2 }).withMessage('Search query must be at least 2 characters'),
  // Add these validations after line 93:

query('materialGrade').optional().isString().withMessage('Invalid material grade'),
query('strength').optional().isString().withMessage('Invalid strength'),
query('size').optional().isString().withMessage('Invalid size'),
query('brand').optional().isString().withMessage('Invalid brand'),
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

    const {
      page = 1,
      limit = 12,
      category,
      subcategory,
      minPrice,
      maxPrice,
      rating,
      sort = 'newest',
      search,
      latitude,
      longitude
    } = req.query;

    // Build filter object
    const filter = {
      isActive: true,
      isApproved: true
    };

    if (category) filter.category = category;
    if (subcategory) filter.subcategory = subcategory;
    if (minPrice || maxPrice) {
      filter['pricing.basePrice'] = {};
      if (minPrice) filter['pricing.basePrice'].$gte = parseFloat(minPrice);
      if (maxPrice) filter['pricing.basePrice'].$lte = parseFloat(maxPrice);
    }
    if (rating) filter.averageRating = { $gte: parseFloat(rating) };

    // Build sort object
    let sortObj = {};
    switch (sort) {
      case 'price_low':
        sortObj = { 'pricing.basePrice': 1 };
        break;
      case 'price_high':
        sortObj = { 'pricing.basePrice': -1 };
        break;
      case 'rating':
        sortObj = { averageRating: -1, totalReviews: -1 };
        break;
      case 'popular':
        sortObj = { salesCount: -1, viewCount: -1 };
        break;
      case 'newest':
      default:
        sortObj = { createdAt: -1 };
        break;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let products;
    let total;

    if (search) {
      // Text search
      const searchResults = await Product.searchProducts(search, {
        limit: parseInt(limit),
        skip,
        category,
        minPrice: minPrice ? parseFloat(minPrice) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        rating: rating ? parseFloat(rating) : undefined
      });
      products = searchResults;
      total = await Product.countDocuments({
        $text: { $search: search },
        ...filter
      });
    } else {
      // Regular filtering
      products = await Product.find(filter)
        .populate('supplier', 'companyName dispatchLocation rating isApproved')
        .sort(sortObj)
        .skip(skip)
        .limit(parseInt(limit));

      total = await Product.countDocuments(filter);
    }

    // If user location is provided, calculate distances and sort by proximity
    if (latitude && longitude && products.length > 0) {
      products = products.map(product => {
        const productObj = product.toObject();
        if (product.supplier.dispatchLocation?.coordinates) {
          const distance = calculateDistance(
            parseFloat(latitude),
            parseFloat(longitude),
            product.supplier.dispatchLocation.coordinates.latitude,
            product.supplier.dispatchLocation.coordinates.longitude
          );
          productObj.distanceFromUser = distance;
          productObj.estimatedDeliveryTime = calculateDeliveryTime(distance);
        }
        return productObj;
      });

      // Sort by distance if no other sort specified
      if (sort === 'nearest') {
        products.sort((a, b) => (a.distanceFromUser || Infinity) - (b.distanceFromUser || Infinity));
      }
    }
    

    

    // Transform products for frontend compatibility
    const transformedProducts = products.map(product => {
      const productObj = product.toObject ? product.toObject() : product;
      
      return {
        ...productObj,
        // Add frontend-expected fields
        price: productObj.pricing?.basePrice || 0,
        originalPrice: productObj.pricing?.originalPrice || null,
        inStock: (productObj.stock?.available || 0) > (productObj.stock?.reserved || 0),
        image: productObj.images?.find(img => img.isPrimary)?.url || productObj.images?.[0]?.url || null,
        // Keep original structure for backward compatibility
        pricing: productObj.pricing,
        stock: productObj.stock,
        images: productObj.images
      };
    });

    const totalPages = Math.ceil(total / parseInt(limit));
    res.json({
      success: true,
      data: {
             products: transformedProducts,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: total,
          itemsPerPage: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        },
        filters: {
          category,
          subcategory,
          minPrice,
          maxPrice,
          rating,
          sort,
          search
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/products/:productId
// @desc    Get single product details
// @access  Public
router.get('/:productId', optionalAuth, [
  param('productId').notEmpty().withMessage('Product ID is required')
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
    const { latitude, longitude } = req.query;

    const product = await Product.findOne({
      $or: [
        { _id: productId },
        { productId: productId }
      ],
      isActive: true,
      isApproved: true
    })
    .populate('supplier', 'companyName dispatchLocation rating totalOrders isApproved')
    .populate('reviews.user', 'name customerType');

    if (!product) {
      return next(new ErrorHandler('Product not found', 404));
    }

    // Increment view count
    product.viewCount += 1;
    await product.save();

    // Calculate distance if user location provided
    let distanceInfo = null;
    if (latitude && longitude && product.supplier.dispatchLocation?.coordinates) {
      const distance = calculateDistance(
        parseFloat(latitude),
        parseFloat(longitude),
        product.supplier.dispatchLocation.coordinates.latitude,
        product.supplier.dispatchLocation.coordinates.longitude
      );
      
      distanceInfo = {
        distance,
        estimatedDeliveryTime: calculateDeliveryTime(distance),
        transportCost: product.pricing.transportCost.included 
          ? 0 
          : product.pricing.transportCost.costPerKm * distance
      };
    }

    // Get related products
    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
      isActive: true,
      isApproved: true
    })
    .populate('supplier', 'companyName rating')
    .limit(6)
    .sort({ salesCount: -1 });

    const productResponse = {
      ...product.toObject(),
      distanceInfo,
      relatedProducts
    };

    res.json({
      success: true,
      data: { product: productResponse }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/products
// @desc    Create new product (Supplier only)
// @access  Private (Supplier)
router.post('/', auth, authorize('supplier'), [
  body('name').trim().isLength({ min: 2 }).withMessage('Product name must be at least 2 characters'),
  body('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('category').isIn(Object.keys(productCategories)).withMessage('Invalid category'),
  body('subcategory').notEmpty().withMessage('Subcategory is required'),
  body('basePrice').isFloat({ min: 0 }).withMessage('Base price must be positive'),
  body('minimumQuantity').isFloat({ min: 0.1 }).withMessage('Minimum quantity must be at least 0.1'),
  body('available').isInt({ min: 0 }).withMessage('Available stock must be non-negative'),
  body('deliveryTime').notEmpty().withMessage('Delivery time is required')
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

    // Find supplier
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    if (!supplier.isApproved) {
      return next(new ErrorHandler('Supplier account not approved yet', 403));
    }

    const {
      name,
      description,
      category,
      subcategory,
      brand,
      specifications,
      basePrice,
      minimumQuantity,
      includesGST,
      gstRate,
      available,
      lowStockThreshold,
      deliveryTime,
      tags
    } = req.body;

    // Validate subcategory for the category
    const categoryData = productCategories[category];
    if (!categoryData.subcategories[subcategory]) {
      return next(new ErrorHandler('Invalid subcategory for this category', 400));
    }

    // Create product
    const product = new Product({
      name,
      description,
      category,
      subcategory,
      brand,
      specifications,
      supplier: supplier._id,
      pricing: {
        basePrice,
        unit: categoryData.unit,
        minimumQuantity,
        includesGST: includesGST || false,
        gstRate: gstRate || 18
      },
      stock: {
        available,
        lowStockThreshold: lowStockThreshold || 10
      },
      hsnCode: categoryData.hsnCode,
      deliveryTime,
      tags: tags || [],
      isApproved: false // Requires admin approval
    });

    await product.save();

    res.status(201).json({
      success: true,
      message: 'Product created successfully. Pending admin approval.',
      data: { product }
    });

  } catch (error) {
    next(error);
  }
});
// Add these routes to the existing products.js file

// @route   PUT /api/products/:productId
// @desc    Update product (Supplier only)
// @access  Private (Supplier)
router.put('/:productId', auth, authorize('supplier'), [
  param('productId').notEmpty().withMessage('Product ID is required'),
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Product name must be at least 2 characters'),
  body('description').optional().trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('basePrice').optional().isFloat({ min: 0 }).withMessage('Base price must be positive'),
  body('minimumQuantity').optional().isFloat({ min: 0.1 }).withMessage('Minimum quantity must be at least 0.1'),
  body('available').optional().isInt({ min: 0 }).withMessage('Available stock must be non-negative')
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
    
    // Find supplier
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    // Find product
    const product = await Product.findOne({
      $or: [{ _id: productId }, { productId }],
      supplier: supplier._id
    });

    if (!product) {
      return next(new ErrorHandler('Product not found or access denied', 404));
    }

    // Update allowed fields
    const allowedUpdates = [
      'name', 'description', 'brand', 'specifications', 'deliveryTime', 'tags'
    ];
    
    const pricingUpdates = ['basePrice', 'minimumQuantity', 'includesGST', 'gstRate'];
    const stockUpdates = ['available', 'lowStockThreshold'];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        product[field] = req.body[field];
      }
    });

    pricingUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        product.pricing[field] = req.body[field];
      }
    });

    stockUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        product.stock[field] = req.body[field];
      }
    });

    // If major changes, require re-approval
    const majorChanges = ['name', 'description', 'basePrice', 'category', 'subcategory'];
    const hasMajorChanges = majorChanges.some(field => req.body[field] !== undefined);
    
    if (hasMajorChanges && product.isApproved) {
      product.isApproved = false;
    }

    await product.save();

    res.json({
      success: true,
      message: hasMajorChanges 
        ? 'Product updated successfully. Re-approval required for major changes.'
        : 'Product updated successfully',
      data: { product }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/products/:productId/images
// @desc    Upload product images
// @access  Private (Supplier)
router.post('/:productId/images', auth, authorize('supplier'), async (req, res, next) => {
  // Use the upload middleware
  uploadProductImages(req, res, async (err) => {
    if (err) {
      return next(err);
    }

    try {
      const { productId } = req.params;
      
      // Find supplier
      const supplier = await Supplier.findOne({ user: req.user._id });
      if (!supplier) {
        return next(new ErrorHandler('Supplier profile not found', 404));
      }

      // Find product
      const product = await Product.findOne({
        $or: [{ _id: productId }, { productId }],
        supplier: supplier._id
      });

      if (!product) {
        return next(new ErrorHandler('Product not found or access denied', 404));
      }

      if (!req.files || req.files.length === 0) {
        return next(new ErrorHandler('No images uploaded', 400));
      }

      // Process uploaded images
      const newImages = req.files.map((file, index) => ({
        url: file.path,
        cloudinaryId: file.filename,
        alt: `${product.name} - Image ${product.images.length + index + 1}`,
        isPrimary: product.images.length === 0 && index === 0 // First image of first upload is primary
      }));

      product.images.push(...newImages);
      await product.save();

      res.json({
        success: true,
        message: 'Images uploaded successfully',
        data: { 
          images: newImages,
          totalImages: product.images.length
        }
      });

    } catch (error) {
      next(error);
    }
  });
});

// @route   DELETE /api/products/:productId/images/:imageId
// @desc    Delete product image
// @access  Private (Supplier)
router.delete('/:productId/images/:imageId', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const { productId, imageId } = req.params;
    
    // Find supplier
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    // Find product
    const product = await Product.findOne({
      $or: [{ _id: productId }, { productId }],
      supplier: supplier._id
    });

    if (!product) {
      return next(new ErrorHandler('Product not found or access denied', 404));
    }

    // Find image
    const imageIndex = product.images.findIndex(img => img._id.toString() === imageId);
    if (imageIndex === -1) {
      return next(new ErrorHandler('Image not found', 404));
    }

    const image = product.images[imageIndex];

    // Don't allow deletion of the last image
    if (product.images.length === 1) {
      return next(new ErrorHandler('Cannot delete the only image. Product must have at least one image.', 400));
    }

    // Delete from Cloudinary
    if (image.cloudinaryId) {
      await deleteImage(image.cloudinaryId);
    }

    // Remove from product
    product.images.splice(imageIndex, 1);

    // If deleted image was primary, make first remaining image primary
    if (image.isPrimary && product.images.length > 0) {
      product.images[0].isPrimary = true;
    }

    await product.save();

    res.json({
      success: true,
      message: 'Image deleted successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/products/:productId/images/:imageId/primary
// @desc    Set image as primary
// @access  Private (Supplier)
router.put('/:productId/images/:imageId/primary', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const { productId, imageId } = req.params;
    
    // Find supplier
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    // Find product
    const product = await Product.findOne({
      $or: [{ _id: productId }, { productId }],
      supplier: supplier._id
    });

    if (!product) {
      return next(new ErrorHandler('Product not found or access denied', 404));
    }

    // Find image
    const imageIndex = product.images.findIndex(img => img._id.toString() === imageId);
    if (imageIndex === -1) {
      return next(new ErrorHandler('Image not found', 404));
    }

    // Set all images as non-primary
    product.images.forEach(img => img.isPrimary = false);
    
    // Set selected image as primary
    product.images[imageIndex].isPrimary = true;

    await product.save();

    res.json({
      success: true,
      message: 'Primary image updated successfully',
      data: { 
        primaryImage: product.images[imageIndex]
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/products/:productId
// @desc    Delete/Deactivate product
// @access  Private (Supplier)
router.delete('/:productId', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const { productId } = req.params;
    
    // Find supplier
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    // Find product
    const product = await Product.findOne({
      $or: [{ _id: productId }, { productId }],
      supplier: supplier._id
    });

    if (!product) {
      return next(new ErrorHandler('Product not found or access denied', 404));
    }

    // Soft delete - just deactivate
    product.isActive = false;
    await product.save();

    res.json({
      success: true,
      message: 'Product deactivated successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/products/supplier/my-products
// @desc    Get supplier's products
// @access  Private (Supplier)
router.get('/supplier/my-products', auth, authorize('supplier'), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('status').optional().isIn(['all', 'active', 'inactive', 'pending', 'approved']).withMessage('Invalid status')
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

    const {
      page = 1,
      limit = 10,
      status = 'all'
    } = req.query;

    // Find supplier
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    // Build filter
    const filter = { supplier: supplier._id };
    
    switch (status) {
      case 'active':
        filter.isActive = true;
        filter.isApproved = true;
        break;
      case 'inactive':
        filter.isActive = false;
        break;
      case 'pending':
        filter.isApproved = false;
        break;
      case 'approved':
        filter.isApproved = true;
        break;
      // 'all' - no additional filter
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(filter);
    const totalPages = Math.ceil(total / parseInt(limit));

    // Get product statistics
    const stats = {
      total: await Product.countDocuments({ supplier: supplier._id }),
      active: await Product.countDocuments({ supplier: supplier._id, isActive: true, isApproved: true }),
      pending: await Product.countDocuments({ supplier: supplier._id, isApproved: false }),
      inactive: await Product.countDocuments({ supplier: supplier._id, isActive: false })
    };

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: total,
          itemsPerPage: parseInt(limit)
        },
        stats
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/products/:productId/reviews
// @desc    Add product review
// @access  Private (Customer)
router.post('/:productId/reviews', auth, authorize('customer'), [
  param('productId').notEmpty().withMessage('Product ID is required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').optional().trim().isLength({ min: 10, max: 500 }).withMessage('Comment must be between 10 and 500 characters')
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
    const { rating, comment } = req.body;

    // Find product
    const product = await Product.findOne({
      $or: [{ _id: productId }, { productId }],
      isActive: true,
      isApproved: true
    });

    if (!product) {
      return next(new ErrorHandler('Product not found', 404));
    }

    // Check if user already reviewed this product
    const existingReview = product.reviews.find(
      review => review.user.toString() === req.user._id.toString()
    );

    if (existingReview) {
      return next(new ErrorHandler('You have already reviewed this product', 400));
    }

    // TODO: Check if user has purchased this product (implement after order system)
    const isVerifiedPurchase = false; // Placeholder

    // Add review
    const newReview = {
      user: req.user._id,
      rating,
      comment,
      isVerifiedPurchase
    };

    product.reviews.push(newReview);
    product.calculateAverageRating();
    await product.save();

    // Populate the new review
    await product.populate('reviews.user', 'name customerType');
    const addedReview = product.reviews[product.reviews.length - 1];

    res.status(201).json({
      success: true,
      message: 'Review added successfully',
      data: { 
        review: addedReview,
        averageRating: product.averageRating,
        totalReviews: product.totalReviews
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/products/:productId/reviews
// @desc    Get product reviews
// @access  Public
router.get('/:productId/reviews', [
  param('productId').notEmpty().withMessage('Product ID is required'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Limit must be between 1 and 20'),
  query('rating').optional().isInt({ min: 1, max: 5 }).withMessage('Rating filter must be between 1 and 5')
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
    const {
      page = 1,
      limit = 10,
      rating
    } = req.query;

    // Find product
    const product = await Product.findOne({
      $or: [{ _id: productId }, { productId }],
      isActive: true,
      isApproved: true
    }).populate('reviews.user', 'name customerType');

    if (!product) {
      return next(new ErrorHandler('Product not found', 404));
    }

    let reviews = product.reviews;

    // Filter by rating if specified
    if (rating) {
      reviews = reviews.filter(review => review.rating === parseInt(rating));
    }

    // Sort by newest first
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedReviews = reviews.slice(skip, skip + parseInt(limit));

    // Rating distribution
    const ratingDistribution = {
      5: product.reviews.filter(r => r.rating === 5).length,
      4: product.reviews.filter(r => r.rating === 4).length,
      3: product.reviews.filter(r => r.rating === 3).length,
      2: product.reviews.filter(r => r.rating === 2).length,
      1: product.reviews.filter(r => r.rating === 1).length,
    };

    res.json({
      success: true,
      data: {
        reviews: paginatedReviews,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(reviews.length / parseInt(limit)),
          totalItems: reviews.length,
          itemsPerPage: parseInt(limit)
        },
        summary: {
          averageRating: product.averageRating,
          totalReviews: product.totalReviews,
          ratingDistribution
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// Utility functions
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in kilometers
  return Math.round(distance * 100) / 100; // Round to 2 decimal places
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

function calculateDeliveryTime(distance) {
  if (distance <= 5) return '2-4 hours';
  if (distance <= 10) return '4-6 hours';
  if (distance <= 20) return '6-8 hours';
  if (distance <= 50) return '1-2 days';
  return '2-3 days';
}

module.exports = router;