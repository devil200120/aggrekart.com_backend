const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const SupplierOnboarding = require('../utils/supplierOnboarding');
const { ErrorHandler } = require('../utils/errorHandler');
const router = express.Router();

// @route   GET /api/supplier/onboarding/status
// @desc    Get onboarding status
// @access  Private (Supplier)
router.get('/status', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    const status = await SupplierOnboarding.getOnboardingStatus(supplier._id);
    
    // Get product count
    const productCount = await Product.countDocuments({ supplier: supplier._id });
    status.productsAdded = productCount > 0;

    // Recalculate completion percentage with product data
    let completed = 0;
    const totalSteps = 5;

    if (supplier.onboardingStep === 'registration_complete') completed++;
    if (status.documentsUploaded) completed++;
    if (supplier.isApproved) completed++;
    if (status.profileComplete) completed++;
    if (status.productsAdded) completed++;

    status.completionPercentage = Math.round((completed / totalSteps) * 100);

    // Get next steps
    const nextSteps = [];
    if (!status.documentsUploaded) {
      nextSteps.push({
        title: 'Upload Documents',
        description: 'Upload GST certificate, PAN card, and bank statement',
        action: 'upload_documents'
      });
    }
    if (!supplier.isApproved && status.documentsUploaded) {
      nextSteps.push({
        title: 'Wait for Approval',
        description: 'Your documents are being reviewed by our team',
        action: 'wait_approval'
      });
    }
    if (supplier.isApproved && !status.profileComplete) {
      nextSteps.push({
        title: 'Complete Profile',
        description: 'Set transport rates and configure your service areas',
        action: 'complete_profile'
      });
    }
    if (supplier.isApproved && status.profileComplete && !status.productsAdded) {
      nextSteps.push({
        title: 'Add Products',
        description: 'Start adding products to your catalog',
        action: 'add_products'
      });
    }

    res.json({
      success: true,
      data: {
        status,
        nextSteps,
        supplier: {
          supplierId: supplier.supplierId,
          companyName: supplier.companyName,
          isApproved: supplier.isApproved,
          createdAt: supplier.createdAt
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/supplier/onboarding/setup-categories
// @desc    Setup product categories
// @access  Private (Supplier)
router.post('/setup-categories', auth, authorize('supplier'), [
  body('categories').isArray({ min: 1, max: 5 }).withMessage('Select 1-5 categories'),
  body('categories.*').isIn(['aggregate', 'sand', 'tmt_steel', 'bricks_blocks', 'cement']).withMessage('Invalid category')
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

    const { categories } = req.body;

    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    if (!supplier.isApproved) {
      return next(new ErrorHandler('Supplier account not approved yet', 403));
    }

    const result = await SupplierOnboarding.setupProductCatalog(supplier._id, categories);

    res.json({
      success: true,
      message: 'Product categories configured successfully',
      data: {
        categories,
        nextStep: 'add_products'
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/supplier/onboarding/checklist
// @desc    Get onboarding checklist
// @access  Private (Supplier)
router.get('/checklist', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    const productCount = await Product.countDocuments({ supplier: supplier._id });

    const checklist = [
      {
        id: 'registration',
        title: 'Complete Registration',
        description: 'Basic business information and GST details',
        completed: !!supplier.gstNumber,
        required: true
      },
      {
        id: 'documents',
        title: 'Upload Documents',
        description: 'GST certificate, PAN card, bank statement',
        completed: supplier.documentsUploaded.length >= 3,
        required: true,
        items: [
          {
            name: 'GST Certificate',
            completed: supplier.documentsUploaded.some(doc => doc.type === 'gst_certificate')
          },
          {
            name: 'PAN Card',
            completed: supplier.documentsUploaded.some(doc => doc.type === 'pan_card')
          },
          {
            name: 'Bank Statement',
            completed: supplier.documentsUploaded.some(doc => doc.type === 'bank_statement')
          }
        ]
      },
      {
        id: 'approval',
        title: 'Account Approval',
        description: 'Wait for admin to review and approve your account',
        completed: supplier.isApproved,
        required: true
      },
      {
        id: 'transport_rates',
        title: 'Set Transport Rates',
        description: 'Configure delivery charges for different distances',
        completed: !!(supplier.transportRates.upTo5km.costPerKm && 
                     supplier.transportRates.upTo10km.costPerKm &&
                     supplier.transportRates.upTo20km.costPerKm &&
                     supplier.transportRates.above20km.costPerKm),
        required: true
      },
      {
        id: 'categories',
        title: 'Select Product Categories',
        description: 'Choose which materials you will supply',
        completed: supplier.categories.length > 0,
        required: true
      },
      {
        id: 'products',
        title: 'Add Products',
        description: 'Create your first product listings',
        completed: productCount > 0,
        required: true
      },
      {
        id: 'profile_photo',
        title: 'Add Company Logo',
        description: 'Upload your company logo for better recognition',
        completed: false, // Would check for uploaded logo
        required: false
      },
      {
        id: 'service_areas',
        title: 'Define Service Areas',
        description: 'Set pincodes where you can deliver',
        completed: supplier.serviceAreas.length > 0,
        required: false
      }
    ];

    const completedItems = checklist.filter(item => item.completed).length;
    const requiredItems = checklist.filter(item => item.required).length;
    const completedRequired = checklist.filter(item => item.required && item.completed).length;

    const progress = {
      total: checklist.length,
      completed: completedItems,
      required: requiredItems,
      completedRequired,
      percentage: Math.round((completedItems / checklist.length) * 100),
      requiredPercentage: Math.round((completedRequired / requiredItems) * 100),
      canStartSelling: completedRequired === requiredItems
    };

    res.json({
      success: true,
      data: {
        checklist,
        progress
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/supplier/onboarding/complete
// @desc    Mark onboarding as complete
// @access  Private (Supplier)
router.post('/complete', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    if (!supplier.isApproved) {
      return next(new ErrorHandler('Account must be approved first', 400));
    }

    const productCount = await Product.countDocuments({ supplier: supplier._id });
    if (productCount === 0) {
      return next(new ErrorHandler('Add at least one product to complete onboarding', 400));
    }

    // Mark onboarding as complete
    supplier.onboardingStep = 'completed';
    supplier.onboardingCompletedAt = new Date();
    await supplier.save();

    res.json({
      success: true,
      message: 'Onboarding completed successfully! You can now start receiving orders.',
      data: {
        supplier: {
          supplierId: supplier.supplierId,
          companyName: supplier.companyName,
          onboardingStep: supplier.onboardingStep,
          completedAt: supplier.onboardingCompletedAt
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/supplier/onboarding/guide
// @desc    Get category-specific setup guides
// @access  Private (Supplier)
router.get('/guide', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    const guides = {
      aggregate: {
        title: 'Aggregate Materials Setup',
        description: 'Setting up aggregate products like stone chips, dust, and metals',
        products: ['Dust', '10MM Metal', '20MM Metal', '40MM Metal', 'GSB', 'WMM', 'M.sand'],
        tips: [
          'Include royalty charges in your pricing',
          'Set minimum quantities based on truck capacity',
          'Update stock regularly as it depends on quarry supply',
          'Mention grade and quality specifications'
        ],
        pricing: {
          unit: 'MT (Metric Tons)',
          typical_minimum: '2-5 MT',
          factors: ['Material cost', 'Royalty charges', 'Transport cost', 'Loading charges']
        }
      },
      sand: {
        title: 'Sand Products Setup',
        description: 'Setting up various types of sand for construction',
        products: ['River Sand (Plastering)', 'River Sand', 'M.Sand'],
        tips: [
          'Specify sand type and source clearly',
          'Include silt content information',
          'Mention if sand is washed or unwashed',
          'Transport cost varies significantly with distance'
        ],
        pricing: {
          unit: 'MT (Metric Tons)',
          typical_minimum: '5-10 MT',
          factors: ['Material cost', 'Royalty charges', 'Transport cost', 'Loading charges']
        }
      },
      tmt_steel: {
        title: 'TMT Steel Setup',
        description: 'Setting up TMT steel bars and rods',
        products: ['FE-415', 'FE-500', 'FE-550', 'FE-600'],
        variants: ['6mm', '8mm', '10mm', '12mm', '16mm', '20mm', '25mm', '32mm'],
        tips: [
          'Always mention the grade (FE-415, FE-500, etc.)',
          'Specify diameter clearly',
          'Include brand name for credibility',
          'Pricing varies with market fluctuations',
          'Minimum quantity usually 1 MT or more'
        ],
        pricing: {
          unit: 'MT (Metric Tons)',
          typical_minimum: '1-2 MT',
          factors: ['Base steel price', 'Brand premium', 'Transport cost', 'Loading charges']
        }
      },
      bricks_blocks: {
        title: 'Bricks & Blocks Setup',
        description: 'Setting up various types of bricks and blocks',
        products: ['Red Bricks', 'Fly Ash Bricks', 'Concrete Blocks', 'AAC Blocks'],
        tips: [
          'Specify exact dimensions (L x W x H)',
          'Mention strength/grade if applicable',
          'Include brand for branded products',
          'Pricing is usually per piece or per thousand',
          'Consider transport costs for breakage'
        ],
        pricing: {
          unit: 'Numbers (Per piece)',
          typical_minimum: '1000 pieces',
          factors: ['Manufacturing cost', 'Brand value', 'Transport cost', 'Loading charges']
        }
      },
      cement: {
        title: 'Cement Products Setup',
        description: 'Setting up different types and grades of cement',
        products: {
          OPC: ['33 Grade', '43 Grade', '53 Grade'],
          PPC: ['Various grades']
        },
        tips: [
          'Always specify cement type (OPC/PPC)',
          'Mention grade clearly (33/43/53)',
          'Include brand name',
          'Standard packaging is 50kg bags',
          'Check expiry dates regularly'
        ],
        pricing: {
          unit: 'Bags (50kg each)',
          typical_minimum: '50-100 bags',
          factors: ['Brand price', 'Transport cost', 'Loading charges', 'Storage cost']
        }
      }
    };

    // Return guides for supplier's selected categories
    const supplierGuides = {};
    supplier.categories.forEach(category => {
      if (guides[category]) {
        supplierGuides[category] = guides[category];
      }
    });

    res.json({
      success: true,
      data: {
        guides: supplierGuides,
        categories: supplier.categories,
        generalTips: [
          'Keep your pricing competitive but profitable',
          'Update stock levels regularly',
          'Respond to customer queries promptly',
          'Maintain good delivery times',
          'Upload clear product images',
          'Write detailed product descriptions'
        ]
      }
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;