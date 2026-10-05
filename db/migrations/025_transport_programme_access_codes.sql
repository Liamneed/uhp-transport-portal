CREATE TABLE IF NOT EXISTS transport_programme_access_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  programme_id INTEGER NOT NULL UNIQUE,

  code_hash TEXT NOT NULL,
  code_salt TEXT NOT NULL,

  valid_from TEXT,
  expires_at TEXT,

  is_active INTEGER NOT NULL DEFAULT 1
    CHECK (is_active IN (0, 1)),

  created_by_user_id INTEGER,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (programme_id)
    REFERENCES transport_programmes(id),

  FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS
  idx_transport_programme_access_codes_programme
ON transport_programme_access_codes(programme_id);
