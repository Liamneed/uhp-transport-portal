PRAGMA foreign_keys = ON;

/*
  CSV import staging for Special Transport.

  A CSV is validated into a batch first.
  No transport_requests are created until the
  authorised user explicitly confirms import.
*/

CREATE TABLE transport_request_import_batches (
  id INTEGER PRIMARY KEY,

  source TEXT NOT NULL DEFAULT 'department_csv'
    CHECK (
      source = 'department_csv'
    ),

  status TEXT NOT NULL DEFAULT 'validating'
    CHECK (
      status IN (
        'validating',
        'ready',
        'has_errors',
        'importing',
        'imported',
        'cancelled',
        'failed'
      )
    ),

  original_filename TEXT,

  row_count INTEGER NOT NULL DEFAULT 0
    CHECK (
      row_count >= 0
    ),

  ready_count INTEGER NOT NULL DEFAULT 0
    CHECK (
      ready_count >= 0
    ),

  warning_count INTEGER NOT NULL DEFAULT 0
    CHECK (
      warning_count >= 0
    ),

  error_count INTEGER NOT NULL DEFAULT 0
    CHECK (
      error_count >= 0
    ),

  imported_count INTEGER NOT NULL DEFAULT 0
    CHECK (
      imported_count >= 0
    ),

  created_by_user_id INTEGER NOT NULL
    REFERENCES users(id)
    ON DELETE RESTRICT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  imported_at TEXT
);


CREATE INDEX idx_transport_request_import_batches_user
ON transport_request_import_batches(
  created_by_user_id,
  created_at DESC
);


CREATE INDEX idx_transport_request_import_batches_status
ON transport_request_import_batches(
  status,
  created_at DESC
);


/*
  Store the validated/normalised row independently of the
  eventual transport request.

  raw_json preserves exactly what the importer received for
  dispute/debug purposes.

  normalised_json contains the parsed values which will be
  used if the user confirms the batch.
*/
CREATE TABLE transport_request_import_rows (
  id INTEGER PRIMARY KEY,

  batch_id INTEGER NOT NULL
    REFERENCES transport_request_import_batches(id)
    ON DELETE CASCADE,

  row_number INTEGER NOT NULL
    CHECK (
      row_number >= 1
    ),

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'ready',
        'warning',
        'error',
        'imported',
        'skipped'
      )
    ),

  raw_json TEXT NOT NULL,

  normalised_json TEXT,

  error_json TEXT,

  warning_json TEXT,

  duplicate_transport_request_id INTEGER
    REFERENCES transport_requests(id)
    ON DELETE SET NULL,

  imported_transport_request_id INTEGER
    REFERENCES transport_requests(id)
    ON DELETE SET NULL,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(
    batch_id,
    row_number
  )
);


CREATE INDEX idx_transport_request_import_rows_batch
ON transport_request_import_rows(
  batch_id,
  row_number
);


CREATE INDEX idx_transport_request_import_rows_status
ON transport_request_import_rows(
  batch_id,
  status,
  row_number
);


CREATE INDEX idx_transport_request_import_rows_duplicate
ON transport_request_import_rows(
  duplicate_transport_request_id
);


CREATE INDEX idx_transport_request_import_rows_imported
ON transport_request_import_rows(
  imported_transport_request_id
);
