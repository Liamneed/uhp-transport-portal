ALTER TABLE transport_requests
ADD COLUMN department_id INTEGER
  REFERENCES departments(id);

ALTER TABLE transport_requests
ADD COLUMN budget_id INTEGER
  REFERENCES budgets(id);

ALTER TABLE transport_requests
ADD COLUMN reason_code_id INTEGER
  REFERENCES reason_codes(id);

ALTER TABLE transport_requests
ADD COLUMN budget_holder_user_id INTEGER
  REFERENCES users(id);

CREATE INDEX idx_transport_requests_budget
ON transport_requests(
  budget_id,
  status,
  submitted_at
);

CREATE INDEX idx_transport_requests_department
ON transport_requests(
  department_id,
  submitted_at
);

CREATE TRIGGER trg_transport_requests_coding_insert
BEFORE INSERT ON transport_requests
FOR EACH ROW
WHEN
  NEW.department_id IS NULL
  OR NEW.budget_id IS NULL
  OR NEW.reason_code_id IS NULL
  OR NEW.budget_holder_user_id IS NULL
BEGIN
  SELECT RAISE(
    ABORT,
    'Transport request funding details are required'
  );
END;

CREATE TRIGGER trg_transport_requests_coding_update
BEFORE UPDATE OF
  department_id,
  budget_id,
  reason_code_id,
  budget_holder_user_id
ON transport_requests
FOR EACH ROW
WHEN
  NEW.department_id IS NULL
  OR NEW.budget_id IS NULL
  OR NEW.reason_code_id IS NULL
  OR NEW.budget_holder_user_id IS NULL
BEGIN
  SELECT RAISE(
    ABORT,
    'Transport request funding details are required'
  );
END;
