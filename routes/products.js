const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { auth, authorize, optionalAuth } = require('../middleware/auth');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const { ErrorHandler } = require('../utils/errorHandler');
const { uploadProductImages, deleteImage, getOptimizedImageUrl } = require('../utils/cloudinary');
const router = express.Router();
// Add this import at the top with other imports (around line 6):

const Order = require('../models/Order');

// Product categories and subcategories - FIXED to match actual database values
const productCategories = {
  aggregate: {
    name: 'Aggregate',
    subcategories: {
      'dust': 'Dust',
      '10_mm_metal': '10 MM Metal',
      '20_mm_metal': '20 MM Metal', 
      '40_mm_metal': '40 MM Metal',
      'gsb': 'GSB',
      'wmm': 'WMM',
      'm_sand': 'M.sand'
    },
    unit: 'MT',
    hsnCode: '2517'
  },
  sand: {
    name: 'Sand',
    subcategories: {
      'river_sand_plastering': 'River sand (Plastering)',
      'river_sand': 'River sand'
    },
    unit: 'MT',
    hsnCode: '2505'
  },
  tmt_steel: {
    name: 'TMT Steel',
    subcategories: {
      'fe_415': 'FE-415',
      'fe_500': 'FE-500',
      'fe_550': 'FE-550',
      'fe_600': 'FE-600'
    },
    unit: 'MT',
    hsnCode: '7213'
  },
  bricks_blocks: {
    name: 'Bricks & Blocks',
    subcategories: {
      'red_bricks': 'Red Bricks',
      'fly_ash_bricks': 'Fly Ash Bricks',
      'concrete_blocks': 'Concrete Blocks',
      'aac_blocks': 'AAC Blocks'
    },
    unit: 'numbers',
    hsnCode: '6901'
  },
  cement: {
    name: 'Cement',
    subcategories: {
      'opc': 'OPC',
      'ppc': 'PPC'
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
// @desc    Get products with filters (SHOWS ALL APPROVED PRODUCTS INCLUDING OUT OF STOCK)
// @access  Public
router.get('/', async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      subcategory,
      subCategory,
      minPrice,
      maxPrice,
      rating,
      sort = 'newest',
      search,
      userLatitude,
      userLongitude,
      maxDistance
    } = req.query;

    console.log('📡 Products API called with params:', req.query);

    // Build filter object - ONLY check isActive and isApproved
    // REMOVED STOCK FILTER to show out-of-stock products
    const filter = {
      isActive: true,
      isApproved: true,
      'stock.available': { $gt: 0 } // ✅ ONLY show products with stock > 0
      // ✅ NO STOCK FILTER - Shows all products regardless of stock status
    };

    if (category) filter.category = category;
    // Line 116 - REPLACE:
// if (subcategory) filter.subcategory = subcategory;

// WITH:
// Line 116 - REPLACE this entire section:

const subcategoryParam = subcategory || subCategory;
if (subcategoryParam) 
  {
  // Create flexible subcategory matching - check both key and display name
  const subcategoryVariations = [];
  
  // Add the original value
    subcategoryVariations.push(subcategoryParam);
  
  // Add common variations for aggregate subcategories
  // REPLACE your existing subcategoryMap (around lines 131-154) with this complete version:

const subcategoryMap = {
  // ===== AGGREGATE SUBCATEGORIES =====
  // Keys to display names
  'stone_aggregate': ['Stone Aggregate', 'stone aggregate', 'STONE AGGREGATE'],
  'dust': ['Dust', 'DUST'],
  '10_mm_metal': ['10 MM Metal', '10mm metal', '10 mm metal', '10MM Metal', '10-mm-metal'],
  '20_mm_metal': ['20 MM Metal', '20mm metal', '20 mm metal', '20MM Metal', '20-mm-metal'],
  '40_mm_metal': ['40 MM Metal', '40mm metal', '40 mm metal', '40MM Metal', '40-mm-metal'],
  'gsb': ['GSB', 'G.S.B', 'Granular Sub Base'],
  'wmm': ['WMM', 'W.M.M', 'Wet Mix Macadam'],
  'm_sand': ['M Sand', 'M.Sand', 'M-Sand', 'Manufactured Sand', 'msand', 'MSAND'],
  
  // Display names to keys (reverse mapping)
  'Stone Aggregate': ['stone_aggregate'],
  'stone aggregate': ['stone_aggregate'], 
  'STONE AGGREGATE': ['stone_aggregate'],
  'Dust': ['dust'],
  'DUST': ['dust'],
  'dust': ['dust'],
  
  '10 MM Metal': ['10_mm_metal'],
  '10mm metal': ['10_mm_metal'],
  '10 mm metal': ['10_mm_metal'],
  '10MM Metal': ['10_mm_metal'],
  '10-mm-metal': ['10_mm_metal'],
  
  '20 MM Metal': ['20_mm_metal'],
  '20mm metal': ['20_mm_metal'],
  '20 mm metal': ['20_mm_metal'],
  '20MM Metal': ['20_mm_metal'],
  '20-mm-metal': ['20_mm_metal'],
  
  '40 MM Metal': ['40_mm_metal'],
  '40mm metal': ['40_mm_metal'],
  '40 mm metal': ['40_mm_metal'],
  '40MM Metal': ['40_mm_metal'],
  '40-mm-metal': ['40_mm_metal'],
  
  'GSB': ['gsb'],
  'G.S.B': ['gsb'],
  'Granular Sub Base': ['gsb'],
  'gsb': ['gsb'],
  
  'WMM': ['wmm'],
  'W.M.M': ['wmm'],
  'Wet Mix Macadam': ['wmm'],
  'wmm': ['wmm'],
  
  'M Sand': ['m_sand'],
  'M.Sand': ['m_sand'],
  'M-Sand': ['m_sand'],
  'Manufactured Sand': ['m_sand'],
  'msand': ['m_sand'],
  'MSAND': ['m_sand'],
  
  // ===== SAND SUBCATEGORIES =====
  'river_sand_plastering': ['River Sand (Plastering)', 'River Sand Plastering', 'river sand plastering'],
  'river_sand': ['River Sand', 'river sand'],
  'p_sand': ['P Sand', 'P.Sand', 'Plastering Sand'],
  'construction_sand': ['Construction Sand', 'construction sand'],
  
  // Reverse mapping for sand
  'River Sand (Plastering)': ['river_sand_plastering'],
  'River Sand Plastering': ['river_sand_plastering'],
  'river sand plastering': ['river_sand_plastering'],
  'River Sand': ['river_sand'],
  'river sand': ['river_sand'],
  'P Sand': ['p_sand'],
  'P.Sand': ['p_sand'],
  'Plastering Sand': ['p_sand'],
  'Construction Sand': ['construction_sand'],
  'construction sand': ['construction_sand'],
  
  // ===== TMT STEEL SUBCATEGORIES =====
  'fe_415': ['FE-415', 'FE 415', 'fe-415', 'Fe415', 'FE415'],
  'fe_500': ['FE-500', 'FE 500', 'fe-500', 'Fe500', 'FE500'],
  'fe_550': ['FE-550', 'FE 550', 'fe-550', 'Fe550', 'FE550'],
  'fe_600': ['FE-600', 'FE 600', 'fe-600', 'Fe600', 'FE600'],
  
  // Reverse mapping for TMT steel
  'FE-415': ['fe_415'],
  'FE 415': ['fe_415'],
  'fe-415': ['fe_415'],
  'Fe415': ['fe_415'],
  'FE415': ['fe_415'],
  'FE-500': ['fe_500'],
  'FE 500': ['fe_500'],
  'fe-500': ['fe_500'],
  'Fe500': ['fe_500'],
  'FE500': ['fe_500'],
  'FE-550': ['fe_550'],
  'FE 550': ['fe_550'],
  'fe-550': ['fe_550'],
  'Fe550': ['fe_550'],
  'FE550': ['fe_550'],
  'FE-600': ['fe_600'],
  'FE 600': ['fe_600'],
  'fe-600': ['fe_600'],
  'Fe600': ['fe_600'],
  'FE600': ['fe_600'],
  
  // ===== BRICKS & BLOCKS SUBCATEGORIES =====
  'solid_blocks': ['Solid Blocks', 'solid blocks', 'SOLID BLOCKS'],
  'hollow_blocks': ['Hollow Blocks', 'hollow blocks', 'HOLLOW BLOCKS'],
  'aac_blocks': ['AAC Blocks', 'aac blocks', 'A.A.C Blocks', 'Autoclaved Aerated Concrete Blocks'],
  'fly_ash_bricks': ['Fly Ash Bricks', 'fly ash bricks', 'FLY ASH BRICKS'],
  'clay_bricks': ['Clay Bricks', 'clay bricks', 'Red Bricks', 'red bricks'],
  'concrete_blocks': ['Concrete Blocks', 'concrete blocks', 'CONCRETE BLOCKS'],
  
  // Reverse mapping for bricks & blocks
  'Solid Blocks': ['solid_blocks'],
  'solid blocks': ['solid_blocks'],
  'SOLID BLOCKS': ['solid_blocks'],
  'Hollow Blocks': ['hollow_blocks'],
  'hollow blocks': ['hollow_blocks'],
  'HOLLOW BLOCKS': ['hollow_blocks'],
  'AAC Blocks': ['aac_blocks'],
  'aac blocks': ['aac_blocks'],
  'A.A.C Blocks': ['aac_blocks'],
  'Autoclaved Aerated Concrete Blocks': ['aac_blocks'],
  'Fly Ash Bricks': ['fly_ash_bricks'],
  'fly ash bricks': ['fly_ash_bricks'],
  'FLY ASH BRICKS': ['fly_ash_bricks'],
  'Clay Bricks': ['clay_bricks'],
  'clay bricks': ['clay_bricks'],
  'Red Bricks': ['clay_bricks'],
  'red bricks': ['clay_bricks'],
  'Concrete Blocks': ['concrete_blocks'],
  'concrete blocks': ['concrete_blocks'],
  'CONCRETE BLOCKS': ['concrete_blocks'],
  
  // ===== CEMENT SUBCATEGORIES =====
  'opc_53': ['OPC 53 Grade', 'OPC-53', 'opc 53', 'OPC53', 'Ordinary Portland Cement 53'],
  'opc_43': ['OPC 43 Grade', 'OPC-43', 'opc 43', 'OPC43', 'Ordinary Portland Cement 43'],
  'ppc': ['PPC', 'Portland Pozzolana Cement', 'P.P.C'],
  'white_cement': ['White Cement', 'white cement', 'WHITE CEMENT'],
  'rapid_hardening': ['Rapid Hardening Cement', 'rapid hardening cement'],
  
  // Reverse mapping for cement
  'OPC 53 Grade': ['opc_53'],
  'OPC-53': ['opc_53'],
  'opc 53': ['opc_53'],
  'OPC53': ['opc_53'],
  'Ordinary Portland Cement 53': ['opc_53'],
  'OPC 43 Grade': ['opc_43'],
  'OPC-43': ['opc_43'],
  'opc 43': ['opc_43'],
  'OPC43': ['opc_43'],
  'Ordinary Portland Cement 43': ['opc_43'],
  'PPC': ['ppc'],
  'Portland Pozzolana Cement': ['ppc'],
  'P.P.C': ['ppc'],
  'White Cement': ['white_cement'],
  'white cement': ['white_cement'],
  'WHITE CEMENT': ['white_cement'],
  'Rapid Hardening Cement': ['rapid_hardening'],
  'rapid hardening cement': ['rapid_hardening']
};
  // Add variations if they exist
    if (subcategoryMap[subcategoryParam])  {
        subcategoryVariations.push(...subcategoryMap[subcategoryParam]);
  }
  
  // Use $in operator to match any of the variations
  filter.subcategory = { $in: subcategoryVariations };
  
    console.log(`🔧 Subcategory filter: "${subcategoryParam}" -> matching: [${subcategoryVariations.join(', ')}]`);
}
    if (minPrice || maxPrice) {
      filter['pricing.basePrice'] = {};
      if (minPrice) filter['pricing.basePrice'].$gte = parseFloat(minPrice);
      if (maxPrice) filter['pricing.basePrice'].$lte = parseFloat(maxPrice);
    }
    if (rating) filter.averageRating = { $gte: parseFloat(rating) };

    console.log('🔍 Filter being used:', JSON.stringify(filter, null, 2));

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
      case 'distance':
        sortObj = { createdAt: -1 }; // Will be sorted by distance later
        break;
      case 'newest':
      default:
        sortObj = { createdAt: -1 };
        break;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let products;
    let total;

        // UPDATED: Use aggregation pipeline with supplier profile filtering
    const pipeline = [
      {
        $lookup: {
          from: 'suppliers',
          localField: 'supplier',
          foreignField: '_id',
          as: 'supplierInfo'
        }
      },
      {
        $match: {
          ...filter,
          $or: [
            // Base products created by admin (always visible if active/approved)
            { 
              isBaseProduct: true, 
              createdByAdmin: true 
            },
            // Supplier products (only visible if supplier profile is enabled)
            {
              isBaseProduct: { $ne: true },
              'supplierInfo.profileEnabled': true,
              'supplierInfo.isActive': true,
              'supplierInfo.isApproved': true
            }
          ]
        }
      },
      {
        $unwind: {
          path: '$supplierInfo',
          preserveNullAndEmptyArrays: true // For base products without suppliers
        }
      }
    ];

    // Add search filter if provided
    if (search) {
      pipeline.unshift({
        $match: {
          $text: { $search: search }
        }
      });
    }

    // Add sorting
    pipeline.push({ $sort: sortObj });

    // Get total count for pagination
    const countPipeline = [...pipeline];
    countPipeline.push({ $count: 'total' });
    const countResult = await Product.aggregate(countPipeline);
    total = countResult[0]?.total || 0;

    // Add pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: parseInt(limit) });

    // Execute aggregation
    const aggregatedProducts = await Product.aggregate(pipeline);

    // Transform aggregated results to match expected format
    products = aggregatedProducts.map(item => ({
      ...item,
      supplier: item.supplierInfo ? {
        _id: item.supplierInfo._id,
        companyName: item.supplierInfo.companyName,
        dispatchLocation: item.supplierInfo.dispatchLocation,
        rating: item.supplierInfo.rating,
        isApproved: item.supplierInfo.isApproved,
        profileEnabled: item.supplierInfo.profileEnabled
      } : null
    }));

    console.log(`✅ Found ${products.length} products before location processing`);
    console.log(`📊 Total matching products: ${total}`);

    // Location-based processing if coordinates provided
    if (userLatitude && userLongitude && products.length > 0) {
      console.log(`📍 Processing products for location: ${userLatitude}, ${userLongitude}`);
      
      products = products.map(product => {
        const productObj = product.toObject ? product.toObject() : { ...product };
        
        if (product.supplier?.dispatchLocation?.coordinates) {
          let suppLat, suppLng;
          
          // Handle different coordinate formats
          if (Array.isArray(product.supplier.dispatchLocation.coordinates)) {
            suppLng = product.supplier.dispatchLocation.coordinates[0];
            suppLat = product.supplier.dispatchLocation.coordinates[1];
          } else if (product.supplier.dispatchLocation.coordinates.latitude && 
                     product.supplier.dispatchLocation.coordinates.longitude) {
            suppLat = product.supplier.dispatchLocation.coordinates.latitude;
            suppLng = product.supplier.dispatchLocation.coordinates.longitude;
          } else {
            productObj.distanceFromUser = 999;
            productObj.estimatedDeliveryTime = 'Location not available';
            return productObj;
          }
          
          const distance = calculateDistance(
            parseFloat(userLatitude),
            parseFloat(userLongitude),
            suppLat,
            suppLng
          );
          
          productObj.distanceFromUser = distance;
          productObj.estimatedDeliveryTime = calculateDeliveryTime(distance);
          
          console.log(`📍 ${product.name}: ${distance}km away`);
        } else {
          console.log(`⚠️ No coordinates for supplier of product: ${product.name}`);
          productObj.distanceFromUser = 999;
          productObj.estimatedDeliveryTime = 'Location not available';
        }
        
        return productObj;
      });

      // Filter by maxDistance if specified
      if (maxDistance) {
        const maxDistanceKm = parseFloat(maxDistance);
        const beforeCount = products.length;
        products = products.filter(product => 
          product.distanceFromUser <= maxDistanceKm
        );
        console.log(`📍 Filtered from ${beforeCount} to ${products.length} products within ${maxDistanceKm}km`);
      }

      // Sort by distance if requested
      if (sort === 'distance') {
        products.sort((a, b) => 
          (a.distanceFromUser || Infinity) - (b.distanceFromUser || Infinity)
        );
        console.log('📍 Products sorted by distance');
      }
    }

    // Transform products for frontend - INCLUDING OUT OF STOCK PRODUCTS
    const transformedProducts = products.map(product => {
const productObj = product.toObject ? product.toObject() : { ...product };      
      // Get primary image or first available image
      const primaryImage = productObj.images?.find(img => img.isPrimary) || productObj.images?.[0];
      
      return {
        _id: productObj._id,
        productId: productObj.productId,
        name: productObj.name,
        description: productObj.description,
        category: productObj.category,
        subcategory: productObj.subcategory,
        specifications: productObj.specifications,
        brand: productObj.brand,
        images: productObj.images || [],
        primaryImage: primaryImage?.url || '/placeholder-product.jpg',
        pricing: {
          basePrice: productObj.pricing?.basePrice || 0,
          unit: productObj.pricing?.unit || 'unit',
          minimumQuantity: productObj.pricing?.minimumQuantity || 1,
          includesGST: productObj.pricing?.includesGST || false,
          gstRate: productObj.pricing?.gstRate || 18
        },
        stock: {
          available: productObj.stock?.available || 0, // ✅ Shows actual stock including 0
          lowStockThreshold: productObj.stock?.lowStockThreshold || 10
        },
        averageRating: productObj.averageRating || 0,
        totalReviews: productObj.totalReviews || 0,
        salesCount: productObj.salesCount || 0,
        viewCount: productObj.viewCount || 0,
        deliveryTime: productObj.deliveryTime || '2-3 days',
        isActive: productObj.isActive,
        isApproved: productObj.isApproved,
        createdAt: productObj.createdAt,
        supplier: {
          _id: productObj.supplier?._id,
          companyName: productObj.supplier?.companyName || 'Unknown Supplier',
          rating: productObj.supplier?.rating || 0,
          isApproved: productObj.supplier?.isApproved || false
        },
        // Include distance info if available
        ...(productObj.distanceFromUser !== undefined && {
          distanceFromUser: productObj.distanceFromUser,
          estimatedDeliveryTime: productObj.estimatedDeliveryTime
        })
      };
    });

    console.log(`🎯 Returning ${transformedProducts.length} products to frontend`);

    res.json({
      success: true,
      data: {
        products: transformedProducts,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        },
        filters: {
          category,
          subcategory,
          minPrice,
          maxPrice,
          rating,
          sort,
          search,
          ...(userLatitude && userLongitude && {
            location: {
              latitude: parseFloat(userLatitude),
              longitude: parseFloat(userLongitude),
              maxDistance: maxDistance ? parseFloat(maxDistance) : null
            }
          })
        }
      }
    });

  } catch (error) {
    console.error('❌ Products API Error:', error);
    next(error);
  }
});

// @route   GET /api/products/featured
// @desc    Get featured/top-rated products for homepage
// @access  Public
router.get('/featured', optionalAuth, async (req, res, next) => {
  try {
    const { type = 'top-rated', limit = 6 } = req.query;
    
    let filter = {
      isActive: true,
      isApproved: true
    };
    
    let sortObj = {};
    
    switch (type) {
      case 'top-rated':
        // Products with rating >= 3.5 and at least 1 review
        filter.averageRating = { $gte: 3.5 };
        filter.totalReviews = { $gte: 1 };
        sortObj = { averageRating: -1, totalReviews: -1 };
        break;
        
      case 'popular':
        // Most ordered products
        sortObj = { salesCount: -1, viewCount: -1 };
        break;
        
      case 'newest':
        // Recently added products
        sortObj = { createdAt: -1 };
        break;
        
      case 'trending':
        // Products with high recent activity
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        filter.createdAt = { $gte: thirtyDaysAgo };
        sortObj = { viewCount: -1, salesCount: -1 };
        break;
        
      default:
        // Default to newest if no top-rated products
        sortObj = { createdAt: -1 };
    }
    
    let products = await Product.find(filter)
      .populate('supplier', 'companyName location rating isApproved')
      .sort(sortObj)
      .limit(parseInt(limit));
    
    // If no top-rated products found, get newest products
    if (products.length === 0 && type === 'top-rated') {
      products = await Product.find({
        isActive: true,
        isApproved: true
      })
      .populate('supplier', 'companyName location rating isApproved')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    }
    
    // Transform products for frontend
    const transformedProducts = products.map(product => {
      const productObj = product.toObject ? product.toObject() : { ...product };
      
      // Get primary image or first available image
      let imageUrl = null;
      if (productObj.images && productObj.images.length > 0) {
        const primaryImage = productObj.images.find(img => img.isPrimary);
        imageUrl = primaryImage ? primaryImage.url : productObj.images[0].url;
      }
      
      return {
        ...productObj,
        price: productObj.pricing?.basePrice || 0,
        originalPrice: productObj.pricing?.originalPrice || null,
        inStock: (productObj.stock?.available || 0) > (productObj.stock?.reserved || 0),
        image: imageUrl,
        supplier: {
          _id: productObj.supplier?._id,
          companyName: productObj.supplier?.companyName || 'Unknown Supplier',
          location: productObj.supplier?.location || {},
          rating: productObj.supplier?.rating || { average: 0, count: 0 },
          isApproved: productObj.supplier?.isApproved || false
        },
        supplierName: productObj.supplier?.companyName || 'Unknown Supplier'
      };
    });
    
    res.json({
      success: true,
      data: {
        products: transformedProducts,
        type,
        count: transformedProducts.length
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
    .populate('supplier', 'companyName dispatchLocation rating totalOrders isApproved transportRates')
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
    // Update the PUT route (around lines 507-530) to include isActive:

// Update allowed fields
const allowedUpdates = [
  'name', 'description', 'brand', 'specifications', 'deliveryTime', 'tags', 'isActive'
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

// Handle isActive field specifically with logging
if (req.body.isActive !== undefined) {
  console.log(`🔄 Updating product ${product.name} isActive from ${product.isActive} to ${req.body.isActive}`);
  product.isActive = req.body.isActive;
}

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
// Fix the image upload route (around line 558-610):

// @route   POST /api/products/:productId/images
// @desc    Upload product images
// @access  Private (Supplier)
router.post('/:productId/images', auth, authorize('supplier'), async (req, res, next) => {
  // Use the upload middleware
  uploadProductImages(req, res, async (err) => {
    if (err) {
      console.error('Upload middleware error:', err);
      return next(err);
    }

    try {
      const { productId } = req.params;
      
      console.log('📷 Image upload request for product:', productId);
      console.log('📁 Files received:', req.files?.length || 0);
      
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

      console.log('✅ Processing uploaded files...');

      // Process uploaded images
      const newImages = req.files.map((file, index) => {
        console.log(`📸 Processing image ${index + 1}:`, {
          filename: file.filename,
          path: file.path,
          size: file.size
        });
        
        return {
          url: file.path,
          cloudinaryId: file.filename,
          alt: `${product.name} - Image ${product.images.length + index + 1}`,
          isPrimary: product.images.length === 0 && index === 0 // First image of first upload is primary
        };
      });

      product.images.push(...newImages);
      await product.save();

      console.log('🎉 Images saved successfully:', newImages.length);

      res.json({
        success: true,
        message: 'Images uploaded successfully',
        data: { 
          images: newImages,
          totalImages: product.images.length
        }
      });

    } catch (error) {
      console.error('💥 Image processing error:', error);
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
// Replace the delete route (around lines 708-740):

// Replace the delete route (around lines 708-740):

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

    // Check if product has any orders - if yes, just deactivate, if no, delete completely
    const hasOrders = await Order.findOne({
      'items.product': product._id
    });

    if (hasOrders) {
      // Soft delete if there are orders
      product.isActive = false;
      await product.save();
      
      console.log(`Product ${product.name} soft deleted due to existing orders`);
      
      res.json({
        success: true,
        message: 'Product removed from your catalog (archived due to order history)'
      });
    } else {
      // Hard delete if no orders
      await Product.findByIdAndDelete(product._id);
      
      console.log(`Product ${product.name} permanently deleted`);
      
      res.json({
        success: true,
        message: 'Product deleted permanently'
      });
    }

  } catch (error) {
    console.error('Delete product error:', error);
    next(error);
  }
});

// @route   GET /api/products/supplier/my-products
// @desc    Get supplier's products
// @access  Private (Supplier)
// Update the validation rules:
// Replace lines 746-752 with this updated validation:
// Replace the entire /supplier/my-products route (lines 746-875) with this:
// Replace everything from line 748 to 959 with this comprehensive solution:

router.get('/supplier/my-products', auth, authorize('supplier'), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('status').optional().custom((value) => {
    // Allow empty strings and valid status values
    if (value === '' || value === undefined || ['all', 'active', 'inactive', 'pending', 'approved'].includes(value)) {
      return true;
    }
    throw new Error('Invalid status');
  }),
  query('search').optional().isString().withMessage('Search must be a string'),
  query('category').optional().isString().withMessage('Category must be a string'),
  query('sortBy').optional().isString().withMessage('SortBy must be a string')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Clean query parameters - remove empty strings and undefined values
    const cleanParams = {};
    Object.keys(req.query).forEach(key => {
      const value = req.query[key];
      if (value !== '' && value !== undefined && value !== null) {
        cleanParams[key] = value;
      }
    });

    const {
      page = 1,
      limit = 10,
      status = 'all',
      search = '',
      category = '',
      sortBy = 'newest'
    } = cleanParams;

    console.log('=== SUPPLIER PRODUCTS DEBUG ===');
    console.log('User ID:', req.user._id);
    console.log('Cleaned query params:', { page, limit, status, search, category, sortBy });

    // Check if supplier profile exists
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      console.log('❌ Supplier profile not found for user:', req.user._id);
      return res.json({
        success: true,
        message: 'Supplier profile not found. Please complete your supplier registration first.',
        data: {
          products: [],
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: parseInt(limit),
            hasNext: false,
            hasPrev: false
          },
          stats: {
            total: 0,
            active: 0,
            pending: 0,
            inactive: 0
          },
          needsProfile: true
        }
      });
    }

    console.log('✅ Found supplier:', {
      id: supplier._id,
      companyName: supplier.companyName,
      isApproved: supplier.isApproved,
      isActive: supplier.isActive
    });

    // Debug: Check if any products exist for this supplier AT ALL
    const allProductsForSupplier = await Product.find({ supplier: supplier._id });
    console.log('📦 Total products in database for this supplier:', allProductsForSupplier.length);
    
    if (allProductsForSupplier.length > 0) {
      console.log('📋 Sample products:');
      allProductsForSupplier.slice(0, 3).forEach((p, index) => {
        console.log(`  ${index + 1}. ${p.name} | Active: ${p.isActive} | Approved: ${p.isApproved} | Category: ${p.category}`);
      });
    }

    // Build filter - START WITH BASIC FILTER
    const filter = { supplier: supplier._id };
    console.log('🔍 Base filter:', filter);
    
    // Handle status filter - BE MORE FLEXIBLE
    // Replace lines 907-926 with this:

// Handle status filter - IMPROVED
// Replace the status filter section (around lines 1117-1138)

// Handle status filter - SHOW ALL PRODUCTS INCLUDING INACTIVE
if (status && status !== 'all' && status.trim() !== '') {
  console.log('📊 Applying status filter:', status.trim());
  switch (status.trim()) {
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
    case 'in-stock':
      filter.isActive = true;
      break;
    case 'out-of-stock':
      filter.isActive = false;
      break;
  }
} else {
  // For 'all' status: show ALL products (both active and inactive)
  // Remove the default isActive filter to show all products
  console.log('📊 Showing all products (active and inactive)');
} 

    // Handle search filter
    if (search && search.trim() !== '') {
      const searchTerm = search.trim();
      console.log('🔎 Applying search filter:', searchTerm);
      filter.$or = [
        { name: { $regex: searchTerm, $options: 'i' } },
        { description: { $regex: searchTerm, $options: 'i' } },
        { brand: { $regex: searchTerm, $options: 'i' } }
      ];
    }

    // Handle category filter
    if (category && category.trim() !== '') {
      console.log('📂 Applying category filter:', category.trim());
      filter.category = category.trim();
    }

    console.log('🎯 Final filter:', JSON.stringify(filter, null, 2));

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Handle sorting
    let sortOptions = { createdAt: -1 }; // default newest first
    if (sortBy && sortBy.trim() !== '') {
      switch (sortBy.trim()) {
        case 'oldest':
          sortOptions = { createdAt: 1 };
          break;
        case 'name':
          sortOptions = { name: 1 };
          break;
        case 'price-low':
          sortOptions = { 'pricing.basePrice': 1 };
          break;
        case 'price-high':
          sortOptions = { 'pricing.basePrice': -1 };
          break;
        default:
          sortOptions = { createdAt: -1 };
      }
    }

    console.log('📈 Sort options:', sortOptions);
    console.log('📄 Pagination - Skip:', skip, 'Limit:', parseInt(limit));

    // Query products with detailed logging
    const products = await Product.find(filter)
  .populate('supplier', 'companyName dispatchLocation rating isApproved')
  .sort(sortOptions)
  .skip(skip)
  .limit(parseInt(limit));

    console.log('📊 Query results:');
    console.log('  - Products found:', products.length);

    const total = await Product.countDocuments(filter);
    const totalPages = Math.ceil(total / parseInt(limit));

    console.log('  - Total matching documents:', total);
    console.log('  - Total pages:', totalPages);

    // Transform products to match frontend expectations
    // Transform products to match frontend expectations
// Transform products to match frontend expectations
const transformedProducts = products.map((product, index) => {
  const productObj = product.toObject ? product.toObject() : { ...product };
  
  // Determine status based on isActive and isApproved
  let status = 'pending';
  if (productObj.isActive && productObj.isApproved) {
    status = 'active';
  } else if (!productObj.isActive) {
    status = 'inactive';
  } else if (!productObj.isApproved) {
    status = 'pending';
  }

  // Get primary image or first image
  let imageUrl = null;
  if (productObj.images && productObj.images.length > 0) {
    const primaryImage = productObj.images.find(img => img.isPrimary);
    imageUrl = primaryImage ? primaryImage.url : productObj.images[0].url;
  }

  console.log(`  ${index + 1}. ${productObj.name} | Status: ${status} | Price: ₹${productObj.pricing?.basePrice || 0} | Supplier: ${productObj.supplier?.companyName || 'Unknown'} | Image: ${imageUrl ? 'Yes' : 'No'}`);

  return {
    ...productObj,
    // Add frontend-expected fields
    price: productObj.pricing?.basePrice || 0,
    unit: productObj.pricing?.unit || '',
    stockQuantity: productObj.stock?.available || 0,
    status: status,
    // Fix image handling
    images: productObj.images || [],
    primaryImage: imageUrl,
    // Ensure supplier info is properly formatted
    supplier: {
      _id: productObj.supplier?._id,
      companyName: productObj.supplier?.companyName || 'Unknown Supplier',
      rating: productObj.supplier?.rating || { average: 0, count: 0 },
      isApproved: productObj.supplier?.isApproved || false
    },
    supplierName: productObj.supplier?.companyName || 'Unknown Supplier',
    // Keep original structure for compatibility
    pricing: productObj.pricing,
    stock: productObj.stock
  };
});
    // Get product statistics
    const stats = {
      total: await Product.countDocuments({ supplier: supplier._id }),
      active: await Product.countDocuments({ supplier: supplier._id, isActive: true, isApproved: true }),
      pending: await Product.countDocuments({ supplier: supplier._id, isApproved: false }),
      inactive: await Product.countDocuments({ supplier: supplier._id, isActive: false })
    };

    console.log('📈 Stats:', stats);

    const responseData = {
      success: true,
      data: {
        products: transformedProducts,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: total,
          itemsPerPage: parseInt(limit),
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        },
        stats,
        needsProfile: false
      }
    };

    console.log('✅ Sending response with', transformedProducts.length, 'products');
    console.log('=== END DEBUG ===');

    res.json(responseData);

  } catch (error) {
    console.error('❌ Products API error:', error);
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
router.get('/suppliers-with-distance', [
  query('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
  query('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
  query('maxDistance').optional().isFloat({ min: 0 }).withMessage('Invalid max distance')
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

    const { latitude, longitude, maxDistance = 50 } = req.query;
    const userLocation = [parseFloat(longitude), parseFloat(latitude)];

    // Find suppliers within distance using aggregation
    const suppliers = await Product.aggregate([
      {
        $lookup: {
          from: 'suppliers',
          localField: 'supplier',
          foreignField: '_id',
          as: 'supplierData'
        }
      },
      {
        $unwind: '$supplierData'
      },
      {
        $match: {
          'supplierData.status': 'active',
          'supplierData.businessDetails.isVerified': true,
          'supplierData.location.coordinates': { $exists: true }
        }
      },
      {
        $addFields: {
          distance: {
            $divide: [
              {
                $sqrt: {
                  $add: [
                    {
                      $pow: [
                        {
                          $multiply: [
                            { $subtract: [{ $arrayElemAt: ['$supplierData.location.coordinates', 1] }, parseFloat(latitude)] },
                            111.32
                          ]
                        },
                        2
                      ]
                    },
                    {
                      $pow: [
                        {
                          $multiply: [
                            { $subtract: [{ $arrayElemAt: ['$supplierData.location.coordinates', 0] }, parseFloat(longitude)] },
                            { $multiply: [111.32, { $cos: { $multiply: [parseFloat(latitude), Math.PI / 180] } }] }
                          ]
                        },
                        2
                      ]
                    }
                  ]
                }
              },
              1
            ]
          }
        }
      },
      {
        $match: {
          distance: { $lte: parseFloat(maxDistance) }
        }
      },
      {
        $group: {
          _id: '$supplierData._id',
          businessName: { $first: '$supplierData.businessDetails.businessName' },
          location: { $first: '$supplierData.location' },
          distance: { $first: '$distance' },
          contactInfo: { $first: '$supplierData.contactInfo.email' },
          rating: { $first: '$supplierData.ratings.average' },
          totalProducts: { $sum: 1 },
          isVerified: { $first: '$supplierData.businessDetails.isVerified' }
        }
      },
      {
        $sort: { distance: 1 }
      },
      { $limit: 20 }
    ]);

    res.json({
      success: true,
      data: {
        suppliers,
        userLocation: { latitude: parseFloat(latitude), longitude: parseFloat(longitude) },
        maxDistance: parseFloat(maxDistance)
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

// Add before the module.exports line (around line 1584)

// @route   PUT /api/products/:id/toggle-stock
// @desc    Toggle product stock availability (supplier only)
// @access  Private
router.put('/:id/toggle-stock', 
  auth, 
  authorize(['supplier']),
  async (req, res, next) => {
    try {
      // Find the supplier
      const supplier = await Supplier.findOne({ user: req.user._id });
      if (!supplier) {
        return res.status(404).json({
          success: false,
          message: 'Supplier profile not found'
        });
      }

      // Find the product and verify ownership
      const product = await Product.findOne({
        _id: req.params.id,
        supplier: supplier._id
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found or you do not have permission to modify it'
        });
      }

      // Toggle the isActive status
      product.isActive = !product.isActive;
      await product.save();

      res.json({
        success: true,
        message: `Product ${product.isActive ? 'activated' : 'deactivated'} successfully`,
        data: {
          productId: product._id,
          name: product.name,
          isActive: product.isActive,
          stockStatus: product.isActive ? 'In Stock' : 'Out of Stock'
        }
      });

    } catch (error) {
      console.error('Toggle stock error:', error);
      next(error);
    }
  }
);

module.exports = router;
