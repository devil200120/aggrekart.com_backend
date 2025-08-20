const express = require('express');
const { query, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const ReportGenerator = require('../utils/reports');
const Analytics = require('../utils/analytics');
const { ErrorHandler } = require('../utils/errorHandler');
const router = express.Router();

// @route   GET /api/reports/sales
// @desc    Generate sales report
// @access  Private (Admin)
router.get('/sales', auth, authorize('admin'), [
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date'),
  query('supplierId').optional().isMongoId().withMessage('Invalid supplier ID'),
  query('format').optional().isIn(['excel', 'pdf', 'json']).withMessage('Invalid format')
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

    const { startDate, endDate, supplierId, format = 'json' } = req.query;

    const report = await ReportGenerator.generateSalesReport({
      startDate,
      endDate,
      supplierId,
      format
    });

    if (format === 'excel') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');
      await report.xlsx.write(res);
      return res.end();
    }

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
      report.pipe(res);
      return report.end();
    }

    res.json({
      success: true,
      data: report
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/reports/suppliers
// @desc    Generate supplier performance report
// @access  Private (Admin)
router.get('/suppliers', auth, authorize('admin'), [
  query('period').optional().isInt({ min: 1, max: 365 }).withMessage('Period must be 1-365 days')
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

    const { period = 30 } = req.query;

    const report = await ReportGenerator.generateSupplierReport(parseInt(period));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=supplier-performance-report.xlsx');
    await report.xlsx.write(res);
    res.end();

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/reports/analytics/admin
// @desc    Get admin analytics
// @access  Private (Admin)
router.get('/analytics/admin', auth, authorize('admin'), [
  query('period').optional().isInt({ min: 1, max: 365 }).withMessage('Period must be 1-365 days')
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

    const { period = 30 } = req.query;

    const analytics = await Analytics.getAdminAnalytics(parseInt(period));

    res.json({
      success: true,
      data: analytics
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/reports/analytics/supplier
// @desc    Get supplier analytics
// @access  Private (Supplier)
router.get('/analytics/supplier', auth, authorize('supplier'), [
  query('period').optional().isInt({ min: 1, max: 365 }).withMessage('Period must be 1-365 days')
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

    const { period = 30 } = req.query;

    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) {
      return next(new ErrorHandler('Supplier profile not found', 404));
    }

    const analytics = await Analytics.getSupplierAnalytics(supplier._id, parseInt(period));

    res.json({
      success: true,
      data: analytics
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/reports/financial
// @desc    Generate financial summary
// @access  Private (Admin)
router.get('/financial', auth, authorize('admin'), [
  query('month').isInt({ min: 1, max: 12 }).withMessage('Month must be 1-12'),
  query('year').isInt({ min: 2020, max: 2030 }).withMessage('Year must be 2020-2030')
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

    const { month, year } = req.query;

    const summary = await ReportGenerator.generateFinancialSummary(
      parseInt(month),
      parseInt(year)
    );

    res.json({
      success: true,
      data: summary
    });

  } catch (error) {
    next(error);
  }
});

// Generate user data export PDF
async function generateUserDataPDF(user) {
  try {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50 });
    const buffers = [];
    
    doc.on('data', buffers.push.bind(buffers));
    
    // Gather user data
    const userData = await gatherUserData(user);
    
    // Helper functions
    const formatDate = (date) => new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const formatCurrency = (amount) => `₹${(amount || 0).toLocaleString('en-IN')}`;
    
    // Header
    doc.fontSize(24).font('Helvetica-Bold').fillColor('#007bff').text('AggreKart Data Export', 50, 50);
    doc.fontSize(14).font('Helvetica').fillColor('#666').text(`${userData.profile.name} (${userData.profile.role.toUpperCase()})`, 50, 80);
    doc.text(`Exported on: ${formatDate(new Date())}`, 50, 100);
    
    // Add line separator
    doc.strokeColor('#007bff').lineWidth(2).moveTo(50, 130).lineTo(545, 130).stroke();
    
    let yPos = 160;
    
    // Profile Section
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text('📋 Profile Information', 50, yPos);
    yPos += 30;
    
    const profileInfo = [
      ['Name:', userData.profile.name],
      ['Email:', userData.profile.email],
      ['Phone:', userData.profile.phoneNumber],
      ['Account Type:', userData.profile.role.toUpperCase()],
      ['Member Since:', formatDate(userData.profile.createdAt)],
      ['Last Updated:', formatDate(userData.profile.updatedAt)]
    ];
    
    profileInfo.forEach(([label, value]) => {
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text(label, 50, yPos);
      doc.font('Helvetica').text(value, 150, yPos);
      yPos += 20;
    });
    
    yPos += 20;
    
    // Role-specific content
    if (userData.supplier) {
      const supplier = userData.supplier;
      
      // Statistics Section
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text('📊 Business Statistics', 50, yPos);
      yPos += 30;
      
      // Statistics in boxes
      const stats = [
        ['Total Products', supplier.statistics.totalProducts],
        ['Active Products', supplier.statistics.activeProducts],
        ['Total Orders', supplier.statistics.totalOrders],
        ['Total Revenue', formatCurrency(supplier.statistics.totalRevenue)]
      ];
      
      const statBoxWidth = 120;
      const statBoxHeight = 60;
      let xPos = 50;
      
      stats.forEach(([label, value], index) => {
        if (index === 2) {
          xPos = 50;
          yPos += 80;
        }
        
        // Draw box
        doc.rect(xPos, yPos, statBoxWidth, statBoxHeight).fillAndStroke('#f8f9fa', '#e9ecef');
        
        // Add text
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#007bff').text(String(value), xPos + 10, yPos + 15, { width: statBoxWidth - 20, align: 'center' });
        doc.fontSize(10).font('Helvetica').fillColor('#666').text(label, xPos + 5, yPos + 40, { width: statBoxWidth - 10, align: 'center' });
        
        xPos += statBoxWidth + 20;
      });
      
      yPos += 100;
      
      // Products Table
      if (supplier.products.length > 0) {
        // Check if we need a new page
        if (yPos > 650) {
          doc.addPage();
          yPos = 50;
        }
        
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text(`🛍️ Products (${supplier.products.length})`, 50, yPos);
        yPos += 30;
        
        // Table headers
        const headers = ['Product Name', 'Category', 'Price', 'Stock', 'Status'];
        const columnWidths = [140, 80, 70, 60, 60];
        let xPosition = 50;
        
        headers.forEach((header, index) => {
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#fff');
          doc.rect(xPosition, yPos, columnWidths[index], 25).fill('#007bff');
          doc.text(header, xPosition + 5, yPos + 8, { width: columnWidths[index] - 10, align: 'center' });
          xPosition += columnWidths[index];
        });
        
        yPos += 25;
        
        // Table rows (show first 10 products)
        supplier.products.slice(0, 10).forEach((product, rowIndex) => {
          if (yPos > 750) {
            doc.addPage();
            yPos = 50;
          }
          
          xPosition = 50;
          const rowData = [
            product.name.substring(0, 20) + (product.name.length > 20 ? '...' : ''),
            product.category,
            formatCurrency(product.pricing?.basePrice),
            product.stock?.available || 0,
            product.isActive ? 'Active' : 'Inactive'
          ];
          
          // Alternate row colors
          if (rowIndex % 2 === 0) {
            doc.rect(50, yPos, 410, 20).fill('#f8f9fa');
          }
          
          rowData.forEach((data, index) => {
            doc.fontSize(9).font('Helvetica').fillColor('#333').text(String(data), xPosition + 5, yPos + 6, { width: columnWidths[index] - 10, align: 'left' });
            xPosition += columnWidths[index];
          });
          
          yPos += 20;
        });
        
        if (supplier.products.length > 10) {
          doc.fontSize(10).font('Helvetica').fillColor('#666').text(`Showing first 10 products. Total: ${supplier.products.length}`, 50, yPos + 10);
        }
      }
      
    } else if (userData.customer) {
      const customer = userData.customer;
      
      // Statistics Section
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text('📊 Shopping Statistics', 50, yPos);
      yPos += 30;
      
      const stats = [
        ['Total Orders', customer.statistics.totalOrders],
        ['Total Spent', formatCurrency(customer.statistics.totalSpent)],
        ['Completed Orders', customer.statistics.completedOrders],
        ['Pending Orders', customer.statistics.pendingOrders]
      ];
      
      const statBoxWidth = 120;
      const statBoxHeight = 60;
      let xPos = 50;
      
      stats.forEach(([label, value], index) => {
        if (index === 2) {
          xPos = 50;
          yPos += 80;
        }
        
        // Draw box
        doc.rect(xPos, yPos, statBoxWidth, statBoxHeight).fillAndStroke('#f8f9fa', '#e9ecef');
        
        // Add text
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#10b981').text(String(value), xPos + 10, yPos + 15, { width: statBoxWidth - 20, align: 'center' });
        doc.fontSize(10).font('Helvetica').fillColor('#666').text(label, xPos + 5, yPos + 40, { width: statBoxWidth - 10, align: 'center' });
        
        xPos += statBoxWidth + 20;
      });
      
      yPos += 100;
      
      // Recent Orders
      if (customer.orders.length > 0) {
        if (yPos > 650) {
          doc.addPage();
          yPos = 50;
        }
        
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text(`📦 Recent Orders (${Math.min(customer.orders.length, 10)})`, 50, yPos);
        yPos += 30;
        
        customer.orders.slice(0, 10).forEach((order, index) => {
          if (yPos > 720) {
            doc.addPage();
            yPos = 50;
          }
          
          doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text(`${order.orderId}`, 50, yPos);
          doc.fontSize(10).font('Helvetica').fillColor('#666').text(`${formatCurrency(order.totalAmount)} • ${order.status} • ${formatDate(order.createdAt)}`, 50, yPos + 15);
          yPos += 35;
        });
      }
    }
    
    // Addresses Section
    if (userData.addresses.length > 0) {
      if (yPos > 650) {
        doc.addPage();
        yPos = 50;
      }
      
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text('📍 Addresses', 50, yPos);
      yPos += 30;
      
      userData.addresses.forEach((address, index) => {
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text(`Address ${index + 1} ${address.isDefault ? '(Default)' : ''}`, 50, yPos);
        doc.fontSize(10).font('Helvetica').fillColor('#666').text(`${address.addressLine1}`, 50, yPos + 15);
        if (address.addressLine2) {
          doc.text(`${address.addressLine2}`, 50, yPos + 28);
          yPos += 13;
        }
        doc.text(`${address.city}, ${address.state} - ${address.pincode}`, 50, yPos + 28);
        yPos += 50;
      });
    }
    
    // Footer
    doc.fontSize(10).font('Helvetica').fillColor('#666')
      .text('This data export was generated from AggreKart platform.', 50, 750)
      .text('For any questions regarding your data, please contact support@aggrekart.com', 50, 765);
    
    doc.end();
    
    return new Promise((resolve, reject) => {
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);
    });
    
  } catch (error) {
    throw new Error(`User PDF generation failed: ${error.message}`);
  }
}

// Helper method to gather user data
async function gatherUserData(user) {
  const userData = {
    profile: {
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    },
    addresses: user.addresses || [],
    preferences: user.preferences || {}
  };

  if (user.role === 'supplier') {
    const Supplier = require('../models/Supplier');
    const Product = require('../models/Product');
    const Order = require('../models/Order');
    
    const [supplier, products, orders] = await Promise.all([
      Supplier.findOne({ user: user._id }).lean(),
      Product.find({ supplier: { $exists: true } })
        .populate('supplier', 'user')
        .lean()
        .then(prods => prods.filter(p => p.supplier?.user?.toString() === user._id.toString())),
      Order.find({ supplier: { $exists: true } })
        .populate('supplier', 'user')
        .lean()
        .then(orders => orders.filter(o => o.supplier?.user?.toString() === user._id.toString()))
    ]);
    
    userData.supplier = {
      profile: supplier || {},
      statistics: {
        totalProducts: products.length,
        totalOrders: orders.length,
        totalRevenue: orders.reduce((sum, order) => sum + (order.pricing?.totalAmount || 0), 0),
        activeProducts: products.filter(p => p.isActive).length
      },
      products: products,
      orders: orders
    };
  } else {
    const Order = require('../models/Order');
    const Cart = require('../models/Cart');
    const Wishlist = require('../models/Wishlist');
    
    const [orders, cart, wishlist] = await Promise.all([
      Order.find({ customer: user._id }).lean(),
      Cart.findOne({ user: user._id }).lean(),
      Wishlist.findOne({ user: user._id }).lean()
    ]);
    
    userData.customer = {
      statistics: {
        totalOrders: orders.length,
        totalSpent: orders.reduce((sum, order) => sum + (order.pricing?.totalAmount || 0), 0),
        completedOrders: orders.filter(o => o.status === 'delivered').length,
        pendingOrders: orders.filter(o => ['pending', 'confirmed', 'processing'].includes(o.status)).length
      },
      orders: orders,
      cart: cart || {},
      wishlist: wishlist || {}
    };
  }
  
  return userData;
}
module.exports = router;