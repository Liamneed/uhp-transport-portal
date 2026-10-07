INSERT INTO reason_codes (
  code,
  description,
  status,
  updated_at
)
VALUES
  (
    'P1',
    'Funded Approved Patient Transport',
    'active',
    CURRENT_TIMESTAMP
  ),
  (
    'C1',
    'Parents / Carer who are required to attend Hospital',
    'active',
    CURRENT_TIMESTAMP
  )
ON CONFLICT(code)
DO UPDATE SET
  description = excluded.description,
  status = 'active',
  updated_at = CURRENT_TIMESTAMP;
