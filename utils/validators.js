const validator = require('validator');

// Custom validation functions
const validateGST = (gstNumber) => {
  if (!gstNumber) return true; // Optional field
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstNumber);
};

const validatePAN = (panNumber) => {
  if (!panNumber) return true; // Optional field
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber);
};

const validateIndianPhone = (phoneNumber) => {
  return /^[6-9]\d{9}$/.test(phoneNumber);
};

const validatePincode = (pincode) => {
  return /^[1-9][0-9]{5}$/.test(pincode);
};

const validateIFSC = (ifscCode) => {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode);
};

const validateUPI = (upiId) => {
  return /^[\w\.\-_]{3,}@[a-zA-Z]{3,}$/.test(upiId);
};

const validateEmail = (email) => {
  return validator.isEmail(email);
};

const validateBankAccount = (accountNumber) => {
  // Indian bank account numbers are typically 9-18 digits
  return /^\d{9,18}$/.test(accountNumber);
};

const validateVehicleNumber = (vehicleNumber) => {
  // Indian vehicle number format: XX00XX0000 or XX-00-XX-0000
  return /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/.test(vehicleNumber.replace(/-/g, ''));
};

const validateAadhaar = (aadhaarNumber) => {
  // Aadhaar is 12 digits
  return /^\d{12}$/.test(aadhaarNumber);
};

const validateLatitude = (lat) => {
  const latitude = parseFloat(lat);
  return !isNaN(latitude) && latitude >= -90 && latitude <= 90;
};

const validateLongitude = (lng) => {
  const longitude = parseFloat(lng);
  return !isNaN(longitude) && longitude >= -180 && longitude <= 180;
};

// Company/Business name validation
const validateCompanyName = (name) => {
  // Should be at least 2 characters, can contain letters, numbers, spaces, and common business punctuation
  return /^[a-zA-Z0-9\s\.\-\(\)&]{2,100}$/.test(name);
};

// Address validation
const validateAddress = (address) => {
  // Should be at least 10 characters
  return address && address.trim().length >= 10;
};

// Indian state validation
const validateIndianState = (state) => {
  const indianStates = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
    'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
    'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
    'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
    'Dadra and Nagar Haveli', 'Daman and Diu', 'Delhi', 'Jammu and Kashmir',
    'Ladakh', 'Lakshadweep', 'Puducherry'
  ];
  
  return indianStates.includes(state);
};

// Password strength validation
const validatePassword = (password) => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/.test(password);
};

// URL validation
const validateURL = (url) => {
  return validator.isURL(url, {
    protocols: ['http', 'https'],
    require_protocol: true
  });
};

// File type validation
const validateImageFile = (filename) => {
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return allowedExtensions.includes(extension);
};

const validateDocumentFile = (filename) => {
  const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
  const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return allowedExtensions.includes(extension);
};

// Business hours validation
const validateBusinessHours = (time) => {
  // Format: HH:MM (24-hour format)
  return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
};

// Quantity validation
const validateQuantity = (quantity, unit) => {
  const qty = parseFloat(quantity);
  if (isNaN(qty) || qty <= 0) return false;
  
  // Different minimum quantities based on unit
  switch (unit) {
    case 'MT':
      return qty >= 0.1; // Minimum 100kg
    case 'bags':
      return qty >= 1; // Minimum 1 bag
    case 'numbers':
      return qty >= 1; // Minimum 1 piece
    default:
      return qty > 0;
  }
};

// Price validation
const validatePrice = (price) => {
  const priceNum = parseFloat(price);
  return !isNaN(priceNum) && priceNum > 0 && priceNum <= 1000000; // Max 10 lakh
};

// Percentage validation
const validatePercentage = (percentage, min = 0, max = 100) => {
  const pct = parseFloat(percentage);
  return !isNaN(pct) && pct >= min && pct <= max;
};

// Custom validation for Indian cities
const validateIndianCity = (city) => {
  // Basic validation - should be alphabetic characters and spaces
  return /^[a-zA-Z\s]{2,50}$/.test(city);
};

module.exports = {
  validateGST,
  validatePAN,
  validateIndianPhone,
  validatePincode,
  validateIFSC,
  validateUPI,
  validateEmail,
  validateBankAccount,
  validateVehicleNumber,
  validateAadhaar,
  validateLatitude,
  validateLongitude,
  validateCompanyName,
  validateAddress,
  validateIndianState,
  validatePassword,
  validateURL,
  validateImageFile,
  validateDocumentFile,
  validateBusinessHours,
  validateQuantity,
  validatePrice,
  validatePercentage,
  validateIndianCity
};