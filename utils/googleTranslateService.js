const { Translate } = require('@google-cloud/translate').v2;

class GoogleTranslateService {
  constructor() {
    // Initialize Google Translate client
    this.translate = new Translate({
      // Option 1: Using environment variables (recommended for production)
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      
      // Option 2: Direct API key (easier for development)
      key: process.env.GOOGLE_TRANSLATE_API_KEY
    });

    // Supported languages for your construction materials platform
    this.supportedLanguages = [
      { code: 'en', name: 'English', nativeName: 'English', rtl: false },
      { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', rtl: false },
      { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', rtl: false },
      { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', rtl: false },
      { code: 'mr', name: 'Marathi', nativeName: 'मराठी', rtl: false },
      { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', rtl: false },
      { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', rtl: false },
      { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', rtl: false },
      { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', rtl: false },
      { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', rtl: false },
      { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', rtl: false },
      { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', rtl: false }
    ];
  }

  /**
   * Translate text to target language
   */
  async translateText(text, targetLanguage, sourceLanguage = 'auto') {
    try {
      if (!text || typeof text !== 'string') {
        throw new Error('Text must be a non-empty string');
      }

      if (targetLanguage === 'en' || targetLanguage === sourceLanguage) {
        return text; // No translation needed
      }

      const [translation] = await this.translate.translate(text, {
        from: sourceLanguage,
        to: targetLanguage,
      });

      return translation;
    } catch (error) {
      console.error('Translation error:', error);
      throw new Error(`Translation failed: ${error.message}`);
    }
  }

  /**
   * Translate multiple texts in batch
   */
  async translateBatch(texts, targetLanguage, sourceLanguage = 'auto') {
    try {
      if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error('Texts must be a non-empty array');
      }

      if (targetLanguage === 'en' || targetLanguage === sourceLanguage) {
        return texts; // No translation needed
      }

      const [translations] = await this.translate.translate(texts, {
        from: sourceLanguage,
        to: targetLanguage,
      });

      return Array.isArray(translations) ? translations : [translations];
    } catch (error) {
      console.error('Batch translation error:', error);
      throw new Error(`Batch translation failed: ${error.message}`);
    }
  }

  /**
   * Translate object with nested strings
   */
  async translateObject(obj, targetLanguage, sourceLanguage = 'auto') {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const result = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && value.trim()) {
        try {
          result[key] = await this.translateText(value, targetLanguage, sourceLanguage);
        } catch (error) {
          console.warn(`Failed to translate key ${key}:`, error.message);
          result[key] = value; // Fallback to original
        }
      } else if (typeof value === 'object' && value !== null) {
        result[key] = await this.translateObject(value, targetLanguage, sourceLanguage);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Detect language of text
   */
  async detectLanguage(text) {
    try {
      if (!text || typeof text !== 'string') {
        throw new Error('Text must be a non-empty string');
      }

      const [detection] = await this.translate.detect(text);
      return {
        language: detection.language,
        confidence: detection.confidence
      };
    } catch (error) {
      console.error('Language detection error:', error);
      throw new Error(`Language detection failed: ${error.message}`);
    }
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages() {
    return this.supportedLanguages;
  }

  /**
   * Check if language is supported
   */
  isLanguageSupported(languageCode) {
    return this.supportedLanguages.some(lang => lang.code === languageCode);
  }

  /**
   * Get language info by code
   */
  getLanguageInfo(languageCode) {
    return this.supportedLanguages.find(lang => lang.code === languageCode);
  }
}

module.exports = new GoogleTranslateService();