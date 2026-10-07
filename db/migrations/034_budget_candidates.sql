CREATE TABLE IF NOT EXISTS budget_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  budget_number TEXT NOT NULL UNIQUE,

  imported_holder_name TEXT,

  suggested_name TEXT,
  suggested_department_id INTEGER,
  suggested_holder_user_id INTEGER,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'approved',
        'linked',
        'rejected'
      )
    ),

  resolved_budget_id INTEGER,

  first_seen_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  last_seen_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  occurrence_count INTEGER NOT NULL
    DEFAULT 1
    CHECK (occurrence_count >= 1),

  reviewed_by_user_id INTEGER,
  reviewed_at TEXT,
  review_notes TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  CHECK (
    budget_number GLOB
      '12[0-9][0-9][0-9][0-9]'
  ),

  FOREIGN KEY (
    suggested_department_id
  ) REFERENCES departments(id),

  FOREIGN KEY (
    suggested_holder_user_id
  ) REFERENCES users(id),

  FOREIGN KEY (
    resolved_budget_id
  ) REFERENCES budgets(id),

  FOREIGN KEY (
    reviewed_by_user_id
  ) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS
  idx_budget_candidates_status
ON budget_candidates(status);

CREATE INDEX IF NOT EXISTS
  idx_budget_candidates_last_seen
ON budget_candidates(last_seen_at);
