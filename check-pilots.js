const mongoose = require('mongoose');
require('dotenv').config();

// Connect to database
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

// Pilot schema
const pilotSchema = new mongoose.Schema({
  pilotId: String,
  phoneNumber: String,
  name: String,
  isApproved: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  approvedAt: Date
});

const Pilot = mongoose.model('Pilot', pilotSchema);

async function checkAndFixPilots() {
  try {
    await connectDB();
    
    console.log('🔍 Checking pilot data...\n');
    
    const pilots = await Pilot.find({}).sort({ createdAt: -1 }).limit(10);
    
    console.log('📋 Current Pilot Status:');
    console.log('='.repeat(80));
    
    for (const pilot of pilots) {
      const status = pilot.isApproved ? '✅ Approved' : '⏳ Pending';
      const active = pilot.isActive !== false ? '🟢 Active' : '🔴 Inactive';
      
      console.log(`${pilot.pilotId} | ${pilot.name} | ${pilot.phoneNumber}`);
      console.log(`   Status: ${status} | ${active}`);
      console.log(`   isApproved: ${pilot.isApproved} | isActive: ${pilot.isActive}`);
      
      // Fix pilots that are approved but not active
      if (pilot.isApproved && pilot.isActive !== true) {
        pilot.isActive = true;
        await pilot.save();
        console.log(`   🔧 Fixed: Set isActive to true`);
      }
      
      console.log('');
    }
    
    console.log('='.repeat(80));
    
    // Find pilots ready for login
    const readyPilots = await Pilot.find({ isApproved: true, isActive: true });
    
    console.log('\n✅ Pilots Ready for Login:');
    if (readyPilots.length > 0) {
      readyPilots.forEach(pilot => {
        console.log(`   👤 ${pilot.pilotId} | ${pilot.name} | 📱 ${pilot.phoneNumber}`);
      });
    } else {
      console.log('   ⚠️ No pilots are both approved and active');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔐 Database connection closed');
  }
}

checkAndFixPilots();