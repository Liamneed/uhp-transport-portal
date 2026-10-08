PRAGMA foreign_keys = ON;

/*
  Historical holder identities derived from
  repeated five-invoice evidence.

  These rows:
    - do NOT create portal users
    - do NOT create budgets
    - do NOT grant booking access
    - do NOT change existing bookings
*/

INSERT OR IGNORE INTO budget_holders
  (
    canonical_name,
    source,
    notes
  )
VALUES
  (
    'Claire Francis',
    'five_invoice_history',
    'Repeated historical holder evidence for budget 120176'
  ),
  (
    'Tracey Fielding',
    'five_invoice_history',
    'Repeated historical holder evidence for budget 120176'
  ),

  (
    'Adenike Wezeali',
    'five_invoice_history',
    'Repeated historical holder evidence for budget 120327'
  ),
  (
    'Archie McDonald',
    'five_invoice_history',
    'Repeated historical holder evidence for budget 120327'
  ),
  (
    'Keith Bell',
    'five_invoice_history',
    'Repeated historical holder evidence for budget 120327'
  ),
  (
    'Stephanie English',
    'five_invoice_history',
    'Repeated historical holder evidence for budget 120327'
  ),
  (
    'Kate Starrs',
    'five_invoice_history',
    'Historical holder evidence for budget 120327'
  ),

  (
    'Olivia Rudd',
    'five_invoice_history',
    'Repeated historical holder evidence for budget 121121'
  ),
  (
    'John Ellam',
    'five_invoice_history',
    'Repeated historical holder evidence for budget 121121'
  ),
  (
    'Francesca Richards',
    'five_invoice_history',
    'Repeated historical holder evidence for budget 121121'
  ),

  (
    'Donna Berry',
    'five_invoice_history',
    'Repeated historical holder evidence for budget 121210'
  ),
  (
    'David McGrath',
    'five_invoice_history',
    'Repeated historical holder evidence for budget 121210'
  ),
  (
    'Lisa Reece',
    'five_invoice_history',
    'Repeated historical holder evidence for budget 121210'
  );


UPDATE budget_holder_aliases
SET holder_id = (
  SELECT id
  FROM budget_holders
  WHERE canonical_name =
    budget_holder_aliases.canonical_holder_name
    COLLATE NOCASE
  LIMIT 1
)
WHERE holder_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM budget_holders
    WHERE canonical_name =
      budget_holder_aliases.canonical_holder_name
      COLLATE NOCASE
  );


INSERT OR IGNORE INTO budget_holder_aliases
  (
    budget_number,
    alias_name,
    canonical_holder_name,
    holder_id,
    source
  )
SELECT
  '120176',
  'Tracey Feidling',
  'Tracey Fielding',
  bh.id,
  'five_invoice_history'
FROM budget_holders bh
WHERE bh.canonical_name =
  'Tracey Fielding'
  COLLATE NOCASE;


INSERT OR IGNORE INTO budget_holder_aliases
  (
    budget_number,
    alias_name,
    canonical_holder_name,
    holder_id,
    source
  )
SELECT
  '120327',
  'Kate Styles',
  'Kate Starrs',
  bh.id,
  'five_invoice_history'
FROM budget_holders bh
WHERE bh.canonical_name =
  'Kate Starrs'
  COLLATE NOCASE;


INSERT OR IGNORE INTO budget_holder_aliases
  (
    budget_number,
    alias_name,
    canonical_holder_name,
    holder_id,
    source
  )
SELECT
  '121121',
  'Franchesca Richard',
  'Francesca Richards',
  bh.id,
  'five_invoice_history'
FROM budget_holders bh
WHERE bh.canonical_name =
  'Francesca Richards'
  COLLATE NOCASE;


INSERT OR IGNORE INTO budget_holder_aliases
  (
    budget_number,
    alias_name,
    canonical_holder_name,
    holder_id,
    source
  )
SELECT
  '121210',
  'Dave McGrath',
  'David McGrath',
  bh.id,
  'five_invoice_history'
FROM budget_holders bh
WHERE bh.canonical_name =
  'David McGrath'
  COLLATE NOCASE;


