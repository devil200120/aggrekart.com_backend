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

// Simple pilot schema
const pilotSchema = new mongoose.Schema({
  pilotId: String,
  phoneNumber: String,
  name: String,
  isApproved: { type: Boolean, default: false },
  approvedAt: Date
});

const Pilot = mongoose.model('Pilot', pilotSchema);

async function approvePilot(pilotId) {
  try {
    await connectDB();
    
    const pilot = await Pilot.findOne({ pilotId: pilotId });
    
    if (!pilot) {
      console.log(`❌ Pilot with ID ${pilotId} not found`);
      return;
    }
    
    if (pilot.isApproved) {
      console.log(`ℹ️ Pilot ${pilotId} is already approved`);
      return;
    }
    
    // Approve the pilot
    pilot.isApproved = true;
    pilot.approvedAt = new Date();
    await pilot.save();
    
    console.log(`✅ Pilot ${pilotId} (${pilot.name}) approved successfully!`);
    console.log(`📱 Phone: ${pilot.phoneNumber}`);
    console.log(`⏰ Approved at: ${pilot.approvedAt}`);
    
  } catch (error) {
    console.error('❌ Error approving pilot:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('🔐 Database connection closed');
  }
}

async function listPilots() {
  try {
    await connectDB();
    
    const pilots = await Pilot.find({}).sort({ createdAt: -1 }).limit(10);
    
    console.log('\n📋 Recent Pilots:');
    console.log('='.repeat(60));
    
    pilots.forEach(pilot => {
      const status = pilot.isApproved ? '✅ Approved' : '⏳ Pending';
      console.log(`${pilot.pilotId} | ${pilot.name} | ${pilot.phoneNumber} | ${status}`);
    });
    
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Error listing pilots:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('🔐 Database connection closed');
  }
}

// Get command line arguments
const command = process.argv[2];
const pilotId = process.argv[3];

async function main() {
  if (command === 'approve' && pilotId) {
    await approvePilot(pilotId);
  } else if (command === 'list') {
    await listPilots();
  } else {
    console.log('🔧 Pilot Approval Helper');
    console.log('');
    console.log('Usage:');
    console.log('  node approve-pilot.js list              - List all pilots');
    console.log('  node approve-pilot.js approve <ID>      - Approve a specific pilot');
    console.log('');
    console.log('Examples:');
    console.log('  node approve-pilot.js list');
    console.log('  node approve-pilot.js approve PIL000006');
  }
}

main().catch(console.error);