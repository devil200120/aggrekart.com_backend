const express = require('express');
const router = express.Router();
const Newsletter = require('../models/Newsletter');
const { body, validationResult } = require('express-validator');
const { sendWelcomeEmail, testEmailConfiguration } = require('../utils/emailService');

// @desc    Subscribe to newsletter
// @route   POST /api/newsletter/subscribe
// @access  Public
router.get('/test-email', async (req, res) => {
  try {
    console.log('🧪 Testing email configuration...');
    
    const testResult = await testEmailConfiguration();
    
    if (testResult.success) {
      res.status(200).json({
        success: true,
        message: 'Email configuration test passed! Check your inbox.',
        data: testResult
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Email configuration test failed',
        error: testResult.error
      });
    }
    
  } catch (error) {
    console.error('❌ Email test error:', error);
    res.status(500).json({
      success: false,
      message: 'Email test failed',
      error: error.message
    });
  }
});
router.post('/subscribe', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('source')
    .optional()
    .isString()
    .withMessage('Source must be a string')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address',
        errors: errors.array()
      });
    }

    const { email, source = 'homepage' } = req.body;

    // Check if email already exists
    const existingSubscriber = await Newsletter.findOne({ email });

    if (existingSubscriber) {
      if (existingSubscriber.isActive) {
        return res.status(200).json({
          success: true,
          message: 'You are already subscribed to our newsletter!',
          data: {
            email: existingSubscriber.email,
            subscribedAt: existingSubscriber.subscribedAt
          }
        });
      } else {
        // Reactivate subscription
        existingSubscriber.isActive = true;
        existingSubscriber.unsubscribedAt = null;
        existingSubscriber.source = source;
        await existingSubscriber.save();

        // Send welcome back email
        try {
          await sendWelcomeEmail(email);
          console.log('Welcome back email sent to:', email);
        } catch (emailError) {
          console.error('Failed to send welcome back email:', emailError);
          // Don't fail the subscription if email fails
        }

        return res.status(200).json({
          success: true,
          message: 'Welcome back! Your newsletter subscription has been reactivated. Check your email for details.',
          data: {
            email: existingSubscriber.email,
            subscribedAt: existingSubscriber.subscribedAt
          }
        });
      }
    }

    // Create new subscription
    const newSubscriber = new Newsletter({
      email,
      source
    });

    await newSubscriber.save();

    // Send welcome email
    try {
      const emailResult = await sendWelcomeEmail(email);
      console.log('Welcome email sent to:', email, 'Result:', emailResult);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail the subscription if email fails - user is still subscribed
    }

    res.status(201).json({
      success: true,
      message: 'Successfully subscribed to newsletter! Welcome email sent. Check your inbox.',
      data: {
        email: newSubscriber.email,
        subscribedAt: newSubscriber.subscribedAt
      }
    });

  } catch (error) {
    console.error('Newsletter subscription error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'This email is already subscribed to our newsletter'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Unsubscribe from newsletter
// @route   POST /api/newsletter/unsubscribe
// @access  Public
router.post('/unsubscribe', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address',
        errors: errors.array()
      });
    }

    const { email } = req.body;

    const subscriber = await Newsletter.findOne({ email });

    if (!subscriber) {
      return res.status(404).json({
        success: false,
        message: 'Email not found in our newsletter list'
      });
    }

    if (!subscriber.isActive) {
      return res.status(200).json({
        success: true,
        message: 'You are already unsubscribed from our newsletter'
      });
    }

    await subscriber.unsubscribe();

    res.status(200).json({
      success: true,
      message: 'Successfully unsubscribed from newsletter. We\'re sorry to see you go!'
    });

  } catch (error) {
    console.error('Newsletter unsubscribe error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.'
    });
  }
});

// @desc    Get newsletter stats (Admin only)
// @route   GET /api/newsletter/stats
// @access  Private/Admin
router.get('/stats', async (req, res) => {
  try {
    const totalSubscribers = await Newsletter.countDocuments({});
    const activeSubscribers = await Newsletter.countDocuments({ isActive: true });
    const inactiveSubscribers = await Newsletter.countDocuments({ isActive: false });

    res.status(200).json({
      success: true,
      data: {
        total: totalSubscribers,
        active: activeSubscribers,
        inactive: inactiveSubscribers,
        activePercentage: totalSubscribers > 0 ? Math.round((activeSubscribers / totalSubscribers) * 100) : 0
      }
    });

  } catch (error) {
    console.error('Newsletter stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.'
    });
  }
});

// @desc    Get all subscribers (Admin only)
// @route   GET /api/newsletter/subscribers
// @access  Private/Admin
router.get('/subscribers', async (req, res) => {
  try {
    const subscribers = await Newsletter.find({})
      .select('email isActive subscribedAt source')
      .sort({ subscribedAt: -1 })
      .limit(100); // Limit to recent 100

    res.status(200).json({
      success: true,
      count: subscribers.length,
      data: subscribers
    });

  } catch (error) {
    console.error('Get subscribers error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.'
    });
  }
});

module.exports = router;