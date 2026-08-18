CREATE TABLE IF NOT EXISTS expense_receipts (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL UNIQUE REFERENCES expenses(id) ON DELETE RESTRICT,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  relative_path TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  ocr_text TEXT NOT NULL DEFAULT '',
  extracted_payload TEXT NOT NULL DEFAULT '{}',
  corrected_payload TEXT NOT NULL DEFAULT '{}',
  duplicate_override_reason TEXT,
  imported_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expense_receipts_sha256 ON expense_receipts(sha256);

ALTER TABLE stock_purchases ADD COLUMN expense_receipt_id TEXT REFERENCES expense_receipts(id);
CREATE INDEX IF NOT EXISTS idx_stock_purchases_expense_receipt ON stock_purchases(expense_receipt_id);
