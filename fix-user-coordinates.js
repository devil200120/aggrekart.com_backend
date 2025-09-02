const mongoose = require('mongoose');
require('dotenv').config();

const Supplier = require('./models/Supplier');

async function testSupplierAddressUpdate() {
  try {
    console.log('🧪 Testing Supplier Address Update...\n');
    
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to database');

    // Find a supplier to test with
    const supplier = await Supplier.findOne({ isActive: true, isApproved: true });
    
    if (!supplier) {
      console.log('❌ No active supplier found to test with');
      return;
    }

    console.log(`📍 Testing with supplier: ${supplier.companyName}`);
    console.log(`Current coordinates: [${supplier.dispatchLocation?.coordinates || [0, 0]}]`);
    console.log(`Current address: ${supplier.companyAddress}`);
    console.log(`Current city: ${supplier.city}, State: ${supplier.state}`);

    // Check if GeocodingService is available
    try {
      const GeocodingService = require('./utils/geocoding');
      console.log('✅ GeocodingService is available');
      
      // Test geocoding
      const testResult = await GeocodingService.getCoordinates({
        address: supplier.companyAddress,
        city: supplier.city,
        state: supplier.state
      });
      
      if (testResult) {
        console.log(`✅ Geocoding test successful: [${testResult.longitude}, ${testResult.latitude}]`);
        console.log(`Source: ${testResult.source}`);
      } else {
        console.log('❌ Geocoding test failed - no results');
      }
      
    } catch (geocodeError) {
      console.error('❌ GeocodingService error:', geocodeError.message);
    }

  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔚 Test completed');
  }
}

testSupplierAddressUpdate().catch(console.error);