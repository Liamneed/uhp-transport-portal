PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS booking_coding_reconciliation (
  booking_id INTEGER PRIMARY KEY
    REFERENCES bookings(id)
    ON DELETE CASCADE,

  raw_reference TEXT,

  parsed_reason_code TEXT,
  parsed_budget_number TEXT,
  parsed_budget_holder TEXT,

  status TEXT NOT NULL
    CHECK (
      status IN (
        'valid',
        'missing',
        'invalid',
        'mismatch'
      )
    ),

  reason_status TEXT,
  budget_status TEXT,
  holder_status TEXT,

  details_json TEXT,

  checked_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS
  idx_booking_coding_reconciliation_status
ON booking_coding_reconciliation(status);
