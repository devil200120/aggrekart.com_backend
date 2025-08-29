const express = require('express');
const router = express.Router();
const Language = require('../models/Language');
const Translation = require('../models/Translation');
const translationService = require('../utils/translationService');
const { auth, authorize } = require('../middleware/auth'); // Import both auth and authorize
const { body, validationResult, query } = require('express-validator');

// Get supported languages
router.get('/languages', async (req, res) => {
  try {
    const languages = await Language.find({ isActive: true })
      .sort({ order: 1, name: 1 })
      .select('code name nativeName isRTL flag');

    res.json({
      success: true,
      data: languages
    });
  } catch (error) {
    console.error('Error fetching languages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch supported languages'
    });
  }
});

// Get translations for a specific language
router.get('/:language', [
  query('keys').optional().isString(),
  query('context').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { language } = req.params;
    const { keys, context = 'general' } = req.query;

    if (keys) {
      // Get specific translations
      const keyArray = keys.split(',').map(k => k.trim());
      const translations = await translationService.getTranslations(keyArray, language, context);
      
      return res.json({
        success: true,
        data: translations
      });
    }

    // Get all translations for the language
    const translations = await Translation.find({ language, context })
      .select('key value context isAutoTranslated needsReview')
      .lean();

    const result = {};
    translations.forEach(t => {
      result[t.key] = t.value;
    });

    res.json({
      success: true,
      data: result,
      meta: {
        language,
        context,
        count: translations.length
      }
    });
  } catch (error) {
    console.error('Error fetching translations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch translations'
    });
  }
});

// Get single translation
router.get('/:language/:key', async (req, res) => {
  try {
    const { language, key } = req.params;
    const { context = 'general' } = req.query;

    const translation = await translationService.getTranslation(key, language, context);

    res.json({
      success: true,
      data: {
        key,
        language,
        value: translation,
        context
      }
    });
  } catch (error) {
    console.error('Error fetching translation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch translation'
    });
  }
});

// Update translation (Admin only)
router.put('/:language/:key', authorize('admin'), [
  body('value').notEmpty().isLength({ max: 5000 }).withMessage('Translation value is required and must be less than 5000 characters'),
  body('context').optional().isString().isLength({ max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { language, key } = req.params;
    const { value, context = 'general' } = req.body;

    const translation = await translationService.updateTranslation(
      key, 
      language, 
      value, 
      context, 
      req.user.id
    );

    res.json({
      success: true,
      data: translation,
      message: 'Translation updated successfully'
    });
  } catch (error) {
    console.error('Error updating translation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update translation'
    });
  }
});

// Batch update translations (Admin only)
router.post('/batch-update', authorize('admin'), [
  body('translations').isArray().withMessage('Translations must be an array'),
  body('translations.*.key').notEmpty().withMessage('Translation key is required'),
  body('translations.*.language').notEmpty().withMessage('Language is required'),
  body('translations.*.value').notEmpty().withMessage('Translation value is required'),
  body('translations.*.context').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { translations } = req.body;
    const results = [];

    for (const trans of translations) {
      try {
        const result = await translationService.updateTranslation(
          trans.key,
          trans.language,
          trans.value,
          trans.context || 'general',
          req.user.id
        );
        results.push({ success: true, translation: result });
      } catch (error) {
        results.push({ 
          success: false, 
          key: trans.key, 
          language: trans.language,
          error: error.message 
        });
      }
    }

    res.json({
      success: true,
      data: results,
      message: 'Batch translation update completed'
    });
  } catch (error) {
    console.error('Error in batch translation update:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update translations'
    });
  }
});

// Auto-translate missing translations (Admin only)
router.post('/auto-translate', authorize('admin'), [
  body('sourceLanguage').notEmpty().withMessage('Source language is required'),
  body('targetLanguage').notEmpty().withMessage('Target language is required'),
  body('keys').optional().isArray().withMessage('Keys must be an array if provided'),
  body('context').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { sourceLanguage, targetLanguage, keys, context = 'general' } = req.body;

    if (sourceLanguage === targetLanguage) {
      return res.status(400).json({
        success: false,
        message: 'Source and target languages cannot be the same'
      });
    }

    let keysToTranslate = keys;
    
    if (!keysToTranslate) {
      // Get all keys that exist in source language but not in target language
      const sourceTranslations = await Translation.find({ 
        language: sourceLanguage, 
        context 
      }).select('key');
      
      const existingTargetKeys = await Translation.find({ 
        language: targetLanguage, 
        context 
      }).select('key');
      
      const existingTargetKeySet = new Set(existingTargetKeys.map(t => t.key));
      keysToTranslate = sourceTranslations
        .map(t => t.key)
        .filter(key => !existingTargetKeySet.has(key));
    }

    if (keysToTranslate.length === 0) {
      return res.json({
        success: true,
        message: 'No translations needed',
        data: { translated: 0 }
      });
    }

    const translations = await translationService.bulkAutoTranslate(
      keysToTranslate, 
      targetLanguage, 
      context
    );

    res.json({
      success: true,
      data: {
        translated: Object.keys(translations).length,
        translations
      },
      message: `Auto-translated ${Object.keys(translations).length} entries`
    });
  } catch (error) {
    console.error('Error in auto-translation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to auto-translate'
    });
  }
});

// Update user language preference
router.patch('/user/language', auth, [ // Add auth middleware first
  body('language').notEmpty().isString().withMessage('Language is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { language } = req.body;
    const User = require('../models/User');

    // Verify language is supported
    const supportedLanguage = await Language.findOne({ code: language, isActive: true });
    if (!supportedLanguage) {
      return res.status(400).json({
        success: false,
        message: 'Unsupported language'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id, // Use _id instead of id for MongoDB
      { preferredLanguage: language },
      { new: true }
    ).select('preferredLanguage');

    res.json({
      success: true,
      data: user,
      message: 'Language preference updated successfully'
    });
  } catch (error) {
    console.error('Error updating user language:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update language preference'
    });
  }
});

module.exports = router;