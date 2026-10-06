PRAGMA foreign_keys = ON;

/*
  Explicit Demo Mode provenance.

  Demo data must never be identified by passenger name,
  email, status or free-text notes.

  Existing rows remain non-demo until the authorised
  Demo Data loader explicitly adopts them.
*/

ALTER TABLE transport_requests
ADD COLUMN is_demo INTEGER NOT NULL
  DEFAULT 0
  CHECK (
    is_demo IN (0, 1)
  );

ALTER TABLE transport_requests
ADD COLUMN demo_batch_key TEXT;

ALTER TABLE transport_requests
ADD COLUMN demo_origin TEXT
  CHECK (
    demo_origin IS NULL
    OR demo_origin IN (
      'existing',
      'generated'
    )
  );

CREATE INDEX idx_transport_requests_demo
  ON transport_requests(
    is_demo,
    demo_batch_key,
    id
  );


/*
  Keeps the loader idempotent and records exactly
  what happened to each demo dataset.
*/

CREATE TABLE demo_data_batches (
  id INTEGER PRIMARY KEY,

  batch_key TEXT NOT NULL
    UNIQUE,

  dataset_type TEXT NOT NULL,

  status TEXT NOT NULL
    DEFAULT 'loaded'
    CHECK (
      status IN (
        'loaded',
        'cleared'
      )
    ),

  adopted_existing_count INTEGER NOT NULL
    DEFAULT 0,

  generated_count INTEGER NOT NULL
    DEFAULT 0,

  loaded_by_user_id INTEGER
    REFERENCES users(id)
    ON DELETE SET NULL,

  loaded_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  cleared_by_user_id INTEGER
    REFERENCES users(id)
    ON DELETE SET NULL,

  cleared_at TEXT
);

CREATE INDEX idx_demo_data_batches_status
  ON demo_data_batches(
    dataset_type,
    status,
    loaded_at
  );
