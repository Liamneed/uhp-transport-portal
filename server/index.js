import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  createHash,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual
} from 'node:crypto';

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

function sendJson(
  res,
  statusCode,
  payload,
  extraHeaders = {}
) {
  const body = JSON.stringify(payload);

  res.writeHead(statusCode, {
    'Content-Type':
      'application/json; charset=utf-8',

    'Access-Control-Allow-Origin':
      'http://localhost:5173',

    'Access-Control-Allow-Methods':
      'GET,POST,PATCH,OPTIONS',

    'Access-Control-Allow-Headers':
      'Content-Type',

    'Access-Control-Allow-Credentials':
      'true',

    'Cache-Control':
      'no-store',

    ...extraHeaders
  });

  res.end(body);
}

function parseCookies(req) {
  const header = String(
    req.headers.cookie || ''
  );

  if (!header) return {};

  return header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf('=');

      if (index === -1) {
        return cookies;
      }

      const key =
        part.slice(0, index).trim();

      const value =
        part.slice(index + 1).trim();

      cookies[key] =
        decodeURIComponent(value);

      return cookies;
    }, {});
}

function hashSessionToken(token) {
  return createHash('sha256')
    .update(token)
    .digest('hex');
}

function hashOtp(code, salt) {
  return scryptSync(
    String(code),
    salt,
    32
  ).toString('hex');
}

function safeHashEqual(left, right) {
  try {
    const leftBuffer =
      Buffer.from(left, 'hex');

    const rightBuffer =
      Buffer.from(right, 'hex');

    if (
      leftBuffer.length !==
      rightBuffer.length
    ) {
      return false;
    }

    return timingSafeEqual(
      leftBuffer,
      rightBuffer
    );
  } catch {
    return false;
  }
}

function getRequestIp(req) {
  const forwarded =
    String(
      req.headers['x-forwarded-for'] || ''
    )
      .split(',')[0]
      .trim();

  return (
    forwarded ||
    req.socket.remoteAddress ||
    null
  );
}

function buildSessionCookie(token) {
  const parts = [
    `uhp_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=28800'
  ];

  if (
    process.env.NODE_ENV === 'production'
  ) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function buildExpiredSessionCookie() {
  const parts = [
    'uhp_session=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];

  if (
    process.env.NODE_ENV === 'production'
  ) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function getAuthUserById(userId) {
  const user = db.prepare(`
    SELECT
      u.id,
      u.first_name AS firstName,
      u.last_name AS lastName,
      u.email,
      u.mobile,
      u.status,
      u.department_id AS departmentId,
      d.name AS department,
      u.job_title AS jobTitle,
      u.email_verified_at AS emailVerifiedAt,
      u.last_login_at AS lastLoginAt
    FROM users u
    LEFT JOIN departments d
      ON d.id = u.department_id
    WHERE u.id = ?
  `).get(userId);

  if (!user) return null;

  const roles = db.prepare(`
    SELECT
      r.id,
      r.code,
      r.name
    FROM user_roles ur
    JOIN roles r
      ON r.id = ur.role_id
    WHERE ur.user_id = ?
    ORDER BY r.id
  `).all(userId);

  return {
    ...user,
    roles
  };
}

function getAuthSession(req) {
  const cookies = parseCookies(req);

  const token =
    cookies.uhp_session;

  if (!token) {
    return null;
  }

  const sessionHash =
    hashSessionToken(token);

  const session = db.prepare(`
    SELECT
      id,
      user_id AS userId,
      expires_at AS expiresAt
    FROM auth_sessions
    WHERE session_hash = ?
      AND revoked_at IS NULL
      AND expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `).get(sessionHash);

  if (!session) {
    return null;
  }

  const user =
    getAuthUserById(session.userId);

  if (
    !user ||
    user.status !== 'active'
  ) {
    return null;
  }

  db.prepare(`
    UPDATE auth_sessions
    SET last_seen_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(session.id);

  return {
    sessionId: session.id,
    user
  };
}

function requireAuth(req) {
  const auth = getAuthSession(req);

  if (!auth) {
    const error = new Error(
      'Authentication required'
    );

    error.statusCode = 401;

    throw error;
  }

  return auth;
}

function userHasAnyRole(
  user,
  allowedRoles
) {
  const roleCodes = new Set(
    user.roles.map(
      (role) => role.code
    )
  );

  return allowedRoles.some(
    (role) => roleCodes.has(role)
  );
}

function requireAnyRole(
  req,
  allowedRoles
) {
  const auth = requireAuth(req);

  if (
    !userHasAnyRole(
      auth.user,
      allowedRoles
    )
  ) {
    const error = new Error(
      'You do not have permission to access this resource'
    );

    error.statusCode = 403;

    throw error;
  }

  return auth;
}


function enforceApiAccess(
  req,
  url
) {
  const pathname = url.pathname;

  /*
    Public endpoints are handled before
    this guard is called.
  */

  if (
    pathname.startsWith(
      '/api/control/'
    )
  ) {
    return requireAnyRole(
      req,
      [
        'nac_controller',
        'nac_admin'
      ]
    );
  }

  if (
    pathname === '/api/users' ||
    pathname.startsWith(
      '/api/users/'
    ) ||
    pathname === '/api/roles'
  ) {
    return requireAnyRole(
      req,
      ['uhp_admin']
    );
  }

  if (
    pathname === '/api/budgets' ||
    pathname.startsWith(
      '/api/budgets/'
    ) ||
    pathname ===
      '/api/reason-codes' ||
    pathname.startsWith(
      '/api/reason-codes/'
    )
  ) {
    if (req.method === 'GET') {
      return requireAuth(req);
    }

    return requireAnyRole(
      req,
      ['uhp_admin']
    );
  }

  if (
    pathname ===
      '/api/departments'
  ) {
    return requireAuth(req);
  }

  if (
    pathname === '/api/budget-bookings' ||
    pathname === '/api/budget-invoice-ready'
  ) {
    return requireAnyRole(
      req,
      ['budget_holder']
    );
  }

  if (
    pathname ===
      '/api/booking-options' ||
    pathname ===
      '/api/my-bookings' ||
    pathname ===
      '/api/bookings' ||
    pathname.startsWith(
      '/api/bookings/'
    )
  ) {
    return requireAuth(req);
  }

  return null;
}

function requestLoginCode(
  email,
  req
) {
  const normalisedEmail =
    String(email || '')
      .trim()
      .toLowerCase();

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalisedEmail
    )
  ) {
    const error = new Error(
      'Enter a valid email address'
    );

    error.statusCode = 400;

    throw error;
  }

  const user = db.prepare(`
    SELECT
      id,
      first_name AS firstName,
      last_name AS lastName,
      email,
      status
    FROM users
    WHERE email = ? COLLATE NOCASE
  `).get(normalisedEmail);

  if (!user) {
    const error = new Error(
      'No portal account exists for this email address'
    );

    error.statusCode = 404;

    throw error;
  }

  if (user.status === 'suspended') {
    const error = new Error(
      'This portal account is suspended'
    );

    error.statusCode = 403;

    throw error;
  }

  if (user.status === 'archived') {
    const error = new Error(
      'This portal account is no longer active'
    );

    error.statusCode = 403;

    throw error;
  }

  if (
    !['active', 'invited'].includes(
      user.status
    )
  ) {
    const error = new Error(
      'This account cannot sign in'
    );

    error.statusCode = 403;

    throw error;
  }

  db.prepare(`
    UPDATE auth_login_challenges
    SET consumed_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
      AND consumed_at IS NULL
  `).run(user.id);

  db.prepare(`
    DELETE FROM auth_login_challenges
    WHERE expires_at <= CURRENT_TIMESTAMP
  `).run();

  db.prepare(`
    DELETE FROM auth_sessions
    WHERE expires_at <= CURRENT_TIMESTAMP
       OR (
         revoked_at IS NOT NULL
         AND revoked_at <= datetime(
           'now',
           '-7 days'
         )
       )
  `).run();

  const challengeId =
    randomBytes(24).toString('hex');

  const code =
    String(
      randomInt(0, 1000000)
    ).padStart(6, '0');

  const salt =
    randomBytes(16).toString('hex');

  const codeHash =
    hashOtp(code, salt);

  db.prepare(`
    INSERT INTO auth_login_challenges
      (
        id,
        user_id,
        email,
        code_hash,
        code_salt,
        attempts,
        max_attempts,
        expires_at
      )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      ?,
      0,
      5,
      datetime(
        'now',
        '+10 minutes'
      )
    )
  `).run(
    challengeId,
    user.id,
    user.email,
    codeHash,
    salt
  );

  /*
    Development delivery only.

    The OTP is deliberately NOT returned
    through the HTTP API.

    Email delivery will replace this log
    before deployment.
  */
  console.log(
    `[AUTH DEV] OTP for ${user.email}: ${code} challenge=${challengeId}`
  );

  return {
    challengeId,
    email: user.email,
    expiresInSeconds: 600
  };
}

function verifyLoginCode(
  challengeId,
  code,
  req
) {
  const cleanChallengeId =
    String(challengeId || '').trim();

  const cleanCode =
    String(code || '')
      .replace(/\D/g, '');

  if (
    !cleanChallengeId ||
    cleanCode.length !== 6
  ) {
    const error = new Error(
      'Enter the 6-digit verification code'
    );

    error.statusCode = 400;

    throw error;
  }

  const challenge = db.prepare(`
    SELECT
      id,
      user_id AS userId,
      email,
      code_hash AS codeHash,
      code_salt AS codeSalt,
      attempts,
      max_attempts AS maxAttempts,
      expires_at AS expiresAt,
      consumed_at AS consumedAt
    FROM auth_login_challenges
    WHERE id = ?
  `).get(cleanChallengeId);

  if (
    !challenge ||
    challenge.consumedAt
  ) {
    const error = new Error(
      'This verification code is no longer valid'
    );

    error.statusCode = 400;

    throw error;
  }

  const expiryCheck = db.prepare(`
    SELECT
      CASE
        WHEN ? > CURRENT_TIMESTAMP
        THEN 1
        ELSE 0
      END AS valid
  `).get(challenge.expiresAt);

  if (!expiryCheck?.valid) {
    db.prepare(`
      UPDATE auth_login_challenges
      SET consumed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(challenge.id);

    const error = new Error(
      'This verification code has expired'
    );

    error.statusCode = 400;

    throw error;
  }

  if (
    challenge.attempts >=
    challenge.maxAttempts
  ) {
    const error = new Error(
      'Too many incorrect attempts'
    );

    error.statusCode = 429;

    throw error;
  }

  const suppliedHash =
    hashOtp(
      cleanCode,
      challenge.codeSalt
    );

  if (
    !safeHashEqual(
      challenge.codeHash,
      suppliedHash
    )
  ) {
    const nextAttempts =
      challenge.attempts + 1;

    db.prepare(`
      UPDATE auth_login_challenges
      SET
        attempts = ?,
        consumed_at = CASE
          WHEN ? >= max_attempts
          THEN CURRENT_TIMESTAMP
          ELSE consumed_at
        END
      WHERE id = ?
    `).run(
      nextAttempts,
      nextAttempts,
      challenge.id
    );

    const error = new Error(
      nextAttempts >=
        challenge.maxAttempts
        ? 'Too many incorrect attempts'
        : 'The verification code is incorrect'
    );

    error.statusCode =
      nextAttempts >=
        challenge.maxAttempts
        ? 429
        : 400;

    throw error;
  }

  const user = db.prepare(`
    SELECT
      id,
      status
    FROM users
    WHERE id = ?
  `).get(challenge.userId);

  if (!user) {
    const error = new Error(
      'Portal account not found'
    );

    error.statusCode = 404;

    throw error;
  }

  if (
    !['active', 'invited'].includes(
      user.status
    )
  ) {
    const error = new Error(
      'This account cannot sign in'
    );

    error.statusCode = 403;

    throw error;
  }

  const rawSessionToken =
    randomBytes(32).toString('hex');

  const sessionHash =
    hashSessionToken(
      rawSessionToken
    );

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE auth_login_challenges
      SET consumed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(challenge.id);

    db.prepare(`
      UPDATE users
      SET
        status = CASE
          WHEN status = 'invited'
          THEN 'active'
          ELSE status
        END,

        email_verified_at =
          COALESCE(
            email_verified_at,
            CURRENT_TIMESTAMP
          ),

        activated_at =
          CASE
            WHEN status = 'invited'
            THEN COALESCE(
              activated_at,
              CURRENT_TIMESTAMP
            )
            ELSE activated_at
          END,

        last_login_at =
          CURRENT_TIMESTAMP,

        updated_at =
          CURRENT_TIMESTAMP

      WHERE id = ?
    `).run(user.id);

    db.prepare(`
      INSERT INTO auth_sessions
        (
          session_hash,
          user_id,
          expires_at,
          last_seen_at,
          ip_address,
          user_agent
        )
      VALUES (
        ?,
        ?,
        datetime(
          'now',
          '+8 hours'
        ),
        CURRENT_TIMESTAMP,
        ?,
        ?
      )
    `).run(
      sessionHash,
      user.id,
      getRequestIp(req),
      String(
        req.headers['user-agent'] || ''
      ) || null
    );

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return {
    token: rawSessionToken,
    user: getAuthUserById(user.id)
  };
}

function logoutAuthSession(req) {
  const cookies = parseCookies(req);

  const token =
    cookies.uhp_session;

  if (!token) {
    return;
  }

  db.prepare(`
    UPDATE auth_sessions
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE session_hash = ?
      AND revoked_at IS NULL
  `).run(
    hashSessionToken(token)
  );
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
  source = 'uhp_admin',
  actorUserId = null
}) {
  db.prepare(`
    INSERT INTO audit_log
      (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        field_name,
        old_value,
        new_value,
        source
      )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    actorUserId,
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



function getBookingOptions(userId) {
  const user = db.prepare(`
    SELECT
      id,
      first_name AS firstName,
      last_name AS lastName,
      email,
      department_id AS departmentId,
      status
    FROM users
    WHERE id = ?
  `).get(userId);

  if (!user || user.status !== 'active') {
    const error = new Error(
      'Booking user must be an active portal user'
    );
    error.statusCode = 403;
    throw error;
  }

  const budgets = db.prepare(`
    SELECT
      b.id,
      b.budget_number AS budgetNumber,
      b.name,
      d.name AS department,

      holder.id AS holderUserId,
      holder.first_name || ' ' || holder.last_name AS budgetHolder

    FROM user_budget_access uba

    JOIN budgets b
      ON b.id = uba.budget_id

    LEFT JOIN departments d
      ON d.id = b.department_id

    JOIN budget_assignments ba
      ON ba.budget_id = b.id
      AND ba.assignment_type = 'primary_holder'
      AND ba.is_active = 1
      AND (
        ba.valid_from IS NULL OR
        ba.valid_from <= date('now')
      )
      AND (
        ba.valid_to IS NULL OR
        ba.valid_to >= date('now')
      )

    JOIN users holder
      ON holder.id = ba.user_id

    WHERE uba.user_id = ?
      AND uba.can_book = 1
      AND b.status = 'active'
      AND (
        uba.valid_from IS NULL OR
        uba.valid_from <= date('now')
      )
      AND (
        uba.valid_to IS NULL OR
        uba.valid_to >= date('now')
      )

    GROUP BY b.id
    ORDER BY b.budget_number
  `).all(userId);

  const reasonCodes = db.prepare(`
    SELECT
      id,
      code,
      description
    FROM reason_codes
    WHERE status = 'active'
      AND (
        effective_from IS NULL OR
        effective_from <= date('now')
      )
      AND (
        effective_to IS NULL OR
        effective_to >= date('now')
      )
    ORDER BY code
  `).all();

  return {
    user,
    budgets,
    reasonCodes
  };
}



function listOperationalBookings() {
  const bookings = db.prepare(`
    SELECT
      b.id,
      b.public_reference AS publicReference,

      b.autocab_booking_id AS autocabBookingId,
      b.autocab_reference AS autocabReference,

      b.source,
      b.operational_status AS operationalStatus,
      b.financial_status AS financialStatus,

      b.requested_pickup_at AS requestedPickupAt,

      b.passenger_name AS passengerName,
      b.passenger_mobile AS passengerMobile,
      b.passenger_count AS passengerCount,

      b.pickup_address AS pickupAddress,
      b.pickup_postcode AS pickupPostcode,

      b.destination_address AS destinationAddress,
      b.destination_postcode AS destinationPostcode,

      b.driver_notes AS driverNotes,
      b.internal_notes AS internalNotes,

      b.budget_id AS budgetId,
      bu.budget_number AS budgetNumber,
      bu.name AS budgetName,

      b.reason_code_id AS reasonCodeId,
      rc.code AS reasonCode,
      rc.description AS reasonDescription,

      b.budget_holder_user_id AS budgetHolderUserId,
      holder.first_name || ' ' || holder.last_name AS budgetHolder,

      b.created_by_user_id AS createdByUserId,
      creator.first_name || ' ' || creator.last_name AS createdBy,

      b.department_id AS departmentId,
      d.name AS department,

      b.submitted_at AS submittedAt,
      b.confirmed_at AS confirmedAt,
      b.completed_at AS completedAt,
      b.cancelled_at AS cancelledAt,

      b.created_at AS createdAt,
      b.updated_at AS updatedAt

    FROM bookings b

    JOIN budgets bu
      ON bu.id = b.budget_id

    JOIN reason_codes rc
      ON rc.id = b.reason_code_id

    JOIN users holder
      ON holder.id = b.budget_holder_user_id

    JOIN users creator
      ON creator.id = b.created_by_user_id

    LEFT JOIN departments d
      ON d.id = b.department_id

    ORDER BY
      datetime(b.requested_pickup_at) DESC,
      b.id DESC
  `).all();

  const stopsStatement = db.prepare(`
    SELECT
      sequence_number AS sequenceNumber,
      stop_type AS stopType,
      address,
      postcode,
      notes
    FROM booking_stops
    WHERE booking_id = ?
    ORDER BY sequence_number
  `);

  const eventsStatement = db.prepare(`
    SELECT
      id,
      event_type AS eventType,
      event_source AS eventSource,
      event_at AS eventAt,
      old_status AS oldStatus,
      new_status AS newStatus,
      user_id AS userId,
      notes
    FROM booking_events
    WHERE booking_id = ?
    ORDER BY id DESC
  `);

  return bookings.map((booking) => {
    const exceptionReasons = [];

    if (
      booking.operationalStatus === 'failed'
    ) {
      exceptionReasons.push(
        'Booking submission failed'
      );
    }

    if (
      booking.operationalStatus ===
      'requires_review'
    ) {
      exceptionReasons.push(
        'Booking requires review'
      );
    }

    if (
      booking.financialStatus ===
      'coding_required'
    ) {
      exceptionReasons.push(
        'Financial coding required'
      );
    }

    if (
      booking.financialStatus ===
      'disputed'
    ) {
      exceptionReasons.push(
        'Financial status disputed'
      );
    }

    if (
      booking.financialStatus ===
      'adjustment_required'
    ) {
      exceptionReasons.push(
        'Financial adjustment required'
      );
    }

    return {
      ...booking,

      stops:
        stopsStatement.all(booking.id),

      events:
        eventsStatement.all(booking.id),

      hasException:
        exceptionReasons.length > 0,

      exceptionReasons
    };
  });
}

function getControlSummary() {
  const bookings = listOperationalBookings();

  const now = new Date();

  const today =
    now.toISOString().slice(0, 10);

  const activeStatuses = new Set([
    'draft',
    'submitting',
    'booked',
    'confirmed',
    'driver_allocated',
    'driver_en_route',
    'driver_arrived',
    'passenger_on_board',
    'requires_review'
  ]);

  const active = bookings.filter(
    (booking) =>
      activeStatuses.has(
        booking.operationalStatus
      )
  );

  return {
    total: bookings.length,

    active: active.length,

    dueToday: active.filter(
      (booking) =>
        String(
          booking.requestedPickupAt || ''
        ).slice(0, 10) === today
    ).length,

    requestRecorded: bookings.filter(
      (booking) =>
        booking.operationalStatus === 'draft'
    ).length,

    completed: bookings.filter(
      (booking) =>
        booking.operationalStatus ===
        'completed'
    ).length,

    cancelled: bookings.filter(
      (booking) =>
        booking.operationalStatus ===
        'cancelled'
    ).length,

    exceptions: bookings.filter(
      (booking) =>
        booking.hasException
    ).length
  };
}

function listBookingsForUser(userId) {
  const user = db.prepare(`
    SELECT
      id,
      status
    FROM users
    WHERE id = ?
  `).get(userId);

  if (!user || user.status !== 'active') {
    const error = new Error(
      'Booking user must be an active portal user'
    );
    error.statusCode = 403;
    throw error;
  }

  const bookings = db.prepare(`
    SELECT
      b.id,
      b.public_reference AS publicReference,
      b.operational_status AS operationalStatus,
      b.financial_status AS financialStatus,
      b.requested_pickup_at AS requestedPickupAt,
      b.passenger_name AS passengerName,
      b.passenger_mobile AS passengerMobile,
      b.passenger_count AS passengerCount,
      b.pickup_address AS pickupAddress,
      b.pickup_postcode AS pickupPostcode,
      b.destination_address AS destinationAddress,
      b.destination_postcode AS destinationPostcode,
      b.driver_notes AS driverNotes,
      b.created_at AS createdAt,

      bu.budget_number AS budgetNumber,
      bu.name AS budgetName,

      rc.code AS reasonCode,
      rc.description AS reasonDescription,

      holder.first_name || ' ' || holder.last_name AS budgetHolder

    FROM bookings b

    JOIN budgets bu
      ON bu.id = b.budget_id

    JOIN reason_codes rc
      ON rc.id = b.reason_code_id

    JOIN users holder
      ON holder.id = b.budget_holder_user_id

    WHERE b.created_by_user_id = ?

    ORDER BY
      datetime(b.requested_pickup_at) DESC,
      b.id DESC
  `).all(userId);

  const stopsStatement = db.prepare(`
    SELECT
      sequence_number AS sequenceNumber,
      stop_type AS stopType,
      address,
      postcode,
      notes
    FROM booking_stops
    WHERE booking_id = ?
    ORDER BY sequence_number
  `);

  return bookings.map((booking) => ({
    ...booking,
    stops: stopsStatement.all(booking.id)
  }));
}


function listBudgetVisibleBookings(userId) {
  const bookings = db.prepare(`
    SELECT
      b.id,
      b.public_reference AS publicReference,

      b.operational_status AS operationalStatus,
      b.financial_status AS financialStatus,

      b.requested_pickup_at AS requestedPickupAt,

      b.passenger_name AS passengerName,
      b.passenger_mobile AS passengerMobile,
      b.passenger_count AS passengerCount,

      b.pickup_address AS pickupAddress,
      b.pickup_postcode AS pickupPostcode,

      b.destination_address AS destinationAddress,
      b.destination_postcode AS destinationPostcode,

      b.driver_notes AS driverNotes,

      b.budget_id AS budgetId,
      bu.budget_number AS budgetNumber,
      bu.name AS budgetName,

      b.reason_code_id AS reasonCodeId,
      rc.code AS reasonCode,
      rc.description AS reasonDescription,

      b.budget_holder_user_id AS budgetHolderUserId,
      holder.first_name || ' ' ||
        holder.last_name AS budgetHolder,

      b.created_by_user_id AS createdByUserId,
      creator.first_name || ' ' ||
        creator.last_name AS createdBy,

      b.department_id AS departmentId,
      d.name AS department,

      b.completed_at AS completedAt,

      bf.gross_amount_pence AS grossAmountPence,
      bf.net_amount_pence AS netAmountPence,
      bf.vat_amount_pence AS vatAmountPence,
      bf.currency AS currency,
      bf.source AS financialSource,
      bf.external_reference AS financialExternalReference,
      bf.received_at AS financialReceivedAt,

      b.created_at AS createdAt,
      b.updated_at AS updatedAt

    FROM bookings b

    LEFT JOIN booking_financials bf
      ON bf.booking_id = b.id

    JOIN budgets bu
      ON bu.id = b.budget_id

    JOIN reason_codes rc
      ON rc.id = b.reason_code_id

    JOIN users holder
      ON holder.id = b.budget_holder_user_id

    JOIN users creator
      ON creator.id = b.created_by_user_id

    LEFT JOIN departments d
      ON d.id = b.department_id

    WHERE EXISTS (
      SELECT 1
      FROM user_budget_access uba

      WHERE uba.user_id = ?
        AND uba.budget_id = b.budget_id
        AND uba.can_view = 1

        AND (
          uba.valid_from IS NULL OR
          uba.valid_from <= date('now')
        )

        AND (
          uba.valid_to IS NULL OR
          uba.valid_to >= date('now')
        )
    )

    ORDER BY
      datetime(b.requested_pickup_at) DESC,
      b.id DESC
  `).all(userId);

  const stopsStatement = db.prepare(`
    SELECT
      sequence_number AS sequenceNumber,
      stop_type AS stopType,
      address,
      postcode,
      notes

    FROM booking_stops

    WHERE booking_id = ?

    ORDER BY sequence_number
  `);

  return bookings.map((booking) => ({
    ...booking,

    stops:
      stopsStatement.all(booking.id)
  }));
}



function listBudgetInvoiceReadyBookings(
  userId
) {
  return listBudgetVisibleBookings(
    userId
  ).filter(
    (booking) =>
      [
        'approved_for_invoice',
        'invoiced'
      ].includes(
        booking.financialStatus
      )
  );
}


function getBookingById(bookingId) {
  return db.prepare(`
    SELECT
      b.id,
      b.public_reference AS publicReference,
      b.operational_status AS operationalStatus,
      b.financial_status AS financialStatus,
      b.requested_pickup_at AS requestedPickupAt,
      b.passenger_name AS passengerName,
      b.passenger_mobile AS passengerMobile,
      b.passenger_count AS passengerCount,
      b.pickup_address AS pickupAddress,
      b.pickup_postcode AS pickupPostcode,
      b.destination_address AS destinationAddress,
      b.destination_postcode AS destinationPostcode,
      b.driver_notes AS driverNotes,
      b.internal_notes AS internalNotes,
      b.budget_id AS budgetId,
      bu.budget_number AS budgetNumber,
      bu.name AS budgetName,
      b.reason_code_id AS reasonCodeId,
      rc.code AS reasonCode,
      rc.description AS reasonDescription,
      b.budget_holder_user_id AS budgetHolderUserId,
      holder.first_name || ' ' || holder.last_name AS budgetHolder,
      b.created_by_user_id AS createdByUserId,
      creator.first_name || ' ' || creator.last_name AS createdBy,
      b.department_id AS departmentId,
      d.name AS department,
      b.created_at AS createdAt
    FROM bookings b
    JOIN budgets bu ON bu.id = b.budget_id
    JOIN reason_codes rc ON rc.id = b.reason_code_id
    JOIN users holder ON holder.id = b.budget_holder_user_id
    JOIN users creator ON creator.id = b.created_by_user_id
    LEFT JOIN departments d ON d.id = b.department_id
    WHERE b.id = ?
  `).get(bookingId);
}


function getOwnedBookingDetails(
  bookingId,
  userId
) {
  const booking = getBookingById(bookingId);

  if (
    !booking ||
    booking.createdByUserId !== userId
  ) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    ...booking,
    stops: getBookingStops(bookingId)
  };
}

function getBookingStops(bookingId) {
  return db.prepare(`
    SELECT
      id,
      sequence_number AS sequenceNumber,
      stop_type AS stopType,
      address,
      postcode,
      notes
    FROM booking_stops
    WHERE booking_id = ?
    ORDER BY sequence_number
  `).all(bookingId);
}

function normaliseStop(rawStop) {
  if (typeof rawStop === 'string') {
    return {
      address: rawStop.trim(),
      postcode: '',
      notes: ''
    };
  }

  return {
    address: String(rawStop?.address || '').trim(),
    postcode: String(rawStop?.postcode || '').trim(),
    notes: String(rawStop?.notes || '').trim()
  };
}

function parseRequiredPositiveInteger(value, label) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 1) {
    const error = new Error(`${label} must be at least 1`);
    error.statusCode = 400;
    throw error;
  }

  return number;
}


function getOwnedEditableBooking(bookingId, userId) {
  const booking = db.prepare(`
    SELECT
      *
    FROM bookings
    WHERE id = ?
      AND created_by_user_id = ?
  `).get(
    bookingId,
    userId
  );

  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }

  if (booking.operational_status !== 'draft') {
    const error = new Error(
      'This booking can no longer be amended locally'
    );
    error.statusCode = 409;
    throw error;
  }

  return booking;
}

function validateBookingCoding({
  userId,
  budgetId,
  reasonCodeId
}) {
  const creator = db.prepare(`
    SELECT
      id,
      first_name AS firstName,
      last_name AS lastName,
      department_id AS departmentId,
      status
    FROM users
    WHERE id = ?
  `).get(userId);

  if (!creator || creator.status !== 'active') {
    const error = new Error(
      'The booking user must be an active portal user'
    );
    error.statusCode = 403;
    throw error;
  }

  const budget = db.prepare(`
    SELECT
      b.id,
      b.budget_number AS budgetNumber,
      b.name,
      b.department_id AS departmentId,
      d.name AS departmentName,
      b.status
    FROM budgets b
    LEFT JOIN departments d
      ON d.id = b.department_id
    WHERE b.id = ?
  `).get(budgetId);

  if (!budget || budget.status !== 'active') {
    const error = new Error(
      'The selected UHP budget is not active'
    );
    error.statusCode = 400;
    throw error;
  }

  const permission = db.prepare(`
    SELECT id
    FROM user_budget_access
    WHERE user_id = ?
      AND budget_id = ?
      AND can_book = 1
      AND (
        valid_from IS NULL OR
        valid_from <= date('now')
      )
      AND (
        valid_to IS NULL OR
        valid_to >= date('now')
      )
    ORDER BY id DESC
    LIMIT 1
  `).get(
    userId,
    budgetId
  );

  if (!permission) {
    const error = new Error(
      'This user is not authorised to book against the selected budget'
    );
    error.statusCode = 403;
    throw error;
  }

  const reasonCode = db.prepare(`
    SELECT
      id,
      code,
      description,
      status
    FROM reason_codes
    WHERE id = ?
  `).get(reasonCodeId);

  if (!reasonCode || reasonCode.status !== 'active') {
    const error = new Error(
      'The selected reason code is not active'
    );
    error.statusCode = 400;
    throw error;
  }

  const budgetHolder = db.prepare(`
    SELECT
      u.id,
      u.first_name AS firstName,
      u.last_name AS lastName
    FROM budget_assignments ba
    JOIN users u
      ON u.id = ba.user_id
    WHERE ba.budget_id = ?
      AND ba.assignment_type = 'primary_holder'
      AND ba.is_active = 1
      AND (
        ba.valid_from IS NULL OR
        ba.valid_from <= date('now')
      )
      AND (
        ba.valid_to IS NULL OR
        ba.valid_to >= date('now')
      )
    ORDER BY ba.id DESC
    LIMIT 1
  `).get(budgetId);

  if (!budgetHolder) {
    const error = new Error(
      'The selected budget has no active primary budget holder'
    );
    error.statusCode = 409;
    throw error;
  }

  return {
    creator,
    budget,
    reasonCode,
    budgetHolder
  };
}

function amendPortalBooking(
  bookingId,
  userId,
  payload
) {
  const existing = getOwnedEditableBooking(
    bookingId,
    userId
  );

  const requestedPickupAt = String(
    payload.requestedPickupAt || ''
  ).trim();

  const passengerName = String(
    payload.passengerName || ''
  ).trim();

  const passengerMobile = String(
    payload.passengerMobile || ''
  ).trim();

  const passengerCount =
    parseRequiredPositiveInteger(
      payload.passengerCount ?? 1,
      'Passenger count'
    );

  const pickup = normaliseStop(payload.pickup);
  const destination =
    normaliseStop(payload.destination);

  const vias = Array.isArray(payload.vias)
    ? payload.vias
        .map(normaliseStop)
        .filter((stop) => stop.address)
    : [];

  const driverNotes = String(
    payload.driverNotes || ''
  ).trim();

  const budgetId = Number(payload.budgetId);
  const reasonCodeId = Number(payload.reasonCodeId);

  if (!requestedPickupAt) {
    const error = new Error(
      'Pickup date and time are required'
    );
    error.statusCode = 400;
    throw error;
  }

  if (
    Number.isNaN(
      new Date(requestedPickupAt).getTime()
    )
  ) {
    const error = new Error(
      'Pickup date and time are not valid'
    );
    error.statusCode = 400;
    throw error;
  }

  if (!passengerName) {
    const error = new Error(
      'Passenger name is required'
    );
    error.statusCode = 400;
    throw error;
  }

  if (!passengerMobile) {
    const error = new Error(
      'Passenger contact number is required'
    );
    error.statusCode = 400;
    throw error;
  }

  if (!pickup.address) {
    const error = new Error(
      'Pickup address is required'
    );
    error.statusCode = 400;
    throw error;
  }

  if (!destination.address) {
    const error = new Error(
      'Destination address is required'
    );
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(budgetId) || budgetId < 1) {
    const error = new Error(
      'A valid UHP budget is required'
    );
    error.statusCode = 400;
    throw error;
  }

  if (
    !Number.isInteger(reasonCodeId) ||
    reasonCodeId < 1
  ) {
    const error = new Error(
      'A valid reason code is required'
    );
    error.statusCode = 400;
    throw error;
  }

  const {
    creator,
    budget,
    reasonCode,
    budgetHolder
  } = validateBookingCoding({
    userId,
    budgetId,
    reasonCodeId
  });

  const oldStops = getBookingStops(bookingId);

  const previousSnapshot = db.prepare(`
    SELECT *
    FROM booking_account_snapshot
    WHERE booking_id = ?
  `).get(bookingId);

  const oldState = {
    requestedPickupAt:
      existing.requested_pickup_at,
    passengerName:
      existing.passenger_name,
    passengerMobile:
      existing.passenger_mobile,
    passengerCount:
      existing.passenger_count,
    pickupAddress:
      existing.pickup_address,
    destinationAddress:
      existing.destination_address,
    driverNotes:
      existing.driver_notes,
    budgetId:
      existing.budget_id,
    reasonCodeId:
      existing.reason_code_id,
    budgetHolderUserId:
      existing.budget_holder_user_id,
    stops: oldStops,
    accountSnapshot:
      previousSnapshot || null
  };

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE bookings
      SET
        requested_pickup_at = ?,
        passenger_name = ?,
        passenger_mobile = ?,
        passenger_count = ?,
        pickup_address = ?,
        pickup_postcode = ?,
        destination_address = ?,
        destination_postcode = ?,
        driver_notes = ?,
        budget_id = ?,
        reason_code_id = ?,
        budget_holder_user_id = ?,
        department_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      requestedPickupAt,
      passengerName,
      passengerMobile,
      passengerCount,
      pickup.address,
      pickup.postcode || null,
      destination.address,
      destination.postcode || null,
      driverNotes || null,
      budgetId,
      reasonCodeId,
      budgetHolder.id,
      budget.departmentId || null,
      bookingId
    );

    db.prepare(`
      DELETE FROM booking_stops
      WHERE booking_id = ?
    `).run(bookingId);

    const insertStop = db.prepare(`
      INSERT INTO booking_stops
        (
          booking_id,
          sequence_number,
          stop_type,
          address,
          postcode,
          notes
        )
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let sequenceNumber = 0;

    insertStop.run(
      bookingId,
      sequenceNumber++,
      'pickup',
      pickup.address,
      pickup.postcode || null,
      pickup.notes || null
    );

    for (const via of vias) {
      insertStop.run(
        bookingId,
        sequenceNumber++,
        'via',
        via.address,
        via.postcode || null,
        via.notes || null
      );
    }

    insertStop.run(
      bookingId,
      sequenceNumber,
      'destination',
      destination.address,
      destination.postcode || null,
      destination.notes || null
    );

    db.prepare(`
      UPDATE booking_account_snapshot
      SET
        budget_id = ?,
        budget_number = ?,
        budget_name = ?,
        reason_code_id = ?,
        reason_code = ?,
        reason_description = ?,
        budget_holder_user_id = ?,
        budget_holder_name = ?,
        department_id = ?,
        department_name = ?,
        captured_at = CURRENT_TIMESTAMP
      WHERE booking_id = ?
    `).run(
      budget.id,
      budget.budgetNumber,
      budget.name,
      reasonCode.id,
      reasonCode.code,
      reasonCode.description,
      budgetHolder.id,
      `${budgetHolder.firstName} ${budgetHolder.lastName}`,
      budget.departmentId || null,
      budget.departmentName || null,
      bookingId
    );

    const newState = {
      requestedPickupAt,
      passengerName,
      passengerMobile,
      passengerCount,
      pickupAddress: pickup.address,
      destinationAddress: destination.address,
      driverNotes: driverNotes || null,
      budgetId,
      reasonCodeId,
      budgetHolderUserId: budgetHolder.id,
      stops: getBookingStops(bookingId)
    };

    db.prepare(`
      INSERT INTO booking_events
        (
          booking_id,
          event_type,
          event_source,
          old_status,
          new_status,
          user_id,
          notes,
          raw_payload
        )
      VALUES (
        ?,
        'booking_amended',
        'portal',
        'draft',
        'draft',
        ?,
        ?,
        ?
      )
    `).run(
      bookingId,
      userId,
      'UHP portal booking amended',
      JSON.stringify({
        old: oldState,
        new: newState
      })
    );

    writeAudit({
      action: 'UPDATE',
      entityType: 'booking',
      entityId: bookingId,
      oldValue: JSON.stringify(oldState),
      newValue: JSON.stringify(newState),
      source: 'portal'
    });

    db.exec('COMMIT');

    return {
      ...getBookingById(bookingId),
      stops: getBookingStops(bookingId)
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function ingestBookingFare(
  bookingId,
  actorUserId,
  payload = {}
) {
  if (
    !Number.isInteger(bookingId) ||
    bookingId < 1
  ) {
    const error = new Error(
      'A valid booking id is required'
    );
    error.statusCode = 400;
    throw error;
  }

  const booking = db.prepare(`
    SELECT
      id,
      public_reference AS publicReference,
      operational_status AS operationalStatus,
      financial_status AS financialStatus
    FROM bookings
    WHERE id = ?
  `).get(bookingId);

  if (!booking) {
    const error = new Error(
      'Booking not found'
    );
    error.statusCode = 404;
    throw error;
  }

  if (
    booking.operationalStatus !==
      'completed'
  ) {
    const error = new Error(
      'Fare data can only be posted to completed bookings'
    );
    error.statusCode = 409;
    throw error;
  }

  const grossAmountPence =
    payload.grossAmountPence;

  if (
    !Number.isInteger(
      grossAmountPence
    ) ||
    grossAmountPence < 0
  ) {
    const error = new Error(
      'grossAmountPence must be a non-negative integer'
    );
    error.statusCode = 400;
    throw error;
  }

  const netAmountPence =
    payload.netAmountPence === null ||
    payload.netAmountPence ===
      undefined
      ? null
      : payload.netAmountPence;

  const vatAmountPence =
    payload.vatAmountPence === null ||
    payload.vatAmountPence ===
      undefined
      ? null
      : payload.vatAmountPence;

  if (
    netAmountPence !== null &&
    (
      !Number.isInteger(
        netAmountPence
      ) ||
      netAmountPence < 0
    )
  ) {
    const error = new Error(
      'netAmountPence must be a non-negative integer or null'
    );
    error.statusCode = 400;
    throw error;
  }

  if (
    vatAmountPence !== null &&
    (
      !Number.isInteger(
        vatAmountPence
      ) ||
      vatAmountPence < 0
    )
  ) {
    const error = new Error(
      'vatAmountPence must be a non-negative integer or null'
    );
    error.statusCode = 400;
    throw error;
  }

  if (
    netAmountPence !== null &&
    vatAmountPence !== null &&
    (
      netAmountPence +
      vatAmountPence !==
        grossAmountPence
    )
  ) {
    const error = new Error(
      'Net amount plus VAT must equal gross amount'
    );
    error.statusCode = 400;
    throw error;
  }

  const source = String(
    payload.source || ''
  ).trim().toLowerCase();

  if (
    ![
      'autocab',
      'manual',
      'import'
    ].includes(source)
  ) {
    const error = new Error(
      'Fare source must be autocab, manual or import'
    );
    error.statusCode = 400;
    throw error;
  }

  const externalReference =
    payload.externalReference === null ||
    payload.externalReference ===
      undefined
      ? null
      : String(
          payload.externalReference
        ).trim() || null;

  let rawPayload = null;

  if (
    payload.rawPayload !== null &&
    payload.rawPayload !== undefined
  ) {
    rawPayload =
      typeof payload.rawPayload ===
        'string'
        ? payload.rawPayload
        : JSON.stringify(
            payload.rawPayload
          );
  }

  const existing =
    db.prepare(`
      SELECT
        id,
        booking_id AS bookingId,
        gross_amount_pence AS grossAmountPence,
        net_amount_pence AS netAmountPence,
        vat_amount_pence AS vatAmountPence,
        currency,
        source,
        external_reference AS externalReference,
        received_at AS receivedAt,
        updated_by_user_id AS updatedByUserId,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM booking_financials
      WHERE booking_id = ?
    `).get(bookingId);

  const transitionToReview =
    [
      'authorised',
      'coding_required',
      'adjustment_required'
    ].includes(
      booking.financialStatus
    );

  const nextFinancialStatus =
    transitionToReview
      ? 'pending_review'
      : booking.financialStatus;

  const eventType =
    existing
      ? 'fare_updated'
      : 'fare_received';

  const oldFinancialState =
    existing
      ? {
          grossAmountPence:
            existing.grossAmountPence,
          netAmountPence:
            existing.netAmountPence,
          vatAmountPence:
            existing.vatAmountPence,
          currency:
            existing.currency,
          source:
            existing.source,
          externalReference:
            existing.externalReference
        }
      : null;

  const newFinancialState = {
    grossAmountPence,
    netAmountPence,
    vatAmountPence,
    currency: 'GBP',
    source,
    externalReference
  };

  db.exec('BEGIN');

  try {
    db.prepare(`
      INSERT INTO booking_financials (
        booking_id,
        gross_amount_pence,
        net_amount_pence,
        vat_amount_pence,
        currency,
        source,
        external_reference,
        raw_payload,
        received_at,
        updated_by_user_id
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        'GBP',
        ?,
        ?,
        ?,
        CURRENT_TIMESTAMP,
        ?
      )
      ON CONFLICT(booking_id)
      DO UPDATE SET
        gross_amount_pence =
          excluded.gross_amount_pence,
        net_amount_pence =
          excluded.net_amount_pence,
        vat_amount_pence =
          excluded.vat_amount_pence,
        currency =
          excluded.currency,
        source =
          excluded.source,
        external_reference =
          excluded.external_reference,
        raw_payload =
          excluded.raw_payload,
        received_at =
          CURRENT_TIMESTAMP,
        updated_by_user_id =
          excluded.updated_by_user_id,
        updated_at =
          CURRENT_TIMESTAMP
    `).run(
      bookingId,
      grossAmountPence,
      netAmountPence,
      vatAmountPence,
      source,
      externalReference,
      rawPayload,
      actorUserId
    );

    if (transitionToReview) {
      db.prepare(`
        UPDATE bookings
        SET
          financial_status =
            'pending_review',
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(bookingId);
    }

    db.prepare(`
      INSERT INTO booking_events
        (
          booking_id,
          event_type,
          event_source,
          old_status,
          new_status,
          user_id,
          notes,
          raw_payload
        )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      bookingId,
      eventType,
      source,
      booking.financialStatus,
      nextFinancialStatus,
      actorUserId,
      existing
        ? 'Completed fare updated'
        : 'Completed fare received',
      JSON.stringify(
        newFinancialState
      )
    );

    writeAudit({
      action:
        existing
          ? 'UPDATE'
          : 'CREATE',
      entityType:
        'booking_financial',
      entityId:
        bookingId,
      oldValue:
        oldFinancialState
          ? JSON.stringify(
              oldFinancialState
            )
          : null,
      newValue:
        JSON.stringify(
          newFinancialState
        ),
      source,
      actorUserId
    });

    if (transitionToReview) {
      writeAudit({
        action:
          'STATUS_CHANGE',
        entityType:
          'booking',
        entityId:
          bookingId,
        fieldName:
          'financial_status',
        oldValue:
          booking.financialStatus,
        newValue:
          'pending_review',
        source,
        actorUserId
      });
    }

    db.exec('COMMIT');

    const financial =
      db.prepare(`
        SELECT
          id,
          booking_id AS bookingId,
          gross_amount_pence AS grossAmountPence,
          net_amount_pence AS netAmountPence,
          vat_amount_pence AS vatAmountPence,
          currency,
          source,
          external_reference AS externalReference,
          received_at AS receivedAt,
          updated_by_user_id AS updatedByUserId,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM booking_financials
        WHERE booking_id = ?
      `).get(bookingId);

    return {
      booking: {
        id:
          booking.id,
        publicReference:
          booking.publicReference,
        operationalStatus:
          booking.operationalStatus,
        financialStatus:
          nextFinancialStatus
      },
      financial
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function updateBudgetBookingFinancialStatus(
  bookingId,
  userId,
  action,
  payload = {}
) {
  const booking = db.prepare(`
    SELECT
      id,
      public_reference AS publicReference,
      budget_id AS budgetId,
      operational_status AS operationalStatus,
      financial_status AS financialStatus
    FROM bookings
    WHERE id = ?
  `).get(bookingId);

  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }

  if (
    booking.operationalStatus !== 'completed'
  ) {
    const error = new Error(
      'Only completed bookings can be financially reviewed'
    );
    error.statusCode = 409;
    throw error;
  }

  if (
    booking.financialStatus !== 'pending_review'
  ) {
    const error = new Error(
      'This booking is not awaiting financial review'
    );
    error.statusCode = 409;
    throw error;
  }

  const permission = db.prepare(`
    SELECT
      can_approve AS canApprove,
      can_dispute AS canDispute

    FROM user_budget_access

    WHERE user_id = ?
      AND budget_id = ?
      AND can_view = 1

      AND (
        valid_from IS NULL OR
        valid_from <= date('now')
      )

      AND (
        valid_to IS NULL OR
        valid_to >= date('now')
      )

    ORDER BY id DESC
    LIMIT 1
  `).get(
    userId,
    booking.budgetId
  );

  if (!permission) {
    const error = new Error(
      'You are not authorised to review this booking'
    );
    error.statusCode = 403;
    throw error;
  }

  let nextStatus;
  let eventType;
  let notes;

  if (action === 'approve') {
    if (!permission.canApprove) {
      const error = new Error(
        'You are not authorised to approve this budget'
      );
      error.statusCode = 403;
      throw error;
    }

    nextStatus = 'approved_for_invoice';
    eventType = 'financial_approved';
    notes =
      'Approved for invoice by budget holder';
  } else if (action === 'dispute') {
    if (!permission.canDispute) {
      const error = new Error(
        'You are not authorised to dispute this budget'
      );
      error.statusCode = 403;
      throw error;
    }

    const reason = String(
      payload.reason || ''
    ).trim();

    if (!reason) {
      const error = new Error(
        'Dispute reason is required'
      );
      error.statusCode = 400;
      throw error;
    }

    nextStatus = 'disputed';
    eventType = 'financial_disputed';
    notes = reason;
  } else {
    const error = new Error(
      'Financial action is not valid'
    );
    error.statusCode = 400;
    throw error;
  }

  db.exec('BEGIN');

  try {
    const result = db.prepare(`
      UPDATE bookings
      SET
        financial_status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND financial_status = 'pending_review'
    `).run(
      nextStatus,
      bookingId
    );

    if (result.changes !== 1) {
      const error = new Error(
        'This booking financial status has already changed'
      );
      error.statusCode = 409;
      throw error;
    }

    db.prepare(`
      INSERT INTO booking_events
        (
          booking_id,
          event_type,
          event_source,
          old_status,
          new_status,
          user_id,
          notes
        )
      VALUES (?, ?, 'portal', ?, ?, ?, ?)
    `).run(
      bookingId,
      eventType,
      booking.financialStatus,
      nextStatus,
      userId,
      notes
    );

    writeAudit({
      action: 'STATUS_CHANGE',
      entityType: 'booking',
      entityId: bookingId,
      fieldName: 'financial_status',
      oldValue: booking.financialStatus,
      newValue: nextStatus,
      source: 'portal',
      actorUserId: userId
    });

    db.exec('COMMIT');

    return {
      id: booking.id,
      publicReference:
        booking.publicReference,
      financialStatus: nextStatus
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function cancelPortalBooking(
  bookingId,
  userId,
  payload
) {
  const booking = getOwnedEditableBooking(
    bookingId,
    userId
  );

  const reason = String(
    payload.reason || ''
  ).trim();

  if (!reason) {
    const error = new Error(
      'Cancellation reason is required'
    );
    error.statusCode = 400;
    throw error;
  }

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE bookings
      SET
        operational_status = 'cancelled',
        financial_status = 'authorisation_withdrawn',
        cancelled_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(bookingId);

    db.prepare(`
      INSERT INTO booking_events
        (
          booking_id,
          event_type,
          event_source,
          old_status,
          new_status,
          user_id,
          notes
        )
      VALUES (
        ?,
        'booking_cancelled',
        'portal',
        'draft',
        'cancelled',
        ?,
        ?
      )
    `).run(
      bookingId,
      userId,
      reason
    );

    writeAudit({
      action: 'STATUS_CHANGE',
      entityType: 'booking',
      entityId: bookingId,
      fieldName: 'operational_status',
      oldValue: booking.operational_status,
      newValue: 'cancelled',
      source: 'portal'
    });

    db.exec('COMMIT');

    return {
      ...getBookingById(bookingId),
      stops: getBookingStops(bookingId)
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function createPortalBooking(payload) {
  const requestedPickupAt = String(
    payload.requestedPickupAt || ''
  ).trim();

  const passengerName = String(
    payload.passengerName || ''
  ).trim();

  const passengerMobile = String(
    payload.passengerMobile || ''
  ).trim();

  const passengerCount = parseRequiredPositiveInteger(
    payload.passengerCount ?? 1,
    'Passenger count'
  );

  const pickup = normaliseStop(payload.pickup);
  const destination = normaliseStop(payload.destination);

  const vias = Array.isArray(payload.vias)
    ? payload.vias
        .map(normaliseStop)
        .filter((stop) => stop.address)
    : [];

  const driverNotes = String(
    payload.driverNotes || ''
  ).trim();

  const internalNotes = String(
    payload.internalNotes || ''
  ).trim();

  const budgetId = Number(payload.budgetId);
  const reasonCodeId = Number(payload.reasonCodeId);
  const createdByUserId = Number(payload.createdByUserId);

  if (!requestedPickupAt) {
    const error = new Error('Pickup date and time are required');
    error.statusCode = 400;
    throw error;
  }

  const parsedPickup = new Date(requestedPickupAt);

  if (Number.isNaN(parsedPickup.getTime())) {
    const error = new Error('Pickup date and time are not valid');
    error.statusCode = 400;
    throw error;
  }

  if (!passengerName) {
    const error = new Error('Passenger name is required');
    error.statusCode = 400;
    throw error;
  }

  if (!passengerMobile) {
    const error = new Error('Passenger contact number is required');
    error.statusCode = 400;
    throw error;
  }

  if (!pickup.address) {
    const error = new Error('Pickup address is required');
    error.statusCode = 400;
    throw error;
  }

  if (!destination.address) {
    const error = new Error('Destination address is required');
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(budgetId) || budgetId < 1) {
    const error = new Error('A valid UHP budget is required');
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(reasonCodeId) || reasonCodeId < 1) {
    const error = new Error('A valid reason code is required');
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(createdByUserId) || createdByUserId < 1) {
    const error = new Error('A valid booking user is required');
    error.statusCode = 400;
    throw error;
  }

  const creator = db.prepare(`
    SELECT
      u.id,
      u.first_name AS firstName,
      u.last_name AS lastName,
      u.department_id AS departmentId,
      u.status
    FROM users u
    WHERE u.id = ?
  `).get(createdByUserId);

  if (!creator || creator.status !== 'active') {
    const error = new Error(
      'The booking user must be an active portal user'
    );
    error.statusCode = 403;
    throw error;
  }

  const budget = db.prepare(`
    SELECT
      b.id,
      b.budget_number AS budgetNumber,
      b.name,
      b.department_id AS departmentId,
      d.name AS departmentName,
      b.status
    FROM budgets b
    LEFT JOIN departments d ON d.id = b.department_id
    WHERE b.id = ?
  `).get(budgetId);

  if (!budget || budget.status !== 'active') {
    const error = new Error(
      'The selected UHP budget is not active'
    );
    error.statusCode = 400;
    throw error;
  }

  const permission = db.prepare(`
    SELECT
      id,
      can_book AS canBook
    FROM user_budget_access
    WHERE user_id = ?
      AND budget_id = ?
      AND can_book = 1
      AND (
        valid_from IS NULL OR
        valid_from <= date('now')
      )
      AND (
        valid_to IS NULL OR
        valid_to >= date('now')
      )
    ORDER BY id DESC
    LIMIT 1
  `).get(
    createdByUserId,
    budgetId
  );

  if (!permission) {
    const error = new Error(
      'This user is not authorised to book against the selected budget'
    );
    error.statusCode = 403;
    throw error;
  }

  const reasonCode = db.prepare(`
    SELECT
      id,
      code,
      description,
      status
    FROM reason_codes
    WHERE id = ?
  `).get(reasonCodeId);

  if (!reasonCode || reasonCode.status !== 'active') {
    const error = new Error(
      'The selected reason code is not active'
    );
    error.statusCode = 400;
    throw error;
  }

  const budgetHolder = db.prepare(`
    SELECT
      u.id,
      u.first_name AS firstName,
      u.last_name AS lastName,
      u.status
    FROM budget_assignments ba
    JOIN users u ON u.id = ba.user_id
    WHERE ba.budget_id = ?
      AND ba.assignment_type = 'primary_holder'
      AND ba.is_active = 1
      AND (
        ba.valid_from IS NULL OR
        ba.valid_from <= date('now')
      )
      AND (
        ba.valid_to IS NULL OR
        ba.valid_to >= date('now')
      )
    ORDER BY ba.id DESC
    LIMIT 1
  `).get(budgetId);

  if (!budgetHolder) {
    const error = new Error(
      'The selected budget has no active primary budget holder'
    );
    error.statusCode = 409;
    throw error;
  }

  const portalSettings = db.prepare(`
    SELECT
      autocab_customer_id AS autocabCustomerId,
      booking_scope AS bookingScope
    FROM portal_settings
    WHERE id = 1
  `).get();

  if (
    !portalSettings ||
    portalSettings.bookingScope !== 'uhp_account_only'
  ) {
    const error = new Error(
      'Portal booking configuration is not valid'
    );
    error.statusCode = 500;
    throw error;
  }

  db.exec('BEGIN');

  try {
    const result = db.prepare(`
      INSERT INTO bookings
        (
          source,
          operational_status,
          financial_status,
          requested_pickup_at,
          passenger_name,
          passenger_mobile,
          passenger_count,
          pickup_address,
          pickup_postcode,
          destination_address,
          destination_postcode,
          driver_notes,
          internal_notes,
          budget_id,
          reason_code_id,
          budget_holder_user_id,
          created_by_user_id,
          department_id
        )
      VALUES (
        'portal',
        'draft',
        'authorised',
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?
      )
    `).run(
      requestedPickupAt,
      passengerName,
      passengerMobile,
      passengerCount,
      pickup.address,
      pickup.postcode || null,
      destination.address,
      destination.postcode || null,
      driverNotes || null,
      internalNotes || null,
      budgetId,
      reasonCodeId,
      budgetHolder.id,
      createdByUserId,
      budget.departmentId || null
    );

    const bookingId = Number(result.lastInsertRowid);

    const referenceYear = new Date().getFullYear();

    const publicReference =
      `UHP-${referenceYear}-${String(bookingId).padStart(6, '0')}`;

    db.prepare(`
      UPDATE bookings
      SET public_reference = ?
      WHERE id = ?
    `).run(
      publicReference,
      bookingId
    );

    const insertStop = db.prepare(`
      INSERT INTO booking_stops
        (
          booking_id,
          sequence_number,
          stop_type,
          address,
          postcode,
          notes
        )
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let sequenceNumber = 0;

    insertStop.run(
      bookingId,
      sequenceNumber++,
      'pickup',
      pickup.address,
      pickup.postcode || null,
      pickup.notes || null
    );

    for (const via of vias) {
      insertStop.run(
        bookingId,
        sequenceNumber++,
        'via',
        via.address,
        via.postcode || null,
        via.notes || null
      );
    }

    insertStop.run(
      bookingId,
      sequenceNumber,
      'destination',
      destination.address,
      destination.postcode || null,
      destination.notes || null
    );

    db.prepare(`
      INSERT INTO booking_account_snapshot
        (
          booking_id,
          customer_id,
          budget_id,
          budget_number,
          budget_name,
          reason_code_id,
          reason_code,
          reason_description,
          budget_holder_user_id,
          budget_holder_name,
          department_id,
          department_name
        )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      bookingId,
      portalSettings.autocabCustomerId || null,
      budget.id,
      budget.budgetNumber,
      budget.name,
      reasonCode.id,
      reasonCode.code,
      reasonCode.description,
      budgetHolder.id,
      `${budgetHolder.firstName} ${budgetHolder.lastName}`,
      budget.departmentId || null,
      budget.departmentName || null
    );

    db.prepare(`
      INSERT INTO booking_events
        (
          booking_id,
          event_type,
          event_source,
          new_status,
          user_id,
          notes
        )
      VALUES (?, 'booking_created', 'portal', 'draft', ?, ?)
    `).run(
      bookingId,
      createdByUserId,
      'UHP-funded portal booking created locally'
    );

    writeAudit({
      action: 'CREATE',
      entityType: 'booking',
      entityId: bookingId,
      newValue: JSON.stringify({
        publicReference,
        requestedPickupAt,
        passengerName,
        passengerCount,
        pickup: pickup.address,
        viaCount: vias.length,
        destination: destination.address,
        budgetId,
        reasonCodeId,
        budgetHolderUserId: budgetHolder.id,
        createdByUserId,
        operationalStatus: 'draft',
        financialStatus: 'authorised'
      }),
      source: 'portal'
    });

    db.exec('COMMIT');

    return {
      ...getBookingById(bookingId),
      stops: getBookingStops(bookingId)
    };
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
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true',
      'Cache-Control': 'no-store'
    });
    return res.end();
  }

  const url = new URL(req.url, 'http://localhost');

  try {
    if (
      req.method === 'POST' &&
      url.pathname === '/api/auth/request-code'
    ) {
      const payload = await readJson(req);

      const challenge =
        requestLoginCode(
          payload.email,
          req
        );

      return sendJson(
        res,
        200,
        {
          ok: true,
          challengeId:
            challenge.challengeId,
          email:
            challenge.email,
          expiresInSeconds:
            challenge.expiresInSeconds
        }
      );
    }

    if (
      req.method === 'POST' &&
      url.pathname === '/api/auth/verify-code'
    ) {
      const payload = await readJson(req);

      const result =
        verifyLoginCode(
          payload.challengeId,
          payload.code,
          req
        );

      return sendJson(
        res,
        200,
        {
          authenticated: true,
          user: result.user
        },
        {
          'Set-Cookie':
            buildSessionCookie(
              result.token
            )
        }
      );
    }

    if (
      req.method === 'GET' &&
      url.pathname === '/api/auth/me'
    ) {
      const auth =
        requireAuth(req);

      return sendJson(
        res,
        200,
        {
          authenticated: true,
          user: auth.user
        }
      );
    }

    if (
      req.method === 'POST' &&
      url.pathname === '/api/auth/logout'
    ) {
      logoutAuthSession(req);

      return sendJson(
        res,
        200,
        {
          authenticated: false
        },
        {
          'Set-Cookie':
            buildExpiredSessionCookie()
        }
      );
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        service: 'uhp-transport-api',
        database: path.basename(DB_PATH)
      });
    }

    /*
      From this point onward, API access
      is authenticated and role checked.
    */
    enforceApiAccess(req, url);

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

    if (req.method === 'GET' && url.pathname === '/api/booking-options') {
      const auth = requireAuth(req);

      return sendJson(
        res,
        200,
        getBookingOptions(auth.user.id)
      );
    }

    if (req.method === 'GET' && url.pathname === '/api/my-bookings') {
      const auth = requireAuth(req);

      return sendJson(res, 200, {
        bookings:
          listBookingsForUser(
            auth.user.id
          )
      });
    }

    if (
      req.method === 'GET' &&
      url.pathname === '/api/budget-bookings'
    ) {
      const auth = requireAnyRole(
        req,
        ['budget_holder']
      );

      return sendJson(res, 200, {
        bookings:
          listBudgetVisibleBookings(
            auth.user.id
          )
      });
    }

    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/budget-invoice-ready'
    ) {
      const auth = requireAnyRole(
        req,
        ['budget_holder']
      );

      return sendJson(res, 200, {
        bookings:
          listBudgetInvoiceReadyBookings(
            auth.user.id
          )
      });
    }

    if (
      req.method === 'GET' &&
      url.pathname === '/api/control/bookings'
    ) {
      return sendJson(res, 200, {
        bookings: listOperationalBookings()
      });
    }

    if (
      req.method === 'GET' &&
      url.pathname === '/api/control/summary'
    ) {
      return sendJson(
        res,
        200,
        getControlSummary()
      );
    }

    const bookingFareMatch =
      url.pathname.match(
        /^\/api\/control\/bookings\/(\d+)\/fare$/
      );

    if (
      req.method === 'POST' &&
      bookingFareMatch
    ) {
      const payload =
        await readJson(req);

      const bookingId =
        Number(
          bookingFareMatch[1]
        );

      const auth =
        requireAnyRole(
          req,
          [
            'nac_controller',
            'nac_admin'
          ]
        );

      const result =
        ingestBookingFare(
          bookingId,
          auth.user.id,
          payload
        );

      return sendJson(
        res,
        200,
        result
      );
    }


    const bookingAmendMatch = url.pathname.match(
      /^\/api\/bookings\/(\d+)$/
    );

    const bookingApproveMatch =
      url.pathname.match(
        /^\/api\/bookings\/(\d+)\/approve$/
      );

    if (
      req.method === 'POST' &&
      bookingApproveMatch
    ) {
      const bookingId =
        Number(bookingApproveMatch[1]);

      const auth = requireAnyRole(
        req,
        ['budget_holder']
      );

      const booking =
        updateBudgetBookingFinancialStatus(
          bookingId,
          auth.user.id,
          'approve'
        );

      return sendJson(res, 200, {
        booking
      });
    }

    const bookingDisputeMatch =
      url.pathname.match(
        /^\/api\/bookings\/(\d+)\/dispute$/
      );

    if (
      req.method === 'POST' &&
      bookingDisputeMatch
    ) {
      const payload =
        await readJson(req);

      const bookingId =
        Number(bookingDisputeMatch[1]);

      const auth = requireAnyRole(
        req,
        ['budget_holder']
      );

      const booking =
        updateBudgetBookingFinancialStatus(
          bookingId,
          auth.user.id,
          'dispute',
          payload
        );

      return sendJson(res, 200, {
        booking
      });
    }

    // owned-booking-detail route
    if (req.method === 'GET' && bookingAmendMatch) {
      const bookingId =
        Number(bookingAmendMatch[1]);

      const auth =
        requireAuth(req);

      return sendJson(res, 200, {
        booking:
          getOwnedBookingDetails(
            bookingId,
            auth.user.id
          )
      });
    }

    // booking-amend route
    if (req.method === 'PATCH' && bookingAmendMatch) {
      const payload =
        await readJson(req);

      const bookingId =
        Number(bookingAmendMatch[1]);

      const auth =
        requireAuth(req);

      const booking =
        amendPortalBooking(
          bookingId,
          auth.user.id,
          payload
        );

      return sendJson(res, 200, {
        booking
      });
    }

    const bookingCancelMatch = url.pathname.match(
      /^\/api\/bookings\/(\d+)\/cancel$/
    );

    if (req.method === 'POST' && bookingCancelMatch) {
      const payload =
        await readJson(req);

      const bookingId =
        Number(bookingCancelMatch[1]);

      const auth =
        requireAuth(req);

      const booking =
        cancelPortalBooking(
          bookingId,
          auth.user.id,
          payload
        );

      return sendJson(res, 200, {
        booking
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/bookings') {
      const payload =
        await readJson(req);

      const auth =
        requireAuth(req);

      /*
        Never trust identity supplied by
        the browser. The authenticated
        session is authoritative.
      */
      payload.userId =
        auth.user.id;

      payload.createdByUserId =
        auth.user.id;

      const booking =
        createPortalBooking(payload);

      return sendJson(res, 201, {
        booking
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
