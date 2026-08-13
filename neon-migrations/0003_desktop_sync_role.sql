-- Run as the Neon owner after creating the LOGIN role and setting its password.
-- Example (execute separately with a password from a secure secret manager):
-- CREATE ROLE gruhswad_desktop_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT PASSWORD '<generated-password>';

GRANT gruhswad_desktop_sync TO gruhswad_desktop_app;
GRANT USAGE ON SCHEMA public TO gruhswad_desktop_app;

GRANT SELECT ON TABLE
  catalog_categories,
  catalog_items,
  bundle_option_groups,
  bundle_option_choices,
  app_settings,
  menu_publications,
  customers,
  customer_addresses,
  orders,
  order_lines,
  order_events
TO gruhswad_desktop_app;

GRANT INSERT, UPDATE ON TABLE
  catalog_categories,
  catalog_items,
  app_settings,
  menu_publications,
  customers
TO gruhswad_desktop_app;

GRANT INSERT, DELETE ON TABLE
  bundle_option_groups,
  bundle_option_choices
TO gruhswad_desktop_app;

GRANT UPDATE ON TABLE orders TO gruhswad_desktop_app;
GRANT INSERT ON TABLE order_events TO gruhswad_desktop_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gruhswad_desktop_app;

-- Deliberately omitted: DDL, table ownership, DELETE on business records,
-- direct enquiry writes, and access to unrelated schemas.
