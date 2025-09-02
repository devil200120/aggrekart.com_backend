const mongoose = require('mongoose');
const { runSeeding } = require('../utils/seedLanguages');
const translationService = require('../utils/translationService');
require('dotenv').config();

const initializeTranslations = async () => {
  try {
    console.log('🚀 Starting translation system initialization...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/aggrekart', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
    
    // Seed languages and base translations
    await runSeeding();
    
    // Auto-translate to other supported languages
    const supportedLanguageCodes = ['hi', 'or', 'te', 'bn', 'ta', 'gu', 'mr', 'kn', 'ml'];
    
    for (const langCode of supportedLanguageCodes) {
      console.log(`🔄 Auto-translating to ${langCode}...`);
      try {
        await translationService.autoTranslate(
          'nav.home', // Start with a simple translation
          langCode,
          'general',
          'Home'
        );
        console.log(`✅ Successfully initialized translations for ${langCode}`);
      } catch (error) {
        console.warn(`⚠️  Failed to auto-translate to ${langCode}:`, error.message);
      }
    }
    
    console.log('🎉 Translation system initialization completed!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Set up Google Cloud Translation API credentials');
    console.log('2. Add GOOGLE_CLOUD_PROJECT_ID to your .env file');
    console.log('3. Add GOOGLE_TRANSLATE_API_KEY to your .env file');
    console.log('4. Test the translation system in your application');
    
  } catch (error) {
    console.error('💥 Translation initialization failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔐 MongoDB connection closed');
  }
};

// Run the initialization
initializeTranslations();