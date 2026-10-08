PRAGMA foreign_keys = ON;

DROP INDEX IF EXISTS
  idx_budget_holders_canonical_name;

CREATE INDEX IF NOT EXISTS
  idx_budget_holders_canonical_name
ON budget_holders(
  canonical_name COLLATE NOCASE
);
