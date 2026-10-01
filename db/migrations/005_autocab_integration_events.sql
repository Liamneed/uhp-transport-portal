PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS integration_events (
  id INTEGER PRIMARY KEY,

  provider TEXT NOT NULL
    CHECK (provider IN ('autocab')),

  direction TEXT NOT NULL
    CHECK (direction IN ('inbound','outbound')),

  event_type TEXT NOT NULL,
  route_suffix TEXT NOT NULL,

  category TEXT NOT NULL
    CHECK (
      category IN (
        'booking',
        'finance',
        'fleet'
      )
    ),

  booking_id INTEGER
    REFERENCES bookings(id)
    ON DELETE SET NULL,

  autocab_booking_id TEXT,
  autocab_reference TEXT,
  external_event_id TEXT,

  payload_json TEXT NOT NULL,

  processing_status TEXT NOT NULL
    DEFAULT 'received'
    CHECK (
      processing_status IN (
        'received',
        'processed',
        'ignored',
        'failed'
      )
    ),

  processing_error TEXT,

  received_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  processed_at TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS
  idx_integration_events_provider_received
ON integration_events(
  provider,
  received_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_integration_events_type_received
ON integration_events(
  event_type,
  received_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_integration_events_status
ON integration_events(
  processing_status,
  received_at
);

CREATE INDEX IF NOT EXISTS
  idx_integration_events_booking
ON integration_events(
  booking_id,
  received_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_integration_events_autocab_booking
ON integration_events(
  autocab_booking_id,
  received_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_integration_events_autocab_reference
ON integration_events(
  autocab_reference,
  received_at DESC
);
