// Debug script to check supplier address fields
const mongoose = require('mongoose');
require('dotenv').config();

const Order = require('./models/Order');
const Supplier = require('./models/Supplier');

async function debugSupplierAddress() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database');

    // Find the test order
    const orderId = "AGK1756201614516ANT";
    const order = await Order.findOne({ orderId })
      .populate('supplier')
      .populate('customer');

    if (!order) {
      console.log('❌ Order not found');
      return;
    }

    console.log('\n📋 ORDER INFO:');
    console.log('Order ID:', order.orderId);
    console.log('Supplier ID:', order.supplier._id);
    console.log('Supplier Company:', order.supplier.companyName);

    console.log('\n🏢 SUPPLIER ADDRESS FIELDS:');
    console.log('='.repeat(50));
    
    const supplier = order.supplier;
    
    // Check all possible address fields
    console.log('supplier.address:', supplier.address || 'NOT FOUND');
    console.log('supplier.companyAddress:', supplier.companyAddress || 'NOT FOUND');
    console.log('supplier.dispatchLocation:', supplier.dispatchLocation || 'NOT FOUND');
    
    if (supplier.dispatchLocation) {
      console.log('supplier.dispatchLocation.address:', supplier.dispatchLocation.address || 'NOT FOUND');
    }
    
    console.log('\n📍 OTHER LOCATION FIELDS:');
    console.log('supplier.city:', supplier.city || 'NOT FOUND');
    console.log('supplier.state:', supplier.state || 'NOT FOUND');
    console.log('supplier.pincode:', supplier.pincode || 'NOT FOUND');
    
    console.log('\n🔍 ALL SUPPLIER FIELDS:');
    console.log('Available fields:', Object.keys(supplier.toObject()));
    
    // Try to construct address from available fields
    let constructedAddress = '';
    if (supplier.companyAddress) {
      constructedAddress = supplier.companyAddress;
    } else if (supplier.city && supplier.state) {
      constructedAddress = `${supplier.city}, ${supplier.state}`;
      if (supplier.pincode) {
        constructedAddress += ` - ${supplier.pincode}`;
      }
    }
    
    console.log('\n✅ SUGGESTED ADDRESS:', constructedAddress || 'Cannot construct address');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from database');
  }
}

debugSupplierAddress();