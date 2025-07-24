const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const User = require('../models/User');
const Order = require('../models/Order');
const { ErrorHandler } = require('../utils/errorHandler');
const { sendEmail } = require('../utils/notifications');
const router = express.Router();

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard statistics
// @access  Private (Admin)
router.get('/dashboard', auth, authorize('admin'), async (req, res, next) => {
  try {
    // Get various statistics
    const stats = {
      users: {
        total: await User.countDocuments(),
        customers: await User.countDocuments({ role: 'customer' }),
        suppliers: await User.countDocuments({ role: 'supplier' }),
        active: await User.countDocuments({ isActive: true }),
        newThisMonth: await User.countDocuments({
          createdAt: { $gte: new Date(new Date().setDate(1)) }
        })
      },
      suppliers: {
        total: await Supplier.countDocuments(),
        approved: await Supplier.countDocuments({ isApproved: true }),
        pending: await Supplier.countDocuments({ isApproved: false }),
        active: await Supplier.countDocuments({ isActive: true }),
        topRated: await Supplier.countDocuments({ 'rating.average': { $gte: 4 } })
      },
      products: {
        total: await Product.countDocuments(),
        approved: await Product.countDocuments({ isApproved: true }),
        pending: await Product.countDocuments({ isApproved: false }),
        active: await Product.countDocuments({ isActive: true }),
        categories: await Product.aggregate([
          { $group: { _id: '$category', count: { $sum: 1 } } }
        ])
      },
      orders: {
        total: await Order.countDocuments(),
        delivered: await Order.countDocuments({ status: 'delivered' }),
        cancelled: await Order.countDocuments({ status: 'cancelled' }),
        thisMonth: await Order.countDocuments({
          createdAt: { $gte: new Date(new Date().setDate(1)) }
        })
      }
    };

    // Recent activities (pending approvals)
    const pendingSuppliers = await Supplier.find({ isApproved: false })
      .populate('user', 'name email phoneNumber')
      .limit(5)
      .sort({ createdAt: -1 });

    const pendingProducts = await Product.find({ isApproved: false })
      .populate('supplier', 'companyName')
      .limit(5)
      .sort({ createdAt: -1 });

    // Revenue statistics
    const revenueStats = await Order.aggregate([
      { $match: { status: 'delivered' } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$pricing.totalAmount' },
          totalCommission: { $sum: '$pricing.commission' },
          averageOrderValue: { $avg: '$pricing.totalAmount' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        stats,
        recentActivities: {
          pendingSuppliers,
          pendingProducts
        },
        revenue: revenueStats[0] || {
          totalRevenue: 0,
          totalCommission: 0,
          averageOrderValue: 0
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/admin/suppliers
// @desc    Get all suppliers with filters
// @access  Private (Admin)
router.get('/suppliers', auth, authorize('admin'), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('status').optional().isIn(['all', 'approved', 'pending', 'rejected']).withMessage('Invalid status'),
  query('search').optional().trim().isLength({ min: 2 }).withMessage('Search query must be at least 2 characters'),
  query('state').optional().isString(),
  query('category').optional().isIn(['aggregate', 'sand', 'tmt_steel', 'bricks_blocks', 'cement']).withMessage('Invalid category')
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
      status = 'all', 
      search, 
      state, 
      category 
    } = req.query;

    // Build filter
    let filter = {};
    
    switch (status) {
      case 'approved':
        filter.isApproved = true;
        break;
      case 'pending':
        filter.isApproved = false;
        filter.rejectedAt = { $exists: false };
        break;
      case 'rejected':
        filter.rejectedAt = { $exists: true };
        break;
      // 'all' - no additional filter
    }

    if (state) filter.state = state;
    if (category) filter.categories = category;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let suppliers;
    let total;

    if (search) {
      // Text search
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { companyName: searchRegex },
        { tradeOwnerName: searchRegex },
        { contactPersonName: searchRegex },
        { supplierId: searchRegex },
        { gstNumber: searchRegex }
      ];
    }

    suppliers = await Supplier.find(filter)
      .populate('user', 'name email phoneNumber createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    total = await Supplier.countDocuments(filter);

    // Get statistics for each supplier
    const suppliersWithStats = await Promise.all(
      suppliers.map(async (supplier) => {
        const supplierObj = supplier.toObject();
        
        // Get product count
        supplierObj.productCount = await Product.countDocuments({ 
          supplier: supplier._id 
        });
        
        // Get order statistics
        const orderStats = await Order.aggregate([
          { $match: { supplier: supplier._id } },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              totalRevenue: { $sum: '$pricing.totalAmount' },
              completedOrders: {
                $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
              }
            }
          }
        ]);

        supplierObj.stats = orderStats[0] || {
          totalOrders: 0,
          totalRevenue: 0,
          completedOrders: 0
        };

        return supplierObj;
      })
    );

    res.json({
      success: true,
      data: {
        suppliers: suppliersWithStats,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        },
        filters: { status, search, state, category }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/admin/suppliers/:supplierId
// @desc    Get detailed supplier information
// @access  Private (Admin)
router.get('/suppliers/:supplierId', auth, authorize('admin'), [
  param('supplierId').notEmpty().withMessage('Supplier ID is required')
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

    const { supplierId } = req.params;

    const supplier = await Supplier.findOne({
      $or: [{ _id: supplierId }, { supplierId }]
    }).populate('user', 'name email phoneNumber createdAt lastLogin');

    if (!supplier) {
      return next(new ErrorHandler('Supplier not found', 404));
    }

    // Get products
    const products = await Product.find({ supplier: supplier._id })
      .select('name category isActive isApproved createdAt pricing.basePrice')
      .sort({ createdAt: -1 });

    // Get recent orders
    const recentOrders = await Order.find({ supplier: supplier._id })
      .populate('customer', 'name customerId')
      .select('orderId status pricing.totalAmount createdAt')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get analytics
    const analytics = await Order.aggregate([
      { $match: { supplier: supplier._id } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$pricing.totalAmount' },
          averageOrderValue: { $avg: '$pricing.totalAmount' },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          }
        }
      }
    ]);

    // Get monthly performance
    const monthlyPerformance = await Order.aggregate([
      { 
        $match: { 
          supplier: supplier._id,
          createdAt: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)) }
        } 
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          orders: { $sum: 1 },
          revenue: { $sum: '$pricing.totalAmount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const supplierDetails = {
      ...supplier.toObject(),
      products: {
        total: products.length,
        active: products.filter(p => p.isActive && p.isApproved).length,
        pending: products.filter(p => !p.isApproved).length,
        items: products
      },
      orders: {
        recent: recentOrders,
        analytics: analytics[0] || {
          totalOrders: 0,
          totalRevenue: 0,
          averageOrderValue: 0,
          completedOrders: 0,
          cancelledOrders: 0
        }
      },
      performance: monthlyPerformance
    };

    res.json({
      success: true,
      data: { supplier: supplierDetails }
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/admin/suppliers/:supplierId/approve
// @desc    Approve supplier
// @access  Private (Admin)
router.put('/suppliers/:supplierId/approve', auth, authorize('admin'), [
  param('supplierId').notEmpty().withMessage('Supplier ID is required'),
  body('commissionRate').optional().isFloat({ min: 0, max: 20 }).withMessage('Commission rate must be between 0-20%'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
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

    const { supplierId } = req.params;
    const { commissionRate, notes } = req.body;

    const supplier = await Supplier.findOne({
      $or: [{ _id: supplierId }, { supplierId }]
    }).populate('user');

    if (!supplier) {
      return next(new ErrorHandler('Supplier not found', 404));
    }

    if (supplier.isApproved) {
      return next(new ErrorHandler('Supplier is already approved', 400));
    }

    // Update supplier status
    supplier.isApproved = true;
    supplier.isActive = true;
    supplier.approvedBy = req.user._id;
    supplier.approvedAt = new Date();
    
    if (commissionRate !== undefined) {
      supplier.commissionRate = commissionRate;
    }

    await supplier.save();

    // Send approval email
    try {
      await sendEmail(
        supplier.email,
        'Supplier Account Approved - Aggrekart',
        `
        Dear ${supplier.tradeOwnerName},

        Congratulations! Your supplier account has been approved.

        Supplier ID: ${supplier.supplierId}
        Company: ${supplier.companyName}
        Commission Rate: ${supplier.commissionRate}%

        You can now:
        - Add products to your catalog
        - Receive and manage orders
        - Track your sales and analytics

        Login to your supplier dashboard to get started.

        Best regards,
        Aggrekart Team
        `
      );
    } catch (error) {
      console.error('Failed to send approval email:', error);
    }

    res.json({
      success: true,
      message: 'Supplier approved successfully',
      data: { 
        supplier: {
          supplierId: supplier.supplierId,
          companyName: supplier.companyName,
          isApproved: supplier.isApproved,
          commissionRate: supplier.commissionRate
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/admin/suppliers/:supplierId/reject
// @desc    Reject supplier
// @access  Private (Admin)
router.put('/suppliers/:supplierId/reject', auth, authorize('admin'), [
  param('supplierId').notEmpty().withMessage('Supplier ID is required'),
  body('reason').trim().isLength({ min: 10, max: 500 }).withMessage('Rejection reason must be 10-500 characters')
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

    const { supplierId } = req.params;
    const { reason } = req.body;

    const supplier = await Supplier.findOne({
      $or: [{ _id: supplierId }, { supplierId }]
    }).populate('user');

    if (!supplier) {
      return next(new ErrorHandler('Supplier not found', 404));
    }

    if (supplier.rejectedAt) {
      return next(new ErrorHandler('Supplier is already rejected', 400));
    }

    // Update supplier status
    supplier.isApproved = false;
    supplier.isActive = false;
    supplier.rejectionReason = reason;
    supplier.rejectedBy = req.user._id;
    supplier.rejectedAt = new Date();

    await supplier.save();

    // Send rejection email
    try {
      await sendEmail(
        supplier.email,
        'Supplier Application Rejected - Aggrekart',
        `
        Dear ${supplier.tradeOwnerName},

        We regret to inform you that your supplier application has been rejected.

        Reason: ${reason}

        If you believe this is an error or would like to reapply with corrected information, please contact our support team.

        Best regards,
        Aggrekart Team
        `
      );
    } catch (error) {
      console.error('Failed to send rejection email:', error);
    }

    res.json({
      success: true,
      message: 'Supplier rejected successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/admin/suppliers/:supplierId/suspend
// @desc    Suspend/Unsuspend supplier
// @access  Private (Admin)
router.put('/suppliers/:supplierId/suspend', auth, authorize('admin'), [
  param('supplierId').notEmpty().withMessage('Supplier ID is required'),
  body('action').isIn(['suspend', 'unsuspend']).withMessage('Action must be suspend or unsuspend'),
  body('reason').optional().trim().isLength({ min: 5, max: 500 }).withMessage('Reason must be 5-500 characters')
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

    const { supplierId } = req.params;
    const { action, reason } = req.body;

    const supplier = await Supplier.findOne({
      $or: [{ _id: supplierId }, { supplierId }]
    }).populate('user');

    if (!supplier) {
      return next(new ErrorHandler('Supplier not found', 404));
    }

    if (!supplier.isApproved) {
      return next(new ErrorHandler('Cannot suspend unapproved supplier', 400));
    }

    const isSuspending = action === 'suspend';
    
    supplier.isActive = !isSuspending;
    supplier.suspendedBy = isSuspending ? req.user._id : null;
    supplier.suspendedAt = isSuspending ? new Date() : null;
    supplier.suspensionReason = isSuspending ? reason : null;

    await supplier.save();

    // Deactivate all products if suspending
    if (isSuspending) {
      await Product.updateMany(
        { supplier: supplier._id },
        { isActive: false }
      );
    }

    // Send notification email
    try {
      await sendEmail(
        supplier.email,
        `Supplier Account ${isSuspending ? 'Suspended' : 'Reactivated'} - Aggrekart`,
        `
        Dear ${supplier.tradeOwnerName},

        Your supplier account has been ${isSuspending ? 'suspended' : 'reactivated'}.

        ${isSuspending ? `Reason: ${reason}` : 'You can now resume normal operations.'}

        ${isSuspending ? 'Please contact support if you have any questions.' : 'Welcome back!'}

        Best regards,
        Aggrekart Team
        `
      );
    } catch (error) {
      console.error('Failed to send notification email:', error);
    }

    res.json({
      success: true,
      message: `Supplier ${isSuspending ? 'suspended' : 'reactivated'} successfully`,
      data: {
        supplier: {
          supplierId: supplier.supplierId,
          companyName: supplier.companyName,
          isActive: supplier.isActive
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/admin/suppliers/:supplierId/commission
// @desc    Update supplier commission rate
// @access  Private (Admin)
router.put('/suppliers/:supplierId/commission', auth, authorize('admin'), [
  param('supplierId').notEmpty().withMessage('Supplier ID is required'),
  body('commissionRate').isFloat({ min: 0, max: 20 }).withMessage('Commission rate must be between 0-20%'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
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

    const { supplierId } = req.params;
    const { commissionRate, notes } = req.body;

    const supplier = await Supplier.findOne({
      $or: [{ _id: supplierId }, { supplierId }]
    });

    if (!supplier) {
      return next(new ErrorHandler('Supplier not found', 404));
    }

    const oldRate = supplier.commissionRate;
    supplier.commissionRate = commissionRate;

    await supplier.save();

    // Log the commission change
    console.log(`Commission rate changed for ${supplier.supplierId}: ${oldRate}% -> ${commissionRate}%`);

    res.json({
      success: true,
      message: 'Commission rate updated successfully',
      data: {
        supplier: {
          supplierId: supplier.supplierId,
          companyName: supplier.companyName,
          oldCommissionRate: oldRate,
          newCommissionRate: commissionRate
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/admin/analytics/suppliers
// @desc    Get supplier analytics
// @access  Private (Admin)
router.get('/analytics/suppliers', auth, authorize('admin'), [
  query('period').optional().isIn(['7', '30', '90', '365']).withMessage('Period must be 7, 30, 90, or 365 days'),
  query('state').optional().isString(),
  query('category').optional().isIn(['aggregate', 'sand', 'tmt_steel', 'bricks_blocks', 'cement'])
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

    const { period = '30', state, category } = req.query;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - parseInt(period));

    // Build match filter
    let matchFilter = { createdAt: { $gte: fromDate } };
    if (state) matchFilter.state = state;
    if (category) matchFilter.categories = category;

    // Supplier registration trends
    const registrationTrends = await Supplier.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          registrations: { $sum: 1 },
          approved: { $sum: { $cond: ['$isApproved', 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // State-wise distribution
    const stateDistribution = await Supplier.aggregate([
      { $match: { isApproved: true } },
      { $group: { _id: '$state', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Category-wise distribution
    const categoryDistribution = await Product.aggregate([
      { $match: { isApproved: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    // Top performing suppliers
    const topSuppliers = await Supplier.aggregate([
      { $match: { isApproved: true } },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'supplier',
          as: 'orders'
        }
      },
      {
        $addFields: {
          totalRevenue: { $sum: '$orders.pricing.totalAmount' },
          orderCount: { $size: '$orders' }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
      {
        $project: {
          companyName: 1,
          supplierId: 1,
          totalRevenue: 1,
          orderCount: 1,
          rating: '$rating.average'
        }
      }
    ]);

    // Performance metrics
    const performanceMetrics = await Supplier.aggregate([
      { $match: { isApproved: true } },
      {
        $group: {
          _id: null,
          totalSuppliers: { $sum: 1 },
          averageRating: { $avg: '$rating.average' },
          totalOrders: { $sum: '$totalOrders' },
          totalRevenue: { $sum: '$totalRevenue' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period: parseInt(period),
        trends: {
          registrations: registrationTrends
        },
        distribution: {
          states: stateDistribution,
          categories: categoryDistribution
        },
        topPerformers: topSuppliers,
        metrics: performanceMetrics[0] || {
          totalSuppliers: 0,
          averageRating: 0,
          totalOrders: 0,
          totalRevenue: 0
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;