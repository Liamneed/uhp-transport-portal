PRAGMA foreign_keys = ON;

UPDATE portal_settings
SET
  autocab_customer_id = '2139',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 1
  AND (
    autocab_customer_id IS NULL
    OR TRIM(autocab_customer_id) = ''
  );
