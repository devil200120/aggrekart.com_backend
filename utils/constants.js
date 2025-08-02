// Application constants

const USER_ROLES = {
  CUSTOMER: 'customer',
  SUPPLIER: 'supplier',
  ADMIN: 'admin'
};

const CUSTOMER_TYPES = {
  HOUSE_OWNER: 'house_owner',
  MASON: 'mason',
  BUILDER_CONTRACTOR: 'builder_contractor',
  OTHERS: 'others'
};

const MEMBERSHIP_TIERS = {
  SILVER: 'silver',
  GOLD: 'gold',
  PLATINUM: 'platinum'
};

const PRODUCT_CATEGORIES = {
  AGGREGATE: 'aggregate',
  SAND: 'sand',
  TMT_STEEL: 'tmt_steel',
  BRICKS_BLOCKS: 'bricks_blocks',
  CEMENT: 'cement'
};

const ORDER_STATUS = {
  PENDING: 'pending',
  PREPARING: 'preparing',
  PROCESSING: 'processing',
  DISPATCHED: 'dispatched',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  MATERIAL_LOADING: 'material_loading' // New status for 2-hour cooling period
};

const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded'
};

const UNITS = {
  METRIC_TONS: 'MT',
  BAGS: 'bags',
  NUMBERS: 'numbers'
};

// Indian States with GST codes for supplier registration
const INDIAN_STATES = [
  { code: '01', name: 'Jammu and Kashmir', gstCode: '01' },
  { code: '02', name: 'Himachal Pradesh', gstCode: '02' },
  { code: '03', name: 'Punjab', gstCode: '03' },
  { code: '04', name: 'Chandigarh', gstCode: '04' },
  { code: '05', name: 'Uttarakhand', gstCode: '05' },
  { code: '06', name: 'Haryana', gstCode: '06' },
  { code: '07', name: 'Delhi', gstCode: '07' },
  { code: '08', name: 'Rajasthan', gstCode: '08' },
  { code: '09', name: 'Uttar Pradesh', gstCode: '09' },
  { code: '10', name: 'Bihar', gstCode: '10' },
  { code: '11', name: 'Sikkim', gstCode: '11' },
  { code: '12', name: 'Arunachal Pradesh', gstCode: '12' },
  { code: '13', name: 'Nagaland', gstCode: '13' },
  { code: '14', name: 'Manipur', gstCode: '14' },
  { code: '15', name: 'Mizoram', gstCode: '15' },
  { code: '16', name: 'Tripura', gstCode: '16' },
  { code: '17', name: 'Meghalaya', gstCode: '17' },
  { code: '18', name: 'Assam', gstCode: '18' },
  { code: '19', name: 'West Bengal', gstCode: '19' },
  { code: '20', name: 'Jharkhand', gstCode: '20' },
  { code: '21', name: 'Odisha', gstCode: '21' },
  { code: '22', name: 'Chhattisgarh', gstCode: '22' },
  { code: '23', name: 'Madhya Pradesh', gstCode: '23' },
  { code: '24', name: 'Gujarat', gstCode: '24' },
  { code: '25', name: 'Daman and Diu', gstCode: '25' },
  { code: '26', name: 'Dadra and Nagar Haveli', gstCode: '26' },
  { code: '27', name: 'Maharashtra', gstCode: '27' },
  { code: '28', name: 'Andhra Pradesh', gstCode: '28' },
  { code: '29', name: 'Karnataka', gstCode: '29' },
  { code: '30', name: 'Goa', gstCode: '30' },
  { code: '31', name: 'Lakshadweep', gstCode: '31' },
  { code: '32', name: 'Kerala', gstCode: '32' },
  { code: '33', name: 'Tamil Nadu', gstCode: '33' },
  { code: '34', name: 'Puducherry', gstCode: '34' },
  { code: '35', name: 'Andaman and Nicobar Islands', gstCode: '35' },
  { code: '36', name: 'Telangana', gstCode: '36' },
  { code: '37', name: 'Andhra Pradesh (New)', gstCode: '37' },
  { code: '38', name: 'Ladakh', gstCode: '38' }
];

// Product management permissions
const PRODUCT_PERMISSIONS = {
  ADMIN: {
    CREATE_BASE_PRODUCT: true,
    UPLOAD_IMAGES: true,
    APPROVE_PRODUCTS: true,
    SET_CATEGORIES: true,
    MANAGE_ALL: true
  },
  SUPPLIER: {
    SET_PRICING: true,
    SET_DELIVERY_TIME: true,
    UPDATE_STOCK: true,
    VIEW_OWN_PRODUCTS: true,
    REQUEST_APPROVAL: true
  }
};

// Order material loading cooling period (in milliseconds)
const MATERIAL_LOADING_COOLING_PERIOD = 2 * 60 * 60 * 1000; // 2 hours

module.exports = {
  USER_ROLES,
  CUSTOMER_TYPES,
  MEMBERSHIP_TIERS,
  PRODUCT_CATEGORIES,
  ORDER_STATUS,
  PAYMENT_STATUS,
  UNITS,
  INDIAN_STATES,
  PRODUCT_PERMISSIONS,
  MATERIAL_LOADING_COOLING_PERIOD
};
