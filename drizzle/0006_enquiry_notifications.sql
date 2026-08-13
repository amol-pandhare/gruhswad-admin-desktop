CREATE TABLE IF NOT EXISTS enquiry_notification_state (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  cursor_created_at TEXT,
  cursor_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO enquiry_notification_state(singleton,enabled) VALUES(1,1);
