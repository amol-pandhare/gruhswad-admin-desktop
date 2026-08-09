-- Apply with a Neon owner/migration role before pushing desktop-created customers.
-- Do not grant DDL privileges to the desktop synchronization role.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
