const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { auth, authorize, canPlaceOrders } = require('../middleware/auth');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const User = require('../models/User');
const { ErrorHandler } = require('../utils/errorHandler');
// Add this import at the top (around line 10):
const InvoiceGenerator = require('../utils/invoiceGenerator');
// Add these helper functions for distance calculation
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const getDeliveryZone = (distance) => {
  if (distance <= 5) return '0-5km';
  if (distance <= 10) return '5-10km';
  if (distance <= 20) return '10-20km';
  return '20km+';
};

const calculateTransportCost = (distance) => {
  if (distance <= 5) return Math.max(distance * 50, 100);
  if (distance <= 10) return Math.max(distance * 75, 200);
  if (distance <= 20) return Math.max(distance * 100, 350);
  return Math.max(distance * 150, 500);
};
const UserLoyalty = require('../models/UserLoyalty');
const { 
  sendOrderNotification, 
  sendSMS, 
  sendOrderPlacementNotification,     // 🔥 NEW: Enhanced customer notifications
  sendSupplierOrderNotification       // 🔥 NEW: Enhanced supplier notifications
} = require('../utils/notifications');
const { initiatePayment, verifyPayment } = require('../utils/payment');
const router = express.Router();

// @route   POST /api/orders/checkout
// @desc    Create order from cart
// @access  Private (Customer)
router.post('/checkout', auth, authorize('customer'), [
  body('deliveryAddressId').isMongoId().withMessage('Valid delivery address is required'),
  // Update line 28 to include the new payment methods:
body('paymentMethod').isIn(['cod', 'card', 'upi', 'netbanking', 'wallet', 'razorpay', 'cashfree']).withMessage('Valid payment method is required'),
  body('advancePercentage').optional().isInt({ min: 25, max: 100 }).withMessage('Advance percentage must be between 25-100'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    console.log('✅ Checkout request body:', req.body);

    const { deliveryAddressId, paymentMethod, advancePercentage = 25, notes } = req.body;

    // Check user verification status
    const currentUser = await User.findById(req.user._id);
    
    if (!currentUser.phoneVerified) {
      return res.status(403).json({
        success: false,
        message: 'Phone number must be verified to place orders',
        requiresVerification: true,
        verificationType: 'phone'
      });
    }

    if (!currentUser.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account must be activated to place orders',
        requiresVerification: true,
        verificationType: 'account_activation'
      });
    }

    // Get user's cart
    const cart = await Cart.findOne({ user: req.user._id })
      .populate({
        path: 'items.product',
        populate: {
          path: 'supplier'
        }
      });

    if (!cart || cart.items.length === 0) {
      return next(new ErrorHandler('Cart is empty', 400));
    }

    // Validate delivery address
    const user = await User.findById(req.user._id);
    const deliveryAddress = user.addresses.id(deliveryAddressId);

    if (!deliveryAddress) {
      return next(new ErrorHandler('Delivery address not found', 404));
    }

    // Validate cart items
    await cart.removeExpiredItems();
    const stockIssues = await cart.validateStock();
    
    if (stockIssues.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Some items in your cart are no longer available',
        errors: stockIssues
      });
    }

    // Group items by supplier (each supplier gets separate order)
    const supplierGroups = {};
    cart.items.forEach(item => {
      const supplierId = item.product.supplier._id.toString();
      if (!supplierGroups[supplierId]) {
        supplierGroups[supplierId] = {
          supplier: item.product.supplier,
          items: []
        };
      }
      supplierGroups[supplierId].items.push(item);
    });

    const orders = [];

    // Create order for each supplier
    for (const [supplierId, group] of Object.entries(supplierGroups)) {
      // Calculate pricing
      const subtotal = group.items.reduce((sum, item) => 
        sum + (item.quantity * item.priceAtTime), 0
      );
      
      const commissionRate = group.supplier.commissionRate || 5;
      const commission = Math.round((subtotal * commissionRate) / 100);
      
      // Calculate GST (simplified - should be per item)
      const gstAmount = Math.round((subtotal * 18) / 100);
      
      // Payment gateway charges (2.5% + GST) - Only for online payments
      let paymentGatewayCharges = 0;
      
      if (paymentMethod !== 'cod') {
        paymentGatewayCharges = Math.round(((subtotal + commission + gstAmount) * 2.5) / 100);
      }
      // ADD AFTER Line 157 (after const gstAmount = ...):

// Calculate transport cost
const transportCost = group.items.reduce((sum, item) => {
  const supplierCoords = {
    latitude: item.product.supplier.dispatchLocation?.coordinates?.[1] || 0,
    longitude: item.product.supplier.dispatchLocation?.coordinates?.[0] || 0
  };
  const customerCoords = {
    latitude: deliveryAddress.coordinates?.latitude || 0,
    longitude: deliveryAddress.coordinates?.longitude || 0
  };
  const distance = calculateDistance(
    supplierCoords.latitude, supplierCoords.longitude,
    customerCoords.latitude, customerCoords.longitude
  );
  return sum + calculateTransportCost(distance);
}, 0);
      
      const totalAmount = subtotal + commission + gstAmount + paymentGatewayCharges + transportCost;

      // Generate order ID
      const orderId = `AGK${Date.now()}${Math.random().toString(36).substr(2, 3).toUpperCase()}`;
      
      // FIXED: Create order with correct structure matching the model
      const order = new Order({
        orderId,
        customer: req.user._id, // FIXED: Use 'customer' instead of 'user'
        supplier: supplierId,
        
        // FIXED: Items with required unitPrice and totalPrice
                items: group.items.map(item => {
          const supplierCoords = {
            latitude: item.product.supplier.dispatchLocation?.coordinates?.[1] || 0,
            longitude: item.product.supplier.dispatchLocation?.coordinates?.[0] || 0
          };
          const customerCoords = {
            latitude: deliveryAddress.coordinates?.latitude || 0,
            longitude: deliveryAddress.coordinates?.longitude || 0
          };
          const distance = calculateDistance(
            supplierCoords.latitude, supplierCoords.longitude,
            customerCoords.latitude, customerCoords.longitude
          );
          const deliveryZone = getDeliveryZone(distance);
          const transportCost = calculateTransportCost(distance);
          const estimatedHours = Math.max(2, Math.round((distance / 40) * 100) / 100);

          return {
            product: item.product._id,
            quantity: item.quantity,
            unitPrice: item.priceAtTime,
            totalPrice: item.quantity * item.priceAtTime,
            specifications: item.specifications || {},
            distancePricing: {
              supplierLocation: {
                latitude: supplierCoords.latitude,
                longitude: supplierCoords.longitude,
                address: item.product.supplier.dispatchLocation?.address || item.product.supplier.companyAddress
              },
              customerLocation: {
                latitude: customerCoords.latitude,
                longitude: customerCoords.longitude,
                address: deliveryAddress.address
              },
              distance: {
                value: Math.round(distance * 100) / 100,
                source: 'haversine'
              },
              transportCost: transportCost,
              deliveryZone: deliveryZone,
              deliveryEstimate: {
                min: Math.floor(estimatedHours),
                max: Math.ceil(estimatedHours + 2),
                estimatedDate: new Date(Date.now() + (estimatedHours + 2) * 60 * 60 * 1000)
              }
            },
            productSnapshot: {
              name: item.product.name,
              description: item.product.description,
              category: item.product.category,
              subcategory: item.product.subcategory,
              unit: item.product.pricing?.unit || 'unit',
              brand: item.product.brand || 'Unknown',
              imageUrl: (() => {
                if (item.product.images && item.product.images.length > 0) {
                  const primaryImage = item.product.images.find(img => img.isPrimary && img.url);
                  if (primaryImage) return primaryImage.url;
                  const firstImage = item.product.images.find(img => img.url);
                  if (firstImage) return firstImage.url;
                }
                return null;
              })(),
              images: item.product.images || []
            }
          };
        }),
        
        // FIXED: Pricing structure matching the model
        pricing: {
          subtotal: subtotal, // FIXED: Required field
          transportCost: group.items.reduce((sum, item) => {
            const supplierCoords = {
              latitude: item.product.supplier.dispatchLocation?.coordinates?.[1] || 0,
              longitude: item.product.supplier.dispatchLocation?.coordinates?.[0] || 0
            };
            const customerCoords = {
              latitude: deliveryAddress.coordinates?.latitude || 0,
              longitude: deliveryAddress.coordinates?.longitude || 0
            };
            const distance = calculateDistance(
              supplierCoords.latitude, supplierCoords.longitude,
              customerCoords.latitude, customerCoords.longitude
            );
            return sum + calculateTransportCost(distance);
          }, 0),
          gstAmount: gstAmount,
          commission: commission,
          paymentGatewayCharges: paymentGatewayCharges,
          totalAmount: totalAmount // FIXED: Required field
        },
        
        // FIXED: Payment structure matching the model
        payment: {
          method: paymentMethod, // FIXED: Required field
          status: 'pending',
          advancePercentage: paymentMethod === 'cod' ? 100 : advancePercentage,
          advanceAmount: paymentMethod === 'cod' ? totalAmount : Math.round((totalAmount * advancePercentage) / 100),
          remainingAmount: paymentMethod === 'cod' ? 0 : totalAmount - Math.round((totalAmount * advancePercentage) / 100)
        },
        
        // Delivery address
        deliveryAddress: {
          address: deliveryAddress.address,
          city: deliveryAddress.city,
          state: deliveryAddress.state,
          pincode: deliveryAddress.pincode,
          coordinates: deliveryAddress.coordinates || { latitude: 0, longitude: 0 }
        },
        
        // FIXED: Status using valid enum value
        status: paymentMethod === 'cod' ? 'confirmed' : 'pending_payment',
        
        // FIXED: Cooling period (will be auto-set by pre-save middleware, but we can set startTime)
        coolingPeriod: {
          startTime: new Date(),
          isActive: paymentMethod === 'cod', // Only COD orders get cooling period
          canModify: paymentMethod === 'cod'
        },
        
        // Timeline
         timeline: [{
          status: paymentMethod === 'cod' ? 'pending' : 'pending_payment',
          timestamp: new Date(),
          note: paymentMethod === 'cod' ? 'Order placed - COD' : 'Order created - awaiting payment',
          updatedBy: req.user._id
        }],
        
        // Additional fields
        notes: notes || '',
        delivery: {
          estimatedTime: '2-3 business days'
        }
      });

      console.log('🛍️ Creating order with structure:', {
        orderId: order.orderId,
        customer: order.customer,
        supplier: order.supplier,
        itemsCount: order.items.length,
        pricing: order.pricing,
        payment: order.payment,
        status: order.status,
        coolingPeriod: order.coolingPeriod
      });

      await order.save();
      orders.push(order);

      // Update product stock
      // for (const item of group.items) {
      //   await Product.findByIdAndUpdate(item.product._id, {
      //     $inc: { 
      //       'stock.reserved': item.quantity,
      //       'stock.available': -item.quantity
      //     }
      //   });
      // }

            // 🔥 CONDITIONAL: Only send notifications for COD orders, not online payments
      if (order.payment.method === 'cod') {
        try {
          // Get customer details with fresh data
          const customer = await User.findById(req.user._id);
          
          // Get supplier details with user info for email
          const supplierDetails = await Supplier.findById(order.supplier)
            .populate('user', 'email');
          
          console.log(`📬 Starting COD notification process for Order ${order.orderId}`);
          
          // 1. Send customer notifications (SMS + Email)
          console.log(`📱📧 Sending customer notifications to ${customer.name} (Phone: ${customer.phoneNumber}, Email: ${customer.email})`);
          const customerNotificationResult = await sendOrderPlacementNotification(customer, order);
          
          if (customerNotificationResult.success) {
            console.log(`✅ Customer notifications sent successfully for Order ${order.orderId}:`, {
              sms: customer.phoneNumber ? 'Sent' : 'No phone',
              email: customer.email ? 'Sent' : 'No email',
              total: customerNotificationResult.notificationsSent
            });
          } else {
            console.error(`❌ Failed to send customer notifications for Order ${order.orderId}:`, customerNotificationResult.error);
          }
              let supplierNotificationResult = null; // Initialize to prevent undefined error
          // 2. Send supplier notifications (SMS + Email)
          if (supplierDetails) {

            console.log(`📱📧 Sending supplier notifications to ${supplierDetails.companyName} (Phone: ${supplierDetails.contactPersonNumber}, Email: ${supplierDetails.email || supplierDetails.user?.email})`);
            
            // Prepare supplier email (try supplier.email first, then user.email)
            const supplierEmail = supplierDetails.email || supplierDetails.user?.email;
            const supplierForNotification = {
              ...supplierDetails.toObject(),
              email: supplierEmail
            };
            
            
            const supplierNotificationResult = await sendSupplierOrderNotification(supplierForNotification, {
              ...order.toObject(),
              customer: {
                name: customer.name,
                phoneNumber: customer.phoneNumber,
                email: customer.email
              }
            });
            
            if (supplierNotificationResult.success !== false) {
              console.log(`✅ Supplier notifications sent successfully for Order ${order.orderId}:`, {
                sms: supplierDetails.contactPersonNumber ? 'Sent' : 'No phone',
                email: supplierEmail ? 'Sent' : 'No email',
                total: supplierNotificationResult.sent || 0
              });
            } else {
              console.error(`❌ Failed to send supplier notifications for Order ${order.orderId}:`, supplierNotificationResult.error);
            }
          }         else {
            console.warn(`⚠️ Supplier details not found for Order ${order.orderId}`);
            // Set a default result when supplier details are missing
            supplierNotificationResult = { success: false, sent: 0, error: 'Supplier details not found' };
          }
          
          // 3. Log comprehensive notification summary
          const totalCustomerNotifications = customerNotificationResult.notificationsSent || 0;
          const totalSupplierNotifications = (supplierNotificationResult && supplierNotificationResult.sent) || 0;
          
          console.log(`📊 COD NOTIFICATION SUMMARY for Order ${order.orderId}:`, {
            customer: {
              name: customer.name,
              phone: customer.phoneNumber,
              email: customer.email,
              notificationsSent: totalCustomerNotifications
            },
            supplier: {
              company: supplierDetails?.companyName,
              phone: supplierDetails?.contactPersonNumber,
              email: supplierDetails?.email || supplierDetails?.user?.email,
              notificationsSent: totalSupplierNotifications
            },
            totalNotificationsSent: totalCustomerNotifications + totalSupplierNotifications,
            orderValue: `₹${order.pricing.totalAmount.toLocaleString('en-IN')}`,
            timestamp: new Date().toISOString()
          });
          
        } catch (notificationError) {
          // Don't fail the order if notifications fail - just log the error
          console.error(`❌ COD NOTIFICATION ERROR for Order ${order.orderId}:`, {
            error: notificationError.message,
            stack: notificationError.stack,
            orderValue: `₹${order.pricing.totalAmount.toLocaleString('en-IN')}`,
            customer: currentUser.name,
            supplier: group.supplier.companyName
          });
          
          // Send a basic SMS fallback to customer if possible
          try {
            if (currentUser.phoneNumber) {
              await sendSMS(
                currentUser.phoneNumber, 
                `Order ${order.orderId} placed successfully (COD)! Total: ₹${order.pricing.totalAmount.toLocaleString('en-IN')}. Track at aggrekart.com - Aggrekart`
              );
              console.log(`📱 Sent fallback SMS to customer for COD Order ${order.orderId}`);
            }
          } catch (fallbackError) {
            console.error(`❌ Fallback SMS also failed for Order ${order.orderId}:`, fallbackError.message);
          }
        }
      } else {
        // For online payment orders, don't send notifications yet
        console.log(`⏳ Order ${order.orderId} created with ${order.payment.method} payment - awaiting payment verification before sending notifications`);
      }
    }
if (cart.appliedCoins && cart.appliedCoins.discount && cart.appliedCoins.discount > 0) {
      try {
        console.log('💰 Processing coin deduction:', cart.appliedCoins);
        
        // Get user's loyalty record
        let userLoyalty = await UserLoyalty.findOne({ user: req.user._id });
        
        if (!userLoyalty) {
          userLoyalty = new UserLoyalty({
            user: req.user._id,
            aggreCoins: { balance: 0, totalEarned: 0, totalRedeemed: 0 },
            transactions: []
          });
        }
        
        const coinsToDeduct = cart.appliedCoins.amount || cart.appliedCoins.discount;
        const discountAmount = cart.appliedCoins.discount;
        
        // Check if user has enough coins
        if (userLoyalty.aggreCoins.balance >= coinsToDeduct) {
          // Deduct coins from balance
          userLoyalty.aggreCoins.balance -= coinsToDeduct;
          userLoyalty.aggreCoins.totalRedeemed += coinsToDeduct;
          
          // Add transaction record
          userLoyalty.transactions.push({
            type: 'redeemed',
            amount: coinsToDeduct,
            description: `Coins redeemed for order(s): ${orders.map(o => o.orderId).join(', ')}`,
            order: orders[0]._id, // Link to first order
            date: new Date()
          });
          
          await userLoyalty.save();
          
          console.log('✅ Coins deducted successfully:', {
            userId: req.user._id,
            coinsDeducted: coinsToDeduct,
            discountAmount: discountAmount,
            remainingBalance: userLoyalty.aggreCoins.balance
          });
        } else {
          console.error('❌ Insufficient coins balance:', {
            required: coinsToDeduct,
            available: userLoyalty.aggreCoins.balance
          });
          // Don't fail the order, but log the issue
        }
        
      } catch (coinError) {
        console.error('❌ Error processing coin deduction:', coinError);
        // Don't fail the order for coin processing errors
      }
    }
// Add this code right after the coin deduction block (around line 500, after the coin processing)

    // 🎫 COUPON USAGE TRACKING - Add this after coin deduction
    if (cart.appliedCoupon && cart.appliedCoupon.code && cart.appliedCoupon.discountAmount > 0) {
      try {
        console.log('🎫 Processing coupon usage:', cart.appliedCoupon);
        
        // Get user's loyalty record
        let userLoyalty = await UserLoyalty.findOne({ user: req.user._id });
        
        if (!userLoyalty) {
          userLoyalty = new UserLoyalty({
            user: req.user._id,
            aggreCoins: { balance: 0, totalEarned: 0, totalRedeemed: 0 },
            transactions: [],
            coupons: []
          });
        }

        // Find the coupon in user's loyalty record
        const couponIndex = userLoyalty.coupons.findIndex(coupon => 
          coupon.couponProgram.toString() === cart.appliedCoupon.programId.toString() && 
          !coupon.used
        );

        if (couponIndex !== -1) {
          // Mark coupon as used
          userLoyalty.coupons[couponIndex].used = true;
          userLoyalty.coupons[couponIndex].usedAt = new Date();
          userLoyalty.coupons[couponIndex].usedInOrder = orders[0]._id; // Link to first order
          userLoyalty.coupons[couponIndex].discountApplied = cart.appliedCoupon.discountAmount;

          // Add transaction record for coupon usage
          userLoyalty.transactions.push({
            type: 'coupon_used',
            amount: 0, // Coupons don't affect coin balance
            description: `Coupon ${cart.appliedCoupon.code} used in order(s): ${orders.map(o => o.orderId).join(', ')}`,
            order: orders[0]._id,
            date: new Date(),
            metadata: {
              couponId: userLoyalty.coupons[couponIndex]._id,
              couponCode: cart.appliedCoupon.code,
              discountApplied: cart.appliedCoupon.discountAmount,
              orderId: orders[0].orderId
            }
          });

          await userLoyalty.save();

          console.log('✅ Coupon usage tracked successfully:', {
            userId: req.user._id,
            couponCode: cart.appliedCoupon.code,
            discountAmount: cart.appliedCoupon.discountAmount,
            orderIds: orders.map(o => o.orderId),
            usedAt: new Date()
          });
        } else {
          console.warn('⚠️ Coupon not found in user loyalty record:', {
            couponCode: cart.appliedCoupon.code,
            programId: cart.appliedCoupon.programId,
            userId: req.user._id
          });
          
          // Create a new coupon record if it doesn't exist (fallback)
          const LoyaltyProgram = require('../models/LoyaltyProgram');
          const couponProgram = await LoyaltyProgram.findById(cart.appliedCoupon.programId);
          
          if (couponProgram) {
            userLoyalty.coupons.push({
              couponProgram: cart.appliedCoupon.programId,
              awardedAt: new Date(), // Assume it was just awarded
              awardedBy: null, // System awarded
              reason: 'Applied during order',
              used: true,
              usedAt: new Date(),
              usedInOrder: orders[0]._id,
              discountApplied: cart.appliedCoupon.discountAmount
            });

            // Add transaction record
            userLoyalty.transactions.push({
              type: 'coupon_used',
              amount: 0,
              description: `Coupon ${cart.appliedCoupon.code} used in order(s): ${orders.map(o => o.orderId).join(', ')}`,
              order: orders[0]._id,
              date: new Date(),
              metadata: {
                couponCode: cart.appliedCoupon.code,
                discountApplied: cart.appliedCoupon.discountAmount,
                orderId: orders[0].orderId,
                note: 'Coupon record created during order'
              }
            });

            await userLoyalty.save();
            
            console.log('✅ Coupon usage tracked (created new record):', {
              couponCode: cart.appliedCoupon.code,
              discountAmount: cart.appliedCoupon.discountAmount,
              orderIds: orders.map(o => o.orderId)
            });
          }
        }
        
      } catch (couponError) {
        console.error('❌ Error processing coupon usage:', couponError);
        // Don't fail the order for coupon tracking errors, but log them
      }
    }
    // Clear cart after successful order creation
    await Cart.findOneAndUpdate(
      { user: req.user._id },
      { $set: { items: [] } }
    );

    console.log('✅ Orders created successfully:', orders.length);

        // Handle response based on payment method
    if (orders[0].payment.method === 'cod') {
      // COD orders can be confirmed immediately
      res.status(201).json({
        success: true,
        message: `${orders.length} COD order(s) created successfully`,
        data: {
          orders: orders.map(order => ({
            orderId: order.orderId,
            totalAmount: order.pricing.totalAmount,
            advanceAmount: order.payment.advanceAmount,
            balanceAmount: order.payment.remainingAmount,
            paymentMethod: order.payment.method,
            status: order.status,
            coolingPeriod: order.coolingPeriod,
            estimatedDelivery: order.delivery.estimatedTime
          })),
          order: orders[0],
          notificationSummary: {
            ordersCreated: orders.length,
            notificationsEnabled: true,
            message: 'Order confirmation notifications sent via SMS and Email'
          }
        }
      });
    } else {
      // Online payment orders need payment first
      res.status(201).json({
        success: true,
        message: `${orders.length} order(s) created - awaiting payment`,
        data: {
          orders: orders.map(order => ({
            orderId: order.orderId,
            totalAmount: order.pricing.totalAmount,
            advanceAmount: order.payment.advanceAmount,
            balanceAmount: order.payment.remainingAmount,
            paymentMethod: order.payment.method,
            status: order.status,
            requiresPayment: true
          })),
          order: orders[0],
          paymentRequired: true,
          message: 'Complete payment to confirm your order'
        }
      });
    }

  } catch (error) {
    console.error('❌ Checkout error:', error);
    next(error);
  }
});

// @route   POST /api/orders/:orderId/payment/verify
// @desc    Verify payment and update order
// @access  Private (Customer)
router.post('/:orderId/payment/verify', auth, authorize('customer'), [
  param('orderId').notEmpty().withMessage('Order ID is required'),
  body('paymentId').notEmpty().withMessage('Payment ID is required'),
  body('signature').notEmpty().withMessage('Payment signature is required')
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

    const { orderId } = req.params;
    const { paymentId, signature } = req.body;

    // Find order
    const order = await Order.findOne({
      $or: [{ _id: orderId }, { orderId }],
      customer: req.user._id
    });

    if (!order) {
      return next(new ErrorHandler('Order not found', 404));
    }

    // Verify payment
    const isPaymentValid = await verifyPayment({
      orderId: order.orderId,
      paymentId,
      signature
    });

    if (!isPaymentValid) {
      order.payment.status = 'failed';
      await order.save();
      
      return next(new ErrorHandler('Payment verification failed', 400));
    }

    // Update order payment status
    order.payment.status = 'paid';
    order.payment.transactionId = paymentId;
    order.payment.paidAt = new Date();
    order.updateStatus('preparing', 'Payment verified. Order is being prepared.', req.user._id);

    await order.save();

    // Update customer order count and membership tier
    const user = await User.findById(req.user._id);
    user.orderCount += 1;
    user.totalOrderValue += order.pricing.totalAmount;
    user.updateMembershipTier();
    
    // Award aggre coins (2% of order value)
    const coinsEarned = Math.floor(order.pricing.totalAmount * 0.02);
    user.aggreCoins += coinsEarned;
    
    await user.save();


    // 🔥 ENHANCED: Send payment confirmation notifications
        // 🔥 ENHANCED: Send complete order confirmation notifications after payment
    try {
      const customer = await User.findById(req.user._id);
      
      // Get supplier details with user info for email
      const supplierDetails = await Supplier.findById(order.supplier)
        .populate('user', 'email');
      
      console.log(`📬 Starting post-payment notification process for Order ${order.orderId}`);
      
      // 1. Send customer notifications (SMS + Email) 
      console.log(`📱📧 Sending customer notifications to ${customer.name} (Phone: ${customer.phoneNumber}, Email: ${customer.email})`);
      const customerNotificationResult = await sendOrderPlacementNotification(customer, order);
      
      if (customerNotificationResult.success) {
        console.log(`✅ Customer notifications sent successfully for Order ${order.orderId}:`, {
          sms: customer.phoneNumber ? 'Sent' : 'No phone',
          email: customer.email ? 'Sent' : 'No email',
          total: customerNotificationResult.notificationsSent
        });
      } else {
        console.error(`❌ Failed to send customer notifications for Order ${order.orderId}:`, customerNotificationResult.error);
      }
      
      // 2. Send supplier notifications (SMS + Email)
      if (supplierDetails) {
        console.log(`📱📧 Sending supplier notifications to ${supplierDetails.companyName} (Phone: ${supplierDetails.contactPersonNumber}, Email: ${supplierDetails.email || supplierDetails.user?.email})`);
        
        // Prepare supplier email (try supplier.email first, then user.email)
        const supplierEmail = supplierDetails.email || supplierDetails.user?.email;
        const supplierForNotification = {
          ...supplierDetails.toObject(),
          email: supplierEmail
        };
        
        const supplierNotificationResult = await sendSupplierOrderNotification(supplierForNotification, {
          ...order.toObject(),
          customer: {
            name: customer.name,
            phoneNumber: customer.phoneNumber,
            email: customer.email
          }
        });
        
        if (supplierNotificationResult.success !== false) {
          console.log(`✅ Supplier notifications sent successfully for Order ${order.orderId}:`, {
            sms: supplierDetails.contactPersonNumber ? 'Sent' : 'No phone',
            email: supplierEmail ? 'Sent' : 'No email',
            total: supplierNotificationResult.sent || 0
          });
        } else {
          console.error(`❌ Failed to send supplier notifications for Order ${order.orderId}:`, supplierNotificationResult.error);
        }
      } else {
        console.warn(`⚠️ Supplier details not found for Order ${order.orderId}`);
      }
      
      // 3. Send payment success SMS
      if (customer.phoneNumber) {
        const paymentSMS = `💳 Payment Successful!

Order: ${order.orderId}
Amount: ₹${order.pricing.totalAmount.toLocaleString('en-IN')}
Transaction: ${paymentId.substring(0, 12)}...
Status: Being Prepared

Your order is now being prepared for dispatch. Track: aggrekart.com/orders/${order.orderId}

Aggrekart 🏗️`;

        await sendSMS(customer.phoneNumber, paymentSMS);
        console.log(`📱 Payment confirmation SMS sent for Order ${order.orderId}`);
      }
      
    } catch (notificationError) {
      console.error(`❌ Payment notification error for Order ${order.orderId}:`, notificationError.message);
      // Don't fail the payment verification for notification errors
    }
    res.json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        order: {
          orderId: order.orderId,
          status: order.status,
          paymentStatus: order.payment.status
        },
        coinsEarned,
        notifications: {
          paymentConfirmationSent: true
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/orders
// @desc    Get user's orders
// @access  Private (Customer)
router.get('/', auth, authorize('customer'), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive'),
  query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Limit must be between 1 and 20'),
  query('status').optional().isIn(['pending', 'preparing', 'processing', 'dispatched', 'delivered', 'cancelled']).withMessage('Invalid status')
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

    const { page = 1, limit = 10, status } = req.query;

    const filter = { customer: req.user._id };
    if (status) filter.status = status;

    const orders = await Order.getOrdersWithFilters(filter, {
      page: parseInt(page),
      limit: parseInt(limit),
      populate: ['supplier']
    });

    const total = await Order.countDocuments(filter);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/orders/:orderId
// @desc    Get single order details
// @access  Private (Customer/Supplier)
router.get('/:orderId', auth, [
  param('orderId').notEmpty().withMessage('Order ID is required')
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

    const { orderId } = req.params;

    // Build filter based on user role
    let filter = {
      $or: [{ _id: orderId }, { orderId }]
    };

    if (req.user.role === 'customer') {
      filter.customer = req.user._id;
    } else if (req.user.role === 'supplier') {
      const supplier = await Supplier.findOne({ user: req.user._id });
      if (!supplier) {
        return next(new ErrorHandler('Supplier profile not found', 404));
      }
      filter.supplier = supplier._id;
    }

          const order = await Order.findOne(filter)
      .populate('customer', 'name email phoneNumber customerId addresses')
           .populate('supplier', 'companyName contactPersonName contactPersonNumber email companyAddress city state pincode rating supplierId')
      .populate('items.product', 'name category pricing.unit images brand hsnCode');

console.log('🔍 ORDER DEBUG - Raw supplier data:', order?.supplier ? {
      _id: order.supplier._id,
      companyName: order.supplier.companyName,
      companyAddress: order.supplier.companyAddress,
      city: order.supplier.city,
      state: order.supplier.state,
      pincode: order.supplier.pincode,
      contactPersonName: order.supplier.contactPersonName,
      email: order.supplier.email
    } : 'No supplier found');
        if (!order) {
      return next(new ErrorHandler('Order not found', 404));
    }

    // Ensure productSnapshot images are available if product images are missing
    if (order.items && order.items.length > 0) {
      order.items.forEach(item => {
        // If productSnapshot is missing images but product has images, copy them
        if (!item.productSnapshot?.images && item.product?.images?.length > 0) {
          if (!item.productSnapshot) {
            item.productSnapshot = {};
          }
          item.productSnapshot.images = item.product.images;
          
          // Also set the single imageUrl for backward compatibility
          const primaryImage = item.product.images.find(img => img.isPrimary && img.url);
          const firstImage = item.product.images.find(img => img.url);
          item.productSnapshot.imageUrl = primaryImage?.url || firstImage?.url || null;
        }
        
        // Ensure essential productSnapshot fields exist
        if (item.product && !item.productSnapshot?.name) {
          if (!item.productSnapshot) item.productSnapshot = {};
          item.productSnapshot.name = item.productSnapshot.name || item.product.name;
          item.productSnapshot.category = item.productSnapshot.category || item.product.category;
          item.productSnapshot.brand = item.productSnapshot.brand || item.product.brand;
        }
      });
    }

    // Add cooling period status

    // Add cooling period status
    const orderResponse = {
      ...order.toObject(),
      isCoolingPeriodActive: order.isCoolingPeriodActive(),
      canModify: order.isCoolingPeriodActive() && order.coolingPeriod.canModify
    };

    res.json({
      success: true,
      data: { order: orderResponse }
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/orders/:orderId/cancel
// @desc    Cancel order (during cooling period)
// @access  Private (Customer)
router.put('/:orderId/cancel', auth, authorize('customer'), [
  param('orderId').notEmpty().withMessage('Order ID is required'),
  body('reason').trim().isLength({ min: 5 }).withMessage('Cancellation reason must be at least 5 characters')
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

    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({
      $or: [{ _id: orderId }, { orderId }],
      customer: req.user._id
    });

    if (!order) {
      return next(new ErrorHandler('Order not found', 404));
    }

    if (!order.isCoolingPeriodActive()) {
      return next(new ErrorHandler('Order cannot be cancelled. Cooling period has expired.', 400));
    }

    if (order.status === 'cancelled') {
      return next(new ErrorHandler('Order is already cancelled', 400));
    }

    // Calculate refund amount
    const refundCalculation = order.calculateCoolingPeriodRefund();
    
    if (!refundCalculation.canRefund) {
      return next(new ErrorHandler(refundCalculation.message, 400));
    }

    // Update order status
    order.updateStatus('cancelled', 'Order cancelled by customer', req.user._id);
    order.cancellation = {
      reason,
      cancelledBy: req.user._id,
      cancelledAt: new Date(),
      refundAmount: refundCalculation.refundAmount,
      deductionAmount: refundCalculation.deductionAmount,
      deductionPercentage: refundCalculation.deductionPercentage
    };
    order.payment.status = 'refunded';

    await order.save();

    // Release reserved stock
    for (const item of order.items) {
      const product = await Product.findById(item.product);
      if (product) {
        product.stock.reserved = Math.max(0, product.stock.reserved - item.quantity);
        product.stock.available = product.stock.available + item.quantity;
        await product.save();
      }
    }

    // 🔥 ENHANCED: Send cancellation notifications
    try {
      const customer = await User.findById(req.user._id);
      
      // Send cancellation SMS to customer
      if (customer.phoneNumber) {
        const cancellationSMS = `❌ Order Cancelled

Order: ${order.orderId}
Reason: ${reason}
Refund: ₹${refundCalculation.refundAmount.toLocaleString('en-IN')}
${refundCalculation.deductionAmount > 0 ? `Deduction: ₹${refundCalculation.deductionAmount.toLocaleString('en-IN')}` : ''}

Refund will be processed within 3-5 business days.

Aggrekart 🏗️`;

        await sendSMS(customer.phoneNumber, cancellationSMS);
        console.log(`📱 Cancellation SMS sent for Order ${order.orderId}`);
      }
      
      // Notify supplier about cancellation
      const supplier = await Supplier.findById(order.supplier);
      if (supplier && supplier.contactPersonNumber) {
        const supplierCancellationSMS = `🔔 Order Cancelled

Order: ${order.orderId}
Customer: ${customer.name}
Reason: ${reason}

Please stop preparation if not started.

Aggrekart Supplier`;

        await sendSMS(supplier.contactPersonNumber, supplierCancellationSMS);
        console.log(`📱 Supplier cancellation SMS sent for Order ${order.orderId}`);
      }
      
    } catch (notificationError) {
      console.error(`❌ Cancellation notification error for Order ${order.orderId}:`, notificationError.message);
    }

    // Process refund (integrate with payment gateway)
    // await processRefund(order.payment.transactionId, refundCalculation.refundAmount);

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: {
        order: {
          orderId: order.orderId,
          status: order.status,
          refundDetails: order.cancellation
        },
        notifications: {
          cancellationNotificationSent: true
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/orders/:orderId/modify
// @desc    Modify order (during cooling period)
// @access  Private (Customer)
router.put('/:orderId/modify', auth, authorize('customer'), [
  param('orderId').notEmpty().withMessage('Order ID is required'),
  body('deliveryAddressId').optional().isMongoId().withMessage('Valid delivery address required'),
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

    const { orderId } = req.params;
    const { deliveryAddressId, notes } = req.body;

    const order = await Order.findOne({
      $or: [{ _id: orderId }, { orderId }],
      customer: req.user._id
    });

    if (!order) {
      return next(new ErrorError('Order not found', 404));
    }

    if (!order.isCoolingPeriodActive()) {
      return next(new ErrorHandler('Order cannot be modified. Cooling period has expired.', 400));
    }

    const user = await User.findById(req.user._id);
    let updated = false;

    // Update delivery address if provided
    if (deliveryAddressId) {
      const newAddress = user.addresses.id(deliveryAddressId);
      if (!newAddress) {
        return next(new ErrorHandler('Delivery address not found', 404));
      }
      
      order.deliveryAddress = {
        address: newAddress.address,
        city: newAddress.city,
        state: newAddress.state,
        pincode: newAddress.pincode,
        coordinates: newAddress.coordinates
      };
      updated = true;
    }

    // Update notes if provided
    if (notes !== undefined) {
      order.notes = notes;
      updated = true;
    }

    if (!updated) {
      return next(new ErrorHandler('No modifications provided', 400));
    }

    order.timeline.push({
      status: order.status,
      timestamp: new Date(),
      note: 'Order modified by customer',
      updatedBy: req.user._id
    });

    await order.save();

    res.json({
      success: true,
      message: 'Order modified successfully',
      data: { order }
    });

  } catch (error) {
    next(error);
  }
});
// Replace the invoice route with this EXACT 1:1 copy of working route:

// @route   POST /api/orders/:orderId/invoice
// @desc    Download invoice PDF for an order - EXACT copy of working pattern
// @access  Private (Customer)
router.post('/:orderId/download-invoice', auth, authorize('customer'), async (req, res, next) => {
  try {
    const { orderId } = req.params;

    // Find order
    let filter = {
      $or: [{ _id: orderId }, { orderId }],
      customer: req.user._id
    };

    const order = await Order.findOne(filter)
      .populate('customer', 'name email phoneNumber')
      .populate('supplier', 'companyName contactPersonName email companyAddress city state pincode')
      .populate('items.product', 'name description category');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Generate invoice number if not exists
    if (!order.invoice || !order.invoice.invoiceNumber) {
      if (!order.invoice) {
        order.invoice = {};
      }
      order.invoice.invoiceNumber = `INV-${order.orderId}`;
      order.invoice.generatedAt = new Date();
      await order.save();
    }
    
    // EXACT PDF generation call from working users.js - using ReportGenerator method
    const pdfBuffer = await generateInvoicePDF(order);
    
    // EXACT headers from working users.js route
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${order.orderId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    // EXACT send method from working users.js route
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('PDF export error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export invoice as PDF',
      error: error.message
    });
  }
});

// EXACT copy of working PDF generation function from reports.js
// Replace the existing generateInvoicePDF function with this comprehensive version:

async function generateInvoicePDF(order) {
  try {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ 
      margin: 40,
      size: 'A4'
    });
    const buffers = [];
    
    doc.on('data', buffers.push.bind(buffers));
    
    // Helper functions
    const formatDate = (date) => {
      if (!date) return 'N/A';
      return new Date(date).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };
    
    const formatCurrency = (amount) => `Rs.${(amount || 0).toLocaleString('en-IN', { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
    
    const formatTime = (date) => {
      if (!date) return '';
      return new Date(date).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    let yPos = 50;
    const pageWidth = 595; // A4 width
    const margin = 40;
    const contentWidth = pageWidth - (margin * 2);

    // =============== HEADER SECTION ===============
    // Company Logo Area and Title
    doc.rect(margin, yPos, contentWidth, 80).fillAndStroke('#f8f9fa', '#e9ecef');
    
    // Company name and branding
    doc.fontSize(28).font('Helvetica-Bold').fillColor('#2563eb')
       .text('AGGREKART', margin + 20, yPos + 15);
    
    doc.fontSize(12).font('Helvetica').fillColor('#666')
       .text('Building Dreams, Delivering Quality', margin + 20, yPos + 50)
       .text('GST No: 29ABCDE1234F1Z5 | PAN: ABCDE1234F', margin + 20, yPos + 65);

    // Invoice title (right side)
    doc.fontSize(24).font('Helvetica-Bold').fillColor('#dc2626')
       .text('INVOICE', pageWidth - 150, yPos + 15, { align: 'right', width: 100 });
    
    // Invoice number and date (right side)
    const invoiceNumber = order.invoice?.invoiceNumber || `INV-${order.orderId}`;
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#333')
       .text(`Invoice #: ${invoiceNumber}`, pageWidth - 200, yPos + 45, { align: 'right', width: 150 });
    doc.fontSize(10).font('Helvetica').fillColor('#666')
       .text(`Date: ${formatDate(order.invoice?.generatedAt || order.createdAt)}`, pageWidth - 200, yPos + 60, { align: 'right', width: 150 });

    yPos += 100;

    // =============== BILLING INFORMATION SECTION ===============
    // Section header
    doc.rect(margin, yPos, contentWidth, 25).fill('#2563eb');
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#ffffff')
       .text('BILLING INFORMATION', margin + 10, yPos + 6);
    yPos += 35;

    // Two column layout for billing info
    const leftColX = margin + 10;
    const rightColX = margin + (contentWidth / 2) + 10;
    const colWidth = (contentWidth / 2) - 20;

    // Left column - Bill To
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#333')
       .text('BILL TO:', leftColX, yPos);
    yPos += 20;

    const billToInfo = [
      order?.customer?.name || 'N/A',
      order?.customer?.email || 'N/A',
      order?.customer?.phoneNumber || 'N/A'
    ];

    billToInfo.forEach(info => {
      doc.fontSize(10).font('Helvetica').fillColor('#666')
         .text(info, leftColX, yPos);
      yPos += 15;
    });

    // Reset yPos for right column
    yPos -= (billToInfo.length * 15) + 20;

    // Right column - Ship To (if delivery address exists)
    if (order?.delivery?.address) {
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#333')
         .text('SHIP TO:', rightColX, yPos);
      yPos += 20;

      const addr = order.delivery.address;
      const shipToInfo = [
        addr.name || order?.customer?.name || 'N/A',
        addr.addressLine1 || 'N/A',
        addr.addressLine2 || '',
        `${addr.city || ''}, ${addr.state || ''} - ${addr.pincode || ''}`,
        addr.phoneNumber || order?.customer?.phoneNumber || ''
      ].filter(line => line.trim() !== '');

      shipToInfo.forEach(info => {
        doc.fontSize(10).font('Helvetica').fillColor('#666')
           .text(info, rightColX, yPos, { width: colWidth });
        yPos += 15;
      });
    } else {
      // Order details if no shipping address
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#333')
         .text('ORDER DETAILS:', rightColX, yPos);
      yPos += 20;

      const orderDetails = [
        `Order ID: ${order?.orderId || 'N/A'}`,
        `Order Date: ${formatDate(order?.createdAt)}`,
        `Status: ${(order?.status || 'pending').toUpperCase()}`,
        `Payment Method: ${(order?.payment?.method || 'N/A').toUpperCase()}`
      ];

      orderDetails.forEach(info => {
        doc.fontSize(10).font('Helvetica').fillColor('#666')
           .text(info, rightColX, yPos, { width: colWidth });
        yPos += 15;
      });
    }

    yPos = Math.max(yPos + 20, 280); // Ensure consistent spacing

    // =============== ITEMS TABLE SECTION ===============
    // Table header
    doc.rect(margin, yPos, contentWidth, 25).fill('#2563eb');
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#ffffff')
       .text('ORDER ITEMS', margin + 10, yPos + 6);
    yPos += 35;

    // Table column headers
    const tableTop = yPos;
    const itemCol = margin + 10;
    const qtyCol = margin + 280;
    const priceCol = margin + 350;
    const amountCol = margin + 450;

    doc.rect(margin, tableTop, contentWidth, 20).fillAndStroke('#f8f9fa', '#e9ecef');
    
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#333');
    doc.text('DESCRIPTION', itemCol, tableTop + 6);
    doc.text('QTY', qtyCol, tableTop + 6);
    doc.text('UNIT PRICE', priceCol, tableTop + 6);
    doc.text('AMOUNT', amountCol, tableTop + 6);
    
    yPos = tableTop + 25;

    // Table rows
    if (order?.items && order.items.length > 0) {
      order.items.forEach((item, index) => {
        const isEven = index % 2 === 0;
        if (isEven) {
          doc.rect(margin, yPos - 2, contentWidth, 30).fill('#fafafa');
        }

        const itemName = item?.productSnapshot?.name || item?.product?.name || `Item ${index + 1}`;
        const quantity = item?.quantity || 1;
        const unitPrice = item?.unitPrice || 0;
        const totalPrice = item?.totalPrice || (unitPrice * quantity);

        // Item description (with wrapping)
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333');
        doc.text(itemName, itemCol, yPos, { width: 250, height: 20 });
        
        // Specifications (if any)
        if (item?.specifications?.selectedVariant || item?.specifications?.customRequirements) {
          const specs = [];
          if (item.specifications.selectedVariant) specs.push(`Variant: ${item.specifications.selectedVariant}`);
          if (item.specifications.customRequirements) specs.push(`Notes: ${item.specifications.customRequirements}`);
          
          doc.fontSize(8).font('Helvetica').fillColor('#666')
             .text(specs.join(' | '), itemCol, yPos + 12, { width: 250 });
        }

        // Quantity, Price, Amount
        doc.fontSize(10).font('Helvetica').fillColor('#333');
        doc.text(quantity.toString(), qtyCol, yPos + 6, { align: 'center', width: 50 });
        doc.text(formatCurrency(unitPrice), priceCol, yPos + 6, { align: 'right', width: 80 });
        doc.text(formatCurrency(totalPrice), amountCol, yPos + 6, { align: 'right', width: 80 });

        yPos += 35;
      });
    } else {
      doc.fontSize(10).font('Helvetica').fillColor('#666')
         .text('No items found', itemCol, yPos + 10);
      yPos += 30;
    }

    // Table bottom border
    doc.moveTo(margin, yPos).lineTo(pageWidth - margin, yPos).stroke('#e9ecef');
    yPos += 20;

    // =============== PRICING SUMMARY SECTION ===============
    if (order?.pricing) {
      // Summary box
      const summaryBoxY = yPos;
      const summaryBoxHeight = 140;
      doc.rect(margin + 300, summaryBoxY, 255, summaryBoxHeight).fillAndStroke('#f8f9fa', '#e9ecef');

      // Summary header
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#2563eb')
         .text('PAYMENT SUMMARY', margin + 310, summaryBoxY + 10);

      let summaryY = summaryBoxY + 35;
      const labelX = margin + 310;
      const valueX = margin + 480;

      const pricingDetails = [
        ['Subtotal:', formatCurrency(order.pricing.subtotal || 0)],
        ['GST (18%):', formatCurrency(order.pricing.gstAmount || 0)],
        ['Commission:', formatCurrency(order.pricing.commission || 0)],
        ['Gateway Charges:', formatCurrency(order.pricing.paymentGatewayCharges || 0)]
      ];

      // Pricing breakdown
      pricingDetails.forEach(([label, value]) => {
        doc.fontSize(10).font('Helvetica').fillColor('#666');
        doc.text(label, labelX, summaryY);
        doc.text(value, valueX, summaryY, { align: 'right', width: 70 });
        summaryY += 18;
      });

      // Total line
      doc.moveTo(labelX, summaryY).lineTo(valueX + 70, summaryY).stroke('#333');
      summaryY += 8;

      // Total amount
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#2563eb');
      doc.text('TOTAL AMOUNT:', labelX, summaryY);
      doc.text(formatCurrency(order.pricing.totalAmount || 0), valueX, summaryY, { align: 'right', width: 70 });

      yPos = summaryBoxY + summaryBoxHeight + 20;
    }

    // =============== PAYMENT INFORMATION SECTION ===============
    if (order?.payment) {
      // Payment info header
      doc.rect(margin, yPos, contentWidth, 25).fill('#16a34a');
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#ffffff')
         .text('PAYMENT INFORMATION', margin + 10, yPos + 6);
      yPos += 35;

      const paymentInfo = [
        ['Payment Method:', (order.payment.method || 'N/A').toUpperCase()],
        ['Payment Status:', (order.payment.status || 'pending').toUpperCase()],
        ['Advance Amount:', formatCurrency(order.payment.advanceAmount || 0)],
        ['Remaining Balance:', formatCurrency(order.payment.remainingAmount || 0)]
      ];

      if (order.payment.transactionId) {
        paymentInfo.push(['Transaction ID:', order.payment.transactionId]);
      }

      if (order.payment.paidAt) {
        paymentInfo.push(['Payment Date:', `${formatDate(order.payment.paidAt)} ${formatTime(order.payment.paidAt)}`]);
      }

      // Two column layout for payment info
      paymentInfo.forEach(([label, value], index) => {
        const colX = index % 2 === 0 ? leftColX : rightColX;
        const currentY = yPos + Math.floor(index / 2) * 20;

        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333');
        doc.text(label, colX, currentY, { width: 120 });
        doc.font('Helvetica').fillColor('#666');
        doc.text(value, colX + 120, currentY, { width: colWidth - 120 });
      });

      yPos += Math.ceil(paymentInfo.length / 2) * 20 + 30;
    }

    // =============== SUPPLIER INFORMATION SECTION ===============
    if (order?.supplier) {
      // Supplier info header
      doc.rect(margin, yPos, contentWidth, 25).fill('#7c3aed');
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#ffffff')
         .text('SUPPLIER INFORMATION', margin + 10, yPos + 6);
      yPos += 35;

      const supplierInfo = [
        ['Company Name:', order.supplier.companyName || 'N/A'],
        ['Contact Person:', order.supplier.contactPersonName || 'N/A'],
        ['Email:', order.supplier.email || 'N/A'],
        ['Phone:', order.supplier.contactPersonNumber || 'N/A']
      ];

      supplierInfo.forEach(([label, value]) => {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333');
        doc.text(label, leftColX, yPos, { width: 120 });
        doc.font('Helvetica').fillColor('#666');
        doc.text(value, leftColX + 120, yPos, { width: 200 });
        yPos += 18;
      });

      yPos += 20;
    }

    // =============== TERMS & CONDITIONS SECTION ===============
    // Add new page if needed
    if (yPos > 650) {
      doc.addPage();
      yPos = 50;
    }

    doc.rect(margin, yPos, contentWidth, 25).fill('#6b7280');
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#ffffff')
       .text('TERMS & CONDITIONS', margin + 10, yPos + 6);
    yPos += 35;

    const terms = [
      '1. Payment Terms: Payment must be made as per the agreed payment schedule.',
      '2. Delivery: Products are subject to availability and delivery timeline may vary based on location.',
      '3. Quality Assurance: All products undergo quality checks before dispatch.',
      '4. Returns: Items can be returned within 7 days if they are damaged or defective.',
      '5. Warranty: Products come with manufacturer warranty as applicable.',
      '6. Disputes: Any disputes will be resolved as per Indian jurisdiction laws.',
      '7. Contact: For any queries, please contact us at support@aggrekart.com or call customer care.'
    ];

    terms.forEach(term => {
      doc.fontSize(9).font('Helvetica').fillColor('#666')
         .text(term, margin + 10, yPos, { width: contentWidth - 20 });
      yPos += 15;
    });

    yPos += 20;

    // =============== FOOTER SECTION ===============
    // Footer border
    doc.moveTo(margin, yPos).lineTo(pageWidth - margin, yPos).stroke('#e9ecef');
    yPos += 15;

    // Thank you message
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#2563eb')
       .text('Thank you for choosing Aggrekart!', margin, yPos, { align: 'center', width: contentWidth });
    yPos += 25;

    // Contact information
    doc.fontSize(10).font('Helvetica').fillColor('#666');
    const contactInfo = [
      'Website: www.aggrekart.com | Email: support@aggrekart.com',
      'Customer Care: +91-XXXXXXXXXX | WhatsApp: +91-XXXXXXXXXX',
      `This invoice was generated on ${new Date().toLocaleString('en-IN')} and is computer generated.`
    ];

    contactInfo.forEach(info => {
      doc.text(info, margin, yPos, { align: 'center', width: contentWidth });
      yPos += 12;
    });

    // Company motto
    yPos += 10;
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#2563eb')
       .text('🏗️ Building Dreams, Delivering Quality 🏗️', margin, yPos, { align: 'center', width: contentWidth });

    // End document
    doc.end();
    
    return new Promise((resolve, reject) => {
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);
    });
    
  } catch (error) {
    throw new Error(`Invoice PDF generation failed: ${error.message}`);
  }
}// Add this route before the last export statement

// @route   GET /api/orders/history
// @desc    Get order history with analytics data
// @access  Private (Customer)
router.get('/history', auth, authorize('customer'), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('analytics').optional().isBoolean().withMessage('Analytics must be boolean'),
  query('timeRange').optional().isIn(['1month', '3months', '6months', '1year', 'all']).withMessage('Invalid time range')
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

    const { page = 1, limit = 50, analytics = false, timeRange = 'all' } = req.query;

    const filter = { customer: req.user._id };

    // Add time range filter
    if (timeRange !== 'all') {
      const now = new Date();
      let startDate;
      
      switch (timeRange) {
        case '1month':
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          break;
        case '3months':
          startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
          break;
        case '6months':
          startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
          break;
        case '1year':
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        default:
          startDate = null;
      }
      
      if (startDate) {
        filter.createdAt = { $gte: startDate };
      }
    }

    const orders = await Order.find(filter)
      .populate('supplier', 'name businessName')
      .populate('items.product', 'name category subcategory')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) * parseInt(page))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Order.countDocuments(filter);

    // If analytics requested, add summary data
    let analyticsData = null;
    if (analytics || analytics === 'true') {
      const allOrdersForAnalytics = await Order.find(filter)
        .populate('items.product', 'name category subcategory');

      const totalSpent = allOrdersForAnalytics.reduce((sum, order) => sum + (order.pricing?.totalAmount || 0), 0);
      const completedOrders = allOrdersForAnalytics.filter(order => order.status === 'delivered');
      const averageOrderValue = allOrdersForAnalytics.length > 0 ? totalSpent / allOrdersForAnalytics.length : 0;

      // Monthly spending
      const monthlySpending = {};
      allOrdersForAnalytics.forEach(order => {
        const month = order.createdAt.toISOString().slice(0, 7); // YYYY-MM
        monthlySpending[month] = (monthlySpending[month] || 0) + (order.pricing?.totalAmount || 0);
      });

      // Top categories
      const categorySpending = {};
      allOrdersForAnalytics.forEach(order => {
        order.items.forEach(item => {
          const category = item.product?.category || 'Unknown';
          categorySpending[category] = (categorySpending[category] || 0) + (item.totalPrice || 0);
        });
      });

      const topCategories = Object.entries(categorySpending)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([category, amount]) => ({ category, amount }));

      analyticsData = {
        totalSpent,
        averageOrderValue,
        completedOrders: completedOrders.length,
        monthlySpending,
        topCategories,
        timeRange
      };
    }

    res.json({
      success: true,
      data: {
        orders,
        analytics: analyticsData,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });

  } catch (error) {
    next(error);
  }
});
// @route   PUT /api/orders/:orderId/status
// @desc    Update order status (including material_loading)
// @access  Private (Supplier)
router.put('/:orderId/status', auth, [
  param('orderId').isMongoId().withMessage('Valid order ID required'),
  body('status').isIn(['material_loading', 'processing', 'dispatched']).withMessage('Valid status required'),
  body('note').optional().trim()
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

    const { orderId } = req.params;
    const { status, note } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return next(new ErrorHandler('Order not found', 404));
    }

    // Check if user has permission to update this order
    let canUpdate = false;
    if (req.user.role === 'admin') {
      canUpdate = true;
    } else if (req.user.role === 'supplier') {
      const supplier = await Supplier.findOne({ user: req.user._id });
      canUpdate = supplier && order.supplier.toString() === supplier._id.toString();
    }

    if (!canUpdate) {
      return next(new ErrorHandler('Not authorized to update this order', 403));
    }

    // Special handling for material_loading status
    if (status === 'material_loading') {
      // Can only start material loading during cooling period
      if (!order.isCoolingPeriodActive()) {
        return next(new ErrorHandler('Cannot start material loading - cooling period expired', 400));
      }
      
      order.startMaterialLoading(req.user._id);
    } else {
      order.updateStatus(status, note, req.user._id);
    }

    await order.save();

    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      data: { order }
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
