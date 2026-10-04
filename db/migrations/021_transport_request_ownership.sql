-- uhp-migration: foreign-keys-off

/*
  Extend Special Transport requests so all intake routes
  feed the same request pool.

  Existing registered UHP portal requests continue to use
  requested_by_user_id.

  Restricted Christmas self-service staff use
  requested_by_staff_identity_id.

  Assisted/delegated/CSV requests can exist without a
  self-service owner, but must record the portal user who
  entered them.
*/

CREATE TABLE transport_requests_new (
  id INTEGER PRIMARY KEY,

  programme_window_id INTEGER NOT NULL
    REFERENCES transport_programme_windows(id)
    ON DELETE RESTRICT,

  requested_by_user_id INTEGER
    REFERENCES users(id)
    ON DELETE RESTRICT,

  requested_by_staff_identity_id INTEGER
    REFERENCES transport_staff_identities(id)
    ON DELETE RESTRICT,

  entered_by_user_id INTEGER
    REFERENCES users(id)
    ON DELETE RESTRICT,

  source TEXT NOT NULL
    DEFAULT 'uhp_portal'
    CHECK (
      source IN (
        'uhp_portal',
        'staff_self_service',
        'uhp_delegated',
        'nac_phone',
        'nac_email',
        'nac_assisted',
        'department_csv'
      )
    ),

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

  passenger_count INTEGER NOT NULL
    DEFAULT 1
    CHECK (
      passenger_count >= 1
    ),

  accessibility_notes TEXT,

  passenger_notes TEXT,

  internal_notes TEXT,

  status TEXT NOT NULL
    DEFAULT 'submitted'
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

  department_id INTEGER
    REFERENCES departments(id),

  budget_id INTEGER
    REFERENCES budgets(id),

  reason_code_id INTEGER
    REFERENCES reason_codes(id),

  budget_holder_user_id INTEGER
    REFERENCES users(id),

  /*
    A request must never simultaneously belong to
    both a normal portal user and a restricted staff
    identity.
  */
  CHECK (
    NOT (
      requested_by_user_id IS NOT NULL
      AND
      requested_by_staff_identity_id IS NOT NULL
    )
  ),

  /*
    Enforce the minimum provenance required for each
    supported intake route.
  */
  CHECK (
    (
      source = 'uhp_portal'
      AND requested_by_user_id IS NOT NULL
    )
    OR
    (
      source = 'staff_self_service'
      AND requested_by_staff_identity_id IS NOT NULL
    )
    OR
    (
      source IN (
        'uhp_delegated',
        'nac_phone',
        'nac_email',
        'nac_assisted',
        'department_csv'
      )
      AND entered_by_user_id IS NOT NULL
    )
  ),

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


/*
  Preserve all existing requests.

  Existing records originated through the registered
  portal workflow, so retain their existing owner and
  mark them as uhp_portal.
*/
INSERT INTO transport_requests_new (
  id,
  programme_window_id,
  requested_by_user_id,
  requested_by_staff_identity_id,
  entered_by_user_id,
  source,
  passenger_name,
  passenger_mobile,
  passenger_email,
  direction,
  shift_time,
  pickup_address,
  pickup_postcode,
  pickup_latitude,
  pickup_longitude,
  destination_address,
  destination_postcode,
  destination_latitude,
  destination_longitude,
  passenger_count,
  accessibility_notes,
  passenger_notes,
  internal_notes,
  status,
  submitted_at,
  confirmed_at,
  cancelled_at,
  created_at,
  updated_at,
  department_id,
  budget_id,
  reason_code_id,
  budget_holder_user_id
)
SELECT
  id,
  programme_window_id,
  requested_by_user_id,
  NULL,
  requested_by_user_id,
  'uhp_portal',
  passenger_name,
  passenger_mobile,
  passenger_email,
  direction,
  shift_time,
  pickup_address,
  pickup_postcode,
  pickup_latitude,
  pickup_longitude,
  destination_address,
  destination_postcode,
  destination_latitude,
  destination_longitude,
  passenger_count,
  accessibility_notes,
  passenger_notes,
  internal_notes,
  status,
  submitted_at,
  confirmed_at,
  cancelled_at,
  created_at,
  updated_at,
  department_id,
  budget_id,
  reason_code_id,
  budget_holder_user_id
FROM transport_requests;


DROP TABLE transport_requests;

ALTER TABLE transport_requests_new
RENAME TO transport_requests;


/*
  Existing indexes.
*/
CREATE INDEX idx_transport_requests_window
ON transport_requests(
  programme_window_id,
  status,
  submitted_at
);

CREATE INDEX idx_transport_requests_user
ON transport_requests(
  requested_by_user_id,
  submitted_at DESC
);

CREATE INDEX idx_transport_requests_planning
ON transport_requests(
  programme_window_id,
  direction,
  shift_time,
  status
);

CREATE INDEX idx_transport_requests_budget
ON transport_requests(
  budget_id,
  status,
  submitted_at
);

CREATE INDEX idx_transport_requests_department
ON transport_requests(
  department_id,
  submitted_at
);


/*
  New ownership/provenance indexes.
*/
CREATE INDEX idx_transport_requests_staff_identity
ON transport_requests(
  requested_by_staff_identity_id,
  submitted_at DESC
);

CREATE INDEX idx_transport_requests_entered_by
ON transport_requests(
  entered_by_user_id,
  submitted_at DESC
);

CREATE INDEX idx_transport_requests_source
ON transport_requests(
  source,
  submitted_at DESC
);


/*
  Preserve coordinate guards.
*/
CREATE TRIGGER trg_transport_requests_coordinates_insert
BEFORE INSERT ON transport_requests
FOR EACH ROW
WHEN
  (
    (NEW.pickup_latitude IS NULL)
    !=
    (NEW.pickup_longitude IS NULL)
  )
  OR
  (
    (NEW.destination_latitude IS NULL)
    !=
    (NEW.destination_longitude IS NULL)
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'Latitude and longitude must be supplied together'
  );
END;


CREATE TRIGGER trg_transport_requests_coordinates_update
BEFORE UPDATE OF
  pickup_latitude,
  pickup_longitude,
  destination_latitude,
  destination_longitude
ON transport_requests
FOR EACH ROW
WHEN
  (
    (NEW.pickup_latitude IS NULL)
    !=
    (NEW.pickup_longitude IS NULL)
  )
  OR
  (
    (NEW.destination_latitude IS NULL)
    !=
    (NEW.destination_longitude IS NULL)
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'Latitude and longitude must be supplied together'
  );
END;


/*
  Preserve financial coding guards.
*/
CREATE TRIGGER trg_transport_requests_coding_insert
BEFORE INSERT ON transport_requests
FOR EACH ROW
WHEN
  NEW.department_id IS NULL
  OR NEW.budget_id IS NULL
  OR NEW.reason_code_id IS NULL
  OR NEW.budget_holder_user_id IS NULL
BEGIN
  SELECT RAISE(
    ABORT,
    'Transport request funding details are required'
  );
END;


CREATE TRIGGER trg_transport_requests_coding_update
BEFORE UPDATE OF
  department_id,
  budget_id,
  reason_code_id,
  budget_holder_user_id
ON transport_requests
FOR EACH ROW
WHEN
  NEW.department_id IS NULL
  OR NEW.budget_id IS NULL
  OR NEW.reason_code_id IS NULL
  OR NEW.budget_holder_user_id IS NULL
BEGIN
  SELECT RAISE(
    ABORT,
    'Transport request funding details are required'
  );
END;
