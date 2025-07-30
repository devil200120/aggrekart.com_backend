const nodemailer = require('nodemailer');
const twilio = require('twilio');

// Initialize Twilio client safely
const twilioClient = process.env.TWILIO_ACCOUNT_SID && 
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_ACCOUNT_SID.startsWith('AC') &&
    process.env.TWILIO_ACCOUNT_SID !== 'your_twilio_account_sid'
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

// Initialize email transporter - FIXED: createTransport (not createTransporter)
const emailTransporter = process.env.SMTP_EMAIL && 
    process.env.SMTP_EMAIL !== 'your_gmail@gmail.com'
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
    })
  : null;

// Enhanced notification system
class NotificationService {
  
  // Send SMS with retry logic
  // Replace the sendSMS function (around lines 30-55):

  // Send SMS with retry logic and message validation
  static async sendSMS(phoneNumber, message, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (!twilioClient) {
          console.log(`📱 SMS Service not configured. Would send to ${phoneNumber}: ${message}`);
          return { success: true, mock: true };
        }

        // CRITICAL: Validate message content before sending
        if (!message || message.trim().length === 0) {
          console.error('🚨 EMPTY SMS MESSAGE DETECTED - This causes Error 30044');
          console.error('Message value:', JSON.stringify(message));
          throw new Error('Message body is required and cannot be empty');
        }

        // Additional validation for undefined/null values
        if (message === 'undefined' || message === 'null' || message.includes('undefined') || message.includes('null')) {
          console.error('🚨 SMS MESSAGE CONTAINS UNDEFINED/NULL VALUES');
          console.error('Original message:', JSON.stringify(message));
          // Clean the message
          message = message.replace(/undefined/g, '').replace(/null/g, '').replace(/\s+/g, ' ').trim();
          if (message.length < 10) {
            throw new Error('Message became too short after cleaning undefined/null values');
          }
        }

        console.log(`📱 Sending SMS to ${phoneNumber} (attempt ${attempt})`);
        console.log(`📱 Message length: ${message.length} characters`);
        console.log(`📱 Message preview: ${message.substring(0, 50)}...`);

        const result = await twilioClient.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: `+91${phoneNumber}`
        });

        console.log(`📱 SMS sent successfully (attempt ${attempt}):`, result.sid);
        return { success: true, sid: result.sid, attempt };
        
      } catch (error) {
        console.error(`❌ SMS sending failed (attempt ${attempt}):`, {
          error: error.message,
          code: error.code,
          phoneNumber: phoneNumber,
          messageLength: message?.length || 0
        });
        
        if (error.code === 30044) {
          console.error('🚨 Error 30044: Message body is required');
          console.error('🔍 Debug - Message value:', JSON.stringify(message));
          console.error('🔍 Debug - Message type:', typeof message);
          console.error('🔍 Debug - Message length:', message?.length);
        }
        
        if (attempt === retries) {
          console.log(`📱 SMS (Fallback Log) to ${phoneNumber}: ${message}`);
          return { success: false, error: error.message, fallback: true };
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  // Send email with templates
  static async sendEmail(email, subject, content, template = null) {
    try {
      if (!emailTransporter || !process.env.SMTP_EMAIL) {
        console.log(`📧 Email Service not configured. Would send to ${email}: ${subject}`);
        return { success: true, mock: true };
      }

      let htmlContent = content;
      
      if (template) {
        htmlContent = this.getEmailTemplate(template, { subject, content });
      } else {
        htmlContent = this.getDefaultTemplate(subject, content);
      }

      const mailOptions = {
        from: `"Aggrekart" <${process.env.SMTP_EMAIL}>`,
        to: email,
        subject: subject,
        text: content,
        html: htmlContent
      };

      const result = await emailTransporter.sendMail(mailOptions);
      console.log('📧 Email sent successfully:', result.messageId);
      return { success: true, messageId: result.messageId };
      
    } catch (error) {
      console.error('❌ Email sending failed:', error);
      console.log(`📧 Email (Fallback Log) to ${email}: ${subject}`);
      return { success: false, error: error.message, fallback: true };
    }
  }

  // Get email template
  static getEmailTemplate(templateName, data) {
    const templates = {
      order_confirmation: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #366EF5; color: white; padding: 20px; text-align: center;">
            <h1>Order Confirmed!</h1>
          </div>
          <div style="padding: 20px; background-color: #f8f9fa;">
            <h2>Thank you for your order</h2>
            <p>${data.content}</p>
            <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3>Order Details:</h3>
              <p><strong>Order ID:</strong> ${data.orderId}</p>
              <p><strong>Total Amount:</strong> ₹${data.totalAmount}</p>
              <p><strong>Estimated Delivery:</strong> ${data.deliveryTime}</p>
            </div>
            <p style="color: #666; font-size: 12px;">
              Track your order in the Aggrekart app or website.
            </p>
          </div>
        </div>
      `,
      
      supplier_approval: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #28a745; color: white; padding: 20px; text-align: center;">
            <h1>Account Approved!</h1>
          </div>
          <div style="padding: 20px;">
            <h2>Welcome to Aggrekart</h2>
            <p>${data.content}</p>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3>Next Steps:</h3>
              <ul>
                <li>Complete your profile setup</li>
                <li>Add your products</li>
                <li>Configure transport rates</li>
                <li>Start receiving orders</li>
              </ul>
            </div>
          </div>
        </div>
      `,

      welcome: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #366EF5; color: white; padding: 20px; text-align: center;">
            <h1>Welcome to Aggrekart! 🏗️</h1>
          </div>
          <div style="padding: 20px; background-color: #f8f9fa;">
            <h2>Your Construction Materials Partner</h2>
            <p>${data.content}</p>
            <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3>What's Next:</h3>
              <ul>
                <li>✅ Browse construction materials</li>
                <li>✅ Place orders from verified suppliers</li>
                <li>✅ Track your orders in real-time</li>
                <li>✅ Earn Aggre Coins on every purchase</li>
              </ul>
            </div>
          </div>
        </div>
      `
    };

    return templates[templateName] || this.getDefaultTemplate(data.subject, data.content);
  }

  // Default email template
  static getDefaultTemplate(subject, content) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #366EF5; color: white; padding: 20px; text-align: center;">
          <h1>Aggrekart</h1>
        </div>
        <div style="padding: 20px; background-color: #f8f9fa;">
          <h2>${subject}</h2>
          <div style="background-color: white; padding: 20px; border-radius: 5px;">
            ${content.replace(/\n/g, '<br>')}
          </div>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
          <p style="font-size: 12px; color: #666;">
            This is an automated email from Aggrekart. Please do not reply to this email.
          </p>
        </div>
      </div>
    `;
  }

  // Bulk notification sender
  static async sendBulkNotifications(notifications) {
    const results = {
      sent: 0,
      failed: 0,
      errors: []
    };

    for (const notification of notifications) {
      try {
        if (notification.type === 'sms') {
          await this.sendSMS(notification.recipient, notification.message);
        } else if (notification.type === 'email') {
          await this.sendEmail(
            notification.recipient, 
            notification.subject, 
            notification.message,
            notification.template
          );
        }
        results.sent++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          recipient: notification.recipient,
          error: error.message
        });
      }
    }

    return results;
  }

  // Send order status notifications
  static async sendOrderStatusNotification(order, status) {
    try {
      const customer = order.customer;
      const supplier = order.supplier;

      const statusMessages = {
        confirmed: {
          customer: `Order confirmed! Order ID: ${order.orderId}. We'll notify you when it's ready for dispatch.`,
          supplier: `New order received! Order ID: ${order.orderId}. Please prepare the items.`
        },
        preparing: {
          customer: `Your order ${order.orderId} is being prepared. Expected dispatch soon.`,
          supplier: `Order ${order.orderId} preparation started.`
        },
        processing: {
          customer: `Order ${order.orderId} is being processed for dispatch.`,
          supplier: `Order ${order.orderId} is ready for dispatch.`
        },
        dispatched: {
          customer: `Order ${order.orderId} has been dispatched! Delivery OTP: ${order.delivery.deliveryOTP}`,
          supplier: `Order ${order.orderId} dispatched successfully.`
        },
        delivered: {
          customer: `Order ${order.orderId} delivered successfully! Thank you for choosing Aggrekart.`,
          supplier: `Order ${order.orderId} delivered and completed.`
        },
        cancelled: {
          customer: `Order ${order.orderId} has been cancelled. Refund will be processed within 3-5 business days.`,
          supplier: `Order ${order.orderId} was cancelled by customer.`
        }
      };

      const messages = statusMessages[status];
      if (!messages) return;

      // Send to customer
      if (customer.phoneNumber) {
        await this.sendSMS(customer.phoneNumber, messages.customer);
      }

      // Send to supplier
      if (supplier.contactPersonNumber) {
        await this.sendSMS(supplier.contactPersonNumber, messages.supplier);
      }

      return { success: true };
    } catch (error) {
      console.error('Order notification failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Send promotional notifications
  static async sendPromotionalNotification(users, promotion) {
    try {
      const notifications = users.map(user => ({
        type: user.preferences?.notifications?.sms ? 'sms' : 'email',
        recipient: user.preferences?.notifications?.sms ? user.phoneNumber : user.email,
        subject: promotion.subject,
        message: promotion.message,
        template: 'promotional'
      }));

      return await this.sendBulkNotifications(notifications);
    } catch (error) {
      console.error('Promotional notification failed:', error);
      throw error;
    }
  }
}

// Legacy functions for backward compatibility
const sendSMS = NotificationService.sendSMS.bind(NotificationService);
const sendEmail = NotificationService.sendEmail.bind(NotificationService);

// New enhanced functions
const sendWelcomeEmail = async (user) => {
  const subject = 'Welcome to Aggrekart!';
  const content = `
    Dear ${user.name},

    Welcome to Aggrekart - Your trusted platform for construction materials!

    Your account has been created successfully:
    - Customer ID: ${user.customerId}
    - Membership Tier: ${user.membershipTier.toUpperCase()}
    - Aggre Coins: ${user.aggreCoins}

    You can now:
    ✓ Browse construction materials
    ✓ Place orders from verified suppliers
    ✓ Track your orders in real-time
    ✓ Earn Aggre Coins on every purchase

    Download our app or visit our website to start shopping!

    Happy Building!
    Team Aggrekart
  `;

  return await NotificationService.sendEmail(user.email, subject, content, 'welcome');
};

const sendOrderNotification = async (user, order, type) => {
  const orderData = {
    orderId: order.orderId,
    totalAmount: order.pricing.totalAmount,
    deliveryTime: order.delivery.estimatedTime || 'TBD',
    subject: `Order ${type.charAt(0).toUpperCase() + type.slice(1)} - Aggrekart`,
    content: `Your order ${order.orderId} has been ${type}.`
  };

  return await NotificationService.sendEmail(
    user.email, 
    orderData.subject, 
    orderData.content, 
    'order_confirmation'
  );
};
// Enhanced Order Placement Notification
const sendOrderPlacementNotification = async (customer, order) => {
  try {
    console.log(`📬 Sending order placement notifications for Order ID: ${order.orderId}`);
    
    const notifications = [];
    
    // Prepare customer data
    const customerName = customer.name || 'Valued Customer';
    const orderId = order.orderId;
    const totalAmount = order.pricing.totalAmount;
    const itemCount = order.items.length;
    const estimatedDelivery = order.delivery.estimatedTime || '2-3 business days';
    const paymentMethod = order.payment.method.toUpperCase();
    const advanceAmount = order.payment.advanceAmount;
    const balanceAmount = order.payment.remainingAmount;
    
    // Generate item summary
    const itemSummary = order.items.slice(0, 3).map(item => 
      `${item.productSnapshot.name} (Qty: ${item.quantity})`
    ).join(', ');
    const moreItems = order.items.length > 3 ? ` and ${order.items.length - 3} more items` : '';
    
    // 1. SMS Notification
    // Replace the SMS message generation (around lines 364-378) with this fixed version:

    // 1. SMS Notification
    // Replace the SMS generation section completely (around lines 364-380):

    // 1. SMS Notification with Error 30044 fix
    if (customer.phoneNumber) {
      try {
        // Safely extract variables with comprehensive fallbacks
        const safeOrderId = orderId || order?.orderId || 'N/A';
        const safeItemSummary = itemSummary || 'Construction materials';
        const safeTotalAmount = totalAmount || order?.pricing?.totalAmount || 0;
        const safePaymentMethod = paymentMethod || order?.payment?.method?.toUpperCase() || 'COD';
        const safeEstimatedDelivery = estimatedDelivery || order?.delivery?.estimatedTime || '2-3 business days';
        const safeAdvanceAmount = advanceAmount || order?.payment?.advanceAmount || 0;
        const safeBalanceAmount = balanceAmount || order?.payment?.remainingAmount || 0;
        
        // Build SMS message step by step with validation
        let smsMessage = `🏗️ Order Confirmed!\n\n`;
        smsMessage += `Order ID: ${safeOrderId}\n`;
        smsMessage += `Items: ${safeItemSummary}${moreItems || ''}\n`;
        smsMessage += `Total: ₹${safeTotalAmount.toLocaleString('en-IN')}\n`;
        smsMessage += `Payment: ${safePaymentMethod}`;
        
        if (safeBalanceAmount > 0) {
          smsMessage += ` (Advance: ₹${safeAdvanceAmount.toLocaleString('en-IN')})`;
        }
        
        smsMessage += `\nDelivery: ${safeEstimatedDelivery}\n\n`;
        smsMessage += `Track: aggrekart.com/orders/${safeOrderId}\n\n`;
        smsMessage += `Thank you for choosing Aggrekart! 🙏`;

        // CRITICAL: Validate message is not empty or null
        if (!smsMessage || smsMessage.trim().length === 0 || smsMessage === 'undefined' || smsMessage === 'null') {
          console.error('🚨 SMS message is empty/null, using emergency fallback');
          smsMessage = `Order ${safeOrderId} confirmed! Total: ₹${safeTotalAmount.toLocaleString('en-IN')}. Track at aggrekart.com`;
        }

        // Additional validation
        if (smsMessage.includes('undefined') || smsMessage.includes('null')) {
          console.error('🚨 SMS message contains undefined/null values, cleaning up');
          smsMessage = smsMessage.replace(/undefined/g, '').replace(/null/g, '').replace(/\s+/g, ' ').trim();
        }

        // Final check
        if (smsMessage.length < 10) {
          smsMessage = `Order confirmed! ID: ${safeOrderId}. Total: ₹${safeTotalAmount}. Thanks for choosing Aggrekart!`;
        }

        console.log('📱 Generated SMS message length:', smsMessage.length);
        console.log('📱 SMS preview:', smsMessage.substring(0, 100) + '...');

        notifications.push({
          type: 'sms',
          recipient: customer.phoneNumber,
          message: smsMessage
        });
        
      } catch (smsError) {
        console.error('🚨 Error generating SMS message:', smsError);
        // Emergency fallback SMS
        const fallbackMessage = `Order confirmed! ID: ${orderId || 'N/A'}. Thanks for choosing Aggrekart!`;
        notifications.push({
          type: 'sms',
          recipient: customer.phoneNumber,
          message: fallbackMessage
        });
      }
    }
    
    // 2. Email Notification
    if (customer.email) {
      const emailSubject = `Order Confirmed - ${orderId} | Aggrekart`;
      
      const emailContent = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; background: #f8f9fa;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #007bff 0%, #0056b3 100%); color: white; padding: 30px 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px; font-weight: 700;">🏗️ Aggrekart</h1>
            <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.9;">Your Construction Materials Partner</p>
          </div>
          
          <!-- Success Banner -->
          <div style="background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 20px; text-align: center;">
            <h2 style="margin: 0; font-size: 24px; color: #155724;">✅ Order Confirmed Successfully!</h2>
            <p style="margin: 10px 0 0 0; font-size: 16px;">Thank you ${customerName}, your order has been placed and confirmed.</p>
          </div>
          
          <!-- Order Details -->
          <div style="background: white; padding: 30px 25px; margin: 0;">
            <h3 style="color: #333; margin-top: 0; font-size: 20px; border-bottom: 2px solid #007bff; padding-bottom: 10px;">📋 Order Details</h3>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: 600; color: #555;">Order ID:</td>
                  <td style="padding: 8px 0; color: #007bff; font-weight: 700; font-family: monospace;">${orderId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: 600; color: #555;">Order Date:</td>
                  <td style="padding: 8px 0;">${new Date().toLocaleDateString('en-IN', { 
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric' 
                  })}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: 600; color: #555;">Total Amount:</td>
                  <td style="padding: 8px 0; font-size: 18px; font-weight: 700; color: #28a745;">₹${totalAmount.toLocaleString('en-IN')}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: 600; color: #555;">Payment Method:</td>
                  <td style="padding: 8px 0;">${paymentMethod}</td>
                </tr>
                ${balanceAmount > 0 ? `
                <tr>
                  <td style="padding: 8px 0; font-weight: 600; color: #555;">Advance Paid:</td>
                  <td style="padding: 8px 0; color: #28a745;">₹${advanceAmount.toLocaleString('en-IN')}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: 600; color: #555;">Balance Amount:</td>
                  <td style="padding: 8px 0; color: #dc3545;">₹${balanceAmount.toLocaleString('en-IN')}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 8px 0; font-weight: 600; color: #555;">Estimated Delivery:</td>
                  <td style="padding: 8px 0;">${estimatedDelivery}</td>
                </tr>
              </table>
            </div>
            
            <!-- Items Summary -->
            <h4 style="color: #333; margin: 25px 0 15px 0;">📦 Items Ordered (${itemCount} item${itemCount > 1 ? 's' : ''})</h4>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #007bff;">
              ${order.items.map(item => `
                <div style="padding: 8px 0; border-bottom: 1px solid #e9ecef; last-child: border-bottom: none;">
                  <strong>${item.productSnapshot.name}</strong><br>
                  <span style="color: #666; font-size: 14px;">
                    Quantity: ${item.quantity} ${item.productSnapshot.unit || 'units'} | 
                    Rate: ₹${item.unitPrice.toLocaleString('en-IN')} | 
                    Total: ₹${item.totalPrice.toLocaleString('en-IN')}
                  </span>
                </div>
              `).join('')}
            </div>
          </div>
          
          <!-- Action Buttons -->
          <div style="background: white; padding: 20px 25px; text-align: center;">
            <a href="https://aggrekart.com/orders/${orderId}" 
               style="display: inline-block; background: #007bff; color: white; padding: 12px 25px; 
                      text-decoration: none; border-radius: 6px; font-weight: 600; margin: 0 10px;">
              🔍 Track Order
            </a>
            <a href="https://aggrekart.com/orders" 
               style="display: inline-block; background: #28a745; color: white; padding: 12px 25px; 
                      text-decoration: none; border-radius: 6px; font-weight: 600; margin: 0 10px;">
              📋 View All Orders
            </a>
          </div>
          
          <!-- Important Info -->
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px 25px;">
            <h4 style="color: #856404; margin-top: 0;">⚠️ Important Information</h4>
            <ul style="color: #856404; margin: 10px 0; padding-left: 20px;">
              <li>You can modify or cancel this order within the cooling period (next few hours)</li>
              <li>You'll receive SMS updates as your order progresses</li>
              <li>Keep your delivery OTP ready for final delivery</li>
              <li>For support, contact us at support@aggrekart.com or call +91-XXXXXXXXXX</li>
            </ul>
          </div>
          
          <!-- Footer -->
          <div style="background: #343a40; color: white; padding: 25px; text-align: center;">
            <h3 style="margin: 0 0 10px 0; color: #007bff;">Thank You for Choosing Aggrekart!</h3>
            <p style="margin: 0; opacity: 0.8;">Your trusted partner for quality construction materials</p>
            <div style="margin: 15px 0; font-size: 14px; opacity: 0.7;">
              <p>Download our app: 
                <a href="#" style="color: #007bff;">Android</a> | 
                <a href="#" style="color: #007bff;">iOS</a>
              </p>
              <p>Follow us: 
                <a href="#" style="color: #007bff;">Facebook</a> | 
                <a href="#" style="color: #007bff;">Instagram</a> | 
                <a href="#" style="color: #007bff;">LinkedIn</a>
              </p>
            </div>
          </div>
        </div>
      `;

      notifications.push({
        type: 'email',
        recipient: customer.email,
        subject: emailSubject,
        message: emailContent,
        template: 'order_placement'
      });
    }
    
    // Send all notifications
    const results = await NotificationService.sendBulkNotifications(notifications);
    
    console.log(`📬 Order placement notifications sent:`, {
      orderId,
      sent: results.sent,
      failed: results.failed,
      customer: customerName
    });
    
    return {
      success: true,
      notificationsSent: results.sent,
      notificationsFailed: results.failed,
      details: results
    };
    
  } catch (error) {
    console.error('❌ Failed to send order placement notifications:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Enhanced Supplier Notification
const sendSupplierOrderNotification = async (supplier, order) => {
  try {
    console.log(`📬 Sending supplier notification for Order ID: ${order.orderId}`);
    
    const notifications = [];
    const supplierName = supplier.contactPersonName || supplier.companyName || 'Supplier';
    
    // SMS to supplier
    if (supplier.contactPersonNumber) {
      const smsMessage = `🔔 New Order Received!

Order ID: ${order.orderId}
Customer: ${order.customer.name}
Items: ${order.items.length} item${order.items.length > 1 ? 's' : ''}
Value: ₹${order.pricing.totalAmount.toLocaleString('en-IN')}

Login to your dashboard to view details and confirm the order.

Aggrekart Supplier Panel`;

      notifications.push({
        type: 'sms',
        recipient: supplier.contactPersonNumber,
        message: smsMessage
      });
    }
    
    // Email to supplier
    if (supplier.email) {
      const emailSubject = `New Order Received - ${order.orderId} | Aggrekart Supplier`;
      
      const emailContent = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; background: #f8f9fa;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px; font-weight: 700;">🏗️ Aggrekart Supplier</h1>
            <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.9;">New Order Alert</p>
          </div>
          
          <!-- Alert Banner -->
          <div style="background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; padding: 20px; text-align: center;">
            <h2 style="margin: 0; font-size: 24px; color: #0c5460;">🔔 New Order Received!</h2>
            <p style="margin: 10px 0 0 0; font-size: 16px;">You have received a new order. Please review and confirm.</p>
          </div>
          
          <!-- Order Details -->
          <div style="background: white; padding: 30px 25px;">
            <h3 style="color: #333; margin-top: 0; font-size: 20px; border-bottom: 2px solid #28a745; padding-bottom: 10px;">📋 Order Details</h3>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: 600; color: #555;">Order ID:</td>
                  <td style="padding: 8px 0; color: #28a745; font-weight: 700; font-family: monospace;">${order.orderId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: 600; color: #555;">Customer:</td>
                  <td style="padding: 8px 0;">${order.customer.name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: 600; color: #555;">Customer Phone:</td>
                  <td style="padding: 8px 0;">+91 ${order.customer.phoneNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: 600; color: #555;">Order Value:</td>
                  <td style="padding: 8px 0; font-size: 18px; font-weight: 700; color: #28a745;">₹${order.pricing.totalAmount.toLocaleString('en-IN')}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: 600; color: #555;">Payment Method:</td>
                  <td style="padding: 8px 0;">${order.payment.method.toUpperCase()}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: 600; color: #555;">Order Date:</td>
                  <td style="padding: 8px 0;">${new Date().toLocaleDateString('en-IN')}</td>
                </tr>
              </table>
            </div>
            
            <!-- Items -->
            <h4 style="color: #333; margin: 25px 0 15px 0;">📦 Items Ordered</h4>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #28a745;">
              ${order.items.map(item => `
                <div style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                  <strong>${item.productSnapshot.name}</strong><br>
                  <span style="color: #666; font-size: 14px;">
                    Quantity: ${item.quantity} ${item.productSnapshot.unit || 'units'} | 
                    Rate: ₹${item.unitPrice.toLocaleString('en-IN')} | 
                    Total: ₹${item.totalPrice.toLocaleString('en-IN')}
                  </span>
                </div>
              `).join('')}
            </div>
            
            <!-- Delivery Address -->
            <h4 style="color: #333; margin: 25px 0 15px 0;">📍 Delivery Address</h4>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px;">
              <p style="margin: 0; line-height: 1.6;">
                ${order.deliveryAddress.address}<br>
                ${order.deliveryAddress.city}, ${order.deliveryAddress.state} - ${order.deliveryAddress.pincode}
              </p>
            </div>
          </div>
          
          <!-- Action Buttons -->
          <div style="background: white; padding: 20px 25px; text-align: center; border-top: 1px solid #e9ecef;">
            <a href="https://supplier.aggrekart.com/orders/${order.orderId}" 
               style="display: inline-block; background: #28a745; color: white; padding: 15px 30px; 
                      text-decoration: none; border-radius: 6px; font-weight: 600; margin: 0 10px;">
              ✅ Confirm Order
            </a>
            <a href="https://supplier.aggrekart.com/orders" 
               style="display: inline-block; background: #007bff; color: white; padding: 15px 30px; 
                      text-decoration: none; border-radius: 6px; font-weight: 600; margin: 0 10px;">
              📋 View All Orders
            </a>
          </div>
          
          <!-- Important Notice -->
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px 25px;">
            <h4 style="color: #856404; margin-top: 0;">⚠️ Action Required</h4>
            <ul style="color: #856404; margin: 10px 0; padding-left: 20px;">
              <li>Please confirm this order within 2 hours</li>
              <li>Contact the customer if you need any clarification</li>
              <li>Update order status as you prepare and dispatch items</li>
            </ul>
          </div>
          
          <!-- Footer -->
          <div style="background: #343a40; color: white; padding: 25px; text-align: center;">
            <h3 style="margin: 0 0 10px 0; color: #28a745;">Aggrekart Supplier Portal</h3>
            <p style="margin: 0; opacity: 0.8;">Your business growth partner</p>
          </div>
        </div>
      `;

      notifications.push({
        type: 'email',
        recipient: supplier.email,
        subject: emailSubject,
        message: emailContent,
        template: 'supplier_order'
      });
    }
    
    // Send notifications
    const results = await NotificationService.sendBulkNotifications(notifications);
    
    console.log(`📬 Supplier notifications sent:`, {
      orderId: order.orderId,
      supplier: supplierName,
      sent: results.sent,
      failed: results.failed
    });
    
    return results;
    
  } catch (error) {
    console.error('❌ Failed to send supplier notifications:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendSMS,
  sendEmail,
  sendWelcomeEmail,
  sendOrderNotification,
  sendOrderPlacementNotification,    // 🔥 NEW: Enhanced customer notifications
  sendSupplierOrderNotification,     // 🔥 NEW: Enhanced supplier notifications
  NotificationService
};
