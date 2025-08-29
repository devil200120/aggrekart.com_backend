const { Translate } = require('@google-cloud/translate').v2;
const NodeCache = require('node-cache');
const Translation = require('../models/Translation');
const Language = require('../models/Language');

// Initialize Google Cloud Translate
const translate = new Translate({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || undefined,
  key: process.env.GOOGLE_TRANSLATE_API_KEY || undefined
});

// Cache for translations (TTL: 1 hour)
const translationCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

class TranslationService {
  constructor() {
    this.supportedLanguages = new Map();
    this.loadSupportedLanguages();
  }

  async loadSupportedLanguages() {
    try {
      const languages = await Language.find({ isActive: true });
      languages.forEach(lang => {
        this.supportedLanguages.set(lang.code, lang);
      });
    } catch (error) {
      console.error('Failed to load supported languages:', error);
    }
  }

  /**
   * Get translation for a key in specified language
   */
  async getTranslation(key, targetLanguage = 'en', context = 'general') {
    try {
      // Check cache first
      const cacheKey = `${key}_${targetLanguage}_${context}`;
      const cached = translationCache.get(cacheKey);
      if (cached) return cached;

      // Check database
      let translation = await Translation.findOne({
        key,
        language: targetLanguage,
        context
      });

      if (!translation) {
        // Auto-translate if not found
        translation = await this.autoTranslate(key, targetLanguage, context);
      }

      const result = translation ? translation.value : key;
      translationCache.set(cacheKey, result);
      return result;

    } catch (error) {
      console.error('Translation error:', error);
      return key; // Fallback to key
    }
  }

  /**
   * Get multiple translations at once
   */
  async getTranslations(keys, targetLanguage = 'en', context = 'general') {
    try {
      const translations = {};
      const missingKeys = [];

      // Check cache and database
      for (const key of keys) {
        const cacheKey = `${key}_${targetLanguage}_${context}`;
        const cached = translationCache.get(cacheKey);
        
        if (cached) {
          translations[key] = cached;
        } else {
          missingKeys.push(key);
        }
      }

      if (missingKeys.length > 0) {
        // Get from database
        const dbTranslations = await Translation.find({
          key: { $in: missingKeys },
          language: targetLanguage,
          context
        });

        const foundKeys = new Set();
        dbTranslations.forEach(t => {
          translations[t.key] = t.value;
          foundKeys.add(t.key);
          const cacheKey = `${t.key}_${targetLanguage}_${context}`;
          translationCache.set(cacheKey, t.value);
        });

        // Auto-translate missing ones
        const stillMissing = missingKeys.filter(key => !foundKeys.has(key));
        if (stillMissing.length > 0) {
          const autoTranslated = await this.bulkAutoTranslate(stillMissing, targetLanguage, context);
          Object.assign(translations, autoTranslated);
        }
      }

      return translations;
    } catch (error) {
      console.error('Bulk translation error:', error);
      const fallback = {};
      keys.forEach(key => fallback[key] = key);
      return fallback;
    }
  }

  /**
   * Auto-translate using Google Cloud Translation
   */
  async autoTranslate(key, targetLanguage, context = 'general', sourceText = null) {
    try {
      if (targetLanguage === 'en') {
        // If target is English, save the key as is
        const translation = new Translation({
          key,
          language: targetLanguage,
          value: sourceText || key,
          context,
          isAutoTranslated: false
        });
        await translation.save();
        return translation;
      }

      // Get source text (English version)
      let textToTranslate = sourceText || key;
      if (!sourceText) {
        const englishTranslation = await Translation.findOne({
          key,
          language: 'en',
          context
        });
        if (englishTranslation) {
          textToTranslate = englishTranslation.value;
        }
      }

      // Translate using Google Cloud
      const [translatedText] = await translate.translate(textToTranslate, {
        from: 'en',
        to: targetLanguage
      });

      // Save to database
      const translation = new Translation({
        key,
        language: targetLanguage,
        value: translatedText,
        context,
        isAutoTranslated: true,
        needsReview: true
      });
      
      await translation.save();
      return translation;

    } catch (error) {
      console.error('Auto-translation error:', error);
      
      // Create fallback entry
      const translation = new Translation({
        key,
        language: targetLanguage,
        value: sourceText || key,
        context,
        isAutoTranslated: false,
        needsReview: true
      });
      
      try {
        await translation.save();
      } catch (saveError) {
        console.error('Failed to save fallback translation:', saveError);
      }
      
      return translation;
    }
  }

  /**
   * Bulk auto-translate multiple keys
   */
  async bulkAutoTranslate(keys, targetLanguage, context = 'general') {
    try {
      const translations = {};
      const textsToTranslate = [];
      const keyMapping = [];

      // Prepare texts for translation
      for (const key of keys) {
        let textToTranslate = key;
        
        // Try to get English version first
        const englishTranslation = await Translation.findOne({
          key,
          language: 'en',
          context
        });
        
        if (englishTranslation) {
          textToTranslate = englishTranslation.value;
        }
        
        textsToTranslate.push(textToTranslate);
        keyMapping.push(key);
      }

      if (targetLanguage === 'en') {
        // Save English versions
        for (let i = 0; i < keys.length; i++) {
          translations[keys[i]] = textsToTranslate[i];
          try {
            const translation = new Translation({
              key: keys[i],
              language: targetLanguage,
              value: textsToTranslate[i],
              context,
              isAutoTranslated: false
            });
            await translation.save();
          } catch (error) {
            console.error('Error saving English translation:', error);
          }
        }
        return translations;
      }

      // Translate all texts
      const [translatedTexts] = await translate.translate(textsToTranslate, {
        from: 'en',
        to: targetLanguage
      });

      // Save translations
      for (let i = 0; i < keys.length; i++) {
        const key = keyMapping[i];
        const translatedText = Array.isArray(translatedTexts) ? translatedTexts[i] : translatedTexts;
        
        translations[key] = translatedText;
        
        try {
          const translation = new Translation({
            key,
            language: targetLanguage,
            value: translatedText,
            context,
            isAutoTranslated: true,
            needsReview: true
          });
          await translation.save();
          
          // Cache it
          const cacheKey = `${key}_${targetLanguage}_${context}`;
          translationCache.set(cacheKey, translatedText);
        } catch (error) {
          console.error('Error saving translation:', error);
        }
      }

      return translations;
    } catch (error) {
      console.error('Bulk auto-translation error:', error);
      const fallback = {};
      keys.forEach(key => fallback[key] = key);
      return fallback;
    }
  }

  /**
   * Update or create translation
   */
  async updateTranslation(key, language, value, context = 'general', userId = null) {
    try {
      const translation = await Translation.findOneAndUpdate(
        { key, language, context },
        { 
          value, 
          isAutoTranslated: false,
          needsReview: false,
          lastModifiedBy: userId
        },
        { upsert: true, new: true }
      );

      // Update cache
      const cacheKey = `${key}_${language}_${context}`;
      translationCache.set(cacheKey, value);

      return translation;
    } catch (error) {
      console.error('Update translation error:', error);
      throw error;
    }
  }

  /**
   * Delete translation from cache
   */
  clearCache(key = null, language = null, context = null) {
    if (key && language && context) {
      const cacheKey = `${key}_${language}_${context}`;
      translationCache.del(cacheKey);
    } else {
      translationCache.flushAll();
    }
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages() {
    return Array.from(this.supportedLanguages.values());
  }

  /**
   * Detect language of text
   */
  async detectLanguage(text) {
    try {
      const [detection] = await translate.detect(text);
      return detection;
    } catch (error) {
      console.error('Language detection error:', error);
      return { language: 'en', confidence: 0 };
    }
  }
}

module.exports = new TranslationService();