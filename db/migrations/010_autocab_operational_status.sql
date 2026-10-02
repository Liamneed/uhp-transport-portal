-- uhp-migration: foreign-keys-off

PRAGMA foreign_keys = OFF;


/*
  Rebuild bookings so Autocab No Fare can be
  represented distinctly from No Show.
*/
CREATE TABLE bookings_new (
  id INTEGER PRIMARY KEY,

  public_reference TEXT UNIQUE,

  autocab_booking_id TEXT,
  autocab_reference TEXT,

  autocab_booked_by TEXT,
  autocab_booking_source TEXT,
  autocab_booked_at TEXT,

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
        'no_fare',
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
  autocab_booked_by,
  autocab_booking_source,
  autocab_booked_at,
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
  autocab_booked_by,
  autocab_booking_source,
  autocab_booked_at,
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


/*
  Backfill imported bookings from retained
  operational webhook events.

  Only bookings still in an early/non-terminal
  state are changed. This avoids regressing jobs
  already completed or cancelled by another
  controlled workflow.
*/
UPDATE bookings
SET
  operational_status = (
    SELECT
      CASE ie.route_suffix
        WHEN 'accept'
          THEN 'driver_allocated'
        WHEN 'arrived'
          THEN 'driver_arrived'
        WHEN 'pob'
          THEN 'passenger_on_board'
        WHEN 'complete'
          THEN 'completed'
        WHEN 'cancelled'
          THEN 'cancelled'
        WHEN 'nofare'
          THEN 'no_fare'
      END
    FROM integration_events ie
    WHERE ie.provider = 'autocab'
      AND ie.category = 'booking'
      AND ie.autocab_booking_id =
        bookings.autocab_booking_id
      AND ie.route_suffix IN (
        'accept',
        'arrived',
        'pob',
        'complete',
        'cancelled',
        'nofare'
      )
    ORDER BY ie.id DESC
    LIMIT 1
  ),

  completed_at = COALESCE(
    completed_at,
    (
      SELECT ie.received_at
      FROM integration_events ie
      WHERE ie.provider = 'autocab'
        AND ie.category = 'booking'
        AND ie.autocab_booking_id =
          bookings.autocab_booking_id
        AND ie.route_suffix = 'complete'
      ORDER BY ie.id DESC
      LIMIT 1
    )
  ),

  cancelled_at = COALESCE(
    cancelled_at,
    (
      SELECT ie.received_at
      FROM integration_events ie
      WHERE ie.provider = 'autocab'
        AND ie.category = 'booking'
        AND ie.autocab_booking_id =
          bookings.autocab_booking_id
        AND ie.route_suffix = 'cancelled'
      ORDER BY ie.id DESC
      LIMIT 1
    )
  ),

  updated_at = CURRENT_TIMESTAMP

WHERE autocab_booking_id IS NOT NULL
  AND operational_status IN (
    'draft',
    'submitting',
    'booked',
    'confirmed',
    'requires_review'
  )
  AND EXISTS (
    SELECT 1
    FROM integration_events ie
    WHERE ie.provider = 'autocab'
      AND ie.category = 'booking'
      AND ie.autocab_booking_id =
        bookings.autocab_booking_id
      AND ie.route_suffix IN (
        'accept',
        'arrived',
        'pob',
        'complete',
        'cancelled',
        'nofare'
      )
  );


/*
  Preserve the retained Autocab operational
  timeline in booking_events so historical jobs
  use the same detail/history model as newly
  received webhook events.
*/
INSERT INTO booking_events (
  booking_id,
  event_type,
  event_source,
  event_at,
  old_status,
  new_status,
  notes,
  raw_payload,
  created_at
)
SELECT
  b.id,

  ie.event_type,

  'autocab',

  ie.received_at,

  NULL,

  CASE ie.route_suffix
    WHEN 'accept'
      THEN 'driver_allocated'
    WHEN 'arrived'
      THEN 'driver_arrived'
    WHEN 'pob'
      THEN 'passenger_on_board'
    WHEN 'complete'
      THEN 'completed'
    WHEN 'cancelled'
      THEN 'cancelled'
    WHEN 'nofare'
      THEN 'no_fare'
    ELSE b.operational_status
  END,

  CASE ie.route_suffix
    WHEN 'accept'
      THEN 'Dispatch accepted by Autocab driver'
    WHEN 'arrived'
      THEN 'Driver arrived'
    WHEN 'pob'
      THEN 'Passenger on board'
    WHEN 'late'
      THEN 'Booking reported running late'
    WHEN 'complete'
      THEN 'Booking completed'
    WHEN 'cancelled'
      THEN 'Booking cancelled'
    WHEN 'nofare'
      THEN 'Booking closed as No Fare'
    WHEN 'modified'
      THEN 'Booking modified by Autocab'
    ELSE 'Autocab booking event received'
  END,

  ie.payload_json,

  ie.received_at

FROM integration_events ie

JOIN bookings b
  ON b.autocab_booking_id =
    ie.autocab_booking_id

WHERE ie.provider = 'autocab'
  AND ie.category = 'booking'
  AND ie.route_suffix IN (
    'modified',
    'accept',
    'arrived',
    'pob',
    'late',
    'complete',
    'cancelled',
    'nofare'
  )

  AND NOT EXISTS (
    SELECT 1
    FROM booking_events be
    WHERE be.booking_id = b.id
      AND be.event_source = 'autocab'
      AND be.event_type = ie.event_type
      AND be.event_at = ie.received_at
      AND COALESCE(be.raw_payload, '') =
        COALESCE(ie.payload_json, '')
  );


PRAGMA foreign_keys = ON;
