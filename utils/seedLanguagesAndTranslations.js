const mongoose = require('mongoose');
const Language = require('../models/Language');
const Translation = require('../models/Translation');
const googleTranslateService = require('./googleTranslateService');
require('dotenv').config();

const languages = [
  { code: 'en', name: 'English', nativeName: 'English', rtl: false, isDefault: true, priority: 100 },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', rtl: false, priority: 90 },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', rtl: false, priority: 80 },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', rtl: false, priority: 70 },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', rtl: false, priority: 60 },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', rtl: false, priority: 50 },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', rtl: false, priority: 40 },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', rtl: false, priority: 30 },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', rtl: false, priority: 20 },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', rtl: false, priority: 10 }
];

const baseTranslations = [
  // Navigation
  { key: 'home', category: 'navigation', en: 'Home' },
  { key: 'products', category: 'navigation', en: 'Products' },
  { key: 'cart', category: 'navigation', en: 'Cart' },
  { key: 'orders', category: 'navigation', en: 'Orders' },
  { key: 'profile', category: 'navigation', en: 'Profile' },
  { key: 'login', category: 'navigation', en: 'Login' },
  { key: 'register', category: 'navigation', en: 'Register' },
  { key: 'logout', category: 'navigation', en: 'Logout' },
  
  // Common
  { key: 'welcome', category: 'common', en: 'Welcome to AggreKart' },
  { key: 'search', category: 'common', en: 'Search' },
  { key: 'filter', category: 'common', en: 'Filter' },
  { key: 'sort', category: 'common', en: 'Sort' },
  { key: 'loading', category: 'common', en: 'Loading...' },
  { key: 'save', category: 'common', en: 'Save' },
  { key: 'cancel', category: 'common', en: 'Cancel' },
  { key: 'delete', category: 'common', en: 'Delete' },
  { key: 'edit', category: 'common', en: 'Edit' },
  { key: 'add', category: 'common', en: 'Add' },
  { key: 'remove', category: 'common', en: 'Remove' },
  { key: 'yes', category: 'common', en: 'Yes' },
  { key: 'no', category: 'common', en: 'No' },
  { key: 'ok', category: 'common', en: 'OK' },
  { key: 'close', category: 'common', en: 'Close' },
  
  // Products
  { key: 'cement', category: 'product', en: 'Cement' },
  { key: 'bricks', category: 'product', en: 'Bricks' },
  { key: 'sand', category: 'product', en: 'Sand' },
  { key: 'aggregates', category: 'product', en: 'Aggregates' },
  { key: 'tmt_steel', category: 'product', en: 'TMT Steel' },
  { key: 'red_bricks', category: 'product', en: 'Red Bricks' },
  { key: 'cc_blocks', category: 'product', en: 'CC Blocks' },
  { key: 'price', category: 'product', en: 'Price' },
  { key: 'quantity', category: 'product', en: 'Quantity' },
  { key: 'in_stock', category: 'product', en: 'In Stock' },
  { key: 'out_of_stock', category: 'product', en: 'Out of Stock' },
  { key: 'add_to_cart', category: 'product', en: 'Add to Cart' },
  { key: 'buy_now', category: 'product', en: 'Buy Now' },
  
  // Orders
  { key: 'my_orders', category: 'order', en: 'My Orders' },
  { key: 'order_placed', category: 'order', en: 'Order Placed' },
  { key: 'order_confirmed', category: 'order', en: 'Order Confirmed' },
  { key: 'shipped', category: 'order', en: 'Shipped' },
  { key: 'delivered', category: 'order', en: 'Delivered' },
  { key: 'cancelled', category: 'order', en: 'Cancelled' },
  { key: 'track_order', category: 'order', en: 'Track Order' },
  { key: 'order_details', category: 'order', en: 'Order Details' },
  
  // Form
  { key: 'name', category: 'form', en: 'Name' },
  { key: 'email', category: 'form', en: 'Email' },
  { key: 'phone', category: 'form', en: 'Phone' },
  { key: 'address', category: 'form', en: 'Address' },
  { key: 'city', category: 'form', en: 'City' },
  { key: 'state', category: 'form', en: 'State' },
  { key: 'pincode', category: 'form', en: 'Pincode' },
  { key: 'password', category: 'form', en: 'Password' },
  { key: 'confirm_password', category: 'form', en: 'Confirm Password' },
  { key: 'submit', category: 'form', en: 'Submit' },
  
  // Payment
  { key: 'payment', category: 'payment', en: 'Payment' },
  { key: 'checkout', category: 'payment', en: 'Checkout' },
  { key: 'pay_now', category: 'payment', en: 'Pay Now' },
  { key: 'payment_success', category: 'payment', en: 'Payment Successful' },
  { key: 'payment_failed', category: 'payment', en: 'Payment Failed' },
  { key: 'total_amount', category: 'payment', en: 'Total Amount' },
  
  // Validation
  { key: 'required_field', category: 'validation', en: 'This field is required' },
  { key: 'invalid_email', category: 'validation', en: 'Please enter a valid email' },
  { key: 'invalid_phone', category: 'validation', en: 'Please enter a valid phone number' },
  { key: 'password_min_length', category: 'validation', en: 'Password must be at least 6 characters' },
  { key: 'passwords_not_match', category: 'validation', en: 'Passwords do not match' },
  
  // Error
  { key: 'something_went_wrong', category: 'error', en: 'Something went wrong' },
  { key: 'network_error', category: 'error', en: 'Network error. Please try again.' },
  { key: 'unauthorized', category: 'error', en: 'Unauthorized access' },
  { key: 'not_found', category: 'error', en: 'Not found' },
  { key: 'server_error', category: 'error', en: 'Server error. Please try again later.' }
];

async function seedLanguagesAndTranslations() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://devildecent716:UR0QPGzYtTWuz4JD@cluster0.8agmjlc.mongodb.net/test');
    console.log('Connected to MongoDB');

    // Clear existing data
    await Language.deleteMany({});
    await Translation.deleteMany({});
    console.log('Cleared existing languages and translations');

    // Insert languages
    await Language.insertMany(languages);
    console.log('✅ Languages seeded successfully');

    // Insert base translations for each language
    const translationsToInsert = [];
    
    // Create translations for each base translation key
    for (const translationData of baseTranslations) {
      const { key, category, en } = translationData;
      
      // Add English translation
      translationsToInsert.push({
        key: key,
        language: 'en',
        value: en,
        context: 'general',
        isAutoTranslated: false,
        needsReview: false
      });
      
      // Add basic Hindi translations (you can expand this)
      const hindiTranslations = {
        'home': 'होम',
        'products': 'उत्पाद',
        'cart': 'कार्ट',
        'orders': 'ऑर्डर',
        'profile': 'प्रोफ़ाइल',
        'login': 'लॉग इन',
        'register': 'रजिस्टर',
        'logout': 'लॉग आउट',
        'welcome': 'AggreKart में आपका स्वागत है',
        'search': 'खोजें',
        'save': 'सेव करें',
        'cancel': 'रद्द करें',
        'my_orders': 'मेरे ऑर्डर'
      };
      
      if (hindiTranslations[key]) {
        translationsToInsert.push({
          key: key,
          language: 'hi',
          value: hindiTranslations[key],
          context: 'general',
          isAutoTranslated: false,
          needsReview: false
        });
      }
      
      // Add basic Odia translations
      const odiaTranslations = {
        'home': 'ଘର',
        'products': 'ଉତ୍ପାଦ',
        'cart': 'କାର୍ଟ',
        'orders': 'ଅର୍ଡର',
        'profile': 'ପ୍ରୋଫାଇଲ',
        'login': 'ଲଗ୍ ଇନ୍',
        'register': 'ରେଜିଷ୍ଟର',
        'logout': 'ଲଗ୍ ଆଉଟ୍',
        'welcome': 'AggreKart ରେ ଆପଣଙ୍କୁ ସ୍ୱାଗତ',
        'search': 'ଖୋଜନ୍ତୁ',
        'save': 'ସେଭ୍ କରନ୍ତୁ',
        'cancel': 'ବାତିଲ୍',
        'my_orders': 'ମୋ ଅର୍ଡର'
      };
      
      if (odiaTranslations[key]) {
        translationsToInsert.push({
          key: key,
          language: 'or',
          value: odiaTranslations[key],
          context: 'general',
          isAutoTranslated: false,
          needsReview: false
        });
      }
    }

    // Insert all translations at once
    if (translationsToInsert.length > 0) {
      await Translation.insertMany(translationsToInsert);
      console.log(`✅ ${translationsToInsert.length} translations inserted successfully`);
    }

    console.log('🎉 Seeding completed successfully!');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  seedLanguagesAndTranslations();
}

module.exports = seedLanguagesAndTranslations;