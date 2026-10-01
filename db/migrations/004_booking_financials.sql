PRAGMA foreign_keys = ON;

CREATE TABLE booking_financials (
  id INTEGER PRIMARY KEY,

  booking_id INTEGER NOT NULL UNIQUE
    REFERENCES bookings(id) ON DELETE CASCADE,

  gross_amount_pence INTEGER NOT NULL
    CHECK (gross_amount_pence >= 0),

  net_amount_pence INTEGER
    CHECK (
      net_amount_pence IS NULL OR
      net_amount_pence >= 0
    ),

  vat_amount_pence INTEGER
    CHECK (
      vat_amount_pence IS NULL OR
      vat_amount_pence >= 0
    ),

  currency TEXT NOT NULL DEFAULT 'GBP'
    CHECK (currency = 'GBP'),

  source TEXT NOT NULL
    CHECK (
      source IN (
        'autocab',
        'manual',
        'christmas_allocation',
        'import'
      )
    ),

  external_reference TEXT,
  raw_payload TEXT,

  received_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_by_user_id INTEGER
    REFERENCES users(id),

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  CHECK (
    net_amount_pence IS NULL OR
    vat_amount_pence IS NULL OR
    net_amount_pence + vat_amount_pence =
      gross_amount_pence
  )
);

CREATE INDEX idx_booking_financials_booking
  ON booking_financials(booking_id);

CREATE INDEX idx_booking_financials_received
  ON booking_financials(received_at);
