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
const { uploadProductImages } = require('../utils/cloudinary');


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
// Add this new route after the existing dashboard route (around line 95):

// @route   GET /api/admin/dashboard/stats
// @desc    Get formatted dashboard statistics for admin dashboard
// @access  Private (Admin)
router.get('/dashboard/stats', auth, authorize('admin'), async (req, res, next) => {
  try {
    console.log('📊 Fetching admin dashboard stats...');

    // Get current date for time-based calculations
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Get user statistics
    const totalUsers = await User.countDocuments();
    const usersThisMonth = await User.countDocuments({
      createdAt: { $gte: startOfMonth }
    });
    const usersLastMonth = await User.countDocuments({
      createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }
    });

    // Get supplier statistics
    const totalSuppliers = await Supplier.countDocuments();
    const activeSuppliers = await Supplier.countDocuments({ 
      isApproved: true, 
      isActive: true 
    });
    const pendingSuppliers = await Supplier.countDocuments({ isApproved: false });
    const suppliersThisMonth = await Supplier.countDocuments({
      createdAt: { $gte: startOfMonth }
    });
    const suppliersLastMonth = await Supplier.countDocuments({
      createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }
    });

    // Get order statistics
    const totalOrders = await Order.countDocuments();
    const ordersThisMonth = await Order.countDocuments({
      createdAt: { $gte: startOfMonth }
    });
    const ordersLastMonth = await Order.countDocuments({
      createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }
    });

    // Get product statistics
    const totalProducts = await Product.countDocuments({ isBaseProduct: false });
    const activeProducts = await Product.countDocuments({ 
      isApproved: true, 
      isActive: true,
      isBaseProduct: false 
    });
    const pendingProducts = await Product.countDocuments({ 
      isApproved: false,
      isBaseProduct: false 
    });
    const productsThisMonth = await Product.countDocuments({
      createdAt: { $gte: startOfMonth },
      isBaseProduct: false
    });
    const productsLastMonth = await Product.countDocuments({
      createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
      isBaseProduct: false
    });

    // Get revenue statistics
    const revenueStats = await Order.aggregate([
      { $match: { status: { $in: ['delivered', 'completed'] } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$pricing.totalAmount' },
          totalCommission: { $sum: '$pricing.commission' }
        }
      }
    ]);

    const monthlyRevenueStats = await Order.aggregate([
      { 
        $match: { 
          status: { $in: ['delivered', 'completed'] },
          createdAt: { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          monthlyRevenue: { $sum: '$pricing.totalAmount' },
          monthlyCommission: { $sum: '$pricing.commission' }
        }
      }
    ]);

    const lastMonthRevenueStats = await Order.aggregate([
      { 
        $match: { 
          status: { $in: ['delivered', 'completed'] },
          createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }
        }
      },
      {
        $group: {
          _id: null,
          lastMonthRevenue: { $sum: '$pricing.totalAmount' }
        }
      }
    ]);

    // Calculate growth percentages
    const calculateGrowth = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const userGrowth = calculateGrowth(usersThisMonth, usersLastMonth);
    const supplierGrowth = calculateGrowth(suppliersThisMonth, suppliersLastMonth);
    const orderGrowth = calculateGrowth(ordersThisMonth, ordersLastMonth);
    const productGrowth = calculateGrowth(productsThisMonth, productsLastMonth);

    const currentMonthRevenue = monthlyRevenueStats[0]?.monthlyRevenue || 0;
    const lastMonthRevenue = lastMonthRevenueStats[0]?.lastMonthRevenue || 0;
    const revenueGrowth = calculateGrowth(currentMonthRevenue, lastMonthRevenue);

    // Get recent activity
    const recentActivity = [];

    // Recent users
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(3)
      .select('name role createdAt');

    recentUsers.forEach(user => {
      recentActivity.push({
        type: 'user',
        message: `New ${user.role} registered: ${user.name}`,
        timestamp: user.createdAt.toLocaleString()
      });
    });

    // Recent orders
    const recentOrders = await Order.find()
      .populate('customer', 'name')
      .sort({ createdAt: -1 })
      .limit(3)
      .select('customer status pricing.totalAmount createdAt');

    recentOrders.forEach(order => {
      recentActivity.push({
        type: 'order',
        message: `New order ₹${order.pricing.totalAmount} by ${order.customer?.name || 'Unknown'}`,
        timestamp: order.createdAt.toLocaleString()
      });
    });

    // Recent suppliers
    const recentSupplierApprovals = await Supplier.find({ isApproved: false })
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .limit(2)
      .select('user companyName createdAt');

    recentSupplierApprovals.forEach(supplier => {
      recentActivity.push({
        type: 'supplier',
        message: `Supplier pending approval: ${supplier.companyName}`,
        timestamp: supplier.createdAt.toLocaleString()
      });
    });

    // Sort activity by timestamp
    recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Format the response to match frontend expectations
    const dashboardStats = {
      totalUsers,
      userGrowth,
      activeSuppliers,
      supplierGrowth,
      totalOrders,
      orderGrowth,
      totalRevenue: revenueStats[0]?.totalRevenue || 0,
      revenueGrowth,
      pendingApprovals: pendingSuppliers + pendingProducts,
      approvalChange: 0, // Could be calculated if needed
      monthlyRevenue: currentMonthRevenue,
      monthlyGrowth: revenueGrowth,
      activeProducts,
      productGrowth,
      platformCommission: revenueStats[0]?.totalCommission || 0,
      commissionGrowth: revenueGrowth, // Using same as revenue growth
      pendingSuppliers,
      pendingProducts,
      recentActivity: recentActivity.slice(0, 10)
    };

    console.log('✅ Dashboard stats compiled:', {
      totalUsers,
      activeSuppliers,
      totalOrders,
      totalRevenue: dashboardStats.totalRevenue,
      pendingApprovals: dashboardStats.pendingApprovals
    });

    res.json({
      success: true,
      data: dashboardStats
    });

  } catch (error) {
    console.error('❌ Dashboard stats error:', error);
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
// Add these routes before the final module.exports = router; line

// @route   GET /api/admin/users
// @desc    Get all users with filters
// @access  Private (Admin)
router.get('/users', auth, authorize('admin'), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('role').optional().isIn(['all', 'customer', 'supplier', 'admin']).withMessage('Invalid role'),
  query('status').optional().isIn(['all', 'active', 'inactive', 'verified', 'unverified']).withMessage('Invalid status'),
  query('search').optional().trim().isLength({ min: 2 }).withMessage('Search query must be at least 2 characters')
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
      role = 'all', 
      status = 'all', 
      search 
    } = req.query;

    // Build filter
    let filter = {};
    
    if (role !== 'all') {
      filter.role = role;
    }

    switch (status) {
      case 'active':
        filter.isActive = true;
        break;
      case 'inactive':
        filter.isActive = false;
        break;
      case 'verified':
        filter.phoneVerified = true;
        break;
      case 'unverified':
        filter.phoneVerified = false;
        break;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { phoneNumber: searchRegex },
        { customerId: searchRegex }
      ];
    }

    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(filter);

    // Get user statistics
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const userObj = user.toObject();
        
        if (user.role === 'customer') {
          // Get order statistics for customers
          const orderStats = await Order.aggregate([
            { $match: { customer: user._id } },
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalSpent: { $sum: '$pricing.totalAmount' },
                completedOrders: {
                  $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
                }
              }
            }
          ]);

          userObj.stats = orderStats[0] || {
            totalOrders: 0,
            totalSpent: 0,
            completedOrders: 0
          };
        } else if (user.role === 'supplier') {
          // Get supplier statistics
          const supplier = await Supplier.findOne({ user: user._id });
          userObj.supplierInfo = supplier ? {
            supplierId: supplier.supplierId,
            companyName: supplier.companyName,
            isApproved: supplier.isApproved,
            isActive: supplier.isActive
          } : null;
        }

        return userObj;
      })
    );

    res.json({
      success: true,
      data: {
        users: usersWithStats,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        },
        filters: { role, status, search }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/admin/orders
// @desc    Get all orders with filters for admin
// @access  Private (Admin)
router.get('/orders', auth, authorize('admin'), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('status').optional().isIn(['all', 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled']).withMessage('Invalid status'),
  query('search').optional().trim().isLength({ min: 2 }).withMessage('Search query must be at least 2 characters'),
  query('supplier').optional().isMongoId().withMessage('Invalid supplier ID'),
  query('customer').optional().isMongoId().withMessage('Invalid customer ID'),
  query('dateFrom').optional().isISO8601().withMessage('Invalid date format'),
  query('dateTo').optional().isISO8601().withMessage('Invalid date format')
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
      supplier,
      customer,
      dateFrom,
      dateTo
    } = req.query;

    // Build filter
    let filter = {};
    
    if (status !== 'all') {
      filter.status = status;
    }

    if (supplier) {
      filter.supplier = supplier;
    }

    if (customer) {
      filter.customer = customer;
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let orders;
    let total;

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { orderId: searchRegex }
      ];
    }

    orders = await Order.find(filter)
      .populate('customer', 'name email phoneNumber customerId')
      .populate('supplier', 'companyName supplierId contactPersonName')
      .populate('items.product', 'name category')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    total = await Order.countDocuments(filter);

    // Calculate summary statistics
    const orderStats = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalValue: { $sum: '$pricing.totalAmount' },
          totalCommission: { $sum: '$pricing.commission' },
          averageOrderValue: { $avg: '$pricing.totalAmount' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        },
        summary: orderStats[0] || {
          totalValue: 0,
          totalCommission: 0,
          averageOrderValue: 0
        },
        filters: { status, search, supplier, customer, dateFrom, dateTo }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/admin/users/:userId
// @desc    Get detailed user information
// @access  Private (Admin)
router.get('/users/:userId', auth, authorize('admin'), [
  param('userId').isMongoId().withMessage('Valid user ID is required')
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

    const { userId } = req.params;

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return next(new ErrorHandler('User not found', 404));
    }

    let userDetails = user.toObject();

    // Get role-specific information
    if (user.role === 'customer') {
      // Get customer orders and statistics
      const orders = await Order.find({ customer: user._id })
        .populate('supplier', 'companyName')
        .select('orderId status pricing createdAt')
        .sort({ createdAt: -1 })
        .limit(10);

      const orderStats = await Order.aggregate([
        { $match: { customer: user._id } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalSpent: { $sum: '$pricing.totalAmount' },
            completedOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
            },
            cancelledOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
            }
          }
        }
      ]);

      userDetails.customerData = {
        recentOrders: orders,
        statistics: orderStats[0] || {
          totalOrders: 0,
          totalSpent: 0,
          completedOrders: 0,
          cancelledOrders: 0
        }
      };

    } else if (user.role === 'supplier') {
      // Get supplier information
      const supplier = await Supplier.findOne({ user: user._id });
      if (supplier) {
        const supplierProducts = await Product.find({ supplier: supplier._id })
          .select('name category isActive isApproved createdAt')
          .sort({ createdAt: -1 })
          .limit(10);

        userDetails.supplierData = {
          supplierInfo: supplier,
          recentProducts: supplierProducts
        };
      }
    }

    res.json({
      success: true,
      data: { user: userDetails }
    });

  } catch (error) {
    next(error);
  }
});
// Add these routes after the existing user routes (around line 1100):

// @route   PUT /api/admin/users/:userId
// @desc    Update user (edit user details)
// @access  Private (Admin)
router.put('/users/:userId', auth, authorize('admin'), [
  param('userId').isMongoId().withMessage('Valid user ID required'),
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').optional().isEmail().withMessage('Valid email required'),
  body('phoneNumber').optional().isMobilePhone().withMessage('Valid phone number required'),
  body('role').optional().isIn(['customer', 'supplier', 'admin']).withMessage('Invalid role')
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

    const { userId } = req.params;
    const updates = req.body;

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if email is being changed and already exists
    if (updates.email && updates.email !== user.email) {
      const existingUser = await User.findOne({ 
        email: updates.email.toLowerCase(),
        _id: { $ne: userId }
      });
      
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already registered'
        });
      }
    }

    // Update user
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        user[key] = updates[key];
      }
    });

    await user.save();

    res.json({
      success: true,
      message: 'User updated successfully',
      data: { user }
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/admin/users/:userId/suspend
// @desc    Suspend user account
// @access  Private (Admin)
router.put('/users/:userId/suspend', auth, authorize('admin'), [
  param('userId').isMongoId().withMessage('Valid user ID required'),
  body('reason').optional().trim().isLength({ max: 500 }).withMessage('Reason cannot exceed 500 characters')
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

    const { userId } = req.params;
    const { reason } = req.body;

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Don't allow suspending admin users
    if (user.role === 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Cannot suspend admin users'
      });
    }

    // Check if already suspended
    if (!user.isActive) {
      return res.status(400).json({
        success: false,
        message: 'User is already suspended'
      });
    }

    // Suspend user
    user.isActive = false;
    user.suspendedBy = req.user._id;
    user.suspendedAt = new Date();
    user.suspensionReason = reason || 'Suspended by admin';

    await user.save();

    res.json({
      success: true,
      message: 'User suspended successfully',
      data: { user }
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/admin/users/:userId/activate
// @desc    Activate user account
// @access  Private (Admin)
router.put('/users/:userId/activate', auth, authorize('admin'), [
  param('userId').isMongoId().withMessage('Valid user ID required')
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

    const { userId } = req.params;

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if already active
    if (user.isActive) {
      return res.status(400).json({
        success: false,
        message: 'User is already active'
      });
    }

    // Activate user
    user.isActive = true;
    user.suspendedBy = null;
    user.suspendedAt = null;
    user.suspensionReason = null;

    await user.save();

    res.json({
      success: true,
      message: 'User activated successfully',
      data: { user }
    });

  } catch (error) {
    next(error);
  }
});
// @route   GET /api/suppliers/base-products
// @desc    Get base products available for pricing (supplier only)
// @access  Private (Supplier)
router.get('/base-products', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    // Get base products that supplier hasn't set pricing for yet
    const existingProducts = await Product.find({ 
      supplier: supplier._id 
    }).select('name');
    
    const existingProductNames = existingProducts.map(p => p.name);

    const baseProducts = await Product.find({
      isBaseProduct: true,
      createdByAdmin: true,
      name: { $nin: existingProductNames } // Exclude products already priced by this supplier
    }).select('name description category subcategory images hsnCode specifications');

    res.json({
      success: true,
      data: { baseProducts }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/suppliers/products/:productId/pricing
// @desc    Set pricing for base product (supplier can only set price & delivery time)
// @access  Private (Supplier)
router.post('/products/:productId/pricing', auth, authorize('supplier'), [
  param('productId').isMongoId().withMessage('Valid product ID required'),
  body('pricing.basePrice').isFloat({ min: 0 }).withMessage('Valid base price required'),
  body('pricing.minimumQuantity').isFloat({ min: 0.1 }).withMessage('Valid minimum quantity required'),
  body('deliveryTime').notEmpty().withMessage('Delivery time is required'),
  body('stock.available').isFloat({ min: 0 }).withMessage('Valid stock quantity required')
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

    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    const { productId } = req.params;
    const { pricing, deliveryTime, stock } = req.body;

    // Find the base product
    const baseProduct = await Product.findOne({
      _id: productId,
      isBaseProduct: true,
      createdByAdmin: true
    });

    if (!baseProduct) {
      return next(new ErrorHandler('Base product not found', 404));
    }

    // Create new product instance for this supplier
    const supplierProduct = new Product({
      name: baseProduct.name,
      description: baseProduct.description,
      category: baseProduct.category,
      subcategory: baseProduct.subcategory,
      specifications: baseProduct.specifications,
      hsnCode: baseProduct.hsnCode,
      images: baseProduct.images, // Copy admin-uploaded images
      supplier: supplier._id,
      pricing: {
        basePrice: pricing.basePrice,
        unit: pricing.unit || baseProduct.pricing.unit,
        minimumQuantity: pricing.minimumQuantity,
        includesGST: pricing.includesGST || false,
        gstRate: pricing.gstRate || 18,
        transportCost: pricing.transportCost || { included: true, costPerKm: 0 }
      },
      stock: {
        available: stock.available,
        reserved: 0,
        lowStockThreshold: stock.lowStockThreshold || 10
      },
      deliveryTime,
      isBaseProduct: false, // This is now a supplier's product
      createdByAdmin: false,
      adminUploaded: false, // Images are from admin but this is supplier's product
      supplierCanModify: false, // Supplier can only modify pricing/stock/delivery
      isActive: true,
      isApproved: false // Needs admin approval
    });

    await supplierProduct.save();

    res.status(201).json({
      success: true,
      message: 'Pricing set successfully. Product pending approval.',
      data: { product: supplierProduct }
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/suppliers/products/:productId/pricing
// @desc    Update pricing for existing supplier product
// @access  Private (Supplier)
router.put('/products/:productId/pricing', auth, authorize('supplier'), [
  param('productId').isMongoId().withMessage('Valid product ID required'),
  body('pricing.basePrice').optional().isFloat({ min: 0 }).withMessage('Valid base price required'),
  body('deliveryTime').optional().notEmpty().withMessage('Delivery time cannot be empty'),
  body('stock.available').optional().isFloat({ min: 0 }).withMessage('Valid stock quantity required')
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

    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    const { productId } = req.params;
    const { pricing, deliveryTime, stock } = req.body;

    // Find supplier's product
    const product = await Product.findOne({
      _id: productId,
      supplier: supplier._id,
      isBaseProduct: false
    });

    if (!product) {
      return next(new ErrorHandler('Product not found', 404));
    }

    // Update only allowed fields (pricing, delivery time, stock)
    if (pricing) {
      if (pricing.basePrice !== undefined) product.pricing.basePrice = pricing.basePrice;
      if (pricing.minimumQuantity !== undefined) product.pricing.minimumQuantity = pricing.minimumQuantity;
      if (pricing.includesGST !== undefined) product.pricing.includesGST = pricing.includesGST;
      if (pricing.transportCost !== undefined) product.pricing.transportCost = pricing.transportCost;
    }

    if (deliveryTime) {
      product.deliveryTime = deliveryTime;
    }

    if (stock) {
      if (stock.available !== undefined) product.stock.available = stock.available;
      if (stock.lowStockThreshold !== undefined) product.stock.lowStockThreshold = stock.lowStockThreshold;
    }

    await product.save();

    res.json({
      success: true,
      message: 'Pricing updated successfully',
      data: { product }
    });

  } catch (error) {
    next(error);
  }
});
// Add these routes before the module.exports = router; line

// @route   POST /api/admin/products/create-base
// @desc    Create base product (admin only - with image upload)
// @access  Private (Admin)
// Replace the validation section around line 1290:

// Replace the entire create-base route (around lines 1295-1380) with this safer version:

router.post('/products/create-base', 
  auth, 
  authorize('admin'), 
  uploadProductImages, // Add multer middleware for image upload
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Product name must be 2-100 characters'),
    body('description').trim().isLength({ min: 10, max: 1000 }).withMessage('Description must be 10-1000 characters'),
    body('category').isIn(['aggregate', 'sand', 'tmt_steel', 'bricks_blocks', 'cement']).withMessage('Invalid category'),
    body('subcategory').optional().trim().isLength({ max: 50 }).withMessage('Subcategory cannot exceed 50 characters'),
    body('hsnCode').optional().trim().isLength({ min: 4, max: 8 }).withMessage('HSN code must be 4-8 characters'),
    body('pricingUnit').notEmpty().withMessage('Pricing unit is required')
  ], 
  async (req, res, next) => {
    try {
      console.log('🚀 Starting base product creation...');
      console.log('📄 Request body:', req.body);
      console.log('📁 Files uploaded:', req.files?.length || 0);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('❌ Validation errors:', errors.array());
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      // Check if images were uploaded
      if (!req.files || req.files.length === 0) {
        console.log('❌ No images uploaded');
        return res.status(400).json({
          success: false,
          message: 'At least one product image is required'
        });
      }

      const { 
  name, 
  description, 
  category, 
  subcategory, 
  hsnCode,
  specifications,
  pricingUnit
} = req.body;

      console.log('📋 Parsed data:', { name, category, subcategory });

      // Parse specifications safely
      let parsedSpecifications = {};
      if (specifications) {
        try {
          parsedSpecifications = typeof specifications === 'string' 
            ? JSON.parse(specifications) 
            : specifications;
          console.log('✅ Specifications parsed successfully');
        } catch (e) {
          console.log('⚠️ Invalid specifications format, using empty object');
          parsedSpecifications = {};
        }
      }

      // Check if base product with same name already exists
      console.log('🔍 Checking for existing product...');
      const existingProduct = await Product.findOne({
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        isBaseProduct: true,
        createdByAdmin: true
      });

      if (existingProduct) {
        console.log('❌ Product already exists:', existingProduct.name);
        return res.status(400).json({
          success: false,
          message: 'Base product with this name already exists'
        });
      }

      // Process uploaded images
      console.log('🖼️ Processing images...');
      const images = req.files.map((file, index) => {
        console.log(`📸 Image ${index + 1}:`, { path: file.path, filename: file.filename });
        return {
          url: file.path, // Cloudinary URL
          publicId: file.filename, // Cloudinary public ID
          alt: `${name} image ${index + 1}`,
          isPrimary: index === 0
        };
      });

      // Create base product
      console.log('💾 Creating base product in database...');
      const baseProduct = new Product({
        name,
        description,
        category,
        subcategory: subcategory || '',
        specifications: parsedSpecifications,
        hsnCode: hsnCode || '',
        images,
        pricing: {
         unit: pricingUnit,          basePrice: 0,
          minimumQuantity: 1,
          includesGST: false,
          gstRate: 18,
          transportCost: { included: true, costPerKm: 0 }
        },
        stock: {
          available: 0,
          reserved: 0,
          lowStockThreshold: 0
        },
        deliveryTime: 'To be set by supplier',
        supplier: null,
        isBaseProduct: true,
        createdByAdmin: true,
        adminUploaded: true,
        supplierCanModify: false,
        isActive: true,
        isApproved: true
      });

      const savedProduct = await baseProduct.save();
      console.log('✅ Base product created successfully:', savedProduct._id);

      res.status(201).json({
        success: true,
        message: 'Base product created successfully with images',
        data: { product: savedProduct }
      });

    } catch (error) {
      console.error('💥 Error in base product creation:');
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      // Make sure we call next(error) to prevent unhandled rejection
      next(error);
    }
  }
);
// @route   GET /api/admin/products/base-products
// @desc    Get all base products created by admin
// @access  Private (Admin)
router.get('/products/base-products', auth, authorize('admin'), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('category').optional().isIn(['aggregate', 'sand', 'tmt_steel', 'bricks_blocks', 'cement']).withMessage('Invalid category'),
  query('search').optional().trim().isLength({ min: 2 }).withMessage('Search query must be at least 2 characters')
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

    const { page = 1, limit = 10, category, search } = req.query;
    
    let filter = {
      isBaseProduct: true,
      createdByAdmin: true
    };

    if (category) {
      filter.category = category;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { name: searchRegex },
        { description: searchRegex }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const baseProducts = await Product.find(filter)
      .select('name description category subcategory images hsnCode specifications createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(filter);

    // Get supplier adoption stats for each base product
    const productsWithStats = await Promise.all(
      baseProducts.map(async (product) => {
        const supplierCount = await Product.countDocuments({
          name: product.name,
          isBaseProduct: false,
          createdByAdmin: false
        });

        const approvedSupplierCount = await Product.countDocuments({
          name: product.name,
          isBaseProduct: false,
          createdByAdmin: false,
          isApproved: true
        });

        return {
          ...product.toObject(),
          supplierStats: {
            totalSuppliers: supplierCount,
            approvedSuppliers: approvedSupplierCount,
            pendingApproval: supplierCount - approvedSupplierCount
          }
        };
      })
    );

    res.json({
      success: true,
      data: {
        baseProducts: productsWithStats,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        },
        filters: { category, search }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/admin/products/:productId/base-product
// @desc    Update base product (admin only)
// @access  Private (Admin)
router.put('/products/:productId/base-product', auth, authorize('admin'), [
  param('productId').isMongoId().withMessage('Valid product ID required'),
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Product name must be 2-100 characters'),
  body('description').optional().trim().isLength({ min: 10, max: 1000 }).withMessage('Description must be 10-1000 characters'),
  body('category').optional().isIn(['aggregate', 'sand', 'tmt_steel', 'bricks_blocks', 'cement']).withMessage('Invalid category'),
  body('subcategory').optional().trim().isLength({ max: 50 }).withMessage('Subcategory cannot exceed 50 characters'),
  body('specifications').optional().isObject().withMessage('Specifications must be an object'),
  body('images').optional().isArray({ min: 1 }).withMessage('At least one image is required')
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
    const updates = req.body;

    const baseProduct = await Product.findOne({
      _id: productId,
      isBaseProduct: true,
      createdByAdmin: true
    });

    if (!baseProduct) {
      return next(new ErrorHandler('Base product not found', 404));
    }

    // Update allowed fields
    Object.keys(updates).forEach(field => {
      if (['name', 'description', 'category', 'subcategory', 'specifications', 'images', 'hsnCode'].includes(field)) {
        baseProduct[field] = updates[field];
      }
    });

    await baseProduct.save();

    res.json({
      success: true,
      message: 'Base product updated successfully',
      data: { product: baseProduct }
    });

  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/admin/products/:productId/base-product
// @desc    Delete base product (admin only)
// @access  Private (Admin)
router.delete('/products/:productId/base-product', auth, authorize('admin'), [
  param('productId').isMongoId().withMessage('Valid product ID required')
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

    const baseProduct = await Product.findOne({
      _id: productId,
      isBaseProduct: true,
      createdByAdmin: true
    });

    if (!baseProduct) {
      return next(new ErrorHandler('Base product not found', 404));
    }

    // Check if any suppliers have created products based on this base product
    const supplierProducts = await Product.countDocuments({
      name: baseProduct.name,
      isBaseProduct: false
    });

    if (supplierProducts > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete base product. ${supplierProducts} supplier(s) have created products based on this base product.`
      });
    }

    await Product.deleteOne({ _id: productId });

    res.json({
      success: true,
      message: 'Base product deleted successfully'
    });

  } catch (error) {
    next(error);
  }
});
// Add this route before the module.exports = router; line (around line 1580):

// @route   GET /api/admin/products
// @desc    Get all products for admin review (with filters)
// @access  Private (Admin)
router.get('/products', auth, authorize('admin'), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['all', 'pending', 'approved', 'rejected', 'active', 'inactive']).withMessage('Invalid status'),
  query('category').optional().isIn(['aggregate', 'sand', 'tmt_steel', 'bricks_blocks', 'cement']).withMessage('Invalid category'),
  query('search').optional().trim().isLength({ min: 2 }).withMessage('Search query must be at least 2 characters'),
  query('supplierId').optional().isMongoId().withMessage('Invalid supplier ID')
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
      status = 'all', 
      category,
      search,
      supplierId
    } = req.query;

    // Build filter for products
    let filter = {
      // Exclude base products from admin review (only show supplier products)
      isBaseProduct: { $ne: true }
    };

    // Status filtering
    if (status !== 'all') {
      switch (status) {
        case 'pending':
          filter.isApproved = false;
          filter.isActive = true;
          break;
        case 'approved':
          filter.isApproved = true;
          filter.isActive = true;
          break;
        case 'rejected':
          filter.isApproved = false;
          filter.isActive = false;
          break;
        case 'active':
          filter.isActive = true;
          break;
        case 'inactive':
          filter.isActive = false;
          break;
      }
    }

    if (category) {
      filter.category = category;
    }

    if (supplierId) {
      filter.supplier = supplierId;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { name: searchRegex },
        { description: searchRegex },
        { brand: searchRegex }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    console.log('🔍 Admin products query filter:', filter);

    const products = await Product.find(filter)
      .populate('supplier', 'companyName supplierId contactPersonName email phoneNumber')
      .select('name description category subcategory brand pricing stock images isActive isApproved createdAt updatedAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(filter);

    // Transform products for frontend
    const transformedProducts = products.map(product => {
      const productObj = product.toObject();
      
      // Determine status
      let productStatus = 'pending';
      if (productObj.isApproved && productObj.isActive) {
        productStatus = 'approved';
      } else if (!productObj.isApproved && !productObj.isActive) {
        productStatus = 'rejected';
      } else if (!productObj.isApproved && productObj.isActive) {
        productStatus = 'pending';
      }

      return {
        ...productObj,
        status: productStatus,
        price: productObj.pricing?.basePrice || 0,
        supplier: {
          _id: productObj.supplier?._id,
          businessName: productObj.supplier?.companyName,
          supplierId: productObj.supplier?.supplierId,
          contactPerson: productObj.supplier?.contactPersonName
        }
      };
    });

    console.log(`📊 Found ${transformedProducts.length} products for admin review`);

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
        summary: {
          pending: await Product.countDocuments({ ...filter, isApproved: false, isActive: true }),
          approved: await Product.countDocuments({ ...filter, isApproved: true, isActive: true }),
          rejected: await Product.countDocuments({ ...filter, isApproved: false, isActive: false })
        }
      }
    });

  } catch (error) {
    console.error('❌ Error in admin products route:', error);
    next(error);
  }
});
// Add these routes before the module.exports = router; line:

// @route   PUT /api/admin/products/:productId/approve
// @desc    Approve a product
// @access  Private (Admin)
router.put('/products/:productId/approve', auth, authorize('admin'), [
  param('productId').isMongoId().withMessage('Valid product ID required'),
  body('reason').optional().trim().isLength({ max: 500 }).withMessage('Reason cannot exceed 500 characters')
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
    const { reason } = req.body;

    console.log('🔍 Admin approving product:', productId);

    const product = await Product.findById(productId).populate('supplier', 'companyName email contactPersonName');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (product.isApproved) {
      return res.status(400).json({
        success: false,
        message: 'Product is already approved'
      });
    }

    // Update product status
    product.isApproved = true;
    product.isActive = true;
    product.approvedBy = req.user._id;
    product.approvedAt = new Date();
    product.approvalReason = reason || 'Approved by admin';

    await product.save();

    console.log('✅ Product approved:', product.name);

    // TODO: Send notification email to supplier
    // try {
    //   await sendEmail(
    //     product.supplier.email,
    //     'Product Approved - Aggrekart',
    //     `Your product "${product.name}" has been approved and is now live on the platform.`
    //   );
    // } catch (error) {
    //   console.error('Failed to send approval email:', error);
    // }

    res.json({
      success: true,
      message: 'Product approved successfully',
      data: { 
        product: {
          _id: product._id,
          name: product.name,
          isApproved: product.isApproved,
          isActive: product.isActive
        }
      }
    });

  } catch (error) {
    console.error('❌ Error approving product:', error);
    next(error);
  }
});

// @route   PUT /api/admin/products/:productId/reject
// @desc    Reject a product
// @access  Private (Admin)
router.put('/products/:productId/reject', auth, authorize('admin'), [
  param('productId').isMongoId().withMessage('Valid product ID required'),
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

    const { productId } = req.params;
    const { reason } = req.body;

    console.log('🔍 Admin rejecting product:', productId);

    const product = await Product.findById(productId).populate('supplier', 'companyName email contactPersonName');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (product.rejectedAt) {
      return res.status(400).json({
        success: false,
        message: 'Product is already rejected'
      });
    }

    // Update product status
    product.isApproved = false;
    product.isActive = false;
    product.rejectedBy = req.user._id;
    product.rejectedAt = new Date();
    product.rejectionReason = reason;

    await product.save();

    console.log('❌ Product rejected:', product.name);

    // TODO: Send notification email to supplier
    // try {
    //   await sendEmail(
    //     product.supplier.email,
    //     'Product Rejected - Aggrekart',
    //     `Your product "${product.name}" has been rejected. Reason: ${reason}`
    //   );
    // } catch (error) {
    //   console.error('Failed to send rejection email:', error);
    // }

    res.json({
      success: true,
      message: 'Product rejected successfully'
    });

  } catch (error) {
    console.error('❌ Error rejecting product:', error);
    next(error);
  }
});

// @route   PUT /api/admin/products/:productId/featured
// @desc    Toggle product featured status
// @access  Private (Admin)
router.put('/products/:productId/featured', auth, authorize('admin'), [
  param('productId').isMongoId().withMessage('Valid product ID required'),
  body('featured').isBoolean().withMessage('Featured must be a boolean')
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
    const { featured } = req.body;

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    product.isFeatured = featured;
    await product.save();

    res.json({
      success: true,
      message: `Product ${featured ? 'featured' : 'unfeatured'} successfully`,
      data: {
        product: {
          _id: product._id,
          name: product.name,
          isFeatured: product.isFeatured
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/admin/products/:productId
// @desc    Delete a product (admin only)
// @access  Private (Admin)
router.delete('/products/:productId', auth, authorize('admin'), [
  param('productId').isMongoId().withMessage('Valid product ID required')
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

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if product has any orders
    const hasOrders = await mongoose.model('Order').countDocuments({
      'items.product': productId
    });

    if (hasOrders > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete product with existing orders. Consider deactivating instead.'
      });
    }

    await Product.deleteOne({ _id: productId });

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (error) {
    next(error);
  }
});

// Remove the supplier routes that shouldn't be here
// (The routes from line 1100-1285 should be moved to suppliers.js)

module.exports = router;
