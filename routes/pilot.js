const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const Pilot = require('../models/Pilot');
const Order = require('../models/Order');
const { ErrorHandler } = require('../utils/errorHandler');
const { sendSMS } = require('../utils/notifications');
const router = express.Router();

// @route   POST /api/pilot/register
// @desc    Register as pilot/driver
// @access  Public
router.post('/register', [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('phoneNumber').matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid phone number'),
  body('vehicleDetails.registrationNumber').notEmpty().withMessage('Vehicle registration number is required'),
  body('vehicleDetails.vehicleType').isIn(['truck', 'mini_truck', 'pickup', 'tractor', 'trailer']).withMessage('Invalid vehicle type'),
  body('vehicleDetails.capacity').isFloat({ min: 1, max: 50 }).withMessage('Vehicle capacity must be between 1-50 MT'),
  body('drivingLicense.number').notEmpty().withMessage('Driving license number is required'),
  body('drivingLicense.validTill').isISO8601().withMessage('Valid license expiry date is required')
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
      name,
      phoneNumber,
      email,
      vehicleDetails,
      drivingLicense,
      emergencyContact,
      workingAreas
    } = req.body;

    // Check if pilot already exists
    const existingPilot = await Pilot.findOne({ phoneNumber });
    if (existingPilot) {
      return next(new ErrorHandler('Pilot already registered with this phone number', 400));
    }

    // Check vehicle registration
    const existingVehicle = await Pilot.findOne({ 
      'vehicleDetails.registrationNumber': vehicleDetails.registrationNumber 
    });
    if (existingVehicle) {
      return next(new ErrorHandler('Vehicle already registered', 400));
    }

    // Create pilot
    const pilot = new Pilot({
      name,
      phoneNumber,
      email,
      vehicleDetails: {
        ...vehicleDetails,
        registrationNumber: vehicleDetails.registrationNumber.replace(/[-\s]/g, '').toUpperCase()
      },
      drivingLicense,
      emergencyContact,
      workingAreas: workingAreas || [],
      isApproved: false,
      isActive: false
    });

    await pilot.save();

    // Send registration confirmation SMS
    try {
      await sendSMS(
        phoneNumber,
        `Welcome to Aggrekart! Your pilot registration (${pilot.pilotId}) is submitted. You'll be notified once approved.`
      );
    } catch (error) {
      console.error('Failed to send registration SMS:', error);
    }

    res.status(201).json({
      success: true,
      message: 'Pilot registration submitted successfully. You will be notified once approved.',
      data: {
        pilotId: pilot.pilotId,
        status: 'pending_approval'
      }
    });

  } catch (error) {
    next(error);
  }
});


// @route   POST /api/pilot/login
// @desc    Pilot login with phone and OTP
// @access  Public
router.post('/login', [
  body('phoneNumber').matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid phone number'),
  body('otp').optional().isLength({ min: 6, max: 6 }).withMessage('Please provide a valid 6-digit OTP')
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

    const { phoneNumber, otp } = req.body;

    const pilot = await Pilot.findOne({ phoneNumber, isApproved: true, isActive: true });
    if (!pilot) {
      return next(new ErrorHandler('Pilot not found or not approved', 404));
    }

    if (!otp) {
      // Send OTP
      const generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
      
      // In production, store OTP in database or cache
      // For now, we'll send it via SMS
      await sendSMS(phoneNumber, `Your Aggrekart pilot login OTP: ${generatedOTP}`);
      
      return res.json({
        success: true,
        message: 'OTP sent successfully',
        data: {
          otpSent: true,
          // In development, return OTP for testing
          ...(process.env.NODE_ENV === 'development' && { otp: generatedOTP })
        }
      });
    }

    // Verify OTP (simplified for demo)
    // In production, verify against stored OTP
    if (otp.length !== 6) {
      return next(new ErrorHandler('Invalid OTP', 400));
    }

    // Generate simple token (in production, use JWT)
    const token = Buffer.from(`${pilot._id}:${Date.now()}`).toString('base64');

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        pilot: {
          pilotId: pilot.pilotId,
          name: pilot.name,
          vehicleDetails: pilot.vehicleDetails,
          isAvailable: pilot.isAvailable,
          currentOrder: pilot.currentOrder
        },
        token
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/pilot/scan-order
// @desc    Scan order QR code to get order details
// @access  Private (Pilot)
router.post('/scan-order', [
  body('orderId').notEmpty().withMessage('Order ID is required')
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

    const { orderId } = req.body;

    // Find order
    const order = await Order.findOne({
      $or: [{ _id: orderId }, { orderId }],
      status: 'dispatched'
    })
    .populate('customer', 'name phoneNumber')
    .populate('supplier', 'companyName contactPersonNumber');

    if (!order) {
      return next(new ErrorHandler('Order not found or not ready for pickup', 404));
    }

    if (order.delivery.pilotAssigned) {
      return next(new ErrorHandler('Order already assigned to another pilot', 400));
    }

    // Return order details for pilot
    res.json({
      success: true,
      data: {
        order: {
          orderId: order.orderId,
          customer: {
            name: order.customer.name,
            phoneNumber: order.customer.phoneNumber,
            address: order.deliveryAddress
          },
          supplier: {
            companyName: order.supplier.companyName,
            contactNumber: order.supplier.contactPersonNumber
          },
          items: order.items.map(item => ({
            name: item.productSnapshot.name,
            quantity: item.quantity,
            unit: order.pricing.unit
          })),
          totalAmount: order.pricing.totalAmount,
          estimatedDeliveryTime: order.delivery.estimatedTime,
          specialInstructions: order.notes
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/pilot/accept-order
// @desc    Accept delivery order
// @access  Private (Pilot)
router.post('/accept-order', [
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('pilotId').notEmpty().withMessage('Pilot ID is required')
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

    const { orderId, pilotId } = req.body;

    // Find pilot
    const pilot = await Pilot.findOne({ pilotId, isApproved: true, isActive: true });
    if (!pilot) {
      return next(new ErrorHandler('Pilot not found or not approved', 404));
    }

    if (!pilot.isAvailable || pilot.currentOrder) {
      return next(new ErrorHandler('Pilot not available for new orders', 400));
    }

    // Find order
    const order = await Order.findOne({
      $or: [{ _id: orderId }, { orderId }],
      status: 'dispatched'
    }).populate('customer', 'phoneNumber');

    if (!order) {
      return next(new ErrorHandler('Order not found or not ready for pickup', 404));
    }

    // Assign pilot to order
    order.delivery.driverDetails = {
      name: pilot.name,
      phoneNumber: pilot.phoneNumber,
      vehicleNumber: pilot.vehicleDetails.registrationNumber
    };
    order.delivery.pilotAssigned = pilot._id;
    order.timeline.push({
      status: 'dispatched',
      timestamp: new Date(),
      note: `Order assigned to pilot ${pilot.name} (${pilot.vehicleDetails.registrationNumber})`
    });

    await order.save();

    // Update pilot status
    pilot.isAvailable = false;
    pilot.currentOrder = order._id;
    await pilot.save();

    // Notify customer about driver details
    try {
      await sendSMS(
        order.customer.phoneNumber,
        `Your order ${order.orderId} is on the way! Driver: ${pilot.name}, Vehicle: ${pilot.vehicleDetails.registrationNumber}, Phone: ${pilot.phoneNumber}`
      );
    } catch (error) {
      console.error('Failed to send driver details SMS:', error);
    }

    res.json({
      success: true,
      message: 'Order accepted successfully',
      data: {
        order: {
          orderId: order.orderId,
          customerName: order.customer.name,
          deliveryAddress: order.deliveryAddress,
          customerPhone: order.customer.phoneNumber
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/pilot/start-journey
// @desc    Start journey to delivery location
// @access  Private (Pilot)
router.post('/start-journey', [
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('currentLocation.latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
  body('currentLocation.longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required')
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

    const { orderId, currentLocation } = req.body;

    // Find order
    const order = await Order.findOne({
      $or: [{ _id: orderId }, { orderId }],
      status: 'dispatched'
    }).populate('customer', 'phoneNumber');

    if (!order) {
      return next(new ErrorHandler('Order not found', 404));
    }

    // Update order status
    order.timeline.push({
      status: 'dispatched',
      timestamp: new Date(),
      note: 'Driver started journey to delivery location'
    });

    await order.save();

    // Update pilot location
    const pilot = await Pilot.findById(order.delivery.pilotAssigned);
    if (pilot) {
      pilot.updateLocation(currentLocation.longitude, currentLocation.latitude);
      await pilot.save();
    }

    // Notify customer
    try {
      await sendSMS(
        order.customer.phoneNumber,
        `Your order ${order.orderId} is on the way! Expected delivery: ${order.delivery.estimatedTime}. Track your order in the app.`
      );
    } catch (error) {
      console.error('Failed to send journey start SMS:', error);
    }

    res.json({
      success: true,
      message: 'Journey started successfully',
      data: {
        estimatedDeliveryTime: order.delivery.estimatedTime,
        customerLocation: order.deliveryAddress.coordinates
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/pilot/complete-delivery
// @desc    Complete delivery with OTP verification
// @access  Private (Pilot)
router.post('/complete-delivery', [
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('deliveryOTP').isLength({ min: 6, max: 6 }).withMessage('Valid 6-digit OTP is required'),
  body('deliveryNotes').optional().trim().isLength({ max: 500 }).withMessage('Delivery notes cannot exceed 500 characters'),
  body('customerRating').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1-5')
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

    const { orderId, deliveryOTP, deliveryNotes, customerRating } = req.body;

    // Find order
    const order = await Order.findOne({
      $or: [{ _id: orderId }, { orderId }],
      status: 'dispatched'
    }).populate('customer', 'phoneNumber');

    if (!order) {
      return next(new ErrorHandler('Order not found', 404));
    }

    // Verify delivery OTP
    if (order.delivery.deliveryOTP !== deliveryOTP) {
      return next(new ErrorHandler('Invalid delivery OTP', 400));
    }

    // Complete delivery
    order.status = 'delivered';
    order.delivery.actualDeliveryTime = new Date();
    order.delivery.deliveryNotes = deliveryNotes;
    order.timeline.push({
      status: 'delivered',
      timestamp: new Date(),
      note: 'Order delivered successfully'
    });

    await order.save();

    // Update pilot status
    const pilot = await Pilot.findById(order.delivery.pilotAssigned);
    if (pilot) {
      pilot.isAvailable = true;
      pilot.currentOrder = null;
      pilot.totalDeliveries += 1;
      
      // Add rating if provided
      if (customerRating) {
        pilot.addRating(customerRating);
      }
      
      await pilot.save();
    }

    res.json({
      success: true,
      message: 'Delivery completed successfully',
      data: {
        order: {
          orderId: order.orderId,
          status: order.status,
          deliveredAt: order.delivery.actualDeliveryTime
        },
        pilot: {
          totalDeliveries: pilot.totalDeliveries,
          rating: pilot.rating,
          isAvailable: pilot.isAvailable
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/pilot/profile/:pilotId
// @desc    Get pilot profile
// @access  Private (Pilot)
router.get('/profile/:pilotId', [
  param('pilotId').notEmpty().withMessage('Pilot ID is required')
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

    const { pilotId } = req.params;

    const pilot = await Pilot.findOne({ pilotId }).select('-documents');
    if (!pilot) {
      return next(new ErrorHandler('Pilot not found', 404));
    }

    // Get delivery history
    const recentDeliveries = await Order.find({
      'delivery.pilotAssigned': pilot._id,
      status: 'delivered'
    })
    .select('orderId deliveryAddress delivery.actualDeliveryTime pricing.totalAmount')
    .sort({ 'delivery.actualDeliveryTime': -1 })
    .limit(10);

    res.json({
      success: true,
      data: {
        pilot,
        recentDeliveries,
        stats: {
          totalDeliveries: pilot.totalDeliveries,
          rating: pilot.rating,
          documentsValid: pilot.areDocumentsValid()
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;