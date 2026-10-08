PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS budget_holder_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  budget_number TEXT NOT NULL,
  alias_name TEXT NOT NULL,
  canonical_holder_name TEXT NOT NULL,

  source TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (
      status IN (
        'active',
        'inactive'
      )
    ),

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (
    budget_number,
    alias_name COLLATE NOCASE
  )
);

CREATE INDEX IF NOT EXISTS
  idx_budget_holder_aliases_budget
ON budget_holder_aliases(
  budget_number,
  status
);

INSERT OR IGNORE INTO budget_holder_aliases
  (
    budget_number,
    alias_name,
    canonical_holder_name,
    source
  )
VALUES
  (
    '120176',
    'Tracy Fielding',
    'Tracey Fielding',
    'five_invoice_history'
  ),

  (
    '120327',
    'Keath Bell',
    'Keith Bell',
    'five_invoice_history'
  ),

  (
    '120327',
    'Adenike Vezeali',
    'Adenike Wezeali',
    'five_invoice_history'
  ),

  (
    '120327',
    'Archie McDonlad',
    'Archie McDonald',
    'five_invoice_history'
  ),

  (
    '120327',
    'Stephnie English',
    'Stephanie English',
    'five_invoice_history'
  ),

  (
    '120327',
    'Kaite Starrs',
    'Kate Starrs',
    'five_invoice_history'
  ),

  (
    '120058',
    'Samathna Stringer',
    'Samantha Stringer',
    'five_invoice_history'
  ),

  (
    '120103',
    'Gemma Bouth',
    'Gemma Bouch',
    'five_invoice_history'
  ),

  (
    '120136',
    'Akosua Adutwumwaa',
    'Akosua Adutwumuaa',
    'five_invoice_history'
  ),

  (
    '121053',
    'Lisa Lesely',
    'Lisa Lesley',
    'five_invoice_history'
  ),

  (
    '121121',
    'John Elllam',
    'John Ellam',
    'five_invoice_history'
  ),

  (
    '121121',
    'Johm Ellam',
    'John Ellam',
    'five_invoice_history'
  ),

  (
    '121121',
    'Franchesca Richards',
    'Francesca Richards',
    'five_invoice_history'
  ),

  (
    '121121',
    'Franseca Richards',
    'Francesca Richards',
    'five_invoice_history'
  ),

  (
    '121121',
    'Francheca Richards',
    'Francesca Richards',
    'five_invoice_history'
  ),

  (
    '121207',
    'Michelle Minchington',
    'Michelle Minchinton',
    'five_invoice_history'
  ),

  (
    '121207',
    'Michelle Minthinton',
    'Michelle Minchinton',
    'five_invoice_history'
  ),

  (
    '121210',
    'Lisa Reese',
    'Lisa Reece',
    'five_invoice_history'
  ),

  (
    '121210',
    'David Mgrath',
    'David McGrath',
    'five_invoice_history'
  ),

  (
    '121308',
    'Cathrine Anthony',
    'Catherine Anthony',
    'five_invoice_history'
  );
