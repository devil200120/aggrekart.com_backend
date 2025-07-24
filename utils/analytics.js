const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Supplier = require('../models/Supplier');

class Analytics {
  
  // Dashboard analytics for admin
  static async getAdminAnalytics(period = 30) {
    try {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - period);

      // Revenue analytics
      const revenueData = await Order.aggregate([
        {
          $match: {
            status: 'delivered',
            createdAt: { $gte: fromDate }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            totalRevenue: { $sum: '$pricing.totalAmount' },
            commission: { $sum: '$pricing.commission' },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // User growth
      const userGrowth = await User.aggregate([
        {
          $match: { createdAt: { $gte: fromDate } }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            customers: { $sum: { $cond: [{ $eq: ['$role', 'customer'] }, 1, 0] } },
            suppliers: { $sum: { $cond: [{ $eq: ['$role', 'supplier'] }, 1, 0] } }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Product analytics
      const productStats = await Product.aggregate([
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            activeCount: { $sum: { $cond: ['$isActive', 1, 0] } },
            averagePrice: { $avg: '$pricing.basePrice' }
          }
        }
      ]);

      // Top performing suppliers
      const topSuppliers = await Supplier.aggregate([
        { $match: { isApproved: true } },
        {
          $lookup: {
            from: 'orders',
            localField: '_id',
            foreignField: 'supplier',
            as: 'orders'
          }
        },
        {
          $addFields: {
            totalRevenue: { $sum: '$orders.pricing.totalAmount' },
            orderCount: { $size: '$orders' }
          }
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 10 }
      ]);

      return {
        revenue: revenueData,
        userGrowth,
        productStats,
        topSuppliers,
        period
      };

    } catch (error) {
      throw new Error(`Analytics generation failed: ${error.message}`);
    }
  }

  // Supplier analytics
  static async getSupplierAnalytics(supplierId, period = 30) {
    try {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - period);

      // Order analytics
      const orderAnalytics = await Order.aggregate([
        {
          $match: {
            supplier: supplierId,
            createdAt: { $gte: fromDate }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            orders: { $sum: 1 },
            revenue: { $sum: '$pricing.totalAmount' },
            delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Product performance
      const productPerformance = await Product.aggregate([
        { $match: { supplier: supplierId } },
        {
          $lookup: {
            from: 'orders',
            let: { productId: '$_id' },
            pipeline: [
              { $unwind: '$items' },
              { $match: { $expr: { $eq: ['$items.product', '$$productId'] } } },
              { $match: { createdAt: { $gte: fromDate } } }
            ],
            as: 'orderItems'
          }
        },
        {
          $addFields: {
            totalSold: { $sum: '$orderItems.items.quantity' },
            totalRevenue: { $sum: '$orderItems.items.totalPrice' }
          }
        },
        { $sort: { totalRevenue: -1 } }
      ]);

      return {
        orders: orderAnalytics,
        products: productPerformance,
        period
      };

    } catch (error) {
      throw new Error(`Supplier analytics failed: ${error.message}`);
    }
  }

  // Customer analytics
  static async getCustomerAnalytics(customerId, period = 90) {
    try {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - period);

      // Spending analytics
      const spendingAnalytics = await Order.aggregate([
        {
          $match: {
            customer: customerId,
            status: 'delivered',
            createdAt: { $gte: fromDate }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            totalSpent: { $sum: '$pricing.totalAmount' },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Category preferences
      const categoryPreferences = await Order.aggregate([
        { $match: { customer: customerId, status: 'delivered' } },
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            localField: 'items.product',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $group: {
            _id: '$product.category',
            totalSpent: { $sum: '$items.totalPrice' },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { totalSpent: -1 } }
      ]);

      return {
        spending: spendingAnalytics,
        categories: categoryPreferences,
        period
      };

    } catch (error) {
      throw new Error(`Customer analytics failed: ${error.message}`);
    }
  }
}

module.exports = Analytics;