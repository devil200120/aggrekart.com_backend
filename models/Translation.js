const mongoose = require('mongoose');

const translationSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    maxlength: 200
  },
  language: {
    type: String,
    required: true,
    maxlength: 10
  },
  value: {
    type: String,
    required: true,
    maxlength: 5000
  },
  context: {
    type: String,
    maxlength: 100,
    default: 'general'
  },
  isAutoTranslated: {
    type: Boolean,
    default: false
  },
  needsReview: {
    type: Boolean,
    default: false
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Compound unique index
translationSchema.index({ key: 1, language: 1 }, { unique: true });
translationSchema.index({ language: 1, context: 1 });
translationSchema.index({ needsReview: 1 });

module.exports = mongoose.model('Translation', translationSchema);