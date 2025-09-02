const express = require('express');
const { auth, authorize } = require('../middleware/auth');
const { query, body, validationResult } = require('express-validator');
const LoyaltyProgram = require('../models/LoyaltyProgram');
const SupplierPromotion = require('../models/SupplierPromotion');  // ADD THIS LINE
const Supplier = require('../models/Supplier');  // ADD THIS LINE
const User = require('../models/User');
const UserLoyalty = require('../models/UserLoyalty');
const loyaltyService = require('../utils/loyaltyService');
const { ErrorHandler } = require('../utils/errorHandler');
const router = express.Router();

// @route   GET /api/customer-promotions/personalized
// @desc    Get personalized promotions for logged-in customer
// @access  Private (Customer)
router.get('/personalized', auth, authorize('customer'), async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const userLocation = user.addresses?.[0]; // Get primary address

    // Get customer-specific offers
    const personalizedOffers = await loyaltyService.getCustomerSpecificOffers(
      req.user._id,
      userLocation
    );

    // Get special promotions for customer type
    const customerTypePromotions = await LoyaltyProgram.find({
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
      $or: [
        { targetCustomerTypes: user.customerType },
        { targetCustomerTypes: 'all' }
      ]
    })
    .populate('supplier', 'businessName')
    .sort({ createdAt: -1 });

    // Filter by location if available
    let locationFilteredPromotions = customerTypePromotions;
    if (userLocation?.state) {
      locationFilteredPromotions = customerTypePromotions.filter(promo => 
        !promo.locationRestrictions?.states?.length || 
        promo.locationRestrictions.states.includes(userLocation.state)
      );
    }

    // Get membership tier specific benefits
    const membershipBenefits = loyaltyService.MEMBERSHIP_TIERS[user.membershipTier || 'silver'];
    const customerTypeBenefits = loyaltyService.CUSTOMER_TYPE_BENEFITS[user.customerType];

    res.json({
      success: true,
      data: {
        personalizedOffers,
        customerTypePromotions: locationFilteredPromotions,
        membershipBenefits: {
          tier: user.membershipTier || 'silver',
          benefits: membershipBenefits.benefits,
          coinMultiplier: membershipBenefits.coinMultiplier
        },
        customerTypeBenefits: {
          type: user.customerType,
          description: customerTypeBenefits?.description,
          extraDiscount: customerTypeBenefits?.extraDiscount || 0,
          coinMultiplier: customerTypeBenefits?.coinMultiplier || 1.0
        },
        location: {
          state: userLocation?.state,
          city: userLocation?.city
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/customer-promotions/by-type/:customerType
// @desc    Get promotions visible to specific customer type (for demo/admin purposes)
// @access  Private (Admin)
router.get('/by-type/:customerType', auth, authorize('admin'), async (req, res, next) => {
  try {
    const { customerType } = req.params;
    const { state } = req.query;

    const validCustomerTypes = ['house_owner', 'mason', 'builder_contractor', 'others'];
    if (!validCustomerTypes.includes(customerType)) {
      return next(new ErrorHandler('Invalid customer type', 400));
    }

    let query = {
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
      $or: [
        { targetCustomerTypes: customerType },
        { targetCustomerTypes: 'all' }
      ]
    };

    // Filter by state if provided
    if (state) {
      query.$or.push(
        { 'locationRestrictions.states': { $size: 0 } },
        { 'locationRestrictions.states': state }
      );
    }

    const promotions = await LoyaltyProgram.find(query)
      .populate('supplier', 'businessName address')
      .sort({ createdAt: -1 });

    const customerTypeBenefits = loyaltyService.CUSTOMER_TYPE_BENEFITS[customerType];

    res.json({
      success: true,
      data: {
        promotions,
        customerType,
        benefits: customerTypeBenefits,
        totalPromotions: promotions.length
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/customer-promotions/mason-exclusive
// @desc    Get exclusive promotions for masons (example implementation)
// @access  Private (Customer - Mason only)
router.get('/mason-exclusive', auth, authorize('customer'), async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    // Check if user is a mason
    if (user.customerType !== 'mason') {
      return next(new ErrorHandler('Access denied. This endpoint is for masons only.', 403));
    }

    const masonPromotions = await LoyaltyProgram.find({
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
      targetCustomerTypes: 'mason'
    })
    .populate('supplier', 'businessName')
    .sort({ discountValue: -1 }); // Sort by highest discount first

    // Add mason-specific benefits info
    const masonBenefits = loyaltyService.CUSTOMER_TYPE_BENEFITS.mason;

    res.json({
      success: true,
      data: {
        exclusivePromotions: masonPromotions,
        masonBenefits: {
          description: masonBenefits.description,
          extraDiscount: masonBenefits.extraDiscount,
          coinMultiplier: masonBenefits.coinMultiplier,
          specialOffers: masonBenefits.specialOffers
        },
        message: "🔨 Exclusive deals for skilled masons! Get extra discounts and bulk order bonuses."
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/customer-promotions/builder-exclusive
// @desc    Get exclusive promotions for builders/contractors
// @access  Private (Customer - Builder/Contractor only)
router.get('/builder-exclusive', auth, authorize('customer'), async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    // Check if user is a builder/contractor
    if (user.customerType !== 'builder_contractor') {
      return next(new ErrorHandler('Access denied. This endpoint is for builders/contractors only.', 403));
    }

    const builderPromotions = await LoyaltyProgram.find({
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
      targetCustomerTypes: 'builder_contractor'
    })
    .populate('supplier', 'businessName')
    .sort({ minOrderValue: 1 }); // Sort by lowest minimum order first

    const builderBenefits = loyaltyService.CUSTOMER_TYPE_BENEFITS.builder_contractor;

    res.json({
      success: true,
      data: {
        exclusivePromotions: builderPromotions,
        builderBenefits: {
          description: builderBenefits.description,
          extraDiscount: builderBenefits.extraDiscount,
          coinMultiplier: builderBenefits.coinMultiplier,
          specialOffers: builderBenefits.specialOffers
        },
        message: "🏗️ Premium benefits for builders & contractors! Volume discounts and priority support."
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/customer-promotions/apply
// @desc    Apply a promotion/coupon code
// @access  Private (Customer)
router.post('/apply', auth, authorize('customer'), [
  body('promotionId').optional().isMongoId().withMessage('Valid promotion ID required'),
  body('couponCode').optional().notEmpty().withMessage('Coupon code cannot be empty'),
  body('orderValue').isNumeric().withMessage('Order value is required')
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

    const { promotionId, couponCode, orderValue } = req.body;
    const user = await User.findById(req.user._id);

    let promotion;

    // Find promotion by ID or coupon code
    if (promotionId) {
      promotion = await LoyaltyProgram.findById(promotionId);
    } else if (couponCode) {
      promotion = await LoyaltyProgram.findOne({ 
        couponCode: couponCode.toUpperCase(),
        isActive: true
      });
    }

    if (!promotion) {
      return next(new ErrorHandler('Invalid promotion or coupon code', 404));
    }

    // Validate promotion eligibility
    const eligibilityCheck = validatePromotionEligibility(promotion, user, orderValue);
    if (!eligibilityCheck.isEligible) {
      return res.status(400).json({
        success: false,
        message: eligibilityCheck.reason
      });
    }

    // Calculate discount
    let discountAmount = 0;
    if (promotion.discountType === 'percentage') {
      discountAmount = (orderValue * promotion.discountValue) / 100;
    } else if (promotion.discountType === 'fixed') {
      discountAmount = promotion.discountValue;
    }

    // Apply maximum discount limit if exists
    if (promotion.maxDiscountAmount && discountAmount > promotion.maxDiscountAmount) {
      discountAmount = promotion.maxDiscountAmount;
    }

    res.json({
      success: true,
      data: {
        promotion: {
          id: promotion._id,
          title: promotion.title,
          discountType: promotion.discountType,
          discountValue: promotion.discountValue
        },
        discountAmount,
        finalAmount: orderValue - discountAmount,
        message: `Promotion applied successfully! You saved ₹${discountAmount}`
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/customer-promotions/supplier-promotions
// @desc    Get approved supplier promotions for customers
// @access  Private (Customer)
router.get('/supplier-promotions', auth, authorize('customer'), async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const userLocation = user.addresses?.[0]; // Get primary address

    console.log(`🔍 Fetching supplier promotions for customer: ${user.customerType}, location: ${userLocation?.state}`);

    // Build query for approved supplier promotions
    const query = {
      status: 'active',
      isActive: true,
      'validity.startDate': { $lte: new Date() },
      'validity.endDate': { $gte: new Date() }
    };

    // Get all active supplier promotions
    let supplierPromotions = await SupplierPromotion.find(query)
      .populate({
        path: 'supplier',
        select: 'companyName state city contactInfo businessLicense isApproved',
        match: { isApproved: true } // Only get promotions from approved suppliers
      })
      .sort({ 'benefits.discountValue': -1, createdAt: -1 })
      .limit(100)
      .lean();

    // Filter out promotions where supplier is null (not approved)
    supplierPromotions = supplierPromotions.filter(promotion => promotion.supplier);

    console.log(`📊 Found ${supplierPromotions.length} active supplier promotions from approved suppliers`);

    // Filter by customer eligibility
    const eligiblePromotions = supplierPromotions.filter(promotion => {
      // Check customer type targeting (if empty array, means all customers)
      if (promotion.targeting?.customerTypes?.length > 0) {
        if (!promotion.targeting.customerTypes.includes(user.customerType)) {
          return false;
        }
      }

      // Check membership tier targeting (if empty array, means all tiers)  
      if (promotion.targeting?.membershipTiers?.length > 0) {
        const userTier = user.membershipTier || 'silver';
        if (!promotion.targeting.membershipTiers.includes(userTier)) {
          return false;
        }
      }

      // Check location targeting (if empty arrays, means all locations)
      if (promotion.targeting?.locations?.states?.length > 0) {
        if (!userLocation?.state || !promotion.targeting.locations.states.includes(userLocation.state)) {
          return false;
        }
      }

      if (promotion.targeting?.locations?.cities?.length > 0) {
        if (!userLocation?.city || !promotion.targeting.locations.cities.includes(userLocation.city)) {
          return false;
        }
      }

      // Check new/returning customer targeting
      const userOrderCount = user.orderCount || 0;
      if (promotion.targeting?.newCustomersOnly && userOrderCount > 0) {
        return false;
      }
      if (promotion.targeting?.returningCustomersOnly && userOrderCount === 0) {
        return false;
      }

      return true;
    });

    console.log(`✅ Found ${eligiblePromotions.length} eligible promotions for customer`);

    // Format promotions for frontend
    const formattedPromotions = eligiblePromotions.map(promotion => ({
      _id: promotion._id,
      promotionId: promotion.promotionId,
      title: promotion.title,
      description: promotion.description,
      type: promotion.type,
      supplier: {
        _id: promotion.supplier._id,
        name: promotion.supplier.companyName,
        location: `${promotion.supplier.city || ''}, ${promotion.supplier.state || ''}`.replace(', ,', '').trim() || 'Location not specified',
        contact: promotion.supplier.contactInfo
      },
      benefits: {
        discountType: promotion.benefits.discountType,
        discountValue: promotion.benefits.discountValue,
        maxDiscount: promotion.benefits.maxDiscount,
        freeDeliveryRadius: promotion.benefits.freeDeliveryRadius,
        coinsMultiplier: promotion.benefits.coinsMultiplier || 1,
        additionalBenefits: promotion.benefits.additionalBenefits
      },
      conditions: {
        minOrderValue: promotion.conditions?.minOrderValue || 0,
        maxOrderValue: promotion.conditions?.maxOrderValue,
        categories: promotion.conditions?.categories || [],
        minQuantity: promotion.conditions?.minQuantity || 1
      },
      validity: {
        startDate: promotion.validity.startDate,
        endDate: promotion.validity.endDate
      },
      usage: {
        currentUsage: promotion.usage?.currentUsage || 0,
        totalLimit: promotion.usage?.totalLimit,
        perUserLimit: promotion.usage?.perUserLimit || 1
      },
      couponCode: promotion.couponCode,
      targeting: promotion.targeting,
      createdAt: promotion.createdAt
    }));

    // Group by categories for better organization
    const promotionsByCategory = {
      discount: formattedPromotions.filter(p => p.type === 'discount'),
      coupon: formattedPromotions.filter(p => p.type === 'coupon'),
      free_delivery: formattedPromotions.filter(p => p.type === 'free_delivery'),
      bulk_discount: formattedPromotions.filter(p => p.type === 'bulk_discount'),
      seasonal: formattedPromotions.filter(p => p.type === 'seasonal'),
      referral: formattedPromotions.filter(p => p.type === 'referral')
    };

    res.json({
      success: true,
      data: {
        allPromotions: formattedPromotions,
        promotionsByCategory,
        totalCount: formattedPromotions.length,
        customerInfo: {
          customerType: user.customerType,
          membershipTier: user.membershipTier || 'silver',
          location: {
            state: userLocation?.state,
            city: userLocation?.city
          },
          isNewCustomer: (user.orderCount || 0) === 0,
          orderCount: user.orderCount || 0
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching supplier promotions:', error);
    next(error);
  }
});

// @route   POST /api/customer-promotions/apply-supplier-promotion
// @desc    Apply a supplier promotion to calculate discount
// @access  Private (Customer)
router.post('/apply-supplier-promotion', auth, authorize('customer'), [
  body('promotionId').notEmpty().withMessage('Promotion ID is required'),
  body('orderValue').isFloat({ min: 0 }).withMessage('Order value must be positive'),
  body('items').optional().isArray().withMessage('Items must be an array')
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

    const { promotionId, orderValue, items = [] } = req.body;
    const user = await User.findById(req.user._id);

    console.log(`🔍 Applying supplier promotion: ${promotionId} for order value: ₹${orderValue}`);

    const promotion = await SupplierPromotion.findById(promotionId)
      .populate({
        path: 'supplier',
        select: 'companyName isApproved',
        match: { isApproved: true }
      });

    if (!promotion) {
      return next(new ErrorHandler('Promotion not found', 404));
    }

    if (!promotion.supplier) {
      return next(new ErrorHandler('Supplier is not approved', 400));
    }

    // Use the promotion's validation method
    const validation = promotion.isValidForUser(user, orderValue, user.addresses?.[0] || {});
    
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.reason
      });
    }

    // Calculate discount
    let discountAmount = 0;
    let freeDelivery = false;
    let coinsMultiplier = 1;

    switch (promotion.benefits.discountType) {
      case 'percentage':
        discountAmount = (orderValue * promotion.benefits.discountValue) / 100;
        if (promotion.benefits.maxDiscount && discountAmount > promotion.benefits.maxDiscount) {
          discountAmount = promotion.benefits.maxDiscount;
        }
        break;
      case 'fixed_amount':
        discountAmount = Math.min(promotion.benefits.discountValue, orderValue);
        break;
      case 'free_delivery':
        freeDelivery = true;
        discountAmount = 50; // Assume delivery cost
        break;
      case 'coins_multiplier':
        coinsMultiplier = promotion.benefits.coinsMultiplier || 1;
        break;
    }

    // Update promotion analytics (non-blocking)
    try {
      promotion.analytics.views += 1;
      await promotion.save();
    } catch (error) {
      console.warn('⚠️ Failed to update promotion analytics:', error.message);
    }

    res.json({
      success: true,
      data: {
        promotion: {
          _id: promotion._id,
          title: promotion.title,
          type: promotion.type,
          supplier: promotion.supplier.companyName
        },
        discount: {
          amount: discountAmount,
          percentage: promotion.benefits.discountType === 'percentage' ? promotion.benefits.discountValue : null,
          freeDelivery,
          coinsMultiplier
        },
        finalAmount: Math.max(0, orderValue - discountAmount),
        savings: discountAmount,
        couponCode: promotion.couponCode
      }
    });

  } catch (error) {
    console.error('❌ Error applying supplier promotion:', error);
    next(error);
  }
});

// @route   GET /api/customer-promotions/by-supplier/:supplierId
// @desc    Get promotions from a specific supplier
// @access  Private (Customer)
router.get('/by-supplier/:supplierId', auth, authorize('customer'), async (req, res, next) => {
  try {
    const { supplierId } = req.params;
    const user = await User.findById(req.user._id);

    console.log(`🔍 Fetching promotions from supplier: ${supplierId}`);

    const supplierPromotions = await SupplierPromotion.find({
      supplier: supplierId,
      status: 'active',
      isActive: true,
      'validity.startDate': { $lte: new Date() },
      'validity.endDate': { $gte: new Date() }
    })
    .populate({
      path: 'supplier',
      select: 'companyName state city businessLicense isApproved',
      match: { isApproved: true }
    })
    .sort({ 'benefits.discountValue': -1 });

    // Filter by customer eligibility
    const eligiblePromotions = supplierPromotions.filter(promotion => {
      if (!promotion.supplier) return false;
      
      // Customer type check
      if (promotion.targeting?.customerTypes?.length > 0) {
        if (!promotion.targeting.customerTypes.includes(user.customerType)) {
          return false;
        }
      }

      return true;
    });

    res.json({
      success: true,
      data: {
        promotions: eligiblePromotions,
        supplier: eligiblePromotions[0]?.supplier,
        count: eligiblePromotions.length
      }
    });

  } catch (error) {
    console.error('❌ Error fetching supplier-specific promotions:', error);
    next(error);
  }
});

// Helper function to validate promotion eligibility
function validatePromotionEligibility(promotion, user, orderValue) {
  // Check if promotion is active and within date range
  const now = new Date();
  if (!promotion.isActive || now < promotion.startDate || now > promotion.endDate) {
    return { isEligible: false, reason: 'Promotion is not active' };
  }

  // Check customer type eligibility
  if (promotion.targetCustomerTypes.length > 0 && 
      !promotion.targetCustomerTypes.includes('all') &&
      !promotion.targetCustomerTypes.includes(user.customerType)) {
    return { isEligible: false, reason: 'You are not eligible for this promotion' };
  }

  // Check membership tier eligibility
  if (promotion.targetMembershipTiers.length > 0 && 
      !promotion.targetMembershipTiers.includes(user.membershipTier)) {
    return { isEligible: false, reason: 'Your membership tier is not eligible for this promotion' };
  }

  // Check minimum order value
  if (promotion.minOrderValue && orderValue < promotion.minOrderValue) {
    return { 
      isEligible: false, 
      reason: `Minimum order value of ₹${promotion.minOrderValue} required` 
    };
  }

  // Check location restrictions
  if (promotion.locationRestrictions?.states?.length > 0) {
    const userState = user.addresses?.[0]?.state;
    if (!userState || !promotion.locationRestrictions.states.includes(userState)) {
      return { isEligible: false, reason: 'Promotion not available in your location' };
    }
  }

  return { isEligible: true };
}
// Add this new route after the existing supplier-promotions route (around line 450)

// @route   GET /api/customer-promotions/promotion-suggestions
// @desc    Get promotion suggestions for current cart
// @access  Private (Customer)
router.get('/promotion-suggestions', auth, authorize('customer'), async (req, res, next) => {
  try {
    console.log('🔍 === PROMOTION SUGGESTIONS DEBUG START ===');
    const user = await User.findById(req.user._id);
    console.log('👤 User details:', {
      id: user._id,
      customerType: user.customerType,
      membershipTier: user.membershipTier
    });

    // Get user's cart to calculate total
    const Cart = require('../models/Cart');
    const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    
    if (!cart || cart.items.length === 0) {
      console.log('🛒 No cart or empty cart');
      return res.json({
        success: true,
        data: {
          suggestions: [],
          cartTotal: 0,
          totalSuggestions: 0,
          message: 'Add items to cart to see promotion suggestions',
          hasCart: false,
          itemsCount: 0
        }
      });
    }

    const cartTotal = cart.totalAmount || 0;
    console.log('💰 Cart total for suggestions:', cartTotal);

    // Get all active supplier promotions
    const activePromotions = await SupplierPromotion.find({
      status: 'active',
      isActive: true,
      'validity.endDate': { $gte: new Date() }
    }).populate('supplier', 'companyName businessName city state');

    console.log('📊 Total active promotions found:', activePromotions.length);

    const suggestions = [];

    // Process each promotion for eligibility
    for (const promotion of activePromotions) {
      console.log(`\n🎯 Checking promotion: ${promotion.title} (${promotion._id})`);
      
      if (!promotion.supplier) {
        console.log('   ❌ No supplier attached, skipping');
        continue;
      }

      // Check if user has products from this supplier in cart
      const hasSupplierProducts = cart.items.some(item => 
        item.product?.supplier?.toString() === promotion.supplier._id.toString()
      );

      if (!hasSupplierProducts) {
        console.log('   ❌ No products from this supplier in cart');
        continue;
      }

      // Calculate supplier-specific cart total
      const supplierCartTotal = cart.items
        .filter(item => item.product?.supplier?.toString() === promotion.supplier._id.toString())
        .reduce((sum, item) => sum + (item.quantity * item.priceAtTime), 0);

      console.log(`   💰 Supplier cart total: ₹${supplierCartTotal}`);

      const minOrder = promotion.conditions.minOrderValue || 0;
      console.log(`   📋 Min order required: ₹${minOrder}`);

      // Check customer type eligibility
      const isCustomerTypeEligible = !promotion.targeting.customerTypes?.length || 
                               promotion.targeting.customerTypes.includes(user.customerType);

      console.log(`   👤 Customer type eligible: ${isCustomerTypeEligible}`);

      if (isCustomerTypeEligible && supplierCartTotal >= minOrder) {
        // Calculate potential savings
        const savings = promotion.calculateDiscount(supplierCartTotal);
        console.log(`   💰 Potential savings: ₹${savings}`);

        if (savings > 0) {
          const suggestion = {
            type: 'eligible',
            promotion: {
              _id: promotion._id,
              title: promotion.title,
              description: promotion.description,
              supplier: promotion.supplier.companyName || promotion.supplier.businessName,
              discountType: promotion.benefits.discountType,
              discountValue: promotion.benefits.discountValue,
              maxDiscount: promotion.benefits.maxDiscount,
              minOrderValue: minOrder,
              validTill: promotion.validity.endDate
            },
            savings: Math.round(savings),
            priority: 1,
            message: `Save ₹${Math.round(savings)} on ${promotion.supplier.companyName} products`,
            badge: '🔥 Hot Deal'
          };

          suggestions.push(suggestion);
          console.log('   ✅ Added to suggestions!');
        }
      } else if (isCustomerTypeEligible && supplierCartTotal < minOrder) {
        const needed = minOrder - supplierCartTotal;
        console.log(`   ⚡ Almost eligible - need ₹${needed} more`);

        // Add as "almost eligible" if reasonable
        if (needed > 0 && needed <= supplierCartTotal * 2) {
          const potentialSavings = promotion.calculateDiscount(minOrder);
          
          suggestions.push({
            type: 'almost',
            promotion: {
              _id: promotion._id,
              title: promotion.title,
              description: promotion.description,
              supplier: promotion.supplier.companyName || promotion.supplier.businessName,
              discountType: promotion.benefits.discountType,
              discountValue: promotion.benefits.discountValue,
              minOrderValue: minOrder
            },
            savings: Math.round(potentialSavings),
            priority: 3,
            message: `Add ₹${Math.round(needed)} more ${promotion.supplier.companyName} products to unlock`,
            badge: '⚡ Almost There',
            amountNeeded: Math.round(needed)
          });
          console.log('   ✅ Added as almost eligible!');
        }
      }
    }

    // Sort suggestions by priority and savings
    suggestions.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.savings - a.savings;
    });

    console.log(`\n📊 Final suggestions: ${suggestions.length}`);
    console.log('🔍 === PROMOTION SUGGESTIONS DEBUG END ===');

    res.json({
      success: true,
      data: {
        suggestions,
        cartTotal,
        totalSuggestions: suggestions.length,
        hasCart: true,
        itemsCount: cart.items.length
      }
    });

  } catch (error) {
    console.error('❌ Promotion suggestions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch promotion suggestions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
module.exports = router;