const mongoose = require('mongoose');
const path = require('path');

// Load environment variables from the correct path
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Language = require('../models/Language');
const Translation = require('../models/Translation');

console.log('🔍 Environment check:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('MONGODB_URI exists:', !!process.env.MONGODB_URI);
console.log('MONGODB_URI (masked):', process.env.MONGODB_URI ? 
  process.env.MONGODB_URI.replace(/mongodb\+srv:\/\/[^:]+:[^@]+@/, 'mongodb+srv://***:***@') : 
  'NOT FOUND'
);

// Languages that match your Language model schema
const supportedLanguages = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    isRTL: false,
    isActive: true,
    flag: '🇺🇸',
    order: 1
  },
  {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    isRTL: false,
    isActive: true,
    flag: '🇮🇳',
    order: 2
  },
  {
    code: 'or',
    name: 'Odia',
    nativeName: 'ଓଡ଼ିଆ',
    isRTL: false,
    isActive: true,
    flag: '🇮🇳',
    order: 3
  },
  {
    code: 'te',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    isRTL: false,
    isActive: true,
    flag: '🇮🇳',
    order: 4
  },
  {
    code: 'bn',
    name: 'Bengali',
    nativeName: 'বাংলা',
    isRTL: false,
    isActive: true,
    flag: '🇮🇳',
    order: 5
  },
  {
    code: 'ta',
    name: 'Tamil',
    nativeName: 'தமিழ்',
    isRTL: false,
    isActive: true,
    flag: '🇮🇳',
    order: 6
  },
  {
    code: 'gu',
    name: 'Gujarati',
    nativeName: 'ગુજરાતી',
    isRTL: false,
    isActive: true,
    flag: '🇮🇳',
    order: 7
  },
  {
    code: 'mr',
    name: 'Marathi',
    nativeName: 'मराठी',
    isRTL: false,
    isActive: true,
    flag: '🇮🇳',
    order: 8
  },
  {
    code: 'kn',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    isRTL: false,
    isActive: true,
    flag: '🇮🇳',
    order: 9
  },
  {
    code: 'ml',
    name: 'Malayalam',
    nativeName: 'മലയാളം',
    isRTL: false,
    isActive: true,
    flag: '🇮🇳',
    order: 10
  }
];

// Base English translations that match your Translation model schema
const baseTranslations = [
  // Navigation
  { key: 'nav.home', language: 'en', value: 'Home', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'nav.products', language: 'en', value: 'Products', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'nav.cart', language: 'en', value: 'Cart', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'nav.orders', language: 'en', value: 'My Orders', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'nav.profile', language: 'en', value: 'Profile', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'nav.login', language: 'en', value: 'Login', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'nav.register', language: 'en', value: 'Register', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'nav.logout', language: 'en', value: 'Logout', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'nav.dashboard', language: 'en', value: 'Dashboard', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'nav.settings', language: 'en', value: 'Settings', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'nav.wishlist', language: 'en', value: 'Wishlist', context: 'general', isAutoTranslated: false, needsReview: false },

  // Common Actions
  { key: 'common.save', language: 'en', value: 'Save', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.cancel', language: 'en', value: 'Cancel', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.delete', language: 'en', value: 'Delete', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.edit', language: 'en', value: 'Edit', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.add', language: 'en', value: 'Add', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.remove', language: 'en', value: 'Remove', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.submit', language: 'en', value: 'Submit', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.search', language: 'en', value: 'Search', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.filter', language: 'en', value: 'Filter', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.sort', language: 'en', value: 'Sort', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.loading', language: 'en', value: 'Loading...', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.error', language: 'en', value: 'Error', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.success', language: 'en', value: 'Success', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.warning', language: 'en', value: 'Warning', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.info', language: 'en', value: 'Information', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.yes', language: 'en', value: 'Yes', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.no', language: 'en', value: 'No', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.ok', language: 'en', value: 'OK', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.back', language: 'en', value: 'Back', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.next', language: 'en', value: 'Next', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'common.close', language: 'en', value: 'Close', context: 'general', isAutoTranslated: false, needsReview: false },

  // Product Related  
  { key: 'product.name', language: 'en', value: 'Product Name', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'product.price', language: 'en', value: 'Price', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'product.description', language: 'en', value: 'Description', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'product.category', language: 'en', value: 'Category', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'product.stock', language: 'en', value: 'Stock', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'product.availability', language: 'en', value: 'Availability', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'product.in_stock', language: 'en', value: 'In Stock', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'product.out_of_stock', language: 'en', value: 'Out of Stock', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'product.add_to_cart', language: 'en', value: 'Add to Cart', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'product.buy_now', language: 'en', value: 'Buy Now', context: 'general', isAutoTranslated: false, needsReview: false },

  // Categories (AggreKart specific)
  { key: 'category.cement', language: 'en', value: 'Cement', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'category.bricks_blocks', language: 'en', value: 'Bricks & Blocks', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'category.aggregates', language: 'en', value: 'Aggregates', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'category.tmt_steel', language: 'en', value: 'TMT Steel', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'category.sand', language: 'en', value: 'Sand', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'category.all', language: 'en', value: 'All Categories', context: 'general', isAutoTranslated: false, needsReview: false },

  // Cart & Checkout
  { key: 'cart.title', language: 'en', value: 'Shopping Cart', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'cart.empty', language: 'en', value: 'Your cart is empty', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'cart.total', language: 'en', value: 'Total', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'cart.checkout', language: 'en', value: 'Checkout', context: 'general', isAutoTranslated: false, needsReview: false },

  // Orders
  { key: 'order.title', language: 'en', value: 'Orders', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'order.id', language: 'en', value: 'Order ID', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'order.date', language: 'en', value: 'Order Date', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'order.status', language: 'en', value: 'Status', context: 'general', isAutoTranslated: false, needsReview: false },

  // Order Status
  { key: 'status.pending', language: 'en', value: 'Pending', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'status.confirmed', language: 'en', value: 'Confirmed', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'status.processing', language: 'en', value: 'Processing', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'status.shipped', language: 'en', value: 'Shipped', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'status.delivered', language: 'en', value: 'Delivered', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'status.cancelled', language: 'en', value: 'Cancelled', context: 'general', isAutoTranslated: false, needsReview: false },

  // Authentication
  { key: 'auth.login', language: 'en', value: 'Login', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'auth.register', language: 'en', value: 'Register', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'auth.email', language: 'en', value: 'Email', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'auth.password', language: 'en', value: 'Password', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'auth.phone', language: 'en', value: 'Phone Number', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'auth.name', language: 'en', value: 'Full Name', context: 'general', isAutoTranslated: false, needsReview: false },

  // Language
  { key: 'language.select', language: 'en', value: 'Select Language', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'language.current', language: 'en', value: 'Current Language', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'language.changed', language: 'en', value: 'Language changed successfully', context: 'general', isAutoTranslated: false, needsReview: false },

  // Company Info
  { key: 'company.name', language: 'en', value: 'Aggrekart', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'company.tagline', language: 'en', value: 'Your Construction Materials Partner', context: 'general', isAutoTranslated: false, needsReview: false },
  { key: 'company.description', language: 'en', value: 'Leading supplier of quality construction materials including cement, bricks, aggregates, TMT steel, and sand.', context: 'general', isAutoTranslated: false, needsReview: false }
];

// Seeding functions
const seedLanguages = async () => {
  try {
    console.log('🌐 Starting language seeding...');
    
    // Clear existing languages
    const deletedLanguages = await Language.deleteMany({});
    console.log(`🗑️ Cleared ${deletedLanguages.deletedCount} existing languages`);
    
    // Insert new languages
    const createdLanguages = await Language.insertMany(supportedLanguages);
    console.log(`✅ Created ${createdLanguages.length} languages:`);
    createdLanguages.forEach(lang => {
      console.log(`   - ${lang.code}: ${lang.nativeName} (${lang.name})`);
    });
    
    return createdLanguages;
  } catch (error) {
    console.error('❌ Error seeding languages:', error);
    throw error;
  }
};

const seedBaseTranslations = async () => {
  try {
    console.log('📝 Starting translation seeding...');
    
    // Clear existing translations
    const deletedTranslations = await Translation.deleteMany({});
    console.log(`🗑️ Cleared ${deletedTranslations.deletedCount} existing translations`);
    
    // Insert base translations
    const createdTranslations = await Translation.insertMany(baseTranslations);
    console.log(`✅ Created ${createdTranslations.length} base English translations`);
    
    return createdTranslations;
  } catch (error) {
    console.error('❌ Error seeding translations:', error);
    throw error;
  }
};

const runSeeding = async () => {
  let shouldCloseConnection = false;
  
  try {
    console.log('🚀 Starting AggreKart translation system seeding...');
    console.log('📅 Date:', new Date().toISOString());
    
    // Check if MONGODB_URI is available
    if (!process.env.MONGODB_URI) {
      console.error('❌ MONGODB_URI not found in environment variables');
      console.error('💡 Make sure your .env file exists and contains MONGODB_URI');
      console.error('📁 .env file path:', path.join(__dirname, '..', '.env'));
      throw new Error('Missing MONGODB_URI environment variable');
    }
    
    console.log('🔗 Database:', process.env.MONGODB_URI.replace(/mongodb\+srv:\/\/[^:]+:[^@]+@/, 'mongodb+srv://***:***@'));
    
    // Connect to MongoDB
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log('✅ Connected to MongoDB');
      shouldCloseConnection = true;
    } else {
      console.log('✅ Already connected to MongoDB');
    }
    
    // Run seeding
    const languages = await seedLanguages();
    const translations = await seedBaseTranslations();
    
    console.log('');
    console.log('🎉 Translation system seeding completed successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   Languages: ${languages.length}`);
    console.log(`   Translations: ${translations.length}`);
    console.log('');
    console.log('🔍 Available Languages:');
    languages.forEach(lang => {
      console.log(`   ${lang.flag} ${lang.nativeName} (${lang.code})`);
    });
    console.log('');
    console.log('✅ Your language selector should now work!');
    console.log('✅ Restart your frontend and backend servers');
    console.log('✅ The globe button should now show a dropdown with languages');
    
  } catch (error) {
    console.error('💥 Seeding failed:', error);
    throw error;
  } finally {
    // Only close connection if we opened it in this script
    if (shouldCloseConnection && mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('🔐 Database connection closed');
    }
  }
};

// Run if called directly
if (require.main === module) {
  runSeeding()
    .then(() => {
      console.log('✅ Seeding script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Seeding script failed:', error);
      process.exit(1);
    });
}

// Export functions for use in other scripts
module.exports = { 
  seedLanguages, 
  seedBaseTranslations, 
  runSeeding,
  supportedLanguages,
  baseTranslations
};