PRAGMA foreign_keys = ON;

CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  cost_centre TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  effective_from TEXT,
  effective_to TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  mobile TEXT,
  department_id INTEGER REFERENCES departments(id),
  job_title TEXT,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','suspended','archived')),
  email_verified_at TEXT,
  last_login_at TEXT,
  invited_at TEXT,
  activated_at TEXT,
  suspended_at TEXT,
  suspension_reason TEXT,
  archived_at TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_roles (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  role_id INTEGER NOT NULL REFERENCES roles(id),
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, role_id)
);

CREATE TABLE budgets (
  id INTEGER PRIMARY KEY,
  budget_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  effective_from TEXT,
  effective_to TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE budget_assignments (
  id INTEGER PRIMARY KEY,
  budget_id INTEGER NOT NULL REFERENCES budgets(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('primary_holder','deputy_holder','manager')),
  valid_from TEXT,
  valid_to TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_budget_access (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  budget_id INTEGER NOT NULL REFERENCES budgets(id),
  can_book INTEGER NOT NULL DEFAULT 0 CHECK (can_book IN (0,1)),
  can_view INTEGER NOT NULL DEFAULT 0 CHECK (can_view IN (0,1)),
  can_approve INTEGER NOT NULL DEFAULT 0 CHECK (can_approve IN (0,1)),
  can_dispute INTEGER NOT NULL DEFAULT 0 CHECK (can_dispute IN (0,1)),
  valid_from TEXT,
  valid_to TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, budget_id)
);

CREATE TABLE reason_codes (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  effective_from TEXT,
  effective_to TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  source TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_budgets_department ON budgets(department_id);
CREATE INDEX idx_budget_assignments_budget ON budget_assignments(budget_id, is_active);
CREATE INDEX idx_budget_assignments_user ON budget_assignments(user_id, is_active);
CREATE INDEX idx_user_budget_access_user ON user_budget_access(user_id);
CREATE INDEX idx_reason_codes_status ON reason_codes(status);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id, created_at);

INSERT INTO roles (code, name, description) VALUES
('booker','Booker','Can create and manage permitted transport bookings'),
('budget_holder','Budget Holder','Can oversee bookings and posted spend for assigned budgets'),
('department_manager','Department Manager','Can oversee assigned departmental transport'),
('finance','Finance','Can access financial and invoice reporting'),
('uhp_admin','UHP Admin','Can manage hospital users, budgets and reference data'),
('nac_controller','Need-A-Cab Controller','Can operate live UHP transport'),
('nac_admin','Need-A-Cab Admin','Can manage transport operations and integrations');
