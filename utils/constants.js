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
  CANCELLED: 'cancelled'
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

module.exports = {
  USER_ROLES,
  CUSTOMER_TYPES,
  MEMBERSHIP_TIERS,
  PRODUCT_CATEGORIES,
  ORDER_STATUS,
  PAYMENT_STATUS,
  UNITS
};