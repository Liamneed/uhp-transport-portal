-- uhp-migration: foreign-keys-off

PRAGMA foreign_keys = OFF;

CREATE TABLE bookings_new (
  id INTEGER PRIMARY KEY,

  public_reference TEXT UNIQUE,

  autocab_booking_id TEXT,
  autocab_reference TEXT,

  source TEXT NOT NULL DEFAULT 'portal'
    CHECK (
      source IN (
        'portal',
        'nac_control',
        'api',
        'christmas',
        'import'
      )
    ),

  operational_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (
      operational_status IN (
        'draft',
        'submitting',
        'booked',
        'confirmed',
        'driver_allocated',
        'driver_en_route',
        'driver_arrived',
        'passenger_on_board',
        'completed',
        'cancelled',
        'no_show',
        'failed',
        'requires_review'
      )
    ),

  financial_status TEXT NOT NULL DEFAULT 'authorised'
    CHECK (
      financial_status IN (
        'authorised',
        'pending_review',
        'authorisation_withdrawn',
        'coding_required',
        'disputed',
        'approved_for_invoice',
        'invoiced',
        'adjustment_required'
      )
    ),

  requested_pickup_at TEXT NOT NULL,

  passenger_name TEXT NOT NULL,
  passenger_mobile TEXT NOT NULL,

  passenger_count INTEGER NOT NULL DEFAULT 1
    CHECK (passenger_count >= 1),

  pickup_address TEXT NOT NULL,
  pickup_postcode TEXT,

  destination_address TEXT NOT NULL,
  destination_postcode TEXT,

  driver_notes TEXT,
  internal_notes TEXT,

  budget_id INTEGER
    REFERENCES budgets(id),

  reason_code_id INTEGER
    REFERENCES reason_codes(id),

  budget_holder_user_id INTEGER
    REFERENCES users(id),

  created_by_user_id INTEGER
    REFERENCES users(id),

  department_id INTEGER
    REFERENCES departments(id),

  submitted_at TEXT,
  confirmed_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO bookings_new (
  id,
  public_reference,
  autocab_booking_id,
  autocab_reference,
  source,
  operational_status,
  financial_status,
  requested_pickup_at,
  passenger_name,
  passenger_mobile,
  passenger_count,
  pickup_address,
  pickup_postcode,
  destination_address,
  destination_postcode,
  driver_notes,
  internal_notes,
  budget_id,
  reason_code_id,
  budget_holder_user_id,
  created_by_user_id,
  department_id,
  submitted_at,
  confirmed_at,
  completed_at,
  cancelled_at,
  created_at,
  updated_at
)
SELECT
  id,
  public_reference,
  autocab_booking_id,
  autocab_reference,
  source,
  operational_status,
  financial_status,
  requested_pickup_at,
  passenger_name,
  passenger_mobile,
  passenger_count,
  pickup_address,
  pickup_postcode,
  destination_address,
  destination_postcode,
  driver_notes,
  internal_notes,
  budget_id,
  reason_code_id,
  budget_holder_user_id,
  created_by_user_id,
  department_id,
  submitted_at,
  confirmed_at,
  completed_at,
  cancelled_at,
  created_at,
  updated_at
FROM bookings;

DROP TABLE bookings;

ALTER TABLE bookings_new
  RENAME TO bookings;

CREATE INDEX IF NOT EXISTS
  idx_bookings_pickup
ON bookings(requested_pickup_at);

CREATE INDEX IF NOT EXISTS
  idx_bookings_operational_status
ON bookings(operational_status);

CREATE INDEX IF NOT EXISTS
  idx_bookings_budget
ON bookings(budget_id);

CREATE INDEX IF NOT EXISTS
  idx_bookings_created_by
ON bookings(created_by_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_bookings_autocab_booking_unique
ON bookings(autocab_booking_id)
WHERE autocab_booking_id IS NOT NULL;

PRAGMA foreign_keys = ON;
