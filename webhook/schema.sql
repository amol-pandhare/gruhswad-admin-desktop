CREATE TABLE IF NOT EXISTS whatsapp_inbox (
  id TEXT PRIMARY KEY,
  sender TEXT NOT NULL,
  message TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  raw_event JSONB NOT NULL,
  acknowledged_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS whatsapp_inbox_unacknowledged ON whatsapp_inbox(received_at) WHERE acknowledged_at IS NULL;
