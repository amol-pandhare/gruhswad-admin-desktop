ALTER TABLE customers ADD COLUMN email TEXT;
ALTER TABLE customers ADD COLUMN archived_at TEXT;
ALTER TABLE customers ADD COLUMN updated_at TEXT;
ALTER TABLE cloud_customers ADD COLUMN email TEXT;
ALTER TABLE cloud_customers ADD COLUMN archived_at TEXT;
ALTER TABLE orders ADD COLUMN source_platform_id TEXT;
ALTER TABLE orders ADD COLUMN source_platform_name TEXT;

UPDATE customers SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE orders
SET source_platform_id = COALESCE(source_platform_id, source),
    source_platform_name = COALESCE(source_platform_name,
      CASE source
        WHEN 'manual' THEN 'Direct order'
        WHEN 'phone' THEN 'Phone'
        WHEN 'whatsapp' THEN 'WhatsApp'
        WHEN 'walk-in' THEN 'Walk-in'
        ELSE source
      END);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_customers_archived ON customers(archived_at);
CREATE INDEX IF NOT EXISTS idx_cloud_customers_archived ON cloud_customers(archived_at);
