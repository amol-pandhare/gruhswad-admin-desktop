ALTER TABLE cloud_orders ADD COLUMN handoff_status TEXT NOT NULL DEFAULT 'created';
ALTER TABLE cloud_orders ADD COLUMN operational_status TEXT NOT NULL DEFAULT 'awaiting_review';

UPDATE cloud_orders
SET handoff_status = CASE WHEN status = 'handoff_created' THEN 'created' ELSE 'customer_confirmed' END,
    operational_status = CASE
      WHEN status IN ('handoff_created','customer_confirmed_sent') THEN 'awaiting_review'
      ELSE status
    END;

CREATE TABLE order_contact_events (
  id TEXT PRIMARY KEY,
  order_kind TEXT NOT NULL CHECK(order_kind IN ('online','local')),
  order_id TEXT NOT NULL,
  milestone TEXT NOT NULL CHECK(milestone IN ('confirmed','ready','cancelled')),
  channel TEXT NOT NULL CHECK(channel = 'whatsapp'),
  outcome TEXT NOT NULL CHECK(outcome = 'opened'),
  template_version INTEGER NOT NULL,
  opened_at TEXT NOT NULL
);

CREATE INDEX idx_order_contact_events_order
ON order_contact_events(order_kind, order_id, opened_at DESC);

CREATE TABLE order_status_events (
  id TEXT PRIMARY KEY,
  order_kind TEXT NOT NULL CHECK(order_kind IN ('online','local')),
  order_id TEXT NOT NULL,
  previous_status TEXT NOT NULL,
  next_status TEXT NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE INDEX idx_order_status_events_order
ON order_status_events(order_kind, order_id, changed_at DESC);
