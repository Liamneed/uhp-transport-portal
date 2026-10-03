CREATE TABLE IF NOT EXISTS saved_locations (
  id INTEGER PRIMARY KEY,

  name TEXT NOT NULL,
  address TEXT NOT NULL,
  postcode TEXT,

  latitude REAL NOT NULL,
  longitude REAL NOT NULL,

  category TEXT NOT NULL DEFAULT 'uhp'
    CHECK (
      category IN (
        'uhp',
        'hospital',
        'transport',
        'other'
      )
    ),

  is_active INTEGER NOT NULL DEFAULT 1
    CHECK (is_active IN (0, 1)),

  display_order INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  CHECK (
    latitude >= -90 AND
    latitude <= 90
  ),

  CHECK (
    longitude >= -180 AND
    longitude <= 180
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS
  ux_saved_locations_name
ON saved_locations(name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS
  idx_saved_locations_active_order
ON saved_locations(
  is_active,
  display_order,
  name
);

INSERT OR IGNORE INTO saved_locations (
  name,
  address,
  postcode,
  latitude,
  longitude,
  category,
  is_active,
  display_order
)
VALUES
  (
    'Derriford Hospital',
    'Derriford Hospital, Plymouth PL6 8DH, United Kingdom',
    'PL6 8DH',
    50.41716618389792,
    -4.116519158583742,
    'hospital',
    1,
    10
  ),
  (
    'Mount Gould Hospital',
    'Mount Gould Hospital, 259 Beaumont Road, Plymouth PL4 7QD, United Kingdom',
    'PL4 7QD',
    50.37783236279795,
    -4.11385345900851,
    'hospital',
    1,
    20
  ),
  (
    'Plymouth Railway Station',
    'Railway Station, Plymouth PL1 5BX, United Kingdom',
    'PL1 5BX',
    50.37698875618536,
    -4.144674092531204,
    'transport',
    1,
    30
  );
