const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const LoyaltyProgram = require('../models/LoyaltyProgram');
const UserLoyalty = require('../models/UserLoyalty');
const User = require('../models/User');
const Order = require('../models/Order');
const { ErrorHandler } = require('../utils/errorHandler');
const router = express.Router();
const SupplierPromotion = require('../models/SupplierPromotion');
const Supplier = require('../models/Supplier');


// @route   GET /api/admin-loyalty/dashboard
// @desc    Get comprehensive loyalty system dashboard for admin
// @access  Private (Admin)
router.get('/dashboard', auth, authorize('admin'), async (req, res, next) => {
  try {
    console.log('🔍 Admin Loyalty Dashboard: Starting request...');
    console.log('🔍 User:', req.user?.email, req.user?.role);
    
    // Overall loyalty statistics
    console.log('🔍 Fetching loyalty stats...');
    const loyaltyStats = await getLoyaltySystemStats();
    console.log('✅ Loyalty stats:', loyaltyStats);
    
    // Customer type distribution and engagement
    console.log('🔍 Fetching customer analysis...');
    const customerTypeAnalysis = await getCustomerTypeAnalysis();
    console.log('✅ Customer analysis:', customerTypeAnalysis);
    
    // Membership tier distribution
    console.log('🔍 Fetching membership tiers...');
    const membershipTierStats = await getMembershipTierStats();
    console.log('✅ Membership tiers:', membershipTierStats);
    
    // Active programs performance
    console.log('🔍 Fetching programs performance...');
    const programsPerformance = await getProgramsPerformance();
    console.log('✅ Programs performance:', programsPerformance);
    
    // Recent activity
    console.log('🔍 Fetching recent activity...');
    const recentActivity = await getRecentLoyaltyActivity();
    console.log('✅ Recent activity:', recentActivity);

    const responseData = {
      success: true,
      data: {
        overview: {
          totalLoyaltyMembers: loyaltyStats.totalUsers || 0,
          memberGrowth: loyaltyStats.memberGrowth || 0,
          totalCoinsInCirculation: loyaltyStats.coinsStats?.totalInCirculation || 0,
          coinsIssued: loyaltyStats.coinsStats?.totalEarned || 0,
          activePrograms: loyaltyStats.activeProgramsCount || 0,
          pendingPrograms: loyaltyStats.pendingProgramsCount || 0,
          engagementRate: loyaltyStats.engagementRate || 0,
          engagementChange: loyaltyStats.engagementChange || 0
        },
        customerAnalysis: customerTypeAnalysis,
        membershipTiers: membershipTierStats,
        programsPerformance: programsPerformance,
        recentActivity: recentActivity
      }
    };

    console.log('✅ Admin Loyalty Dashboard: Sending response');
    res.json(responseData);

  } catch (error) {
    console.error('❌ Admin Loyalty Dashboard Error:', error);
    next(error);
  }
});

// @route   GET /api/admin-loyalty/pending-programs
// @desc    Get pending loyalty programs for admin approval
// @access  Private (Admin)
router.get('/pending-programs', auth, authorize('admin'), async (req, res, next) => {
  try {
    console.log('🔍 Admin Loyalty: Fetching pending programs...');
    
    const programs = await LoyaltyProgram.find({
      status: 'pending_approval'
    })
    .populate('supplier', 'businessName companyName email')
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 })
    .lean();

    console.log(`✅ Found ${programs.length} pending programs`);

    res.json({
      success: true,
      data: programs
    });

  } catch (error) {
    console.error('❌ Admin Pending Programs Error:', error);
    next(error);
  }
});

// @route   GET /api/admin-loyalty/referral-stats
// @desc    Get referral program statistics for admin
// @access  Private (Admin)  
router.get('/referral-stats', auth, authorize('admin'), async (req, res, next) => {
  try {
    console.log('🔍 Admin Referral Stats: Fetching data...');
    
    // Get basic referral stats
    const totalReferrals = await User.countDocuments({
      role: 'customer',
      referredBy: { $exists: true, $ne: null }
    });

    const successfulReferrals = await User.countDocuments({
      role: 'customer', 
      referredBy: { $exists: true, $ne: null },
      orderCount: { $gt: 0 }
    });

    const conversionRate = totalReferrals > 0 
      ? ((successfulReferrals / totalReferrals) * 100).toFixed(1)
      : 0;

    // Get top referrers
    const topReferrers = await User.aggregate([
      {
        $match: {
          role: 'customer',
          referralCount: { $gt: 0 }
        }
      },
      {
        $sort: { referralCount: -1 }
      },
      {
        $limit: 10
      },
      {
        $project: {
          name: 1,
          customerId: 1,
          referralCount: 1,
          referralRewards: { $ifNull: ['$referralRewards', 0] }
        }
      }
    ]);

    // Calculate total rewards distributed using correct field name
    const totalRewardsDistributed = await UserLoyalty.aggregate([
      {
        $unwind: '$transactions' // Fixed: use 'transactions' not 'coinTransactions'
      },
      {
        $match: {
          'transactions.type': 'referral',
          'transactions.amount': { $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          totalRewards: { $sum: '$transactions.amount' }
        }
      }
    ]);

    const referralStats = {
      totalReferrals,
      successfulReferrals,
      conversionRate: parseFloat(conversionRate),
      totalRewardsDistributed: totalRewardsDistributed[0]?.totalRewards || 0,
      topReferrers,
      monthlyTrends: [], // Add monthly trend calculation if needed
      avgReferralsPerUser: totalReferrals > 0 
        ? parseFloat((totalReferrals / await User.countDocuments({ role: 'customer' })).toFixed(2))
        : 0
    };
    
    console.log('✅ Admin Referral Stats: Data compiled successfully');

    res.json({
      success: true,
      data: referralStats
    });

  } catch (error) {
    console.error('❌ Admin Referral Stats Error:', error);
    next(error);
  }
});

// @route   POST /api/admin-loyalty/bulk-award-coins
// @desc    Bulk award coins to customers based on criteria
// @access  Private (Admin)
router.post('/bulk-award-coins', auth, authorize('admin'), async (req, res, next) => {
  try {
    console.log('🔍 Bulk Award Coins: Processing request...');
    console.log('🔍 Request body:', req.body);
    
    const { criteria, coins, reason } = req.body;
    
    // Validate input
    if (!coins || coins <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coin amount'
      });
    }

    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Reason is required'
      });
    }

    // Build query based on criteria
    let userQuery = { role: 'customer' };
    
    if (criteria.customerType) {
      userQuery.customerType = criteria.customerType;
    }
    
    if (criteria.membershipTier) {
      userQuery.membershipTier = criteria.membershipTier;
    }

    if (criteria.minOrderValue && criteria.minOrderValue > 0) {
      userQuery.totalOrderValue = { $gte: criteria.minOrderValue };
    }

    console.log('🔍 User query:', userQuery);

    // Get eligible users
    const eligibleUsers = await User.find(userQuery).select('_id name customerId');
    console.log(`🔍 Found ${eligibleUsers.length} eligible users`);

    if (eligibleUsers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No users found matching the criteria'
      });
    }

    // Award coins to eligible users using the UserLoyalty model method
    let customersAffected = 0;
    
    for (const user of eligibleUsers) {
      try {
        // Get or create UserLoyalty record
        let userLoyalty = await UserLoyalty.findOne({ user: user._id });
        
        if (!userLoyalty) {
          userLoyalty = new UserLoyalty({
            user: user._id,
            aggreCoins: { balance: 0, totalEarned: 0, totalRedeemed: 0 },
            transactions: [],
            programUsage: [],
            referrals: [],
            milestones: []
          });
        }

        // Add coins using the model method
        userLoyalty.addCoins(coins, 'bonus', `Bulk Award: ${reason}`);
        await userLoyalty.save();
        customersAffected++;
        
        console.log(`✅ Awarded ${coins} coins to user ${user.customerId}`);
      } catch (error) {
        console.error(`❌ Failed to award coins to user ${user.customerId}:`, error);
      }
    }

    console.log(`✅ Bulk Award: ${customersAffected} users awarded ${coins} coins each`);

    res.json({
      success: true,
      message: `Successfully awarded ${coins} coins to ${customersAffected} customers`,
      data: {
        customersAffected,
        coinsPerCustomer: coins,
        totalCoinsAwarded: customersAffected * coins,
        criteria
      }
    });

  } catch (error) {
    console.error('❌ Bulk Award Coins Error:', error);
    next(error);
  }
});
// Add these new routes after the existing bulk-award-coins route (around line 290)

// @route   POST /api/admin-loyalty/individual-award-coins
// @desc    Award coins to individual customers
// @access  Private (Admin)
router.post('/individual-award-coins', auth, authorize('admin'), async (req, res, next) => {
  try {
    console.log('🔍 Individual Award Coins: Processing request...');
    console.log('🔍 Request body:', req.body);
    
    const { customerIds, coins, reason, notifyCustomer = true } = req.body;
    
    // Validate input
    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Customer IDs array is required'
      });
    }

    if (!coins || coins <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coin amount'
      });
    }

    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Reason is required'
      });
    }

    // Get users by their IDs
    const users = await User.find({ 
      _id: { $in: customerIds },
      role: 'customer' 
    }).select('_id name customerId email phone');
    
    if (users.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid customers found'
      });
    }

    // Award coins to selected customers
    let successfulAwards = [];
    let failedAwards = [];
    
    for (const user of users) {
      try {
        // Get or create UserLoyalty record
        let userLoyalty = await UserLoyalty.findOne({ user: user._id });
        
        if (!userLoyalty) {
          userLoyalty = new UserLoyalty({
            user: user._id,
            aggreCoins: { balance: 0, totalEarned: 0, totalRedeemed: 0 },
            transactions: [],
            programUsage: [],
            referrals: [],
            milestones: []
          });
        }

        // Add coins using the model method
        userLoyalty.addCoins(coins, 'admin_award', `Individual Award: ${reason}`);
        await userLoyalty.save();
        
        // Send notification if requested
        if (notifyCustomer) {
          // You can implement email/SMS notification here
          console.log(`📧 Notification sent to ${user.email} about ${coins} coins awarded`);
        }
        
        successfulAwards.push({
          customerId: user.customerId,
          name: user.name,
          coinsAwarded: coins
        });
        
        console.log(`✅ Awarded ${coins} coins to user ${user.customerId}`);
      } catch (error) {
        console.error(`❌ Failed to award coins to user ${user.customerId}:`, error);
        failedAwards.push({
          customerId: user.customerId,
          name: user.name,
          error: error.message
        });
      }
    }

    console.log(`✅ Individual Award: ${successfulAwards.length} users awarded ${coins} coins each`);

    res.json({
      success: true,
      message: `Successfully awarded ${coins} coins to ${successfulAwards.length} customers`,
      data: {
        successfulAwards,
        failedAwards,
        totalCoinsAwarded: successfulAwards.length * coins,
        reason
      }
    });

  } catch (error) {
    console.error('❌ Individual Award Coins Error:', error);
    next(error);
  }
});

// @route   POST /api/admin-loyalty/create-coupon
// @desc    Create a coupon for loyalty program
// @access  Private (Admin)
// @route   POST /api/admin-loyalty/create-coupon
// @desc    Create a coupon for loyalty program
// @access  Private (Admin)
router.post('/create-coupon', auth, authorize('admin'), async (req, res, next) => {
  try {
    console.log('🔍 Create Coupon: Processing request...');
    console.log('🔍 Request body:', req.body);
    
    const { 
      code,
      title,
      description,
      discountType, // 'percentage' or 'fixed'
      discountValue,
      minOrderAmount,
      maxDiscount,
      validFrom,
      validUntil,
      usageLimit,
      customerTypes, // array of customer types
      isActive = true
    } = req.body;
    
    // Validate input
    if (!code || !title || !discountType || !discountValue) {
      return res.status(400).json({
        success: false,
        message: 'Code, title, discount type, and discount value are required'
      });
    }

    // Validate validUntil
    if (!validUntil) {
      return res.status(400).json({
        success: false,
        message: 'Valid until date is required'
      });
    }

    // Check if coupon code already exists
    const existingCoupon = await LoyaltyProgram.findOne({ 
      type: 'coupon',
      'couponDetails.code': code.toUpperCase()
    });

    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code already exists'
      });
    }

    // Generate programId manually
    const count = await LoyaltyProgram.countDocuments();
    const programId = `LP${String(count + 1).padStart(6, '0')}`;

    // Convert dates properly
    const validFromDate = validFrom ? new Date(validFrom) : new Date();
    const validUntilDate = new Date(validUntil);

    // Create loyalty program as coupon with all required fields
    const couponData = {
      programId: programId, // Manually set the programId
      name: title,
      type: 'coupon',
      description,
      isActive,
      
      // Required conditions object
      conditions: {
        validFrom: validFromDate,
        validTill: validUntilDate, // This is required
        minOrderValue: minOrderAmount || 0,
        usageLimit: {
          perUser: 1,
          total: usageLimit || null
        }
      },
      
      // Required rewards object
      rewards: {
        type: discountType === 'percentage' ? 'percentage' : 'fixed_amount',
        value: discountValue,
        maxDiscount: discountType === 'percentage' ? (maxDiscount || null) : null
      },
      
      // Target audience
      targetAudience: {
        customerTypes: customerTypes || [],
        membershipTiers: [],
        states: [],
        cities: []
      },
      
      // Top-level dates
      validFrom: validFromDate,
      validUntil: validUntilDate,
      
      // Coupon specific details
      couponDetails: {
        code: code.toUpperCase(),
        discountType,
        discountValue,
        minOrderAmount: minOrderAmount || 0,
        maxDiscount: discountType === 'percentage' ? maxDiscount : null,
        usageLimit: usageLimit || null,
        usedCount: 0,
        customerTypes: customerTypes || []
      },
      
      createdBy: req.user.id,
      scope: 'platform' // Set default scope
    };

    console.log('🔍 Creating coupon with data:', JSON.stringify(couponData, null, 2));

    const couponProgram = new LoyaltyProgram(couponData);
    await couponProgram.save();

    console.log(`✅ Coupon created: ${code} with ID: ${couponProgram.programId}`);

    res.json({
      success: true,
      message: 'Coupon created successfully',
      data: couponProgram
    });

  } catch (error) {
    console.error('❌ Create Coupon Error:', error);
    if (error.name === 'ValidationError') {
      console.error('❌ Validation errors:', error.errors);
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: Object.keys(error.errors).map(key => ({
          field: key,
          message: error.errors[key].message
        }))
      });
    }
    next(error);
  }
});
// @route   POST /api/admin-loyalty/award-coupons
// @desc    Award coupons to individual customers
// @access  Private (Admin)
router.post('/award-coupons', auth, authorize('admin'), async (req, res, next) => {
  try {
    console.log('🔍 Award Coupons: Processing request...');
    console.log('🔍 Request body:', req.body);
    
    const { customerIds, couponId, reason, notifyCustomer = true } = req.body;
    
    // Validate input
    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Customer IDs array is required'
      });
    }

    if (!couponId) {
      return res.status(400).json({
        success: false,
        message: 'Coupon ID is required'
      });
    }

    // Get the coupon program
    const couponProgram = await LoyaltyProgram.findOne({ 
      _id: couponId,
      type: 'coupon',
      isActive: true 
    });

    if (!couponProgram) {
      return res.status(400).json({
        success: false,
        message: 'Coupon not found or inactive'
      });
    }

    // Get users by their IDs
    const users = await User.find({ 
      _id: { $in: customerIds },
      role: 'customer' 
    }).select('_id name customerId email phone customerType');
    
    if (users.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid customers found'
      });
    }

    // Award coupons to selected customers
    let successfulAwards = [];
    let failedAwards = [];
    
    for (const user of users) {
      try {
        // Check if customer type is eligible (if specified in coupon)
        if (couponProgram.couponDetails.customerTypes.length > 0 &&
            !couponProgram.couponDetails.customerTypes.includes(user.customerType)) {
          failedAwards.push({
            customerId: user.customerId,
            name: user.name,
            error: 'Customer type not eligible for this coupon'
          });
          continue;
        }

        // Get or create UserLoyalty record
        let userLoyalty = await UserLoyalty.findOne({ user: user._id });
        
        if (!userLoyalty) {
          userLoyalty = new UserLoyalty({
            user: user._id,
            aggreCoins: { balance: 0, totalEarned: 0, totalRedeemed: 0 },
            transactions: [],
            programUsage: [],
            referrals: [],
            milestones: []
          });
        }

        // Check if user already has this coupon
        const existingCoupon = userLoyalty.coupons?.find(c => 
          c.couponProgram.toString() === couponId && !c.used
        );

        if (existingCoupon) {
          failedAwards.push({
            customerId: user.customerId,
            name: user.name,
            error: 'Customer already has this coupon'
          });
          continue;
        }

        // Initialize coupons array if it doesn't exist
        if (!userLoyalty.coupons) {
          userLoyalty.coupons = [];
        }

        // Add coupon to user's loyalty record
        userLoyalty.coupons.push({
          couponProgram: couponId,
          awardedAt: new Date(),
          awardedBy: req.user.id,
          reason: reason || 'Admin Award',
          used: false
        });

        // Add transaction record
        userLoyalty.transactions.push({
          type: 'coupon_awarded',
          description: `Coupon awarded: ${couponProgram.couponDetails.code}`,
          metadata: {
            couponId,
            couponCode: couponProgram.couponDetails.code,
            reason: reason || 'Admin Award'
          },
          date: new Date()
        });

        await userLoyalty.save();
        
        // Send notification if requested
        if (notifyCustomer) {
          console.log(`📧 Notification sent to ${user.email} about coupon: ${couponProgram.couponDetails.code}`);
        }
        
        successfulAwards.push({
          customerId: user.customerId,
          name: user.name,
          couponCode: couponProgram.couponDetails.code
        });
        
        console.log(`✅ Awarded coupon ${couponProgram.couponDetails.code} to user ${user.customerId}`);
      } catch (error) {
        console.error(`❌ Failed to award coupon to user ${user.customerId}:`, error);
        failedAwards.push({
          customerId: user.customerId,
          name: user.name,
          error: error.message
        });
      }
    }

    console.log(`✅ Coupon Award: ${successfulAwards.length} users awarded coupon ${couponProgram.couponDetails.code}`);

    res.json({
      success: true,
      message: `Successfully awarded coupon to ${successfulAwards.length} customers`,
      data: {
        successfulAwards,
        failedAwards,
        couponCode: couponProgram.couponDetails.code,
        reason
      }
    });

  } catch (error) {
    console.error('❌ Award Coupons Error:', error);
    next(error);
  }
});

// @route   GET /api/admin-loyalty/available-coupons
// @desc    Get all available coupons for awarding
// @access  Private (Admin)
router.get('/available-coupons', auth, authorize('admin'), async (req, res, next) => {
  try {
    const coupons = await LoyaltyProgram.find({
      type: 'coupon',
      isActive: true,
      $or: [
        { validUntil: { $exists: false } },
        { validUntil: null },
        { validUntil: { $gte: new Date() } }
      ]
    }).select('name couponDetails validFrom validUntil createdAt');

    res.json({
      success: true,
      data: coupons
    });

  } catch (error) {
    console.error('❌ Get Available Coupons Error:', error);
    next(error);
  }
});

// @route   GET /api/admin-loyalty/customer-search
// @desc    Search customers for individual awards
// @access  Private (Admin)
router.get('/customer-search', auth, authorize('admin'), async (req, res, next) => {
  try {
    const { 
      search, 
      customerType, 
      membershipTier, 
      page = 1, 
      limit = 20 
    } = req.query;

    let query = { role: 'customer' };
    
    // Add search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { customerId: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    if (customerType) {
      query.customerType = customerType;
    }

    if (membershipTier) {
      query.membershipTier = membershipTier;
    }

    const customers = await User.find(query)
      .select('_id name customerId email phone customerType membershipTier totalOrderValue')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        customers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Customer Search Error:', error);
    next(error);
  }
});

// @route   POST /api/admin-loyalty/create-customer-type-promotion
// @desc    Create a promotion for specific customer type
// @access  Private (Admin)
router.post('/create-customer-type-promotion', auth, authorize('admin'), async (req, res, next) => {
  try {
    console.log('🔍 Create Promotion: Processing request...');
    console.log('🔍 Request body:', req.body);
    
    const { 
      name, 
      description, 
      customerType, 
      discountPercentage, 
      minOrderAmount, 
      validFrom, 
      validUntil
    } = req.body;
    
    // Validate input
    if (!name || !customerType || !discountPercentage) {
      return res.status(400).json({
        success: false,
        message: 'Name, customer type, and discount percentage are required'
      });
    }

    // Create loyalty program as promotion
    const promotionProgram = new LoyaltyProgram({
      programId: `PROMO_${Date.now()}`,
      name,
      type: 'purchase',
      scope: 'platform',
      description: description || `${discountPercentage}% discount for ${customerType} customers`,
      targetAudience: {
        customerTypes: [customerType],
        membershipTiers: ['silver', 'gold', 'platinum'],
        states: [],
        cities: []
      },
      conditions: {
        minOrderValue: minOrderAmount || 0,
        validFrom: validFrom ? new Date(validFrom) : new Date(),
        validTill: validUntil ? new Date(validUntil) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
        usageLimit: {
          perUser: 5,
          total: 1000
        },
        categories: [],
        firstTimeUser: false
      },
      rewards: {
        type: 'percentage',
        value: discountPercentage,
        coinMultiplier: 1
      },
      referralProgram: {
        referrerReward: 0,
        refereeReward: 0,
        maxReferrals: 0
      },
      isActive: true,
      createdBy: req.user._id
    });

    const savedPromotion = await promotionProgram.save();
    console.log('✅ Promotion Created:', savedPromotion.name);

    res.json({
      success: true,
      message: 'Customer type promotion created successfully',
      data: {
        id: savedPromotion._id,
        name: savedPromotion.name,
        programId: savedPromotion.programId,
        customerType,
        discountPercentage,
        validFrom: savedPromotion.conditions.validFrom,
        validTill: savedPromotion.conditions.validTill
      }
    });

  } catch (error) {
    console.error('❌ Create Promotion Error:', error);
    next(error);
  }
});

// @route   GET /api/admin-loyalty/analytics/customer-types
// @desc    Get detailed customer type analytics
// @access  Private (Admin)
router.get('/analytics/customer-types', auth, authorize('admin'), async (req, res, next) => {
  try {
    console.log('🔍 Admin Customer Type Analytics: Fetching data...');
    
    // Get simple customer type distribution
    const customerTypeStats = await User.aggregate([
      {
        $match: {
          role: 'customer'
        }
      },
      {
        $group: {
          _id: '$customerType',
          count: { $sum: 1 },
          totalSpent: { $sum: { $ifNull: ['$totalOrderValue', 0] } },
          avgOrderValue: { $avg: { $ifNull: ['$averageOrderValue', 0] } }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Format for simple frontend consumption
    const simpleAnalysis = {};
    let totalCustomers = 0;
    
    customerTypeStats.forEach(stat => {
      const customerType = stat._id || 'others';
      simpleAnalysis[customerType] = stat.count;
      totalCustomers += stat.count;
    });

    simpleAnalysis.total = totalCustomers;

    console.log('✅ Customer analytics compiled:', simpleAnalysis);

    res.json({
      success: true,
      data: simpleAnalysis,
      detailed: customerTypeStats
    });

  } catch (error) {
    console.error('❌ Admin Customer Analytics Error:', error);
    next(error);
  }
});

// @route   POST /api/admin-loyalty/programs/:programId/approve
// @desc    Approve a loyalty program
// @access  Private (Admin)
router.post('/programs/:programId/approve', auth, authorize('admin'), async (req, res, next) => {
  try {
    const { programId } = req.params;

    const program = await LoyaltyProgram.findById(programId);
    if (!program) {
      return res.status(404).json({
        success: false,
        message: 'Program not found'
      });
    }

    program.status = 'approved';
    program.isActive = true;
    program.approvedBy = req.user._id;
    program.approvedAt = new Date();

    await program.save();

    res.json({
      success: true,
      message: 'Program approved successfully',
      data: program
    });

  } catch (error) {
    console.error('❌ Approve Program Error:', error);
    next(error);
  }
});

// @route   POST /api/admin-loyalty/programs/:programId/reject
// @desc    Reject a loyalty program
// @access  Private (Admin)
router.post('/programs/:programId/reject', auth, authorize('admin'), async (req, res, next) => {
  try {
    const { programId } = req.params;
    const { rejectionReason } = req.body;

    const program = await LoyaltyProgram.findById(programId);
    if (!program) {
      return res.status(404).json({
        success: false,
        message: 'Program not found'
      });
    }

    program.status = 'rejected';
    program.isActive = false;
    program.rejectedBy = req.user._id;
    program.rejectedAt = new Date();
    if (rejectionReason) {
      program.adminFeedback = rejectionReason;
    }

    await program.save();

    res.json({
      success: true,
      message: 'Program rejected successfully',
      data: program
    });

  } catch (error) {
    console.error('❌ Reject Program Error:', error);
    next(error);
  }
});

// ==================== HELPER FUNCTIONS ====================

async function getLoyaltySystemStats() {
  try {
    console.log('🔍 Getting loyalty system stats...');
    
    // Count total customers
    const totalCustomers = await User.countDocuments({ role: 'customer' });
    console.log('📊 Total customers:', totalCustomers);
    
    // Count users with loyalty records (active loyalty members)
    const activeLoyaltyMembers = await UserLoyalty.countDocuments({});
    console.log('📊 Active loyalty members:', activeLoyaltyMembers);
    
    // Get coins statistics from UserLoyalty collection
    const coinsStatsResult = await UserLoyalty.aggregate([
      {
        $group: {
          _id: null,
          totalEarned: { $sum: '$aggreCoins.totalEarned' },
          totalRedeemed: { $sum: '$aggreCoins.totalRedeemed' },
          totalInCirculation: { $sum: '$aggreCoins.balance' }
        }
      }
    ]);
    
    const coinsStats = coinsStatsResult[0] || { totalEarned: 0, totalRedeemed: 0, totalInCirculation: 0 };
    console.log('📊 Coins stats:', coinsStats);

    // Count active programs
    const activeProgramsCount = await LoyaltyProgram.countDocuments({
      isActive: true,
      'conditions.validTill': { $gte: new Date() }
    });
    console.log('📊 Active programs:', activeProgramsCount);

    // Count pending programs  
    const pendingProgramsCount = await LoyaltyProgram.countDocuments({
      status: 'pending_approval'
    });
    console.log('📊 Pending programs:', pendingProgramsCount);

    // Calculate engagement rate (users with loyalty activity vs total customers)
    const engagementRate = totalCustomers > 0 ? ((activeLoyaltyMembers / totalCustomers) * 100).toFixed(2) : 0;
    
    // Calculate member growth (new loyalty members in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const newMembers = await UserLoyalty.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });
    
    const memberGrowthRate = activeLoyaltyMembers > 0 ? ((newMembers / activeLoyaltyMembers) * 100).toFixed(1) : 0;

    const result = {
      totalUsers: activeLoyaltyMembers, // Show loyalty members as main metric
      activeUsers: activeLoyaltyMembers,
      engagementRate: parseFloat(engagementRate),
      engagementChange: 0, // Placeholder for future trend analysis
      coinsStats,
      activeProgramsCount,
      pendingProgramsCount,
      memberGrowth: parseFloat(memberGrowthRate),
      newMembersThisMonth: newMembers
    };

    console.log('✅ Compiled loyalty stats:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Error in getLoyaltySystemStats:', error);
    return {
      totalUsers: 0,
      activeUsers: 0,
      engagementRate: 0,
      engagementChange: 0,
      coinsStats: { totalEarned: 0, totalRedeemed: 0, totalInCirculation: 0 },
      activeProgramsCount: 0,
      pendingProgramsCount: 0,
      memberGrowth: 0,
      newMembersThisMonth: 0
    };
  }
}

async function getCustomerTypeAnalysis() {
  try {
    console.log('🔍 Getting detailed customer type analysis...');
    
    // Get customer type aggregation with more details
    const customerTypes = await User.aggregate([
      { 
        $match: { 
          role: 'customer' 
        } 
      },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'customer',
          as: 'orders'
        }
      },
      {
        $lookup: {
          from: 'userloyalties',
          localField: '_id',
          foreignField: 'user',
          as: 'loyalty'
        }
      },
      {
        $addFields: {
          totalOrders: { $size: '$orders' },
          totalSpent: { 
            $sum: { 
              $map: { 
                input: '$orders', 
                as: 'order', 
                in: { $ifNull: ['$$order.pricing.totalAmount', 0] } 
              } 
            } 
          },
          completedOrders: {
            $size: {
              $filter: {
                input: '$orders',
                as: 'order',
                cond: { $eq: ['$$order.status', 'delivered'] }
              }
            }
          },
          loyaltyCoins: {
            $sum: {
              $map: {
                input: '$loyalty',
                as: 'loyaltyRecord',
                in: { $ifNull: ['$$loyaltyRecord.aggreCoins.balance', 0] }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: '$customerType',
          count: { $sum: 1 },
          totalOrders: { $sum: '$totalOrders' },
          totalSpent: { $sum: '$totalSpent' },
          avgOrderValue: { $avg: { $cond: [{ $gt: ['$totalOrders', 0] }, { $divide: ['$totalSpent', '$totalOrders'] }, 0] } },
          avgOrderCount: { $avg: '$totalOrders' },
          totalLoyaltyCoins: { $sum: '$loyaltyCoins' },
          highValueCustomers: { $sum: { $cond: [{ $gte: ['$totalSpent', 50000] }, 1, 0] } },
          activeCustomers: { $sum: { $cond: [{ $gte: ['$totalOrders', 1] }, 1, 0] } }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Format for frontend - convert array to object with proper customer type names
    const customerTypeMapping = {
      'house_owner': 'House Owner',
      'mason': 'Mason', 
      'builder_contractor': 'Builder Contractor',
      'others': 'Others'
    };

    const formattedResult = {};
    
    // Initialize all customer types with 0
    Object.keys(customerTypeMapping).forEach(type => {
      formattedResult[type] = {
        count: 0,
        displayName: customerTypeMapping[type],
        totalOrders: 0,
        totalSpent: 0,
        avgOrderValue: 0,
        avgOrderCount: 0,
        totalLoyaltyCoins: 0,
        highValueCustomers: 0,
        activeCustomers: 0,
        engagementRate: 0
      };
    });

    // Fill in actual data
    customerTypes.forEach(type => {
      const typeKey = type._id || 'others';
      if (formattedResult[typeKey]) {
        formattedResult[typeKey] = {
          ...formattedResult[typeKey],
          count: type.count,
          totalOrders: type.totalOrders || 0,
          totalSpent: type.totalSpent || 0,
          avgOrderValue: Math.round(type.avgOrderValue || 0),
          avgOrderCount: Math.round((type.avgOrderCount || 0) * 100) / 100,
          totalLoyaltyCoins: type.totalLoyaltyCoins || 0,
          highValueCustomers: type.highValueCustomers || 0,
          activeCustomers: type.activeCustomers || 0,
          engagementRate: type.count > 0 ? Math.round((type.activeCustomers / type.count) * 100) : 0
        };
      }
    });

    console.log('✅ Enhanced customer type analysis:', formattedResult);
    return formattedResult;
    
  } catch (error) {
    console.error('❌ Error in getCustomerTypeAnalysis:', error);
    // Return default structure
    return {
      house_owner: { count: 0, displayName: 'House Owner', totalOrders: 0, totalSpent: 0, avgOrderValue: 0, avgOrderCount: 0, totalLoyaltyCoins: 0, highValueCustomers: 0, activeCustomers: 0, engagementRate: 0 },
      mason: { count: 0, displayName: 'Mason', totalOrders: 0, totalSpent: 0, avgOrderValue: 0, avgOrderCount: 0, totalLoyaltyCoins: 0, highValueCustomers: 0, activeCustomers: 0, engagementRate: 0 },
      builder_contractor: { count: 0, displayName: 'Builder Contractor', totalOrders: 0, totalSpent: 0, avgOrderValue: 0, avgOrderCount: 0, totalLoyaltyCoins: 0, highValueCustomers: 0, activeCustomers: 0, engagementRate: 0 },
      others: { count: 0, displayName: 'Others', totalOrders: 0, totalSpent: 0, avgOrderValue: 0, avgOrderCount: 0, totalLoyaltyCoins: 0, highValueCustomers: 0, activeCustomers: 0, engagementRate: 0 }
    };
  }
}

router.get('/customers', auth, authorize('admin'), async (req, res, next) => {
  try {
    console.log('🔍 Admin Loyalty: Fetching detailed customer analytics...');
    
    const { 
      page = 1, 
      limit = 20, 
      customerType, 
      membershipTier, 
      sortBy = 'totalSpent', 
      sortOrder = 'desc',
      search 
    } = req.query;

    // Build filter
    let filter = { role: 'customer' };
    
    if (customerType && customerType !== 'all') {
      filter.customerType = customerType;
    }
    
    if (membershipTier && membershipTier !== 'all') {
      filter.membershipTier = membershipTier;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { customerId: searchRegex },
        { phoneNumber: searchRegex }
      ];
    }

    // Get detailed customer data with analytics
    const customers = await User.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'customer',
          as: 'orders'
        }
      },
      {
        $lookup: {
          from: 'userloyalties',
          localField: '_id',
          foreignField: 'user',
          as: 'loyalty'
        }
      },
      {
        $addFields: {
          totalOrders: { $size: '$orders' },
          totalSpent: { 
            $sum: { 
              $map: { 
                input: '$orders', 
                as: 'order', 
                in: { $ifNull: ['$$order.pricing.totalAmount', 0] } 
              } 
            } 
          },
          completedOrders: {
            $size: {
              $filter: {
                input: '$orders',
                as: 'order',
                cond: { $eq: ['$$order.status', 'delivered'] }
              }
            }
          },
          pendingOrders: {
            $size: {
              $filter: {
                input: '$orders',
                as: 'order',
                cond: { $in: ['$$order.status', ['pending', 'confirmed', 'processing']] }
              }
            }
          },
          loyaltyData: { $arrayElemAt: ['$loyalty', 0] },
          lastOrderDate: {
            $max: {
              $map: {
                input: '$orders',
                as: 'order',
                in: '$$order.createdAt'
              }
            }
          }
        }
      },
      {
        $addFields: {
          avgOrderValue: { 
            $cond: [
              { $gt: ['$totalOrders', 0] }, 
              { $divide: ['$totalSpent', '$totalOrders'] }, 
              0
            ] 
          },
          loyaltyCoins: { $ifNull: ['$loyaltyData.aggreCoins.balance', 0] },
          totalCoinsEarned: { $ifNull: ['$loyaltyData.aggreCoins.totalEarned', 0] },
          totalCoinsRedeemed: { $ifNull: ['$loyaltyData.aggreCoins.totalRedeemed', 0] },
          daysSinceLastOrder: {
            $cond: [
              { $ne: ['$lastOrderDate', null] },
              { $divide: [{ $subtract: [new Date(), '$lastOrderDate'] }, 86400000] },
              null
            ]
          },
          customerValue: {
            $switch: {
              branches: [
                { case: { $gte: ['$totalSpent', 100000] }, then: 'Premium' },
                { case: { $gte: ['$totalSpent', 50000] }, then: 'High Value' },
                { case: { $gte: ['$totalSpent', 10000] }, then: 'Regular' },
                { case: { $gt: ['$totalOrders', 0] }, then: 'Active' }
              ],
              default: 'New'
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          customerId: 1,
          name: 1,
          email: 1,
          phoneNumber: 1,
          customerType: 1,
          membershipTier: 1,
          isActive: 1,
          createdAt: 1,
          totalOrders: 1,
          completedOrders: 1,
          pendingOrders: 1,
          totalSpent: 1,
          avgOrderValue: 1,
          loyaltyCoins: 1,
          totalCoinsEarned: 1,
          totalCoinsRedeemed: 1,
          lastOrderDate: 1,
          daysSinceLastOrder: 1,
          customerValue: 1
        }
      },
      {
        $sort: { 
          [sortBy]: sortOrder === 'desc' ? -1 : 1 
        }
      },
      {
        $skip: (parseInt(page) - 1) * parseInt(limit)
      },
      {
        $limit: parseInt(limit)
      }
    ]);

    // Get total count for pagination
    const totalCount = await User.countDocuments(filter);

    // Calculate summary statistics
    const summaryStats = await User.aggregate([
      { $match: { role: 'customer' } },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'customer',
          as: 'orders'
        }
      },
      {
        $lookup: {
          from: 'userloyalties',
          localField: '_id',
          foreignField: 'user',
          as: 'loyalty'
        }
      },
      {
        $addFields: {
          totalSpent: { 
            $sum: { 
              $map: { 
                input: '$orders', 
                as: 'order', 
                in: { $ifNull: ['$$order.pricing.totalAmount', 0] } 
              } 
            } 
          },
          totalOrders: { $size: '$orders' },
          loyaltyCoins: {
            $sum: {
              $map: {
                input: '$loyalty',
                as: 'loyaltyRecord',
                in: { $ifNull: ['$$loyaltyRecord.aggreCoins.balance', 0] }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          totalRevenue: { $sum: '$totalSpent' },
          totalOrders: { $sum: '$totalOrders' },
          totalLoyaltyCoins: { $sum: '$loyaltyCoins' },
          avgOrderValue: { $avg: { $cond: [{ $gt: ['$totalOrders', 0] }, { $divide: ['$totalSpent', '$totalOrders'] }, 0] } },
          highValueCustomers: { $sum: { $cond: [{ $gte: ['$totalSpent', 50000] }, 1, 0] } },
          activeCustomers: { $sum: { $cond: [{ $gte: ['$totalOrders', 1] }, 1, 0] } }
        }
      }
    ]);

    const summary = summaryStats[0] || {
      totalCustomers: 0,
      totalRevenue: 0,
      totalOrders: 0,
      totalLoyaltyCoins: 0,
      avgOrderValue: 0,
      highValueCustomers: 0,
      activeCustomers: 0
    };

    const responseData = {
      success: true,
      data: {
        customers: customers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalItems: totalCount,
          itemsPerPage: parseInt(limit),
          hasNext: parseInt(page) * parseInt(limit) < totalCount,
          hasPrev: parseInt(page) > 1
        },
        summary: {
          ...summary,
          avgOrderValue: Math.round(summary.avgOrderValue || 0),
          engagementRate: summary.totalCustomers > 0 ? Math.round((summary.activeCustomers / summary.totalCustomers) * 100) : 0
        },
        filters: {
          customerType,
          membershipTier,
          sortBy,
          sortOrder,
          search
        }
      }
    };

    console.log(`✅ Found ${customers.length} customers with detailed analytics`);
    res.json(responseData);

  } catch (error) {
    console.error('❌ Admin Customer Analytics Error:', error);
    next(error);
  }
});
router.get('/customers/:customerId', auth, authorize('admin'), async (req, res, next) => {
  try {
    const { customerId } = req.params;
    console.log(`🔍 Admin Loyalty: Fetching customer details for ${customerId}...`);
    
    const customerDetails = await User.aggregate([
      { 
        $match: { 
          $or: [
            { _id: mongoose.Types.ObjectId.isValid(customerId) ? new mongoose.Types.ObjectId(customerId) : null },
            { customerId: customerId }
          ]
        }
      },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'customer',
          as: 'orders'
        }
      },
      {
        $lookup: {
          from: 'userloyalties',
          localField: '_id',
          foreignField: 'user',
          as: 'loyalty'
        }
      },
      {
        $addFields: {
          totalOrders: { $size: '$orders' },
          totalSpent: { 
            $sum: { 
              $map: { 
                input: '$orders', 
                as: 'order', 
                in: { $ifNull: ['$$order.pricing.totalAmount', 0] } 
              } 
            } 
          },
          loyaltyData: { $arrayElemAt: ['$loyalty', 0] },
          recentOrders: {
            $slice: [
              {
                $sortArray: {
                  input: '$orders',
                  sortBy: { createdAt: -1 }
                }
              },
              10
            ]
          },
          ordersByStatus: {
            $arrayToObject: {
              $map: {
                input: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
                as: 'status',
                in: {
                  k: '$$status',
                  v: {
                    $size: {
                      $filter: {
                        input: '$orders',
                        as: 'order',
                        cond: { $eq: ['$$order.status', '$$status'] }
                      }
                    }
                  }
                }
              }
            }
          },
          monthlyOrderTrend: {
            $map: {
              input: { $range: [-11, 1] }, // Last 12 months
              as: 'monthOffset',
              in: {
                $let: {
                  vars: {
                    targetDate: { $dateAdd: { startDate: new Date(), unit: 'month', amount: '$$monthOffset' } }
                  },
                  in: {
                    month: { $dateToString: { format: '%Y-%m', date: '$$targetDate' } },
                    orders: {
                      $size: {
                        $filter: {
                          input: '$orders',
                          as: 'order',
                          cond: {
                            $and: [
                              { $gte: ['$$order.createdAt', { $dateFromString: { dateString: { $dateToString: { format: '%Y-%m-01', date: '$$targetDate' } } } }] },
                              { $lt: ['$$order.createdAt', { $dateAdd: { startDate: { $dateFromString: { dateString: { $dateToString: { format: '%Y-%m-01', date: '$$targetDate' } } } }, unit: 'month', amount: 1 } }] }
                            ]
                          }
                        }
                      }
                    },
                    spent: {
                      $sum: {
                        $map: {
                          input: {
                            $filter: {
                              input: '$orders',
                              as: 'order',
                              cond: {
                                $and: [
                                  { $gte: ['$$order.createdAt', { $dateFromString: { dateString: { $dateToString: { format: '%Y-%m-01', date: '$$targetDate' } } } }] },
                                  { $lt: ['$$order.createdAt', { $dateAdd: { startDate: { $dateFromString: { dateString: { $dateToString: { format: '%Y-%m-01', date: '$$targetDate' } } } }, unit: 'month', amount: 1 } }] }
                                ]
                              }
                            }
                          },
                          as: 'monthOrder',
                          in: { $ifNull: ['$$monthOrder.pricing.totalAmount', 0] }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    ]);

    if (!customerDetails || customerDetails.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const customer = customerDetails[0];
    
    // Get loyalty transaction history
    let loyaltyTransactions = [];
    if (customer.loyaltyData) {
      loyaltyTransactions = await UserLoyalty.findById(customer.loyaltyData._id)
        .select('transactions')
        .lean();
      loyaltyTransactions = loyaltyTransactions?.transactions?.slice(-20).reverse() || [];
    }

    const responseData = {
      success: true,
      data: {
        customer: {
          _id: customer._id,
          customerId: customer.customerId,
          name: customer.name,
          email: customer.email,
          phoneNumber: customer.phoneNumber,
          customerType: customer.customerType,
          membershipTier: customer.membershipTier,
          isActive: customer.isActive,
          createdAt: customer.createdAt,
          addresses: customer.addresses
        },
        analytics: {
          totalOrders: customer.totalOrders,
          totalSpent: customer.totalSpent,
          avgOrderValue: customer.totalOrders > 0 ? Math.round(customer.totalSpent / customer.totalOrders) : 0,
          ordersByStatus: customer.ordersByStatus,
          monthlyTrend: customer.monthlyOrderTrend
        },
        loyalty: {
          balance: customer.loyaltyData?.aggreCoins?.balance || 0,
          totalEarned: customer.loyaltyData?.aggreCoins?.totalEarned || 0,
          totalRedeemed: customer.loyaltyData?.aggreCoins?.totalRedeemed || 0,
          recentTransactions: loyaltyTransactions
        },
        recentOrders: customer.recentOrders.map(order => ({
          _id: order._id,
          orderId: order.orderId,
          status: order.status,
          totalAmount: order.pricing?.totalAmount || 0,
          createdAt: order.createdAt,
          itemCount: order.items?.length || 0
        }))
      }
    };

    console.log(`✅ Customer details retrieved for ${customer.name}`);
    res.json(responseData);

  } catch (error) {
    console.error('❌ Admin Customer Details Error:', error);
    next(error);
  }
});



async function getMembershipTierStats() {
  try {
    console.log('🔍 Getting membership tier stats...');
    
    const result = await User.aggregate([
      { 
        $match: { 
          role: 'customer' 
        } 
      },
      {
        $group: {
          _id: '$membershipTier',
          count: { $sum: 1 },
          avgOrderValue: { $avg: { $ifNull: ['$averageOrderValue', 0] } },
          avgOrderCount: { $avg: { $ifNull: ['$orderCount', 0] } }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Format for frontend consumption
    const formatted = {};
    let total = 0;
    
    result.forEach(tier => {
      const tierName = tier._id || 'silver'; // Default to silver if null
      formatted[tierName] = tier.count;
      total += tier.count;
    });
    
    formatted.total = total;

    console.log('✅ Membership tier stats:', formatted);
    return formatted;
    
  } catch (error) {
    console.error('❌ Error in getMembershipTierStats:', error);
    return { silver: 0, gold: 0, platinum: 0, total: 0 };
  }
}

async function getProgramsPerformance() {
  try {
    console.log('🔍 Getting programs performance...');
    
    const result = await LoyaltyProgram.find({
      isActive: true,
      'conditions.validTill': { $gte: new Date() }
    })
    .populate('supplier', 'businessName')
    .select('name type rewards usageCount totalSavings conditions.validTill')
    .sort({ usageCount: -1 })
    .limit(10)
    .lean();

    console.log('✅ Programs performance:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Error in getProgramsPerformance:', error);
    return [];
  }
}

async function getRecentLoyaltyActivity() {
  try {
    console.log('🔍 Getting recent loyalty activity...');
    
    const result = await UserLoyalty.aggregate([
      { $unwind: '$transactions' }, // Fixed: use 'transactions' not 'coinTransactions'
      { $sort: { 'transactions.createdAt': -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      {
        $project: {
          type: '$transactions.type',
          amount: '$transactions.amount',
          description: '$transactions.description',
          createdAt: '$transactions.createdAt',
          userName: { $arrayElemAt: ['$userInfo.name', 0] },
          customerId: { $arrayElemAt: ['$userInfo.customerId', 0] }
        }
      }
    ]);

    console.log('✅ Recent activity found:', result.length, 'items');
    return result;
    
  } catch (error) {
    console.error('❌ Error in getRecentLoyaltyActivity:', error);
    return [];
  }
}
// Replace the existing pending-promotions route:

// @route   GET /api/admin-loyalty/pending-promotions
// @desc    Get all pending supplier promotions for admin review
// @access  Private (Admin)
router.get('/pending-promotions', auth, authorize('admin'), async (req, res, next) => {
  try {
    console.log('🔍 Admin Loyalty: Fetching pending supplier promotions...');

    const promotions = await SupplierPromotion.find({
      status: 'pending_approval'
    })
    .populate({
      path: 'supplier',
      select: 'companyName contactInfo user',
      populate: {
        path: 'user',
        select: 'firstName lastName email'
      }
    })
    .sort({ createdAt: -1 })
    .lean();

    console.log(`✅ Found ${promotions.length} pending promotions`);

    // Transform data for better frontend handling with safe property access
    const formattedPromotions = promotions.map(promotion => {
      const supplierUser = promotion.supplier?.user || {};
      const supplierInfo = promotion.supplier || {};
      
      return {
        _id: promotion._id,
        promotionId: promotion.promotionId,
        title: promotion.title,
        description: promotion.description,
        type: promotion.type,
        supplier: {
          id: supplierInfo._id,
          name: supplierInfo.companyName || 'Unknown Supplier',
          email: supplierUser.email || 'No email',
          firstName: supplierUser.firstName || '',
          lastName: supplierUser.lastName || '',
          contact: supplierInfo.contactInfo || {}
        },
        benefits: promotion.benefits || {},
        conditions: promotion.conditions || {},
        validity: promotion.validity || {},
        targeting: promotion.targeting || {},
        submittedAt: promotion.createdAt,
        estimatedReach: promotion.analytics?.estimatedReach || 0,
        adminApproval: promotion.adminApproval || {}
      };
    });

    res.json({
      success: true,
      data: formattedPromotions,
      count: formattedPromotions.length
    });

  } catch (error) {
    console.error('❌ Admin Pending Promotions Error:', error);
    console.error('❌ Stack:', error.stack);
    next(new ErrorHandler('Failed to fetch pending promotions', 500));
  }
});
// @route   POST /api/admin-loyalty/promotions/:promotionId/approve
// @desc    Approve a supplier promotion
// @access  Private (Admin)
router.post('/promotions/:promotionId/approve', 
  auth, 
  authorize('admin'),
  [
    param('promotionId').notEmpty().withMessage('Promotion ID is required'),
    body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new ErrorHandler('Validation failed', 400, errors.array()));
      }

      const { promotionId } = req.params;
      const { notes } = req.body;

      console.log(`🔍 Admin approving promotion: ${promotionId}`);

      const promotion = await SupplierPromotion.findById(promotionId)
        .populate('supplier', 'companyName user');

      if (!promotion) {
        return next(new ErrorHandler('Promotion not found', 404));
      }

      if (promotion.status !== 'pending_approval') {
        return next(new ErrorHandler('Promotion is not pending approval', 400));
      }

      // Update promotion status
      promotion.status = 'active';
      promotion.adminApproval.approvedBy = req.user._id;
      promotion.adminApproval.approvedAt = new Date();
      promotion.adminApproval.notes = notes || '';

      await promotion.save();

      console.log(`✅ Promotion ${promotionId} approved successfully`);

      // TODO: Send notification to supplier
      
      res.json({
        success: true,
        message: 'Promotion approved successfully',
        data: {
          promotionId: promotion.promotionId,
          status: promotion.status,
          approvedAt: promotion.adminApproval.approvedAt
        }
      });

    } catch (error) {
      console.error('❌ Admin Approve Promotion Error:', error);
      next(new ErrorHandler('Failed to approve promotion', 500));
    }
  }
);

// @route   POST /api/admin-loyalty/promotions/:promotionId/reject
// @desc    Reject a supplier promotion
// @access  Private (Admin)
router.post('/promotions/:promotionId/reject', 
  auth, 
  authorize('admin'),
  [
    param('promotionId').notEmpty().withMessage('Promotion ID is required'),
    body('reason').notEmpty().trim().isLength({ min: 10, max: 500 }).withMessage('Rejection reason is required (10-500 characters)')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new ErrorHandler('Validation failed', 400, errors.array()));
      }

      const { promotionId } = req.params;
      const { reason } = req.body;

      console.log(`🔍 Admin rejecting promotion: ${promotionId}`);

      const promotion = await SupplierPromotion.findById(promotionId)
        .populate('supplier', 'companyName user');

      if (!promotion) {
        return next(new ErrorHandler('Promotion not found', 404));
      }

      if (promotion.status !== 'pending_approval') {
        return next(new ErrorHandler('Promotion is not pending approval', 400));
      }

      // Update promotion status
      promotion.status = 'rejected';
      promotion.adminApproval.rejectedBy = req.user._id;
      promotion.adminApproval.rejectedAt = new Date();
      promotion.adminApproval.rejectionReason = reason;

      await promotion.save();

      console.log(`✅ Promotion ${promotionId} rejected successfully`);

      // TODO: Send notification to supplier
      
      res.json({
        success: true,
        message: 'Promotion rejected successfully',
        data: {
          promotionId: promotion.promotionId,
          status: promotion.status,
          rejectedAt: promotion.adminApproval.rejectedAt,
          reason: reason
        }
      });

    } catch (error) {
      console.error('❌ Admin Reject Promotion Error:', error);
      next(new ErrorHandler('Failed to reject promotion', 500));
    }
  }
);

// @route   GET /api/admin-loyalty/promotions-overview
// @desc    Get overview of all promotions (pending, active, rejected)
// @access  Private (Admin)
router.get('/promotions-overview', auth, authorize('admin'), async (req, res, next) => {
  try {
    console.log('🔍 Admin Loyalty: Fetching promotions overview...');

    const promotionsStats = await SupplierPromotion.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalEstimatedReach: { $sum: '$analytics.estimatedReach' }
        }
      }
    ]);

    // Recent promotions activity
    const recentPromotions = await SupplierPromotion.find()
      .populate('supplier', 'companyName')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const stats = {
      pending: 0,
      active: 0,
      rejected: 0,
      draft: 0,
      expired: 0,
      totalReach: 0
    };

    promotionsStats.forEach(stat => {
      if (stats.hasOwnProperty(stat._id)) {
        stats[stat._id] = stat.count;
        stats.totalReach += stat.totalEstimatedReach || 0;
      }
    });

    res.json({
      success: true,
      data: {
        stats,
        recentActivity: recentPromotions.map(p => ({
          id: p._id,
          title: p.title,
          supplier: p.supplier?.companyName,
          status: p.status,
          type: p.type,
          createdAt: p.createdAt
        }))
      }
    });

  } catch (error) {
    console.error('❌ Admin Promotions Overview Error:', error);
    next(new ErrorHandler('Failed to fetch promotions overview', 500));
  }
});
// Add these routes at the end of the file (before module.exports)

// @route   GET /api/admin-loyalty/coupon-analytics
// @desc    Get comprehensive coupon analytics and usage tracking
// @access  Private (Admin)
router.get('/coupon-analytics', auth, authorize('admin'), async (req, res, next) => {
  try {
    console.log('🔍 Admin Coupon Analytics: Starting request...');
    
    // Get all coupons with usage statistics
    const couponAnalytics = await getCouponAnalytics();
    
    res.json({
      success: true,
      data: couponAnalytics
    });

  } catch (error) {
    console.error('❌ Admin Coupon Analytics Error:', error);
    next(new ErrorHandler('Failed to fetch coupon analytics', 500));
  }
});

// @route   GET /api/admin-loyalty/coupon/:couponId/usage-details
// @desc    Get detailed usage information for a specific coupon
// @access  Private (Admin)
router.get('/coupon/:couponId/usage-details', auth, authorize('admin'), [
  param('couponId').notEmpty().withMessage('Coupon ID is required'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ErrorHandler('Validation failed', 400, errors.array()));
    }

    const { couponId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    console.log(`🔍 Getting usage details for coupon: ${couponId}`);
    
    const usageDetails = await getCouponUsageDetails(couponId, parseInt(page), parseInt(limit));
    
    res.json({
      success: true,
      data: usageDetails
    });

  } catch (error) {
    console.error('❌ Coupon Usage Details Error:', error);
    next(error);
  }
});

// @route   GET /api/admin-loyalty/coupon-usage-summary
// @desc    Get summary of coupon usage by different dimensions
// @access  Private (Admin)
router.get('/coupon-usage-summary', auth, authorize('admin'), [
  query('period').optional().isIn(['7d', '30d', '90d', '1y']).withMessage('Invalid period'),
  query('groupBy').optional().isIn(['tier', 'customerType', 'location', 'time']).withMessage('Invalid groupBy')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ErrorHandler('Validation failed', 400, errors.array()));
    }

    const { period = '30d', groupBy = 'tier' } = req.query;
    
    console.log(`🔍 Getting coupon usage summary: ${period}, groupBy: ${groupBy}`);
    
    const summary = await getCouponUsageSummary(period, groupBy);
    
    res.json({
      success: true,
      data: summary
    });

  } catch (error) {
    console.error('❌ Coupon Usage Summary Error:', error);
    next(error);
  }
});

// Helper function to get comprehensive coupon analytics
// Update the getCouponAnalytics function (around line 2100)
async function getCouponAnalytics() {
  console.log('🔍 Fetching comprehensive coupon analytics...');
  
  // Get all coupons with their usage statistics
  const coupons = await LoyaltyProgram.find({ type: 'coupon' })
    .select('name programId couponDetails validFrom validUntil isActive createdAt')
    .lean();
  
  // Get usage statistics for each coupon with DISTINCT user counting
  const couponStats = await UserLoyalty.aggregate([
    { $unwind: '$coupons' },
    {
      $lookup: {
        from: 'loyaltyprograms',
        localField: 'coupons.couponProgram',
        foreignField: '_id',
        as: 'couponProgram'
      }
    },
    { $unwind: '$couponProgram' },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userDetails'
      }
    },
    { $unwind: '$userDetails' },
    {
      $lookup: {
        from: 'orders',
        localField: 'coupons.usedInOrder',
        foreignField: '_id',
        as: 'orderDetails'
      }
    },
    // 🔥 KEY CHANGE: GROUP BY UNIQUE USER FIRST (This prevents double counting)
    {
      $group: {
        _id: {
          couponProgram: '$couponProgram._id',
          user: '$userDetails._id' // This ensures we count each user only once
        },
        couponCode: { $first: '$couponProgram.couponDetails.code' },
        couponName: { $first: '$couponProgram.name' },
        user: { $first: '$userDetails' },
        // Take the latest coupon record for this user (in case of duplicates)
        latestCoupon: { 
          $last: {
            used: '$coupons.used',
            awardedAt: '$coupons.awardedAt',
            usedAt: '$coupons.usedAt',
            discountApplied: '$coupons.discountApplied'
          }
        },
        orderDetails: { $first: '$orderDetails' },
        duplicateCount: { $sum: 1 } // Count how many duplicate records exist
      }
    },
    // 🔥 NOW GROUP BY COUPON TO GET FINAL STATS (with unique user counts)
    {
      $group: {
        _id: '$_id.couponProgram',
        couponCode: { $first: '$couponCode' },
        couponName: { $first: '$couponName' },
        totalAwarded: { $sum: 1 }, // Count unique users only
        totalUsed: { 
          $sum: { 
            $cond: ['$latestCoupon.used', 1, 0] 
          } 
        },
        totalSavings: { 
          $sum: { 
            $ifNull: ['$latestCoupon.discountApplied', 0] 
          } 
        },
        avgDiscountApplied: { 
          $avg: { 
            $ifNull: ['$latestCoupon.discountApplied', 0] 
          } 
        },
        duplicatesFound: { 
          $sum: { 
            $subtract: ['$duplicateCount', 1] 
          } 
        }, // Track how many duplicates were found
        usageByTier: {
          $push: {
            $cond: [
              '$latestCoupon.used',
              {
                tier: { $ifNull: ['$user.membershipTier', 'silver'] },
                customerType: { $ifNull: ['$user.customerType', 'house_owner'] },
                discountApplied: { $ifNull: ['$latestCoupon.discountApplied', 0] },
                usedAt: '$latestCoupon.usedAt',
                orderId: { $arrayElemAt: ['$orderDetails.orderId', 0] }
              },
              null
            ]
          }
        },
        recentUsages: {
          $push: {
            $cond: [
              '$latestCoupon.used',
              {
                userName: '$user.name',
                userEmail: '$user.email',
                customerType: { $ifNull: ['$user.customerType', 'house_owner'] },
                membershipTier: { $ifNull: ['$user.membershipTier', 'silver'] },
                usedAt: '$latestCoupon.usedAt',
                discountApplied: { $ifNull: ['$latestCoupon.discountApplied', 0] },
                orderId: { $arrayElemAt: ['$orderDetails.orderId', 0] }
              },
              null
            ]
          }
        }
      }
    },
    {
      $addFields: {
        usageRate: {
          $cond: [
            { $gt: ['$totalAwarded', 0] },
            { $round: [{ $multiply: [{ $divide: ['$totalUsed', '$totalAwarded'] }, 100] }, 2] },
            0
          ]
        },
        usageByTier: { $filter: { input: '$usageByTier', cond: { $ne: ['$$this', null] } } },
        recentUsages: { $filter: { input: '$recentUsages', cond: { $ne: ['$$this', null] } } }
      }
    },
    { $sort: { totalUsed: -1 } }
  ]);

  // 🔥 LOG DUPLICATES FOUND (for monitoring)
  couponStats.forEach(stat => {
    if (stat.duplicatesFound > 0) {
      console.warn(`⚠️ Found ${stat.duplicatesFound} duplicate coupon records for: ${stat.couponCode}`);
    }
  });

  // Merge coupon basic info with usage statistics
  const analytics = coupons.map(coupon => {
    const stats = couponStats.find(stat => stat._id.toString() === coupon._id.toString());
    
    return {
      _id: coupon._id,
      name: coupon.name,
      code: coupon.couponDetails?.code,
      programId: coupon.programId,
      isActive: coupon.isActive,
      validFrom: coupon.validFrom,
      validUntil: coupon.validUntil,
      createdAt: coupon.createdAt,
      stats: stats ? {
        totalAwarded: stats.totalAwarded,
        totalUsed: stats.totalUsed,
        usageRate: stats.usageRate,
        totalSavings: Math.round(stats.totalSavings),
        avgDiscountApplied: Math.round(stats.avgDiscountApplied),
        duplicatesFound: stats.duplicatesFound || 0, // Include duplicate info
        usageByTier: stats.usageByTier,
        recentUsages: stats.recentUsages.sort((a, b) => new Date(b.usedAt) - new Date(a.usedAt)).slice(0, 10)
      } : {
        totalAwarded: 0,
        totalUsed: 0,
        usageRate: 0,
        totalSavings: 0,
        avgDiscountApplied: 0,
        duplicatesFound: 0,
        usageByTier: [],
        recentUsages: []
      }
    };
  });

  // Overall statistics with accurate counts
  const overallStats = {
    totalCoupons: coupons.length,
    activeCoupons: coupons.filter(c => c.isActive).length,
    totalAwarded: couponStats.reduce((sum, stat) => sum + stat.totalAwarded, 0),
    totalUsed: couponStats.reduce((sum, stat) => sum + stat.totalUsed, 0),
    totalSavings: Math.round(couponStats.reduce((sum, stat) => sum + stat.totalSavings, 0)),
    totalDuplicatesFound: couponStats.reduce((sum, stat) => sum + (stat.duplicatesFound || 0), 0), // New field
    overallUsageRate: 0
  };

  if (overallStats.totalAwarded > 0) {
    overallStats.overallUsageRate = Math.round((overallStats.totalUsed / overallStats.totalAwarded) * 100);
  }

  // 🔥 LOG OVERALL DUPLICATE SUMMARY
  if (overallStats.totalDuplicatesFound > 0) {
    console.warn(`⚠️ TOTAL DUPLICATES FOUND: ${overallStats.totalDuplicatesFound} across all coupons`);
  }

  console.log('✅ Coupon analytics compiled successfully with duplicate detection');
  
  return {
    overallStats,
    coupons: analytics
  };
}
// Helper function to get detailed usage information for a specific coupon
async function getCouponUsageDetails(couponId, page, limit) {
  console.log(`🔍 Fetching usage details for coupon: ${couponId}`);
  
  const skip = (page - 1) * limit;
  
  // Get coupon basic information
  const coupon = await LoyaltyProgram.findById(couponId).select('name programId couponDetails');
  if (!coupon) {
    throw new ErrorHandler('Coupon not found', 404);
  }

  // Get detailed usage information with pagination
  const usageDetails = await UserLoyalty.aggregate([
    { $unwind: '$coupons' },
    { $match: { 'coupons.couponProgram': coupon._id } },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userDetails'
      }
    },
    { $unwind: '$userDetails' },
    {
      $lookup: {
        from: 'orders',
        localField: 'coupons.usedInOrder',
        foreignField: '_id',
        as: 'orderDetails'
      }
    },
    {
      $project: {
        couponId: '$coupons._id',
        user: {
          _id: '$userDetails._id',
          name: '$userDetails.name',
          email: '$userDetails.email',
          customerType: { $ifNull: ['$userDetails.customerType', 'house_owner'] },
          membershipTier: { $ifNull: ['$userDetails.membershipTier', 'silver'] },
          customerId: '$userDetails.customerId',
          phoneNumber: '$userDetails.phoneNumber'
        },
        awardedAt: '$coupons.awardedAt',
        used: '$coupons.used',
        usedAt: '$coupons.usedAt',
        discountApplied: { $ifNull: ['$coupons.discountApplied', 0] },
        order: {
          $cond: [
            { $gt: [{ $size: '$orderDetails' }, 0] },
            {
              _id: { $arrayElemAt: ['$orderDetails._id', 0] },
              orderId: { $arrayElemAt: ['$orderDetails.orderId', 0] },
              totalAmount: { $arrayElemAt: ['$orderDetails.pricing.totalAmount', 0] },
              createdAt: { $arrayElemAt: ['$orderDetails.createdAt', 0] }
            },
            null
          ]
        }
      }
    },
    { $sort: { usedAt: -1, awardedAt: -1 } },
    { $skip: skip },
    { $limit: limit }
  ]);

  // Get total count for pagination
  const totalCount = await UserLoyalty.aggregate([
    { $unwind: '$coupons' },
    { $match: { 'coupons.couponProgram': coupon._id } },
    { $count: 'total' }
  ]);

  const total = totalCount[0]?.total || 0;

  return {
    coupon: {
      _id: coupon._id,
      name: coupon.name,
      code: coupon.couponDetails?.code,
      programId: coupon.programId
    },
    usageDetails,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: limit
    }
  };
}

// Helper function to get coupon usage summary by different dimensions
async function getCouponUsageSummary(period, groupBy) {
  console.log(`🔍 Fetching coupon usage summary: ${period}, groupBy: ${groupBy}`);
  
  // Calculate date range based on period
  const now = new Date();
  let startDate;
  
  switch (period) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  let groupStage;
  let additionalStages = [];

  switch (groupBy) {
    case 'tier':
      groupStage = {
        _id: { $ifNull: ['$userDetails.membershipTier', 'silver'] },
        count: { $sum: 1 },
        totalSavings: { $sum: { $ifNull: ['$coupons.discountApplied', 0] } },
        avgSavings: { $avg: { $ifNull: ['$coupons.discountApplied', 0] } },
        uniqueUsers: { $addToSet: '$userDetails._id' }
      };
      break;
      
    case 'customerType':
      groupStage = {
        _id: { $ifNull: ['$userDetails.customerType', 'house_owner'] },
        count: { $sum: 1 },
        totalSavings: { $sum: { $ifNull: ['$coupons.discountApplied', 0] } },
        avgSavings: { $avg: { $ifNull: ['$coupons.discountApplied', 0] } },
        uniqueUsers: { $addToSet: '$userDetails._id' }
      };
      break;
      
    case 'location':
      groupStage = {
        _id: { $ifNull: ['$userDetails.addresses.0.state', 'Unknown'] },
        count: { $sum: 1 },
        totalSavings: { $sum: { $ifNull: ['$coupons.discountApplied', 0] } },
        avgSavings: { $avg: { $ifNull: ['$coupons.discountApplied', 0] } },
        uniqueUsers: { $addToSet: '$userDetails._id' }
      };
      break;
      
    case 'time':
      groupStage = {
        _id: {
          year: { $year: '$coupons.usedAt' },
          month: { $month: '$coupons.usedAt' },
          day: { $dayOfMonth: '$coupons.usedAt' }
        },
        count: { $sum: 1 },
        totalSavings: { $sum: { $ifNull: ['$coupons.discountApplied', 0] } },
        avgSavings: { $avg: { $ifNull: ['$coupons.discountApplied', 0] } },
        uniqueUsers: { $addToSet: '$userDetails._id' }
      };
      additionalStages.push({
        $addFields: {
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: '$_id.day'
            }
          }
        }
      });
      break;
      
    default:
      groupStage = {
        _id: { $ifNull: ['$userDetails.membershipTier', 'silver'] },
        count: { $sum: 1 },
        totalSavings: { $sum: { $ifNull: ['$coupons.discountApplied', 0] } },
        avgSavings: { $avg: { $ifNull: ['$coupons.discountApplied', 0] } },
        uniqueUsers: { $addToSet: '$userDetails._id' }
      };
  }

  const pipeline = [
    { $unwind: '$coupons' },
    { $match: { 
      'coupons.used': true,
      'coupons.usedAt': { $gte: startDate, $lte: now }
    }},
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userDetails'
      }
    },
    { $unwind: '$userDetails' },
    { $group: groupStage },
    ...additionalStages,
    {
      $addFields: {
        uniqueUserCount: { $size: '$uniqueUsers' },
        avgSavings: { $round: ['$avgSavings', 2] },
        totalSavings: { $round: ['$totalSavings', 2] }
      }
    },
    { $sort: { count: -1 } }
  ];

  const summary = await UserLoyalty.aggregate(pipeline);

  return {
    period,
    groupBy,
    data: summary.map(item => ({
      ...item,
      uniqueUsers: undefined // Remove the array to reduce response size
    }))
  };
}
// Add this route before the helper functions (around line 2000)

// @route   GET /api/admin-loyalty/coupon-analytics/export
// @desc    Export coupon analytics data
// @access  Private (Admin)
router.get('/coupon-analytics/export', auth, authorize('admin'), [
  query('format').optional().isIn(['csv', 'json']).withMessage('Invalid format')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ErrorHandler('Validation failed', 400, errors.array()));
    }

    const { format = 'csv' } = req.query;
    
    console.log(`🔍 Exporting coupon analytics in ${format} format...`);
    
    // Get detailed usage data for export
    const exportData = await UserLoyalty.aggregate([
      { $unwind: '$coupons' },
      {
        $lookup: {
          from: 'loyaltyprograms',
          localField: 'coupons.couponProgram',
          foreignField: '_id',
          as: 'couponProgram'
        }
      },
      { $unwind: '$couponProgram' },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      { $unwind: '$userDetails' },
      {
        $lookup: {
          from: 'orders',
          localField: 'coupons.usedInOrder',
          foreignField: '_id',
          as: 'orderDetails'
        }
      },
      {
        $project: {
          couponCode: '$couponProgram.couponDetails.code',
          couponName: '$couponProgram.name',
          programId: '$couponProgram.programId',
          userName: '$userDetails.name',
          userEmail: '$userDetails.email',
          customerType: { $ifNull: ['$userDetails.customerType', 'house_owner'] },
          membershipTier: { $ifNull: ['$userDetails.membershipTier', 'silver'] },
          userLocation: { $ifNull: ['$userDetails.addresses.0.state', 'Unknown'] },
          awardedAt: '$coupons.awardedAt',
          used: '$coupons.used',
          usedAt: '$coupons.usedAt',
          discountApplied: { $ifNull: ['$coupons.discountApplied', 0] },
          orderId: { $arrayElemAt: ['$orderDetails.orderId', 0] },
          orderAmount: { $arrayElemAt: ['$orderDetails.pricing.totalAmount', 0] }
        }
      },
      { $sort: { usedAt: -1, awardedAt: -1 } }
    ]);

    if (format === 'csv') {
      // Generate CSV
      const csv = convertToCSV(exportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=coupon-analytics-${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csv);
    } else {
      // Generate JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=coupon-analytics-${new Date().toISOString().split('T')[0]}.json`);
      res.json({
        exportDate: new Date().toISOString(),
        totalRecords: exportData.length,
        data: exportData
      });
    }

    console.log(`✅ Coupon analytics exported successfully: ${exportData.length} records`);

  } catch (error) {
    console.error('❌ Coupon Analytics Export Error:', error);
    next(error);
  }
});

// Helper function to convert data to CSV
function convertToCSV(data) {
  if (!data || data.length === 0) {
    return 'No data available';
  }

  const headers = [
    'Coupon Code',
    'Coupon Name', 
    'Program ID',
    'User Name',
    'User Email',
    'Customer Type',
    'Membership Tier',
    'Location',
    'Awarded Date',
    'Used',
    'Used Date',
    'Discount Applied',
    'Order ID',
    'Order Amount'
  ];

  const csvRows = [headers.join(',')];

  data.forEach(row => {
    const values = [
      `"${row.couponCode || ''}"`,
      `"${row.couponName || ''}"`,
      `"${row.programId || ''}"`,
      `"${row.userName || ''}"`,
      `"${row.userEmail || ''}"`,
      `"${row.customerType || ''}"`,
      `"${row.membershipTier || ''}"`,
      `"${row.userLocation || ''}"`,
      `"${row.awardedAt ? new Date(row.awardedAt).toLocaleString() : ''}"`,
      `"${row.used ? 'Yes' : 'No'}"`,
      `"${row.usedAt ? new Date(row.usedAt).toLocaleString() : ''}"`,
      `"${row.discountApplied || 0}"`,
      `"${row.orderId || ''}"`,
      `"${row.orderAmount || 0}"`
    ];
    csvRows.push(values.join(','));
  });

  return csvRows.join('\n');
}
// Add at the end before module.exports
// Add this before module.exports = router; (around line 2708)

// @route   GET /api/admin-loyalty/user-coupon-frequency
// @desc    Get how many times each user has used coupons (frequency analysis)
// @access  Private (Admin)
router.get('/user-coupon-frequency', auth, authorize('admin'), [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('sortBy').optional().isIn(['totalUsage', 'uniqueCoupons', 'totalSavings', 'lastUsed', 'userName']).withMessage('Invalid sort field'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
  query('minUsage').optional().isInt({ min: 1 }).withMessage('Minimum usage must be a positive integer'),
  query('customerType').optional().isIn(['house_owner', 'mason', 'builder_contractor', 'others']).withMessage('Invalid customer type'),
  query('membershipTier').optional().isIn(['silver', 'gold', 'platinum']).withMessage('Invalid membership tier'),
  query('state').optional().isLength({ min: 1 }).withMessage('Invalid state'),
  query('city').optional().isLength({ min: 1 }).withMessage('Invalid city')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const { 
      limit = 50, 
      page = 1, 
      sortBy = 'totalUsage', 
      sortOrder = 'desc',
      minUsage,
      customerType,
      membershipTier,
      state,      // Add this
  city        // Add this
    } = req.query;

    console.log(`🔍 Getting user coupon frequency: page=${page}, limit=${limit}, sortBy=${sortBy}`);

    const frequencyData = await getUserCouponFrequency(
      parseInt(page), 
      parseInt(limit), 
      sortBy, 
      sortOrder,
      minUsage ? parseInt(minUsage) : null,
      customerType,
      membershipTier,
      state,
      city
    );

    res.json({
      success: true,
      data: frequencyData
    });

  } catch (error) {
    console.error('❌ User Coupon Frequency Error:', error);
    next(error);
  }
});

// @route   GET /api/admin-loyalty/user/:userId/coupon-history
// @desc    Get detailed coupon usage history for a specific user
// @access  Private (Admin)
router.get('/user/:userId/coupon-history', auth, authorize('admin'), [
  param('userId').isMongoId().withMessage('Invalid user ID'),
  
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const { userId } = req.params;
    const { limit = 20, page = 1 } = req.query;

    console.log(`🔍 Getting coupon history for user: ${userId}`);

    const userHistory = await getUserCouponHistory(userId, parseInt(page), parseInt(limit));

    res.json({
      success: true,
      data: userHistory
    });

  } catch (error) {
    console.error('❌ User Coupon History Error:', error);
    next(error);
  }
});

// Helper function to get user coupon usage frequency
async function getUserCouponFrequency(page, limit, sortBy, sortOrder, minUsage, customerType, membershipTier,state, city) {
  console.log(`🔍 Analyzing user coupon frequency with filters:`, { minUsage, customerType, membershipTier });
  
  const skip = (page - 1) * limit;
  const sortDirection = sortOrder === 'desc' ? -1 : 1;

  // Build match conditions
  const matchConditions = {};
  if (customerType) {
    matchConditions['userDetails.customerType'] = customerType;
  }
  if (membershipTier) {
    matchConditions['userDetails.membershipTier'] = membershipTier;
  }
if (state) {
  matchConditions['userDetails.addresses.state'] = state;
}
if (city) {
  matchConditions['userDetails.addresses.city'] = city;
}
  // Aggregation pipeline
  const pipeline = [
    { $unwind: '$coupons' },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userDetails'
      }
    },
    { $unwind: '$userDetails' },
    {
      $lookup: {
        from: 'loyaltyprograms',
        localField: 'coupons.couponProgram',
        foreignField: '_id',
        as: 'couponProgram'
      }
    },
    { $unwind: '$couponProgram' },
    {
      $lookup: {
        from: 'orders',
        localField: 'coupons.usedInOrder',
        foreignField: '_id',
        as: 'orderDetails'
      }
    }
  ];

  // Add match conditions if any
  if (Object.keys(matchConditions).length > 0) {
    pipeline.push({ $match: matchConditions });
  }

  // Group by user to calculate frequency stats
  pipeline.push({
    $group: {
      _id: '$userDetails._id',
      userName: { $first: '$userDetails.name' },
      userEmail: { $first: '$userDetails.email' },
      customerId: { $first: '$userDetails.customerId' },
      phoneNumber: { $first: '$userDetails.phoneNumber' },
      customerType: { $first: { $ifNull: ['$userDetails.customerType', 'house_owner'] } },
      membershipTier: { $first: { $ifNull: ['$userDetails.membershipTier', 'silver'] } },
      // Fix the location field in the $group stage (around line 2875)

location: { 
  $first: {
    city: { $arrayElemAt: ['$userDetails.addresses.city', 0] },
    state: { $arrayElemAt: ['$userDetails.addresses.state', 0] },
    pincode: { $arrayElemAt: ['$userDetails.addresses.pincode', 0] }
  }
},
      
      // Frequency Statistics
      totalCouponsAwarded: { $sum: 1 },
      totalCouponsUsed: { 
        $sum: { $cond: [{ $eq: ['$coupons.used', true] }, 1, 0] }
      },
      uniqueCouponsUsed: {
        $addToSet: {
          $cond: [
            { $eq: ['$coupons.used', true] },
            '$couponProgram._id',
            null
          ]
        }
      },
      totalSavings: {
        $sum: { $ifNull: ['$coupons.discountApplied', 0] }
      },
      
      // Usage Patterns
      firstCouponUsed: { 
        $min: { 
          $cond: [{ $eq: ['$coupons.used', true] }, '$coupons.usedAt', null] 
        }
      },
      lastCouponUsed: { 
        $max: { 
          $cond: [{ $eq: ['$coupons.used', true] }, '$coupons.usedAt', null] 
        }
      },
      
      // Recent Activity (last 30 days)
      recentUsage: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ['$coupons.used', true] },
                { $gte: ['$coupons.usedAt', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] }
              ]
            },
            1,
            0
          ]
        }
      },
      
      // Detailed coupon breakdown
      couponBreakdown: {
        $push: {
          $cond: [
            { $eq: ['$coupons.used', true] },
            {
              couponName: '$couponProgram.name',
              couponCode: '$couponProgram.couponDetails.code',
              usedAt: '$coupons.usedAt',
              discountApplied: { $ifNull: ['$coupons.discountApplied', 0] },
              orderId: { $arrayElemAt: ['$orderDetails.orderId', 0] }
            },
            null
          ]
        }
      }
    }
  });

  // Clean up uniqueCouponsUsed array (remove nulls) and calculate count
  pipeline.push({
    $addFields: {
      uniqueCoupons: {
        $size: {
          $filter: {
            input: '$uniqueCouponsUsed',
            cond: { $ne: ['$$this', null] }
          }
        }
      },
      couponBreakdown: {
        $filter: {
          input: '$couponBreakdown',
          cond: { $ne: ['$$this', null] }
        }
      },
      usageFrequency: {
        $cond: [
          { $gt: ['$totalCouponsUsed', 0] },
          {
            $round: [
              {
                $divide: [
                  '$totalCouponsUsed',
                  {
                    $max: [
                      1,
                      {
                        $divide: [
                          { $subtract: [new Date(), '$firstCouponUsed'] },
                          1000 * 60 * 60 * 24 * 30 // Convert to months
                        ]
                      }
                    ]
                  }
                ]
              },
              2
            ]
          },
          0
        ]
      }
    }
  });

  // Apply minimum usage filter if specified
  if (minUsage) {
    pipeline.push({
      $match: { totalCouponsUsed: { $gte: minUsage } }
    });
  }

  // Sort the results
  const sortField = {
    totalUsage: 'totalCouponsUsed',
    uniqueCoupons: 'uniqueCoupons',
    totalSavings: 'totalSavings',
    lastUsed: 'lastCouponUsed',
    userName: 'userName'
  }[sortBy] || 'totalCouponsUsed';

  pipeline.push({ $sort: { [sortField]: sortDirection, _id: 1 } });

  // Add pagination
  pipeline.push({ $skip: skip }, { $limit: limit });

  // Final projection to clean up the response
  pipeline.push({
    $project: {
      _id: 1,
      userName: 1,
      userEmail: 1,
      customerId: 1,
      phoneNumber: 1,
      customerType: 1,
      membershipTier: 1,
      location: 1,
      totalCouponsAwarded: 1,
      totalCouponsUsed: 1,
      uniqueCoupons: 1,
      totalSavings: 1,
      usageFrequency: 1,
      firstCouponUsed: 1,
      lastCouponUsed: 1,
      recentUsage: 1,
      couponBreakdown: { $slice: ['$couponBreakdown', -5] }, // Last 5 coupons used
      
      // Usage patterns
      usagePattern: {
        $switch: {
          branches: [
            { case: { $gte: ['$usageFrequency', 2] }, then: 'Very Active' },
            { case: { $gte: ['$usageFrequency', 1] }, then: 'Active' },
            { case: { $gte: ['$usageFrequency', 0.5] }, then: 'Moderate' },
            { case: { $gt: ['$totalCouponsUsed', 0] }, then: 'Low' }
          ],
          default: 'Inactive'
        }
      },
      
      // User engagement score (0-100)
      engagementScore: {
        $min: [
          100,
          {
            $round: [
              {
                $add: [
                  { $multiply: ['$usageFrequency', 20] }, // Frequency weight: 20%
                  { $multiply: [{ $divide: ['$uniqueCoupons', { $max: [1, '$totalCouponsAwarded'] }] }, 30] }, // Variety weight: 30%
                  { $multiply: [{ $divide: ['$recentUsage', { $max: [1, '$totalCouponsUsed'] }] }, 25] }, // Recency weight: 25%
                  { $multiply: [{ $min: [10, { $divide: ['$totalSavings', 100] }] }, 2.5] } // Savings weight: 25%
                ]
              }
            ]
          }
        ]
      }
    }
  });

  const frequencyData = await UserLoyalty.aggregate(pipeline);

  // Get total count for pagination (without limit)
  const countPipeline = [...pipeline.slice(0, -3)]; // Remove sort, skip, limit, and project
  const totalCountResult = await UserLoyalty.aggregate([
    ...countPipeline,
    { $count: 'total' }
  ]);
  
  const totalUsers = totalCountResult[0]?.total || 0;

  // Calculate summary statistics
  const summaryPipeline = [...pipeline.slice(0, -4)]; // Remove sort, skip, limit, and project
  summaryPipeline.push({
    $group: {
      _id: null,
      totalUsers: { $sum: 1 },
      totalCouponsUsed: { $sum: '$totalCouponsUsed' },
      totalSavings: { $sum: '$totalSavings' },
      avgUsagePerUser: { $avg: '$totalCouponsUsed' },
      avgSavingsPerUser: { $avg: '$totalSavings' },
      topUsers: { $max: '$totalCouponsUsed' }
    }
  });

  const summaryResult = await UserLoyalty.aggregate(summaryPipeline);
  const summary = summaryResult[0] || {};

  console.log(`✅ User frequency analysis complete: ${frequencyData.length} users found`);

  return {
    users: frequencyData,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalUsers / limit),
      totalItems: totalUsers,
      itemsPerPage: limit
    },
    summary: {
      totalUsers: summary.totalUsers || 0,
      totalCouponsUsed: summary.totalCouponsUsed || 0,
      totalSavings: summary.totalSavings || 0,
      averageUsagePerUser: Math.round((summary.avgUsagePerUser || 0) * 100) / 100,
      averageSavingsPerUser: Math.round((summary.avgSavingsPerUser || 0) * 100) / 100,
      topUserUsage: summary.topUsers || 0
    },
    filters: {
      minUsage,
      customerType,
      membershipTier,
      sortBy,
      sortOrder
    }
  };
}

// Helper function to get detailed coupon history for a specific user
async function getUserCouponHistory(userId, page, limit) {
  console.log(`🔍 Fetching coupon history for user: ${userId}`);
  
  const skip = (page - 1) * limit;

  // Get user details first
  const user = await User.findById(userId).select('name email customerId customerType membershipTier');
  if (!user) {
    throw new ErrorHandler('User not found', 404);
  }

  // Get user's coupon history
  const userLoyalty = await UserLoyalty.findOne({ user: userId });
  if (!userLoyalty || !userLoyalty.coupons || userLoyalty.coupons.length === 0) {
    return {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        customerId: user.customerId,
        customerType: user.customerType || 'house_owner',
        membershipTier: user.membershipTier || 'silver'
      },
      coupons: [],
      pagination: {
        currentPage: page,
        totalPages: 0,
        totalItems: 0,
        itemsPerPage: limit
      },
      summary: {
        totalCoupons: 0,
        totalUsed: 0,
        totalSavings: 0,
        usageRate: 0
      }
    };
  }

  // Get detailed coupon information with aggregation
  const couponHistory = await UserLoyalty.aggregate([
    { $match: { user: user._id } },
    { $unwind: '$coupons' },
    {
      $lookup: {
        from: 'loyaltyprograms',
        localField: 'coupons.couponProgram',
        foreignField: '_id',
        as: 'couponProgram'
      }
    },
    { $unwind: '$couponProgram' },
    {
      $lookup: {
        from: 'orders',
        localField: 'coupons.usedInOrder',
        foreignField: '_id',
        as: 'orderDetails'
      }
    },
    // Replace the $project stage in the aggregation pipeline (around line 3171)

{
  $project: {
    // Fields expected by frontend timeline
    usedAt: '$coupons.usedAt',
    awardedAt: '$coupons.awardedAt', 
    couponCode: '$couponProgram.couponDetails.code',
    couponName: '$couponProgram.name',
    discountAmount: { $ifNull: ['$coupons.discountApplied', 0] }, // ← Frontend expects 'discountAmount'
    used: '$coupons.used',
    
    // Coupon details
    coupon: {
      _id: '$coupons._id',
      name: '$couponProgram.name',
      code: '$couponProgram.couponDetails.code',
      description: '$couponProgram.description',
      discountType: '$couponProgram.couponDetails.discountType',
      discountValue: '$couponProgram.couponDetails.discountValue',
      minOrderValue: '$couponProgram.couponDetails.minOrderValue',
      maxDiscountAmount: '$couponProgram.couponDetails.maxDiscountAmount'
    },
    
    // Order details  
    orderId: {
      $cond: [
        { $gt: [{ $size: '$orderDetails' }, 0] },
        { $arrayElemAt: ['$orderDetails.orderId', 0] },
        null
      ]
    },
    order: {
      $cond: [
        { $gt: [{ $size: '$orderDetails' }, 0] },
        {
          _id: { $arrayElemAt: ['$orderDetails._id', 0] },
          orderId: { $arrayElemAt: ['$orderDetails.orderId', 0] },
          totalAmount: { $arrayElemAt: ['$orderDetails.pricing.totalAmount', 0] },
          createdAt: { $arrayElemAt: ['$orderDetails.createdAt', 0] }
        },
        null
      ]
    },
    status: {
      $switch: {
        branches: [
          {
            case: { $eq: ['$coupons.used', true] },
            then: 'USED'
          },
          {
            case: {
              $and: [
                { $eq: ['$coupons.used', false] },
                { $lt: ['$couponProgram.validUntil', new Date()] }
              ]
            },
            then: 'EXPIRED'
          }
        ],
        default: 'ACTIVE'
      }
    }
  }
},
    { $sort: { awardedAt: -1, usedAt: -1 } },
    { $skip: skip },
    { $limit: limit }
  ]);

  // Get total count and summary statistics
  const totalCount = userLoyalty.coupons.length;
  const totalUsed = userLoyalty.coupons.filter(c => c.used).length;
  const totalSavings = userLoyalty.coupons.reduce((sum, c) => sum + (c.discountApplied || 0), 0);

  console.log(`✅ User coupon history: ${couponHistory.length} coupons retrieved`);

  return {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      customerId: user.customerId,
      customerType: user.customerType || 'house_owner',
      membershipTier: user.membershipTier || 'silver'
    },
    history: couponHistory,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      totalItems: totalCount,
      itemsPerPage: limit
    },
    summary: {
      uniqueCoupns: totalCount,
      totalUsage: totalUsed,
      totalSavings: Math.round(totalSavings * 100) / 100,
      usageRate: totalCount > 0 ? Math.round((totalUsed / totalCount) * 100) : 0,
      activeCoupons: totalCount - totalUsed,
      averageSavingsPerUse: totalUsed > 0 ? Math.round((totalSavings / totalUsed) * 100) / 100 : 0
    }
  };
}



module.exports = router;