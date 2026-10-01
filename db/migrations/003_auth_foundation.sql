PRAGMA foreign_keys = ON;

CREATE TABLE auth_login_challenges (
  id TEXT PRIMARY KEY,

  user_id INTEGER NOT NULL
    REFERENCES users(id),

  email TEXT NOT NULL COLLATE NOCASE,

  code_hash TEXT NOT NULL,
  code_salt TEXT NOT NULL,

  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,

  expires_at TEXT NOT NULL,
  consumed_at TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_auth_challenges_user
  ON auth_login_challenges(
    user_id,
    created_at
  );

CREATE INDEX idx_auth_challenges_email
  ON auth_login_challenges(
    email,
    created_at
  );

CREATE TABLE auth_sessions (
  id INTEGER PRIMARY KEY,

  session_hash TEXT NOT NULL UNIQUE,

  user_id INTEGER NOT NULL
    REFERENCES users(id),

  expires_at TEXT NOT NULL,
  revoked_at TEXT,

  last_seen_at TEXT,

  ip_address TEXT,
  user_agent TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_auth_sessions_user
  ON auth_sessions(
    user_id,
    expires_at
  );

CREATE INDEX idx_auth_sessions_hash
  ON auth_sessions(
    session_hash
  );
