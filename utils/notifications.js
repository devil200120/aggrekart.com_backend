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
  static async sendSMS(phoneNumber, message, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (!twilioClient) {
          console.log(`📱 SMS Service not configured. Would send to ${phoneNumber}: ${message}`);
          return { success: true, mock: true };
        }

        const result = await twilioClient.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: `+91${phoneNumber}`
        });

        console.log(`📱 SMS sent successfully (attempt ${attempt}):`, result.sid);
        return { success: true, sid: result.sid, attempt };
        
      } catch (error) {
        console.error(`❌ SMS sending failed (attempt ${attempt}):`, error);
        
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

module.exports = {
  sendSMS,
  sendEmail,
  sendWelcomeEmail,
  sendOrderNotification,
  NotificationService
};