const mongoose = require('mongoose');
require('dotenv').config();

// Import the Product model
const Product = require('./models/Product');

async function debugProducts() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    console.log('MONGODB_URI:', process.env.MONGODB_URI);
    
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to database:', mongoose.connection.name);
    
    // Count all products
    const totalProducts = await Product.countDocuments();
    console.log('📊 Total products in database:', totalProducts);
    
    // Count products with filters (what the API uses)
    const filteredProducts = await Product.countDocuments({
      isActive: true,
      isApproved: true
    });
    console.log('🔍 Products matching API filter (isActive: true, isApproved: true):', filteredProducts);
    
    // Get all products (no filters)
    const allProducts = await Product.find({}).limit(5);
    console.log('\n📋 All products (first 5):');
    allProducts.forEach(product => {
      console.log(`- ${product.name}`);
      console.log(`  Category: ${product.category}`);
      console.log(`  isActive: ${product.isActive}`);
      console.log(`  isApproved: ${product.isApproved}`);
      console.log(`  ID: ${product._id}`);
      console.log('---');
    });
    
    // Get products with API filters
    const apiProducts = await Product.find({
      isActive: true,
      isApproved: true
    });
    console.log('\n🎯 Products that should show in API:');
    apiProducts.forEach(product => {
      console.log(`- ${product.name} (${product.category})`);
    });
    
    if (apiProducts.length === 0) {
      console.log('\n❌ No products match the API filter criteria!');
      console.log('Check these fields in your product document:');
      console.log('- isActive should be true');
      console.log('- isApproved should be true');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

debugProducts();