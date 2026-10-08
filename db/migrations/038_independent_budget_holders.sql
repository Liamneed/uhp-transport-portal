PRAGMA foreign_keys = ON;

/*
  Independent accounting identity for a
  budget holder.

  A holder does not require a portal login
  and this table grants no booking access.
*/
CREATE TABLE IF NOT EXISTS budget_holders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  canonical_name TEXT NOT NULL,

  linked_user_id INTEGER
    REFERENCES users(id),

  status TEXT NOT NULL
    DEFAULT 'active'
    CHECK (
      status IN (
        'active',
        'inactive'
      )
    ),

  source TEXT NOT NULL
    DEFAULT 'portal_master',

  notes TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_budget_holders_canonical_name
ON budget_holders(
  canonical_name COLLATE NOCASE
);

CREATE INDEX IF NOT EXISTS
  idx_budget_holders_linked_user
ON budget_holders(
  linked_user_id
);


/*
  Accounting holder ↔ budget relationship.

  Deliberately separate from:
    - users
    - user_roles
    - user_budget_access

  Creating this assignment therefore does
  NOT grant permission to book.
*/
CREATE TABLE IF NOT EXISTS
  budget_holder_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    budget_id INTEGER NOT NULL
      REFERENCES budgets(id),

    holder_id INTEGER NOT NULL
      REFERENCES budget_holders(id),

    assignment_type TEXT NOT NULL
      CHECK (
        assignment_type IN (
          'primary_holder',
          'deputy_holder'
        )
      ),

    valid_from TEXT,
    valid_to TEXT,

    is_active INTEGER NOT NULL
      DEFAULT 1
      CHECK (
        is_active IN (
          0,
          1
        )
      ),

    source TEXT NOT NULL
      DEFAULT 'portal_master',

    created_by_user_id INTEGER
      REFERENCES users(id),

    created_at TEXT NOT NULL
      DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL
      DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (
      budget_id,
      holder_id,
      assignment_type
    )
);

CREATE INDEX IF NOT EXISTS
  idx_budget_holder_assignments_budget
ON budget_holder_assignments(
  budget_id,
  is_active
);

CREATE INDEX IF NOT EXISTS
  idx_budget_holder_assignments_holder
ON budget_holder_assignments(
  holder_id,
  is_active
);


/*
  Keep the existing historical alias table
  and extend it so aliases can eventually
  resolve to an independent holder record.

  canonical_holder_name remains in place
  during the compatibility phase.
*/
ALTER TABLE budget_holder_aliases
ADD COLUMN holder_id INTEGER
  REFERENCES budget_holders(id);


/*
  Future booking reconciliation can point
  directly at the independent holder while
  legacy budget_holder_user_id remains
  intact during migration.
*/
ALTER TABLE bookings
ADD COLUMN budget_holder_id INTEGER
  REFERENCES budget_holders(id);

CREATE INDEX IF NOT EXISTS
  idx_bookings_budget_holder
ON bookings(
  budget_holder_id
);


/*
  Preserve the resolved accounting identity
  in historical snapshots as well.

  Legacy budget_holder_user_id is retained.
*/
ALTER TABLE booking_account_snapshot
ADD COLUMN budget_holder_id INTEGER
  REFERENCES budget_holders(id);

CREATE INDEX IF NOT EXISTS
  idx_booking_snapshot_budget_holder
ON booking_account_snapshot(
  budget_holder_id
);
