PRAGMA foreign_keys = ON;

/*
  Reusable special transport programme foundation.

  Christmas & New Year is the first use case, but dates,
  times, service windows and vehicle capacities are data,
  not hardcoded application rules.
*/

CREATE TABLE IF NOT EXISTS transport_programmes (
  id INTEGER PRIMARY KEY,

  code TEXT NOT NULL UNIQUE,

  name TEXT NOT NULL,

  programme_type TEXT NOT NULL DEFAULT 'special_transport',

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (
      status IN (
        'draft',
        'open',
        'planning',
        'confirmation',
        'locked',
        'active',
        'completed',
        'cancelled'
      )
    ),

  request_opens_at TEXT,
  request_closes_at TEXT,

  confirmation_due_at TEXT,
  route_lock_at TEXT,

  autocab_account_type TEXT NOT NULL DEFAULT 'xmas_staff',

  public_notes TEXT,
  internal_notes TEXT,

  created_by_user_id INTEGER
    REFERENCES users(id)
    ON DELETE SET NULL,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX IF NOT EXISTS
  idx_transport_programmes_status
ON transport_programmes(
  status
);


CREATE INDEX IF NOT EXISTS
  idx_transport_programmes_type
ON transport_programmes(
  programme_type
);


CREATE INDEX IF NOT EXISTS
  idx_transport_programmes_dates
ON transport_programmes(
  request_opens_at,
  request_closes_at
);


/*
  Explicit availability windows.

  Examples might be:
    Christmas Eve evening
    Christmas Day
    Boxing Day
    New Year's Eve evening

  These are fully configurable and can differ every year.
*/

CREATE TABLE IF NOT EXISTS transport_programme_windows (
  id INTEGER PRIMARY KEY,

  programme_id INTEGER NOT NULL
    REFERENCES transport_programmes(id)
    ON DELETE CASCADE,

  name TEXT NOT NULL,

  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,

  display_order INTEGER NOT NULL DEFAULT 0,

  is_active INTEGER NOT NULL DEFAULT 1
    CHECK (
      is_active IN (0, 1)
    ),

  public_notes TEXT,
  internal_notes TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  CHECK (
    ends_at > starts_at
  )
);


CREATE INDEX IF NOT EXISTS
  idx_transport_programme_windows_programme
ON transport_programme_windows(
  programme_id,
  display_order,
  starts_at
);


CREATE INDEX IF NOT EXISTS
  idx_transport_programme_windows_active
ON transport_programme_windows(
  programme_id,
  is_active,
  starts_at,
  ends_at
);


/*
  Vehicle capacity is configured per service window.

  Quantity is NULL only when is_unlimited = 1.

  The actual overlapping-route reservation logic will come
  later when route planning is introduced.
*/

CREATE TABLE IF NOT EXISTS transport_programme_vehicle_capacity (
  id INTEGER PRIMARY KEY,

  programme_window_id INTEGER NOT NULL
    REFERENCES transport_programme_windows(id)
    ON DELETE CASCADE,

  vehicle_type TEXT NOT NULL,

  seat_capacity INTEGER NOT NULL
    CHECK (
      seat_capacity >= 1
    ),

  quantity INTEGER,

  is_unlimited INTEGER NOT NULL DEFAULT 0
    CHECK (
      is_unlimited IN (0, 1)
    ),

  display_order INTEGER NOT NULL DEFAULT 0,

  notes TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  CHECK (
    (
      is_unlimited = 1
      AND quantity IS NULL
    )
    OR
    (
      is_unlimited = 0
      AND quantity IS NOT NULL
      AND quantity >= 0
    )
  ),

  UNIQUE(
    programme_window_id,
    vehicle_type
  )
);


CREATE INDEX IF NOT EXISTS
  idx_transport_vehicle_capacity_window
ON transport_programme_vehicle_capacity(
  programme_window_id,
  display_order,
  seat_capacity
);
