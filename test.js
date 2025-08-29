const nodemailer = require('nodemailer');
require('dotenv').config(); // Load environment variables

// Enhanced logging function
const debugLog = (message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 📧 EMAIL TEST: ${message}`);
  if (data) {
    console.log('📧 DATA:', JSON.stringify(data, null, 2));
  }
};

console.log('🚀 Starting comprehensive email test...\n');

// Step 1: Check environment variables
async function checkEnvironmentVariables() {
  console.log('📋 STEP 1: Checking Environment Variables');
  console.log('=====================================');
  
  const requiredVars = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_EMAIL: process.env.SMTP_EMAIL,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD
  };

  console.log('Environment Variables:');
  console.log('- SMTP_HOST:', requiredVars.SMTP_HOST || '❌ NOT SET');
  console.log('- SMTP_PORT:', requiredVars.SMTP_PORT || '❌ NOT SET');
  console.log('- SMTP_EMAIL:', requiredVars.SMTP_EMAIL || '❌ NOT SET');
  console.log('- SMTP_PASSWORD:', requiredVars.SMTP_PASSWORD ? '✅ SET (hidden)' : '❌ NOT SET');

  const missingVars = Object.entries(requiredVars)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    console.log(`\n❌ Missing variables: ${missingVars.join(', ')}`);
    console.log('\n🔧 Please add these to your .env file:');
    console.log('SMTP_HOST=smtp.gmail.com');
    console.log('SMTP_PORT=587');
    console.log('SMTP_EMAIL=your-email@gmail.com');
    console.log('SMTP_PASSWORD=your-app-password');
    return false;
  }

  console.log('\n✅ All environment variables are set!\n');
  return true;
}

// Step 2: Test transporter creation
function createTestTransporter() {
  console.log('🔧 STEP 2: Creating Email Transporter');
  console.log('====================================');
  
  try {
    const transporter = nodemailer.createTransport({
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

    console.log('✅ Transporter created successfully');
    console.log('Configuration:');
    console.log(`- Host: ${process.env.SMTP_HOST}`);
    console.log(`- Port: ${process.env.SMTP_PORT}`);
    console.log(`- Secure: false`);
    console.log(`- User: ${process.env.SMTP_EMAIL}\n`);

    return transporter;
  } catch (error) {
    console.log('❌ Failed to create transporter:', error.message);
    return null;
  }
}

// Step 3: Verify SMTP connection
async function verifyConnection(transporter) {
  console.log('🔍 STEP 3: Verifying SMTP Connection');
  console.log('===================================');
  
  try {
    await transporter.verify();
    console.log('✅ SMTP connection verified successfully!\n');
    return true;
  } catch (error) {
    console.log('❌ SMTP verification failed:', error.message);
    
    // Provide specific help for common errors
    if (error.code === 'EAUTH') {
      console.log('\n🔑 AUTHENTICATION ERROR - SOLUTIONS:');
      console.log('1. Enable 2-Factor Authentication on Gmail');
      console.log('2. Generate App Password:');
      console.log('   - Go to Google Account Settings');
      console.log('   - Security → 2-Step Verification');
      console.log('   - App Passwords → Generate for "Mail"');
      console.log('   - Use the 16-character App Password');
      console.log('3. Update SMTP_PASSWORD in .env with App Password');
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNECTION') {
      console.log('\n🌐 CONNECTION ERROR - SOLUTIONS:');
      console.log('1. Check your internet connection');
      console.log('2. Try different SMTP settings:');
      console.log('   SMTP_HOST=smtp.gmail.com');
      console.log('   SMTP_PORT=587 or 465');
    } else if (error.code === 'ENOTFOUND') {
      console.log('\n🔍 HOST ERROR - Check SMTP_HOST setting');
    }
    
    console.log(`\nFull error: ${error.message}\n`);
    return false;
  }
}

// Step 4: Send test email
async function sendTestEmail(transporter) {
  console.log('📧 STEP 4: Sending Test Email');
  console.log('=============================');
  
  const testEmail = {
    from: {
      name: 'Aggrekart Test',
      address: process.env.SMTP_EMAIL
    },
    to: process.env.SMTP_EMAIL, // Send to yourself for testing
    subject: '🧪 Email Configuration Test - ' + new Date().toLocaleString(),
    text: 'This is a test email to verify email configuration.',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #fc8019; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1>🧪 Email Test Successful!</h1>
        </div>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px;">
          <h2>Email Configuration Working!</h2>
          <p>Congratulations! Your email configuration is working correctly.</p>
          <ul>
            <li><strong>SMTP Host:</strong> ${process.env.SMTP_HOST}</li>
            <li><strong>SMTP Port:</strong> ${process.env.SMTP_PORT}</li>
            <li><strong>From:</strong> ${process.env.SMTP_EMAIL}</li>
            <li><strong>Test Time:</strong> ${new Date().toLocaleString()}</li>
          </ul>
          <p>Now you can send ticket notifications, order updates, and other emails!</p>
          <hr>
          <p style="font-size: 12px; color: #666;">
            This is an automated test email from your Aggrekart application.
          </p>
        </div>
      </div>
    `
  };

  try {
    console.log('Sending test email...');
    const result = await transporter.sendMail(testEmail);
    
    console.log('✅ Test email sent successfully!');
    console.log('Details:');
    console.log(`- Message ID: ${result.messageId}`);
    console.log(`- To: ${testEmail.to}`);
    console.log(`- Subject: ${testEmail.subject}`);
    console.log(`- Accepted: ${JSON.stringify(result.accepted)}`);
    console.log(`- Rejected: ${JSON.stringify(result.rejected)}`);
    console.log('\n🎉 Check your inbox for the test email!\n');
    
    return true;
  } catch (error) {
    console.log('❌ Failed to send test email:', error.message);
    console.log('Full error:', error);
    return false;
  }
}

// Step 5: Test your application's notification system
async function testApplicationNotifications() {
  console.log('🔧 STEP 5: Testing Application Notification System');
  console.log('================================================');
  
  try {
    // Test the NotificationService from your app
    const { sendEmail } = require('./utils/notifications');
    
    console.log('Testing NotificationService.sendEmail...');
    
    const result = await sendEmail(
      process.env.SMTP_EMAIL,
      '🎯 Application Email Test - ' + new Date().toLocaleString(),
      'This is a test from your application notification system.'
    );
    
    if (result.success) {
      console.log('✅ Application notification system working!');
      console.log(`- Message ID: ${result.messageId}`);
    } else {
      console.log('❌ Application notification system failed:', result.error);
    }
    
    return result.success;
  } catch (error) {
    console.log('❌ Error testing application notifications:', error.message);
    return false;
  }
}

// Step 6: Gmail App Password Instructions
function showAppPasswordInstructions() {
  console.log('🔐 HOW TO CREATE GMAIL APP PASSWORD');
  console.log('===================================');
  console.log('Since you mentioned you can\'t find the password option in 2FA:');
  console.log();
  console.log('📱 METHOD 1 - Via Google Account Settings:');
  console.log('1. Go to https://myaccount.google.com/');
  console.log('2. Click "Security" in the left sidebar');
  console.log('3. Under "Signing in to Google", click "2-Step Verification"');
  console.log('4. Scroll down to find "App passwords" (may be at the bottom)');
  console.log('5. Click "App passwords"');
  console.log('6. Select "Mail" and "Other (custom name)"');
  console.log('7. Enter "Aggrekart" as the name');
  console.log('8. Click "Generate"');
  console.log('9. Copy the 16-character password (format: xxxx xxxx xxxx xxxx)');
  console.log();
  console.log('💻 METHOD 2 - Direct Link:');
  console.log('1. Go directly to: https://myaccount.google.com/apppasswords');
  console.log('2. Sign in if prompted');
  console.log('3. Select "Mail" and generate password');
  console.log();
  console.log('⚠️  IMPORTANT NOTES:');
  console.log('- You MUST have 2-Factor Authentication enabled first');
  console.log('- Use the App Password (16 characters), NOT your Gmail password');
  console.log('- App Passwords don\'t have spaces when you enter them in .env');
  console.log();
  console.log('🔧 Add to your .env file:');
  console.log('SMTP_PASSWORD=abcdefghijklmnop  # Your 16-character app password');
  console.log();
}

// Main test function
async function runEmailTest() {
  console.log('🎯 AGGREKART EMAIL CONFIGURATION TEST');
  console.log('=====================================\n');

  // Step 1: Check environment variables
  const envOk = await checkEnvironmentVariables();
  if (!envOk) {
    showAppPasswordInstructions();
    return;
  }

  // Step 2: Create transporter
  const transporter = createTestTransporter();
  if (!transporter) {
    return;
  }

  // Step 3: Verify connection
  const connectionOk = await verifyConnection(transporter);
  if (!connectionOk) {
    showAppPasswordInstructions();
    return;
  }

  // Step 4: Send test email
  const emailOk = await sendTestEmail(transporter);
  
  // Step 5: Test application notifications
  await testApplicationNotifications();

  // Summary
  console.log('📊 TEST SUMMARY');
  console.log('===============');
  console.log('✅ Environment Variables: OK');
  console.log('✅ Transporter Creation: OK');
  console.log('✅ SMTP Connection: OK');
  console.log(`${emailOk ? '✅' : '❌'} Test Email: ${emailOk ? 'OK' : 'FAILED'}`);
  console.log();
  
  if (emailOk) {
    console.log('🎉 EMAIL CONFIGURATION IS WORKING!');
    console.log('Your ticket status change emails should now work properly.');
    console.log();
    console.log('Next steps:');
    console.log('1. Restart your server');
    console.log('2. Try changing a ticket status');
    console.log('3. Check your email for notifications');
  } else {
    console.log('❌ EMAIL CONFIGURATION NEEDS FIXING');
    showAppPasswordInstructions();
  }
}

// Run the test
runEmailTest().catch(error => {
  console.error('❌ Test failed:', error);
});