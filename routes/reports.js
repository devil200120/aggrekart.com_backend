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

module.exports = router;