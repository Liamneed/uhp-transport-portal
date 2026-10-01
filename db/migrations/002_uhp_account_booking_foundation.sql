PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS portal_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  autocab_customer_id TEXT,
  booking_scope TEXT NOT NULL DEFAULT 'uhp_account_only'
    CHECK (booking_scope IN ('uhp_account_only')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO portal_settings (id, booking_scope)
VALUES (1, 'uhp_account_only');

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY,

  public_reference TEXT UNIQUE,

  autocab_booking_id TEXT,
  autocab_reference TEXT,

  source TEXT NOT NULL DEFAULT 'portal'
    CHECK (source IN ('portal','nac_control','api','christmas','import')),

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

  budget_id INTEGER NOT NULL REFERENCES budgets(id),
  reason_code_id INTEGER NOT NULL REFERENCES reason_codes(id),
  budget_holder_user_id INTEGER NOT NULL REFERENCES users(id),

  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  department_id INTEGER REFERENCES departments(id),

  submitted_at TEXT,
  confirmed_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS booking_stops (
  id INTEGER PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  stop_type TEXT NOT NULL
    CHECK (stop_type IN ('pickup','via','destination')),
  address TEXT NOT NULL,
  postcode TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(booking_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS booking_events (
  id INTEGER PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_source TEXT NOT NULL DEFAULT 'portal',
  event_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  old_status TEXT,
  new_status TEXT,
  user_id INTEGER REFERENCES users(id),
  notes TEXT,
  raw_payload TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS booking_account_snapshot (
  id INTEGER PRIMARY KEY,
  booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,

  customer_id TEXT,

  budget_id INTEGER,
  budget_number TEXT NOT NULL,
  budget_name TEXT NOT NULL,

  reason_code_id INTEGER,
  reason_code TEXT NOT NULL,
  reason_description TEXT NOT NULL,

  budget_holder_user_id INTEGER,
  budget_holder_name TEXT NOT NULL,

  department_id INTEGER,
  department_name TEXT,

  captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bookings_pickup
  ON bookings(requested_pickup_at);

CREATE INDEX IF NOT EXISTS idx_bookings_operational_status
  ON bookings(operational_status);

CREATE INDEX IF NOT EXISTS idx_bookings_budget
  ON bookings(budget_id);

CREATE INDEX IF NOT EXISTS idx_bookings_created_by
  ON bookings(created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_booking_events_booking
  ON booking_events(booking_id, event_at);
