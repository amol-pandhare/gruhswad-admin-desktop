ALTER TABLE menu_categories ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE menu_categories ADD COLUMN updated_at TEXT;
ALTER TABLE menu_items ADD COLUMN item_type TEXT NOT NULL DEFAULT 'dish';
ALTER TABLE menu_items ADD COLUMN is_new INTEGER NOT NULL DEFAULT 0;
ALTER TABLE menu_items ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE menu_items ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE menu_items ADD COLUMN archived_at TEXT;
ALTER TABLE menu_items ADD COLUMN updated_at TEXT;

CREATE TABLE IF NOT EXISTS bundle_option_groups (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  min_choices INTEGER NOT NULL DEFAULT 1,
  max_choices INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bundle_option_choices (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES bundle_option_groups(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES menu_items(id),
  upgrade_price REAL NOT NULL DEFAULT 0,
  available INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS app_settings (
  settings_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS current_publication (
  publication_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  published_at TEXT
);

CREATE TABLE IF NOT EXISTS cloud_customers (
  id TEXT PRIMARY KEY,
  firebase_uid TEXT,
  phone_e164 TEXT NOT NULL,
  name TEXT NOT NULL,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cloud_customer_addresses (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  place_id TEXT NOT NULL,
  formatted_address TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  country TEXT NOT NULL,
  is_default INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cloud_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  customer_id TEXT,
  publication_key TEXT NOT NULL,
  service_date TEXT NOT NULL,
  fulfilment TEXT NOT NULL,
  customer_snapshot TEXT NOT NULL,
  address_snapshot TEXT NOT NULL,
  source_mode TEXT NOT NULL,
  subtotal REAL NOT NULL,
  total REAL NOT NULL,
  notes TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cloud_order_lines (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES cloud_orders(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  item_snapshot TEXT NOT NULL,
  bundle_selection TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_total REAL NOT NULL,
  line_total REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS cloud_order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES cloud_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  base_hash TEXT,
  base_payload TEXT,
  remote_version TEXT,
  dirty INTEGER NOT NULL DEFAULT 0,
  last_pulled_at TEXT,
  last_pushed_at TEXT,
  PRIMARY KEY(entity_type, entity_id)
);
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  base_payload TEXT,
  local_payload TEXT NOT NULL,
  remote_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution TEXT
);
CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_cloud_orders_created ON cloud_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_events_order ON cloud_order_events(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_state_dirty ON sync_state(dirty, entity_type);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_open ON sync_conflicts(resolved_at, entity_type);

INSERT OR IGNORE INTO app_settings(settings_key,payload) VALUES
('site','{"brandName":"Gruhswad","tagline":"Taste of Home","mobile":"8123415647","orderCutoff":"Order before 9:00 PM for next-day delivery"}'),
('operations','{"open":true,"message":"","pickupEnabled":true,"deliveryEnabled":false}'),
('service_area','{"pickupCities":["Bengaluru"],"pickupState":"Karnataka","pickupCountry":"India","kitchenPlaceId":"","kitchenLatitude":null,"kitchenLongitude":null,"deliveryRadiusKm":5}'),
('ordering_platforms','[]'),
('public_location','{"enabled":false,"name":"","address":"","mapQuery":"","googleMapsUrl":"","directions":""}');
