/*
  Restricted identity/authentication foundation for
  Special Transport self-service staff.

  These identities are intentionally separate from
  normal UHP Transport Portal users and roles.
*/

CREATE TABLE transport_staff_identities (
  id INTEGER PRIMARY KEY,

  first_name TEXT,
  last_name TEXT,

  email TEXT NOT NULL
    UNIQUE COLLATE NOCASE,

  mobile TEXT,

  status TEXT NOT NULL
    DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'active',
        'suspended',
        'archived'
      )
    ),

  email_verified_at TEXT,
  mobile_verified_at TEXT,

  last_login_at TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transport_staff_identities_status
  ON transport_staff_identities(
    status
  );

CREATE INDEX idx_transport_staff_identities_mobile
  ON transport_staff_identities(
    mobile
  );


CREATE TABLE transport_staff_login_challenges (
  id TEXT PRIMARY KEY,

  staff_identity_id INTEGER NOT NULL
    REFERENCES transport_staff_identities(id)
    ON DELETE CASCADE,

  channel TEXT NOT NULL
    CHECK (
      channel IN (
        'email',
        'sms'
      )
    ),

  purpose TEXT NOT NULL
    CHECK (
      purpose IN (
        'verify_email',
        'verify_mobile',
        'login'
      )
    ),

  destination TEXT NOT NULL,

  code_hash TEXT NOT NULL,
  code_salt TEXT NOT NULL,

  attempts INTEGER NOT NULL
    DEFAULT 0,

  max_attempts INTEGER NOT NULL
    DEFAULT 5,

  expires_at TEXT NOT NULL,

  consumed_at TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transport_staff_challenges_identity
  ON transport_staff_login_challenges(
    staff_identity_id,
    created_at
  );

CREATE INDEX idx_transport_staff_challenges_destination
  ON transport_staff_login_challenges(
    destination,
    created_at
  );

CREATE INDEX idx_transport_staff_challenges_active
  ON transport_staff_login_challenges(
    staff_identity_id,
    channel,
    purpose,
    expires_at
  );


CREATE TABLE transport_staff_sessions (
  id INTEGER PRIMARY KEY,

  session_hash TEXT NOT NULL
    UNIQUE,

  staff_identity_id INTEGER NOT NULL
    REFERENCES transport_staff_identities(id)
    ON DELETE CASCADE,

  expires_at TEXT NOT NULL,

  revoked_at TEXT,

  last_seen_at TEXT,

  ip_address TEXT,
  user_agent TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transport_staff_sessions_identity
  ON transport_staff_sessions(
    staff_identity_id,
    expires_at
  );

CREATE INDEX idx_transport_staff_sessions_hash
  ON transport_staff_sessions(
    session_hash
  );
