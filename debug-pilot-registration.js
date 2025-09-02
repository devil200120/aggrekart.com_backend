const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const Pilot = require('./models/Pilot');

async function testPilotCreation() {
  try {
    console.log('Testing pilot creation...');
    
    // Check existing pilot count
    const count = await Pilot.countDocuments();
    console.log('Current pilot count:', count);
    
    // Create test pilot
    const pilot = new Pilot({
      name: 'Test Pilot',
      phoneNumber: '9876543210',
      email: 'testpilot@test.com',
      vehicleDetails: {
        vehicleType: 'truck',
        registrationNumber: 'KA01AB1234',
        capacity: 5
      },
      drivingLicense: {
        number: 'DL123456789',
        validTill: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      },
      emergencyContact: {
        name: 'Emergency Contact',
        phoneNumber: '9876543211'
      }
    });
    
    console.log('Before save - pilotId:', pilot.pilotId);
    
    await pilot.save();
    
    console.log('After save - pilotId:', pilot.pilotId);
    console.log('✅ Pilot created successfully');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  } finally {
    mongoose.disconnect();
  }
}

testPilotCreation();