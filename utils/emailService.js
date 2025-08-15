const nodemailer = require('nodemailer');

// Enhanced logging function
const debugLog = (message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 📧 EMAIL DEBUG: ${message}`);
  if (data) {
    console.log('📧 EMAIL DATA:', JSON.stringify(data, null, 2));
  }
};

// Create transporter with enhanced debugging - FIXED FUNCTION NAME
const createTransporter = () => {
  debugLog('Creating email transporter with configuration:', {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    email: process.env.SMTP_EMAIL,
    passwordConfigured: !!process.env.SMTP_PASSWORD,
    frontendUrl: process.env.FRONTEND_URL
  });

  return nodemailer.createTransport({  // FIXED: Changed from createTransporter to createTransport
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: false, // true for 465, false for other ports like 587
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD
    },
    debug: true, // Enable debug output
    logger: true // Log to console
  });
};

// Welcome email template
const getWelcomeEmailTemplate = (email) => {
  return {
    from: {
      name: 'Aggrekart Team',
      address: process.env.SMTP_EMAIL
    },
    to: email,
    subject: '🎉 Welcome to Aggrekart Newsletter!',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Aggrekart</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px;
          }
          .header { 
            background: linear-gradient(135deg, #fc8019, #e67317); 
            color: white; 
            padding: 30px; 
            text-align: center; 
            border-radius: 10px 10px 0 0;
          }
          .content { 
            background: #f8f9fa; 
            padding: 30px; 
            border-radius: 0 0 10px 10px;
          }
          .logo { 
            font-size: 28px; 
            font-weight: bold; 
            margin-bottom: 10px;
          }
          .highlight { 
            background: #fff3cd; 
            padding: 15px; 
            border-radius: 8px; 
            margin: 20px 0;
            border-left: 4px solid #fc8019;
          }
          .button { 
            background: #fc8019; 
            color: white; 
            padding: 12px 30px; 
            text-decoration: none; 
            border-radius: 8px; 
            display: inline-block; 
            margin: 20px 0;
            font-weight: bold;
          }
          .footer { 
            background: #2c3e50; 
            color: white; 
            padding: 20px; 
            text-align: center; 
            margin-top: 20px;
            border-radius: 8px;
          }
          .social-links { 
            margin: 15px 0; 
          }
          .social-links a { 
            color: #fc8019; 
            text-decoration: none; 
            margin: 0 10px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">🏗️ Aggrekart</div>
          <h1>Welcome to Our Newsletter!</h1>
          <p>Your trusted partner for construction materials</p>
        </div>
        
        <div class="content">
          <h2>Hi there! 👋</h2>
          
          <p>Thank you for subscribing to the <strong>Aggrekart Newsletter</strong>! We're thrilled to have you join our community of builders, contractors, and construction enthusiasts.</p>
          
          <div class="highlight">
            <h3>🎯 What you'll receive:</h3>
            <ul>
              <li><strong>Weekly deals</strong> on premium construction materials</li>
              <li><strong>Industry insights</strong> and market trends</li>
              <li><strong>New product launches</strong> and exclusive previews</li>
              <li><strong>Construction tips</strong> from our experts</li>
              <li><strong>Special offers</strong> for newsletter subscribers</li>
            </ul>
          </div>

          <p>We believe in building stronger foundations together. Whether you're working on a small renovation or a large-scale construction project, we're here to provide you with:</p>
          
          <ul>
            <li>🧱 <strong>Premium Quality Materials</strong> - Cement, TMT Steel, Bricks, and more</li>
            <li>🚛 <strong>Fast Delivery</strong> - Right to your construction site</li>
            <li>💰 <strong>Competitive Prices</strong> - Best rates in the market</li>
            <li>🛠️ <strong>Expert Support</strong> - Technical guidance when you need it</li>
          </ul>

          <center>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/products" class="button">
              🛒 Start Shopping Now
            </a>
          </center>

          <p>Follow us on social media for daily updates and construction inspiration:</p>
          
          <div class="social-links">
            <a href="#" target="_blank">📘 Facebook</a>
            <a href="#" target="_blank">📸 Instagram</a>
            <a href="#" target="_blank">🐦 Twitter</a>
            <a href="#" target="_blank">💼 LinkedIn</a>
          </div>
        </div>

        <div class="footer">
          <p><strong>Aggrekart - Building Dreams, Delivering Quality</strong></p>
          <p>📧 Email: ${process.env.SMTP_EMAIL}</p>
          <p>🌐 Website: <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" style="color: #fc8019;">Aggrekart.com</a></p>
          <p style="font-size: 12px; margin-top: 15px; color: #bdc3c7;">
            You're receiving this email because you subscribed to our newsletter.<br>
            If you no longer wish to receive these emails, you can 
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/unsubscribe?email=${email}" style="color: #fc8019;">unsubscribe here</a>.
          </p>
        </div>
      </body>
      </html>
    `
  };
};

// Send welcome email with enhanced debugging
const sendWelcomeEmail = async (email) => {
  try {
    debugLog('Starting welcome email process', { email });

    // Check if all required environment variables are set
    const requiredEnvVars = {
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_PORT: process.env.SMTP_PORT,
      SMTP_EMAIL: process.env.SMTP_EMAIL,
      SMTP_PASSWORD: process.env.SMTP_PASSWORD
    };

    debugLog('Environment variables check:', {
      ...requiredEnvVars,
      SMTP_PASSWORD: process.env.SMTP_PASSWORD ? '[HIDDEN]' : 'NOT SET'
    });

    // Check for missing environment variables
    const missingVars = Object.entries(requiredEnvVars)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingVars.length > 0) {
      throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
    }

    debugLog('Creating transporter...');
    const transporter = createTransporter();
    
    debugLog('Getting email template...');
    const emailTemplate = getWelcomeEmailTemplate(email);
    
    debugLog('Email template created:', {
      from: emailTemplate.from,
      to: emailTemplate.to,
      subject: emailTemplate.subject,
      htmlLength: emailTemplate.html.length
    });

    debugLog('Verifying transporter configuration...');
    
    // Test the connection
    try {
      await transporter.verify();
      debugLog('✅ Email transporter verified successfully');
    } catch (verifyError) {
      debugLog('❌ Transporter verification failed:', {
        error: verifyError.message,
        code: verifyError.code,
        command: verifyError.command
      });
      throw new Error(`SMTP verification failed: ${verifyError.message}`);
    }

    debugLog('Sending email...');
    const result = await transporter.sendMail(emailTemplate);
    
    debugLog('✅ Welcome email sent successfully:', {
      messageId: result.messageId,
      to: email,
      from: process.env.SMTP_EMAIL,
      accepted: result.accepted,
      rejected: result.rejected,
      response: result.response
    });
    
    return {
      success: true,
      messageId: result.messageId,
      message: 'Welcome email sent successfully',
      details: {
        accepted: result.accepted,
        rejected: result.rejected
      }
    };
    
  } catch (error) {
    debugLog('❌ Failed to send welcome email:', {
      error: error.message,
      stack: error.stack,
      email: email,
      code: error.code,
      command: error.command,
      response: error.response
    });
    
    // Re-throw with more specific error message
    throw new Error(`Failed to send welcome email: ${error.message}`);
  }
};

// Test email function for debugging
const testEmailConfiguration = async () => {
  try {
    debugLog('Testing email configuration...');
    
    const transporter = createTransporter();
    
    // Test connection
    debugLog('Testing SMTP connection...');
    await transporter.verify();
    debugLog('✅ SMTP connection test passed');
    
    // Test sending a simple email
    debugLog('Sending test email...');
    const testEmail = {
      from: {
        name: 'Aggrekart Test',
        address: process.env.SMTP_EMAIL
      },
      to: process.env.SMTP_EMAIL, // Send to self for testing
      subject: '🧪 Email Configuration Test',
      html: `
        <h2>Email Configuration Test</h2>
        <p>This is a test email to verify that the email configuration is working correctly.</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</p>
      `
    };
    
    const result = await transporter.sendMail(testEmail);
    
    debugLog('✅ Test email sent successfully:', {
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected
    });
    
    return {
      success: true,
      message: 'Email configuration test passed',
      messageId: result.messageId
    };
    
  } catch (error) {
    debugLog('❌ Email configuration test failed:', {
      error: error.message,
      code: error.code,
      command: error.command
    });
    
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  sendWelcomeEmail,
  testEmailConfiguration,
  debugLog
};