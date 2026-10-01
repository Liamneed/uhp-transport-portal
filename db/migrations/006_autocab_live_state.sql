PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS autocab_vehicle_state (
  vehicle_id INTEGER PRIMARY KEY,

  callsign TEXT,
  registration TEXT,
  plate_number TEXT,
  device_id TEXT,

  booking_id TEXT,
  vehicle_status TEXT,

  driver_id INTEGER,
  driver_callsign TEXT,
  driver_forename TEXT,
  driver_surname TEXT,
  driver_badge_number TEXT,

  longitude REAL,
  latitude REAL,

  source_timestamp TEXT,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS
  idx_autocab_vehicle_state_callsign
ON autocab_vehicle_state(callsign);

CREATE INDEX IF NOT EXISTS
  idx_autocab_vehicle_state_booking
ON autocab_vehicle_state(booking_id);

CREATE INDEX IF NOT EXISTS
  idx_autocab_vehicle_state_status
ON autocab_vehicle_state(vehicle_status);


CREATE TABLE IF NOT EXISTS autocab_vehicle_position (
  vehicle_id INTEGER PRIMARY KEY,

  longitude REAL NOT NULL,
  latitude REAL NOT NULL,

  speed_kph REAL,
  speed_mph REAL,

  heading_degrees REAL,
  heading_direction TEXT,

  source_timestamp TEXT,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);
