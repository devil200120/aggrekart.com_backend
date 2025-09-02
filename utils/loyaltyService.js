const User = require('../models/User');
const UserLoyalty = require('../models/UserLoyalty');
const LoyaltyProgram = require('../models/LoyaltyProgram');
const Order = require('../models/Order');
const mongoose = require('mongoose');

/**
 * MEMBERSHIP TIER SYSTEM
 * Based on requirements: Silver (5-19), Gold (20-50), Platinum (>50)
 * Enhanced with spending thresholds
 */
const MEMBERSHIP_TIERS = {
  silver: {
    minOrders: 0,
    maxOrders: 19,
    minSpending: 0,
    maxSpending: 49999,
    coinMultiplier: 1.0,
    benefits: ['Basic support', 'Standard delivery']
  },
  gold: {
    minOrders: 20,
    maxOrders: 50,
    minSpending: 50000,
    maxSpending: 199999,
    coinMultiplier: 1.5,
    benefits: ['Priority support', 'Faster delivery', '5% extra discount']
  },
  platinum: {
    minOrders: 51,
    maxOrders: Infinity,
    minSpending: 200000,
    maxSpending: Infinity,
    coinMultiplier: 2.0,
    benefits: ['VIP support', 'Express delivery', '10% extra discount', 'Exclusive offers']
  }
};

/**
 * CUSTOMER TYPE SPECIFIC BENEFITS
 * Based on requirements: House Owner, Mason, Builder/Contractor, Others
 */
const CUSTOMER_TYPE_BENEFITS = {
  house_owner: {
    coinMultiplier: 1.0,
    specialOffers: ['weekend_discounts', 'home_improvement_deals'],
    description: 'Standard rates with home-focused promotions'
  },
  mason: {
    coinMultiplier: 1.2,
    specialOffers: ['bulk_discounts', 'tool_promotions', 'skill_based_rewards'],
    extraDiscount: 5, // 5% extra discount
    description: '5% extra discount + bulk order bonuses'
  },
  builder_contractor: {
    coinMultiplier: 1.3,
    specialOffers: ['volume_discounts', 'project_based_deals', 'priority_delivery'],
    extraDiscount: 10, // 10% volume discount
    description: '10% volume discounts + priority support'
  },
  others: {
    coinMultiplier: 1.1,
    specialOffers: ['referral_bonuses', 'general_promotions'],
    description: 'Standard with referral bonuses'
  }
};

/**
 * Calculate AggreCoins based on order value, membership tier, and customer type
 */
const calculateAggreCoins = (orderValue, membershipTier, customerType) => {
  const baseEarningRate = 0.01; // 1% base rate
  
  // Get tier and customer type multipliers
  const tierMultiplier = MEMBERSHIP_TIERS[membershipTier?.toLowerCase()]?.coinMultiplier || 1.0;
  const customerMultiplier = CUSTOMER_TYPE_BENEFITS[customerType]?.coinMultiplier || 1.0;
  
  // Calculate final coins
  const totalMultiplier = tierMultiplier * customerMultiplier;
  const coinsEarned = Math.floor(orderValue * baseEarningRate * totalMultiplier);
  
  return {
    coinsEarned,
    breakdown: {
      baseAmount: Math.floor(orderValue * baseEarningRate),
      tierMultiplier,
      customerMultiplier,
      totalMultiplier
    }
  };
};

/**
 * Award AggreCoins for order completion
 */
const awardOrderCompletionCoins = async (orderId, userId, orderValue) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get or create user loyalty record
    let userLoyalty = await UserLoyalty.findOne({ user: userId });
    if (!userLoyalty) {
      userLoyalty = new UserLoyalty({
        user: userId,
        aggreCoins: 0,
        totalEarned: 0,
        totalRedeemed: 0,
        membershipTier: user.membershipTier || 'silver',
        referralCode: generateReferralCode(user.customerId)
      });
    }

    // Check for duplicate awards
    const existingTransaction = userLoyalty.coinTransactions.find(
      transaction => transaction.orderId && transaction.orderId.toString() === orderId.toString()
    );
    
    if (existingTransaction) {
      return {
        success: false,
        message: 'Coins already awarded for this order'
      };
    }

    // Calculate coins with enhanced logic
    const coinCalculation = calculateAggreCoins(orderValue, user.membershipTier, user.customerType);
    const coinsToAward = coinCalculation.coinsEarned;

    // Award coins
    userLoyalty.aggreCoins += coinsToAward;
    userLoyalty.totalEarned += coinsToAward;
    
    // Add transaction record
    userLoyalty.coinTransactions.push({
      type: 'earned',
      amount: coinsToAward,
      description: `Order completion - ${user.customerType} bonus`,
      orderId: orderId,
      transactionDate: new Date(),
      metadata: {
        orderValue,
        coinCalculation: coinCalculation.breakdown
      }
    });

    await userLoyalty.save();

    // Update user stats and check tier upgrade
    await updateUserOrderStats(userId);
    const tierUpgrade = await checkMembershipTierUpgrade(userId);

    return {
      success: true,
      message: `Awarded ${coinsToAward} AggreCoins`,
      coinsAwarded: coinsToAward,
      currentBalance: userLoyalty.aggreCoins,
      breakdown: coinCalculation.breakdown,
      tierUpgrade
    };

  } catch (error) {
    console.error('Error awarding order completion coins:', error);
    return {
      success: false,
      message: 'Failed to award coins',
      error: error.message
    };
  }
};

/**
 * Check and upgrade membership tier based on requirements
 */
const checkMembershipTierUpgrade = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) return { upgraded: false };

    const currentTier = user.membershipTier || 'silver';
    
    // Get user's order statistics
    const completedOrders = await Order.countDocuments({
      customer: userId,
      status: 'delivered'
    });

    const totalSpending = await Order.aggregate([
      { $match: { customer: new mongoose.Types.ObjectId(userId), status: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    const spending = totalSpending[0]?.total || 0;

    // Determine new tier based on requirements
    let newTier = 'silver';
    
    if (completedOrders >= 51 && spending >= 200000) {
      newTier = 'platinum';
    } else if (completedOrders >= 20 && spending >= 50000) {
      newTier = 'gold';
    } else if (completedOrders >= 5) {
      newTier = 'silver';
    }

    if (newTier !== currentTier) {
      // Update user membership
      user.membershipTier = newTier;
      await user.save();

      // Update loyalty record
      await UserLoyalty.findOneAndUpdate(
        { user: userId },
        { membershipTier: newTier }
      );

      return {
        upgraded: true,
        previousTier: currentTier,
        newTier: newTier,
        message: `🎉 Congratulations! You've been upgraded to ${newTier.toUpperCase()} membership!`,
        benefits: MEMBERSHIP_TIERS[newTier].benefits
      };
    }

    return { upgraded: false };
    
  } catch (error) {
    console.error('Error checking tier upgrade:', error);
    return { upgraded: false };
  }
};

/**
 * Handle referral system
 */
const processReferral = async (referrerCode, newUserId) => {
  try {
    // Find referrer by code
    const referrerLoyalty = await UserLoyalty.findOne({ referralCode: referrerCode });
    if (!referrerLoyalty) {
      return { success: false, message: 'Invalid referral code' };
    }

    // Check if new user already referred
    const existingReferral = referrerLoyalty.referrals.find(
      r => r.referredUser.toString() === newUserId.toString()
    );

    if (existingReferral) {
      return { success: false, message: 'User already referred' };
    }

    // Award referral bonus (configurable)
    const referralBonus = 100; // Base referral bonus
    
    // Add referral record
    referrerLoyalty.referrals.push({
      referredUser: newUserId,
      referralDate: new Date(),
      bonusAwarded: referralBonus,
      status: 'completed'
    });

    // Award coins
    referrerLoyalty.aggreCoins += referralBonus;
    referrerLoyalty.totalEarned += referralBonus;

    // Add transaction
    referrerLoyalty.coinTransactions.push({
      type: 'earned',
      amount: referralBonus,
      description: 'Referral bonus',
      transactionDate: new Date()
    });

    await referrerLoyalty.save();

    return {
      success: true,
      message: `Referral bonus of ${referralBonus} AggreCoins awarded`,
      bonusAwarded: referralBonus
    };

  } catch (error) {
    console.error('Error processing referral:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Redeem AggreCoins for discount
 */
const redeemCoins = async (userId, coinsToRedeem, orderId = null) => {
  try {
    const userLoyalty = await UserLoyalty.findOne({ user: userId });
    if (!userLoyalty) {
      return { success: false, message: 'User loyalty record not found' };
    }

    if (userLoyalty.aggreCoins < coinsToRedeem) {
      return { 
        success: false, 
        message: `Insufficient coins. Available: ${userLoyalty.aggreCoins}` 
      };
    }

    // Redeem coins (1 coin = ₹1 discount)
    const discountAmount = coinsToRedeem;
    
    userLoyalty.aggreCoins -= coinsToRedeem;
    userLoyalty.totalRedeemed += coinsToRedeem;

    // Add transaction record
    userLoyalty.coinTransactions.push({
      type: 'redeemed',
      amount: coinsToRedeem,
      description: `Redeemed for ₹${discountAmount} discount`,
      orderId: orderId,
      transactionDate: new Date()
    });

    await userLoyalty.save();

    return {
      success: true,
      message: `Redeemed ${coinsToRedeem} coins for ₹${discountAmount} discount`,
      discountAmount,
      remainingBalance: userLoyalty.aggreCoins
    };

  } catch (error) {
    console.error('Error redeeming coins:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get customer-specific offers based on type and location
 */
const getCustomerSpecificOffers = async (userId, location = null) => {
  try {
    const user = await User.findById(userId);
    if (!user) return [];

    const userLoyalty = await UserLoyalty.findOne({ user: userId });
    const membershipTier = user.membershipTier || 'silver';
    const customerType = user.customerType;

    // Get active loyalty programs
    const activePrograms = await LoyaltyProgram.find({
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
      $or: [
        { targetCustomerTypes: customerType },
        { targetCustomerTypes: { $in: ['all'] } },
        { targetMembershipTiers: membershipTier }
      ]
    }).populate('supplier', 'name');

    // Filter by location if provided
    let filteredPrograms = activePrograms;
    if (location && location.state) {
      filteredPrograms = activePrograms.filter(program => 
        !program.locationRestrictions.states.length || 
        program.locationRestrictions.states.includes(location.state)
      );
    }

    return filteredPrograms.map(program => ({
      id: program._id,
      title: program.title,
      description: program.description,
      discountType: program.discountType,
      discountValue: program.discountValue,
      minOrderValue: program.minOrderValue,
      maxUsagePerUser: program.maxUsagePerUser,
      supplier: program.supplier?.name,
      validUntil: program.endDate,
      customerSpecific: CUSTOMER_TYPE_BENEFITS[customerType]?.description
    }));

  } catch (error) {
    console.error('Error getting customer offers:', error);
    return [];
  }
};

/**
 * Utility functions
 */
const generateReferralCode = (customerId) => {
  return `AGK${customerId.slice(-6).toUpperCase()}`;
};

const updateUserOrderStats = async (userId) => {
  try {
    const completedOrders = await Order.countDocuments({
      customer: userId,
      status: 'delivered'
    });

    const totalValue = await Order.aggregate([
      { $match: { customer: new mongoose.Types.ObjectId(userId), status: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    await User.findByIdAndUpdate(userId, {
      orderCount: completedOrders,
      totalOrderValue: totalValue[0]?.total || 0
    });

  } catch (error) {
    console.error('Error updating user stats:', error);
  }
};

module.exports = {
  calculateAggreCoins,
  awardOrderCompletionCoins,
  checkMembershipTierUpgrade,
  processReferral,
  redeemCoins,
  getCustomerSpecificOffers,
  MEMBERSHIP_TIERS,
  CUSTOMER_TYPE_BENEFITS
};