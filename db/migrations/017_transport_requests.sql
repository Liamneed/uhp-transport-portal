PRAGMA foreign_keys = ON;

/*
  Special transport passenger requests.

  These are planning-layer records only.

  A request does NOT create an Autocab booking.
  Real bookings are created later after route planning,
  passenger confirmation and route lock.

  The programme is derived from programme_window_id.
  This avoids storing duplicate programme ownership and
  prevents a request being linked to a window from a
  different programme.
*/

CREATE TABLE IF NOT EXISTS transport_requests (
  id INTEGER PRIMARY KEY,

  programme_window_id INTEGER NOT NULL
    REFERENCES transport_programme_windows(id)
    ON DELETE RESTRICT,

  requested_by_user_id INTEGER NOT NULL
    REFERENCES users(id)
    ON DELETE RESTRICT,

  passenger_name TEXT NOT NULL,

  passenger_mobile TEXT NOT NULL,

  passenger_email TEXT,

  direction TEXT NOT NULL
    CHECK (
      direction IN (
        'to_work',
        'from_work'
      )
    ),

  /*
    For to_work this represents the staff member's
    required work/shift start time.

    For from_work this represents their shift finish time.

    It is NOT the taxi pickup time. The actual planned
    pickup time will be calculated later during routing.
  */
  shift_time TEXT NOT NULL,

  pickup_address TEXT NOT NULL,

  pickup_postcode TEXT,

  pickup_latitude REAL,

  pickup_longitude REAL,

  destination_address TEXT NOT NULL,

  destination_postcode TEXT,

  destination_latitude REAL,

  destination_longitude REAL,

  passenger_count INTEGER NOT NULL DEFAULT 1
    CHECK (
      passenger_count >= 1
    ),

  accessibility_notes TEXT,

  passenger_notes TEXT,

  internal_notes TEXT,

  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (
      status IN (
        'submitted',
        'needs_information',
        'ready_for_planning',
        'planned',
        'awaiting_confirmation',
        'confirmed',
        'locked',
        'booked',
        'change_requested',
        'not_accommodated',
        'cancelled'
      )
    ),

  submitted_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  confirmed_at TEXT,

  cancelled_at TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  CHECK (
    (
      pickup_latitude IS NULL
      AND pickup_longitude IS NULL
    )
    OR
    (
      pickup_latitude BETWEEN -90 AND 90
      AND pickup_longitude BETWEEN -180 AND 180
    )
  ),

  CHECK (
    (
      destination_latitude IS NULL
      AND destination_longitude IS NULL
    )
    OR
    (
      destination_latitude BETWEEN -90 AND 90
      AND destination_longitude BETWEEN -180 AND 180
    )
  )
);


CREATE INDEX IF NOT EXISTS
  idx_transport_requests_window
ON transport_requests(
  programme_window_id,
  status,
  submitted_at
);


CREATE INDEX IF NOT EXISTS
  idx_transport_requests_user
ON transport_requests(
  requested_by_user_id,
  submitted_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_transport_requests_planning
ON transport_requests(
  programme_window_id,
  direction,
  shift_time,
  status
);


/*
  Immutable-by-application local event history.

  This supports the staff-facing request timeline and
  operational audit without querying Autocab.
*/

CREATE TABLE IF NOT EXISTS transport_request_events (
  id INTEGER PRIMARY KEY,

  transport_request_id INTEGER NOT NULL
    REFERENCES transport_requests(id)
    ON DELETE CASCADE,

  event_type TEXT NOT NULL,

  actor_user_id INTEGER
    REFERENCES users(id)
    ON DELETE SET NULL,

  old_status TEXT,

  new_status TEXT,

  notes TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX IF NOT EXISTS
  idx_transport_request_events_request
ON transport_request_events(
  transport_request_id,
  created_at,
  id
);
