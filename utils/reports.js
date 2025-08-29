const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const Order = require('../models/Order');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const User = require('../models/User');

class ReportGenerator {

  // Generate sales report
  static async generateSalesReport(filters = {}) {
    try {
      const { startDate, endDate, supplierId, format = 'excel' } = filters;

      const matchStage = {};
      if (startDate) matchStage.createdAt = { $gte: new Date(startDate) };
      if (endDate) matchStage.createdAt = { ...matchStage.createdAt, $lte: new Date(endDate) };
      if (supplierId) matchStage.supplier = supplierId;

      const salesData = await Order.aggregate([
        { $match: matchStage },
        {
          $lookup: {
            from: 'suppliers',
            localField: 'supplier',
            foreignField: '_id',
            as: 'supplierInfo'
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'customer',
            foreignField: '_id',
            as: 'customerInfo'
          }
        },
        { $unwind: '$supplierInfo' },
        { $unwind: '$customerInfo' },
        {
          $project: {
            orderId: 1,
            orderDate: '$createdAt',
            customerName: '$customerInfo.name',
            supplierName: '$supplierInfo.companyName',
            totalAmount: '$pricing.totalAmount',
            commission: '$pricing.commission',
            status: 1,
            itemCount: { $size: '$items' }
          }
        },
        { $sort: { orderDate: -1 } }
      ]);

      if (format === 'excel') {
        return await this.generateExcelReport(salesData, 'Sales Report');
      } else if (format === 'pdf') {
        return await this.generatePDFReport(salesData, 'Sales Report');
      }

      return salesData;

    } catch (error) {
      throw new Error(`Report generation failed: ${error.message}`);
    }
  }

  // Generate supplier performance report
  static async generateSupplierReport(period = 30) {
    try {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - period);

      const supplierData = await Supplier.aggregate([
        { $match: { isApproved: true } },
        {
          $lookup: {
            from: 'orders',
            let: { supplierId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$supplier', '$$supplierId'] },
                  createdAt: { $gte: fromDate }
                }
              }
            ],
            as: 'recentOrders'
          }
        },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: 'supplier',
            as: 'products'
          }
        },
        {
          $addFields: {
            recentOrderCount: { $size: '$recentOrders' },
            recentRevenue: { $sum: '$recentOrders.pricing.totalAmount' },
            productCount: { $size: '$products' },
            activeProductCount: {
              $size: {
                $filter: {
                  input: '$products',
                  cond: { $and: ['$$this.isActive', '$$this.isApproved'] }
                }
              }
            }
          }
        },
        {
          $project: {
            supplierId: 1,
            companyName: 1,
            state: 1,
            city: 1,
            rating: '$rating.average',
            totalOrders: 1,
            totalRevenue: 1,
            recentOrderCount: 1,
            recentRevenue: 1,
            productCount: 1,
            activeProductCount: 1,
            joinedDate: '$createdAt'
          }
        },
        { $sort: { recentRevenue: -1 } }
      ]);

      return await this.generateExcelReport(supplierData, 'Supplier Performance Report');

    } catch (error) {
      throw new Error(`Supplier report generation failed: ${error.message}`);
    }
  }

  // Generate Excel report
  static async generateExcelReport(data, reportName) {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(reportName);

      if (data.length === 0) {
        worksheet.addRow(['No data available']);
        return workbook;
      }

      // Add headers
      const headers = Object.keys(data[0]);
      worksheet.addRow(headers);

      // Style headers
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF366EF5' }
      };

      // Add data rows
      data.forEach(row => {
        const values = headers.map(header => row[header]);
        worksheet.addRow(values);
      });

      // Auto-fit columns
      worksheet.columns.forEach(column => {
        column.width = 15;
      });

      return workbook;

    } catch (error) {
      throw new Error(`Excel generation failed: ${error.message}`);
    }
  }

  // Generate PDF report
  static async generatePDFReport(data, reportName) {
    try {
      const doc = new PDFDocument();
      
      // Title
      doc.fontSize(20).text(reportName, 50, 50);
      doc.fontSize(12).text(`Generated on: ${new Date().toLocaleString()}`, 50, 80);
      
      // Table headers
      let yPosition = 120;
      const headers = Object.keys(data[0] || {});
      const columnWidth = 500 / headers.length;
      
      headers.forEach((header, index) => {
        doc.text(header, 50 + (index * columnWidth), yPosition, {
          width: columnWidth,
          align: 'left'
        });
      });
      
      yPosition += 20;
      
      // Table data
      data.forEach(row => {
        headers.forEach((header, index) => {
          doc.text(String(row[header] || ''), 50 + (index * columnWidth), yPosition, {
            width: columnWidth,
            align: 'left'
          });
        });
        yPosition += 15;
        
        // Add new page if needed
        if (yPosition > 700) {
          doc.addPage();
          yPosition = 50;
        }
      });
      
      return doc;

    } catch (error) {
      throw new Error(`PDF generation failed: ${error.message}`);
    }
  }

  // Add these methods to the ReportGenerator class (after the existing methods)

  // Generate analytics Excel report
  static async generateAnalyticsExcelReport(data) {
    try {
      const workbook = new ExcelJS.Workbook();
      
      // Summary Sheet
      const summarySheet = workbook.addWorksheet('Summary');
      summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 25 },
        { header: 'Value', key: 'value', width: 20 }
      ];

      // Add summary data
      summarySheet.addRows([
        { metric: 'Total Revenue', value: `₹${data.summary.totalRevenue.toLocaleString()}` },
        { metric: 'Total Orders', value: data.summary.totalOrders.toLocaleString() },
        { metric: 'Total Commission', value: `₹${data.summary.totalCommission.toLocaleString()}` },
        { metric: 'Average Order Value', value: `₹${Math.round(data.summary.avgOrderValue).toLocaleString()}` },
        { metric: 'Total Users', value: data.summary.totalUsers.toLocaleString() },
        { metric: 'Total Suppliers', value: data.summary.totalSuppliers.toLocaleString() },
        { metric: 'Active Suppliers', value: data.summary.activeSuppliers.toLocaleString() },
        { metric: 'Report Period', value: data.summary.period },
        { metric: 'Generated At', value: new Date(data.summary.generatedAt).toLocaleString() }
      ]);

      // Style the summary sheet
      summarySheet.getRow(1).font = { bold: true };
      summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF366EF5' } };

      // Daily Revenue Sheet
      const revenueSheet = workbook.addWorksheet('Daily Revenue');
      revenueSheet.columns = [
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Revenue (₹)', key: 'revenue', width: 15 },
        { header: 'Orders', key: 'orders', width: 10 },
        { header: 'Commission (₹)', key: 'commission', width: 15 }
      ];
      revenueSheet.addRows(data.dailyRevenue);
      revenueSheet.getRow(1).font = { bold: true };
      revenueSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };

      // User Growth Sheet
      const userSheet = workbook.addWorksheet('User Growth');
      userSheet.columns = [
        { header: 'Date', key: 'date', width: 12 },
        { header: 'New Customers', key: 'customers', width: 15 },
        { header: 'New Suppliers', key: 'suppliers', width: 15 }
      ];
      userSheet.addRows(data.userGrowth);
      userSheet.getRow(1).font = { bold: true };
      userSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };

      // Top Suppliers Sheet
      const suppliersSheet = workbook.addWorksheet('Top Suppliers');
      suppliersSheet.columns = [
        { header: 'Supplier Name', key: 'name', width: 30 },
        { header: 'Revenue (₹)', key: 'revenue', width: 15 },
        { header: 'Orders', key: 'orders', width: 10 },
        { header: 'Products', key: 'products', width: 12 }
      ];
      suppliersSheet.addRows(data.topSuppliers);
      suppliersSheet.getRow(1).font = { bold: true };
      suppliersSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B5CF6' } };

      // Category Stats Sheet
      const categoriesSheet = workbook.addWorksheet('Categories');
      categoriesSheet.columns = [
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Total Products', key: 'products', width: 15 },
        { header: 'Active Products', key: 'activeProducts', width: 15 },
        { header: 'Avg Price (₹)', key: 'avgPrice', width: 15 }
      ];
      categoriesSheet.addRows(data.categoryStats);
      categoriesSheet.getRow(1).font = { bold: true };
      categoriesSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF06B6D4' } };

      return workbook;

    } catch (error) {
      throw new Error(`Analytics Excel report generation failed: ${error.message}`);
    }
  }

  // Generate analytics PDF report
  static async generateAnalyticsPDFReport(data) {
    try {
      const doc = new PDFDocument();
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      
      // Title
      doc.fontSize(20).font('Helvetica-Bold').text('Analytics Report', 50, 50);
      doc.fontSize(12).font('Helvetica').text(`Generated on: ${new Date(data.summary.generatedAt).toLocaleString()}`, 50, 80);
      doc.text(`Period: ${data.summary.period}`, 50, 95);

      // Summary Section
      doc.fontSize(16).font('Helvetica-Bold').text('Summary', 50, 130);
      let yPos = 150;
      
      const summaryItems = [
        [`Total Revenue:`, `₹${data.summary.totalRevenue.toLocaleString()}`],
        [`Total Orders:`, data.summary.totalOrders.toLocaleString()],
        [`Total Commission:`, `₹${data.summary.totalCommission.toLocaleString()}`],
        [`Average Order Value:`, `₹${Math.round(data.summary.avgOrderValue).toLocaleString()}`],
        [`Total Users:`, data.summary.totalUsers.toLocaleString()],
        [`Active Suppliers:`, `${data.summary.activeSuppliers}/${data.summary.totalSuppliers}`]
      ];

      summaryItems.forEach(([label, value]) => {
        doc.fontSize(12).font('Helvetica').text(label, 50, yPos);
        doc.font('Helvetica-Bold').text(value, 200, yPos);
        yPos += 20;
      });

      // Top Suppliers Section
      doc.fontSize(16).font('Helvetica-Bold').text('Top Suppliers', 50, yPos + 20);
      yPos += 50;

      data.topSuppliers.slice(0, 5).forEach((supplier, index) => {
        doc.fontSize(12).font('Helvetica').text(`${index + 1}. ${supplier.name}`, 50, yPos);
        doc.text(`Revenue: ₹${supplier.revenue.toLocaleString()} | Orders: ${supplier.orders}`, 70, yPos + 15);
        yPos += 35;
      });

      doc.end();

      return new Promise((resolve, reject) => {
        doc.on('end', () => {
          resolve(Buffer.concat(buffers));
        });
        doc.on('error', reject);
      });

    } catch (error) {
      throw new Error(`Analytics PDF report generation failed: ${error.message}`);
    }
  }

  // Generate analytics CSV report
  static async generateAnalyticsCSVReport(data) {
    try {
      let csv = 'Analytics Report\n';
      csv += `Generated on: ${new Date(data.summary.generatedAt).toLocaleString()}\n`;
      csv += `Period: ${data.summary.period}\n\n`;

      // Summary section
      csv += 'SUMMARY\n';
      csv += 'Metric,Value\n';
      csv += `Total Revenue,₹${data.summary.totalRevenue.toLocaleString()}\n`;
      csv += `Total Orders,${data.summary.totalOrders.toLocaleString()}\n`;
      csv += `Total Commission,₹${data.summary.totalCommission.toLocaleString()}\n`;
      csv += `Average Order Value,₹${Math.round(data.summary.avgOrderValue).toLocaleString()}\n`;
      csv += `Total Users,${data.summary.totalUsers.toLocaleString()}\n`;
      csv += `Active Suppliers,${data.summary.activeSuppliers.toLocaleString()}\n\n`;

      // Daily Revenue section
      csv += 'DAILY REVENUE\n';
      csv += 'Date,Revenue,Orders,Commission\n';
      data.dailyRevenue.forEach(day => {
        csv += `${day.date},${day.revenue},${day.orders},${day.commission}\n`;
      });

      csv += '\nTOP SUPPLIERS\n';
      csv += 'Supplier Name,Revenue,Orders,Products\n';
      data.topSuppliers.forEach(supplier => {
        csv += `${supplier.name},${supplier.revenue},${supplier.orders},${supplier.products}\n`;
      });

      return Buffer.from(csv, 'utf8');

    } catch (error) {
      throw new Error(`Analytics CSV report generation failed: ${error.message}`);
    }
  }
  // Generate financial summary
  static async generateFinancialSummary(month, year) {
    try {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      const summary = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            status: 'delivered'
          }
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: '$pricing.totalAmount' },
            totalCommission: { $sum: '$pricing.commission' },
            totalGST: { $sum: '$pricing.gstAmount' },
            averageOrderValue: { $avg: '$pricing.totalAmount' }
          }
        }
      ]);

      const categoryBreakdown = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            status: 'delivered'
          }
        },
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
            revenue: { $sum: '$items.totalPrice' },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { revenue: -1 } }
      ]);

      return {
        summary: summary[0] || {},
        categoryBreakdown,
        period: { month, year, startDate, endDate }
      };

    } catch (error) {
      throw new Error(`Financial summary generation failed: ${error.message}`);
    }
  }
  
  // Generate user data export PDF
  // Replace the generateUserDataPDF method starting around line 469
  static async generateUserDataPDF(user) {
    try {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      
      doc.on('data', buffers.push.bind(buffers));
      
      // Gather user data
      const userData = await this.gatherUserData(user);
      
      // Helper functions
      const formatDate = (date) => new Date(date).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      const formatCurrency = (amount) => `₹${(amount || 0).toLocaleString('en-IN')}`;
      
      const addPageBreakIfNeeded = () => {
        if (yPos > 700) {
          doc.addPage();
          yPos = 50;
        }
      };
      
      // Header
      doc.fontSize(24).font('Helvetica-Bold').fillColor('#007bff').text('AggreKart Data Export', 50, 50);
      doc.fontSize(14).font('Helvetica').fillColor('#666').text(`${userData.profile.name} (${userData.profile.role.toUpperCase()})`, 50, 80);
      doc.text(`Exported on: ${formatDate(new Date())}`, 50, 100);
      
      // Add line separator
      doc.strokeColor('#007bff').lineWidth(2).moveTo(50, 130).lineTo(545, 130).stroke();
      
      let yPos = 160;
      
      // Profile Section
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text('Profile Information', 50, yPos);
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
        
        // Business Profile Section
        addPageBreakIfNeeded();
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text('Business Profile', 50, yPos);
        yPos += 30;
        
        if (supplier.profile && Object.keys(supplier.profile).length > 0) {
          const businessInfo = [
            ['Company Name:', supplier.profile.companyName],
            ['Business Type:', supplier.profile.businessType],
            ['GST Number:', supplier.profile.gstNumber],
            ['Registration:', supplier.profile.registrationNumber],
            ['Business License:', supplier.profile.businessLicense],
            ['Years in Business:', supplier.profile.yearsInBusiness],
            ['Employee Count:', supplier.profile.employeeCount],
            ['Warehouse Area:', supplier.profile.warehouseArea],
            ['Delivery Capacity:', supplier.profile.deliveryCapacity],
            ['Operating Hours:', supplier.profile.operatingHours],
            ['Status:', supplier.profile.isApproved ? 'Approved' : 'Pending Approval']
          ];
          
          businessInfo.forEach(([label, value]) => {
            if (value) {
              doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text(label, 50, yPos);
              doc.font('Helvetica').text(String(value), 200, yPos);
              yPos += 20;
              addPageBreakIfNeeded();
            }
          });
        }
        
        yPos += 20;
        
        // Enhanced Statistics Section
        addPageBreakIfNeeded();
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text('Business Performance', 50, yPos);
        yPos += 30;
        
        const stats = [
          ['Total Products Listed', supplier.statistics.totalProducts],
          ['Active Products', supplier.statistics.activeProducts],
          ['Inactive Products', supplier.statistics.totalProducts - supplier.statistics.activeProducts],
          ['Total Orders Received', supplier.statistics.totalOrders],
          ['Total Revenue Generated', formatCurrency(supplier.statistics.totalRevenue)],
          ['Average Order Value', formatCurrency(supplier.statistics.totalOrders > 0 ? supplier.statistics.totalRevenue / supplier.statistics.totalOrders : 0)],
          ['Success Rate', supplier.statistics.totalOrders > 0 ? `${Math.round((supplier.completedOrders || 0) / supplier.statistics.totalOrders * 100)}%` : '0%']
        ];
        
        stats.forEach(([label, value]) => {
          doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text(label + ':', 50, yPos);
          doc.font('Helvetica').text(String(value), 250, yPos);
          yPos += 20;
          addPageBreakIfNeeded();
        });
        
        yPos += 20;
        
        // Order Status Breakdown
        if (supplier.orders && supplier.orders.length > 0) {
          addPageBreakIfNeeded();
          doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text('Order Status Analysis', 50, yPos);
          yPos += 30;
          
          const orderStats = supplier.orders.reduce((acc, order) => {
            acc[order.status] = (acc[order.status] || 0) + 1;
            acc.totalValue = (acc.totalValue || 0) + (order.pricing?.totalAmount || 0);
            return acc;
          }, {});
          
          const statusLabels = {
            pending: 'Pending Orders',
            confirmed: 'Confirmed Orders', 
            processing: 'Processing Orders',
            shipped: 'Shipped Orders',
            delivered: 'Delivered Orders',
            cancelled: 'Cancelled Orders'
          };
          
          Object.entries(statusLabels).forEach(([status, label]) => {
            if (orderStats[status]) {
              doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text(`${label}:`, 50, yPos);
              doc.font('Helvetica').text(`${orderStats[status]} orders`, 250, yPos);
              yPos += 20;
              addPageBreakIfNeeded();
            }
          });
          
          yPos += 20;
        }
        
        // Monthly Performance (last 12 months)
        if (supplier.orders && supplier.orders.length > 0) {
          addPageBreakIfNeeded();
          doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text('Monthly Performance (Last 12 Months)', 50, yPos);
          yPos += 30;
          
          const monthlyData = supplier.orders
            .filter(order => {
              const orderDate = new Date(order.createdAt);
              const twelveMonthsAgo = new Date();
              twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
              return orderDate >= twelveMonthsAgo;
            })
            .reduce((acc, order) => {
              const month = new Date(order.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'long' });
              if (!acc[month]) {
                acc[month] = { orders: 0, revenue: 0 };
              }
              acc[month].orders += 1;
              acc[month].revenue += order.pricing?.totalAmount || 0;
              return acc;
            }, {});
          
          Object.entries(monthlyData)
            .sort(([a], [b]) => new Date(a) - new Date(b))
            .forEach(([month, data]) => {
              doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text(`${month}:`, 50, yPos);
              doc.font('Helvetica').text(`${data.orders} orders, ${formatCurrency(data.revenue)} revenue`, 200, yPos);
              yPos += 20;
              addPageBreakIfNeeded();
            });
          
          yPos += 20;
        }
        
        // Product Categories
        if (supplier.products && supplier.products.length > 0) {
          addPageBreakIfNeeded();
          doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text('Product Categories', 50, yPos);
          yPos += 30;
          
          const categoryStats = supplier.products.reduce((acc, product) => {
            const category = product.category || 'Uncategorized';
            if (!acc[category]) {
              acc[category] = { count: 0, active: 0 };
            }
            acc[category].count += 1;
            if (product.isActive) acc[category].active += 1;
            return acc;
          }, {});
          
          Object.entries(categoryStats).forEach(([category, stats]) => {
            doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text(`${category}:`, 50, yPos);
            doc.font('Helvetica').text(`${stats.count} total (${stats.active} active)`, 250, yPos);
            yPos += 20;
            addPageBreakIfNeeded();
          });
          
          yPos += 20;
        }
        
        // Top Products by Sales
        if (supplier.orders && supplier.orders.length > 0) {
          addPageBreakIfNeeded();
          doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text('Top Selling Products', 50, yPos);
          yPos += 30;
          
          const productSales = {};
          supplier.orders.forEach(order => {
            if (order.items) {
              order.items.forEach(item => {
                const productName = item.name || item.productName || 'Unknown Product';
                if (!productSales[productName]) {
                  productSales[productName] = { quantity: 0, revenue: 0 };
                }
                productSales[productName].quantity += item.quantity || 1;
                productSales[productName].revenue += (item.price || 0) * (item.quantity || 1);
              });
            }
          });
          
          const topProducts = Object.entries(productSales)
            .sort(([,a], [,b]) => b.revenue - a.revenue)
            .slice(0, 10);
          
          topProducts.forEach(([productName, stats], index) => {
            doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text(`${index + 1}. ${productName}:`, 50, yPos);
            doc.font('Helvetica').text(`${stats.quantity} sold, ${formatCurrency(stats.revenue)} revenue`, 50, yPos + 15);
            yPos += 35;
            addPageBreakIfNeeded();
          });
          
          yPos += 20;
        }
        
        // Recent Orders Details
        if (supplier.orders && supplier.orders.length > 0) {
          addPageBreakIfNeeded();
          doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text('Recent Orders (Last 20)', 50, yPos);
          yPos += 30;
          
          const recentOrders = supplier.orders
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 20);
          
          recentOrders.forEach((order, index) => {
            const orderDate = formatDate(order.createdAt);
            const orderValue = formatCurrency(order.pricing?.totalAmount || 0);
            const status = (order.status || 'pending').toUpperCase();
            
            doc.fontSize(11).font('Helvetica-Bold').fillColor('#333')
              .text(`Order #${index + 1}`, 50, yPos);
            doc.fontSize(10).font('Helvetica').fillColor('#666')
              .text(`${orderDate} | ${status} | ${orderValue}`, 50, yPos + 15);
            
            if (order.items && order.items.length > 0) {
              doc.text(`Items: ${order.items.map(item => `${item.name || 'Unknown'} (${item.quantity || 1})`).join(', ')}`, 50, yPos + 28);
            }
            
            yPos += 50;
            addPageBreakIfNeeded();
          });
        }

      } else if (userData.customer) {
        const customer = userData.customer;
        
        // Statistics Section
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text('Shopping Statistics', 50, yPos);
        yPos += 30;
        
        const stats = [
          ['Total Orders', customer.statistics.totalOrders],
          ['Total Spent', formatCurrency(customer.statistics.totalSpent)],
          ['Completed Orders', customer.statistics.completedOrders],
          ['Pending Orders', customer.statistics.pendingOrders],
          ['Average Order Value', formatCurrency(customer.statistics.totalOrders > 0 ? customer.statistics.totalSpent / customer.statistics.totalOrders : 0)]
        ];
        
        stats.forEach(([label, value]) => {
          doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text(label + ':', 50, yPos);
          doc.font('Helvetica').text(String(value), 200, yPos);
          yPos += 20;
        });
      }
      
      // Addresses Section
      if (userData.addresses && userData.addresses.length > 0) {
        yPos += 20;
        addPageBreakIfNeeded();
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text('Addresses', 50, yPos);
        yPos += 30;
        
        userData.addresses.forEach((address, index) => {
          doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text(`Address ${index + 1}:`, 50, yPos);
          doc.fontSize(10).font('Helvetica').fillColor('#666').text(`${address.addressLine1}`, 50, yPos + 15);
          if (address.addressLine2) {
            doc.text(`${address.addressLine2}`, 50, yPos + 28);
            yPos += 13;
          }
          doc.text(`${address.city}, ${address.state} - ${address.pincode}`, 50, yPos + 28);
          yPos += 50;
          addPageBreakIfNeeded();
        });
      }
      
      // Footer
      addPageBreakIfNeeded();
      yPos = Math.max(yPos + 50, 750);
      doc.fontSize(10).font('Helvetica').fillColor('#666')
        .text('This comprehensive data export was generated from AggreKart platform.', 50, yPos)
        .text('For any questions regarding your data, please contact support@aggrekart.com', 50, yPos + 15);
      
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
  static async gatherUserData(user) {
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
}

module.exports = ReportGenerator;