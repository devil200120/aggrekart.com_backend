const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderType: {
    type: String,
    enum: ['customer', 'admin'],
    required: true
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  attachments: [{
    filename: String,
    url: String,
    fileType: String,
    size: Number
  }],
  isInternal: {
    type: Boolean,
    default: false
  }
}, {
  _id: true,
  timestamps: false
});

const adminNoteSchema = new mongoose.Schema({
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  note: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  _id: true,
  timestamps: false
});

const ticketSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  subject: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  category: {
    type: String,
    required: true,
    enum: [
      'order_inquiry',
      'payment_issue', 
      'product_inquiry',
      'delivery_issue',
      'account_issue',
      'technical_support',
      'billing_inquiry',
      'complaint',
      'feature_request',
      'other'
    ],
    index: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true
  },
  status: {
    type: String,
    enum: ['open', 'in-progress', 'resolved', 'closed'],
    default: 'open',
    index: true
  },
  handledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  relatedOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  // Replace the duplicate relatedOrder field (around lines 115-125) and add enhanced fields:

  handledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  relatedOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  // 🆕 ADD THESE NEW FIELDS:
  relatedSupplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    default: null
  },
  customerContactInfo: {
    phone: {
      type: String,
      default: null
    },
    email: {
      type: String,
      default: null
    },
    preferredContactMethod: {
      type: String,
      enum: ['email', 'phone', 'both'],
      default: 'email'
    }
  },
  orderDetails: {
    orderId: String,
    orderAmount: Number,
    orderStatus: String,
    supplierName: String,
    supplierContact: String
  },
  // Keep existing fields below...
  messages: {
    type: [messageSchema],
    default: []
  },
  adminNotes: {
    type: [adminNoteSchema],
    default: []
  },
  rating: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 500
    },
    ratedAt: {
      type: Date
    }
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  closedAt: {
    type: Date,
    default: null
  },
  lastActivityAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
ticketSchema.index({ user: 1, status: 1 });
ticketSchema.index({ status: 1, priority: 1 });
ticketSchema.index({ createdAt: -1 });
ticketSchema.index({ lastActivityAt: -1 });
ticketSchema.index({ 'messages.timestamp': -1 });

// Virtual for message count
ticketSchema.virtual('messageCount').get(function() {
  return this.messages ? this.messages.length : 0;
});

// Virtual for response time (in hours)
ticketSchema.virtual('responseTimeHours').get(function() {
  if (this.resolvedAt) {
    return Math.round((this.resolvedAt - this.createdAt) / (1000 * 60 * 60));
  }
  return null;
});

// Virtual for age in days
ticketSchema.virtual('ageDays').get(function() {
  return Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Helper function to ensure ObjectId
const ensureObjectId = (id) => {
  if (!id) return null;
  if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
    return new mongoose.Types.ObjectId(id);
  }
  if (id instanceof mongoose.Types.ObjectId) {
    return id;
  }
  return id;
};

// Pre-save middleware to ensure arrays are properly initialized
ticketSchema.pre('save', function(next) {
  // Ensure messages is always an array
  if (!Array.isArray(this.messages)) {
    this.messages = [];
  }
  
  // Ensure adminNotes is always an array
  if (!Array.isArray(this.adminNotes)) {
    this.adminNotes = [];
  }
  
  // Update lastActivityAt on any change (except when explicitly updating lastActivityAt)
  if (this.isModified() && !this.isModified('lastActivityAt')) {
    this.lastActivityAt = new Date();
  }
  
  next();
});

// FIXED: Instance methods that DON'T automatically save
ticketSchema.methods.addMessage = function(senderId, senderType, message, attachments = [], isInternal = false) {
  // Ensure senderId is a proper ObjectId
  const properSenderId = ensureObjectId(senderId);
  
  // Ensure messages array exists
  if (!Array.isArray(this.messages)) {
    this.messages = [];
  }
  
  this.messages.push({
    sender: properSenderId,
    senderType,
    message,
    attachments,
    isInternal,
    timestamp: new Date()
  });
  
  this.lastActivityAt = new Date();
  // DON'T auto-save, let the caller handle saving
};

ticketSchema.methods.updateStatus = function(newStatus, updatedBy) {
  const oldStatus = this.status;
  this.status = newStatus;
  
  if (newStatus === 'resolved') {
    this.resolvedAt = new Date();
  } else if (newStatus === 'closed') {
    this.closedAt = new Date();
  }
  
  // Ensure updatedBy is a proper ObjectId
  const properUpdatedBy = ensureObjectId(updatedBy);
  
  // Ensure messages array exists
  if (!Array.isArray(this.messages)) {
    this.messages = [];
  }
  
  // Add status change message
  this.messages.push({
    sender: properUpdatedBy,
    senderType: 'admin',
    message: `Ticket status changed from ${oldStatus} to ${newStatus}`,
    timestamp: new Date(),
    isInternal: true
  });
  
  // DON'T auto-save, let the caller handle saving
};

ticketSchema.methods.assignToAdmin = function(adminId, assignedBy) {
  // Ensure adminId and assignedBy are proper ObjectIds
  const properAdminId = ensureObjectId(adminId);
  const properAssignedBy = ensureObjectId(assignedBy);
  
  this.handledBy = properAdminId;
  
  // Ensure messages array exists
  if (!Array.isArray(this.messages)) {
    this.messages = [];
  }
  
  // Add assignment message
  this.messages.push({
    sender: properAssignedBy,
    senderType: 'admin',
    message: `Ticket assigned to admin`,
    timestamp: new Date(),
    isInternal: true
  });
  
  // DON'T auto-save, let the caller handle saving
};

ticketSchema.methods.addAdminNote = function(adminId, note) {
  // Ensure adminId is a proper ObjectId
  const properAdminId = ensureObjectId(adminId);
  
  // Ensure adminNotes array exists
  if (!Array.isArray(this.adminNotes)) {
    this.adminNotes = [];
  }
  
  this.adminNotes.push({
    admin: properAdminId,
    note,
    timestamp: new Date()
  });
  
  // DON'T auto-save, let the caller handle saving
};

// Static methods
ticketSchema.statics.getTicketStats = async function() {
  try {
    const stats = await this.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const result = {
      total: 0,
      open: 0,
      'in-progress': 0,
      resolved: 0,
      closed: 0
    };
    
    stats.forEach(stat => {
      result[stat._id] = stat.count;
      result.total += stat.count;
    });
    
    return result;
  } catch (error) {
    console.error('Error getting ticket stats:', error);
    throw error;
  }
};

ticketSchema.statics.getAvgResolutionTime = async function(days = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const result = await this.aggregate([
      {
        $match: {
          status: { $in: ['resolved', 'closed'] },
          resolvedAt: { $exists: true },
          createdAt: { $gte: startDate }
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
    ]);
    
    return result[0] || { avgResolutionTime: 0, count: 0 };
  } catch (error) {
    console.error('Error getting average resolution time:', error);
    throw error;
  }
};

ticketSchema.statics.getCustomerSatisfactionStats = async function(days = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const result = await this.aggregate([
      {
        $match: {
          'rating.rating': { $exists: true },
          'rating.ratedAt': { $gte: startDate }
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
    ]);
    
    return result[0] || { avgRating: 0, totalRatings: 0, ratings: [] };
  } catch (error) {
    console.error('Error getting satisfaction stats:', error);
    throw error;
  }
};

// Post-save middleware for logging
ticketSchema.post('save', function(doc, next) {
  console.log(`📝 Ticket ${doc.ticketId} saved with status: ${doc.status}`);
  next();
});

const Ticket = mongoose.model('Ticket', ticketSchema);

module.exports = Ticket;