const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Order = require('../models/Order');
const { ErrorHandler } = require('../utils/errorHandler');
const { sendEmail, sendSMS } = require('../utils/notifications');
const mongoose = require('mongoose');
const router = express.Router();

// Utility function to normalize status values
const normalizeStatus = (status) => {
  if (!status) return 'open';
  
  // Convert hyphen format to underscore format for database storage
  const statusMap = {
    'in-progress': 'in_progress',
    'pending-customer': 'pending_customer'
  };
  
  return statusMap[status] || status;
};

// Utility function to check if a string is a valid ObjectId
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// Helper function to generate ticket ID
const generateTicketId = async () => {
  try {
    const lastTicket = await Ticket.findOne({}, {}, { sort: { 'createdAt': -1 } });
    let nextNumber = 1;
    
    if (lastTicket && lastTicket.ticketId) {
      const lastNumber = parseInt(lastTicket.ticketId.replace('TKT-', ''));
      nextNumber = lastNumber + 1;
    }
    
    return `TKT-${nextNumber.toString().padStart(6, '0')}`;
  } catch (error) {
    console.error('Error generating ticket ID:', error);
    // Fallback to timestamp-based ID
    const timestamp = Date.now();
    return `TKT-${timestamp.toString().slice(-6)}`;
  }
};

// Helper function to send admin notifications
const sendAdminNotification = async (ticket, action) => {
  try {
    console.log(`📧 Sending admin notification for ${action} on ticket ${ticket.ticketId}`);
    
    const adminUsers = await User.find({ role: 'admin' });
    
    const subject = `[Aggrekart Support] ${action.replace('_', ' ').toUpperCase()} - Ticket ${ticket.ticketId}`;
    let htmlContent = '';
    
    switch (action) {
      case 'new_ticket':
        htmlContent = `
          <h2>New Support Ticket Created</h2>
          <p><strong>Ticket ID:</strong> ${ticket.ticketId}</p>
          <p><strong>Subject:</strong> ${ticket.subject}</p>
          <p><strong>Category:</strong> ${ticket.category}</p>
          <p><strong>Priority:</strong> ${ticket.priority}</p>
          <p><strong>Customer:</strong> ${ticket.user.name}</p>
          <p><strong>Description:</strong> ${ticket.description}</p>
          <p><a href="${process.env.FRONTEND_URL}/admin/support">View Ticket</a></p>
        `;
        break;
      case 'customer_reply':
        htmlContent = `
          <h2>Customer Reply on Ticket</h2>
          <p><strong>Ticket ID:</strong> ${ticket.ticketId}</p>
          <p><strong>Subject:</strong> ${ticket.subject}</p>
          <p><strong>Customer:</strong> ${ticket.user.name}</p>
          <p>The customer has replied to this ticket. Please check the support dashboard for details.</p>
          <p><a href="${process.env.FRONTEND_URL}/admin/support">View Ticket</a></p>
        `;
        break;
    }
    
    for (const admin of adminUsers) {
      try {
        await sendEmail(admin.email, subject, htmlContent);
      } catch (emailError) {
        console.error(`Failed to send email to ${admin.email}:`, emailError);
      }
    }
  } catch (error) {
    console.error('Error sending admin notification:', error);
    throw error;
  }
};

// Helper function to send customer notifications
const sendCustomerNotification = async (ticket, action) => {
  try {
    console.log(`📧 Sending customer notification for ${action} on ticket ${ticket.ticketId}`);
    
    let subject = '';
    let htmlContent = '';
    
    switch (action) {
      case 'ticket_created':
        subject = `[Aggrekart Support] Ticket Created - ${ticket.ticketId}`;
        htmlContent = `
          <h2>Support Ticket Created Successfully</h2>
          <p>Dear ${ticket.user.name},</p>
          <p>Your support ticket has been created successfully.</p>
          <p><strong>Ticket ID:</strong> ${ticket.ticketId}</p>
          <p><strong>Subject:</strong> ${ticket.subject}</p>
          <p><strong>Status:</strong> ${ticket.status}</p>
          <p>We will respond to your ticket as soon as possible.</p>
          <p><a href="${process.env.FRONTEND_URL}/support/tickets/${ticket.ticketId}">View Ticket</a></p>
        `;
        break;
      case 'admin_reply':
        subject = `[Aggrekart Support] Reply on Ticket ${ticket.ticketId}`;
        htmlContent = `
          <h2>New Reply on Your Support Ticket</h2>
          <p>Dear ${ticket.user.name},</p>
          <p>There's a new reply on your support ticket.</p>
          <p><strong>Ticket ID:</strong> ${ticket.ticketId}</p>
          <p><strong>Subject:</strong> ${ticket.subject}</p>
          <p><a href="${process.env.FRONTEND_URL}/support/tickets/${ticket.ticketId}">View Reply</a></p>
        `;
        break;
      case 'status_updated':
        subject = `[Aggrekart Support] Ticket Status Updated - ${ticket.ticketId}`;
        htmlContent = `
          <h2>Your Ticket Status Has Been Updated</h2>
          <p>Dear ${ticket.user.name},</p>
          <p>The status of your support ticket has been updated.</p>
          <p><strong>Ticket ID:</strong> ${ticket.ticketId}</p>
          <p><strong>Subject:</strong> ${ticket.subject}</p>
          <p><strong>New Status:</strong> ${ticket.status}</p>
          <p><a href="${process.env.FRONTEND_URL}/support/tickets/${ticket.ticketId}">View Ticket</a></p>
        `;
        break;
    }
    
    await sendEmail(ticket.user.email, subject, htmlContent);
  } catch (error) {
    console.error('Error sending customer notification:', error);
    throw error;
  }
};

// ===== CUSTOMER ROUTES =====

// @route   POST /api/support/tickets
// @desc    Create a new support ticket
// @access  Private (Customer)
// @route   POST /api/support/tickets
// @desc    Create a new support ticket
// @access  Private (Customer)
router.post('/tickets', auth, [
  body('subject')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Subject must be between 3 and 200 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters'),
  body('category')
    .isIn(['order_inquiry', 'payment_issue', 'product_inquiry', 'delivery_issue', 
           'account_issue', 'technical_support', 'billing_inquiry', 'complaint', 
           'feature_request', 'other'])
    .withMessage('Invalid category'),
  body('priority')
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority'),
  body('relatedOrderId')
    .optional()
    .isMongoId()
    .withMessage('Invalid order ID format')
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
      subject, 
      description, 
      category, 
      priority, 
      relatedOrderId,
      orderDetails,
      relatedSupplierId 
    } = req.body;

    // Generate ticket ID
    const ticketCount = await Ticket.countDocuments({});
    const ticketId = `TKT-${String(ticketCount + 1).padStart(6, '0')}`;

    // Enhanced: Gather customer contact info
    const customerContactInfo = {
      phone: req.user.phoneNumber,
      email: req.user.email,
      preferredContactMethod: 'email'
    };

    const ticketData = {
      ticketId,
      user: req.user._id,
      subject: subject.trim(),
      description: description.trim(),
      category,
      priority,
      customerContactInfo
    };

    // Enhanced: Link order and supplier information
    if (relatedOrderId) {
      // Verify order belongs to user
      const order = await Order.findOne({ 
        _id: relatedOrderId, 
        customer: req.user._id 
      }).populate('supplier');

      if (order) {
        ticketData.relatedOrder = relatedOrderId;
        ticketData.orderDetails = orderDetails || {
          orderId: order.orderId,
          orderAmount: order.pricing?.totalAmount,
          orderStatus: order.status,
          supplierName: order.supplier?.companyName,
          supplierContact: order.supplier?.contactPersonNumber
        };
        
        if (order.supplier) {
          ticketData.relatedSupplier = order.supplier._id;
        }
      }
    }

    // Add initial message
    ticketData.messages = [{
      sender: req.user._id,
      senderType: 'customer',
      message: description.trim(),
      timestamp: new Date()
    }];

        const ticket = new Ticket(ticketData);
    await ticket.save();

    console.log(`✅ Created ticket ${ticketId} for user ${req.user.name}`);

    // Populate user data for notifications
    await ticket.populate('user', 'name email');

    // Send notification to admin team
    try {
      await sendAdminNotification(ticket, 'new_ticket');
      console.log('✅ Admin notification sent');
    } catch (emailError) {
      console.error('Failed to send admin notification:', emailError);
    }

    // Send confirmation notification to customer
    try {
      await sendCustomerNotification(ticket, 'ticket_created');
      console.log('✅ Customer notification sent');
    } catch (emailError) {
      console.error('Failed to send customer notification:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'Support ticket created successfully',
      data: {
        ticket: {
          ticketId: ticket.ticketId,
          subject: ticket.subject,
          category: ticket.category,
          priority: ticket.priority,
          status: ticket.status,
          createdAt: ticket.createdAt
        }
      }
    });

  } catch (error) {
    console.error('❌ Error creating ticket:', error);
    next(error);
  }
});
// @route   GET /api/support/tickets
// @desc    Get user's support tickets
// @access  Private (Customer)
router.get('/tickets', auth, [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('status')
    .optional()
    .custom((value) => {
      // Accept both formats
      const validStatuses = ['open', 'in-progress', 'in_progress', 'resolved', 'closed'];
      if (!validStatuses.includes(value)) {
        throw new Error('Invalid status');
      }
      return true;
    }),
  query('category')
    .optional()
    .isIn(['order_inquiry', 'payment_issue', 'product_inquiry', 'delivery_issue', 
           'account_issue', 'technical_support', 'billing_inquiry', 'complaint', 
           'feature_request', 'other'])
    .withMessage('Invalid category'),
  query('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority')
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

    // Only customers can view their own tickets
    if (req.user.role !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter with normalized status
    const filter = { user: req.user._id };
    
    if (req.query.status) filter.status = normalizeStatus(req.query.status);
    if (req.query.category) filter.category = req.query.category;
    if (req.query.priority) filter.priority = req.query.priority;

    console.log('🔍 Fetching tickets with filter:', filter);

    const [tickets, total] = await Promise.all([
  Ticket.find(filter)
    .populate('user', 'name email phoneNumber')
    .populate('handledBy', 'name email')
    .populate({
      path: 'relatedOrder',
      select: 'orderId status pricing.totalAmount createdAt',
      populate: {
        path: 'supplier',
        select: 'companyName contactPersonNumber email city state'
      }
    })
    .populate({
      path: 'relatedSupplier',
      select: 'companyName contactPersonNumber email city state'
    })
    .sort({ lastActivityAt: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean(),
  Ticket.countDocuments(filter)
]);

    console.log(`✅ Found ${tickets.length} tickets out of ${total} total`);

    // Add unread message count for each ticket
    const ticketsWithUnread = tickets.map(ticket => {
      const lastAdminMessage = ticket.messages
        .filter(msg => msg.senderType === 'admin')
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
      
      let hasUnreadMessages = false;
      if (lastAdminMessage) {
        const lastCustomerMessage = ticket.messages
          .filter(msg => msg.senderType === 'customer')
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        
        hasUnreadMessages = !lastCustomerMessage || 
          new Date(lastAdminMessage.timestamp) > new Date(lastCustomerMessage.timestamp);
      }

      return {
        ...ticket,
        hasUnreadMessages,
        lastMessage: ticket.messages[ticket.messages.length - 1]
      };
    });

    res.json({
      success: true,
      data: {
        tickets: ticketsWithUnread,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching tickets:', error);
    next(error);
  }
});

// @route   GET /api/support/tickets/:ticketId
// @desc    Get specific support ticket details
// @access  Private (Customer)
router.get('/tickets/:ticketId', auth, [
  param('ticketId').notEmpty().withMessage('Ticket ID is required')
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

    const { ticketId } = req.params;

    // Only customers can view their own tickets
    if (req.user.role !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    console.log('🔍 Looking for ticket:', ticketId, 'for user:', req.user._id);

    // Find ticket by either ticketId (string) or _id (ObjectId)
    let query = { user: req.user._id };
    
    if (isValidObjectId(ticketId)) {
      query.$or = [
        { ticketId: ticketId },
        { _id: new mongoose.Types.ObjectId(ticketId) }
      ];
    } else {
      query.ticketId = ticketId;
    }

    const ticket = await Ticket.findOne(query)
      .populate('user', 'name email phone')
      .populate('handledBy', 'name email')
      .populate('relatedOrder', 'orderNumber status total')
      .lean();

    if (!ticket) {
      console.log('❌ Ticket not found');
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    console.log('✅ Ticket found:', ticket.ticketId);

    // Filter out internal messages for customers
    const filteredMessages = ticket.messages.filter(msg => !msg.isInternal);

    res.json({
      success: true,
      data: {
        ticket: {
          ...ticket,
          messages: filteredMessages
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching ticket details:', error);
    next(error);
  }
});

// @route   POST /api/support/tickets/:ticketId/reply
// @desc    Reply to a support ticket
// @access  Private (Customer)
router.post('/tickets/:ticketId/reply', auth, [
  param('ticketId').notEmpty().withMessage('Ticket ID is required'),
  body('message')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Message must be between 1 and 2000 characters')
], async (req, res, next) => {
  try {
    console.log('💬 Customer replying to ticket:', req.params.ticketId);
    console.log('👤 User:', req.user.name, req.user._id);
    console.log('📝 Message:', req.body.message);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { ticketId } = req.params;
    const { message } = req.body;

    // Only customers can reply to their own tickets
    if (req.user.role !== 'customer') {
      console.log('❌ Non-customer tried to reply:', req.user.role);
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Find ticket by either ticketId (string) or _id (ObjectId)
    let query = { user: req.user._id };
    
    if (isValidObjectId(ticketId)) {
      query.$or = [
        { ticketId: ticketId },
        { _id: new mongoose.Types.ObjectId(ticketId) }
      ];
    } else {
      query.ticketId = ticketId;
    }

    console.log('🔍 Looking for ticket with query:', query);

    const ticket = await Ticket.findOne(query).populate('user', 'name email');

    if (!ticket) {
      console.log('❌ Ticket not found or access denied');
      return res.status(404).json({
        success: false,
        message: 'Ticket not found or access denied'
      });
    }

    console.log('✅ Ticket found:', ticket.ticketId, 'Status:', ticket.status);

    if (ticket.status === 'closed') {
      console.log('❌ Ticket is closed');
      return res.status(400).json({
        success: false,
        message: 'Cannot reply to a closed ticket'
      });
    }

    // Add message to ticket
    console.log('📨 Adding message to ticket...');
    await ticket.addMessage(req.user._id, 'customer', message);

    // Update ticket status if it was resolved
    if (ticket.status === 'resolved') {
      console.log('🔄 Updating ticket status from resolved to open');
      await ticket.updateStatus('open', req.user._id);
    }

    console.log(`✅ Customer reply added to ticket ${ticket.ticketId}`);

    // Notify admin team
    try {
      await sendAdminNotification(ticket, 'customer_reply');
      console.log('📧 Admin notification sent');
    } catch (emailError) {
      console.error('Failed to send admin notification:', emailError);
    }

    res.json({
      success: true,
      message: 'Reply added successfully',
      data: {
        ticket: {
          ticketId: ticket.ticketId,
          status: ticket.status,
          lastActivityAt: ticket.lastActivityAt
        }
      }
    });

  } catch (error) {
    console.error('❌ Error adding reply to ticket:', error);
    next(error);
  }
});

// @route   PUT /api/support/tickets/:ticketId/close
// @desc    Close a support ticket
// @access  Private (Customer)
router.put('/tickets/:ticketId/close', auth, [
  param('ticketId').notEmpty().withMessage('Ticket ID is required')
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

    const { ticketId } = req.params;

    // Only customers can close their own tickets
    if (req.user.role !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Find ticket by either ticketId (string) or _id (ObjectId)
    let query = { user: req.user._id };
    
    if (isValidObjectId(ticketId)) {
      query.$or = [
        { ticketId: ticketId },
        { _id: new mongoose.Types.ObjectId(ticketId) }
      ];
    } else {
      query.ticketId = ticketId;
    }

    const ticket = await Ticket.findOne(query).populate('user', 'name email');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found or access denied'
      });
    }

    if (ticket.status === 'closed') {
      return res.status(400).json({
        success: false,
        message: 'Ticket is already closed'
      });
    }

    // Update ticket status
    await ticket.updateStatus('closed', req.user._id);

    console.log(`🔒 Customer closed ticket ${ticket.ticketId}`);

    // Send notification
    try {
      await sendCustomerNotification(ticket, 'status_updated');
    } catch (emailError) {
      console.error('Failed to send customer notification:', emailError);
    }

    res.json({
      success: true,
      message: 'Ticket closed successfully',
      data: {
        ticket: {
          ticketId: ticket.ticketId,
          status: ticket.status,
          closedAt: ticket.closedAt
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/support/tickets/:ticketId/rating
// @desc    Rate a support ticket
// @access  Private (Customer)
router.post('/tickets/:ticketId/rating', auth, [
  param('ticketId').notEmpty().withMessage('Ticket ID is required'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Comment must be less than 500 characters')
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

    const { ticketId } = req.params;
    const { rating, comment } = req.body;

    // Only customers can rate their own tickets
    if (req.user.role !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Find ticket by either ticketId (string) or _id (ObjectId)
    let query = { user: req.user._id };
    
    if (isValidObjectId(ticketId)) {
      query.$or = [
        { ticketId: ticketId },
        { _id: new mongoose.Types.ObjectId(ticketId) }
      ];
    } else {
      query.ticketId = ticketId;
    }

    const ticket = await Ticket.findOne(query);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found or access denied'
      });
    }

    if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
      return res.status(400).json({
        success: false,
        message: 'Can only rate resolved or closed tickets'
      });
    }

    if (ticket.rating && ticket.rating.rating) {
      return res.status(400).json({
        success: false,
        message: 'Ticket has already been rated'
      });
    }

    // Add rating
    ticket.rating = {
      rating,
      comment: comment || '',
      ratedAt: new Date()
    };

    await ticket.save();

    console.log(`⭐ Customer rated ticket ${ticket.ticketId} with ${rating} stars`);

    res.json({
      success: true,
      message: 'Rating added successfully',
      data: {
        ticket: {
          ticketId: ticket.ticketId,
          rating: ticket.rating
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// ===== ADMIN ROUTES =====

// @route   GET /api/support/admin/tickets
// @desc    Get all support tickets (Admin only)
// @access  Private (Admin)
router.get('/admin/tickets', auth, authorize('admin'), [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .custom((value) => {
      // Accept both formats
      const validStatuses = ['open', 'in-progress', 'in_progress', 'resolved', 'closed'];
      if (!validStatuses.includes(value)) {
        throw new Error('Invalid status');
      }
      return true;
    }),
  query('category')
    .optional()
    .isIn(['order_inquiry', 'payment_issue', 'product_inquiry', 'delivery_issue', 
           'account_issue', 'technical_support', 'billing_inquiry', 'complaint', 
           'feature_request', 'other'])
    .withMessage('Invalid category'),
  query('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority'),
  query('search')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters'),
  query('handledBy')
    .optional()
    .custom((value) => {
      if (value && !isValidObjectId(value)) {
        throw new Error('Invalid admin ID format');
      }
      return true;
    })
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

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    // Build filter with normalized status
    const filter = {};
    
    if (req.query.status) filter.status = normalizeStatus(req.query.status);
    if (req.query.category) filter.category = req.query.category;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.handledBy) filter.handledBy = new mongoose.Types.ObjectId(req.query.handledBy);

    // Add search functionality
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { ticketId: searchRegex },
        { subject: searchRegex },
        { description: searchRegex }
      ];
    }

    console.log('🔍 Admin fetching tickets with filter:', filter);


    const [tickets, total] = await Promise.all([
      Ticket.find(filter)
        .populate({
          path: 'user',
          select: 'name email phoneNumber role'
        })
        .populate({
          path: 'relatedOrder', 
          select: 'orderId status pricing.totalAmount createdAt',
          populate: {
            path: 'supplier',
            select: 'companyName contactPersonNumber email'
          }
        })
        .populate({
          path: 'relatedSupplier',
          select: 'companyName contactPersonNumber email city state'
        })
        .populate({
          path: 'handledBy',
          select: 'name email'
        })
        .sort({ priority: -1, lastActivityAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Ticket.countDocuments(filter)
    ]);

    console.log(`✅ Admin found ${tickets.length} tickets out of ${total} total`);

    // 🆕 ADD ENHANCED METADATA FOR EACH TICKET:
    const ticketsWithMetadata = tickets.map(ticket => {
      const lastMessage = ticket.messages[ticket.messages.length - 1];
      const customerMessages = ticket.messages.filter(msg => msg.senderType === 'customer');
      const adminMessages = ticket.messages.filter(msg => msg.senderType === 'admin');
      
      let needsResponse = false;
      if (customerMessages.length > 0) {
        const lastCustomerMessage = customerMessages[customerMessages.length - 1];
        const lastAdminMessage = adminMessages.length > 0 ? adminMessages[adminMessages.length - 1] : null;
        
        needsResponse = !lastAdminMessage || 
          new Date(lastCustomerMessage.timestamp) > new Date(lastAdminMessage.timestamp);
      }

      return {
        ...ticket,
        lastMessage,
        responseCount: adminMessages.length,
        needsResponse,
        daysSinceCreated: Math.floor((new Date() - new Date(ticket.createdAt)) / (1000 * 60 * 60 * 24)),
        // 🆕 ADD COMPLETE CUSTOMER, ORDER, AND SUPPLIER INFO:
        customerInfo: {
          name: ticket.user?.name,
          email: ticket.customerContactInfo?.email || ticket.user?.email,
          phone: ticket.customerContactInfo?.phone || ticket.user?.phoneNumber,
          role: ticket.user?.role
        },
        orderInfo: ticket.relatedOrder ? {
          orderId: ticket.relatedOrder.orderId || ticket.orderDetails?.orderId,
          status: ticket.relatedOrder.status || ticket.orderDetails?.orderStatus,
          amount: ticket.relatedOrder.pricing?.totalAmount || ticket.orderDetails?.orderAmount,
          date: ticket.relatedOrder.createdAt,
          supplierFromOrder: ticket.relatedOrder.supplier?.companyName
        } : null,
        supplierInfo: ticket.relatedSupplier ? {
          name: ticket.relatedSupplier.companyName || ticket.orderDetails?.supplierName,
          phone: ticket.relatedSupplier.contactPersonNumber || ticket.orderDetails?.supplierContact,
          email: ticket.relatedSupplier.email,
          location: `${ticket.relatedSupplier.city || ''}, ${ticket.relatedSupplier.state || ''}`.trim().replace(/^,\s*|,\s*$/g, '') || 'Not specified'
        } : (ticket.orderDetails?.supplierName ? {
          name: ticket.orderDetails.supplierName,
          phone: ticket.orderDetails.supplierContact,
          email: 'Not available',
          location: 'Not available'
        } : null)
      };
    });

    res.json({
      success: true,
      data: {
        tickets: ticketsWithMetadata,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching admin tickets:', error);
    next(error);
  }
});

// @route   GET /api/support/admin/tickets/:ticketId
// @desc    Get specific ticket details (Admin only)
// @access  Private (Admin)
router.get('/admin/tickets/:ticketId', auth, authorize('admin'), [
  param('ticketId').notEmpty().withMessage('Ticket ID is required')
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

    const { ticketId } = req.params;

    console.log('🔍 Admin looking for ticket:', ticketId);

    // Find ticket by either ticketId (string) or _id (ObjectId)
    let query = {};
    
    if (isValidObjectId(ticketId)) {
      query.$or = [
        { ticketId: ticketId },
        { _id: new mongoose.Types.ObjectId(ticketId) }
      ];
    } else {
      query.ticketId = ticketId;
    }

    const ticket = await Ticket.findOne(query)
      .populate('user', 'name email phone')
      .populate('handledBy', 'name email')
      .populate('relatedOrder', 'orderNumber status total customer')
      .lean();

    if (!ticket) {
      console.log('❌ Ticket not found');
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    console.log('✅ Admin ticket found:', ticket.ticketId);

    // Include all messages (including internal ones) for admin
    res.json({
      success: true,
      data: {
        ticket
      }
    });

  } catch (error) {
    console.error('❌ Error fetching admin ticket details:', error);
    next(error);
  }
});

// @route   PUT /api/support/admin/tickets/:ticketId/assign
// @desc    Assign ticket to admin (Admin only)
// @access  Private (Admin)
router.put('/admin/tickets/:ticketId/assign', auth, authorize('admin'), [
  param('ticketId').notEmpty().withMessage('Ticket ID is required'),
  body('adminId')
    .optional()
    .custom((value) => {
      if (value && !isValidObjectId(value)) {
        throw new Error('Invalid admin ID format');
      }
      return true;
    })
], async (req, res, next) => {
  try {
    console.log('👤 Admin assigning ticket:', req.params.ticketId);
    console.log('🔧 Assigning to admin:', req.body.adminId);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { ticketId } = req.params;
    const { adminId } = req.body;

    // Find ticket by either ticketId (string) or _id (ObjectId)
    let query = {};
    
    if (isValidObjectId(ticketId)) {
      query.$or = [
        { ticketId: ticketId },
        { _id: new mongoose.Types.ObjectId(ticketId) }
      ];
    } else {
      query.ticketId = ticketId;
    }

    console.log('🔍 Looking for ticket with query:', query);

    const ticket = await Ticket.findOne(query).populate('user', 'name email');

    if (!ticket) {
      console.log('❌ Ticket not found');
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    console.log('✅ Ticket found:', ticket.ticketId);

    // Validate admin exists if adminId provided
    if (adminId) {
      const admin = await User.findOne({ 
        _id: new mongoose.Types.ObjectId(adminId), 
        role: 'admin' 
      });
      
      if (!admin) {
        console.log('❌ Admin not found:', adminId);
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }
      
      console.log('✅ Admin found:', admin.name);
      ticket.handledBy = adminId;
    } else {
      console.log('🔄 Unassigning ticket');
      ticket.handledBy = null;
    }

    // FIXED: Update status to in-progress if assigning (without auto-saving)
    if (adminId && ticket.status === 'open') {
      console.log('🔄 Updating status to in-progress');
      ticket.updateStatus('in-progress', req.user._id);
    }

    // Save once at the end
    await ticket.save();

    console.log(`👤 Ticket ${ticket.ticketId} assigned to admin: ${adminId || 'unassigned'}`);

    res.json({
      success: true,
      message: adminId ? 'Ticket assigned successfully' : 'Ticket unassigned successfully',
      data: {
        ticket: {
          ticketId: ticket.ticketId,
          handledBy: ticket.handledBy,
          status: ticket.status
        }
      }
    });

  } catch (error) {
    console.error('❌ Error assigning ticket:', error);
    next(error);
  }
});

// @route   PUT /api/support/admin/tickets/:ticketId/status
// @desc    Update ticket status (Admin only)
// @access  Private (Admin)
// Around lines 1100-1130, replace the status normalization logic:

router.put('/admin/tickets/:ticketId/status', auth, authorize('admin'), [
  param('ticketId').notEmpty().withMessage('Ticket ID is required'),
  body('status')
    .custom((value) => {
      // Accept both formats but normalize to model format
      const validStatuses = ['open', 'in-progress', 'in_progress', 'pending_customer', 'resolved', 'closed'];
      if (!validStatuses.includes(value)) {
        throw new Error('Invalid status. Must be one of: open, in-progress, pending_customer, resolved, closed');
      }
      return true;
    }),
  body('message')
    .optional()
    .trim()
    .isLength({ min: 0, max: 500 })
    .withMessage('Message must not exceed 500 characters')
], async (req, res, next) => {
  try {
    console.log('🔄 Admin updating ticket status:', req.params.ticketId);
    console.log('👤 Admin:', req.user.name, req.user._id);
    console.log('📝 Request body:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { ticketId } = req.params;
    const { status, message = '' } = req.body;
    
    // FIXED: Normalize status to match database enum (hyphen format)
const normalizedStatus = status.replace('_', '-'); // CORRECT: converts in_progress to in-progress    
    console.log('📝 Original Status:', status);
    console.log('📝 Normalized Status:', normalizedStatus);
    console.log('💬 Admin Message:', message);

    // Find ticket by either ticketId (string) or _id (ObjectId)
    let query = {};
    
    if (mongoose.Types.ObjectId.isValid(ticketId)) {
      query.$or = [
        { ticketId: ticketId },
        { _id: new mongoose.Types.ObjectId(ticketId) }
      ];
    } else {
      query.ticketId = ticketId;
    }

    console.log('🔍 Looking for ticket with query:', query);

    const ticket = await Ticket.findOne(query).populate('user', 'name email');

    if (!ticket) {
      console.log('❌ Ticket not found');
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    console.log('✅ Ticket found:', ticket.ticketId, 'Current Status:', ticket.status);

    const oldStatus = ticket.status;
    
    // Update status
    ticket.status = normalizedStatus;
    
    if (normalizedStatus === 'resolved') {
      ticket.resolvedAt = new Date();
    } else if (normalizedStatus === 'closed') {
      ticket.closedAt = new Date();
    }
    
    // Add status change message to messages array
   // Replace the adminNotes handling section around lines 1175-1190:

    // Add status change message to messages array
    if (!Array.isArray(ticket.messages)) {
      ticket.messages = [];
    }
    
    // Add system message for status change
    ticket.messages.push({
      sender: req.user._id,
      senderType: 'admin',
      message: `Status changed from ${oldStatus} to ${normalizedStatus}${message ? `: ${message}` : ''}`,
      timestamp: new Date(),
      isInternal: false // Make it visible to customer
    });
    
    // FIXED: Clean and handle adminNotes properly
    if (!Array.isArray(ticket.adminNotes)) {
      ticket.adminNotes = [];
    }
    
    // Filter out any invalid entries (empty strings, nulls, etc.)
    ticket.adminNotes = ticket.adminNotes.filter(note => {
      return note && 
             typeof note === 'object' && 
             note.admin && 
             note.note && 
             typeof note.note === 'string' && 
             note.note.trim() !== '';
    });
    
    // If there's an admin message, add it as an admin note
    if (message && message.trim()) {
      ticket.adminNotes.push({
        admin: req.user._id,
        note: message.trim(),
        timestamp: new Date()
      });
    }
    
    // Update the updatedAt timestamp
    
    // Update the updatedAt timestamp
    ticket.updatedAt = new Date();
    
    // Save the ticket
    await ticket.save();

    console.log(`🔄 Ticket ${ticket.ticketId} status updated from ${oldStatus} to ${normalizedStatus}`);

    // Send customer notification for status changes
    try {
      await sendCustomerNotification(ticket, 'status_updated');
      console.log('📧 Customer notification sent');
    } catch (emailError) {
      console.error('Failed to send customer notification:', emailError);
    }

    res.json({
      success: true,
      message: 'Ticket status updated successfully',
      data: {
        ticket: {
          _id: ticket._id,
          ticketId: ticket.ticketId,
          status: ticket.status,
          updatedAt: ticket.updatedAt,
          messages: ticket.messages,
          adminNotes: ticket.adminNotes
        }
      }
    });

  } catch (error) {
    console.error('❌ Error updating ticket status:', error);
    console.error('❌ Error stack:', error.stack);
    next(error);
  }
});
// @route   POST /api/support/admin/tickets/:ticketId/reply
// @desc    Reply to a support ticket (Admin only)
// @access  Private (Admin)
router.post('/admin/tickets/:ticketId/reply', auth, authorize('admin'), [
  param('ticketId').notEmpty().withMessage('Ticket ID is required'),
  body('message')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Message must be between 1 and 2000 characters'),
  body('isInternal')
    .optional()
    .isBoolean()
    .withMessage('isInternal must be a boolean')
], async (req, res, next) => {
  try {
    console.log('💬 Admin replying to ticket:', req.params.ticketId);
    console.log('👤 Admin:', req.user.name, req.user._id);
    console.log('📝 Message:', req.body.message);
    console.log('🔒 Internal:', req.body.isInternal);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { ticketId } = req.params;
    const { message, isInternal = false } = req.body;

    // Find ticket by either ticketId (string) or _id (ObjectId)
    let query = {};
    
    if (isValidObjectId(ticketId)) {
      query.$or = [
        { ticketId: ticketId },
        { _id: new mongoose.Types.ObjectId(ticketId) }
      ];
    } else {
      query.ticketId = ticketId;
    }

    console.log('🔍 Looking for ticket with query:', query);

    const ticket = await Ticket.findOne(query).populate('user', 'name email');

    if (!ticket) {
      console.log('❌ Ticket not found');
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    console.log('✅ Ticket found:', ticket.ticketId, 'Status:', ticket.status);

    if (ticket.status === 'closed') {
      console.log('❌ Ticket is closed');
      return res.status(400).json({
        success: false,
        message: 'Cannot reply to a closed ticket'
      });
    }

    // Add message to ticket
    console.log('📨 Adding admin message to ticket...');
    await ticket.addMessage(req.user._id, 'admin', message, [], isInternal);

    // Auto-assign ticket if not assigned
    if (!ticket.handledBy) {
      console.log('👤 Auto-assigning ticket to current admin');
      ticket.handledBy = req.user._id;
    }

    // Update status to in-progress if currently open
    if (ticket.status === 'open') {
      console.log('🔄 Updating ticket status to in-progress');
      await ticket.updateStatus('in-progress', req.user._id);
    }

    await ticket.save();

    console.log(`✅ Admin reply added to ticket ${ticket.ticketId}`);

    // Send customer notification only for non-internal messages
    if (!isInternal) {
      try {
        await sendCustomerNotification(ticket, 'admin_reply');
        console.log('📧 Customer notification sent');
      } catch (emailError) {
        console.error('Failed to send customer notification:', emailError);
      }
    }

    res.json({
      success: true,
      message: 'Reply added successfully',
      data: {
        ticket: {
          ticketId: ticket.ticketId,
          status: ticket.status,
          handledBy: ticket.handledBy,
          lastActivityAt: ticket.lastActivityAt
        }
      }
    });

  } catch (error) {
    console.error('❌ Error adding admin reply to ticket:', error);
    next(error);
  }
});

// @route   POST /api/support/admin/tickets/:ticketId/notes
// @desc    Add internal notes to a ticket (Admin only)
// @access  Private (Admin)
router.post('/admin/tickets/:ticketId/notes', auth, authorize('admin'), [
  param('ticketId').notEmpty().withMessage('Ticket ID is required'),
  body('note')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Note must be between 1 and 1000 characters')
], async (req, res, next) => {
  try {
    console.log('📝 Admin adding note to ticket:', req.params.ticketId);
    console.log('👤 Admin:', req.user.name, req.user._id);
    console.log('📝 Note:', req.body.note);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { ticketId } = req.params;
    const { note } = req.body;

    // Find ticket by either ticketId (string) or _id (ObjectId)
    let query = {};
    
    if (isValidObjectId(ticketId)) {
      query.$or = [
        { ticketId: ticketId },
        { _id: new mongoose.Types.ObjectId(ticketId) }
      ];
    } else {
      query.ticketId = ticketId;
    }

    console.log('🔍 Looking for ticket with query:', query);

    const ticket = await Ticket.findOne(query);

    if (!ticket) {
      console.log('❌ Ticket not found');
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    console.log('✅ Ticket found:', ticket.ticketId);

    // Add internal note using the safe method
    await ticket.addAdminNote(req.user._id, note);

    console.log(`📝 Admin note added to ticket ${ticket.ticketId}`);

    res.json({
      success: true,
      message: 'Internal note added successfully',
      data: {
        ticket: {
          ticketId: ticket.ticketId,
          adminNotes: ticket.adminNotes
        }
      }
    });

  } catch (error) {
    console.error('❌ Error adding admin note:', error);
    next(error);
  }
});

// @route   GET /api/support/admin/analytics
// @desc    Get support analytics (Admin only)
// @access  Private (Admin)
router.get('/admin/analytics', auth, authorize('admin'), [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be in ISO format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be in ISO format')
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

    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();

    console.log('📊 Generating analytics from', startDate, 'to', endDate);

    const dateFilter = {
      createdAt: { $gte: startDate, $lte: endDate }
    };

    const [
      totalTickets,
      ticketsByStatus,
      ticketsByCategory,
      ticketsByPriority,
      avgResolutionTime,
      satisfactionRatings
    ] = await Promise.all([
      // Total tickets count
      Ticket.countDocuments(dateFilter),
      
      // Tickets by status
      Ticket.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      
      // Tickets by category
      Ticket.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]),
      
      // Tickets by priority
      Ticket.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$priority', count: { $sum: 1 } } }
      ]),
      
      // Average resolution time
      Ticket.aggregate([
        { 
          $match: { 
            ...dateFilter,
            status: { $in: ['resolved', 'closed'] },
            resolvedAt: { $exists: true }
          }
        },
        {
          $addFields: {
            resolutionTimeHours: {
              $divide: [
                { $subtract: ['$resolvedAt', '$createdAt'] },
                1000 * 60 * 60
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            avgResolutionTime: { $avg: '$resolutionTimeHours' },
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Customer satisfaction ratings
      Ticket.aggregate([
        { 
          $match: { 
            ...dateFilter,
            'rating.rating': { $exists: true }
          }
        },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating.rating' },
            totalRatings: { $sum: 1 },
            ratings: { $push: '$rating.rating' }
          }
        }
      ])
    ]);

    // Calculate additional metrics
    const openTickets = ticketsByStatus.find(s => s._id === 'open')?.count || 0;
    const resolvedTickets = ticketsByStatus.find(s => s._id === 'resolved')?.count || 0;
    const closedTickets = ticketsByStatus.find(s => s._id === 'closed')?.count || 0;
    
    const resolutionRate = totalTickets > 0 ? 
      ((resolvedTickets + closedTickets) / totalTickets * 100).toFixed(1) : 0;

    console.log('✅ Analytics generated successfully');

    res.json({
      success: true,
      data: {
        analytics: {
          overview: {
            totalTickets,
            openTickets,
            resolvedTickets,
            closedTickets,
            resolutionRate: parseFloat(resolutionRate)
          },
          byStatus: ticketsByStatus,
          byCategory: ticketsByCategory,
          byPriority: ticketsByPriority,
          performance: {
            avgResolutionTimeHours: avgResolutionTime[0]?.avgResolutionTime || 0,
            resolvedTicketsCount: avgResolutionTime[0]?.count || 0
          },
          satisfaction: {
            avgRating: satisfactionRatings[0]?.avgRating || 0,
            totalRatings: satisfactionRatings[0]?.totalRatings || 0,
            ratings: satisfactionRatings[0]?.ratings || []
          },
          dateRange: {
            startDate,
            endDate
          }
        }
      }
    });

  } catch (error) {
    console.error('❌ Error generating analytics:', error);
    next(error);
  }
});

module.exports = router;