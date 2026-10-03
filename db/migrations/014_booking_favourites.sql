PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS booking_favourites (
  id INTEGER PRIMARY KEY,

  user_id INTEGER NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  name TEXT NOT NULL,

  passenger_count INTEGER NOT NULL DEFAULT 1
    CHECK (passenger_count >= 1),

  budget_id INTEGER
    REFERENCES budgets(id)
    ON DELETE SET NULL,

  reason_code_id INTEGER
    REFERENCES reason_codes(id)
    ON DELETE SET NULL,

  driver_notes TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS
  idx_booking_favourites_user
ON booking_favourites(
  user_id,
  updated_at DESC
);


CREATE TABLE IF NOT EXISTS booking_favourite_stops (
  id INTEGER PRIMARY KEY,

  favourite_id INTEGER NOT NULL
    REFERENCES booking_favourites(id)
    ON DELETE CASCADE,

  sequence_number INTEGER NOT NULL,

  stop_type TEXT NOT NULL
    CHECK (
      stop_type IN (
        'pickup',
        'via',
        'destination'
      )
    ),

  address TEXT NOT NULL,

  postcode TEXT,

  latitude REAL,
  longitude REAL,

  saved_location_id INTEGER
    REFERENCES saved_locations(id)
    ON DELETE SET NULL,

  location_name TEXT,

  pickup_instructions TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(
    favourite_id,
    sequence_number
  )
);

CREATE INDEX IF NOT EXISTS
  idx_booking_favourite_stops_favourite
ON booking_favourite_stops(
  favourite_id,
  sequence_number
);
