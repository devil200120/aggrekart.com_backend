const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const LoyaltyProgram = require('../models/LoyaltyProgram');
const UserLoyalty = require('../models/UserLoyalty');
const User = require('../models/User');
const { ErrorHandler } = require('../utils/errorHandler');
const router = express.Router();

// @route   GET /api/loyalty/my-coins
// @desc    Get user's loyalty coins and transactions
// @access  Private (Customer)
router.get('/my-coins', auth, authorize('customer'), async (req, res, next) => {
  try {
    let userLoyalty = await UserLoyalty.findOne({ user: req.user._id })
      .populate('transactions.order', 'orderId')
      .populate('transactions.program', 'name type');

    if (!userLoyalty) {
      userLoyalty = new UserLoyalty({
        user: req.user._id,
        aggreCoins: { balance: 0, totalEarned: 0, totalRedeemed: 0 },
        transactions: []
      });
      await userLoyalty.save();
    }

    // Expire old coins
    const expiredCoins = userLoyalty.expireOldCoins();
    if (expiredCoins > 0) {
      await userLoyalty.save();
    }

    // Get recent transactions (last 20)
    const recentTransactions = userLoyalty.transactions
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20);

    res.json({
      success: true,
      data: {
        balance: userLoyalty.aggreCoins.balance,
        totalEarned: userLoyalty.aggreCoins.totalEarned,
        totalRedeemed: userLoyalty.aggreCoins.totalRedeemed,
        referralCode: userLoyalty.referralCode,
        recentTransactions,
        milestones: userLoyalty.milestones
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/loyalty/redeem
// @desc    Redeem loyalty coins
// @access  Private (Customer)
router.post('/redeem', auth, authorize('customer'), [
  body('amount').isInt({ min: 100 }).withMessage('Minimum redemption amount is 100 coins'),
  body('orderId').optional().isMongoId().withMessage('Valid order ID required if redeeming for order')
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

    const { amount, orderId } = req.body;

    const userLoyalty = await UserLoyalty.findOne({ user: req.user._id });
    if (!userLoyalty) {
      return next(new ErrorHandler('Loyalty account not found', 404));
    }

    if (userLoyalty.aggreCoins.balance < amount) {
      return next(new ErrorHandler('Insufficient coin balance', 400));
    }

    // Redeem coins
    const description = orderId 
      ? `Redeemed for order discount`
      : `Redeemed to wallet/cashback`;

    userLoyalty.redeemCoins(amount, description, orderId);
    await userLoyalty.save();

    // In real implementation, process the redemption
    // (add to wallet, apply discount to order, etc.)

    res.json({
      success: true,
      message: 'Coins redeemed successfully',
      data: {
        redeemedAmount: amount,
        newBalance: userLoyalty.aggreCoins.balance,
        cashValue: amount * 0.1 // 1 coin = ₹0.10
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/loyalty/refer
// @desc    Send referral to friend
// @access  Private (Customer)
router.post('/refer', auth, authorize('customer'), [
  body('friendPhoneNumber').matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid phone number'),
  body('friendName').optional().trim().isLength({ min: 2 }).withMessage('Friend name must be at least 2 characters')
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

    const { friendPhoneNumber, friendName } = req.body;

    // Check if friend is already a user
    const existingUser = await User.findOne({ phoneNumber: friendPhoneNumber });
    if (existingUser) {
      return next(new ErrorHandler('This phone number is already registered', 400));
    }

    let userLoyalty = await UserLoyalty.findOne({ user: req.user._id });
    if (!userLoyalty) {
      userLoyalty = new UserLoyalty({ user: req.user._id });
      await userLoyalty.save();
    }

    // Check referral limit
    const activeReferrals = userLoyalty.referrals.filter(r => 
      r.createdAt > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
    );

    if (activeReferrals.length >= 10) {
      return next(new ErrorHandler('Monthly referral limit reached (10)', 400));
    }

    // Send referral SMS
    const referralMessage = `${req.user.name} invited you to join Aggrekart - Construction Materials at your doorstep! Use code ${userLoyalty.referralCode} during registration to get ₹100 bonus. Download: [App Link]`;
    
    try {
      await sendSMS(friendPhoneNumber, referralMessage);
    } catch (error) {
      return next(new ErrorHandler('Failed to send referral SMS', 500));
    }

    res.json({
      success: true,
      message: 'Referral sent successfully',
      data: {
        referralCode: userLoyalty.referralCode,
        friendPhoneNumber,
        message: 'Your friend will receive bonus coins when they register and place their first order'
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/loyalty/programs
// @desc    Get available loyalty programs for user
// @access  Private (Customer)
router.get('/programs', auth, authorize('customer'), async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const now = new Date();

    // Get applicable programs
    const programs = await LoyaltyProgram.find({
      isActive: true,
      'conditions.validFrom': { $lte: now },
      'conditions.validTill': { $gte: now },
      $or: [
        { scope: 'platform' },
        { 
          scope: 'state',
          'targetAudience.states': { $in: user.addresses.map(addr => addr.state) }
        },
        {
          scope: 'category',
          // Will be filtered by category when browsing products
        }
      ]
    });

    // Filter programs based on user eligibility
    const eligiblePrograms = programs.filter(program => 
      program.isUserEligible(user, 0, null) // Basic eligibility check
    );

    res.json({
      success: true,
      data: {
        programs: eligiblePrograms.map(program => ({
          programId: program.programId,
          name: program.name,
          type: program.type,
          description: program.description,
          rewards: program.rewards,
          conditions: program.conditions,
          scope: program.scope
        })),
        userInfo: {
          membershipTier: user.membershipTier,
          customerType: user.customerType,
          orderCount: user.orderCount
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/loyalty/programs
// @desc    Create loyalty program (Supplier/Admin)
// @access  Private (Supplier/Admin)
router.post('/programs', auth, authorize('supplier', 'admin'), [
  body('name').trim().isLength({ min: 3 }).withMessage('Program name must be at least 3 characters'),
  body('type').isIn(['referral', 'purchase', 'milestone', 'seasonal', 'category_specific']).withMessage('Invalid program type'),
  body('conditions.validTill').isISO8601().withMessage('Valid end date required'),
  body('rewards.type').isIn(['percentage', 'fixed_amount', 'coins', 'free_delivery', 'cashback']).withMessage('Invalid reward type'),
  body('rewards.value').isFloat({ min: 0 }).withMessage('Reward value must be positive')
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

    const programData = req.body;

    // Set scope and supplier
    if (req.user.role === 'supplier') {
      const supplier = await Supplier.findOne({ user: req.user._id });
      if (!supplier) {
        return next(new ErrorHandler('Supplier profile not found', 404));
      }
      programData.supplier = supplier._id;
      programData.scope = 'supplier';
    } else {
      programData.scope = programData.scope || 'platform';
    }

    programData.createdBy = req.user._id;

    const program = new LoyaltyProgram(programData);
    await program.save();

    res.status(201).json({
      success: true,
      message: 'Loyalty program created successfully',
      data: { program }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/loyalty/referral-stats
// @desc    Get referral statistics
// @access  Private (Customer)
router.get('/referral-stats', auth, authorize('customer'), async (req, res, next) => {
  try {
    const userLoyalty = await UserLoyalty.findOne({ user: req.user._id })
      .populate('referrals.referredUser', 'name createdAt');

    if (!userLoyalty) {
      return res.json({
        success: true,
        data: {
          referralCode: null,
          totalReferrals: 0,
          completedReferrals: 0,
          totalEarnings: 0,
          referrals: []
        }
      });
    }

    const stats = {
      referralCode: userLoyalty.referralCode,
      totalReferrals: userLoyalty.referrals.length,
      completedReferrals: userLoyalty.referrals.filter(r => r.status === 'completed').length,
      totalEarnings: userLoyalty.referrals.reduce((sum, r) => sum + r.rewardEarned, 0),
      referrals: userLoyalty.referrals.map(r => ({
        friendName: r.referredUser?.name || 'Friend',
        status: r.status,
        rewardEarned: r.rewardEarned,
        referredAt: r.createdAt
      }))
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/loyalty/apply-referral
// @desc    Apply referral code during registration
// @access  Public
router.post('/apply-referral', [
  body('referralCode').trim().isLength({ min: 4, max: 10 }).withMessage('Invalid referral code'),
  body('newUserId').isMongoId().withMessage('Valid user ID required')
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

    const { referralCode, newUserId } = req.body;

    // Find referrer
    const referrerLoyalty = await UserLoyalty.findOne({ referralCode });
    if (!referrerLoyalty) {
      return next(new ErrorHandler('Invalid referral code', 400));
    }

    // Check if new user already used a referral
    const newUserLoyalty = await UserLoyalty.findOne({ user: newUserId });
    if (newUserLoyalty && newUserLoyalty.referredBy.user) {
      return next(new ErrorHandler('User has already used a referral code', 400));
    }

    // Create or update new user loyalty
    let loyaltyAccount = newUserLoyalty || new UserLoyalty({ user: newUserId });
    
    loyaltyAccount.referredBy = {
      user: referrerLoyalty.user,
      code: referralCode
    };

    // Give welcome bonus to new user
    loyaltyAccount.addCoins(100, 'bonus', 'Welcome bonus for using referral code');
    
    await loyaltyAccount.save();

    // Add to referrer's referral list
    referrerLoyalty.addReferral(newUserId, referralCode);
    await referrerLoyalty.save();

    res.json({
      success: true,
      message: 'Referral applied successfully',
      data: {
        welcomeBonus: 100,
        message: 'You received 100 Aggre Coins as welcome bonus!'
      }
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;