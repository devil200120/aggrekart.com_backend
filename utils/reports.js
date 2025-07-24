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