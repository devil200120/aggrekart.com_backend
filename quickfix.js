const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function fixUserVerification() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');

    // Find the customer user we've been working with
    const users = await User.find({ role: 'customer' });
    
    console.log(`📊 Found ${users.length} customer users`);
    
    for (const user of users) {
      console.log(`\n👤 User: ${user.name} (${user.email})`);
      console.log(`   📱 Phone: ${user.phoneNumber}`);
      console.log(`   ✅ Phone Verified: ${user.phoneVerified}`);
      console.log(`   📧 Email Verified: ${user.emailVerified}`);
      console.log(`   🔓 Is Active: ${user.isActive}`);
      console.log(`   🏠 Addresses: ${user.addresses.length}`);
      
      let needsUpdate = false;
      
      // Fix verification status
      if (!user.phoneVerified) {
        user.phoneVerified = true;
        needsUpdate = true;
        console.log('   🔧 Fixed phone verification');
      }
      
      if (!user.emailVerified) {
        user.emailVerified = true;
        needsUpdate = true;
        console.log('   🔧 Fixed email verification');
      }
      
      if (!user.isActive) {
        user.isActive = true;
        needsUpdate = true;
        console.log('   🔧 Activated user account');
      }
      
      // Add a default address if none exists
      if (user.addresses.length === 0) {
        user.addresses.push({
          type: 'home',
          address: 'Test Address for Checkout',
          city: 'Test City',
          state: 'Test State',
          pincode: '123456',
          isDefault: true
        });
        needsUpdate = true;
        console.log('   🔧 Added default address');
      }
      
      if (needsUpdate) {
        await user.save();
        console.log('   💾 User updated successfully');
      } else {
        console.log('   ✅ User already properly configured');
      }
    }
    
    console.log('\n🎉 User verification fix completed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Database connection closed');
  }
}

fixUserVerification();