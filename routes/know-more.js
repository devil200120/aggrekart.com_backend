const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const KnowMoreContent = require('../models/KnowMoreContent');
const Product = require('../models/Product');
const { ErrorHandler } = require('../utils/errorHandler');

const { uploadKnowMoreImages } = require('../utils/cloudinary');
const router = express.Router();

// @route   GET /api/know-more/product/:productId
// @desc    Get know more content for a specific product
// @access  Public
router.get('/product/:productId', [
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

    const content = await KnowMoreContent.getByProduct(productId);
    
    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Know more content not found for this product'
      });
    }

    // Increment view count
    await content.incrementView();

    res.json({
      success: true,
      data: { content }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/know-more/subcategory/:category/:subcategory
// @desc    Get know more content for a specific subcategory
// @access  Public
router.get('/subcategory/:category/:subcategory', [
  param('category').isIn(['aggregate', 'sand', 'tmt_steel', 'bricks_blocks', 'cement']).withMessage('Invalid category'),
  param('subcategory').notEmpty().withMessage('Subcategory is required')
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

    const { category, subcategory } = req.params;

    const content = await KnowMoreContent.getBySubcategory(category, subcategory);
    
    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Know more content not found for this subcategory'
      });
    }

    // Increment view count
    await content.incrementView();

    res.json({
      success: true,
      data: { content }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/know-more/click/:contentId
// @desc    Track click on know more button
// @access  Public
router.post('/click/:contentId', [
  param('contentId').notEmpty().withMessage('Content ID is required')
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

    const { contentId } = req.params;

    const content = await KnowMoreContent.findOne({ contentId });
    
    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Know more content not found'
      });
    }

    // Increment click count
    await content.incrementClick();

    res.json({
      success: true,
      message: 'Click tracked successfully'
    });

  } catch (error) {
    next(error);
  }
});

// ADMIN ROUTES

// @route   GET /api/know-more/admin/contents
// @desc    Get all know more contents for admin
// @access  Private (Admin)
router.get('/admin/contents', auth, authorize('admin'), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('type').optional().isIn(['product', 'subcategory']).withMessage('Invalid type'),
  query('category').optional().isIn(['aggregate', 'sand', 'tmt_steel', 'bricks_blocks', 'cement']).withMessage('Invalid category'),
  query('isActive').optional().isBoolean().withMessage('isActive must be boolean')
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
      limit = 20,
      type,
      category,
      isActive,
      search
    } = req.query;

    // Build filter
    const filter = {};
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    // Search functionality
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { subtitle: { $regex: search, $options: 'i' } },
        { contentId: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const contents = await KnowMoreContent.find(filter)
      .populate('productId', 'name category subcategory')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await KnowMoreContent.countDocuments(filter);

    res.json({
      success: true,
      data: {
        contents,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalContents: total,
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/know-more/admin/content/:id
// @desc    Get specific know more content for editing
// @access  Private (Admin)
router.get('/admin/content/:id', auth, authorize('admin'), [
  param('id').isMongoId().withMessage('Invalid content ID')
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

    const content = await KnowMoreContent.findById(req.params.id)
      .populate('productId', 'name category subcategory')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!content) {
      return next(new ErrorHandler('Know more content not found', 404));
    }

    res.json({
      success: true,
      data: { content }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/know-more/admin/content
// @desc    Create new know more content
// @access  Private (Admin)
router.post('/admin/content', auth, authorize('admin'), [
  body('type').isIn(['product', 'subcategory']).withMessage('Type must be either product or subcategory'),
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required and must not exceed 200 characters'),
  body('subtitle').optional().trim().isLength({ max: 300 }).withMessage('Subtitle must not exceed 300 characters'),
  body('productId').if(body('type').equals('product')).isMongoId().withMessage('Valid product ID is required for product type'),
  body('category').if(body('type').equals('subcategory')).isIn(['aggregate', 'sand', 'tmt_steel', 'bricks_blocks', 'cement']).withMessage('Valid category is required for subcategory type'),
  body('subcategory').if(body('type').equals('subcategory')).notEmpty().withMessage('Subcategory is required for subcategory type'),
  body('sections').optional().isArray().withMessage('Sections must be an array'),
  body('highlights').optional().isArray().withMessage('Highlights must be an array'),
  body('faqs').optional().isArray().withMessage('FAQs must be an array')
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

    const contentData = {
      ...req.body,
      createdBy: req.user._id
    };

    // Validate product exists if type is product
    if (contentData.type === 'product') {
      const product = await Product.findById(contentData.productId);
      if (!product) {
        return next(new ErrorHandler('Product not found', 404));
      }
    }

    // Check for existing content
    let existingContent;
    if (contentData.type === 'product') {
      existingContent = await KnowMoreContent.findOne({
        type: 'product',
        productId: contentData.productId
      });
    } else {
      existingContent = await KnowMoreContent.findOne({
        type: 'subcategory',
        category: contentData.category,
        subcategory: contentData.subcategory
      });
    }

    if (existingContent) {
      return next(new ErrorHandler('Know more content already exists for this item', 400));
    }

    const content = new KnowMoreContent(contentData);
    await content.save();

    await content.populate([
      { path: 'productId', select: 'name category subcategory' },
      { path: 'createdBy', select: 'name email' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Know more content created successfully',
      data: { content }
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/know-more/admin/content/:id
// @desc    Update know more content
// @access  Private (Admin)
router.put('/admin/content/:id', auth, authorize('admin'), [
  param('id').isMongoId().withMessage('Invalid content ID'),
  body('title').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Title must not exceed 200 characters'),
  body('subtitle').optional().trim().isLength({ max: 300 }).withMessage('Subtitle must not exceed 300 characters'),
  body('sections').optional().isArray().withMessage('Sections must be an array'),
  body('highlights').optional().isArray().withMessage('Highlights must be an array'),
  body('faqs').optional().isArray().withMessage('FAQs must be an array')
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

    const content = await KnowMoreContent.findById(req.params.id);
    if (!content) {
      return next(new ErrorHandler('Know more content not found', 404));
    }

    // Update content
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        content[key] = req.body[key];
      }
    });

    content.updatedBy = req.user._id;
    await content.save();

    await content.populate([
      { path: 'productId', select: 'name category subcategory' },
      { path: 'createdBy', select: 'name email' },
      { path: 'updatedBy', select: 'name email' }
    ]);

    res.json({
      success: true,
      message: 'Know more content updated successfully',
      data: { content }
    });

  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/know-more/admin/content/:id
// @desc    Delete know more content
// @access  Private (Admin)
router.delete('/admin/content/:id', auth, authorize('admin'), [
  param('id').isMongoId().withMessage('Invalid content ID')
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

    const content = await KnowMoreContent.findById(req.params.id);
    if (!content) {
      return next(new ErrorHandler('Know more content not found', 404));
    }

    await KnowMoreContent.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Know more content deleted successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/know-more/admin/content/:id/toggle-status
// @desc    Toggle active status of know more content
// @access  Private (Admin)
router.put('/admin/content/:id/toggle-status', auth, authorize('admin'), [
  param('id').isMongoId().withMessage('Invalid content ID')
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

    const content = await KnowMoreContent.findById(req.params.id);
    if (!content) {
      return next(new ErrorHandler('Know more content not found', 404));
    }

    content.isActive = !content.isActive;
    content.updatedBy = req.user._id;
    await content.save();

    res.json({
      success: true,
      message: `Know more content ${content.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { content }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/know-more/admin/analytics
// @desc    Get analytics for know more contents
// @access  Private (Admin)
router.get('/admin/analytics', auth, authorize('admin'), async (req, res, next) => {
  try {
    const analytics = await KnowMoreContent.aggregate([
      {
        $group: {
          _id: null,
          totalContents: { $sum: 1 },
          activeContents: { $sum: { $cond: ['$isActive', 1, 0] } },
          totalViews: { $sum: '$viewCount' },
          totalClicks: { $sum: '$clickCount' },
          avgViews: { $avg: '$viewCount' },
          avgClicks: { $avg: '$clickCount' }
        }
      }
    ]);

    const typeBreakdown = await KnowMoreContent.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          views: { $sum: '$viewCount' },
          clicks: { $sum: '$clickCount' }
        }
      }
    ]);

    const categoryBreakdown = await KnowMoreContent.aggregate([
      { $match: { type: 'subcategory' } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          views: { $sum: '$viewCount' },
          clicks: { $sum: '$clickCount' }
        }
      }
    ]);

    const topPerforming = await KnowMoreContent.find()
      .sort({ viewCount: -1 })
      .limit(10)
      .select('title type category subcategory viewCount clickCount')
      .populate('productId', 'name');

    res.json({
      success: true,
      data: {
        overall: analytics[0] || {
          totalContents: 0,
          activeContents: 0,
          totalViews: 0,
          totalClicks: 0,
          avgViews: 0,
          avgClicks: 0
        },
        typeBreakdown,
        categoryBreakdown,
        topPerforming
      }
    });

  } catch (error) {
    next(error);
  }
});
// Add this route after the existing routes:

// @route   POST /api/know-more/upload-images
// @desc    Upload images for know more content
// @access  Private (Admin)
// Find line 515 and replace the entire route with this:

// @route   POST /api/know-more/upload-images
// @desc    Upload images for know more content
// @access  Private (Admin)
router.post('/upload-images', auth, authorize('admin'), (req, res, next) => {
  // Use the uploadProductImages middleware
  uploadKnowMoreImages(req, res, async (err) => {
    if (err) {
      console.error('Upload middleware error:', err);
      return next(err);
    }

    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No images uploaded'
        });
      }

      console.log('✅ Processing uploaded files for Know More content...');

      // Map uploaded files to the format expected by the frontend
      const images = req.files.map((file, index) => {
        console.log(`📸 Processing image ${index + 1}:`, {
          filename: file.filename,
          path: file.path,
          size: file.size
        });

        return {
          url: file.path,
          alt: `Know More Image ${index + 1}`,
          caption: '',
          order: index,
          cloudinaryId: file.filename
        };
      });

      console.log('🎉 Know More images processed successfully:', images.length);

      res.json({
        success: true,
        message: 'Images uploaded successfully',
        data: { images: images }
      });

    } catch (error) {
      console.error('Error uploading know more images:', error);
      next(error);
    }
  });
});

module.exports = router;