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
}

module.exports = ReportGenerator;
