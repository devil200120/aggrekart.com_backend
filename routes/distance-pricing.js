const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { ErrorHandler } = require('../utils/errorHandler');
const distanceCalculator = require('../utils/distanceCalculator');
const Product = require('../models/Product');
const User = require('../models/User');
const Order = require('../models/Order');

const router = express.Router();

// @route   POST /api/distance-pricing/calculate
// @desc    Calculate distance and transport cost
// @access  Private
router.post('/calculate', auth, [
  body('supplierLocation').notEmpty().withMessage('Supplier location is required'),
  body('supplierLocation.latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
  body('supplierLocation.longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
  body('customerLocation').notEmpty().withMessage('Customer location is required'),
  body('customerLocation.latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
  body('customerLocation.longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
  body('totalWeight').optional().isFloat({ min: 0 }).withMessage('Total weight must be positive')
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

    const { supplierLocation, customerLocation, totalWeight = 1 } = req.body;

    // Calculate distance using Google Maps API with Haversine fallback
    const distanceInfo = await distanceCalculator.calculateDistanceGoogle(
      supplierLocation,
      customerLocation
    );

    // Calculate transport cost
    const transportCost = distanceCalculator.calculateTransportCost(
      distanceInfo.distance,
      totalWeight
    );

    // Get delivery estimate
    const deliveryEstimate = distanceCalculator.getDeliveryEstimate(
      distanceInfo.distance
    );

    // Get distance zone
    const zone = distanceCalculator.getDistanceZone(distanceInfo.distance);

    res.status(200).json({
      success: true,
      message: 'Distance and pricing calculated successfully',
      data: {
        distance: {
          value: distanceInfo.distance,
          unit: 'km',
          duration: distanceInfo.duration,
          source: distanceInfo.source
        },
        pricing: {
          transportCost,
          zone,
          totalWeight
        },
        delivery: {
          estimatedHours: deliveryEstimate,
          zone: zone
        }
      }
    });

  } catch (error) {
    console.error('❌ Distance calculation error:', error);
    next(new ErrorHandler('Failed to calculate distance and pricing', 500));
  }
});

// @route   POST /api/distance-pricing/optimal-suppliers
// @desc    Find optimal suppliers based on distance and pricing
// @access  Private
router.post('/optimal-suppliers', auth, [
  body('customerLocation').notEmpty().withMessage('Customer location is required'),
  body('customerLocation.latitude').isFloat({ min: -90, max: 90 }),
  body('customerLocation.longitude').isFloat({ min: -180, max: 180 }),
  body('productIds').isArray({ min: 1 }).withMessage('At least one product ID required'),
  body('quantities').isArray({ min: 1 }).withMessage('Quantities array required')
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

    const { customerLocation, productIds, quantities } = req.body;

    // Find all products and their suppliers
    const products = await Product.find({ _id: { $in: productIds } })
      .populate('supplier', 'name coordinates businessAddress');

    if (products.length !== productIds.length) {
      return next(new ErrorHandler('Some products not found', 404));
    }

    // Group products by supplier
    const supplierGroups = {};
    products.forEach((product, index) => {
      const supplierId = product.supplier._id.toString();
      
      if (!supplierGroups[supplierId]) {
        supplierGroups[supplierId] = {
          id: supplierId,
          name: product.supplier.name,
          location: product.supplier.coordinates || {
            latitude: 28.6139, // Default Delhi coordinates
            longitude: 77.2090
          },
          items: [],
          totalWeight: 0,
          totalValue: 0
        };
      }

      const quantity = quantities[index] || 1;
      const itemWeight = (product.specifications?.weight || 1) * quantity;
      const itemValue = product.price * quantity;

      supplierGroups[supplierId].items.push({
        productId: product._id,
        productName: product.name,
        quantity,
        weight: itemWeight,
        value: itemValue
      });

      supplierGroups[supplierId].totalWeight += itemWeight;
      supplierGroups[supplierId].totalValue += itemValue;
    });

    // Calculate delivery costs for each supplier group
    const suppliers = Object.values(supplierGroups);
    const deliveryCalculation = await distanceCalculator.calculateConsolidatedDelivery(
      suppliers,
      customerLocation
    );

    // Rank suppliers by total cost (product value + transport cost)
    const rankedSuppliers = deliveryCalculation.individual.map(supplier => {
      const supplierData = supplierGroups[supplier.supplierId];
      return {
        ...supplier,
        totalProductValue: supplierData.totalValue,
        totalCostWithTransport: supplierData.totalValue + supplier.transportCost,
        costPerKm: Math.round((supplier.transportCost / supplier.distance) * 100) / 100
      };
    }).sort((a, b) => a.totalCostWithTransport - b.totalCostWithTransport);

    res.status(200).json({
      success: true,
      message: 'Optimal suppliers calculated successfully',
      data: {
        suppliers: rankedSuppliers,
        consolidation: deliveryCalculation.consolidated,
        recommendation: {
          bestSupplier: rankedSuppliers[0],
          alternativeSuppliers: rankedSuppliers.slice(1, 3),
          consolidationRecommended: deliveryCalculation.consolidated.recommendConsolidation
        }
      }
    });

  } catch (error) {
    console.error('❌ Optimal suppliers calculation error:', error);
    next(new ErrorHandler('Failed to calculate optimal suppliers', 500));
  }
});

// @route   GET /api/distance-pricing/delivery-zones
// @desc    Get delivery zones and their pricing
// @access  Public
router.get('/delivery-zones', (req, res) => {
  try {
    const zones = {
      '0-5km': {
        range: '0-5 km',
        rate: 50,
        minCharge: 100,
        deliveryTime: '1-3 hours',
        description: 'Local delivery within city limits'
      },
      '5-10km': {
        range: '5-10 km',
        rate: 75,
        minCharge: 200,
        deliveryTime: '2-5 hours',
        description: 'Suburban delivery'
      },
      '10-20km': {
        range: '10-20 km',
        rate: 100,
        minCharge: 350,
        deliveryTime: '3-7 hours',
        description: 'Extended city delivery'
      },
      '20km+': {
        range: '20+ km',
        rate: 150,
        minCharge: 500,
        deliveryTime: '5-9 hours',
        description: 'Long distance delivery'
      }
    };

    res.status(200).json({
      success: true,
      message: 'Delivery zones retrieved successfully',
      data: { zones }
    });

  } catch (error) {
    console.error('❌ Get delivery zones error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get delivery zones'
    });
  }
});

// @route   POST /api/distance-pricing/estimate-delivery
// @desc    Get delivery time estimate
// @access  Private
router.post('/estimate-delivery', auth, [
  body('distance').isFloat({ min: 0 }).withMessage('Valid distance required'),
  body('zone').optional().isIn(['urban', 'rural']).withMessage('Zone must be urban or rural')
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

    const { distance, zone = 'urban' } = req.body;

    const deliveryEstimate = distanceCalculator.getDeliveryEstimate(distance, zone);
    const distanceZone = distanceCalculator.getDistanceZone(distance);

    res.status(200).json({
      success: true,
      message: 'Delivery estimate calculated successfully',
      data: {
        distance,
        zone,
        distanceZone,
        estimate: deliveryEstimate,
        estimatedDate: {
          earliest: new Date(Date.now() + deliveryEstimate.min * 60 * 60 * 1000),
          latest: new Date(Date.now() + deliveryEstimate.max * 60 * 60 * 1000)
        }
      }
    });

  } catch (error) {
    console.error('❌ Delivery estimation error:', error);
    next(new ErrorHandler('Failed to estimate delivery time', 500));
  }
});

module.exports = router;