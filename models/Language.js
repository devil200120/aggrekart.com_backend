const mongoose = require('mongoose');

const languageSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    maxlength: 10
  },
  name: {
    type: String,
    required: true,
    maxlength: 50
  },
  nativeName: {
    type: String,
    required: true,
    maxlength: 50
  },
  isRTL: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  flag: {
    type: String,
    maxlength: 10
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

languageSchema.index({ code: 1 });
languageSchema.index({ isActive: 1, order: 1 });

module.exports = mongoose.model('Language', languageSchema);