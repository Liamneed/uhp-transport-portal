INSERT OR IGNORE INTO transport_staff_programme_access (
  staff_identity_id,
  programme_id,
  grant_source
)
SELECT
  tsi.id,
  tp.id,
  'migration'
FROM transport_staff_identities tsi
CROSS JOIN transport_programmes tp
WHERE tsi.status NOT IN (
  'suspended',
  'archived'
)
  AND tp.status = 'open'
  AND (
    tp.request_opens_at IS NULL
    OR tp.request_opens_at <= CURRENT_TIMESTAMP
  )
  AND (
    tp.request_closes_at IS NULL
    OR tp.request_closes_at >= CURRENT_TIMESTAMP
  )
  AND EXISTS (
    SELECT 1
    FROM transport_programme_windows tpw
    WHERE tpw.programme_id = tp.id
      AND tpw.is_active = 1
  );
