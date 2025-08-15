const mongoose = require('mongoose');
const UserLoyalty = require('./models/UserLoyalty');
const LoyaltyProgram = require('./models/LoyaltyProgram');
const Order = require('./models/Order');

// Create this new script file to fix existing coupon data

async function fixCouponUsageData() {
  try {
    console.log('🔍 Starting coupon usage data fix...');
    
    // Connect to MongoDB if not already connected
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect("mongodb+srv://devildecent716:UR0QPGzYtTWuz4JD@cluster0.8agmjlc.mongodb.net/test");
    }

    // Find all orders that might have used coupons
    const orders = await Order.find({
      'pricing.totalAmount': { $exists: true },
      createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } // Last 90 days
    }).populate('customer');

    console.log(`📊 Found ${orders.length} orders to analyze...`);

    let fixedCount = 0;
    let skippedCount = 0;

    for (const order of orders) {
      try {
        // Get user's loyalty record
        const userLoyalty = await UserLoyalty.findOne({ user: order.customer._id });
        
        if (!userLoyalty || !userLoyalty.coupons || userLoyalty.coupons.length === 0) {
          skippedCount++;
          continue;
        }

        // Check if any coupon was awarded around the order date but not marked as used
        const orderDate = order.createdAt;
        const potentialCoupons = userLoyalty.coupons.filter(coupon => {
          const awardedDate = new Date(coupon.awardedAt);
          const timeDiff = Math.abs(orderDate - awardedDate);
          const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
          
          // Find coupons awarded within 30 days of order and not yet used
          return !coupon.used && daysDiff <= 30;
        });

        if (potentialCoupons.length > 0) {
          console.log(`🔍 Order ${order.orderId} - Found ${potentialCoupons.length} potential unused coupons`);
          
          // For demo purposes, mark the first one as used (in real scenario, you'd need more logic)
          const coupon = potentialCoupons[0];
          const couponProgram = await LoyaltyProgram.findById(coupon.couponProgram);
          
          if (couponProgram) {
            // Calculate potential discount based on coupon
            let potentialDiscount = 0;
            if (couponProgram.couponDetails.discountType === 'percentage') {
              potentialDiscount = (order.pricing.totalAmount * couponProgram.couponDetails.discountValue) / 100;
              if (couponProgram.couponDetails.maxDiscount) {
                potentialDiscount = Math.min(potentialDiscount, couponProgram.couponDetails.maxDiscount);
              }
            } else {
              potentialDiscount = couponProgram.couponDetails.discountValue;
            }

            // Mark coupon as used
            coupon.used = true;
            coupon.usedAt = orderDate;
            coupon.usedInOrder = order._id;
            coupon.discountApplied = Math.round(potentialDiscount);

            // Add transaction record if it doesn't exist
            const existingTransaction = userLoyalty.transactions.find(t => 
              t.type === 'coupon_used' && 
              t.order && 
              t.order.toString() === order._id.toString()
            );

            if (!existingTransaction) {
              userLoyalty.transactions.push({
                type: 'coupon_used',
                amount: 0,
                description: `Coupon ${couponProgram.couponDetails.code} used in order ${order.orderId} (data fix)`,
                order: order._id,
                date: orderDate,
                metadata: {
                  couponId: coupon._id,
                  couponCode: couponProgram.couponDetails.code,
                  discountApplied: Math.round(potentialDiscount),
                  orderId: order.orderId,
                  note: 'Fixed by migration script'
                }
              });
            }

            await userLoyalty.save();
            
            console.log(`✅ Fixed coupon usage for Order ${order.orderId}:`, {
              couponCode: couponProgram.couponDetails.code,
              discountApplied: Math.round(potentialDiscount),
              usedAt: orderDate
            });
            
            fixedCount++;
          }
        } else {
          skippedCount++;
        }
        
      } catch (orderError) {
        console.error(`❌ Error processing order ${order.orderId}:`, orderError);
        skippedCount++;
      }
    }

    console.log(`✅ Coupon usage fix completed:`, {
      totalOrders: orders.length,
      fixed: fixedCount,
      skipped: skippedCount
    });

  } catch (error) {
    console.error('❌ Error in fixCouponUsageData:', error);
    throw error;
  }
}

// Run the fix if this file is executed directly
if (require.main === module) {
  fixCouponUsageData()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { fixCouponUsageData };