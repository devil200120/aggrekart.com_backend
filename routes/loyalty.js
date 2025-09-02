const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const LoyaltyProgram = require('../models/LoyaltyProgram');
const UserLoyalty = require('../models/UserLoyalty');
const User = require('../models/User');
const Order = require('../models/Order'); // ADD THIS IMPORT
const router = express.Router();
const MembershipConfig = require('../models/MembershipConfig');

// Helper function to get real-time order data for a user
const getRealTimeOrderData = async (userId) => {
  try {
    const orders = await Order.find({ customer: userId });
    const totalOrders = orders.length;
    const totalSpent = orders.reduce((sum, order) => sum + (order.pricing?.totalAmount || 0), 0);
    const averageOrderValue = totalOrders > 0 ? Math.round(totalSpent / totalOrders) : 0;
    
    // Get the most recent order date
    const lastOrderDate = orders.length > 0 
      ? orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0].createdAt 
      : null;

    return {
      totalOrders,
      totalSpent,
      averageOrderValue,
      lastOrderDate
    };
  } catch (error) {
    console.error('Error getting real-time order data:', error);
    return {
      totalOrders: 0,
      totalSpent: 0,
      averageOrderValue: 0,
      lastOrderDate: null
    };
  }
};

// Helper function to calculate correct tier based on real data
const calculateCorrectTier = async (totalOrders, totalSpent) => {
  try {
    // Get current membership configuration
    const configs = await MembershipConfig.find({ isActive: true }).sort({ 
      'requirements.minSpending': -1 // Sort by spending requirement (highest first)
    });

    if (!configs.length) {
      // Fallback to hardcoded values if no config exists
      console.warn('No membership configs found, using defaults');
      if (totalOrders >= 50 && totalSpent >= 200000) return 'platinum';
      if (totalOrders >= 20 && totalSpent >= 50000) return 'gold';
      return 'silver';
    }

    // Find the highest tier the user qualifies for
    for (const config of configs) {
      if (totalOrders >= config.requirements.minOrders && 
          totalSpent >= config.requirements.minSpending) {
        return config.tier;
      }
    }

    return 'silver'; // Default to silver if no requirements met
  } catch (error) {
    console.error('Error calculating tier from config:', error);
    // Fallback to hardcoded values
    if (totalOrders >= 50 && totalSpent >= 200000) return 'platinum';
    if (totalOrders >= 20 && totalSpent >= 50000) return 'gold';
    return 'silver';
  }
};

// Helper function to calculate next tier progress (using REAL order data and CORRECT tier)
const calculateNextTierProgress = async (user, realOrderData = null) => {
  try {
    const orderCount = realOrderData ? realOrderData.totalOrders : (user.orderCount || 0);
    const totalSpent = realOrderData ? realOrderData.totalSpent : (user.totalOrderValue || 0);
    
    const correctTier = await calculateCorrectTier(orderCount, totalSpent);
    
    // Get all configs sorted by requirements
    const configs = await MembershipConfig.find({ isActive: true }).sort({ 
      'requirements.minSpending': 1 
    });

    if (!configs.length) {
      // Fallback logic
      const tiers = {
        silver: { maxOrders: 19, maxSpent: 49999, nextTier: 'gold', nextReq: { orders: 20, spent: 50000 } },
        gold: { maxOrders: 49, maxSpent: 199999, nextTier: 'platinum', nextReq: { orders: 50, spent: 200000 } },
        platinum: { maxOrders: Infinity, maxSpent: Infinity, nextTier: null, nextReq: null }
      };
      
      const tierInfo = tiers[correctTier];
      if (!tierInfo.nextTier) {
        return { isMaxTier: true, currentTier: correctTier, correctTier };
      }
      
      return {
        isMaxTier: false,
        currentTier: correctTier,
        correctTier,
        nextTier: tierInfo.nextTier,
        progressPercentage: Math.min(100, Math.max(
          (orderCount / tierInfo.nextReq.orders) * 100,
          (totalSpent / tierInfo.nextReq.spent) * 100
        )),
        ordersNeeded: Math.max(0, tierInfo.nextReq.orders - orderCount),
        spendingNeeded: Math.max(0, tierInfo.nextReq.spent - totalSpent),
        requirement: tierInfo.nextReq
      };
    }

    // Find current tier config and next tier
    const currentTierIndex = configs.findIndex(c => c.tier === correctTier);
    const nextTierIndex = currentTierIndex + 1;

    if (nextTierIndex >= configs.length) {
      return { 
        isMaxTier: true, 
        currentTier: correctTier, 
        correctTier,
        message: 'You have reached the highest tier!'
      };
    }

    const nextTierConfig = configs[nextTierIndex];
    const ordersNeeded = Math.max(0, nextTierConfig.requirements.minOrders - orderCount);
    const spendingNeeded = Math.max(0, nextTierConfig.requirements.minSpending - totalSpent);
    
    const orderProgress = nextTierConfig.requirements.minOrders > 0 ? 
      (orderCount / nextTierConfig.requirements.minOrders) * 100 : 100;
    const spentProgress = nextTierConfig.requirements.minSpending > 0 ? 
      (totalSpent / nextTierConfig.requirements.minSpending) * 100 : 100;
    
    return {
      isMaxTier: false,
      currentTier: correctTier,
      correctTier,
      nextTier: nextTierConfig.tier,
      progressPercentage: Math.min(100, Math.max(orderProgress, spentProgress)),
      ordersNeeded,
      spendingNeeded,
      requirement: {
        orders: nextTierConfig.requirements.minOrders,
        spent: nextTierConfig.requirements.minSpending
      }
    };

  } catch (error) {
    console.error('Error calculating tier progress:', error);
    // Return basic fallback
    return {
      isMaxTier: false,
      currentTier: 'silver',
      correctTier: 'silver',
      nextTier: 'gold',
      progressPercentage: 0,
      ordersNeeded: 20,
      spendingNeeded: 50000,
      requirement: { orders: 20, spent: 50000 }
    };
  }
};

// @route   GET /api/loyalty/dashboard
// @desc    Get comprehensive loyalty dashboard for customer (REAL DATA with YOUR JWT)
// @access  Private (Customer) - REQUIRES LOGIN
router.get('/dashboard', auth, authorize('customer'), async (req, res, next) => {
  try {
    console.log('🔍 Dashboard route hit for user:', req.user._id);
    
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // GET REAL-TIME ORDER DATA with safe error handling
    let realOrderData;
    try {
      realOrderData = await getRealTimeOrderData(req.user._id);
    } catch (orderError) {
      console.error('Error getting order data:', orderError);
      realOrderData = {
        totalOrders: 0,
        totalSpent: 0,
        averageOrderValue: 0,
        lastOrderDate: null
      };
    }
    
    console.log('✅ Real-time order data:', {
      name: user.name,
      storedOrders: user.orderCount,
      actualOrders: realOrderData.totalOrders,
      storedSpent: user.totalOrderValue,
      actualSpent: realOrderData.totalSpent
    });

    // Calculate correct tier and progress with safe fallbacks (UPDATED TO ASYNC)
    const correctTier = await calculateCorrectTier(realOrderData.totalOrders, realOrderData.totalSpent);
    const nextTierProgress = await calculateNextTierProgress(user, realOrderData);
    
    // Update user's tier in database if it's incorrect
    if (user.membershipTier !== correctTier) {
      console.log(`🔄 Updating user tier: ${user.membershipTier} -> ${correctTier}`);
      try {
        await User.findByIdAndUpdate(req.user._id, { 
          membershipTier: correctTier,
          orderCount: realOrderData.totalOrders,
          totalOrderValue: realOrderData.totalSpent
        });
      } catch (updateError) {
        console.error('Error updating user tier:', updateError);
      }
    }

    // Get or create UserLoyalty record with safe error handling
    let userLoyalty;
    try {
      userLoyalty = await UserLoyalty.findOne({ user: req.user._id });

      if (!userLoyalty) {
        console.log('Creating new UserLoyalty record');
        userLoyalty = new UserLoyalty({
          user: req.user._id,
          aggreCoins: {
            balance: user.aggreCoins || 0,
            totalEarned: user.aggreCoins || 0,
            totalRedeemed: 0
          },
          membership: {
            currentTier: correctTier,
            tierProgress: {
              currentSpent: realOrderData.totalSpent,
              ordersCompleted: realOrderData.totalOrders,
              nextTierRequirement: nextTierProgress.requirement || { orders: 0, spent: 0 }
            },
            joinDate: user.createdAt || new Date(),
            lastTierUpdate: new Date()
          },
          customerMetrics: {
            totalOrders: realOrderData.totalOrders,
            totalSpent: realOrderData.totalSpent,
            averageOrderValue: realOrderData.averageOrderValue,
            lastOrderDate: realOrderData.lastOrderDate,
            favoriteCategories: []
          },
          preferences: {
            notifications: {
              coinEarned: true,
              tierUpgrade: true,
              promotions: true,
              referrals: true
            },
            communication: {
              email: true,
              sms: true,
              whatsapp: false
            }
          },
          transactions: [],
          referrals: [],
          rewards: [],
          achievements: ['welcome_member']
        });
        await userLoyalty.save();
        console.log('✅ UserLoyalty record created with correct tier');
      }
    } catch (loyaltyError) {
      console.error('Error with UserLoyalty:', loyaltyError);
      // Create minimal userLoyalty object if database operation fails
      userLoyalty = {
        aggreCoins: { balance: 0, totalEarned: 0, totalRedeemed: 0 },
        transactions: [],
        referrals: [],
        achievements: ['welcome_member']
      };
    }

    // Get available programs with safe error handling
    let availablePrograms = [];
    try {
      availablePrograms = await LoyaltyProgram.find({
        isActive: true,
        'conditions.validFrom': { $lte: new Date() },
        'conditions.validTill': { $gte: new Date() }
      }).limit(5).select('name type description rewards');
    } catch (programError) {
      console.error('Error getting programs:', programError);
      availablePrograms = [];
    }

    // Safe data extraction with proper null checks and type conversion
    const aggreCoins = {
      balance: Number(userLoyalty.aggreCoins?.balance || user.aggreCoins || 0),
      totalEarned: Number(userLoyalty.aggreCoins?.totalEarned || user.aggreCoins || 0),
      totalRedeemed: Number(userLoyalty.aggreCoins?.totalRedeemed || 0)
    };

    // Build response data with safe serialization
    const responseData = {
      // Basic loyalty info
      aggreCoins,
      
      // User info
      user: {
        name: String(user.name || ''),
        customerId: String(user.customerId || ''),
        email: String(user.email || '')
      },

      // Membership info with CORRECT tier
      membership: {
        currentTier: String(correctTier),
        tierProgress: {
          isMaxTier: Boolean(nextTierProgress.isMaxTier),
          currentTier: String(nextTierProgress.currentTier || correctTier),
          nextTier: nextTierProgress.nextTier ? String(nextTierProgress.nextTier) : null,
          progressPercentage: Number(nextTierProgress.progressPercentage || 0),
          ordersNeeded: Number(nextTierProgress.ordersNeeded || 0),
          spendingNeeded: Number(nextTierProgress.spendingNeeded || 0),
          requirement: nextTierProgress.requirement || null
        }
      },
      
      // Customer metrics with REAL data
      customerMetrics: {
        totalOrders: Number(realOrderData.totalOrders),
        totalSpent: Number(realOrderData.totalSpent),
        averageOrderValue: Number(realOrderData.averageOrderValue),
        memberSince: user.createdAt ? user.createdAt.toISOString() : new Date().toISOString(),
        lastOrderDate: realOrderData.lastOrderDate ? realOrderData.lastOrderDate.toISOString() : null
      },

      // Benefits for correct tier
      benefits: {
        tierBenefits: await getBenefitsForTier(correctTier) || [],
        customerTypeBenefits: String(`${user.customerType || 'customer'} customer benefits`),
        coinMultiplier: Number(getCoinMultiplier(correctTier))
      },
      
      // Programs and offers - ensure safe mapping
      availablePrograms: (availablePrograms || []).map(program => ({
        id: String(program._id || ''),
        name: String(program.name || ''),
        type: String(program.type || ''),
        description: String(program.description || `${program.name} program`),
        rewards: program.rewards ? JSON.parse(JSON.stringify(program.rewards)) : {}
      })),
      
      // Recent transactions - ensure safe mapping
      recentTransactions: (userLoyalty.transactions || [])
        .filter(t => t && t.createdAt) // Filter out null/undefined transactions
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10)
        .map(t => ({
          id: String(t._id || ''),
          type: String(t.type || ''),
          amount: Number(t.amount || 0),
          description: String(t.description || ''),
          createdAt: t.createdAt ? t.createdAt.toISOString() : new Date().toISOString()
        })),
      
      // Referral info - ensure safe data
      referralCode: String(`AGK${(user.customerId || '000000').slice(-6).toUpperCase()}`),
      referralStats: {
        totalReferrals: Number((userLoyalty.referrals || []).length),
        successfulReferrals: Number((userLoyalty.referrals || []).filter(r => r && r.status === 'completed').length),
        pendingReferrals: Number((userLoyalty.referrals || []).filter(r => r && r.status === 'pending').length),
        totalEarnings: Number(0)
      },

      // Achievements - ensure safe data
      achievements: (userLoyalty.achievements || ['welcome_member']).map(a => String(a || ''))
    };

    console.log('✅ Sending dashboard data with correct tier:', {
      totalOrders: responseData.customerMetrics.totalOrders,
      totalSpent: responseData.customerMetrics.totalSpent,
      storedTier: user.membershipTier,
      correctTier: correctTier,
      isMaxTier: nextTierProgress.isMaxTier
    });

    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('❌ Dashboard error details:', {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5), // Limit stack trace
      userId: req.user?._id,
      name: error.name,
      type: typeof error
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        name: error.name,
        userId: req.user?._id
      } : 'Something went wrong. Please try again.'
    });
  }
});

// @route   GET /api/loyalty/membership/progress  
// @desc    Get detailed membership progress and benefits (REAL DATA with YOUR JWT)
// @access  Private (Customer) - REQUIRES LOGIN
// @route   GET /api/loyalty/membership/progress  
// @desc    Get detailed membership progress and benefits (REAL DATA with YOUR JWT)
// @access  Private (Customer) - REQUIRES LOGIN
router.get('/membership/progress', auth, authorize('customer'), async (req, res) => {
  try {
    console.log('🔍 Membership progress endpoint hit for user:', req.user._id);
    
    const user = req.user;
    
    // GET REAL-TIME ORDER DATA
    const realOrderData = await getRealTimeOrderData(req.user._id);
    
    console.log('✅ Membership progress with real data:', {
      name: user.name,
      storedTier: user.membershipTier,
      storedOrders: user.orderCount,
      actualOrders: realOrderData.totalOrders,
      storedSpent: user.totalOrderValue,
      actualSpent: realOrderData.totalSpent
    });

    // FIXED: Calculate correct tier based on real spending data (same as dashboard)
    const correctTier = await calculateCorrectTier(realOrderData.totalOrders, realOrderData.totalSpent);
    
    // Update user's tier in database if it's incorrect
    if (user.membershipTier !== correctTier) {
      console.log(`🔄 Membership progress: Updating user tier: ${user.membershipTier} -> ${correctTier}`);
      await User.findByIdAndUpdate(req.user._id, { 
        membershipTier: correctTier,
        orderCount: realOrderData.totalOrders,
        totalOrderValue: realOrderData.totalSpent
      });
    }

    // Calculate real progress using CORRECT tier and REAL order data
    const nextTierProgress = await calculateNextTierProgress(user, realOrderData);

    const responseData = {
      currentTier: correctTier, // FIXED: Use correct tier instead of stored tier
      userStats: {
        totalOrders: realOrderData.totalOrders,
        totalSpent: realOrderData.totalSpent,
        averageOrderValue: realOrderData.averageOrderValue,
        lastOrderDate: realOrderData.lastOrderDate,
        aggreCoinsBalance: user.aggreCoins || 0
      },
      progress: nextTierProgress.isMaxTier ? null : {
        nextTier: nextTierProgress.nextTier,
        progress: {
          ordersProgress: Math.round((realOrderData.totalOrders / nextTierProgress.requirement.orders) * 100),
          spendingProgress: Math.round((realOrderData.totalSpent / nextTierProgress.requirement.spent) * 100),
          ordersNeeded: nextTierProgress.ordersNeeded,
          spendingNeeded: nextTierProgress.spendingNeeded
        }
      },
      tierBenefits: {
        silver: {
          benefits: [
            'Basic customer support',
            'Standard delivery speed',
            '1x AggreCoin multiplier',
            'Access to regular promotions'
          ]
        },
        gold: {
          benefits: [
            'Priority customer support', 
            'Faster delivery speed',
            '2x AggreCoin multiplier',
            'Exclusive gold member deals',
            'Free delivery on orders above ₹1000'
          ]
        },
        platinum: {
          benefits: [
            '24/7 VIP customer support',
            'Express delivery',
            '3x AggreCoin multiplier', 
            'Platinum exclusive deals',
            'Free delivery on all orders',
            'Early access to new products'
          ]
        }
      },
      requirements: {
        gold: { orders: 20, spent: 50000 },
        platinum: { orders: 50, spent: 200000 }
      }
    };

    console.log('✅ Sending membership progress with CORRECT tier:', {
      storedTier: user.membershipTier,
      correctTier: correctTier,
      totalOrders: responseData.userStats.totalOrders,
      totalSpent: responseData.userStats.totalSpent,
      isMaxTier: nextTierProgress.isMaxTier,
      progressMessage: nextTierProgress.isMaxTier ? 'Maximum tier achieved!' : `₹${nextTierProgress.spendingNeeded} more needed for ${nextTierProgress.nextTier}`
    });

    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('❌ Membership progress error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
// Helper functions
const getBenefitsForTier = async (tier) => {
  try {
    const config = await MembershipConfig.findOne({ tier, isActive: true });
    if (!config) {
      // Fallback to hardcoded benefits
      const benefits = {
        silver: ['Basic support', 'Standard delivery', '1x coin multiplier'],
        gold: ['Priority support', 'Faster delivery', '1.5x coin multiplier', 'Exclusive gold member deals'],
        platinum: ['24/7 VIP support', 'Express delivery', '2x coin multiplier', 'Platinum exclusive deals', 'Early access']
      };
      return benefits[tier] || benefits.silver;
    }

    const benefits = [
      `${config.benefits.discountPercentage}% discount on orders`,
      `Free delivery on orders above ₹${config.benefits.freeDeliveryThreshold.toLocaleString()}`,
      `${config.benefits.aggreCoinsMultiplier}x AggreCoins multiplier`
    ];

    if (config.benefits.prioritySupport) {
      benefits.push('Priority customer support');
    }
    if (config.benefits.exclusiveDeals) {
      benefits.push('Exclusive member deals');
    }
    if (config.benefits.earlyAccess) {
      benefits.push('Early access to new products');
    }

    return benefits;
  } catch (error) {
    console.error('Error getting benefits for tier:', error);
    return ['Basic membership benefits'];
  }
};

function getCoinMultiplier(tier) {
  const multipliers = { silver: 1.0, gold: 1.5, platinum: 2.0 };
  return multipliers[tier] || 1.0;
}

// @route   GET /api/loyalty/transactions
// @desc    Get user transactions with pagination
// @access  Private (Customer)
router.get('/transactions', auth, authorize('customer'), async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    const userLoyalty = await UserLoyalty.findOne({ user: req.user._id });
    
    if (!userLoyalty) {
      return res.json({
        success: true,
        data: {
          transactions: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0
          }
        }
      });
    }
    
    const allTransactions = userLoyalty.transactions || [];
    const total = allTransactions.length;
    const transactions = allTransactions
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(skip, skip + parseInt(limit));
    
    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('❌ Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
// Add this route after the existing transactions route (around line 535)

// @route   GET /api/loyalty/coupons
// @desc    Get user's available coupons
// @access  Private (Customer)
router.get('/coupons', auth, authorize('customer'), async (req, res) => {
  try {
    console.log('🔍 Getting user coupons for user:', req.user.id);

    // Get user's loyalty record
    const userLoyalty = await UserLoyalty.findOne({ 
      user: req.user.id 
    }).populate('coupons.couponProgram', 'name couponDetails validFrom validUntil');

    if (!userLoyalty) {
      return res.json({
        success: true,
        data: {
          availableCoupons: [],
          usedCoupons: []
        }
      });
    }

    // Separate available and used coupons
    const availableCoupons = [];
    const usedCoupons = [];

    (userLoyalty.coupons || []).forEach(coupon => {
      const couponData = {
        _id: coupon._id,
        couponProgram: coupon.couponProgram,
        awardedAt: coupon.awardedAt,
        reason: coupon.reason,
        used: coupon.used,
        usedAt: coupon.usedAt,
        discountApplied: coupon.discountApplied
      };

      if (coupon.used) {
        usedCoupons.push(couponData);
      } else {
        // Check if coupon is still valid
        const program = coupon.couponProgram;
        const now = new Date();
        
        if (program && (!program.validUntil || new Date(program.validUntil) >= now)) {
          availableCoupons.push(couponData);
        }
      }
    });

    res.json({
      success: true,
      data: {
        availableCoupons,
        usedCoupons
      }
    });

  } catch (error) {
    console.error('❌ Get user coupons error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user coupons',
      error: error.message
    });
  }
});
// @route   GET /api/loyalty/programs
// @desc    Get available loyalty programs for user
// @access  Private (Customer)
router.get('/programs', auth, authorize('customer'), async (req, res) => {
  try {
    const user = req.user;
    
    // Get active programs that user is eligible for
    const programs = await LoyaltyProgram.find({
      isActive: true,
      'conditions.validFrom': { $lte: new Date() },
      'conditions.validTill': { $gte: new Date() },
      $or: [
        { 'targetAudience.membershipTiers': { $size: 0 } }, // No tier restriction
        { 'targetAudience.membershipTiers': user.membershipTier }, // User's tier included
      ],
      $or: [
        { 'targetAudience.customerTypes': { $size: 0 } }, // No customer type restriction
        { 'targetAudience.customerTypes': user.customerType }, // User's type included
      ]
    }).select('name type description rewards conditions targetAudience');
    
    res.json({
      success: true,
      data: programs
    });
  } catch (error) {
    console.error('❌ Get programs error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/coins', auth, authorize('customer'), async (req, res) => {
  try {
    console.log('🔍 Getting user coins for user:', req.user.id);

    // Get both User and UserLoyalty data (same logic as dashboard)
    const user = await User.findById(req.user.id).select('aggreCoins');
    const userLoyalty = await UserLoyalty.findOne({ user: req.user.id });
    
    // Use the same logic as dashboard - prioritize UserLoyalty.aggreCoins.balance
    const availableCoins = Number(userLoyalty?.aggreCoins?.balance || user.aggreCoins || 0);
    
    console.log('🔍 Coins data:', {
      userAggreCoins: user.aggreCoins,
      userLoyaltyBalance: userLoyalty?.aggreCoins?.balance,
      finalAvailableCoins: availableCoins
    });
    
    res.json({
      success: true,
      data: {
        availableCoins: availableCoins
      }
    });

  } catch (error) {
    console.error('❌ Get user coins error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user coins',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
// @route   GET /api/loyalty/achievements
// @desc    Get user achievements and milestones
// @access  Private (Customer)
// Update the achievements endpoint around line 686
router.get('/achievements', auth, authorize('customer'), async (req, res) => {
  try {
    console.log('🔍 Achievements endpoint hit for user:', req.user._id);
    
    // Get real-time order data
    let realOrderData;
    try {
      realOrderData = await getRealTimeOrderData(req.user._id);
      console.log('✅ Real order data for achievements:', {
        userId: req.user._id,
        totalOrders: realOrderData.totalOrders,
        totalSpent: realOrderData.totalSpent
      });
    } catch (orderError) {
      console.error('Error getting order data for achievements:', orderError);
      realOrderData = {
        totalOrders: 0,
        totalSpent: 0
      };
    }

    // Get or create UserLoyalty record
    let userLoyalty = await UserLoyalty.findOne({ user: req.user._id });
    
    if (!userLoyalty) {
      console.log('No UserLoyalty record found, creating new one...');
      userLoyalty = new UserLoyalty({
        user: req.user._id,
        aggreCoins: { balance: 0, totalEarned: 0, totalRedeemed: 0 },
        transactions: [],
        referrals: [],
        milestones: [],
        achievements: ['welcome_member']
      });
      await userLoyalty.save();
    }

    // Check for new milestones based on real order data
    if (realOrderData.totalOrders > 0 || realOrderData.totalSpent > 0) {
      console.log('🎯 Checking milestones for:', {
        orderCount: realOrderData.totalOrders,
        totalValue: realOrderData.totalSpent,
        existingMilestones: userLoyalty.milestones.length
      });
      
      const newMilestones = await userLoyalty.checkMilestones(
        realOrderData.totalOrders, 
        realOrderData.totalSpent
      );
      
      if (newMilestones.length > 0) {
        console.log('🎉 New milestones awarded:', newMilestones);
        await userLoyalty.save();
      } else {
        console.log('No new milestones to award');
      }
    }
    
    const achievements = userLoyalty.achievements || ['welcome_member'];
    const milestones = userLoyalty.milestones || [];
    
    // Calculate achievement progress with real data
    const progress = {
      totalEarned: userLoyalty.aggreCoins?.totalEarned || 0,
      totalRedeemed: userLoyalty.aggreCoins?.totalRedeemed || 0,
      referralCount: userLoyalty.referrals?.length || 0,
      totalOrders: realOrderData.totalOrders,
      totalSpent: realOrderData.totalSpent
    };
    
    console.log('✅ Returning achievements data:', {
      achievementsCount: achievements.length,
      milestonesCount: milestones.length,
      progress
    });
    
    res.json({
      success: true,
      data: {
        achievements,
        milestones,
        progress
      }
    });
  } catch (error) {
    console.error('❌ Get achievements error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
// @route   POST /api/loyalty/redeem
// @desc    Redeem AggreCoins for cash value
// @access  Private (Customer)
router.post('/redeem', auth, authorize('customer'), [
  body('amount').isInt({ min: 100 }).withMessage('Minimum redemption is 100 coins'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }
    
    const { amount } = req.body;
    const user = req.user;
    
    // Get user loyalty record
    let userLoyalty = await UserLoyalty.findOne({ user: user._id });
    
    if (!userLoyalty || userLoyalty.aggreCoins.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient AggreCoins balance'
      });
    }
    
    // Calculate cash value (1 coin = ₹0.1)
    const cashValue = amount * 0.1;
    
    // Redeem coins
    userLoyalty.redeemCoins(amount, `Redeemed ${amount} coins for ₹${cashValue}`);
    await userLoyalty.save();
    
    // Update user's wallet balance (if you have a wallet system)
    // You might want to integrate with payment system here
    
    res.json({
      success: true,
      message: `Successfully redeemed ${amount} AggreCoins for ₹${cashValue}`,
      data: {
        coinsRedeemed: amount,
        cashValue,
        remainingBalance: userLoyalty.aggreCoins.balance
      }
    });
  } catch (error) {
    console.error('❌ Redeem coins error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/loyalty/refer
// @desc    Submit a referral
// @access  Private (Customer)
router.post('/refer', auth, authorize('customer'), [
  body('friendName').trim().isLength({ min: 2 }).withMessage('Friend name is required'),
  body('friendPhoneNumber').matches(/^[6-9]\d{9}$/).withMessage('Please enter a valid Indian phone number'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }
    
    const { friendName, friendPhoneNumber } = req.body;
    const user = req.user;
    
    // Get or create user loyalty record
    let userLoyalty = await UserLoyalty.findOne({ user: user._id });
    if (!userLoyalty) {
      userLoyalty = new UserLoyalty({ user: user._id });
    }
    
    // Generate referral code if not exists
    if (!userLoyalty.referralCode) {
      const name = user.name.replace(/\s+/g, '').toUpperCase().substring(0, 4);
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      userLoyalty.referralCode = `${name}${random}`;
    }
    
    // Add referral (you might want to implement SMS/email sending here)
    const referralData = {
      friendName,
      friendPhoneNumber,
      referralCode: userLoyalty.referralCode,
      status: 'pending'
    };
    
    // For now, just save the referral data
    userLoyalty.referrals.push({
      referralCode: userLoyalty.referralCode,
      status: 'pending',
      createdAt: new Date()
    });
    
    await userLoyalty.save();
    
    res.json({
      success: true,
      message: 'Referral sent successfully!',
      data: referralData
    });
  } catch (error) {
    console.error('❌ Refer friend error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/loyalty/referral-stats
// @desc    Get user's referral statistics
// @access  Private (Customer)
router.get('/referral-stats', auth, authorize('customer'), async (req, res) => {
  try {
    console.log('🔍 Referral stats endpoint hit for user:', req.user._id);
    
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    
    // Get or create user loyalty record with safe error handling
    let userLoyalty;
    try {
      userLoyalty = await UserLoyalty.findOne({ user: user._id });
    } catch (dbError) {
      console.error('Database error:', dbError);
      userLoyalty = null;
    }
    
    if (!userLoyalty) {
      // Return empty referral stats if no loyalty record
      return res.json({
        success: true,
        data: {
          totalReferrals: 0,
          completedReferrals: 0,
          pendingReferrals: 0,
          totalEarnings: 0,
          referralCode: `AGK${(user.customerId || '000000').slice(-6).toUpperCase()}`,
          recentReferrals: []
        }
      });
    }
    
    // Calculate referral statistics safely
    const referrals = userLoyalty.referrals || [];
    const completedReferrals = referrals.filter(r => r && r.status === 'completed');
    const pendingReferrals = referrals.filter(r => r && r.status === 'pending');
    const totalEarnings = completedReferrals.reduce((sum, r) => sum + Number(r.rewardEarned || 0), 0);
    
    // Generate referral code if not exists
    if (!userLoyalty.referralCode) {
      try {
        const name = (user.name || 'USER').replace(/\s+/g, '').toUpperCase().substring(0, 4);
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        userLoyalty.referralCode = `${name}${random}`;
        await userLoyalty.save();
      } catch (saveError) {
        console.error('Error saving referral code:', saveError);
      }
    }
    
    const referralStats = {
      totalReferrals: Number(referrals.length),
      completedReferrals: Number(completedReferrals.length),
      pendingReferrals: Number(pendingReferrals.length),
      totalEarnings: Number(totalEarnings),
      referralCode: String(userLoyalty.referralCode || `AGK${(user.customerId || '000000').slice(-6).toUpperCase()}`),
      recentReferrals: referrals
        .filter(r => r && r.createdAt)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)
        .map(referral => ({
          id: String(referral._id || ''),
          status: String(referral.status || 'pending'),
          rewardEarned: Number(referral.rewardEarned || 0),
          createdAt: referral.createdAt ? referral.createdAt.toISOString() : new Date().toISOString()
        }))
    };
    
    res.json({
      success: true,
      data: referralStats
    });
    
  } catch (error) {
    console.error('❌ Referral stats error:', {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3),
      userId: req.user?._id
    });
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
});

// @route   POST /api/loyalty/programs/:programId/join
// @desc    Join a loyalty program
// @access  Private (Customer)
router.post('/programs/:programId/join', auth, authorize('customer'), async (req, res, next) => {
  try {
    console.log('🔍 Join Program Request:', {
      userId: req.user._id,
      programId: req.params.programId
    });

    const { programId } = req.params;
    const userId = req.user._id;

    // Validate program ID
    if (!programId || !programId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid program ID format'
      });
    }

    // Find the loyalty program
    const program = await LoyaltyProgram.findById(programId);
    if (!program) {
      return res.status(404).json({
        success: false,
        message: 'Loyalty program not found'
      });
    }

    // Check if program is active and valid
    if (!program.isValid()) {
      return res.status(400).json({
        success: false,
        message: 'This loyalty program is not currently available'
      });
    }

    // Get user details to check eligibility
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user meets program criteria
    const eligibilityCheck = checkProgramEligibility(user, program);
    if (!eligibilityCheck.eligible) {
      return res.status(400).json({
        success: false,
        message: eligibilityCheck.reason
      });
    }

    // Get or create UserLoyalty record
    let userLoyalty = await UserLoyalty.findOne({ user: userId });
    if (!userLoyalty) {
      // Create new UserLoyalty record
      userLoyalty = new UserLoyalty({
        user: userId,
        aggreCoins: { balance: 0, totalEarned: 0, totalRedeemed: 0 },
        transactions: [],
        referrals: [],
        programUsage: [],
        milestones: []
      });
    }

    // Check if user is already enrolled in this program
    const existingEnrollment = userLoyalty.programUsage.find(
      p => p.program && p.program.toString() === programId
    );

    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        message: 'You are already enrolled in this loyalty program'
      });
    }

    // Add program to user's enrolled programs
    userLoyalty.programUsage.push({
      program: programId,
      usageCount: 0,
      lastUsed: null,
      totalSavings: 0,
      enrolledAt: new Date()
    });

    // Award welcome bonus if program has one
    if (program.rewards && program.rewards.value > 0 && program.type === 'referral') {
      const welcomeBonus = Math.min(program.rewards.value, 100); // Cap welcome bonus at 100 coins
      userLoyalty.addCoins(
        welcomeBonus,
        'bonus',
        `Welcome bonus for joining ${program.name}`,
        null,
        programId
      );

      console.log(`✅ Welcome bonus awarded: ${welcomeBonus} coins`);
    }

    // Save the UserLoyalty record
    await userLoyalty.save();

    // Update program usage count
    await LoyaltyProgram.findByIdAndUpdate(
      programId,
      { $inc: { usageCount: 1 } }
    );

    console.log('✅ User successfully joined loyalty program:', {
      userId,
      programId,
      programName: program.name
    });

    res.json({
      success: true,
      message: `Successfully joined ${program.name}!`,
      data: {
        program: {
          id: program._id,
          name: program.name,
          type: program.type,
          description: program.description
        },
        welcomeBonus: program.rewards && program.type === 'referral' ? Math.min(program.rewards.value, 100) : 0,
        enrolledAt: new Date()
      }
    });

  } catch (error) {
    console.error('❌ Join Program Error:', error);
    next(error);
  }
});

// Helper function to check program eligibility
function checkProgramEligibility(user, program) {
  // Check customer type eligibility
  if (program.targetAudience && program.targetAudience.customerTypes && program.targetAudience.customerTypes.length > 0) {
    const userCustomerType = user.customerType || 'others';
    if (!program.targetAudience.customerTypes.includes(userCustomerType)) {
      return {
        eligible: false,
        reason: `This program is not available for ${userCustomerType} customers`
      };
    }
  }

  // Check membership tier eligibility
  if (program.targetAudience && program.targetAudience.membershipTiers && program.targetAudience.membershipTiers.length > 0) {
    const userTier = user.membershipTier || 'silver';
    if (!program.targetAudience.membershipTiers.includes(userTier)) {
      return {
        eligible: false,
        reason: `This program requires ${program.targetAudience.membershipTiers.join(' or ')} membership tier`
      };
    }
  }

  // Check state/location eligibility
  if (program.targetAudience && program.targetAudience.states && program.targetAudience.states.length > 0) {
    const userState = user.state;
    if (!userState || !program.targetAudience.states.includes(userState)) {
      return {
        eligible: false,
        reason: `This program is not available in your state`
      };
    }
  }

  // Check minimum order value requirement
  if (program.conditions && program.conditions.minOrderValue > 0) {
    const userTotalSpent = user.totalOrderValue || 0;
    if (userTotalSpent < program.conditions.minOrderValue) {
      return {
        eligible: false,
        reason: `This program requires a minimum total spending of ₹${program.conditions.minOrderValue.toLocaleString()}`
      };
    }
  }

  return { eligible: true };
}

// @route   GET /api/loyalty/programs/:programId
// @desc    Get detailed information about a specific loyalty program
// @access  Private (Customer)
router.get('/programs/:programId', auth, authorize('customer'), async (req, res, next) => {
  try {
    const { programId } = req.params;
    const userId = req.user._id;

    // Find the program
    const program = await LoyaltyProgram.findById(programId)
      .populate('supplier', 'businessName companyName')
      .lean();

    if (!program) {
      return res.status(404).json({
        success: false,
        message: 'Loyalty program not found'
      });
    }

    // Check if user is already enrolled
    const userLoyalty = await UserLoyalty.findOne({ user: userId });
    const isEnrolled = userLoyalty ? userLoyalty.programUsage.some(
      p => p.program && p.program.toString() === programId
    ) : false;

    // Get user for eligibility check
    const user = await User.findById(userId);
    const eligibility = checkProgramEligibility(user, program);

    res.json({
      success: true,
      data: {
        ...program,
        isEnrolled,
        eligibility,
        isValid: program.isActive && new Date() >= program.conditions?.validFrom && new Date() <= program.conditions?.validTill
      }
    });

  } catch (error) {
    console.error('❌ Get Program Details Error:', error);
    next(error);
  }
});

// @route   GET /api/loyalty/my-programs
// @desc    Get user's enrolled programs
// @access  Private (Customer)
router.get('/my-programs', auth, authorize('customer'), async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Get user's loyalty record
    const userLoyalty = await UserLoyalty.findOne({ user: userId })
      .populate({
        path: 'programUsage.program',
        populate: {
          path: 'supplier',
          select: 'businessName companyName'
        }
      });

    if (!userLoyalty || !userLoyalty.programUsage.length) {
      return res.json({
        success: true,
        data: []
      });
    }

    // Format enrolled programs
    const enrolledPrograms = userLoyalty.programUsage
      .filter(usage => usage.program) // Filter out deleted programs
      .map(usage => ({
        id: usage.program._id,
        name: usage.program.name,
        type: usage.program.type,
        description: usage.program.description,
        supplier: usage.program.supplier,
        enrolledAt: usage.enrolledAt || usage.program.createdAt,
        usageCount: usage.usageCount,
        totalSavings: usage.totalSavings,
        lastUsed: usage.lastUsed,
        isActive: usage.program.isActive
      }));

    res.json({
      success: true,
      data: enrolledPrograms
    });

  } catch (error) {
    console.error('❌ Get My Programs Error:', error);
    next(error);
  }
});
// Add this route after the existing /coupons route (around line 700)
// REPLACE the existing coupon-suggestions route with this corrected version:

// Helper functions - MOVE THESE BEFORE THE ROUTE (around line 1370)
// Helper functions - PLACE THESE BEFORE ANY ROUTES THAT USE THEM
function checkCouponEligibility(program, user, cartTotal) {
  try {
    console.log(`🔍 Checking eligibility for ${program.name}:`, {
      minOrderAmount: program.couponDetails?.minOrderAmount,
      cartTotal,
      customerTypes: program.couponDetails?.customerTypes,
      userType: user.customerType,
      usageLimit: program.couponDetails?.usageLimit,
      usedCount: program.couponDetails?.usedCount
    });

    // Check minimum order value
    if (program.couponDetails?.minOrderAmount && cartTotal < program.couponDetails.minOrderAmount) {
      return { eligible: false, reason: `Minimum order value of ₹${program.couponDetails.minOrderAmount} required` };
    }

    // Check customer type eligibility
    if (program.couponDetails?.customerTypes?.length > 0 && 
        !program.couponDetails.customerTypes.includes(user.customerType)) {
      return { eligible: false, reason: 'Not eligible for your customer type' };
    }

    // Check usage limits
    if (program.couponDetails?.usageLimit && program.couponDetails.usedCount >= program.couponDetails.usageLimit) {
      return { eligible: false, reason: 'Coupon usage limit reached' };
    }

    return { eligible: true };
  } catch (error) {
    console.error('Error checking coupon eligibility:', error);
    return { eligible: false, reason: 'Error checking eligibility' };
  }
}

function calculatePotentialSavings(program, cartTotal) {
  try {
    let savings = 0;
    
    if (program.couponDetails?.discountType === 'percentage') {
      savings = (cartTotal * program.couponDetails.discountValue) / 100;
      if (program.couponDetails.maxDiscount) {
        savings = Math.min(savings, program.couponDetails.maxDiscount);
      }
    } else if (program.couponDetails?.discountType === 'fixed') {
      savings = program.couponDetails.discountValue;
    }

    return Math.round(savings);
  } catch (error) {
    console.error('Error calculating savings:', error);
    return 0;
  }
}

// @route   GET /api/loyalty/coupon-suggestions
// @desc    Get coupon suggestions for current cart
// @access  Private (Customer)
// @route   GET /api/loyalty/coupon-suggestions
// @desc    Get coupon suggestions for current cart - DEBUG VERSION
// @access  Private (Customer)
router.get('/coupon-suggestions', auth, authorize('customer'), async (req, res) => {
  console.log('🔍 === COUPON SUGGESTIONS DEBUG START ===');
  console.log('🔍 User ID:', req.user._id);
  console.log('🔍 User customerType:', req.user.customerType);
  
  try {
    // Step 1: Check cart
    const Cart = require('../models/Cart');
    const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    
    console.log('🛒 Cart Debug:', {
      hasCart: !!cart,
      itemsCount: cart?.items?.length || 0,
      cartTotal: cart?.totalAmount || 0,
      cartId: cart?._id
    });

    if (!cart || !cart.items?.length) {
      console.log('❌ No cart or no items - returning empty suggestions');
      return res.json({
        success: true,
        data: {
          suggestions: [],
          message: 'Add items to cart to see coupon suggestions',
          cartTotal: 0,
          totalSuggestions: 0,
          debug: {
            reason: 'No cart or empty cart',
            hasCart: !!cart,
            itemsCount: cart?.items?.length || 0
          }
        }
      });
    }

    const cartTotal = cart.totalAmount || 0;
    console.log('💰 Cart total for suggestions:', cartTotal);

    // Step 2: Check all loyalty programs
    const allPrograms = await LoyaltyProgram.find({});
    console.log('📊 ALL Programs in DB:', allPrograms.length);
    
    const couponPrograms = await LoyaltyProgram.find({ type: 'coupon' });
    console.log('🎫 Coupon type programs:', couponPrograms.length);
    
    const activePrograms = await LoyaltyProgram.find({ 
      type: 'coupon',
      isActive: true 
    });
    console.log('✅ Active coupon programs:', activePrograms.length);

    // Step 3: Check date filters
    const now = new Date();
    console.log('📅 Current date:', now);
    
    const validPrograms = await LoyaltyProgram.find({
      type: 'coupon',
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now }
    });
    
    console.log('📅 Date-valid programs:', validPrograms.length);
    
    // Log each program details
    validPrograms.forEach((program, index) => {
      console.log(`🎫 Program ${index + 1}:`, {
        id: program._id,
        name: program.name,
        code: program.couponDetails?.code,
        discountType: program.couponDetails?.discountType,
        discountValue: program.couponDetails?.discountValue,
        minOrderAmount: program.couponDetails?.minOrderAmount,
        maxDiscount: program.couponDetails?.maxDiscount,
        validFrom: program.validFrom,
        validUntil: program.validUntil,
        isActive: program.isActive,
        customerTypes: program.couponDetails?.customerTypes
      });
    });

    const suggestions = [];

    // Step 4: Check each valid program for eligibility
    validPrograms.forEach((program, index) => {
      console.log(`\n🔍 Checking program ${index + 1}: ${program.name}`);
      
      // Check minimum order value
      const minOrder = program.couponDetails?.minOrderAmount || 0;
      console.log(`   Min order: ₹${minOrder}, Cart: ₹${cartTotal}`);
      
      if (cartTotal >= minOrder) {
        console.log('   ✅ Minimum order value met');
        
        // Check customer type
        const allowedTypes = program.couponDetails?.customerTypes || [];
        console.log('   Allowed customer types:', allowedTypes);
        console.log('   User customer type:', req.user.customerType);
        
        if (allowedTypes.length === 0 || allowedTypes.includes(req.user.customerType)) {
          console.log('   ✅ Customer type eligible');
          
          // Calculate savings
          let savings = 0;
          if (program.couponDetails?.discountType === 'percentage') {
            savings = (cartTotal * program.couponDetails.discountValue) / 100;
            if (program.couponDetails.maxDiscount) {
              savings = Math.min(savings, program.couponDetails.maxDiscount);
            }
          } else if (program.couponDetails?.discountType === 'fixed') {
            savings = program.couponDetails.discountValue;
          }
          
          console.log('   💰 Calculated savings:', savings);
          
          if (savings > 0) {
            const suggestion = {
              type: 'available',
              coupon: {
                _id: program._id,
                code: program.couponDetails.code,
                name: program.name,
                description: program.description,
                discountType: program.couponDetails.discountType,
                discountValue: program.couponDetails.discountValue,
                maxDiscount: program.couponDetails.maxDiscount,
                minOrderValue: minOrder
              },
              savings: `₹${Math.round(savings)}`,
              priority: 2,
              message: `Save ₹${Math.round(savings)} with this coupon`,
              badge: '💫 Available'
            };
            
            suggestions.push(suggestion);
            console.log('   ✅ Added to suggestions!');
          } else {
            console.log('   ❌ No savings calculated');
          }
        } else {
          console.log('   ❌ Customer type not eligible');
        }
      } else {
        const needed = minOrder - cartTotal;
        console.log(`   ❌ Minimum order not met, need ₹${needed} more`);
        
        // Add as "almost eligible" if reasonable
        if (needed > 0 && needed <= cartTotal * 2) {
          const potentialSavings = program.couponDetails?.discountType === 'percentage'
            ? (minOrder * program.couponDetails.discountValue) / 100
            : program.couponDetails?.discountValue || 0;
            
          suggestions.push({
            type: 'almost_eligible',
            coupon: {
              _id: program._id,
              code: program.couponDetails.code,
              name: program.name,
              description: program.description,
              discountType: program.couponDetails.discountType,
              discountValue: program.couponDetails.discountValue,
              minOrderValue: minOrder
            },
            savings: `₹${Math.round(potentialSavings)}`,
            priority: 3,
            message: `Add ₹${Math.round(needed)} more to unlock this coupon`,
            badge: '🔓 Almost There',
            amountNeeded: Math.round(needed)
          });
          
          console.log('   ⚠️ Added as almost eligible');
        }
      }
    });

    console.log('📋 Final suggestions count:', suggestions.length);
    console.log('📋 Final suggestions:', suggestions);
    console.log('🔍 === COUPON SUGGESTIONS DEBUG END ===');

    res.json({
      success: true,
      data: {
        suggestions: suggestions,
        cartTotal,
        totalSuggestions: suggestions.length,
        debug: {
          totalPrograms: allPrograms.length,
          couponPrograms: couponPrograms.length,
          activePrograms: activePrograms.length,
          validPrograms: validPrograms.length,
          userCustomerType: req.user.customerType,
          cartHasItems: cart?.items?.length > 0
        }
      }
    });

  } catch (error) {
    console.error('❌ Coupon suggestions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coupon suggestions',
      error: error.message
    });
  }
});
// @route   GET /api/loyalty/test-coupons
// @desc    Simple test to check available coupons
// @access  Private (Customer)
router.get('/test-coupons', auth, authorize('customer'), async (req, res) => {
  try {
    console.log('🧪 TEST: Checking coupons for user:', req.user._id);
    
    // Check cart
    const Cart = require('../models/Cart');
    const cart = await Cart.findOne({ user: req.user._id });
    
    // Check all coupons
    const allCoupons = await LoyaltyProgram.find({});
    const activeCoupons = await LoyaltyProgram.find({ isActive: true });
    const couponType = await LoyaltyProgram.find({ type: 'coupon' });
    
    console.log('📊 Database stats:', {
      totalCoupons: allCoupons.length,
      activeCoupons: activeCoupons.length,
      couponTypePrograms: couponType.length,
      hasCart: !!cart,
      cartTotal: cart?.totalAmount || 0
    });

    res.json({
      success: true,
      data: {
        totalCoupons: allCoupons.length,
        activeCoupons: activeCoupons.length,
        couponTypePrograms: couponType.length,
        hasCart: !!cart,
        cartTotal: cart?.totalAmount || 0,
        sampleCoupon: activeCoupons[0] || null,
        userInfo: {
          id: req.user._id,
          customerType: req.user.customerType
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Test error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;