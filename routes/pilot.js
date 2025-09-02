const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const Pilot = require('../models/Pilot');
const Order = require('../models/Order');
const { ErrorHandler } = require('../utils/errorHandler');
const { 
  sendPilotRegistrationConfirmation, 
  sendPilotLoginOTP,
  sendPilotOrderAssignmentNotification,
  sendCustomerDeliveryOTP,
  sendSMS,
  NotificationService
} = require('../utils/notifications');
const { pilotAuth, generatePilotToken } = require('../middleware/auth');
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
      await sendPilotRegistrationConfirmation(pilot);
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
      
      // Store OTP temporarily (in production, use Redis or database)
      pilot.tempOTP = generatedOTP;
      pilot.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      await pilot.save();
      
      await sendPilotLoginOTP(phoneNumber, generatedOTP);
      
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

    // Verify OTP
    if (!pilot.tempOTP || pilot.tempOTP !== otp || new Date() > pilot.otpExpiry) {
      return next(new ErrorHandler('Invalid or expired OTP', 400));
    }

    // Clear OTP after successful verification
    pilot.tempOTP = undefined;
    pilot.otpExpiry = undefined;
    await pilot.save();

    // Generate JWT token
    const token = generatePilotToken(pilot._id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        pilot: {
          pilotId: pilot.pilotId,
          name: pilot.name,
          phoneNumber: pilot.phoneNumber,
          vehicleDetails: pilot.vehicleDetails,
          isAvailable: pilot.isAvailable,
          currentOrder: pilot.currentOrder,
          totalDeliveries: pilot.totalDeliveries,
          rating: pilot.rating
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
router.post('/scan-order', pilotAuth, [
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

    // Find order - handle both ObjectId and string formats safely
    let query = {
      orderId,
      status: { $in: ['confirmed', 'preparing', 'processing', 'dispatched'] }
    };

    // Only add _id search if orderId looks like a valid ObjectId
    if (orderId && orderId.match(/^[0-9a-fA-F]{24}$/)) {
      query = {
        $or: [{ _id: orderId }, { orderId }],
        status: { $in: ['confirmed', 'preparing', 'processing', 'dispatched'] }
      };
    }

    const order = await Order.findOne(query)
    .populate('customer', 'name phoneNumber addresses')
    .populate('supplier', 'companyName contactPersonNumber address');

    if (!order) {
      return next(new ErrorHandler('Order not found or not ready for pickup', 404));
    }

    if (order.delivery && order.delivery.pilotAssigned) {
      return next(new ErrorHandler('Order already assigned to another pilot', 400));
    }

    // Generate delivery OTP for this order if not already generated
    if (!order.delivery || !order.delivery.deliveryOTP) {
      if (!order.delivery) order.delivery = {};
      order.generateDeliveryOTP();
      await order.save();
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
            address: order.deliveryAddress || order.customer.addresses?.[0]
          },
          supplier: {
            companyName: order.supplier.companyName,
            contactNumber: order.supplier.contactPersonNumber,
            address: order.supplier.address
          },
          items: order.items.map(item => ({
            name: item.productSnapshot?.name || item.product.name,
            quantity: item.quantity,
            unit: item.productSnapshot?.unit || 'pieces',
            totalPrice: item.totalPrice
          })),
          pricing: order.pricing,
          totalAmount: order.pricing.totalAmount,
          estimatedDeliveryTime: order.delivery?.estimatedTime || '2-4 hours',
          specialInstructions: order.notes,
          status: order.status
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
router.post('/accept-order', pilotAuth, [
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

    // Use authenticated pilot from middleware
    const pilot = req.pilot;
    
    // Verify pilot ID matches
    if (pilot.pilotId !== pilotId) {
      return next(new ErrorHandler('Pilot ID mismatch', 400));
    }

    if (!pilot.isAvailable || pilot.currentOrder) {
      return next(new ErrorHandler('Pilot not available for new orders', 400));
    }

    // Find order - handle both ObjectId and string formats safely
    let query = {
      orderId,
      status: { $in: ['confirmed', 'preparing', 'processing', 'dispatched'] }
    };

    // Only add _id search if orderId looks like a valid ObjectId
    if (orderId && orderId.match(/^[0-9a-fA-F]{24}$/)) {
      query = {
        $or: [{ _id: orderId }, { orderId }],
        status: { $in: ['confirmed', 'preparing', 'processing', 'dispatched'] }
      };
    }

    const order = await Order.findOne(query).populate('customer', 'phoneNumber name');

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
router.post('/start-journey', pilotAuth, [
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

    // Find order - handle both ObjectId and string formats safely
    let query = {
      orderId,
      status: 'dispatched'
    };

    // Only add _id search if orderId looks like a valid ObjectId
    if (orderId && orderId.match(/^[0-9a-fA-F]{24}$/)) {
      query = {
        $or: [{ _id: orderId }, { orderId }],
        status: 'dispatched'
      };
    }

    const order = await Order.findOne(query).populate('customer', 'phoneNumber');

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
router.post('/complete-delivery', pilotAuth, [
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

    // Find order - handle both ObjectId and string formats safely
    let query = {
      orderId,
      status: 'dispatched'
    };

    // Only add _id search if orderId looks like a valid ObjectId
    if (orderId && orderId.match(/^[0-9a-fA-F]{24}$/)) {
      query = {
        $or: [{ _id: orderId }, { orderId }],
        status: 'dispatched'
      };
    }

    const order = await Order.findOne(query)
    .populate('customer', 'phoneNumber name')
    .populate('supplier', 'contactPersonNumber companyName');

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

    // Send delivery completion notifications
    try {
      // Send notification to customer
      const customerMessage = `🎉 Order Delivered Successfully!

Order ID: ${order.orderId}
Delivered on: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}

Thank you for choosing Aggrekart! 🏗️

We hope you're satisfied with our service. Your feedback helps us improve.

Rate your experience: aggrekart.com/feedback/${order.orderId}

Happy building! 🙏`;

      if (order.customer && order.customer.phoneNumber) {
        await sendSMS(order.customer.phoneNumber, customerMessage);
        console.log(`📱 Delivery completion SMS sent to customer: ${order.customer.phoneNumber}`);
      }

      // Send notification to supplier
      const supplierMessage = `✅ Order Delivered Successfully!

Order ID: ${order.orderId}
Customer: ${order.customer.name}
Delivered on: ${new Date().toLocaleDateString('en-IN')}

Payment status: ${order.payment.status === 'paid' ? 'Completed' : 'Pending'}

Thank you for fulfilling this order through Aggrekart! 🚚

Aggrekart Supplier Portal`;

      if (order.supplier && order.supplier.contactPersonNumber) {
        await sendSMS(order.supplier.contactPersonNumber, supplierMessage);
        console.log(`📱 Delivery completion SMS sent to supplier: ${order.supplier.contactPersonNumber}`);
      }

    } catch (notificationError) {
      console.error('❌ Failed to send delivery completion notifications:', notificationError);
      // Continue execution - don't fail the API if notifications fail
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
router.get('/profile/:pilotId', pilotAuth, [
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

// @route   POST /api/pilot/update-location
// @desc    Update pilot's current location
// @access  Private (Pilot)
router.post('/update-location', pilotAuth, [
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required')
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

    const { latitude, longitude } = req.body;
    const pilot = req.pilot;

    // Update location
    pilot.updateLocation(longitude, latitude);
    await pilot.save();

    res.json({
      success: true,
      message: 'Location updated successfully',
      data: {
        location: {
          latitude,
          longitude,
          lastUpdated: pilot.currentLocation.lastUpdated
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/pilot/stats
// @desc    Get pilot statistics and performance data
// @access  Private (Pilot)
router.get('/stats', pilotAuth, async (req, res, next) => {
  try {
    const pilot = req.pilot;

    // Get delivery statistics
    const deliveryStats = await Order.aggregate([
      {
        $match: {
          'delivery.pilotAssigned': pilot._id,
          status: 'delivered'
        }
      },
      {
        $group: {
          _id: null,
          totalDeliveries: { $sum: 1 },
          totalRevenue: { $sum: '$pricing.totalAmount' },
          avgDeliveryTime: { $avg: '$pricing.totalAmount' }, // This should be calculated based on actual delivery times
          lastMonth: {
            $sum: {
              $cond: [
                {
                  $gte: ['$delivery.actualDeliveryTime', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)]
                },
                1,
                0
              ]
            }
          },
          thisWeek: {
            $sum: {
              $cond: [
                {
                  $gte: ['$delivery.actualDeliveryTime', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Get recent deliveries
    const recentDeliveries = await Order.find({
      'delivery.pilotAssigned': pilot._id,
      status: 'delivered'
    })
    .select('orderId customer delivery.actualDeliveryTime pricing.totalAmount')
    .populate('customer', 'name')
    .sort({ 'delivery.actualDeliveryTime': -1 })
    .limit(5);

    // Get current month earnings
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyEarnings = await Order.aggregate([
      {
        $match: {
          'delivery.pilotAssigned': pilot._id,
          status: 'delivered',
          'delivery.actualDeliveryTime': { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: '$pricing.transportCost' },
          deliveryCount: { $sum: 1 }
        }
      }
    ]);

    const stats = deliveryStats[0] || {
      totalDeliveries: 0,
      totalRevenue: 0,
      avgDeliveryTime: 0,
      lastMonth: 0,
      thisWeek: 0
    };

    const monthly = monthlyEarnings[0] || {
      totalEarnings: 0,
      deliveryCount: 0
    };

    res.json({
      success: true,
      data: {
        pilot: {
          pilotId: pilot.pilotId,
          name: pilot.name,
          rating: pilot.rating,
          totalDeliveries: pilot.totalDeliveries,
          isAvailable: pilot.isAvailable,
          vehicleDetails: pilot.vehicleDetails,
          joinedDate: pilot.createdAt
        },
        stats: {
          ...stats,
          monthlyEarnings: monthly.totalEarnings,
          monthlyDeliveries: monthly.deliveryCount
        },
        recentDeliveries,
        performance: {
          averageRating: pilot.rating.average,
          totalRatings: pilot.rating.count,
          onTimeDeliveryRate: 95, // Calculate this based on actual data
          customerSatisfactionRate: 98 // Calculate this based on ratings
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/pilot/delivery-history
// @desc    Get pilot's delivery history with pagination
// @access  Private (Pilot)
router.get('/delivery-history', pilotAuth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1-50'),
  query('status').optional().isIn(['delivered', 'cancelled']).withMessage('Invalid status filter')
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

    const pilot = req.pilot;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const skip = (page - 1) * limit;

    // Build query
    const query = {
      'delivery.pilotAssigned': pilot._id
    };

    if (status) {
      query.status = status;
    } else {
      query.status = { $in: ['delivered', 'cancelled'] };
    }

    // Get deliveries with pagination
    const deliveries = await Order.find(query)
      .select('orderId customer supplier deliveryAddress pricing delivery status createdAt timeline')
      .populate('customer', 'name phoneNumber')
      .populate('supplier', 'companyName')
      .sort({ 'delivery.actualDeliveryTime': -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      data: {
        deliveries: deliveries.map(order => ({
          orderId: order.orderId,
          customer: order.customer,
          supplier: order.supplier,
          deliveryAddress: order.deliveryAddress,
          totalAmount: order.pricing.totalAmount,
          status: order.status,
          deliveredAt: order.delivery.actualDeliveryTime,
          orderDate: order.createdAt,
          deliveryNotes: order.delivery.deliveryNotes
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    next(error);
  }
});
// ADD these missing endpoints:

// @route   GET /api/pilot/dashboard/stats
// @desc    Get pilot dashboard statistics
// @access  Private (Pilot)
router.get('/dashboard/stats', pilotAuth, async (req, res, next) => {
  try {
    const pilot = req.pilot;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get today's statistics
    const todayStats = await Order.aggregate([
      {
        $match: {
          'delivery.pilotAssigned': pilot._id,
          createdAt: { $gte: today }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalEarnings: { $sum: '$delivery.pilotCommission' },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          }
        }
      }
    ]);

    const stats = todayStats[0] || {
      totalOrders: 0,
      totalEarnings: 0,
      completedOrders: 0
    };

    res.json({
      success: true,
      data: {
        todayStats: stats,
        pilotInfo: {
          name: pilot.name,
          vehicleNumber: pilot.vehicleDetails.registrationNumber,
          rating: pilot.rating || 4.5,
          totalDeliveries: pilot.totalDeliveries || 0
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/pilot/dashboard/notifications
// @desc    Get pilot notifications
// @access  Private (Pilot)
router.get('/dashboard/notifications', pilotAuth, async (req, res, next) => {
  try {
    const pilot = req.pilot;
    
    // Get recent orders and notifications
    const notifications = await Order.find({
      'delivery.pilotAssigned': pilot._id,
      status: { $in: ['confirmed', 'preparing', 'processing'] }
    })
    .populate('customer', 'name')
    .sort({ createdAt: -1 })
    .limit(10);

    const formattedNotifications = notifications.map(order => ({
      id: order._id,
      title: `New order from ${order.customer.name}`,
      message: `Order ${order.orderId} needs pickup`,
      type: 'new_order',
      timestamp: order.createdAt
    }));

    res.json({
      success: true,
      data: {
        notifications: formattedNotifications,
        unreadCount: formattedNotifications.length
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/app/config
// @desc    Get app configuration for pilot app
// @access  Public
router.get('/app/config', async (req, res, next) => {
  try {
    const config = {
      supportInfo: {
        phone: process.env.SUPPORT_PHONE || '+91-9876543210',
        email: process.env.SUPPORT_EMAIL || 'support@aggrekart.com',
        whatsapp: process.env.SUPPORT_WHATSAPP || '+91-9876543210'
      },
      appVersion: {
        current: '1.0.0',
        minimum: '1.0.0'
      },
      features: {
        liveTracking: true,
        otpDelivery: true,
        cashCollection: true
      }
    };

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/support/faqs
// @desc    Get FAQs for pilot
// @access  Public
router.get('/support/faqs', async (req, res, next) => {
  try {
    const faqs = [
      {
        question: "How do I accept an order?",
        answer: "Tap on the order notification and click 'Accept Order' button."
      },
      {
        question: "What if customer is not available?",
        answer: "Call the customer and wait for 10 minutes. If still not available, contact support."
      },
      {
        question: "How do I complete delivery?",
        answer: "Get the OTP from customer and enter it in the app to complete delivery."
      }
    ];

    res.json({
      success: true,
      data: { faqs }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/support/contact
// @desc    Send support request from pilot
// @access  Private (Pilot)
router.post('/support/contact', pilotAuth, [
  body('subject').notEmpty().withMessage('Subject is required'),
  body('message').notEmpty().withMessage('Message is required'),
  body('priority').optional().isIn(['low', 'medium', 'high']).withMessage('Invalid priority')
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

    const { subject, message, priority } = req.body;
    const pilot = req.pilot;

    // Here you would save to a Support/Ticket model
    // For now, just log and send success response
    console.log('Support request from pilot:', {
      pilotId: pilot.pilotId,
      subject,
      message,
      priority: priority || 'medium'
    });

    res.json({
      success: true,
      message: 'Support request submitted successfully',
      data: {
        ticketId: Date.now().toString(), // Generate proper ticket ID
        status: 'submitted'
      }
    });
  } catch (error) {
    next(error);
  }
});
module.exports = router;