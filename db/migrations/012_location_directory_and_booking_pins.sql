ALTER TABLE saved_locations
  ADD COLUMN parent_site TEXT;

ALTER TABLE saved_locations
  ADD COLUMN pickup_instructions TEXT;

ALTER TABLE saved_locations
  ADD COLUMN driver_instructions TEXT;

ALTER TABLE saved_locations
  ADD COLUMN created_by_user_id INTEGER
    REFERENCES users(id);

ALTER TABLE saved_locations
  ADD COLUMN updated_by_user_id INTEGER
    REFERENCES users(id);


CREATE TABLE IF NOT EXISTS user_favourite_locations (
  id INTEGER PRIMARY KEY,

  user_id INTEGER NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  saved_location_id INTEGER
    REFERENCES saved_locations(id)
    ON DELETE SET NULL,

  name TEXT NOT NULL,

  address TEXT,
  postcode TEXT,

  latitude REAL,
  longitude REAL,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  CHECK (
    latitude IS NULL OR
    (
      latitude >= -90 AND
      latitude <= 90
    )
  ),

  CHECK (
    longitude IS NULL OR
    (
      longitude >= -180 AND
      longitude <= 180
    )
  ),

  CHECK (
    saved_location_id IS NOT NULL OR
    (
      address IS NOT NULL AND
      latitude IS NOT NULL AND
      longitude IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS
  ux_user_favourite_locations_name
ON user_favourite_locations(
  user_id,
  name COLLATE NOCASE
);

CREATE INDEX IF NOT EXISTS
  idx_user_favourite_locations_user
ON user_favourite_locations(
  user_id,
  updated_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_user_favourite_locations_shared
ON user_favourite_locations(
  saved_location_id
);


ALTER TABLE booking_stops
  ADD COLUMN latitude REAL;

ALTER TABLE booking_stops
  ADD COLUMN longitude REAL;

ALTER TABLE booking_stops
  ADD COLUMN saved_location_id INTEGER
    REFERENCES saved_locations(id)
    ON DELETE SET NULL;

ALTER TABLE booking_stops
  ADD COLUMN location_name TEXT;

ALTER TABLE booking_stops
  ADD COLUMN pickup_instructions TEXT;

CREATE INDEX IF NOT EXISTS
  idx_booking_stops_saved_location
ON booking_stops(saved_location_id);
