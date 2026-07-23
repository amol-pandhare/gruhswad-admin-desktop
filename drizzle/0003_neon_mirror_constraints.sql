CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_customers_phone ON cloud_customers(phone_e164);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_addresses_customer_place ON cloud_customer_addresses(customer_id, place_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_orders_number ON cloud_orders(order_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_orders_idempotency ON cloud_orders(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_cloud_addresses_customer ON cloud_customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_cloud_orders_customer ON cloud_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_cloud_lines_order ON cloud_order_lines(order_id);
