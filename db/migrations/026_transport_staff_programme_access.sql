CREATE TABLE IF NOT EXISTS transport_staff_programme_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  staff_identity_id INTEGER NOT NULL,
  programme_id INTEGER NOT NULL,

  grant_source TEXT NOT NULL DEFAULT 'campaign_code'
    CHECK (
      grant_source IN (
        'campaign_code',
        'admin',
        'migration'
      )
    ),

  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (
    staff_identity_id,
    programme_id
  ),

  FOREIGN KEY (staff_identity_id)
    REFERENCES transport_staff_identities(id),

  FOREIGN KEY (programme_id)
    REFERENCES transport_programmes(id)
);

CREATE INDEX IF NOT EXISTS
  idx_transport_staff_programme_access_staff
ON transport_staff_programme_access(
  staff_identity_id
);

CREATE INDEX IF NOT EXISTS
  idx_transport_staff_programme_access_programme
ON transport_staff_programme_access(
  programme_id
);
