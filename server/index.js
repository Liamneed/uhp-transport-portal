import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'uhp-transport.sqlite');
const MIGRATIONS_DIR = path.join(ROOT, 'db', 'migrations');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const applied = db.prepare(
    'SELECT 1 FROM schema_migrations WHERE filename = ?'
  );

  const record = db.prepare(
    'INSERT INTO schema_migrations (filename) VALUES (?)'
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    if (applied.get(filename)) continue;

    const sql = fs.readFileSync(
      path.join(MIGRATIONS_DIR, filename),
      'utf8'
    );

    db.exec('BEGIN');
    try {
      db.exec(sql);
      record.run(filename);
      db.exec('COMMIT');
      console.log(`Applied migration: ${filename}`);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

function seedReferenceData() {
  db.exec('BEGIN');

  try {
    const insertDepartment = db.prepare(`
      INSERT OR IGNORE INTO departments
        (code, name, cost_centre, status)
      VALUES (?, ?, ?, 'active')
    `);

    insertDepartment.run('PATIENT_FLOW', 'Patient Flow', 'PF001');
    insertDepartment.run('RADIOLOGY', 'Radiology', 'RAD001');
    insertDepartment.run('FINANCE', 'Finance', 'FIN001');
    insertDepartment.run('DISCHARGE', 'Discharge', 'DIS001');

    const insertBudget = db.prepare(`
      INSERT OR IGNORE INTO budgets
        (budget_number, name, department_id, status)
      VALUES (
        ?,
        ?,
        (SELECT id FROM departments WHERE code = ?),
        'active'
      )
    `);

    insertBudget.run(
      '410023',
      'Patient Flow Transport',
      'PATIENT_FLOW'
    );
    insertBudget.run(
      '410027',
      'Discharge Transport',
      'DISCHARGE'
    );
    insertBudget.run(
      '420114',
      'Radiology Transport',
      'RADIOLOGY'
    );

    const insertReason = db.prepare(`
      INSERT OR IGNORE INTO reason_codes
        (code, description, status)
      VALUES (?, ?, 'active')
    `);

    insertReason.run('RC01', 'Patient Discharge');
    insertReason.run('RC02', 'Outpatient Transport');
    insertReason.run('RC03', 'Patient Transfer');
    insertReason.run('RC04', 'Treatment / Appointment');

    const insertUser = db.prepare(`
      INSERT OR IGNORE INTO users
        (
          first_name,
          last_name,
          email,
          department_id,
          status,
          email_verified_at,
          activated_at
        )
      VALUES (
        ?,
        ?,
        ?,
        (SELECT id FROM departments WHERE code = ?),
        ?,
        CASE WHEN ? = 'active' THEN CURRENT_TIMESTAMP ELSE NULL END,
        CASE WHEN ? = 'active' THEN CURRENT_TIMESTAMP ELSE NULL END
      )
    `);

    insertUser.run(
      'Sarah',
      'Jones',
      'sarah.jones@example.nhs.uk',
      'PATIENT_FLOW',
      'active',
      'active',
      'active'
    );

    insertUser.run(
      'Mark',
      'Brown',
      'mark.brown@example.nhs.uk',
      'RADIOLOGY',
      'active',
      'active',
      'active'
    );

    insertUser.run(
      'Helen',
      'Carter',
      'helen.carter@example.nhs.uk',
      'FINANCE',
      'invited',
      'invited',
      'invited'
    );

    insertUser.run(
      'James',
      'White',
      'james.white@example.nhs.uk',
      'DISCHARGE',
      'suspended',
      'suspended',
      'suspended'
    );

    const assignRole = db.prepare(`
      INSERT OR IGNORE INTO user_roles (user_id, role_id)
      SELECT u.id, r.id
      FROM users u, roles r
      WHERE u.email = ? COLLATE NOCASE
        AND r.code = ?
    `);

    assignRole.run(
      'sarah.jones@example.nhs.uk',
      'budget_holder'
    );
    assignRole.run(
      'mark.brown@example.nhs.uk',
      'booker'
    );
    assignRole.run(
      'helen.carter@example.nhs.uk',
      'finance'
    );
    assignRole.run(
      'james.white@example.nhs.uk',
      'booker'
    );

    const assignBudgetHolder = db.prepare(`
      INSERT INTO budget_assignments
        (
          budget_id,
          user_id,
          assignment_type,
          valid_from,
          is_active
        )
      SELECT
        b.id,
        u.id,
        'primary_holder',
        date('now'),
        1
      FROM budgets b, users u
      WHERE b.budget_number = ?
        AND u.email = ? COLLATE NOCASE
        AND NOT EXISTS (
          SELECT 1
          FROM budget_assignments ba
          WHERE ba.budget_id = b.id
            AND ba.user_id = u.id
            AND ba.assignment_type = 'primary_holder'
            AND ba.is_active = 1
        )
    `);

    assignBudgetHolder.run(
      '410023',
      'sarah.jones@example.nhs.uk'
    );
    assignBudgetHolder.run(
      '410027',
      'sarah.jones@example.nhs.uk'
    );

    const grantBudget = db.prepare(`
      INSERT OR IGNORE INTO user_budget_access
        (
          user_id,
          budget_id,
          can_book,
          can_view,
          can_approve,
          can_dispute,
          valid_from
        )
      SELECT
        u.id,
        b.id,
        ?,
        ?,
        ?,
        ?,
        date('now')
      FROM users u, budgets b
      WHERE u.email = ? COLLATE NOCASE
        AND b.budget_number = ?
    `);

    grantBudget.run(
      1, 1, 1, 1,
      'sarah.jones@example.nhs.uk',
      '410023'
    );
    grantBudget.run(
      1, 1, 1, 1,
      'sarah.jones@example.nhs.uk',
      '410027'
    );
    grantBudget.run(
      1, 0, 0, 0,
      'mark.brown@example.nhs.uk',
      '420114'
    );
    grantBudget.run(
      1, 0, 0, 0,
      'james.white@example.nhs.uk',
      '410023'
    );

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

runMigrations();
seedReferenceData();

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);

  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': 'http://localhost:5173',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  });

  res.end(body);
}

function listUsers() {
  return db.prepare(`
    SELECT
      u.id,
      u.first_name AS firstName,
      u.last_name AS lastName,
      u.email,
      u.mobile,
      u.status,
      d.id AS departmentId,
      d.name AS department,
      COALESCE(
        GROUP_CONCAT(DISTINCT r.name),
        ''
      ) AS roles,
      COALESCE((
        SELECT GROUP_CONCAT(b.budget_number, ', ')
        FROM user_budget_access uba
        JOIN budgets b ON b.id = uba.budget_id
        WHERE uba.user_id = u.id
          AND (uba.valid_to IS NULL OR uba.valid_to >= date('now'))
      ), '') AS budgets
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    GROUP BY u.id
    ORDER BY u.last_name, u.first_name
  `).all();
}

function listDepartments() {
  return db.prepare(`
    SELECT
      id,
      code,
      name,
      cost_centre AS costCentre,
      status
    FROM departments
    ORDER BY name
  `).all();
}

function listBudgets() {
  return db.prepare(`
    SELECT
      b.id,
      b.budget_number AS budgetNumber,
      b.name,
      b.status,
      d.id AS departmentId,
      d.name AS department,

      (
        SELECT u.id
        FROM budget_assignments ba
        JOIN users u ON u.id = ba.user_id
        WHERE ba.budget_id = b.id
          AND ba.assignment_type = 'primary_holder'
          AND ba.is_active = 1
          AND (ba.valid_to IS NULL OR ba.valid_to >= date('now'))
        ORDER BY ba.id DESC
        LIMIT 1
      ) AS holderUserId,

      (
        SELECT u.first_name || ' ' || u.last_name
        FROM budget_assignments ba
        JOIN users u ON u.id = ba.user_id
        WHERE ba.budget_id = b.id
          AND ba.assignment_type = 'primary_holder'
          AND ba.is_active = 1
          AND (ba.valid_to IS NULL OR ba.valid_to >= date('now'))
        ORDER BY ba.id DESC
        LIMIT 1
      ) AS budgetHolder,

      (
        SELECT u.id
        FROM budget_assignments ba
        JOIN users u ON u.id = ba.user_id
        WHERE ba.budget_id = b.id
          AND ba.assignment_type = 'deputy_holder'
          AND ba.is_active = 1
          AND (ba.valid_to IS NULL OR ba.valid_to >= date('now'))
        ORDER BY ba.id DESC
        LIMIT 1
      ) AS deputyUserId,

      (
        SELECT u.first_name || ' ' || u.last_name
        FROM budget_assignments ba
        JOIN users u ON u.id = ba.user_id
        WHERE ba.budget_id = b.id
          AND ba.assignment_type = 'deputy_holder'
          AND ba.is_active = 1
          AND (ba.valid_to IS NULL OR ba.valid_to >= date('now'))
        ORDER BY ba.id DESC
        LIMIT 1
      ) AS deputyHolder

    FROM budgets b
    LEFT JOIN departments d ON d.id = b.department_id
    ORDER BY b.budget_number
  `).all();
}

function listReasonCodes() {
  return db.prepare(`
    SELECT
      id,
      code,
      description,
      status
    FROM reason_codes
    ORDER BY code
  `).all();
}


function listRoles() {
  return db.prepare(`
    SELECT
      id,
      code,
      name,
      description
    FROM roles
    WHERE code IN (
      'booker',
      'budget_holder',
      'department_manager',
      'finance',
      'uhp_admin'
    )
    ORDER BY name
  `).all();
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;

      if (body.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });

    req.on('error', reject);
  });
}

function writeAudit({
  action,
  entityType,
  entityId,
  fieldName = null,
  oldValue = null,
  newValue = null,
  source = 'uhp_admin'
}) {
  db.prepare(`
    INSERT INTO audit_log
      (
        action,
        entity_type,
        entity_id,
        field_name,
        old_value,
        new_value,
        source
      )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    action,
    entityType,
    String(entityId),
    fieldName,
    oldValue,
    newValue,
    source
  );
}

function getUserById(userId) {
  return db.prepare(`
    SELECT
      id,
      first_name AS firstName,
      last_name AS lastName,
      email,
      status
    FROM users
    WHERE id = ?
  `).get(userId);
}

function createUser(payload) {
  const firstName = String(payload.firstName || '').trim();
  const lastName = String(payload.lastName || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const departmentId = Number(payload.departmentId);
  const roleCode = String(payload.roleCode || '').trim();
  const budgetIds = Array.from(
    new Set(
      Array.isArray(payload.budgetIds)
        ? payload.budgetIds.map(Number).filter(Number.isInteger)
        : []
    )
  );

  if (!firstName || !lastName || !email || !departmentId || !roleCode) {
    const error = new Error(
      'First name, last name, email, department and role are required'
    );
    error.statusCode = 400;
    throw error;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error('Enter a valid email address');
    error.statusCode = 400;
    throw error;
  }

  const duplicate = db.prepare(`
    SELECT id
    FROM users
    WHERE email = ? COLLATE NOCASE
  `).get(email);

  if (duplicate) {
    const error = new Error('A user with this email already exists');
    error.statusCode = 409;
    throw error;
  }

  const department = db.prepare(`
    SELECT id
    FROM departments
    WHERE id = ?
      AND status = 'active'
  `).get(departmentId);

  if (!department) {
    const error = new Error('Selected department is not valid');
    error.statusCode = 400;
    throw error;
  }

  const role = db.prepare(`
    SELECT id, code
    FROM roles
    WHERE code = ?
  `).get(roleCode);

  if (!role) {
    const error = new Error('Selected role is not valid');
    error.statusCode = 400;
    throw error;
  }

  if (budgetIds.length) {
    const placeholders = budgetIds.map(() => '?').join(',');

    const validCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM budgets
      WHERE id IN (${placeholders})
        AND status = 'active'
    `).get(...budgetIds).count;

    if (validCount !== budgetIds.length) {
      const error = new Error('One or more selected budgets are not valid');
      error.statusCode = 400;
      throw error;
    }
  }

  const permissionsByRole = {
    booker: [1, 0, 0, 0],
    budget_holder: [1, 1, 1, 1],
    department_manager: [1, 1, 1, 1],
    finance: [0, 1, 1, 1],
    uhp_admin: [1, 1, 1, 1]
  };

  const [
    canBook,
    canView,
    canApprove,
    canDispute
  ] = permissionsByRole[roleCode] || [0, 0, 0, 0];

  db.exec('BEGIN');

  try {
    const result = db.prepare(`
      INSERT INTO users
        (
          first_name,
          last_name,
          email,
          department_id,
          status,
          invited_at
        )
      VALUES (?, ?, ?, ?, 'invited', CURRENT_TIMESTAMP)
    `).run(
      firstName,
      lastName,
      email,
      departmentId
    );

    const userId = Number(result.lastInsertRowid);

    db.prepare(`
      INSERT INTO user_roles
        (user_id, role_id)
      VALUES (?, ?)
    `).run(userId, role.id);

    const grantBudget = db.prepare(`
      INSERT INTO user_budget_access
        (
          user_id,
          budget_id,
          can_book,
          can_view,
          can_approve,
          can_dispute,
          valid_from
        )
      VALUES (?, ?, ?, ?, ?, ?, date('now'))
    `);

    for (const budgetId of budgetIds) {
      grantBudget.run(
        userId,
        budgetId,
        canBook,
        canView,
        canApprove,
        canDispute
      );
    }

    writeAudit({
      action: 'CREATE',
      entityType: 'user',
      entityId: userId,
      newValue: JSON.stringify({
        firstName,
        lastName,
        email,
        departmentId,
        roleCode,
        budgetIds,
        status: 'invited'
      })
    });

    db.exec('COMMIT');

    return {
      id: userId,
      firstName,
      lastName,
      email,
      status: 'invited'
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function setUserStatus(userId, nextStatus) {
  const allowed = new Set([
    'active',
    'suspended',
    'archived'
  ]);

  if (!allowed.has(nextStatus)) {
    const error = new Error('Invalid user status');
    error.statusCode = 400;
    throw error;
  }

  const existing = getUserById(userId);

  if (!existing) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  if (existing.status === nextStatus) {
    return existing;
  }

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE users
      SET
        status = ?,
        activated_at = CASE
          WHEN ? = 'active'
            THEN COALESCE(activated_at, CURRENT_TIMESTAMP)
          ELSE activated_at
        END,
        suspended_at = CASE
          WHEN ? = 'suspended'
            THEN CURRENT_TIMESTAMP
          WHEN ? = 'active'
            THEN NULL
          ELSE suspended_at
        END,
        suspension_reason = CASE
          WHEN ? = 'active'
            THEN NULL
          ELSE suspension_reason
        END,
        archived_at = CASE
          WHEN ? = 'archived'
            THEN CURRENT_TIMESTAMP
          WHEN ? = 'active'
            THEN NULL
          ELSE archived_at
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      nextStatus,
      nextStatus,
      nextStatus,
      nextStatus,
      nextStatus,
      nextStatus,
      nextStatus,
      userId
    );

    writeAudit({
      action: 'STATUS_CHANGE',
      entityType: 'user',
      entityId: userId,
      fieldName: 'status',
      oldValue: existing.status,
      newValue: nextStatus
    });

    db.exec('COMMIT');

    return getUserById(userId);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}



function grantBudgetHolderAccess(userId, budgetId) {
  if (!userId) return;

  const existing = db.prepare(`
    SELECT id
    FROM user_budget_access
    WHERE user_id = ?
      AND budget_id = ?
      AND (valid_to IS NULL OR valid_to >= date('now'))
    ORDER BY id DESC
    LIMIT 1
  `).get(userId, budgetId);

  if (existing) {
    db.prepare(`
      UPDATE user_budget_access
      SET
        can_book = 1,
        can_view = 1,
        can_approve = 1,
        can_dispute = 1,
        valid_to = NULL
      WHERE id = ?
    `).run(existing.id);

    return;
  }

  db.prepare(`
    INSERT INTO user_budget_access
      (
        user_id,
        budget_id,
        can_book,
        can_view,
        can_approve,
        can_dispute,
        valid_from
      )
    VALUES (?, ?, 1, 1, 1, 1, date('now'))
  `).run(userId, budgetId);
}

function getBudgetById(budgetId) {
  return db.prepare(`
    SELECT
      id,
      budget_number AS budgetNumber,
      name,
      department_id AS departmentId,
      status
    FROM budgets
    WHERE id = ?
  `).get(budgetId);
}

function createBudget(payload) {
  const budgetNumber = String(payload.budgetNumber || '').trim();
  const name = String(payload.name || '').trim();
  const departmentId = Number(payload.departmentId);
  const holderUserId = payload.holderUserId
    ? Number(payload.holderUserId)
    : null;
  const deputyUserId = payload.deputyUserId
    ? Number(payload.deputyUserId)
    : null;

  if (!budgetNumber || !name || !departmentId) {
    const error = new Error(
      'Budget number, budget name and department are required'
    );
    error.statusCode = 400;
    throw error;
  }

  const duplicate = db.prepare(`
    SELECT id
    FROM budgets
    WHERE budget_number = ?
  `).get(budgetNumber);

  if (duplicate) {
    const error = new Error('This budget number already exists');
    error.statusCode = 409;
    throw error;
  }

  const department = db.prepare(`
    SELECT id
    FROM departments
    WHERE id = ?
      AND status = 'active'
  `).get(departmentId);

  if (!department) {
    const error = new Error('Selected department is not valid');
    error.statusCode = 400;
    throw error;
  }

  if (
    holderUserId &&
    deputyUserId &&
    holderUserId === deputyUserId
  ) {
    const error = new Error(
      'Primary and deputy budget holder must be different users'
    );
    error.statusCode = 400;
    throw error;
  }

  for (const [label, userId] of [
    ['budget holder', holderUserId],
    ['deputy budget holder', deputyUserId]
  ]) {
    if (!userId) continue;

    const user = db.prepare(`
      SELECT id
      FROM users
      WHERE id = ?
        AND status IN ('active','invited')
    `).get(userId);

    if (!user) {
      const error = new Error(`Selected ${label} is not valid`);
      error.statusCode = 400;
      throw error;
    }
  }

  db.exec('BEGIN');

  try {
    const result = db.prepare(`
      INSERT INTO budgets
        (
          budget_number,
          name,
          department_id,
          status,
          effective_from
        )
      VALUES (?, ?, ?, 'active', date('now'))
    `).run(
      budgetNumber,
      name,
      departmentId
    );

    const budgetId = Number(result.lastInsertRowid);

    const assignHolder = db.prepare(`
      INSERT INTO budget_assignments
        (
          budget_id,
          user_id,
          assignment_type,
          valid_from,
          is_active
        )
      VALUES (?, ?, ?, date('now'), 1)
    `);

    if (holderUserId) {
      assignHolder.run(
        budgetId,
        holderUserId,
        'primary_holder'
      );

      grantBudgetHolderAccess(
        holderUserId,
        budgetId
      );
    }

    if (deputyUserId && deputyUserId !== holderUserId) {
      assignHolder.run(
        budgetId,
        deputyUserId,
        'deputy_holder'
      );

      grantBudgetHolderAccess(
        deputyUserId,
        budgetId
      );
    }

    writeAudit({
      action: 'CREATE',
      entityType: 'budget',
      entityId: budgetId,
      newValue: JSON.stringify({
        budgetNumber,
        name,
        departmentId,
        holderUserId,
        deputyUserId,
        status: 'active'
      })
    });

    db.exec('COMMIT');

    return getBudgetById(budgetId);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function updateBudget(budgetId, payload) {
  const existing = getBudgetById(budgetId);

  if (!existing) {
    const error = new Error('Budget not found');
    error.statusCode = 404;
    throw error;
  }

  const name = String(payload.name || existing.name).trim();
  const departmentId = Number(
    payload.departmentId || existing.departmentId
  );
  const holderUserId =
    payload.holderUserId === null || payload.holderUserId === ''
      ? null
      : Number(payload.holderUserId);

  const deputyUserId =
    payload.deputyUserId === null || payload.deputyUserId === ''
      ? null
      : Number(payload.deputyUserId);

  if (!name || !departmentId) {
    const error = new Error(
      'Budget name and department are required'
    );
    error.statusCode = 400;
    throw error;
  }

  const department = db.prepare(`
    SELECT id
    FROM departments
    WHERE id = ?
      AND status = 'active'
  `).get(departmentId);

  if (!department) {
    const error = new Error('Selected department is not valid');
    error.statusCode = 400;
    throw error;
  }

  if (
    holderUserId &&
    deputyUserId &&
    holderUserId === deputyUserId
  ) {
    const error = new Error(
      'Primary and deputy budget holder must be different users'
    );
    error.statusCode = 400;
    throw error;
  }

  for (const [label, userId] of [
    ['budget holder', holderUserId],
    ['deputy budget holder', deputyUserId]
  ]) {
    if (!userId) continue;

    const user = db.prepare(`
      SELECT id
      FROM users
      WHERE id = ?
        AND status IN ('active','invited')
    `).get(userId);

    if (!user) {
      const error = new Error(`Selected ${label} is not valid`);
      error.statusCode = 400;
      throw error;
    }
  }

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE budgets
      SET
        name = ?,
        department_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name,
      departmentId,
      budgetId
    );

    db.prepare(`
      UPDATE budget_assignments
      SET
        is_active = 0,
        valid_to = date('now')
      WHERE budget_id = ?
        AND assignment_type IN ('primary_holder','deputy_holder')
        AND is_active = 1
    `).run(budgetId);

    const assignHolder = db.prepare(`
      INSERT INTO budget_assignments
        (
          budget_id,
          user_id,
          assignment_type,
          valid_from,
          is_active
        )
      VALUES (?, ?, ?, date('now'), 1)
    `);

    if (holderUserId) {
      assignHolder.run(
        budgetId,
        holderUserId,
        'primary_holder'
      );

      grantBudgetHolderAccess(
        holderUserId,
        budgetId
      );
    }

    if (deputyUserId && deputyUserId !== holderUserId) {
      assignHolder.run(
        budgetId,
        deputyUserId,
        'deputy_holder'
      );

      grantBudgetHolderAccess(
        deputyUserId,
        budgetId
      );
    }

    writeAudit({
      action: 'UPDATE',
      entityType: 'budget',
      entityId: budgetId,
      oldValue: JSON.stringify(existing),
      newValue: JSON.stringify({
        ...existing,
        name,
        departmentId,
        holderUserId,
        deputyUserId
      })
    });

    db.exec('COMMIT');

    return getBudgetById(budgetId);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function setBudgetStatus(budgetId, nextStatus) {
  if (!['active', 'inactive'].includes(nextStatus)) {
    const error = new Error('Invalid budget status');
    error.statusCode = 400;
    throw error;
  }

  const existing = getBudgetById(budgetId);

  if (!existing) {
    const error = new Error('Budget not found');
    error.statusCode = 404;
    throw error;
  }

  if (existing.status === nextStatus) {
    return existing;
  }

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE budgets
      SET
        status = ?,
        effective_to = CASE
          WHEN ? = 'inactive' THEN date('now')
          ELSE NULL
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      nextStatus,
      nextStatus,
      budgetId
    );

    writeAudit({
      action: 'STATUS_CHANGE',
      entityType: 'budget',
      entityId: budgetId,
      fieldName: 'status',
      oldValue: existing.status,
      newValue: nextStatus
    });

    db.exec('COMMIT');

    return getBudgetById(budgetId);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function getReasonCodeById(reasonCodeId) {
  return db.prepare(`
    SELECT
      id,
      code,
      description,
      status
    FROM reason_codes
    WHERE id = ?
  `).get(reasonCodeId);
}

function createReasonCode(payload) {
  const code = String(payload.code || '').trim().toUpperCase();
  const description = String(payload.description || '').trim();

  if (!code || !description) {
    const error = new Error(
      'Reason code and description are required'
    );
    error.statusCode = 400;
    throw error;
  }

  const duplicate = db.prepare(`
    SELECT id
    FROM reason_codes
    WHERE code = ?
  `).get(code);

  if (duplicate) {
    const error = new Error('This reason code already exists');
    error.statusCode = 409;
    throw error;
  }

  db.exec('BEGIN');

  try {
    const result = db.prepare(`
      INSERT INTO reason_codes
        (
          code,
          description,
          status,
          effective_from
        )
      VALUES (?, ?, 'active', date('now'))
    `).run(
      code,
      description
    );

    const reasonCodeId = Number(result.lastInsertRowid);

    writeAudit({
      action: 'CREATE',
      entityType: 'reason_code',
      entityId: reasonCodeId,
      newValue: JSON.stringify({
        code,
        description,
        status: 'active'
      })
    });

    db.exec('COMMIT');

    return getReasonCodeById(reasonCodeId);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function updateReasonCode(reasonCodeId, payload) {
  const existing = getReasonCodeById(reasonCodeId);

  if (!existing) {
    const error = new Error('Reason code not found');
    error.statusCode = 404;
    throw error;
  }

  const description = String(
    payload.description || existing.description
  ).trim();

  if (!description) {
    const error = new Error('Reason description is required');
    error.statusCode = 400;
    throw error;
  }

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE reason_codes
      SET
        description = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      description,
      reasonCodeId
    );

    writeAudit({
      action: 'UPDATE',
      entityType: 'reason_code',
      entityId: reasonCodeId,
      fieldName: 'description',
      oldValue: existing.description,
      newValue: description
    });

    db.exec('COMMIT');

    return getReasonCodeById(reasonCodeId);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function setReasonCodeStatus(reasonCodeId, nextStatus) {
  if (!['active', 'inactive'].includes(nextStatus)) {
    const error = new Error('Invalid reason code status');
    error.statusCode = 400;
    throw error;
  }

  const existing = getReasonCodeById(reasonCodeId);

  if (!existing) {
    const error = new Error('Reason code not found');
    error.statusCode = 404;
    throw error;
  }

  if (existing.status === nextStatus) {
    return existing;
  }

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE reason_codes
      SET
        status = ?,
        effective_to = CASE
          WHEN ? = 'inactive' THEN date('now')
          ELSE NULL
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      nextStatus,
      nextStatus,
      reasonCodeId
    );

    writeAudit({
      action: 'STATUS_CHANGE',
      entityType: 'reason_code',
      entityId: reasonCodeId,
      fieldName: 'status',
      oldValue: existing.status,
      newValue: nextStatus
    });

    db.exec('COMMIT');

    return getReasonCodeById(reasonCodeId);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': 'http://localhost:5173',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const url = new URL(req.url, 'http://localhost');

  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        service: 'uhp-transport-api',
        database: path.basename(DB_PATH)
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/users') {
      return sendJson(res, 200, {
        users: listUsers()
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/departments') {
      return sendJson(res, 200, {
        departments: listDepartments()
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/budgets') {
      return sendJson(res, 200, {
        budgets: listBudgets()
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/reason-codes') {
      return sendJson(res, 200, {
        reasonCodes: listReasonCodes()
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/roles') {
      return sendJson(res, 200, {
        roles: listRoles()
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/budgets') {
      const payload = await readJson(req);
      const budget = createBudget(payload);

      return sendJson(res, 201, {
        budget
      });
    }

    const budgetMatch = url.pathname.match(
      /^\/api\/budgets\/(\d+)$/
    );

    if (req.method === 'PATCH' && budgetMatch) {
      const payload = await readJson(req);
      const budgetId = Number(budgetMatch[1]);

      const budget = updateBudget(
        budgetId,
        payload
      );

      return sendJson(res, 200, {
        budget
      });
    }

    const budgetStatusMatch = url.pathname.match(
      /^\/api\/budgets\/(\d+)\/status$/
    );

    if (req.method === 'PATCH' && budgetStatusMatch) {
      const payload = await readJson(req);
      const budgetId = Number(budgetStatusMatch[1]);

      const budget = setBudgetStatus(
        budgetId,
        String(payload.status || '')
      );

      return sendJson(res, 200, {
        budget
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/reason-codes') {
      const payload = await readJson(req);
      const reasonCode = createReasonCode(payload);

      return sendJson(res, 201, {
        reasonCode
      });
    }

    const reasonCodeMatch = url.pathname.match(
      /^\/api\/reason-codes\/(\d+)$/
    );

    if (req.method === 'PATCH' && reasonCodeMatch) {
      const payload = await readJson(req);
      const reasonCodeId = Number(reasonCodeMatch[1]);

      const reasonCode = updateReasonCode(
        reasonCodeId,
        payload
      );

      return sendJson(res, 200, {
        reasonCode
      });
    }

    const reasonCodeStatusMatch = url.pathname.match(
      /^\/api\/reason-codes\/(\d+)\/status$/
    );

    if (req.method === 'PATCH' && reasonCodeStatusMatch) {
      const payload = await readJson(req);
      const reasonCodeId = Number(reasonCodeStatusMatch[1]);

      const reasonCode = setReasonCodeStatus(
        reasonCodeId,
        String(payload.status || '')
      );

      return sendJson(res, 200, {
        reasonCode
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/users') {
      const payload = await readJson(req);
      const user = createUser(payload);

      return sendJson(res, 201, {
        user
      });
    }

    const userStatusMatch = url.pathname.match(
      /^\/api\/users\/(\d+)\/status$/
    );

    if (req.method === 'PATCH' && userStatusMatch) {
      const payload = await readJson(req);
      const userId = Number(userStatusMatch[1]);

      const user = setUserStatus(
        userId,
        String(payload.status || '')
      );

      return sendJson(res, 200, {
        user
      });
    }

    return sendJson(res, 404, {
      error: 'Not found'
    });
  } catch (error) {
    console.error(error);

    return sendJson(
      res,
      error.statusCode || 500,
      {
        error:
          error.statusCode
            ? error.message
            : 'Internal server error'
      }
    );
  }
});

const PORT = Number(process.env.PORT || 3001);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`UHP API listening on http://localhost:${PORT}`);
  console.log(`SQLite database: ${DB_PATH}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
