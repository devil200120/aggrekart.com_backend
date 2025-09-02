const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { ErrorHandler } = require('./errorHandler');

// Configure Cloudinary
// Add configuration validation at the top after the config:

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Validate configuration
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error('❌ Cloudinary configuration missing! Please check environment variables:');
  console.error('- CLOUDINARY_CLOUD_NAME');
  console.error('- CLOUDINARY_API_KEY'); 
  console.error('- CLOUDINARY_API_SECRET');
} else {
  console.log('✅ Cloudinary configured successfully');
}

// Configure multer storage for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'aggrekart/products',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [
      { width: 800, height: 800, crop: 'limit', quality: 'auto' },
      { format: 'webp' }
    ]
  },
});

// Multer configuration
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024*1024, // 2MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new ErrorHandler('Only image files are allowed', 400), false);
    }
  },
});

// Upload single image
const uploadSingle = upload.single('image');

// Upload multiple images (max 5)
const uploadMultiple = upload.array('images', 5);
const uploadKnowMoreImages = (req, res, next) => {
  // Create know-more specific storage
  const knowMoreStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'aggrekart/know-more',
      allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
      transformation: [
        { width: 800, height: 600, crop: 'limit', quality: 'auto' },
        { format: 'webp' }
      ]
    },
  });

  const knowMoreUpload = multer({
    storage: knowMoreStorage,
    limits: {
      fileSize: 2 * 1024 * 1024, // 2MB limit
    },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new ErrorHandler('Only image files are allowed', 400), false);
      }
    },
  });

  const uploadMultipleKnowMore = knowMoreUpload.array('images', 10);
  
  uploadMultipleKnowMore(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ErrorHandler('File size too large. Maximum 2MB allowed.', 400));
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return next(new ErrorHandler('Too many files. Maximum 10 images allowed.', 400));
      }
      return next(new ErrorHandler(err.message, 400));
    } else if (err) {
      return next(err);
    }
    next();
  });
};

// Upload product images with error handling
const uploadProductImages = (req, res, next) => {
  uploadMultiple(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ErrorHandler('File size too large. Maximum 2MB allowed.', 400));
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return next(new ErrorHandler('Too many files. Maximum 5 images allowed.', 400));
      }
      return next(new ErrorHandler(err.message, 400));
    } else if (err) {
      return next(err);
    }
    next();
  });
};

// Delete image from Cloudinary
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary deletion error:', error);
    throw new ErrorHandler('Failed to delete image', 500);
  }
};

// Get optimized image URL
const getOptimizedImageUrl = (publicId, options = {}) => {
  const {
    width = 400,
    height = 400,
    quality = 'auto',
    format = 'webp'
  } = options;

  return cloudinary.url(publicId, {
    width,
    height,
    crop: 'fill',
    quality,
    format,
    secure: true
  });
};

module.exports = {
  cloudinary,
  uploadSingle,
  uploadMultiple,
  uploadProductImages,
  deleteImage,
  getOptimizedImageUrl,
  uploadKnowMoreImages // Add this line
};
