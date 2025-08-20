const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const SupplierPromotion = require('../models/SupplierPromotion');
const LoyaltyProgram = require('../models/LoyaltyProgram');
const Supplier = require('../models/Supplier');
const UserLoyalty = require('../models/UserLoyalty');
const User = require('../models/User');
const Order = require('../models/Order');
const { ErrorHandler } = require('../utils/errorHandler');
const router = express.Router();

// @route   GET /api/supplier-loyalty/dashboard
// @desc    Get supplier loyalty dashboard with comprehensive analytics
// @access  Private (Supplier)
router.get('/dashboard', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    console.log(`📊 Getting loyalty dashboard for supplier: ${supplier.companyName}`);

    // Get active promotions
    const activePromotions = await SupplierPromotion.find({
      supplier: supplier._id,
      status: 'active',
      isActive: true,
      'validity.endDate': { $gte: new Date() }
    }).sort({ createdAt: -1 });

    // Get promotion performance analytics
    const promotionAnalytics = {
      total: activePromotions.length,
      totalViews: activePromotions.reduce((sum, p) => sum + p.analytics.views, 0),
      totalConversions: activePromotions.reduce((sum, p) => sum + p.analytics.conversions, 0),
      totalSavings: activePromotions.reduce((sum, p) => sum + p.analytics.totalSavings, 0),
      conversionRate: 0
    };

    if (promotionAnalytics.totalViews > 0) {
      promotionAnalytics.conversionRate = ((promotionAnalytics.totalConversions / promotionAnalytics.totalViews) * 100).toFixed(2);
    }

    // Get customer analytics for this supplier
    const customerStats = await Order.aggregate([
      { $match: { supplier: supplier._id, status: { $ne: 'cancelled' } } },
      {
        $lookup: {
          from: 'users',
          localField: 'customer',
          foreignField: '_id',
          as: 'customerInfo'
        }
      },
      { $unwind: '$customerInfo' },
      {
        $group: {
          _id: '$customerInfo.customerType',
          count: { $sum: 1 },
          totalValue: { $sum: '$pricing.totalAmount' },
          avgOrderValue: { $avg: '$pricing.totalAmount' }
        }
      }
    ]);

    // Get monthly order trends
    const monthlyTrends = await Order.aggregate([
      {
        $match: {
          supplier: supplier._id,
          status: { $ne: 'cancelled' },
          createdAt: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 12)) }
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

    // Get top performing promotions
    const topPromotions = activePromotions
      .sort((a, b) => b.analytics.conversions - a.analytics.conversions)
      .slice(0, 5)
      .map(p => ({
        id: p._id,
        title: p.title,
        type: p.type,
        conversions: p.analytics.conversions,
        savings: p.analytics.totalSavings,
        conversionRate: p.analytics.views > 0 ? ((p.analytics.conversions / p.analytics.views) * 100).toFixed(2) : 0
      }));

    // Get pending approval promotions
    const pendingPromotions = await SupplierPromotion.countDocuments({
      supplier: supplier._id,
      status: 'pending_approval'
    });

    res.json({
      success: true,
      data: {
        overview: {
          activePromotions: activePromotions.length,
          pendingApproval: pendingPromotions,
          totalCustomers: customerStats.reduce((sum, stat) => sum + stat.count, 0),
          monthlyRevenue: monthlyTrends.reduce((sum, trend) => sum + trend.revenue, 0)
        },
        promotionAnalytics,
        customerDistribution: customerStats.map(stat => ({
          customerType: stat._id,
          count: stat.count,
          totalValue: stat.totalValue,
          avgOrderValue: Math.round(stat.avgOrderValue)
        })),
        monthlyTrends: monthlyTrends.map(trend => ({
          month: `${trend._id.year}-${String(trend._id.month).padStart(2, '0')}`,
          orders: trend.orders,
          revenue: trend.revenue
        })),
        topPromotions,
        recentPromotions: activePromotions.slice(0, 10).map(p => ({
          id: p._id,
          title: p.title,
          type: p.type,
          status: p.status,
          validTill: p.validity.endDate,
          usage: `${p.usage.currentUsage}/${p.usage.totalLimit || 'Unlimited'}`,
          conversions: p.analytics.conversions
        }))
      }
    });

  } catch (error) {
    console.error('❌ Supplier loyalty dashboard error:', error);
    next(error);
  }
});

// @route   GET /api/supplier-loyalty/promotions
// @desc    Get supplier's promotions with filters
// @access  Private (Supplier)
router.get('/promotions', auth, authorize('supplier'), [
  query('status').optional().isIn(['draft', 'pending_approval', 'active', 'paused', 'expired', 'rejected']),
  query('type').optional().isIn(['discount', 'coupon', 'free_delivery', 'bulk_discount', 'seasonal', 'referral']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
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

    const { status, type, page = 1, limit = 20 } = req.query;

    // Build filter
    const filter = { supplier: supplier._id };
    if (status) filter.status = status;
    if (type) filter.type = type;

    // Get promotions with pagination
    const promotions = await SupplierPromotion.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('adminApproval.approvedBy', 'name');

    const total = await SupplierPromotion.countDocuments(filter);

    res.json({
      success: true,
      data: {
        promotions: promotions.map(p => ({
          id: p._id,
          promotionId: p.promotionId,
          title: p.title,
          description: p.description,
          type: p.type,
          status: p.status,
          isActive: p.isActive,
          couponCode: p.couponCode,
          validity: {
            startDate: p.validity.startDate,
            endDate: p.validity.endDate
          },
          benefits: p.benefits,
          conditions: p.conditions,
          targeting: p.targeting,
          usage: {
            current: p.usage.currentUsage,
            total: p.usage.totalLimit,
            perUser: p.usage.perUserLimit
          },
          budget: p.budget,
          analytics: p.analytics,
          adminApproval: p.adminApproval,
          createdAt: p.createdAt
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Get promotions error:', error);
    next(error);
  }
});

// @route   POST /api/supplier-loyalty/promotions
// @desc    Create new promotion
// @access  Private (Supplier)
router.post('/promotions', auth, authorize('supplier'), [
  body('title').notEmpty().withMessage('Title is required').isLength({ max: 100 }),
  body('description').notEmpty().withMessage('Description is required').isLength({ max: 500 }),
  body('type').isIn(['discount', 'coupon', 'free_delivery', 'bulk_discount', 'seasonal', 'referral']),
  body('benefits.discountType').isIn(['percentage', 'fixed_amount', 'free_delivery', 'coins_multiplier']),
  body('benefits.discountValue').isFloat({ min: 0 }).withMessage('Discount value must be positive'),
  body('validity.startDate').isISO8601().withMessage('Valid start date required'),
  body('validity.endDate').isISO8601().withMessage('Valid end date required'),
  body('conditions.minOrderValue').optional().isFloat({ min: 0 }),
  body('usage.totalLimit').optional().isInt({ min: 1 }),
  body('usage.perUserLimit').optional().isInt({ min: 1 }),
  body('budget.totalBudget').optional().isFloat({ min: 0 })
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

    console.log(`📝 Creating promotion for supplier: ${supplier.companyName}`);


const generatePromotionId = () => {
  const prefix = 'PROMO';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};


    const promotionData = {
      ...req.body,
      supplier: supplier._id,
      promotionId: generatePromotionId(),
      createdBy: req.user._id,
      status: 'pending_approval' // All promotions need admin approval
    };

    // Validate end date is after start date
    if (new Date(promotionData.validity.endDate) <= new Date(promotionData.validity.startDate)) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date'
      });
    }

    const promotion = new SupplierPromotion(promotionData);
    await promotion.save();

    console.log(`✅ Promotion created: ${promotion.promotionId}`);

    res.status(201).json({
      success: true,
      message: 'Promotion created successfully and sent for approval',
      data: {
        promotionId: promotion.promotionId,
        id: promotion._id,
        status: promotion.status,
        couponCode: promotion.couponCode
      }
    });

  } catch (error) {
    console.error('❌ Create promotion error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code already exists'
      });
    }
    next(error);
  }
});

// @route   PUT /api/supplier-loyalty/promotions/:promotionId
// @desc    Update promotion (only if not active or pending approval)
// @access  Private (Supplier)
router.put('/promotions/:promotionId', auth, authorize('supplier'), [
  param('promotionId').notEmpty(),
  body('title').optional().isLength({ max: 100 }),
  body('description').optional().isLength({ max: 500 }),
  body('benefits.discountValue').optional().isFloat({ min: 0 }),
  body('validity.startDate').optional().isISO8601(),
  body('validity.endDate').optional().isISO8601()
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

    const promotion = await SupplierPromotion.findOne({
      _id: req.params.promotionId,
      supplier: supplier._id
    });

    if (!promotion) {
      return next(new ErrorHandler('Promotion not found', 404));
    }

    // Check if promotion can be edited
    if (promotion.status === 'active' && promotion.usage.currentUsage > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit active promotion that has been used'
      });
    }

    // Update promotion
    Object.assign(promotion, req.body);
    
    // Reset to pending approval if it was active
    if (promotion.status === 'active') {
      promotion.status = 'pending_approval';
    }

    await promotion.save();

    console.log(`✅ Promotion updated: ${promotion.promotionId}`);

    res.json({
      success: true,
      message: 'Promotion updated successfully',
      data: {
        promotionId: promotion.promotionId,
        status: promotion.status
      }
    });

  } catch (error) {
    console.error('❌ Update promotion error:', error);
    next(error);
  }
});

// @route   DELETE /api/supplier-loyalty/promotions/:promotionId
// @desc    Delete promotion (only if not active or no usage)
// @access  Private (Supplier)
router.delete('/promotions/:promotionId', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    const promotion = await SupplierPromotion.findOne({
      _id: req.params.promotionId,
      supplier: supplier._id
    });

    if (!promotion) {
      return next(new ErrorHandler('Promotion not found', 404));
    }

    // Check if promotion can be deleted
    if (promotion.status === 'active' && promotion.usage.currentUsage > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete active promotion that has been used'
      });
    }

    await SupplierPromotion.deleteOne({ _id: promotion._id });

    console.log(`🗑️ Promotion deleted: ${promotion.promotionId}`);

    res.json({
      success: true,
      message: 'Promotion deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete promotion error:', error);
    next(error);
  }
});

// @route   POST /api/supplier-loyalty/promotions/:promotionId/toggle
// @desc    Toggle promotion active/inactive status
// @access  Private (Supplier)
router.post('/promotions/:promotionId/toggle', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    const promotion = await SupplierPromotion.findOne({
      _id: req.params.promotionId,
      supplier: supplier._id
    });

    if (!promotion) {
      return next(new ErrorHandler('Promotion not found', 404));
    }

    // Can only toggle if approved
    if (promotion.status !== 'active' && promotion.status !== 'paused') {
      return res.status(400).json({
        success: false,
        message: 'Can only toggle approved promotions'
      });
    }

    // Toggle between active and paused
    promotion.status = promotion.status === 'active' ? 'paused' : 'active';
    promotion.isActive = promotion.status === 'active';

    await promotion.save();

    console.log(`🔄 Promotion toggled: ${promotion.promotionId} - ${promotion.status}`);

    res.json({
      success: true,
      message: `Promotion ${promotion.status === 'active' ? 'activated' : 'paused'}`,
      data: {
        status: promotion.status,
        isActive: promotion.isActive
      }
    });

  } catch (error) {
    console.error('❌ Toggle promotion error:', error);
    next(error);
  }
});

// @route   GET /api/supplier-loyalty/promotions/:promotionId/analytics
// @desc    Get detailed analytics for a promotion
// @access  Private (Supplier)
router.get('/promotions/:promotionId/analytics', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    const promotion = await SupplierPromotion.findOne({
      _id: req.params.promotionId,
      supplier: supplier._id
    }).populate('usage.usedBy.user', 'name email customerType membershipTier');

    if (!promotion) {
      return next(new ErrorHandler('Promotion not found', 404));
    }

    // Get detailed usage analytics
    const usageByCustomerType = {};
    const usageByMembershipTier = {};
    
    promotion.usage.usedBy.forEach(usage => {
      const customerType = usage.user.customerType || 'unknown';
      const membershipTier = usage.user.membershipTier || 'silver';
      
      usageByCustomerType[customerType] = (usageByCustomerType[customerType] || 0) + usage.usageCount;
      usageByMembershipTier[membershipTier] = (usageByMembershipTier[membershipTier] || 0) + usage.usageCount;
    });

    // Calculate ROI
    const roi = promotion.budget.totalBudget > 0 
      ? (((promotion.analytics.totalSavings - promotion.budget.usedBudget) / promotion.budget.totalBudget) * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        promotion: {
          id: promotion._id,
          title: promotion.title,
          type: promotion.type,
          status: promotion.status
        },
        analytics: {
          ...promotion.analytics.toObject(),
          roi,
          usageByCustomerType,
          usageByMembershipTier,
          recentUsage: promotion.usage.usedBy
            .sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed))
            .slice(0, 10)
            .map(usage => ({
              user: {
                name: usage.user.name,
                customerType: usage.user.customerType,
                membershipTier: usage.user.membershipTier
              },
              usageCount: usage.usageCount,
              lastUsed: usage.lastUsed
            }))
        }
      }
    });

  } catch (error) {
    console.error('❌ Promotion analytics error:', error);
    next(error);
  }
});

// @route   GET /api/supplier-loyalty/customer-analytics
// @desc    Get customer analytics for supplier
// @access  Private (Supplier)
router.get('/customer-analytics', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    // Get customer analytics from orders
    const customerAnalytics = await Order.aggregate([
      { $match: { supplier: supplier._id, status: { $ne: 'cancelled' } } },
      {
        $lookup: {
          from: 'users',
          localField: 'customer',
          foreignField: '_id',
          as: 'customerInfo'
        }
      },
      { $unwind: '$customerInfo' },
      {
        $group: {
          _id: {
            customerId: '$customer',
            customerType: '$customerInfo.customerType',
            membershipTier: '$customerInfo.membershipTier'
          },
          orderCount: { $sum: 1 },
          totalSpent: { $sum: '$pricing.totalAmount' },
          avgOrderValue: { $avg: '$pricing.totalAmount' },
          lastOrderDate: { $max: '$createdAt' },
          customerName: { $first: '$customerInfo.name' },
          customerEmail: { $first: '$customerInfo.email' }
        }
      },
      {
        $project: {
          customerId: '$_id.customerId',
          customerType: '$_id.customerType',
          membershipTier: '$_id.membershipTier',
          customerName: 1,
          customerEmail: 1,
          orderCount: 1,
          totalSpent: 1,
          avgOrderValue: { $round: ['$avgOrderValue', 2] },
          lastOrderDate: 1,
          loyaltyScore: {
            $multiply: [
              { $add: ['$orderCount', { $divide: ['$totalSpent', 1000] }] },
              { $cond: [{ $eq: ['$_id.membershipTier', 'platinum'] }, 1.5,
                       { $cond: [{ $eq: ['$_id.membershipTier', 'gold'] }, 1.2, 1] }] }
            ]
          }
        }
      },
      { $sort: { loyaltyScore: -1 } },
      { $limit: 100 }
    ]);

    // Get summary statistics
    const summary = await Order.aggregate([
      { $match: { supplier: supplier._id, status: { $ne: 'cancelled' } } },
      {
        $lookup: {
          from: 'users',
          localField: 'customer',
          foreignField: '_id',
          as: 'customerInfo'
        }
      },
      { $unwind: '$customerInfo' },
      {
        $group: {
          _id: null,
          totalCustomers: { $addToSet: '$customer' },
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$pricing.totalAmount' },
          avgOrderValue: { $avg: '$pricing.totalAmount' },
          customerTypes: { $push: '$customerInfo.customerType' },
          membershipTiers: { $push: '$customerInfo.membershipTier' }
        }
      },
      {
        $project: {
          totalCustomers: { $size: '$totalCustomers' },
          totalOrders: 1,
          totalRevenue: 1,
          avgOrderValue: { $round: ['$avgOrderValue', 2] },
          customerTypes: 1,
          membershipTiers: 1
        }
      }
    ]);

    const stats = summary[0] || {};
    
    // Calculate customer type distribution
    const customerTypeDistribution = {};
    (stats.customerTypes || []).forEach(type => {
      customerTypeDistribution[type || 'unknown'] = (customerTypeDistribution[type || 'unknown'] || 0) + 1;
    });

    // Calculate membership tier distribution
    const membershipTierDistribution = {};
    (stats.membershipTiers || []).forEach(tier => {
      membershipTierDistribution[tier || 'silver'] = (membershipTierDistribution[tier || 'silver'] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        summary: {
          totalCustomers: stats.totalCustomers || 0,
          totalOrders: stats.totalOrders || 0,
          totalRevenue: stats.totalRevenue || 0,
          avgOrderValue: stats.avgOrderValue || 0
        },
        distribution: {
          customerTypes: customerTypeDistribution,
          membershipTiers: membershipTierDistribution
        },
        topCustomers: customerAnalytics.slice(0, 20),
        allCustomers: customerAnalytics
      }
    });

  } catch (error) {
    console.error('❌ Customer analytics error:', error);
    next(error);
  }
});
// Add these routes at the end of the file (before module.exports)

// @route   GET /api/supplier-loyalty/promotions-overview
// @desc    Get overview of all supplier promotions with summary
// @access  Private (Supplier)
router.get('/promotions-overview', auth, authorize('supplier'), [
  query('days').optional().isInt({ min: 1, max: 365 }).withMessage('Days must be between 1 and 365')
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

    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    console.log(`📊 Getting promotions overview for supplier: ${supplier.companyName}`);

    // Get promotions summary
    const promotions = await SupplierPromotion.find({ 
      supplier: supplier._id 
    }).sort({ createdAt: -1 });

    // Calculate summary statistics
    const summary = {
      total: promotions.length,
      active: promotions.filter(p => p.status === 'active' && p.isActive).length,
      pending: promotions.filter(p => p.status === 'pending_approval').length,
      expired: promotions.filter(p => p.status === 'expired').length,
      rejected: promotions.filter(p => p.status === 'rejected').length,
      totalViews: promotions.reduce((sum, p) => sum + p.analytics.views, 0),
      totalConversions: promotions.reduce((sum, p) => sum + p.analytics.conversions, 0),
      totalSavings: promotions.reduce((sum, p) => sum + p.analytics.totalSavings, 0)
    };

    // Calculate performance metrics
    const performanceMetrics = {
      conversionRate: summary.totalViews > 0 ? ((summary.totalConversions / summary.totalViews) * 100).toFixed(2) : 0,
      avgSavingsPerPromotion: summary.total > 0 ? (summary.totalSavings / summary.total).toFixed(2) : 0,
      avgConversionsPerPromotion: summary.total > 0 ? (summary.totalConversions / summary.total).toFixed(2) : 0
    };

    // Get recent activity (last 30 days)
    const recentActivity = promotions.filter(p => 
      p.createdAt >= startDate
    ).map(p => ({
      id: p._id,
      title: p.title,
      type: p.type,
      status: p.status,
      createdAt: p.createdAt,
      conversions: p.analytics.conversions
    }));

    res.json({
      success: true,
      data: {
        summary,
        performanceMetrics,
        recentActivity,
        dateRange: {
          from: startDate,
          to: new Date(),
          days
        }
      }
    });

  } catch (error) {
    console.error('❌ Promotions overview error:', error);
    next(error);
  }
});

// @route   GET /api/supplier-loyalty/targeting-options
// @desc    Get available targeting options for promotions
// @access  Private (Supplier)
router.get('/targeting-options', auth, authorize('supplier'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    console.log(`🎯 Getting targeting options for supplier: ${supplier.companyName}`);

    // Get available customer types from orders
    const customerTypes = await Order.aggregate([
      { $match: { supplier: supplier._id } },
      {
        $lookup: {
          from: 'users',
          localField: 'customer',
          foreignField: '_id',
          as: 'customerInfo'
        }
      },
      { $unwind: '$customerInfo' },
      {
        $group: {
          _id: '$customerInfo.customerType',
          count: { $sum: 1 }
        }
      },
      { $match: { _id: { $ne: null } } },
      { $sort: { count: -1 } }
    ]);

    // Get cities where supplier has customers
    const cities = await Order.aggregate([
      { $match: { supplier: supplier._id } },
      {
        $lookup: {
          from: 'users',
          localField: 'customer',
          foreignField: '_id',
          as: 'customerInfo'
        }
      },
      { $unwind: '$customerInfo' },
      {
        $group: {
          _id: {
            city: '$customerInfo.city',
            state: '$customerInfo.state'
          },
          count: { $sum: 1 }
        }
      },
      { $match: { '_id.city': { $ne: null } } },
      { $sort: { count: -1 } },
      {
        $project: {
          city: '$_id.city',
          state: '$_id.state',
          orderCount: '$count'
        }
      }
    ]);

    // Get membership tier distribution
    const membershipTiers = await Order.aggregate([
      { $match: { supplier: supplier._id } },
      {
        $lookup: {
          from: 'users',
          localField: 'customer',
          foreignField: '_id',
          as: 'customerInfo'
        }
      },
      { $unwind: '$customerInfo' },
      {
        $group: {
          _id: '$customerInfo.membershipTier',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Standard targeting options
    const standardOptions = {
      customerTypes: [
        'house_owner',
        'mason', 
        'builder_contractor',
        'others'
      ],
      membershipTiers: [
        'silver',
        'gold', 
        'platinum'
      ],
      promotionTypes: [
        'discount',
        'coupon',
        'free_delivery',
        'bulk_discount',
        'seasonal',
        'referral'
      ],
      discountTypes: [
        'percentage',
        'fixed'
      ]
    };

    res.json({
      success: true,
      data: {
        customerTypes: customerTypes.map(ct => ({
          value: ct._id,
          label: ct._id.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
          orderCount: ct.count
        })),
        cities: cities.slice(0, 20), // Limit to top 20 cities
        membershipTiers: membershipTiers.map(mt => ({
          value: mt._id || 'silver',
          label: (mt._id || 'silver').charAt(0).toUpperCase() + (mt._id || 'silver').slice(1),
          customerCount: mt.count
        })),
        standardOptions
      }
    });

  } catch (error) {
    console.error('❌ Targeting options error:', error);
    next(error);
  }
});


module.exports = router;