INSERT INTO reason_codes (
  code,
  description,
  status,
  updated_at
)
VALUES
  ('S1', 'Transfer', 'active', CURRENT_TIMESTAMP),
  ('S2', 'Extra Duties', 'active', CURRENT_TIMESTAMP),
  ('S3', 'Bank Holiday', 'active', CURRENT_TIMESTAMP),
  ('S4', 'Illness', 'active', CURRENT_TIMESTAMP),
  ('S5', 'Work delay', 'active', CURRENT_TIMESTAMP),
  ('S6', 'Staff Expenses', 'active', CURRENT_TIMESTAMP),
  ('S7', 'PHT Business', 'active', CURRENT_TIMESTAMP),
  (
    'C2',
    'Return journey home for carers/relatives who have attended the hospital with a patient',
    'active',
    CURRENT_TIMESTAMP
  ),
  (
    'O1',
    'Transportation of URGENT casenotes (i.e. those required within 1 hour)',
    'active',
    CURRENT_TIMESTAMP
  ),
  (
    'O2',
    'Delivery of late TTA, etc to speed up discharge',
    'active',
    CURRENT_TIMESTAMP
  ),
  (
    'O3',
    'Delivery of items missed at discharge',
    'active',
    CURRENT_TIMESTAMP
  ),
  (
    'O4',
    'Other deliveries',
    'active',
    CURRENT_TIMESTAMP
  )
ON CONFLICT(code)
DO UPDATE SET
  description = excluded.description,
  status = 'active',
  updated_at = CURRENT_TIMESTAMP;

UPDATE reason_codes
SET
  status = 'inactive',
  updated_at = CURRENT_TIMESTAMP
WHERE code IN (
  'RC01',
  'RC02',
  'RC03',
  'RC04'
);
