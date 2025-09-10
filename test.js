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

// Import the exact model from your project
const Pilot = require('./models/Pilot');

async function fixCurrentOrderMongoDBError() {
  try {
    await connectDB();
    
    console.log('🔧 FIXING MONGODB CURRENT ORDER ERRORS');
    console.log('='.repeat(60));
    
    // Get pilot ID from command line
    const pilotId = process.argv[2] || 'PIL000001'; // Default to first pilot
    
    console.log(`🎯 Working with pilot: ${pilotId}`);
    
    // Method 1: Try with mongoose model method
    console.log('\n📝 Method 1: Using Mongoose Model.findOneAndUpdate()');
    try {
      const result1 = await Pilot.findOneAndUpdate(
        { pilotId: pilotId },
        { currentOrder: null },
        { new: true, runValidators: false } // Disable validators
      );
      
      if (result1) {
        console.log('✅ SUCCESS: Method 1 worked');
        console.log(`   📦 currentOrder is now: ${result1.currentOrder}`);
      } else {
        console.log('❌ FAILED: Pilot not found');
      }
    } catch (error) {
      console.log(`❌ Method 1 FAILED: ${error.message}`);
      console.log(`   Error Code: ${error.code}`);
      console.log(`   Error Name: ${error.name}`);
    }
    
    // Method 2: Try with $unset operator
    console.log('\n📝 Method 2: Using $unset to remove field completely');
    try {
      const result2 = await Pilot.updateOne(
        { pilotId: pilotId },
        { $unset: { currentOrder: "" } }
      );
      
      console.log(`✅ Method 2 Result: ${JSON.stringify(result2)}`);
      if (result2.modifiedCount > 0) {
        console.log('✅ SUCCESS: Field removed with $unset');
      }
    } catch (error) {
      console.log(`❌ Method 2 FAILED: ${error.message}`);
    }
    
    // Method 3: Try with raw MongoDB operation
    console.log('\n📝 Method 3: Using Raw MongoDB Collection');
    try {
      const result3 = await mongoose.connection.db.collection('pilots').updateOne(
        { pilotId: pilotId },
        { $set: { currentOrder: null } }
      );
      
      console.log(`✅ Method 3 Result: ${JSON.stringify(result3)}`);
      if (result3.modifiedCount > 0) {
        console.log('✅ SUCCESS: Raw MongoDB operation worked');
      }
    } catch (error) {
      console.log(`❌ Method 3 FAILED: ${error.message}`);
    }
    
    // Method 4: Try setting to undefined instead of null
    console.log('\n📝 Method 4: Setting to undefined instead of null');
    try {
      const result4 = await Pilot.findOneAndUpdate(
        { pilotId: pilotId },
        { currentOrder: undefined },
        { new: true }
      );
      
      if (result4) {
        console.log('✅ SUCCESS: Method 4 worked with undefined');
        console.log(`   📦 currentOrder is now: ${result4.currentOrder}`);
      }
    } catch (error) {
      console.log(`❌ Method 4 FAILED: ${error.message}`);
    }
    
    // Method 5: Check for validation issues
    console.log('\n📝 Method 5: Checking validation and saving manually');
    try {
      const pilot = await Pilot.findOne({ pilotId: pilotId });
      if (pilot) {
        console.log(`   📋 Current currentOrder: ${pilot.currentOrder}`);
        console.log(`   📋 Type: ${typeof pilot.currentOrder}`);
        
        // Set to null manually
        pilot.currentOrder = null;
        
        // Validate before saving
        const validationError = pilot.validateSync();
        if (validationError) {
          console.log(`❌ Validation Error: ${validationError.message}`);
        } else {
          await pilot.save();
          console.log('✅ SUCCESS: Manual save worked');
        }
      }
    } catch (error) {
      console.log(`❌ Method 5 FAILED: ${error.message}`);
      if (error.errors) {
        Object.keys(error.errors).forEach(field => {
          console.log(`   📋 Field Error [${field}]: ${error.errors[field].message}`);
        });
      }
    }
    
    // Method 6: Force reset using replaceOne
    console.log('\n📝 Method 6: Using replaceOne (nuclear option)');
    try {
      const pilot = await Pilot.findOne({ pilotId: pilotId }).lean();
      if (pilot) {
        // Remove the currentOrder field entirely
        delete pilot.currentOrder;
        
        const result6 = await Pilot.replaceOne(
          { pilotId: pilotId },
          { ...pilot, currentOrder: null }
        );
        
        console.log(`✅ Method 6 Result: ${JSON.stringify(result6)}`);
        if (result6.modifiedCount > 0) {
          console.log('✅ SUCCESS: replaceOne worked');
        }
      }
    } catch (error) {
      console.log(`❌ Method 6 FAILED: ${error.message}`);
    }
    
    // Final verification
    console.log('\n🔍 FINAL VERIFICATION:');
    console.log('-'.repeat(40));
    try {
      const finalPilot = await Pilot.findOne({ pilotId: pilotId });
      if (finalPilot) {
        console.log(`👤 Pilot: ${finalPilot.name}`);
        console.log(`📦 currentOrder: ${finalPilot.currentOrder}`);
        console.log(`📋 Type: ${typeof finalPilot.currentOrder}`);
        console.log(`✅ Is Available: ${finalPilot.isAvailable}`);
        console.log(`🆓 Can Accept Orders: ${finalPilot.isAvailable && !finalPilot.currentOrder}`);
      }
    } catch (error) {
      console.log(`❌ Verification failed: ${error.message}`);
    }
    
    // Check database indexes that might be causing issues
    console.log('\n📇 DATABASE INDEX CHECK:');
    console.log('-'.repeat(40));
    try {
      const indexes = await Pilot.collection.getIndexes();
      console.log('📋 Current indexes on pilots collection:');
      
      Object.keys(indexes).forEach(indexName => {
        const indexSpec = indexes[indexName];
        console.log(`   📇 ${indexName}:`);
        
        if (Array.isArray(indexSpec)) {
          indexSpec.forEach(field => {
            console.log(`      - ${field[0]}: ${field[1]}`);
            if (field[0] === 'currentOrder') {
              console.log(`      🚨 FOUND currentOrder index - this might cause issues!`);
            }
          });
        } else {
          console.log(`      ${JSON.stringify(indexSpec)}`);
        }
      });
    } catch (error) {
      console.log(`❌ Index check failed: ${error.message}`);
    }
    
    console.log('\n💡 TROUBLESHOOTING TIPS:');
    console.log('-'.repeat(40));
    console.log('1. 🔍 Check if there are any unique indexes on currentOrder');
    console.log('2. 🛡️  Check MongoDB logs for detailed error messages');
    console.log('3. 🔄 Try using MongoDB Compass to manually update the field');
    console.log('4. 📋 Verify the pilot document structure is not corrupted');
    console.log('5. 🚀 Consider dropping and recreating indexes if needed');
    
  } catch (error) {
    console.error('❌ Script failed:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔐 Database connection closed');
  }
}

// Alternative quick fix function
async function quickFixCurrentOrder() {
  try {
    await connectDB();
    
    const pilotId = process.argv[2];
    if (!pilotId) {
      console.log('❌ Please provide pilot ID: node fix-mongodb-currentorder-error.js PIL000001');
      return;
    }
    
    console.log(`🚑 QUICK FIX for pilot: ${pilotId}`);
    
    // The most reliable method - raw MongoDB update
    const result = await mongoose.connection.db.collection('pilots').updateOne(
      { pilotId: pilotId },
      { 
        $unset: { currentOrder: 1 },
        $set: { 
          isAvailable: true,
          updatedAt: new Date()
        }
      }
    );
    
    if (result.matchedCount > 0) {
      console.log('✅ SUCCESS: Pilot fixed and available for orders');
      
      // Verify
      const pilot = await mongoose.connection.db.collection('pilots').findOne({ pilotId: pilotId });
      console.log(`📦 currentOrder: ${pilot.currentOrder}`);
      console.log(`✅ isAvailable: ${pilot.isAvailable}`);
    } else {
      console.log('❌ No pilot found with that ID');
    }
    
  } catch (error) {
    console.error('❌ Quick fix failed:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

// Run based on command line arguments
const action = process.argv[3];

if (action === 'quick') {
  quickFixCurrentOrder();
} else {
  fixCurrentOrderMongoDBError();
}