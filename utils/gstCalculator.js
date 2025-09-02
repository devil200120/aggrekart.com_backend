const { INDIAN_STATES } = require('./constants');

// GST rates configuration
const GST_RATES = {
  STANDARD: 18, // Most construction materials
  REDUCED: 12,  // Some materials
  LOW: 5,       // Basic items
  ZERO: 0       // Essential items
};

// Get GST rate based on product category
const getGSTRateByCategory = (category) => {
  const categoryRates = {
    'cement': GST_RATES.STANDARD,
    'steel': GST_RATES.STANDARD,
    'bricks': GST_RATES.REDUCED,
    'sand': GST_RATES.LOW,
    'aggregates': GST_RATES.LOW,
    'blocks': GST_RATES.STANDARD,
    'default': GST_RATES.STANDARD
  };
  
  return categoryRates[category?.toLowerCase()] || categoryRates.default;
};

// Calculate GST breakdown based on customer and supplier states
const calculateGST = (amount, customerState, supplierState, productCategory = 'default') => {
  const gstRate = getGSTRateByCategory(productCategory);
  const gstAmount = Math.round((amount * gstRate) / 100);
  
  // Check if it's intra-state or inter-state transaction
  const isIntraState = customerState === supplierState;
  
  if (isIntraState) {
    // Intra-state: CGST + SGST
    const cgstRate = gstRate / 2;
    const sgstRate = gstRate / 2;
    const cgstAmount = Math.round((amount * cgstRate) / 100);
    const sgstAmount = Math.round((amount * sgstRate) / 100);
    
    return {
      type: 'intra-state',
      totalGstRate: gstRate,
      totalGstAmount: cgstAmount + sgstAmount,
      cgst: {
        rate: cgstRate,
        amount: cgstAmount
      },
      sgst: {
        rate: sgstRate,
        amount: sgstAmount,
        state: customerState
      },
      igst: null,
      breakdown: `CGST (${cgstRate}%): ₹${cgstAmount.toLocaleString()} + SGST (${sgstRate}%): ₹${sgstAmount.toLocaleString()}`
    };
  } else {
    // Inter-state: IGST
    return {
      type: 'inter-state',
      totalGstRate: gstRate,
      totalGstAmount: gstAmount,
      cgst: null,
      sgst: null,
      igst: {
        rate: gstRate,
        amount: gstAmount
      },
      breakdown: `IGST (${gstRate}%): ₹${gstAmount.toLocaleString()}`
    };
  }
};

// Get state name from GST code
const getStateNameFromGSTCode = (gstCode) => {
  const state = INDIAN_STATES.find(state => state.gstCode === gstCode || state.code === gstCode);
  return state ? state.name : 'Unknown State';
};

// Extract state code from GST number
const extractStateFromGST = (gstNumber) => {
  if (!gstNumber || gstNumber.length < 2) return null;
  const stateCode = gstNumber.substring(0, 2);
  return getStateNameFromGSTCode(stateCode);
};

module.exports = {
  GST_RATES,
  getGSTRateByCategory,
  calculateGST,
  getStateNameFromGSTCode,
  extractStateFromGST
};