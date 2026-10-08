UPDATE budgets
SET
  department_id = NULL,
  updated_at = CURRENT_TIMESTAMP
WHERE budget_number IN (
  '410023',
  '410027',
  '420114'
);
