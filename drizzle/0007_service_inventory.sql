ALTER TABLE orders ADD COLUMN order_number TEXT;
ALTER TABLE orders ADD COLUMN service_type TEXT NOT NULL DEFAULT 'general' CHECK(service_type IN ('general','party','bulk','tiffin-cycle'));
ALTER TABLE orders ADD COLUMN service_end_date TEXT;
ALTER TABLE orders ADD COLUMN service_start_time TEXT;
ALTER TABLE orders ADD COLUMN service_end_time TEXT;
ALTER TABLE orders ADD COLUMN enquiry_id TEXT;
ALTER TABLE orders ADD COLUMN enquiry_reference TEXT;
ALTER TABLE orders ADD COLUMN tiffin_plan_id TEXT;
ALTER TABLE orders ADD COLUMN adjustment_label TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN adjustment_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN ingredient_cost REAL NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN enquiry_sync_pending INTEGER NOT NULL DEFAULT 0;

UPDATE orders SET order_number='MAN-' || UPPER(SUBSTR(REPLACE(id,'-',''),1,8)) WHERE order_number IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_enquiry ON orders(enquiry_id) WHERE enquiry_id IS NOT NULL;

CREATE TABLE unified_payments (
  id TEXT PRIMARY KEY,
  order_kind TEXT NOT NULL CHECK(order_kind IN ('online','local')),
  order_id TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount > 0),
  occurred_at TEXT NOT NULL,
  method TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('received','refunded')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
INSERT INTO unified_payments(id,order_kind,order_id,amount,occurred_at,method,direction,notes,created_at)
SELECT id,'local',order_id,amount,received_at,method,CASE status WHEN 'refunded' THEN 'refunded' ELSE 'received' END,'',received_at FROM payments;
CREATE INDEX idx_unified_payments_order ON unified_payments(order_kind,order_id);
CREATE INDEX idx_unified_payments_date ON unified_payments(occurred_at);

CREATE TABLE tiffin_plans (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  enquiry_id TEXT UNIQUE,
  enquiry_reference TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  weekdays TEXT NOT NULL,
  meal_slots TEXT NOT NULL,
  people_count INTEGER NOT NULL CHECK(people_count BETWEEN 1 AND 500),
  cadence TEXT NOT NULL CHECK(cadence IN ('weekly','monthly')),
  fulfilment TEXT NOT NULL CHECK(fulfilment IN ('pickup','delivery')),
  address TEXT NOT NULL DEFAULT '',
  dietary_notes TEXT NOT NULL DEFAULT '',
  routine_notes TEXT NOT NULL DEFAULT '',
  default_unit_price REAL NOT NULL CHECK(default_unit_price >= 0),
  recipe_id TEXT,
  adjustment_label TEXT NOT NULL DEFAULT '',
  adjustment_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('active','paused','completed','cancelled')),
  next_cycle_start TEXT NOT NULL,
  enquiry_sync_pending INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE stock_items (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  base_unit TEXT NOT NULL CHECK(base_unit IN ('g','ml','unit')),
  reorder_level REAL NOT NULL DEFAULT 0 CHECK(reorder_level >= 0),
  on_hand REAL NOT NULL DEFAULT 0,
  reserved REAL NOT NULL DEFAULT 0 CHECK(reserved >= 0),
  average_cost REAL NOT NULL DEFAULT 0 CHECK(average_cost >= 0),
  preferred_supplier TEXT NOT NULL DEFAULT '',
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  yield_quantity REAL NOT NULL CHECK(yield_quantity > 0),
  serving_basis TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  youtube_video_id TEXT,
  youtube_display_url TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE recipe_ingredients (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL REFERENCES stock_items(id),
  quantity REAL NOT NULL CHECK(quantity > 0),
  UNIQUE(recipe_id,stock_item_id)
);
CREATE TABLE catalog_item_recipes (
  menu_item_id TEXT PRIMARY KEY REFERENCES menu_items(id),
  recipe_id TEXT NOT NULL REFERENCES recipes(id)
);
ALTER TABLE order_lines ADD COLUMN recipe_snapshot TEXT;
ALTER TABLE order_lines ADD COLUMN consumption_mode TEXT NOT NULL DEFAULT 'none' CHECK(consumption_mode IN ('recipe','manual','none'));

CREATE TABLE stock_reservations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL REFERENCES stock_items(id),
  quantity REAL NOT NULL CHECK(quantity > 0),
  recipe_snapshot TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(order_id,stock_item_id)
);
CREATE TABLE stock_ledger (
  id TEXT PRIMARY KEY,
  stock_item_id TEXT NOT NULL REFERENCES stock_items(id),
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('receipt','consumption','return','wastage','adjustment','reversal')),
  quantity_delta REAL NOT NULL CHECK(quantity_delta <> 0),
  unit_cost REAL NOT NULL DEFAULT 0 CHECK(unit_cost >= 0),
  order_id TEXT,
  purchase_id TEXT,
  reason TEXT NOT NULL DEFAULT '',
  override_reason TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_stock_ledger_item_date ON stock_ledger(stock_item_id,occurred_at);

CREATE TABLE stock_purchases (
  id TEXT PRIMARY KEY,
  supplier TEXT NOT NULL,
  invoice_reference TEXT NOT NULL DEFAULT '',
  purchase_date TEXT NOT NULL,
  stock_item_id TEXT NOT NULL REFERENCES stock_items(id),
  pack_quantity REAL NOT NULL CHECK(pack_quantity > 0),
  pack_unit TEXT NOT NULL CHECK(pack_unit IN ('g','kg','ml','l','unit','pack')),
  units_per_pack REAL NOT NULL CHECK(units_per_pack > 0),
  base_quantity REAL NOT NULL CHECK(base_quantity > 0),
  total_cost REAL NOT NULL CHECK(total_cost > 0),
  payment_method TEXT NOT NULL,
  expense_id TEXT UNIQUE REFERENCES expenses(id),
  reversed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_stock_items_alerts ON stock_items(archived_at,on_hand,reserved,reorder_level);
CREATE UNIQUE INDEX idx_tiffin_cycle_period ON orders(tiffin_plan_id,service_date,service_end_date) WHERE tiffin_plan_id IS NOT NULL;
