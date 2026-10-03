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

const NODE_ENV =
  String(process.env.NODE_ENV || 'development');

const IS_PRODUCTION =
  NODE_ENV === 'production';

const DATA_DIR =
  process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(ROOT, 'data');

const DB_PATH =
  path.join(
    DATA_DIR,
    'uhp-transport.sqlite'
  );

const MIGRATIONS_DIR =
  path.join(ROOT, 'db', 'migrations');

const DIST_DIR =
  path.join(ROOT, 'dist');

const FRONTEND_ORIGIN =
  String(
    process.env.FRONTEND_ORIGIN ||
    (
      IS_PRODUCTION
        ? ''
        : 'http://localhost:5173'
    )
  ).replace(/\/$/, '');

const MAPTILER_GEOCODING_API_KEY =
  String(
    process.env.MAPTILER_GEOCODING_API_KEY ||
    ''
  ).trim();

const OSRM_BASE_URL =
  String(
    process.env.OSRM_BASE_URL ||
    (
      IS_PRODUCTION
        ? ''
        : 'https://router.project-osrm.org'
    )
  ).replace(/\/$/, '');

if (
  IS_PRODUCTION &&
  !String(
    process.env.AUTOCAB_WEBHOOK_SECRET || ''
  ).trim()
) {
  throw new Error(
    'AUTOCAB_WEBHOOK_SECRET is required in production'
  );
}

fs.mkdirSync(
  DATA_DIR,
  {
    recursive: true
  }
);

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
      path.join(
        MIGRATIONS_DIR,
        filename
      ),
      'utf8'
    );

    const needsForeignKeysOff =
      /^\s*--\s*uhp-migration:\s*foreign-keys-off\b/im
        .test(sql);

    if (needsForeignKeysOff) {
      db.exec(
        'PRAGMA foreign_keys = OFF;'
      );
    }

    db.exec('BEGIN');

    try {
      db.exec(sql);

      if (needsForeignKeysOff) {
        const violations =
          db.prepare(
            'PRAGMA foreign_key_check'
          ).all();

        if (violations.length > 0) {
          throw new Error(
            `Migration ${filename} produced foreign key violations`
          );
        }
      }

      record.run(filename);

      db.exec('COMMIT');

      console.log(
        `Applied migration: ${filename}`
      );
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      if (needsForeignKeysOff) {
        db.exec(
          'PRAGMA foreign_keys = ON;'
        );
      }
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

function getCorsHeaders() {
  if (!FRONTEND_ORIGIN) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin':
      FRONTEND_ORIGIN,

    'Access-Control-Allow-Credentials':
      'true',

    'Vary':
      'Origin'
  };
}

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

    ...getCorsHeaders(),

    'Access-Control-Allow-Methods':
      'GET,POST,PATCH,OPTIONS',

    'Access-Control-Allow-Headers':
      'Content-Type, X-Autocab-Webhook-Secret',

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

function requireAutocabWebhookSecret(
  req
) {
  const configuredSecret =
    String(
      process.env
        .AUTOCAB_WEBHOOK_SECRET ||
      ''
    );

  if (!configuredSecret) {
    const error = new Error(
      'Autocab webhook integration is not configured'
    );
    error.statusCode = 503;
    throw error;
  }

  const providedSecret =
    String(
      req.headers[
        'x-autocab-webhook-secret'
      ] || ''
    );

  if (!providedSecret) {
    const error = new Error(
      'Autocab webhook authentication required'
    );
    error.statusCode = 401;
    throw error;
  }

  const configuredHash =
    hashSessionToken(
      configuredSecret
    );

  const providedHash =
    hashSessionToken(
      providedSecret
    );

  if (
    !safeHashEqual(
      configuredHash,
      providedHash
    )
  ) {
    const error = new Error(
      'Autocab webhook authentication failed'
    );
    error.statusCode = 401;
    throw error;
  }

  return true;
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

function userHasRoleById(
  userId,
  roleCode
) {
  return Boolean(
    db.prepare(`
      SELECT 1
      FROM user_roles ur
      JOIN roles r
        ON r.id = ur.role_id
      WHERE ur.user_id = ?
        AND r.code = ?
      LIMIT 1
    `).get(
      Number(userId),
      String(roleCode || '')
    )
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
    pathname === '/api/coding-review' ||
    pathname.startsWith(
      '/api/coding-review/'
    )
  ) {
    return requireAnyRole(
      req,
      [
        'uhp_admin',
        'nac_admin'
      ]
    );
  }

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
    ) ||
    pathname ===
      '/api/locations' ||
    pathname.startsWith(
      '/api/locations/'
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
    pathname === '/api/uhp/bookings'
  ) {
    return requireAnyRole(
      req,
      ['uhp_admin']
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
    ) ||
    pathname ===
      '/api/routing/route' ||
    pathname ===
      '/api/booking-map/clear-vehicles' ||
    pathname ===
      '/api/geocoding/search'
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

function listLocations() {
  return db.prepare(`
    SELECT
      sl.id,
      sl.name,
      sl.parent_site AS parentSite,
      sl.address,
      sl.postcode,
      sl.latitude,
      sl.longitude,
      sl.category,
      sl.pickup_instructions AS pickupInstructions,
      sl.driver_instructions AS driverInstructions,
      sl.display_order AS displayOrder,

      CASE
        WHEN sl.is_active = 1
        THEN 'active'
        ELSE 'inactive'
      END AS status,

      sl.created_by_user_id AS createdByUserId,
      creator.first_name || ' ' ||
        creator.last_name AS createdBy,

      sl.updated_by_user_id AS updatedByUserId,
      updater.first_name || ' ' ||
        updater.last_name AS updatedBy,

      sl.created_at AS createdAt,
      sl.updated_at AS updatedAt

    FROM saved_locations sl

    LEFT JOIN users creator
      ON creator.id =
        sl.created_by_user_id

    LEFT JOIN users updater
      ON updater.id =
        sl.updated_by_user_id

    ORDER BY
      sl.is_active DESC,
      sl.display_order,
      sl.name COLLATE NOCASE
  `).all();
}


function getLocationById(locationId) {
  return db.prepare(`
    SELECT
      sl.id,
      sl.name,
      sl.parent_site AS parentSite,
      sl.address,
      sl.postcode,
      sl.latitude,
      sl.longitude,
      sl.category,
      sl.pickup_instructions AS pickupInstructions,
      sl.driver_instructions AS driverInstructions,
      sl.display_order AS displayOrder,

      CASE
        WHEN sl.is_active = 1
        THEN 'active'
        ELSE 'inactive'
      END AS status,

      sl.created_by_user_id AS createdByUserId,
      sl.updated_by_user_id AS updatedByUserId,

      sl.created_at AS createdAt,
      sl.updated_at AS updatedAt

    FROM saved_locations sl
    WHERE sl.id = ?
  `).get(
    Number(locationId)
  );
}


function normaliseLocationPayload(
  payload,
  existing = null
) {
  const has = (key) =>
    Object.prototype.hasOwnProperty.call(
      payload,
      key
    );

  const text = (value) =>
    value === null ||
    value === undefined
      ? ''
      : String(value).trim();

  const coordinate = (value) => {
    if (
      value === null ||
      value === undefined ||
      (
        typeof value === 'string' &&
        !value.trim()
      )
    ) {
      return NaN;
    }

    return Number(value);
  };

  const name =
    text(
      has('name')
        ? payload.name
        : existing?.name
    );

  const parentSite =
    text(
      has('parentSite')
        ? payload.parentSite
        : existing?.parentSite
    );

  const address =
    text(
      has('address')
        ? payload.address
        : existing?.address
    );

  const postcode =
    text(
      has('postcode')
        ? payload.postcode
        : existing?.postcode
    ).toUpperCase();

  const category =
    text(
      has('category')
        ? payload.category
        : existing?.category || 'uhp'
    ).toLowerCase();

  const pickupInstructions =
    text(
      has('pickupInstructions')
        ? payload.pickupInstructions
        : existing?.pickupInstructions
    );

  const driverInstructions =
    text(
      has('driverInstructions')
        ? payload.driverInstructions
        : existing?.driverInstructions
    );

  const latitude =
    coordinate(
      has('latitude')
        ? payload.latitude
        : existing?.latitude
    );

  const longitude =
    coordinate(
      has('longitude')
        ? payload.longitude
        : existing?.longitude
    );

  const displayOrderRaw =
    has('displayOrder')
      ? payload.displayOrder
      : existing?.displayOrder ?? 0;

  const displayOrder =
    Number(displayOrderRaw);

  if (!name) {
    const error =
      new Error(
        'Location name is required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (!address) {
    const error =
      new Error(
        'Location address is required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    ![
      'uhp',
      'hospital',
      'transport',
      'other'
    ].includes(category)
  ) {
    const error =
      new Error(
        'Invalid location category'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    const error =
      new Error(
        'Valid location latitude is required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    const error =
      new Error(
        'Valid location longitude is required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    !Number.isInteger(displayOrder) ||
    displayOrder < 0
  ) {
    const error =
      new Error(
        'Display order must be a non-negative whole number'
      );

    error.statusCode = 400;
    throw error;
  }

  return {
    name,
    parentSite:
      parentSite || null,
    address,
    postcode:
      postcode || null,
    latitude,
    longitude,
    category,
    pickupInstructions:
      pickupInstructions || null,
    driverInstructions:
      driverInstructions || null,
    displayOrder
  };
}

function createLocation(
  payload,
  actorUserId
) {
  const location =
    normaliseLocationPayload(
      payload
    );

  const duplicate =
    db.prepare(`
      SELECT id
      FROM saved_locations
      WHERE name = ? COLLATE NOCASE
      LIMIT 1
    `).get(
      location.name
    );

  if (duplicate) {
    const error =
      new Error(
        'A shared location with this name already exists'
      );

    error.statusCode = 409;
    throw error;
  }

  db.exec('BEGIN');

  try {
    const result =
      db.prepare(`
        INSERT INTO saved_locations
          (
            name,
            parent_site,
            address,
            postcode,
            latitude,
            longitude,
            category,
            pickup_instructions,
            driver_instructions,
            is_active,
            display_order,
            created_by_user_id,
            updated_by_user_id,
            created_at,
            updated_at
          )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          1,
          ?,
          ?,
          ?,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `).run(
        location.name,
        location.parentSite,
        location.address,
        location.postcode,
        location.latitude,
        location.longitude,
        location.category,
        location.pickupInstructions,
        location.driverInstructions,
        location.displayOrder,
        actorUserId,
        actorUserId
      );

    const locationId =
      Number(
        result.lastInsertRowid
      );

    writeAudit({
      action: 'CREATE',
      entityType:
        'saved_location',
      entityId:
        locationId,
      newValue:
        JSON.stringify(
          location
        ),
      source:
        'uhp_admin',
      actorUserId
    });

    db.exec('COMMIT');

    return getLocationById(
      locationId
    );
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function updateLocation(
  locationId,
  payload,
  actorUserId
) {
  const existing =
    getLocationById(
      locationId
    );

  if (!existing) {
    const error =
      new Error(
        'Location not found'
      );

    error.statusCode = 404;
    throw error;
  }

  const location =
    normaliseLocationPayload(
      payload,
      existing
    );

  const duplicate =
    db.prepare(`
      SELECT id
      FROM saved_locations
      WHERE name = ? COLLATE NOCASE
        AND id <> ?
      LIMIT 1
    `).get(
      location.name,
      Number(locationId)
    );

  if (duplicate) {
    const error =
      new Error(
        'A shared location with this name already exists'
      );

    error.statusCode = 409;
    throw error;
  }

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE saved_locations
      SET
        name = ?,
        parent_site = ?,
        address = ?,
        postcode = ?,
        latitude = ?,
        longitude = ?,
        category = ?,
        pickup_instructions = ?,
        driver_instructions = ?,
        display_order = ?,
        updated_by_user_id = ?,
        updated_at =
          CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      location.name,
      location.parentSite,
      location.address,
      location.postcode,
      location.latitude,
      location.longitude,
      location.category,
      location.pickupInstructions,
      location.driverInstructions,
      location.displayOrder,
      actorUserId,
      Number(locationId)
    );

    const updated =
      getLocationById(
        locationId
      );

    writeAudit({
      action: 'UPDATE',
      entityType:
        'saved_location',
      entityId:
        locationId,
      oldValue:
        JSON.stringify(
          existing
        ),
      newValue:
        JSON.stringify(
          updated
        ),
      source:
        'uhp_admin',
      actorUserId
    });

    db.exec('COMMIT');

    return updated;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function setLocationStatus(
  locationId,
  nextStatus,
  actorUserId
) {
  if (
    ![
      'active',
      'inactive'
    ].includes(nextStatus)
  ) {
    const error =
      new Error(
        'Invalid location status'
      );

    error.statusCode = 400;
    throw error;
  }

  const existing =
    getLocationById(
      locationId
    );

  if (!existing) {
    const error =
      new Error(
        'Location not found'
      );

    error.statusCode = 404;
    throw error;
  }

  if (
    existing.status ===
      nextStatus
  ) {
    return existing;
  }

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE saved_locations
      SET
        is_active = ?,
        updated_by_user_id = ?,
        updated_at =
          CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      nextStatus === 'active'
        ? 1
        : 0,
      actorUserId,
      Number(locationId)
    );

    writeAudit({
      action:
        'STATUS_CHANGE',
      entityType:
        'saved_location',
      entityId:
        locationId,
      fieldName:
        'status',
      oldValue:
        existing.status,
      newValue:
        nextStatus,
      source:
        'uhp_admin',
      actorUserId
    });

    db.exec('COMMIT');

    return getLocationById(
      locationId
    );
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
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

  const isUhpAdmin =
    userHasRoleById(
      userId,
      'uhp_admin'
    );

  const adminBudgetsSql = `
    SELECT
      b.id,
      b.budget_number AS budgetNumber,
      b.name,
      d.name AS department,

      holder.id AS holderUserId,
      holder.first_name || ' ' ||
        holder.last_name AS budgetHolder

    FROM budgets b

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
      AND holder.status = 'active'

    WHERE b.status = 'active'

    GROUP BY b.id
    ORDER BY b.budget_number
  `;

  const userBudgetsSql = `
    SELECT
      b.id,
      b.budget_number AS budgetNumber,
      b.name,
      d.name AS department,

      holder.id AS holderUserId,
      holder.first_name || ' ' ||
        holder.last_name AS budgetHolder

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
      AND holder.status = 'active'

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
  `;

  const budgets =
    isUhpAdmin
      ? db.prepare(
          adminBudgetsSql
        ).all()
      : db.prepare(
          userBudgetsSql
        ).all(userId);

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

  const savedLocations =
    db.prepare(`
      SELECT
        id,
        name,
        parent_site AS parentSite,
        address,
        postcode,
        latitude,
        longitude,
        category,
        pickup_instructions AS pickupInstructions,
        driver_instructions AS driverInstructions,
        display_order AS displayOrder
      FROM saved_locations
      WHERE is_active = 1
      ORDER BY
        display_order,
        name COLLATE NOCASE
    `).all();

  return {
    user,
    budgets,
    reasonCodes,
    savedLocations
  };
}



function listCodingReviewBookings() {
  const bookings =
    db.prepare(`
      SELECT
        b.id,
        b.public_reference AS publicReference,
        b.autocab_booking_id AS autocabBookingId,
        b.autocab_reference AS autocabReference,
      b.autocab_booked_by AS autocabBookedBy,
      b.autocab_booking_source AS autocabBookingSource,
      b.autocab_booked_at AS autocabBookedAt,
        b.source,
        b.operational_status AS operationalStatus,
        b.financial_status AS financialStatus,
        b.requested_pickup_at AS requestedPickupAt,
        b.passenger_name AS passengerName,
        b.passenger_mobile AS passengerMobile,
        b.passenger_count AS passengerCount,
        b.pickup_address AS pickupAddress,
        b.destination_address AS destinationAddress,
        b.driver_notes AS driverNotes,
        b.internal_notes AS internalNotes,
        b.created_at AS createdAt,

        r.raw_reference AS rawReference,
        r.parsed_reason_code AS parsedReasonCode,
        r.parsed_budget_number AS parsedBudgetNumber,
        r.parsed_budget_holder AS parsedBudgetHolder,
        r.status AS reconciliationStatus,
        r.reason_status AS reasonStatus,
        r.budget_status AS budgetStatus,
        r.holder_status AS holderStatus,
        r.checked_at AS codingCheckedAt

      FROM bookings b

      LEFT JOIN booking_coding_reconciliation r
        ON r.booking_id = b.id

      WHERE b.financial_status =
        'coding_required'

      ORDER BY
        b.requested_pickup_at,
        b.id
    `).all();

  const stopsStatement =
    db.prepare(`
      SELECT
        sequence_number AS sequenceNumber,
        stop_type AS stopType,
        address,
        postcode,
        notes,
        latitude,
        longitude,
        saved_location_id AS savedLocationId,
        location_name AS locationName,
        pickup_instructions AS pickupInstructions
      FROM booking_stops
      WHERE booking_id = ?
      ORDER BY sequence_number
    `);

  return bookings.map(
    (booking) => ({
      ...booking,
      stops:
        stopsStatement.all(
          booking.id
        )
    })
  );
}


function listCodingReviewOptions() {
  const reasonCodes =
    db.prepare(`
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

  const budgets =
    db.prepare(`
      SELECT
        b.id,
        b.budget_number AS budgetNumber,
        b.name,
        b.department_id AS departmentId,
        d.name AS department
      FROM budgets b
      LEFT JOIN departments d
        ON d.id = b.department_id
      WHERE b.status = 'active'
        AND (
          b.effective_from IS NULL OR
          b.effective_from <= date('now')
        )
        AND (
          b.effective_to IS NULL OR
          b.effective_to >= date('now')
        )
      ORDER BY b.budget_number
    `).all();

  const holdersStatement =
    db.prepare(`
      SELECT
        u.id,
        u.first_name AS firstName,
        u.last_name AS lastName,
        ba.assignment_type AS assignmentType
      FROM budget_assignments ba
      JOIN users u
        ON u.id = ba.user_id
      WHERE ba.budget_id = ?
        AND ba.assignment_type IN (
          'primary_holder',
          'deputy_holder'
        )
        AND ba.is_active = 1
        AND (
          ba.valid_from IS NULL OR
          ba.valid_from <= date('now')
        )
        AND (
          ba.valid_to IS NULL OR
          ba.valid_to >= date('now')
        )
        AND u.status = 'active'
      ORDER BY
        CASE ba.assignment_type
          WHEN 'primary_holder' THEN 0
          ELSE 1
        END,
        u.last_name,
        u.first_name
    `);

  return {
    reasonCodes,
    budgets:
      budgets.map(
        (budget) => ({
          ...budget,
          holders:
            holdersStatement.all(
              budget.id
            ).map(
              (holder) => ({
                ...holder,
                name:
                  `${holder.firstName} ${holder.lastName}`
              })
            )
        })
      )
  };
}


function approveBookingCoding(
  bookingId,
  userId,
  payload = {}
) {
  if (
    !Number.isInteger(bookingId) ||
    bookingId < 1
  ) {
    const error =
      new Error(
        'A valid booking id is required'
      );

    error.statusCode = 400;
    throw error;
  }

  const budgetId =
    Number(payload.budgetId);

  const reasonCodeId =
    Number(payload.reasonCodeId);

  const budgetHolderUserId =
    Number(payload.budgetHolderUserId);

  if (
    !Number.isInteger(budgetId) ||
    budgetId < 1 ||
    !Number.isInteger(reasonCodeId) ||
    reasonCodeId < 1 ||
    !Number.isInteger(
      budgetHolderUserId
    ) ||
    budgetHolderUserId < 1
  ) {
    const error =
      new Error(
        'Budget, reason code and budget holder are required'
      );

    error.statusCode = 400;
    throw error;
  }

  const booking =
    db.prepare(`
      SELECT
        id,
        public_reference
          AS publicReference,
        autocab_booking_id
          AS autocabBookingId,
        autocab_reference
          AS autocabReference,
        financial_status
          AS financialStatus
      FROM bookings
      WHERE id = ?
    `).get(
      bookingId
    );

  if (!booking) {
    const error =
      new Error(
        'Booking not found'
      );

    error.statusCode = 404;
    throw error;
  }

  if (
    booking.financialStatus !==
      'coding_required'
  ) {
    const error =
      new Error(
        'This booking is not awaiting coding review'
      );

    error.statusCode = 409;
    throw error;
  }

  const reasonCode =
    db.prepare(`
      SELECT
        id,
        code,
        description
      FROM reason_codes
      WHERE id = ?
        AND status = 'active'
        AND (
          effective_from IS NULL OR
          effective_from <= date('now')
        )
        AND (
          effective_to IS NULL OR
          effective_to >= date('now')
        )
    `).get(
      reasonCodeId
    );

  if (!reasonCode) {
    const error =
      new Error(
        'The selected reason code is not active'
      );

    error.statusCode = 409;
    throw error;
  }

  const budget =
    db.prepare(`
      SELECT
        b.id,
        b.budget_number
          AS budgetNumber,
        b.name,
        b.department_id
          AS departmentId,
        d.name
          AS departmentName
      FROM budgets b
      LEFT JOIN departments d
        ON d.id = b.department_id
      WHERE b.id = ?
        AND b.status = 'active'
        AND (
          b.effective_from IS NULL OR
          b.effective_from <= date('now')
        )
        AND (
          b.effective_to IS NULL OR
          b.effective_to >= date('now')
        )
    `).get(
      budgetId
    );

  if (!budget) {
    const error =
      new Error(
        'The selected budget is not active'
      );

    error.statusCode = 409;
    throw error;
  }

  const holder =
    db.prepare(`
      SELECT
        u.id,
        u.first_name AS firstName,
        u.last_name AS lastName,
        ba.assignment_type
          AS assignmentType
      FROM budget_assignments ba
      JOIN users u
        ON u.id = ba.user_id
      WHERE ba.budget_id = ?
        AND ba.user_id = ?
        AND ba.assignment_type IN (
          'primary_holder',
          'deputy_holder'
        )
        AND ba.is_active = 1
        AND (
          ba.valid_from IS NULL OR
          ba.valid_from <= date('now')
        )
        AND (
          ba.valid_to IS NULL OR
          ba.valid_to >= date('now')
        )
        AND u.status = 'active'
      ORDER BY
        CASE ba.assignment_type
          WHEN 'primary_holder' THEN 0
          ELSE 1
        END,
        ba.id DESC
      LIMIT 1
    `).get(
      budgetId,
      budgetHolderUserId
    );

  if (!holder) {
    const error =
      new Error(
        'The selected budget holder is not actively assigned to this budget'
      );

    error.statusCode = 409;
    throw error;
  }

  const reconciliation =
    db.prepare(`
      SELECT
        raw_reference AS rawReference,
        parsed_reason_code
          AS parsedReasonCode,
        parsed_budget_number
          AS parsedBudgetNumber,
        parsed_budget_holder
          AS parsedBudgetHolder,
        status,
        reason_status AS reasonStatus,
        budget_status AS budgetStatus,
        holder_status AS holderStatus
      FROM booking_coding_reconciliation
      WHERE booking_id = ?
    `).get(
      bookingId
    ) || null;

  const portalSettings =
    db.prepare(`
      SELECT
        autocab_customer_id
          AS autocabCustomerId
      FROM portal_settings
      WHERE id = 1
    `).get();

  const holderName =
    `${holder.firstName} ${holder.lastName}`;

  const oldState = {
    financialStatus:
      booking.financialStatus,
    reconciliation
  };

  const newState = {
    financialStatus:
      'authorised',
    budgetId:
      budget.id,
    budgetNumber:
      budget.budgetNumber,
    reasonCodeId:
      reasonCode.id,
    reasonCode:
      reasonCode.code,
    budgetHolderUserId:
      holder.id,
    budgetHolder:
      holderName,
    departmentId:
      budget.departmentId || null
  };

  db.exec('BEGIN');

  try {
    const update =
      db.prepare(`
        UPDATE bookings
        SET
          budget_id = ?,
          reason_code_id = ?,
          budget_holder_user_id = ?,
          department_id = ?,
          financial_status =
            'authorised',
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
          AND financial_status =
            'coding_required'
      `).run(
        budget.id,
        reasonCode.id,
        holder.id,
        budget.departmentId || null,
        bookingId
      );

    if (update.changes !== 1) {
      const error =
        new Error(
          'This booking coding status has already changed'
        );

      error.statusCode = 409;
      throw error;
    }

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
          department_name,
          captured_at
        )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        CURRENT_TIMESTAMP
      )

      ON CONFLICT(booking_id)
      DO UPDATE SET
        customer_id =
          excluded.customer_id,
        budget_id =
          excluded.budget_id,
        budget_number =
          excluded.budget_number,
        budget_name =
          excluded.budget_name,
        reason_code_id =
          excluded.reason_code_id,
        reason_code =
          excluded.reason_code,
        reason_description =
          excluded.reason_description,
        budget_holder_user_id =
          excluded.budget_holder_user_id,
        budget_holder_name =
          excluded.budget_holder_name,
        department_id =
          excluded.department_id,
        department_name =
          excluded.department_name,
        captured_at =
          CURRENT_TIMESTAMP
    `).run(
      bookingId,
      portalSettings?.autocabCustomerId ||
        null,
      budget.id,
      budget.budgetNumber,
      budget.name,
      reasonCode.id,
      reasonCode.code,
      reasonCode.description,
      holder.id,
      holderName,
      budget.departmentId || null,
      budget.departmentName || null
    );

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
        'coding_approved',
        'portal',
        'coding_required',
        'authorised',
        ?,
        ?,
        ?
      )
    `).run(
      bookingId,
      userId,
      'Financial coding approved after manual review',
      JSON.stringify({
        old:
          oldState,
        new:
          newState
      })
    );

    writeAudit({
      action: 'UPDATE',
      entityType: 'booking',
      entityId: bookingId,
      fieldName:
        'financial_coding',
      oldValue:
        JSON.stringify(
          oldState
        ),
      newValue:
        JSON.stringify(
          newState
        ),
      source: 'portal',
      actorUserId: userId
    });

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
        'coding_required',
      newValue:
        'authorised',
      source:
        'portal',
      actorUserId:
        userId
    });

    db.exec('COMMIT');

    return {
      booking:
        getBookingById(
          bookingId
        ),
      coding:
        newState
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function listOperationalBookings() {
  const bookings = db.prepare(`
    SELECT
      b.id,
      b.public_reference AS publicReference,

      b.autocab_booking_id AS autocabBookingId,
      b.autocab_reference AS autocabReference,
      b.autocab_booked_by AS autocabBookedBy,
      b.autocab_booking_source AS autocabBookingSource,
      b.autocab_booked_at AS autocabBookedAt,

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
      b.updated_at AS updatedAt,

      cr.raw_reference AS codingRawReference,
      cr.parsed_reason_code AS parsedReasonCode,
      cr.parsed_budget_number AS parsedBudgetNumber,
      cr.parsed_budget_holder AS parsedBudgetHolder,
      cr.status AS codingReconciliationStatus,
      cr.reason_status AS codingReasonStatus,
      cr.budget_status AS codingBudgetStatus,
      cr.holder_status AS codingHolderStatus,
      cr.checked_at AS codingCheckedAt

    FROM bookings b

    LEFT JOIN budgets bu
      ON bu.id = b.budget_id

    LEFT JOIN reason_codes rc
      ON rc.id = b.reason_code_id

    LEFT JOIN users holder
      ON holder.id = b.budget_holder_user_id

    LEFT JOIN users creator
      ON creator.id = b.created_by_user_id

    LEFT JOIN departments d
      ON d.id = b.department_id

    LEFT JOIN booking_coding_reconciliation cr
      ON cr.booking_id = b.id

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
      notes,
      latitude,
      longitude,
      saved_location_id AS savedLocationId,
      location_name AS locationName,
      pickup_instructions AS pickupInstructions
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

  const operationalTimesStatement =
    db.prepare(`
      SELECT
        MAX(
          CASE
            WHEN event_type =
              'booking_dispatch_accepted'
            THEN event_at
          END
        ) AS acceptedAt,

        MAX(
          CASE
            WHEN event_type =
              'booking_arrived'
            THEN event_at
          END
        ) AS arrivedAt,

        MAX(
          CASE
            WHEN event_type =
              'passenger_on_board'
            THEN event_at
          END
        ) AS passengerOnBoardAt,

        MAX(
          CASE
            WHEN event_type IN (
              'booking_complete',
              'booking_completed'
            )
            THEN event_at
          END
        ) AS completedEventAt,

        MAX(
          CASE
            WHEN event_type =
              'booking_cancelled'
            THEN event_at
          END
        ) AS cancelledEventAt,

        MAX(
          CASE
            WHEN event_type =
              'no_fare'
            THEN event_at
          END
        ) AS noFareAt,

        MAX(event_at)
          AS latestOperationalEventAt

      FROM booking_events

      WHERE booking_id = ?
        AND event_source = 'autocab'
        AND event_type IN (
          'booking_dispatch_accepted',
          'booking_arrived',
          'passenger_on_board',
          'booking_running_late',
          'booking_complete',
          'booking_completed',
          'booking_cancelled',
          'no_fare'
        )
    `);

  const operationalPayloadStatement =
    db.prepare(`
      SELECT
        route_suffix AS routeSuffix,
        payload_json AS payloadJson,
        received_at AS receivedAt
      FROM integration_events
      WHERE provider = 'autocab'
        AND category = 'booking'
        AND (
          booking_id = ?
          OR autocab_booking_id = ?
        )
        AND processing_status IN (
          'processed',
          'received'
        )
        AND route_suffix IN (
          'created',
          'modified',
          'accept',
          'arrived',
          'pob'
        )
      ORDER BY id DESC
      LIMIT 100
    `);

  const vehiclePositionStatement =
    db.prepare(`
      SELECT
        longitude,
        latitude,
        speed_mph AS speedMph,
        heading_degrees AS headingDegrees,
        heading_direction AS headingDirection,
        source_timestamp AS sourceTimestamp,
        updated_at AS updatedAt
      FROM autocab_vehicle_position
      WHERE vehicle_id = ?
      LIMIT 1
    `);

  const currentVehicleStateStatement =
    db.prepare(`
      SELECT
        booking_id AS bookingId,
        vehicle_status AS vehicleStatus,
        source_timestamp AS sourceTimestamp,
        updated_at AS updatedAt
      FROM autocab_vehicle_state
      WHERE vehicle_id = ?
      LIMIT 1
    `);

  return bookings.map((booking) => {
    const exceptionReasons = [];

    const operationalTimes =
      operationalTimesStatement.get(
        booking.id
      ) ?? {};

    const operationalPayloadEvents =
      operationalPayloadStatement.all(
        booking.id,
        booking.autocabBookingId
      );

    let identityEvent = null;
    let identityPayload = null;

    let dispatchedAt = null;
    let arrivedAt = null;
    let passengerOnBoardAt = null;
    let estimatedPickupAt = null;

    let latestOperationalPayloadAt = null;

    let pickupPoint = null;
    let destinationPoint = null;
    let viaPoints = [];

    function normaliseRoutePoint(
      point,
      stopType,
      sequenceNumber
    ) {
      if (!point) {
        return null;
      }

      const latitude =
        Number(
          point?.Latitude ??
          point?.Position?.Latitude ??
          point?.Location?.Latitude ??
          point?.Coordinates?.Latitude
        );

      const longitude =
        Number(
          point?.Longitude ??
          point?.Position?.Longitude ??
          point?.Location?.Longitude ??
          point?.Coordinates?.Longitude
        );

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return null;
      }

      return {
        sequenceNumber,
        stopType,
        address:
          normaliseAutocabScalar(
            point?.Address
          ),
        latitude,
        longitude
      };
    }

    for (
      const candidate
      of operationalPayloadEvents
    ) {
      let candidatePayload = null;

      try {
        candidatePayload =
          JSON.parse(
            candidate.payloadJson
          );
      } catch {
        continue;
      }

      if (!latestOperationalPayloadAt) {
        latestOperationalPayloadAt =
          candidate.receivedAt ||
          null;
      }

      dispatchedAt =
        dispatchedAt ||
        normaliseAutocabScalar(
          candidatePayload
            ?.DispatchedAtTime
        );

      arrivedAt =
        arrivedAt ||
        normaliseAutocabScalar(
          candidatePayload
            ?.VehicleArrivedAtTime
        );

      passengerOnBoardAt =
        passengerOnBoardAt ||
        normaliseAutocabScalar(
          candidatePayload
            ?.PickedUpAtTime
        );

      estimatedPickupAt =
        estimatedPickupAt ||
        normaliseAutocabScalar(
          candidatePayload
            ?.EstimatedPickupTime
        );

      if (!identityPayload) {
        const candidateDriver =
          candidatePayload
            ?.DriverDetails
            ?.Driver ||
          candidatePayload?.Driver ||
          null;

        const candidateVehicle =
          candidatePayload
            ?.VehicleDetails
            ?.Vehicle ||
          candidatePayload?.Vehicle ||
          null;

        if (
          candidateDriver ||
          candidateVehicle
        ) {
          identityEvent = candidate;
          identityPayload =
            candidatePayload;
        }
      }

      if (!pickupPoint) {
        pickupPoint =
          normaliseRoutePoint(
            candidatePayload?.Pickup,
            'pickup',
            0
          );
      }

      if (!destinationPoint) {
        destinationPoint =
          normaliseRoutePoint(
            candidatePayload?.Destination,
            'destination',
            null
          );
      }

      if (!viaPoints.length) {
        const rawVias =
          Array.isArray(
            candidatePayload?.Vias
          )
            ? candidatePayload.Vias
            : [];

        viaPoints =
          rawVias
            .map(
              (via, index) =>
                normaliseRoutePoint(
                  via,
                  'via',
                  index + 1
                )
            )
            .filter(Boolean);
      }
    }

    if (destinationPoint) {
      destinationPoint = {
        ...destinationPoint,
        sequenceNumber:
          viaPoints.length + 1
      };
    }

    const routePoints = [
      pickupPoint,
      ...viaPoints,
      destinationPoint
    ].filter(Boolean);

    const driver =
      identityPayload
        ?.DriverDetails
        ?.Driver ||
      identityPayload?.Driver ||
      null;

    const vehicle =
      identityPayload
        ?.VehicleDetails
        ?.Vehicle ||
      identityPayload?.Vehicle ||
      null;

    const vehicleId =
      Number.isInteger(
        Number(vehicle?.Id)
      ) &&
      Number(vehicle?.Id) > 0
        ? Number(vehicle.Id)
        : null;

    const vehiclePosition =
      vehicleId
        ? (
            vehiclePositionStatement.get(
              vehicleId
            ) ?? null
          )
        : null;

    const currentVehicleState =
      vehicleId
        ? (
            currentVehicleStateStatement.get(
              vehicleId
            ) ?? null
          )
        : null;

    const liveOperationalStatuses =
      new Set([
        'driver_allocated',
        'driver_en_route',
        'driver_arrived',
        'passenger_on_board'
      ]);

    const currentVehicleBookingMatches =
      Boolean(
        booking.autocabBookingId &&
        currentVehicleState?.bookingId &&
        String(
          currentVehicleState.bookingId
        ) ===
          String(
            booking.autocabBookingId
          )
      );

    const latestFleetTimestamp =
      currentVehicleState
        ?.sourceTimestamp ||
      currentVehicleState
        ?.updatedAt ||
      vehiclePosition
        ?.sourceTimestamp ||
      vehiclePosition
        ?.updatedAt ||
      null;

    const latestFleetTime =
      latestFleetTimestamp
        ? Date.parse(
            latestFleetTimestamp
          )
        : NaN;

    const fleetAgeMs =
      Number.isNaN(latestFleetTime)
        ? null
        : Date.now() -
          latestFleetTime;

    /*
      Fleet telemetry is considered fresh for
      15 minutes. This does not alter the
      booking's factual operational status;
      it only determines whether we can call
      the current state genuinely live.
    */
    const fleetIsFresh =
      fleetAgeMs !== null &&
      fleetAgeMs >= 0 &&
      fleetAgeMs <=
        15 * 60 * 1000;

    const liveState =
      liveOperationalStatuses.has(
        booking.operationalStatus
      )
        ? (
            currentVehicleBookingMatches &&
            fleetIsFresh
              ? 'live'
              : 'stale'
          )
        : 'not_live';

    const driverName =
      [
        normaliseAutocabScalar(
          driver?.Forename
        ),
        normaliseAutocabScalar(
          driver?.Surname
        )
      ]
        .filter(Boolean)
        .join(' ')
        .trim() || null;

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

      acceptedAt:
        dispatchedAt ||
        operationalTimes.acceptedAt ||
        null,

      arrivedAt:
        arrivedAt ||
        operationalTimes.arrivedAt ||
        null,

      passengerOnBoardAt:
        passengerOnBoardAt ||
        operationalTimes
          .passengerOnBoardAt ||
        null,

      estimatedPickupAt:
        estimatedPickupAt ||
        null,

      completedEventAt:
        operationalTimes
          .completedEventAt ||
        null,

      cancelledEventAt:
        operationalTimes
          .cancelledEventAt ||
        null,

      noFareAt:
        operationalTimes.noFareAt ||
        null,

      latestOperationalEventAt:
        operationalTimes
          .latestOperationalEventAt ||
        latestOperationalPayloadAt ||
        null,

      driverId:
        Number.isInteger(
          Number(driver?.Id)
        )
          ? Number(driver.Id)
          : null,

      driverCallsign:
        normaliseAutocabScalar(
          driver?.Callsign
        ),

      driverName,

      driverBadgeNumber:
        normaliseAutocabScalar(
          driver?.BadgeNumber
        ),

      vehicleId,

      vehicleCallsign:
        normaliseAutocabScalar(
          vehicle?.Callsign
        ),

      vehicleRegistration:
        normaliseAutocabScalar(
          vehicle?.Registration
        ),

      vehiclePlateNumber:
        normaliseAutocabScalar(
          vehicle?.PlateNumber
        ),

      liveState,

      liveStateReason:
        liveState === 'live'
          ? 'Fresh Autocab vehicle state matches this booking'
          : (
              liveState === 'stale'
                ? (
                    currentVehicleBookingMatches
                      ? 'Vehicle state is no longer fresh'
                      : 'Vehicle is no longer assigned to this booking'
                  )
                : null
            ),

      currentVehicleBookingMatches,

      fleetStateAt:
        latestFleetTimestamp,

      fleetAgeSeconds:
        fleetAgeMs === null
          ? null
          : Math.max(
              0,
              Math.round(
                fleetAgeMs / 1000
              )
            ),

      vehicleStatus:
        currentVehicleState
          ?.vehicleStatus ??
        null,

      vehicleLongitude:
        liveState === 'live'
          ? (
              vehiclePosition?.longitude ??
              null
            )
          : null,

      vehicleLatitude:
        liveState === 'live'
          ? (
              vehiclePosition?.latitude ??
              null
            )
          : null,

      vehicleSpeedMph:
        liveState === 'live'
          ? (
              vehiclePosition?.speedMph ??
              null
            )
          : null,

      vehicleHeadingDegrees:
        liveState === 'live'
          ? (
              vehiclePosition
                ?.headingDegrees ??
              null
            )
          : null,

      vehicleHeadingDirection:
        liveState === 'live'
          ? (
              vehiclePosition
                ?.headingDirection ??
              null
            )
          : null,

      vehiclePositionAt:
        liveState === 'live'
          ? (
              vehiclePosition
                ?.sourceTimestamp ??
              null
            )
          : null,

      vehiclePositionUpdatedAt:
        liveState === 'live'
          ? (
              vehiclePosition?.updatedAt ??
              null
            )
          : null,

      operationalSnapshotAt:
        latestOperationalPayloadAt,

      identitySnapshotAt:
        identityEvent?.receivedAt ??
        null,

      routePoints,

      hasException:
        exceptionReasons.length > 0,

      exceptionReasons
    };
  });
}

function getOperationalBookingById(
  bookingId
) {
  return (
    listOperationalBookings()
      .find(
        (booking) =>
          Number(booking.id) ===
          Number(bookingId)
      ) || null
  );
}


function canViewLiveBooking(
  bookingId,
  auth
) {
  const roleCodes =
    new Set(
      Array.isArray(auth?.user?.roles)
        ? auth.user.roles
            .map(
              (role) =>
                typeof role === 'string'
                  ? role
                  : role?.code
            )
            .filter(Boolean)
        : []
    );

  if (
    roleCodes.has('nac_admin') ||
    roleCodes.has('nac_controller') ||
    roleCodes.has('uhp_admin')
  ) {
    return true;
  }

  if (
    roleCodes.has('budget_holder')
  ) {
    return listBudgetVisibleBookings(
      auth.user.id
    ).some(
      (booking) =>
        Number(booking.id) ===
        Number(bookingId)
    );
  }

  return listBookingsForUser(
    auth.user.id
  ).some(
    (booking) =>
      Number(booking.id) ===
      Number(bookingId)
  );
}


function getControlSummary() {
  const bookings = listOperationalBookings();

  const now = new Date();

  const today =
    now.toISOString().slice(0, 10);

  const nonTerminalQueueStatuses =
    new Set([
      'draft',
      'submitting',
      'booked',
      'confirmed',
      'requires_review'
    ]);

  const active =
    bookings.filter(
      (booking) =>
        nonTerminalQueueStatuses.has(
          booking.operationalStatus
        ) ||
        booking.liveState === 'live'
    );

  const stale =
    bookings.filter(
      (booking) =>
        booking.liveState === 'stale'
    );

  return {
    total: bookings.length,

    active: active.length,

    stale: stale.length,

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

function getUhpOperationalEnrichment(
  operational
) {
  if (!operational) {
    return {};
  }

  return {
    acceptedAt:
      operational.acceptedAt ?? null,

    arrivedAt:
      operational.arrivedAt ?? null,

    passengerOnBoardAt:
      operational.passengerOnBoardAt ?? null,

    estimatedPickupAt:
      operational.estimatedPickupAt ?? null,

    completedEventAt:
      operational.completedEventAt ?? null,

    cancelledEventAt:
      operational.cancelledEventAt ?? null,

    noFareAt:
      operational.noFareAt ?? null,

    latestOperationalEventAt:
      operational.latestOperationalEventAt ?? null,

    driverCallsign:
      operational.driverCallsign ?? null,

    driverName:
      operational.driverName ?? null,

    vehicleCallsign:
      operational.vehicleCallsign ?? null,

    vehicleRegistration:
      operational.vehicleRegistration ?? null,

    vehiclePlateNumber:
      operational.vehiclePlateNumber ?? null,

    vehicleStatus:
      operational.vehicleStatus ?? null,

    liveState:
      operational.liveState ?? null,

    liveStateReason:
      operational.liveStateReason ?? null,

    fleetStateAt:
      operational.fleetStateAt ?? null,

    fleetAgeSeconds:
      operational.fleetAgeSeconds ?? null,

    vehicleLongitude:
      operational.vehicleLongitude ?? null,

    vehicleLatitude:
      operational.vehicleLatitude ?? null,

    vehicleSpeedMph:
      operational.vehicleSpeedMph ?? null,

    vehicleHeadingDegrees:
      operational.vehicleHeadingDegrees ?? null,

    vehicleHeadingDirection:
      operational.vehicleHeadingDirection ?? null,

    vehiclePositionAt:
      operational.vehiclePositionAt ?? null,

    vehiclePositionUpdatedAt:
      operational.vehiclePositionUpdatedAt ?? null,

    operationalSnapshotAt:
      operational.operationalSnapshotAt ?? null,

    identitySnapshotAt:
      operational.identitySnapshotAt ?? null,

    routePoints:
      Array.isArray(
        operational.routePoints
      )
        ? operational.routePoints
        : [],

    codingRawReference:
      operational.codingRawReference ?? null,

    parsedReasonCode:
      operational.parsedReasonCode ?? null,

    parsedBudgetNumber:
      operational.parsedBudgetNumber ?? null,

    parsedBudgetHolder:
      operational.parsedBudgetHolder ?? null,

    codingReconciliationStatus:
      operational.codingReconciliationStatus ?? null,

    codingReasonStatus:
      operational.codingReasonStatus ?? null,

    codingBudgetStatus:
      operational.codingBudgetStatus ?? null,

    codingHolderStatus:
      operational.codingHolderStatus ?? null,

    codingCheckedAt:
      operational.codingCheckedAt ?? null
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
      b.autocab_booking_id AS autocabBookingId,
      b.autocab_reference AS autocabReference,
      b.autocab_booked_by AS autocabBookedBy,
      b.autocab_booking_source AS autocabBookingSource,
      b.autocab_booked_at AS autocabBookedAt,
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
      notes,
      latitude,
      longitude,
      saved_location_id AS savedLocationId,
      location_name AS locationName,
      pickup_instructions AS pickupInstructions
    FROM booking_stops
    WHERE booking_id = ?
    ORDER BY sequence_number
  `);

  const operationalById =
    new Map(
      listOperationalBookings()
        .map(
          (booking) => [
            booking.id,
            booking
          ]
        )
    );

  return bookings.map((booking) => ({
    ...booking,
    ...getUhpOperationalEnrichment(
      operationalById.get(
        booking.id
      )
    ),
    stops: stopsStatement.all(booking.id)
  }));
}


function listBudgetVisibleBookings(userId) {
  const bookings = db.prepare(`
    SELECT
      b.id,
      b.public_reference AS publicReference,
      b.autocab_booking_id AS autocabBookingId,
      b.autocab_reference AS autocabReference,
      b.autocab_booked_by AS autocabBookedBy,
      b.autocab_booking_source AS autocabBookingSource,
      b.autocab_booked_at AS autocabBookedAt,

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
      notes,
      latitude,
      longitude,
      saved_location_id AS savedLocationId,
      location_name AS locationName,
      pickup_instructions AS pickupInstructions

    FROM booking_stops

    WHERE booking_id = ?

    ORDER BY sequence_number
  `);

  const operationalById =
    new Map(
      listOperationalBookings()
        .map(
          (booking) => [
            booking.id,
            booking
          ]
        )
    );

  return bookings.map((booking) => ({
    ...booking,
    ...getUhpOperationalEnrichment(
      operationalById.get(
        booking.id
      )
    ),

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
      b.autocab_booking_id AS autocabBookingId,
      b.autocab_reference AS autocabReference,
      b.autocab_booked_by AS autocabBookedBy,
      b.autocab_booking_source AS autocabBookingSource,
      b.autocab_booked_at AS autocabBookedAt,
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
      b.created_at AS createdAt
    FROM bookings b
    LEFT JOIN budgets bu ON bu.id = b.budget_id
    LEFT JOIN reason_codes rc ON rc.id = b.reason_code_id
    LEFT JOIN users holder ON holder.id = b.budget_holder_user_id
    LEFT JOIN users creator ON creator.id = b.created_by_user_id
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
      notes,
      latitude,
      longitude,
      saved_location_id AS savedLocationId,
      location_name AS locationName,
      pickup_instructions AS pickupInstructions
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
      notes: '',
      latitude: null,
      longitude: null,
      savedLocationId: null,
      locationName: null,
      pickupInstructions: null
    };
  }

  const coordinate = (value) => {
    if (
      value === null ||
      value === undefined ||
      (
        typeof value === 'string' &&
        !value.trim()
      )
    ) {
      return null;
    }

    const number = Number(value);

    return Number.isFinite(number)
      ? number
      : null;
  };

  const savedLocationId =
    Number(rawStop?.savedLocationId);

  return {
    address:
      String(rawStop?.address || '').trim(),

    postcode:
      String(rawStop?.postcode || '')
        .trim()
        .toUpperCase(),

    notes:
      String(rawStop?.notes || '').trim(),

    latitude:
      coordinate(rawStop?.latitude),

    longitude:
      coordinate(rawStop?.longitude),

    savedLocationId:
      Number.isInteger(savedLocationId) &&
      savedLocationId > 0
        ? savedLocationId
        : null,

    locationName:
      String(
        rawStop?.locationName || ''
      ).trim() || null,

    pickupInstructions:
      String(
        rawStop?.pickupInstructions || ''
      ).trim() || null
  };
}

function resolveBookingStop(rawStop) {
  const stop =
    normaliseStop(rawStop);

  if (
    stop.latitude !== null &&
    (
      stop.latitude < -90 ||
      stop.latitude > 90
    )
  ) {
    const error =
      new Error(
        'Stop latitude is not valid'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    stop.longitude !== null &&
    (
      stop.longitude < -180 ||
      stop.longitude > 180
    )
  ) {
    const error =
      new Error(
        'Stop longitude is not valid'
      );

    error.statusCode = 400;
    throw error;
  }

  if (stop.savedLocationId) {
    const savedLocation =
      db.prepare(`
        SELECT
          id,
          name,
          address,
          postcode,
          latitude,
          longitude,
          pickup_instructions
            AS pickupInstructions,
          is_active AS isActive
        FROM saved_locations
        WHERE id = ?
      `).get(
        stop.savedLocationId
      );

    if (
      !savedLocation ||
      savedLocation.isActive !== 1
    ) {
      const error =
        new Error(
          'The selected shared UHP location is not active'
        );

      error.statusCode = 400;
      throw error;
    }

    return {
      ...stop,
      address:
        savedLocation.address,
      postcode:
        savedLocation.postcode || '',
      latitude:
        savedLocation.latitude,
      longitude:
        savedLocation.longitude,
      savedLocationId:
        savedLocation.id,
      locationName:
        savedLocation.name,
      pickupInstructions:
        savedLocation.pickupInstructions ||
        null
    };
  }

  return stop;
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

  if (
    !permission &&
    !userHasRoleById(
      userId,
      'uhp_admin'
    )
  ) {
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

  const pickup = resolveBookingStop(payload.pickup);
  const destination =
    resolveBookingStop(payload.destination);

  const vias = Array.isArray(payload.vias)
    ? payload.vias
        .map(resolveBookingStop)
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
          notes,
          latitude,
          longitude,
          saved_location_id,
          location_name,
          pickup_instructions
        )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let sequenceNumber = 0;

    insertStop.run(
      bookingId,
      sequenceNumber++,
      'pickup',
      pickup.address,
      pickup.postcode || null,
      pickup.notes || null,
      pickup.latitude,
      pickup.longitude,
      pickup.savedLocationId,
      pickup.locationName,
      pickup.pickupInstructions
    );

    for (const via of vias) {
      insertStop.run(
        bookingId,
        sequenceNumber++,
        'via',
        via.address,
        via.postcode || null,
        via.notes || null,
        via.latitude,
        via.longitude,
        via.savedLocationId,
        via.locationName,
        via.pickupInstructions
      );
    }

    insertStop.run(
      bookingId,
      sequenceNumber,
      'destination',
      destination.address,
      destination.postcode || null,
      destination.notes || null,
      destination.latitude,
      destination.longitude,
      destination.savedLocationId,
      destination.locationName,
      destination.pickupInstructions
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


const AUTOCAB_WEBHOOK_EVENTS = {
  created: {
    eventType: 'booking_created',
    category: 'booking'
  },

  modified: {
    eventType: 'booking_modified',
    category: 'booking'
  },

  accept: {
    eventType: 'booking_dispatch_accepted',
    category: 'booking'
  },

  arrived: {
    eventType: 'booking_arrived',
    category: 'booking'
  },

  pob: {
    eventType: 'passenger_on_board',
    category: 'booking'
  },

  late: {
    eventType: 'booking_running_late',
    category: 'booking'
  },

  complete: {
    eventType: 'booking_complete',
    category: 'booking'
  },

  cancelled: {
    eventType: 'booking_cancelled',
    category: 'booking'
  },

  nofare: {
    eventType: 'no_fare',
    category: 'booking'
  },

  invoice_created: {
    eventType: 'invoice_created',
    category: 'finance'
  },

  credit_note: {
    eventType: 'credit_note_issued',
    category: 'finance'
  },

  vehicle_position: {
    eventType: 'vehicle_position_changed',
    category: 'fleet'
  },

  vehicle_data: {
    eventType: 'vehicle_data_changed',
    category: 'fleet'
  },

  vehicle_tracks: {
    eventType: 'vehicle_tracks_changed',
    category: 'fleet'
  }
};

function normaliseAutocabScalar(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const clean =
    String(value).trim();

  return clean || null;
}


function captureAutocabVehiclePosition(
  payload
) {
  if (!Array.isArray(payload)) {
    const error = new Error(
      'Autocab vehicle position payload must be an array'
    );

    error.statusCode = 400;

    throw error;
  }

  const statement =
    db.prepare(`
      INSERT INTO autocab_vehicle_position
        (
          vehicle_id,
          longitude,
          latitude,
          speed_kph,
          speed_mph,
          heading_degrees,
          heading_direction,
          source_timestamp,
          updated_at
        )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(vehicle_id)
      DO UPDATE SET
        longitude =
          excluded.longitude,
        latitude =
          excluded.latitude,
        speed_kph =
          excluded.speed_kph,
        speed_mph =
          excluded.speed_mph,
        heading_degrees =
          excluded.heading_degrees,
        heading_direction =
          excluded.heading_direction,
        source_timestamp =
          excluded.source_timestamp,
        updated_at =
          CURRENT_TIMESTAMP
    `);

  let updated = 0;

  db.exec('BEGIN');

  try {
    for (const item of payload) {
      const vehicleId =
        Number(item?.VehicleAutoID);

      const longitude =
        Number(
          item?.Position?.Longitude
        );

      const latitude =
        Number(
          item?.Position?.Latitude
        );

      if (
        !Number.isInteger(vehicleId) ||
        vehicleId < 1 ||
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude)
      ) {
        continue;
      }

      statement.run(
        vehicleId,
        longitude,
        latitude,
        Number.isFinite(
          Number(
            item?.SpeedDetails
              ?.SpeedKph
          )
        )
          ? Number(
              item.SpeedDetails
                .SpeedKph
            )
          : null,
        Number.isFinite(
          Number(
            item?.SpeedDetails
              ?.SpeedMph
          )
        )
          ? Number(
              item.SpeedDetails
                .SpeedMph
            )
          : null,
        Number.isFinite(
          Number(
            item?.HeadingDetails
              ?.HeadingDegrees
          )
        )
          ? Number(
              item.HeadingDetails
                .HeadingDegrees
            )
          : null,
        normaliseAutocabScalar(
          item?.HeadingDetails
            ?.HeadingDirection
        ),
        normaliseAutocabScalar(
          item?.Received
        )
      );

      updated += 1;
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return {
    received: true,
    eventType:
      'vehicle_position_changed',
    category:
      'fleet',
    updated
  };
}


function captureAutocabVehicleTracks(
  payload
) {
  const tracks =
    Array.isArray(
      payload?.VehicleTracks
    )
      ? payload.VehicleTracks
      : null;

  if (!tracks) {
    const error = new Error(
      'Autocab vehicle tracks payload is not valid'
    );

    error.statusCode = 400;

    throw error;
  }

  const statement =
    db.prepare(`
      INSERT INTO autocab_vehicle_state
        (
          vehicle_id,
          callsign,
          registration,
          plate_number,
          device_id,
          booking_id,
          vehicle_status,
          driver_id,
          driver_callsign,
          driver_forename,
          driver_surname,
          driver_badge_number,
          longitude,
          latitude,
          source_timestamp,
          updated_at
        )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(vehicle_id)
      DO UPDATE SET
        callsign =
          excluded.callsign,
        registration =
          excluded.registration,
        plate_number =
          excluded.plate_number,
        device_id =
          excluded.device_id,
        booking_id =
          excluded.booking_id,
        vehicle_status =
          excluded.vehicle_status,
        driver_id =
          excluded.driver_id,
        driver_callsign =
          excluded.driver_callsign,
        driver_forename =
          excluded.driver_forename,
        driver_surname =
          excluded.driver_surname,
        driver_badge_number =
          excluded.driver_badge_number,
        longitude =
          excluded.longitude,
        latitude =
          excluded.latitude,
        source_timestamp =
          excluded.source_timestamp,
        updated_at =
          CURRENT_TIMESTAMP
    `);

  let updated = 0;

  db.exec('BEGIN');

  try {
    for (const item of tracks) {
      const vehicleId =
        Number(item?.Vehicle?.Id);

      if (
        !Number.isInteger(vehicleId) ||
        vehicleId < 1
      ) {
        continue;
      }

      const driverId =
        Number(item?.Driver?.Id);

      const longitude =
        Number(
          item?.CurrentLocation
            ?.Longitude
        );

      const latitude =
        Number(
          item?.CurrentLocation
            ?.Latitude
        );

      const bookingId =
        Number(item?.BookingId);

      statement.run(
        vehicleId,
        normaliseAutocabScalar(
          item?.Vehicle?.Callsign
        ),
        normaliseAutocabScalar(
          item?.Vehicle
            ?.Registration
        ),
        normaliseAutocabScalar(
          item?.Vehicle
            ?.PlateNumber
        ),
        normaliseAutocabScalar(
          item?.Vehicle
            ?.DeviceId
        ),
        Number.isFinite(bookingId) &&
        bookingId > 0
          ? String(bookingId)
          : null,
        normaliseAutocabScalar(
          item?.VehicleStatus
        ),
        Number.isInteger(driverId) &&
        driverId > 0
          ? driverId
          : null,
        normaliseAutocabScalar(
          item?.Driver?.Callsign
        ),
        normaliseAutocabScalar(
          item?.Driver?.Forename
        ),
        normaliseAutocabScalar(
          item?.Driver?.Surname
        ),
        normaliseAutocabScalar(
          item?.Driver
            ?.BadgeNumber
        ),
        Number.isFinite(longitude)
          ? longitude
          : null,
        Number.isFinite(latitude)
          ? latitude
          : null,
        normaliseAutocabScalar(
          item?.Timestamp
        )
      );

      updated += 1;
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return {
    received: true,
    eventType:
      'vehicle_tracks_changed',
    category:
      'fleet',
    updated
  };
}


function normaliseCodingName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}


function parseAutocabOurReference(
  rawReference
) {
  const raw =
    normaliseAutocabScalar(
      rawReference
    );

  if (!raw) {
    return {
      rawReference: null,
      reasonCode: null,
      budgetNumber: null,
      budgetHolder: null,
      formatValid: false
    };
  }

  const parts =
    raw
      .split('/')
      .map((part) => part.trim());

  if (
    parts.length !== 3 ||
    parts.some((part) => !part)
  ) {
    return {
      rawReference: raw,
      reasonCode:
        parts[0] || null,
      budgetNumber:
        parts[1] || null,
      budgetHolder:
        parts.slice(2).join('/') || null,
      formatValid: false
    };
  }

  return {
    rawReference: raw,
    reasonCode: parts[0],
    budgetNumber: parts[1],
    budgetHolder: parts[2],
    formatValid: true
  };
}


function evaluateAutocabBookingCoding(
  rawReference
) {
  const parsed =
    parseAutocabOurReference(
      rawReference
    );

  const result = {
    ...parsed,

    status:
      parsed.rawReference
        ? 'invalid'
        : 'missing',

    reasonStatus:
      parsed.reasonCode
        ? 'not_checked'
        : 'missing',

    budgetStatus:
      parsed.budgetNumber
        ? 'not_checked'
        : 'missing',

    holderStatus:
      parsed.budgetHolder
        ? 'not_checked'
        : 'missing',

    reasonCodeId: null,
    budgetId: null,
    budgetHolderUserId: null,
    departmentId: null,

    budget: null,
    reasonCodeRecord: null,
    budgetHolderRecord: null
  };

  if (!parsed.formatValid) {
    result.status =
      parsed.rawReference
        ? 'invalid'
        : 'missing';

    return result;
  }

  const reasonCode =
    db.prepare(`
      SELECT
        id,
        code,
        description,
        status
      FROM reason_codes
      WHERE code = ? COLLATE NOCASE
        AND status = 'active'
        AND (
          effective_from IS NULL OR
          effective_from <= date('now')
        )
        AND (
          effective_to IS NULL OR
          effective_to >= date('now')
        )
      LIMIT 1
    `).get(
      parsed.reasonCode
    );

  if (reasonCode) {
    result.reasonStatus = 'valid';
    result.reasonCodeId =
      Number(reasonCode.id);
    result.reasonCodeRecord = reasonCode;
  } else {
    result.reasonStatus = 'invalid';
  }

  const budget =
    db.prepare(`
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
      WHERE b.budget_number = ?
        COLLATE NOCASE
        AND b.status = 'active'
        AND (
          b.effective_from IS NULL OR
          b.effective_from <= date('now')
        )
        AND (
          b.effective_to IS NULL OR
          b.effective_to >= date('now')
        )
      LIMIT 1
    `).get(
      parsed.budgetNumber
    );

  if (budget) {
    result.budgetStatus = 'valid';
    result.budgetId =
      Number(budget.id);
    result.departmentId =
      budget.departmentId
        ? Number(budget.departmentId)
        : null;
    result.budget = budget;
  } else {
    result.budgetStatus = 'invalid';
  }

  if (budget) {
    const assignedHolders =
      db.prepare(`
        SELECT
          u.id,
          u.first_name AS firstName,
          u.last_name AS lastName,
          u.status,
          ba.assignment_type AS assignmentType

        FROM budget_assignments ba

        JOIN users u
          ON u.id = ba.user_id

        WHERE ba.budget_id = ?
          AND ba.assignment_type IN (
            'primary_holder',
            'deputy_holder'
          )
          AND ba.is_active = 1
          AND (
            ba.valid_from IS NULL OR
            ba.valid_from <= date('now')
          )
          AND (
            ba.valid_to IS NULL OR
            ba.valid_to >= date('now')
          )
          AND u.status = 'active'

        ORDER BY
          CASE ba.assignment_type
            WHEN 'primary_holder' THEN 0
            ELSE 1
          END,
          ba.id DESC
      `).all(
        budget.id
      );

    const wantedName =
      normaliseCodingName(
        parsed.budgetHolder
      );

    const assignedMatch =
      assignedHolders.find(
        (holder) =>
          normaliseCodingName(
            `${holder.firstName} ${holder.lastName}`
          ) === wantedName
      );

    if (assignedMatch) {
      result.holderStatus = 'valid';
      result.budgetHolderUserId =
        Number(assignedMatch.id);
      result.budgetHolderRecord =
        assignedMatch;
    } else {
      const matchingUser =
        db.prepare(`
          SELECT
            id,
            first_name AS firstName,
            last_name AS lastName,
            status
          FROM users
          WHERE lower(
            trim(
              first_name || ' ' || last_name
            )
          ) = lower(?)
            AND status = 'active'
          ORDER BY id
          LIMIT 1
        `).get(
          parsed.budgetHolder
        );

      result.holderStatus =
        matchingUser
          ? 'budget_mismatch'
          : 'invalid';
    }
  } else {
    result.holderStatus =
      parsed.budgetHolder
        ? 'not_checked'
        : 'missing';
  }

  if (
    result.reasonStatus === 'valid' &&
    result.budgetStatus === 'valid' &&
    result.holderStatus === 'valid'
  ) {
    result.status = 'valid';
  } else if (
    result.holderStatus ===
      'budget_mismatch'
  ) {
    result.status = 'mismatch';
  } else {
    result.status = 'invalid';
  }

  return result;
}


function upsertBookingCodingReconciliation(
  bookingId,
  coding
) {
  db.prepare(`
    INSERT INTO booking_coding_reconciliation
      (
        booking_id,
        raw_reference,
        parsed_reason_code,
        parsed_budget_number,
        parsed_budget_holder,
        status,
        reason_status,
        budget_status,
        holder_status,
        details_json,
        checked_at,
        updated_at
      )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )

    ON CONFLICT(booking_id)
    DO UPDATE SET
      raw_reference =
        excluded.raw_reference,
      parsed_reason_code =
        excluded.parsed_reason_code,
      parsed_budget_number =
        excluded.parsed_budget_number,
      parsed_budget_holder =
        excluded.parsed_budget_holder,
      status =
        excluded.status,
      reason_status =
        excluded.reason_status,
      budget_status =
        excluded.budget_status,
      holder_status =
        excluded.holder_status,
      details_json =
        excluded.details_json,
      checked_at =
        CURRENT_TIMESTAMP,
      updated_at =
        CURRENT_TIMESTAMP
  `).run(
    bookingId,
    coding.rawReference,
    coding.reasonCode,
    coding.budgetNumber,
    coding.budgetHolder,
    coding.status,
    coding.reasonStatus,
    coding.budgetStatus,
    coding.holderStatus,
    JSON.stringify({
      formatValid:
        coding.formatValid,
      reasonStatus:
        coding.reasonStatus,
      budgetStatus:
        coding.budgetStatus,
      holderStatus:
        coding.holderStatus
    })
  );
}


function insertAutocabBookingStops(
  bookingId,
  payload
) {
  const insert =
    db.prepare(`
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

  let sequence = 0;

  insert.run(
    bookingId,
    sequence++,
    'pickup',
    normaliseAutocabScalar(
      payload?.Pickup?.Address
    ) || '',
    null,
    null
  );

  const vias =
    Array.isArray(payload?.Vias)
      ? payload.Vias
      : [];

  for (const via of vias) {
    insert.run(
      bookingId,
      sequence++,
      'via',
      normaliseAutocabScalar(
        via?.Address
      ) || '',
      null,
      null
    );
  }

  insert.run(
    bookingId,
    sequence,
    'destination',
    normaliseAutocabScalar(
      payload?.Destination?.Address
    ) || '',
    null,
    null
  );
}


function importAutocabCreatedBooking(
  payload
) {
  const autocabBookingId =
    normaliseAutocabScalar(
      payload?.Id
    );

  if (
    !autocabBookingId ||
    !/^\d+$/.test(
      autocabBookingId
    )
  ) {
    const error = new Error(
      'Autocab BookingCreated payload has no valid booking ID'
    );

    error.statusCode = 400;

    throw error;
  }

  const autocabReference =
    normaliseAutocabScalar(
      payload?.OurReference
    );

  const autocabBookedBy =
    normaliseAutocabScalar(
      payload?.BookedBy
    );

  const autocabBookingSource =
    normaliseAutocabScalar(
      payload?.BookingSource
    );

  const autocabBookedAt =
    normaliseAutocabScalar(
      payload?.BookedAtTime
    );

  const existing =
    db.prepare(`
      SELECT
        id,
        source,
        operational_status AS operationalStatus,
        financial_status AS financialStatus
      FROM bookings
      WHERE autocab_booking_id = ?
      LIMIT 1
    `).get(
      autocabBookingId
    );

  if (existing) {
    db.prepare(`
      UPDATE bookings
      SET
        autocab_reference =
          COALESCE(
            autocab_reference,
            ?
          ),

        autocab_booked_by =
          COALESCE(
            autocab_booked_by,
            ?
          ),

        autocab_booking_source =
          COALESCE(
            autocab_booking_source,
            ?
          ),

        autocab_booked_at =
          COALESCE(
            autocab_booked_at,
            ?
          ),

        updated_at =
          CURRENT_TIMESTAMP

      WHERE id = ?
    `).run(
      autocabReference,
      autocabBookedBy,
      autocabBookingSource,
      autocabBookedAt,
      existing.id
    );

    return {
      bookingId:
        Number(existing.id),
      imported: false,
      existing: true,
      codingStatus:
        existing.financialStatus ===
          'coding_required'
          ? 'review_required'
          : 'existing'
    };
  }

  const requestedPickupAt =
    normaliseAutocabScalar(
      payload?.PickupDueTime
    );

  if (!requestedPickupAt) {
    const error = new Error(
      'Autocab BookingCreated payload has no pickup due time'
    );

    error.statusCode = 400;

    throw error;
  }

  const coding =
    evaluateAutocabBookingCoding(
      autocabReference
    );

  const financialStatus =
    coding.status === 'valid'
      ? 'authorised'
      : 'coding_required';

  const passengerCountRaw =
    Number(payload?.Passengers);

  const passengerCount =
    Number.isInteger(
      passengerCountRaw
    ) &&
    passengerCountRaw > 0
      ? passengerCountRaw
      : 1;

  const passengerName =
    normaliseAutocabScalar(
      payload?.Name
    ) || '';

  const passengerMobile =
    normaliseAutocabScalar(
      payload?.TelephoneNumber
    ) || '';

  const pickupAddress =
    normaliseAutocabScalar(
      payload?.Pickup?.Address
    ) || '';

  const destinationAddress =
    normaliseAutocabScalar(
      payload?.Destination?.Address
    ) || '';

  const driverNotes =
    normaliseAutocabScalar(
      payload?.DriverNote
    );

  const internalNotes =
    normaliseAutocabScalar(
      payload?.OfficeNote
    );

  const bookedAt =
    autocabBookedAt;

  db.exec('BEGIN');

  try {
    const insertResult =
      db.prepare(`
        INSERT INTO bookings
          (
            autocab_booking_id,
            autocab_reference,
            autocab_booked_by,
            autocab_booking_source,
            autocab_booked_at,
            source,
            operational_status,
            financial_status,
            requested_pickup_at,
            passenger_name,
            passenger_mobile,
            passenger_count,
            pickup_address,
            destination_address,
            driver_notes,
            internal_notes,
            budget_id,
            reason_code_id,
            budget_holder_user_id,
            created_by_user_id,
            department_id,
            submitted_at
          )
        VALUES (
          ?, ?, ?, ?, ?,
          'import',
          'booked',
          ?,
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          NULL,
          ?,
          ?
        )
      `).run(
        autocabBookingId,
        autocabReference,
        autocabBookedBy,
        autocabBookingSource,
        autocabBookedAt,
        financialStatus,
        requestedPickupAt,
        passengerName,
        passengerMobile,
        passengerCount,
        pickupAddress,
        destinationAddress,
        driverNotes,
        internalNotes,
        coding.status === 'valid'
          ? coding.budgetId
          : null,
        coding.status === 'valid'
          ? coding.reasonCodeId
          : null,
        coding.status === 'valid'
          ? coding.budgetHolderUserId
          : null,
        coding.status === 'valid'
          ? coding.departmentId
          : null,
        bookedAt
      );

    const bookingId =
      Number(
        insertResult.lastInsertRowid
      );

    const referenceYear =
      new Date(
        requestedPickupAt
      ).getFullYear();

    const safeYear =
      Number.isInteger(
        referenceYear
      )
        ? referenceYear
        : new Date().getFullYear();

    const publicReference =
      `UHP-${safeYear}-${String(
        bookingId
      ).padStart(6, '0')}`;

    db.prepare(`
      UPDATE bookings
      SET public_reference = ?
      WHERE id = ?
    `).run(
      publicReference,
      bookingId
    );

    insertAutocabBookingStops(
      bookingId,
      payload
    );

    upsertBookingCodingReconciliation(
      bookingId,
      coding
    );

    if (
      coding.status === 'valid'
    ) {
      const customerId =
        normaliseAutocabScalar(
          payload?.Account?.Id
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
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `).run(
        bookingId,
        customerId,
        coding.budget.id,
        coding.budget.budgetNumber,
        coding.budget.name,
        coding.reasonCodeRecord.id,
        coding.reasonCodeRecord.code,
        coding.reasonCodeRecord.description,
        coding.budgetHolderUserId,
        `${coding.budgetHolderRecord.firstName} ${coding.budgetHolderRecord.lastName}`,
        coding.departmentId,
        coding.budget.departmentName || null
      );
    }

    db.prepare(`
      INSERT INTO booking_events
        (
          booking_id,
          event_type,
          event_source,
          new_status,
          notes,
          raw_payload
        )
      VALUES (
        ?,
        'booking_imported',
        'autocab',
        'booked',
        ?,
        ?
      )
    `).run(
      bookingId,
      coding.status === 'valid'
        ? 'Autocab UHP booking imported with valid coding'
        : 'Autocab UHP booking imported requiring coding review',
      JSON.stringify(payload)
    );

    writeAudit({
      action: 'CREATE',
      entityType: 'booking',
      entityId: bookingId,
      newValue: JSON.stringify({
        publicReference,
        autocabBookingId,
        autocabReference,
        source: 'import',
        operationalStatus: 'booked',
        financialStatus,
        codingStatus:
          coding.status
      }),
      source: 'autocab',
      actorUserId: null
    });

    db.exec('COMMIT');

    return {
      bookingId,
      imported: true,
      existing: false,
      codingStatus:
        coding.status,
      publicReference
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


const AUTOCAB_OPERATIONAL_STATUS_BY_ROUTE = {
  accept: 'driver_allocated',
  arrived: 'driver_arrived',
  pob: 'passenger_on_board',
  complete: 'completed',
  cancelled: 'cancelled',
  nofare: 'no_fare'
};


const AUTOCAB_TERMINAL_OPERATIONAL_STATUSES =
  new Set([
    'completed',
    'cancelled',
    'no_show',
    'no_fare'
  ]);


const AUTOCAB_OPERATIONAL_STATUS_RANK = {
  draft: 0,
  submitting: 0,
  booked: 1,
  confirmed: 1,
  requires_review: 1,
  driver_allocated: 2,
  driver_en_route: 3,
  driver_arrived: 4,
  passenger_on_board: 5,
  completed: 6,
  cancelled: 6,
  no_show: 6,
  no_fare: 6,
  failed: 6
};


function findBookingForAutocabEvent(
  autocabBookingId,
  autocabReference
) {
  if (autocabBookingId) {
    const byId =
      db.prepare(`
        SELECT
          id,
          public_reference AS publicReference,
          operational_status AS operationalStatus
        FROM bookings
        WHERE autocab_booking_id = ?
        LIMIT 1
      `).get(autocabBookingId);

    if (byId) {
      return byId;
    }
  }

  if (!autocabReference) {
    return null;
  }

  const matches =
    db.prepare(`
      SELECT
        id,
        public_reference AS publicReference,
        operational_status AS operationalStatus
      FROM bookings
      WHERE autocab_reference = ?
      ORDER BY id
      LIMIT 2
    `).all(autocabReference);

  return matches.length === 1
    ? matches[0]
    : null;
}


function shouldApplyAutocabOperationalStatus(
  currentStatus,
  nextStatus
) {
  if (!nextStatus) {
    return false;
  }

  if (currentStatus === nextStatus) {
    return false;
  }

  if (
    AUTOCAB_TERMINAL_OPERATIONAL_STATUSES
      .has(currentStatus)
  ) {
    return false;
  }

  if (
    AUTOCAB_TERMINAL_OPERATIONAL_STATUSES
      .has(nextStatus)
  ) {
    return true;
  }

  const currentRank =
    AUTOCAB_OPERATIONAL_STATUS_RANK[
      currentStatus
    ] ?? 0;

  const nextRank =
    AUTOCAB_OPERATIONAL_STATUS_RANK[
      nextStatus
    ] ?? 0;

  return nextRank >= currentRank;
}


function reconcileAutocabBookingEvent({
  routeSuffix,
  payload,
  eventId,
  definition,
  autocabBookingId,
  autocabReference
}) {
  const booking =
    findBookingForAutocabEvent(
      autocabBookingId,
      autocabReference
    );

  if (!booking) {
    db.prepare(`
      UPDATE integration_events
      SET
        processing_status = 'ignored',
        processing_error =
          'No linked portal booking',
        processed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(eventId);

    return {
      linked: false,
      statusChanged: false
    };
  }

  const requestedStatus =
    AUTOCAB_OPERATIONAL_STATUS_BY_ROUTE[
      routeSuffix
    ] || null;

  const statusChanged =
    shouldApplyAutocabOperationalStatus(
      booking.operationalStatus,
      requestedStatus
    );

  const nextStatus =
    statusChanged
      ? requestedStatus
      : booking.operationalStatus;

  const noteByRoute = {
    modified:
      'Booking modified by Autocab',
    accept:
      'Dispatch accepted by Autocab driver',
    arrived:
      'Driver arrived',
    pob:
      'Passenger on board',
    late:
      'Booking reported running late',
    complete:
      'Booking completed',
    cancelled:
      'Booking cancelled',
    nofare:
      'Booking closed as No Fare'
  };

  db.exec('BEGIN');

  try {
    if (statusChanged) {
      db.prepare(`
        UPDATE bookings
        SET
          operational_status = ?,

          completed_at =
            CASE
              WHEN ? = 'completed'
                THEN COALESCE(
                  completed_at,
                  CURRENT_TIMESTAMP
                )
              ELSE completed_at
            END,

          cancelled_at =
            CASE
              WHEN ? = 'cancelled'
                THEN COALESCE(
                  cancelled_at,
                  CURRENT_TIMESTAMP
                )
              ELSE cancelled_at
            END,

          updated_at = CURRENT_TIMESTAMP

        WHERE id = ?
      `).run(
        nextStatus,
        nextStatus,
        nextStatus,
        booking.id
      );
    }

    db.prepare(`
      INSERT INTO booking_events
        (
          booking_id,
          event_type,
          event_source,
          old_status,
          new_status,
          notes,
          raw_payload
        )
      VALUES (?, ?, 'autocab', ?, ?, ?, ?)
    `).run(
      booking.id,
      definition.eventType,
      booking.operationalStatus,
      nextStatus,
      noteByRoute[routeSuffix] ||
        'Autocab booking event received',
      JSON.stringify(payload)
    );

    db.prepare(`
      UPDATE integration_events
      SET
        booking_id = ?,
        processing_status = 'processed',
        processing_error = NULL,
        processed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      booking.id,
      eventId
    );

    if (statusChanged) {
      writeAudit({
        action: 'STATUS_CHANGE',
        entityType: 'booking',
        entityId: booking.id,
        fieldName: 'operational_status',
        oldValue:
          booking.operationalStatus,
        newValue:
          nextStatus,
        source: 'autocab',
        actorUserId: null
      });
    }

    db.exec('COMMIT');

    return {
      linked: true,
      bookingId: booking.id,
      statusChanged,
      operationalStatus: nextStatus
    };
  } catch (error) {
    db.exec('ROLLBACK');

    db.prepare(`
      UPDATE integration_events
      SET
        processing_status = 'failed',
        processing_error = ?,
        processed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      String(
        error?.message ||
        'Operational event reconciliation failed'
      ),
      eventId
    );

    throw error;
  }
}


function captureAutocabWebhook(
  routeSuffix,
  payload
) {
  const definition =
    AUTOCAB_WEBHOOK_EVENTS[
      routeSuffix
    ];

  if (!definition) {
    const error = new Error(
      'Unsupported Autocab webhook event'
    );

    error.statusCode = 404;

    throw error;
  }

  /*
    High-frequency fleet telemetry is
    stored as latest known state rather
    than permanent integration events.
  */
  if (
    routeSuffix ===
      'vehicle_position'
  ) {
    return (
      captureAutocabVehiclePosition(
        payload
      )
    );
  }

  if (
    routeSuffix ===
      'vehicle_tracks'
  ) {
    return (
      captureAutocabVehicleTracks(
        payload
      )
    );
  }

  const autocabBookingId =
    definition.category === 'booking'
      ? normaliseAutocabScalar(
          payload?.Id
        )
      : null;

  const autocabReference =
    definition.category === 'booking'
      ? normaliseAutocabScalar(
          payload?.OurReference
        )
      : null;

  const result =
    db.prepare(`
      INSERT INTO integration_events
        (
          provider,
          direction,
          event_type,
          route_suffix,
          category,
          autocab_booking_id,
          autocab_reference,
          payload_json,
          processing_status
        )
      VALUES (
        'autocab',
        'inbound',
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        'received'
      )
    `).run(
      definition.eventType,
      routeSuffix,
      definition.category,
      autocabBookingId,
      autocabReference,
      JSON.stringify(payload)
    );

  const eventId =
    Number(
      result.lastInsertRowid
    );

  if (
    routeSuffix === 'created'
  ) {
    try {
      const importResult =
        importAutocabCreatedBooking(
          payload
        );

      db.prepare(`
        UPDATE integration_events
        SET
          booking_id = ?,
          processing_status =
            'processed',
          processing_error = NULL,
          processed_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        importResult.bookingId,
        eventId
      );

      return {
        received: true,
        eventId,
        eventType:
          definition.eventType,
        category:
          definition.category,
        autocabBookingId,
        autocabReference,
        ...importResult
      };
    } catch (error) {
      db.prepare(`
        UPDATE integration_events
        SET
          processing_status =
            'failed',
          processing_error = ?,
          processed_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        String(
          error?.message ||
          'Booking import failed'
        ),
        eventId
      );

      throw error;
    }
  }

  let reconciliation = null;

  if (
    definition.category === 'booking'
  ) {
    reconciliation =
      reconcileAutocabBookingEvent({
        routeSuffix,
        payload,
        eventId,
        definition,
        autocabBookingId,
        autocabReference
      });
  }

  return {
    received: true,
    eventId,
    eventType:
      definition.eventType,
    category:
      definition.category,
    autocabBookingId,
    autocabReference,
    reconciliation
  };
}

function findAutocabLinkedBooking(
  autocabBookingId,
  autocabReference
) {
  if (
    !autocabBookingId &&
    !autocabReference
  ) {
    const error = new Error(
      'autocabBookingId or autocabReference is required'
    );
    error.statusCode = 400;
    throw error;
  }

  const matches = db.prepare(`
    SELECT
      id,
      public_reference AS publicReference,
      autocab_booking_id AS autocabBookingId,
      autocab_reference AS autocabReference,
      operational_status AS operationalStatus,
      financial_status AS financialStatus,
      completed_at AS completedAt

    FROM bookings

    WHERE (
      ? IS NOT NULL
      AND autocab_booking_id = ?
    )
    OR (
      ? IS NOT NULL
      AND autocab_reference = ?
    )

    ORDER BY id
  `).all(
    autocabBookingId,
    autocabBookingId,
    autocabReference,
    autocabReference
  );

  if (matches.length === 0) {
    const error = new Error(
      'No portal booking matches the supplied Autocab identifiers'
    );
    error.statusCode = 404;
    throw error;
  }

  if (matches.length > 1) {
    const error = new Error(
      'Autocab identifiers resolve to different portal bookings'
    );
    error.statusCode = 409;
    throw error;
  }

  const booking =
    matches[0];

  if (
    autocabBookingId &&
    booking.autocabBookingId &&
    booking.autocabBookingId !==
      autocabBookingId
  ) {
    const error = new Error(
      'Autocab booking id conflicts with the linked portal booking'
    );
    error.statusCode = 409;
    throw error;
  }

  if (
    autocabReference &&
    booking.autocabReference &&
    booking.autocabReference !==
      autocabReference
  ) {
    const error = new Error(
      'Autocab reference conflicts with the linked portal booking'
    );
    error.statusCode = 409;
    throw error;
  }

  return booking;
}


function handleAutocabCompletedWebhook(
  payload = {}
) {
  const autocabBookingId =
    payload.autocabBookingId === null ||
    payload.autocabBookingId ===
      undefined
      ? null
      : String(
          payload.autocabBookingId
        ).trim() || null;

  const autocabReference =
    payload.autocabReference === null ||
    payload.autocabReference ===
      undefined
      ? null
      : String(
          payload.autocabReference
        ).trim() || null;

  const completedAt =
    payload.completedAt === null ||
    payload.completedAt ===
      undefined
      ? null
      : String(
          payload.completedAt
        ).trim() || null;

  if (
    completedAt &&
    Number.isNaN(
      Date.parse(completedAt)
    )
  ) {
    const error = new Error(
      'completedAt must be a valid date/time'
    );
    error.statusCode = 400;
    throw error;
  }

  /*
    Validate and normalize financial
    data before changing the booking's
    operational state.
  */
  const normalisedFare =
    normaliseBookingFarePayload(
      {
        ...payload,
        externalReference:
          payload.externalReference ??
          autocabReference ??
          autocabBookingId
      },
      {
        forcedSource: 'autocab',
        rawPayloadOverride: payload
      }
    );

  const booking =
    findAutocabLinkedBooking(
      autocabBookingId,
      autocabReference
    );

  const existingFinancial =
    db.prepare(`
      SELECT
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
    `).get(booking.id);

  const identicalFare =
    existingFinancial &&
    existingFinancial.grossAmountPence ===
      normalisedFare.grossAmountPence &&
    existingFinancial.netAmountPence ===
      normalisedFare.netAmountPence &&
    existingFinancial.vatAmountPence ===
      normalisedFare.vatAmountPence &&
    existingFinancial.currency === 'GBP' &&
    existingFinancial.source ===
      'autocab' &&
    (
      existingFinancial
        .externalReference ||
      null
    ) === (
      normalisedFare
        .externalReference ||
      null
    );

  const alreadyCompleted =
    booking.operationalStatus ===
      'completed';

  /*
    A genuine webhook retry with the
    same normalized fare is a no-op.
  */
  if (
    alreadyCompleted &&
    identicalFare
  ) {
    return {
      duplicate: true,
      booking: {
        id: booking.id,
        publicReference:
          booking.publicReference,
        operationalStatus:
          booking.operationalStatus,
        financialStatus:
          booking.financialStatus,
        completedAt:
          booking.completedAt
      },
      financial: {
        bookingId:
          booking.id,
        ...existingFinancial
      }
    };
  }

  /*
    Completion and identifier linkage
    are committed first. Fare ingestion
    follows as a controlled second step.
    If fare persistence ever fails, a
    webhook retry can safely resume.
  */
  if (!alreadyCompleted) {
    db.exec('BEGIN');

    try {
      db.prepare(`
        UPDATE bookings
        SET
          operational_status =
            'completed',

          completed_at =
            COALESCE(
              ?,
              completed_at,
              CURRENT_TIMESTAMP
            ),

          autocab_booking_id =
            COALESCE(
              autocab_booking_id,
              ?
            ),

          autocab_reference =
            COALESCE(
              autocab_reference,
              ?
            ),

          updated_at =
            CURRENT_TIMESTAMP

        WHERE id = ?
      `).run(
        completedAt
          ? new Date(
              completedAt
            ).toISOString()
          : null,
        autocabBookingId,
        autocabReference,
        booking.id
      );

      db.prepare(`
        INSERT INTO booking_events
          (
            booking_id,
            event_type,
            event_source,
            old_status,
            new_status,
            notes,
            raw_payload
          )
        VALUES (
          ?,
          'booking_completed',
          'autocab',
          ?,
          'completed',
          'Booking completed by Autocab callback',
          ?
        )
      `).run(
        booking.id,
        booking.operationalStatus,
        JSON.stringify(payload)
      );

      writeAudit({
        action:
          'STATUS_CHANGE',
        entityType:
          'booking',
        entityId:
          booking.id,
        fieldName:
          'operational_status',
        oldValue:
          booking.operationalStatus,
        newValue:
          'completed',
        source:
          'autocab'
      });

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } else if (
    (
      autocabBookingId &&
      !booking.autocabBookingId
    ) ||
    (
      autocabReference &&
      !booking.autocabReference
    )
  ) {
    db.prepare(`
      UPDATE bookings
      SET
        autocab_booking_id =
          COALESCE(
            autocab_booking_id,
            ?
          ),
        autocab_reference =
          COALESCE(
            autocab_reference,
            ?
          ),
        updated_at =
          CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      autocabBookingId,
      autocabReference,
      booking.id
    );
  }

  const result =
    ingestBookingFare(
      booking.id,
      null,
      {
        grossAmountPence:
          normalisedFare
            .grossAmountPence,

        netAmountPence:
          normalisedFare
            .netAmountPence,

        vatAmountPence:
          normalisedFare
            .vatAmountPence,

        source:
          'autocab',

        externalReference:
          normalisedFare
            .externalReference,

        rawPayload:
          payload
      }
    );

  const completedBooking =
    db.prepare(`
      SELECT
        completed_at AS completedAt
      FROM bookings
      WHERE id = ?
    `).get(booking.id);

  return {
    duplicate: false,
    booking: {
      ...result.booking,
      completedAt:
        completedBooking
          ?.completedAt ||
        null
    },
    financial:
      result.financial
  };
}


function normaliseBookingFarePayload(
  payload = {},
  options = {}
) {
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
    options.forcedSource ??
    payload.source ??
    ''
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
    options.rawPayloadOverride !==
      undefined
  ) {
    rawPayload =
      typeof options.rawPayloadOverride ===
        'string'
        ? options.rawPayloadOverride
        : JSON.stringify(
            options.rawPayloadOverride
          );
  } else if (
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

  return {
    grossAmountPence,
    netAmountPence,
    vatAmountPence,
    source,
    externalReference,
    rawPayload
  };
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

  const {
    grossAmountPence,
    netAmountPence,
    vatAmountPence,
    source,
    externalReference,
    rawPayload
  } = normaliseBookingFarePayload(
    payload
  );

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

  const pickup = resolveBookingStop(payload.pickup);
  const destination = resolveBookingStop(payload.destination);

  const vias = Array.isArray(payload.vias)
    ? payload.vias
        .map(resolveBookingStop)
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

  if (
    !permission &&
    !userHasRoleById(
      createdByUserId,
      'uhp_admin'
    )
  ) {
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
          notes,
          latitude,
          longitude,
          saved_location_id,
          location_name,
          pickup_instructions
        )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let sequenceNumber = 0;

    insertStop.run(
      bookingId,
      sequenceNumber++,
      'pickup',
      pickup.address,
      pickup.postcode || null,
      pickup.notes || null,
      pickup.latitude,
      pickup.longitude,
      pickup.savedLocationId,
      pickup.locationName,
      pickup.pickupInstructions
    );

    for (const via of vias) {
      insertStop.run(
        bookingId,
        sequenceNumber++,
        'via',
        via.address,
        via.postcode || null,
        via.notes || null,
        via.latitude,
        via.longitude,
        via.savedLocationId,
        via.locationName,
        via.pickupInstructions
      );
    }

    insertStop.run(
      bookingId,
      sequenceNumber,
      'destination',
      destination.address,
      destination.postcode || null,
      destination.notes || null,
      destination.latitude,
      destination.longitude,
      destination.savedLocationId,
      destination.locationName,
      destination.pickupInstructions
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

function getContentType(filePath) {
  const extension =
    path.extname(filePath).toLowerCase();

  const contentTypes = {
    '.html':
      'text/html; charset=utf-8',

    '.js':
      'text/javascript; charset=utf-8',

    '.css':
      'text/css; charset=utf-8',

    '.json':
      'application/json; charset=utf-8',

    '.svg':
      'image/svg+xml',

    '.png':
      'image/png',

    '.jpg':
      'image/jpeg',

    '.jpeg':
      'image/jpeg',

    '.webp':
      'image/webp',

    '.ico':
      'image/x-icon',

    '.woff':
      'font/woff',

    '.woff2':
      'font/woff2'
  };

  return (
    contentTypes[extension] ||
    'application/octet-stream'
  );
}

function sendStaticFile(
  res,
  filePath,
  cacheControl
) {
  const content =
    fs.readFileSync(filePath);

  res.writeHead(
    200,
    {
      'Content-Type':
        getContentType(filePath),

      'Content-Length':
        content.length,

      'Cache-Control':
        cacheControl
    }
  );

  res.end(content);
}

function serveFrontend(
  res,
  url
) {
  const indexPath =
    path.join(
      DIST_DIR,
      'index.html'
    );

  if (!fs.existsSync(indexPath)) {
    return false;
  }

  const requested =
    decodeURIComponent(
      url.pathname
    );

  const relativePath =
    requested
      .replace(/^\/+/, '');

  if (relativePath) {
    const requestedFile =
      path.resolve(
        DIST_DIR,
        relativePath
      );

    const insideDist =
      requestedFile === DIST_DIR ||
      requestedFile.startsWith(
        `${DIST_DIR}${path.sep}`
      );

    if (
      insideDist &&
      fs.existsSync(requestedFile) &&
      fs.statSync(requestedFile).isFile()
    ) {
      const immutable =
        relativePath.startsWith(
          'assets/'
        );

      sendStaticFile(
        res,
        requestedFile,
        immutable
          ? 'public, max-age=31536000, immutable'
          : 'no-store'
      );

      return true;
    }
  }

  sendStaticFile(
    res,
    indexPath,
    'no-store'
  );

  return true;
}

function parseGeocodingSearchQuery(
  rawQuery
) {
  const query =
    String(rawQuery || '')
      .trim();

  if (query.length < 3) {
    const error =
      new Error(
        'Enter at least 3 characters to search'
      );

    error.statusCode = 400;

    throw error;
  }

  if (query.length > 160) {
    const error =
      new Error(
        'Address search is too long'
      );

    error.statusCode = 400;

    throw error;
  }

  return query;
}


function normaliseGeocodingFeature(
  feature
) {
  const coordinates =
    Array.isArray(
      feature?.geometry?.coordinates
    )
      ? feature.geometry.coordinates
      : (
          Array.isArray(feature?.center)
            ? feature.center
            : null
        );

  const longitude =
    Number(coordinates?.[0]);

  const latitude =
    Number(coordinates?.[1]);

  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return null;
  }

  const properties =
    feature?.properties || {};

  const context =
    Array.isArray(feature?.context)
      ? feature.context
      : [];

  const postcodeContext =
    context.find(
      (item) =>
        String(item?.id || '')
          .startsWith('postcode.')
    );

  const postcodeSource =
    String(
      properties.postcode ||
      feature?.postcode ||
      postcodeContext?.text ||
      ''
    )
      .trim()
      .toUpperCase();

  const label =
    String(
      feature?.place_name ||
      feature?.text ||
      properties.name ||
      ''
    ).trim();

  if (!label) {
    return null;
  }

  const postcodeMatch =
    label
      .toUpperCase()
      .match(
        /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/
      );

  const postcode =
    postcodeSource ||
    (
      postcodeMatch
        ? postcodeMatch[1]
            .replace(
              /\s+/g,
              ''
            )
            .replace(
              /(.+)(\d[A-Z]{2})$/,
              '$1 $2'
            )
        : null
    );

  return {
    id:
      String(
        feature?.id ||
        `${longitude},${latitude}:${label}`
      ),

    label,

    address:
      String(
        feature?.place_name ||
        label
      ).trim(),

    postcode,

    latitude,
    longitude
  };
}


async function searchMapTilerGeocoding(
  query,
  signal
) {
  if (!MAPTILER_GEOCODING_API_KEY) {
    const error =
      new Error(
        'Address search is not configured'
      );

    error.statusCode = 503;

    throw error;
  }

  const url =
    new URL(
      `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json`
    );

  url.searchParams.set(
    'key',
    MAPTILER_GEOCODING_API_KEY
  );

  url.searchParams.set(
    'limit',
    '8'
  );

  url.searchParams.set(
    'language',
    'en'
  );

  /*
   * Taxi bookings need named venues and useful
   * journey locations as well as postal addresses.
   *
   * POIs are not returned by MapTiler's default
   * geocoding configuration, so enable them
   * explicitly and exclude broad geographic
   * features that add noise to autocomplete.
   */
  url.searchParams.set(
    'types',
    [
      'poi',
      'address',
      'road',
      'postal_code',
      'place',
      'locality',
      'neighbourhood'
    ].join(',')
  );

  /*
   * Prefer Plymouth / Derriford results without
   * excluding legitimate destinations elsewhere
   * in the United Kingdom.
   */
  url.searchParams.set(
    'proximity',
    '-4.1427,50.4168'
  );

  url.searchParams.set(
    'country',
    'gb'
  );

  const response =
    await fetch(
      url,
      {
        method: 'GET',
        headers: {
          Accept:
            'application/json'
        },
        signal
      }
    );

  if (!response.ok) {
    const error =
      new Error(
        `Geocoding service returned ${response.status}`
      );

    error.statusCode =
      response.status === 403
        ? 503
        : 502;

    throw error;
  }

  const data =
    await response.json();

  const features =
    Array.isArray(data?.features)
      ? data.features
      : [];

  return features
    .map(
      normaliseGeocodingFeature
    )
    .filter(Boolean)
    .slice(0, 8);
}


function listFreshClearVehicles() {
  const rows =
    db.prepare(`
      SELECT
        state.vehicle_id AS vehicleId,
        state.callsign,
        state.registration,
        state.plate_number AS plateNumber,
        state.vehicle_status AS vehicleStatus,
        state.booking_id AS bookingId,

        COALESCE(
          position.longitude,
          state.longitude
        ) AS longitude,

        COALESCE(
          position.latitude,
          state.latitude
        ) AS latitude,

        position.speed_mph AS speedMph,
        position.heading_degrees AS headingDegrees,
        position.heading_direction AS headingDirection,

        COALESCE(
          position.source_timestamp,
          state.source_timestamp
        ) AS sourceTimestamp,

        COALESCE(
          position.updated_at,
          state.updated_at
        ) AS updatedAt

      FROM autocab_vehicle_state AS state

      LEFT JOIN autocab_vehicle_position AS position
        ON position.vehicle_id =
          state.vehicle_id

      WHERE state.vehicle_status = 'Clear'
        AND (
          state.booking_id IS NULL OR
          TRIM(state.booking_id) = ''
        )

      ORDER BY
        CAST(state.callsign AS INTEGER),
        state.callsign
    `).all();

  const now =
    Date.now();

  return rows
    .map((row) => {
      const latitude =
        Number(row.latitude);

      const longitude =
        Number(row.longitude);

      const timestamp =
        row.sourceTimestamp ||
        row.updatedAt ||
        null;

      const timestampMs =
        timestamp
          ? Date.parse(timestamp)
          : NaN;

      const ageSeconds =
        Number.isFinite(timestampMs)
          ? Math.max(
              0,
              Math.round(
                (now - timestampMs) / 1000
              )
            )
          : null;

      return {
        vehicleId:
          Number(row.vehicleId),

        callsign:
          row.callsign ?? null,

        registration:
          row.registration ?? null,

        plateNumber:
          row.plateNumber ?? null,

        vehicleStatus:
          row.vehicleStatus,

        latitude,
        longitude,

        speedMph:
          Number.isFinite(
            Number(row.speedMph)
          )
            ? Number(row.speedMph)
            : null,

        headingDegrees:
          Number.isFinite(
            Number(row.headingDegrees)
          )
            ? Number(row.headingDegrees)
            : null,

        headingDirection:
          row.headingDirection ?? null,

        positionAt:
          timestamp,

        ageSeconds
      };
    })
    .filter((vehicle) =>
      vehicle.vehicleStatus === 'Clear' &&
      Number.isFinite(vehicle.latitude) &&
      Number.isFinite(vehicle.longitude) &&
      vehicle.latitude >= -90 &&
      vehicle.latitude <= 90 &&
      vehicle.longitude >= -180 &&
      vehicle.longitude <= 180 &&
      vehicle.ageSeconds !== null &&
      vehicle.ageSeconds <= 120
    );
}


function parseRoutingCoordinates(
  rawCoordinates
) {
  const value =
    String(rawCoordinates || '')
      .trim();

  if (!value) {
    const error = new Error(
      'Routing coordinates are required'
    );

    error.statusCode = 400;

    throw error;
  }

  const points =
    value.split(';');

  if (
    points.length < 2 ||
    points.length > 50
  ) {
    const error = new Error(
      'Routing requires between 2 and 50 coordinates'
    );

    error.statusCode = 400;

    throw error;
  }

  const normalised =
    points.map((point) => {
      const parts =
        point.split(',');

      if (parts.length !== 2) {
        const error =
          new Error(
            'Invalid routing coordinate'
          );

        error.statusCode = 400;

        throw error;
      }

      const longitude =
        Number(parts[0]);

      const latitude =
        Number(parts[1]);

      if (
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90
      ) {
        const error =
          new Error(
            'Invalid routing coordinate'
          );

        error.statusCode = 400;

        throw error;
      }

      return (
        `${longitude},${latitude}`
      );
    });

  return normalised.join(';');
}


async function fetchRoadRoute(
  coordinates,
  signal
) {
  if (!OSRM_BASE_URL) {
    const error = new Error(
      'Routing service is not configured'
    );

    error.statusCode = 503;

    throw error;
  }

  const url =
    `${OSRM_BASE_URL}/route/v1/driving/` +
    `${coordinates}` +
    '?overview=full&geometries=geojson&steps=false';

  let response;

  try {
    response =
      await fetch(
        url,
        {
          signal
        }
      );
  } catch (cause) {
    const error = new Error(
      'Routing service is unavailable'
    );

    error.statusCode = 503;
    error.cause = cause;

    throw error;
  }

  if (!response.ok) {
    const error = new Error(
      `Routing service returned ${response.status}`
    );

    error.statusCode = 502;

    throw error;
  }

  let data;

  try {
    data =
      await response.json();
  } catch {
    const error = new Error(
      'Routing service returned invalid data'
    );

    error.statusCode = 502;

    throw error;
  }

  const geometry =
    data?.routes?.[0]?.geometry;

  if (
    data?.code !== 'Ok' ||
    !geometry ||
    geometry.type !== 'LineString' ||
    !Array.isArray(
      geometry.coordinates
    )
  ) {
    const error = new Error(
      'Routing service returned no usable route'
    );

    error.statusCode = 502;

    throw error;
  }

  return {
    code: 'Ok',
    route: {
      geometry: {
        type: 'LineString',
        coordinates:
          geometry.coordinates
      },

      distance:
        Number(
          data.routes[0]
            ?.distance
        ) || null,

      duration:
        Number(
          data.routes[0]
            ?.duration
        ) || null
    }
  };
}


const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(
      204,
      {
        ...getCorsHeaders(),

        'Access-Control-Allow-Methods':
          'GET,POST,PATCH,OPTIONS',

        'Access-Control-Allow-Headers':
          'Content-Type, X-Autocab-Webhook-Secret',

        'Cache-Control':
          'no-store'
      }
    );

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

    if (
      req.method === 'GET' &&
      url.pathname === '/api/health'
    ) {
      const databaseCheck =
        db.prepare(
          'SELECT 1 AS ok'
        ).get();

      return sendJson(
        res,
        200,
        {
          ok:
            databaseCheck?.ok === 1,

          service:
            'uhp-transport-api',

          database:
            databaseCheck?.ok === 1
              ? 'ok'
              : 'unavailable'
        }
      );
    }

    const autocabWebhookMatch =
      url.pathname.match(
        /^\/api\/integrations\/autocab\/([a-z_]+)$/
      );

    if (
      req.method === 'POST' &&
      autocabWebhookMatch &&
      Object.prototype.hasOwnProperty.call(
        AUTOCAB_WEBHOOK_EVENTS,
        autocabWebhookMatch[1]
      )
    ) {
      requireAutocabWebhookSecret(
        req
      );

      const payload =
        await readJson(req);

      const result =
        captureAutocabWebhook(
          autocabWebhookMatch[1],
          payload
        );

      return sendJson(
        res,
        200,
        result
      );
    }


    if (
      req.method === 'POST' &&
      url.pathname ===
        '/api/integrations/autocab/completed'
    ) {
      requireAutocabWebhookSecret(
        req
      );

      const payload =
        await readJson(req);

      const result =
        handleAutocabCompletedWebhook(
          payload
        );

      return sendJson(
        res,
        200,
        result
      );
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
      url.pathname ===
        '/api/geocoding/search'
    ) {
      requireAuth(req);

      const query =
        parseGeocodingSearchQuery(
          url.searchParams.get('q')
        );

      const controller =
        new AbortController();

      const timeoutId =
        setTimeout(
          () =>
            controller.abort(),
          6000
        );

      try {
        const results =
          await searchMapTilerGeocoding(
            query,
            controller.signal
          );

        return sendJson(
          res,
          200,
          {
            results
          }
        );
      } finally {
        clearTimeout(
          timeoutId
        );
      }
    }


    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/booking-map/clear-vehicles'
    ) {
      requireAuth(req);

      return sendJson(
        res,
        200,
        {
          vehicles:
            listFreshClearVehicles(),
          generatedAt:
            new Date().toISOString()
        }
      );
    }


    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/routing/route'
    ) {
      requireAuth(req);

      const coordinates =
        parseRoutingCoordinates(
          url.searchParams.get(
            'coordinates'
          )
        );

      const controller =
        new AbortController();

      const timeoutId =
        setTimeout(
          () =>
            controller.abort(),
          8000
        );

      try {
        const route =
          await fetchRoadRoute(
            coordinates,
            controller.signal
          );

        return sendJson(
          res,
          200,
          route
        );
      } finally {
        clearTimeout(
          timeoutId
        );
      }
    }


    const liveBookingMatch =
      url.pathname.match(
        /^\/api\/bookings\/(\d+)\/live-state$/
      );

    if (
      req.method === 'GET' &&
      liveBookingMatch
    ) {
      const auth =
        requireAuth(req);

      const bookingId =
        Number(liveBookingMatch[1]);

      if (
        !canViewLiveBooking(
          bookingId,
          auth
        )
      ) {
        return sendJson(
          res,
          403,
          {
            error:
              'You do not have access to this booking'
          }
        );
      }

      const operational =
        getOperationalBookingById(
          bookingId
        );

      if (!operational) {
        return sendJson(
          res,
          404,
          {
            error:
              'Booking operational state not found'
          }
        );
      }

      return sendJson(
        res,
        200,
        {
          booking: {
            id:
              operational.id,

            operationalStatus:
              operational.operationalStatus,

            acceptedAt:
              operational.acceptedAt ?? null,

            arrivedAt:
              operational.arrivedAt ?? null,

            passengerOnBoardAt:
              operational.passengerOnBoardAt ?? null,

            completedEventAt:
              operational.completedEventAt ?? null,

            cancelledEventAt:
              operational.cancelledEventAt ?? null,

            noFareAt:
              operational.noFareAt ?? null,

            driverCallsign:
              operational.driverCallsign ?? null,

            driverName:
              operational.driverName ?? null,

            vehicleCallsign:
              operational.vehicleCallsign ?? null,

            vehicleRegistration:
              operational.vehicleRegistration ?? null,

            vehiclePlateNumber:
              operational.vehiclePlateNumber ?? null,

            vehicleStatus:
              operational.vehicleStatus ?? null,

            liveState:
              operational.liveState ?? null,

            liveStateReason:
              operational.liveStateReason ?? null,

            fleetStateAt:
              operational.fleetStateAt ?? null,

            fleetAgeSeconds:
              operational.fleetAgeSeconds ?? null,

            vehicleLongitude:
              operational.vehicleLongitude ?? null,

            vehicleLatitude:
              operational.vehicleLatitude ?? null,

            vehicleSpeedMph:
              operational.vehicleSpeedMph ?? null,

            vehicleHeadingDegrees:
              operational.vehicleHeadingDegrees ?? null,

            vehicleHeadingDirection:
              operational.vehicleHeadingDirection ?? null,

            vehiclePositionAt:
              operational.vehiclePositionAt ?? null,

            vehiclePositionUpdatedAt:
              operational.vehiclePositionUpdatedAt ?? null,

            operationalSnapshotAt:
              operational.operationalSnapshotAt ?? null
          }
        }
      );
    }


    if (
      req.method === 'GET' &&
      url.pathname === '/api/uhp/bookings'
    ) {
      requireAnyRole(
        req,
        ['uhp_admin']
      );

      return sendJson(res, 200, {
        bookings:
          listOperationalBookings()
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
      url.pathname ===
        '/api/coding-review'
    ) {
      const auth =
        requireAnyRole(
          req,
          [
            'uhp_admin',
            'nac_admin'
          ]
        );

      return sendJson(
        res,
        200,
        {
          bookings:
            listCodingReviewBookings(),
          options:
            listCodingReviewOptions(),
          user:
            auth.user
        }
      );
    }

    const codingReviewApproveMatch =
      url.pathname.match(
        /^\/api\/coding-review\/(\d+)\/approve$/
      );

    if (
      req.method === 'POST' &&
      codingReviewApproveMatch
    ) {
      const payload =
        await readJson(req);

      const bookingId =
        Number(
          codingReviewApproveMatch[1]
        );

      const auth =
        requireAnyRole(
          req,
          [
            'uhp_admin',
            'nac_admin'
          ]
        );

      const result =
        approveBookingCoding(
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

    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/locations'
    ) {
      return sendJson(
        res,
        200,
        {
          locations:
            listLocations()
        }
      );
    }


    if (
      req.method === 'POST' &&
      url.pathname ===
        '/api/locations'
    ) {
      const auth =
        requireAnyRole(
          req,
          ['uhp_admin']
        );

      const payload =
        await readJson(req);

      const location =
        createLocation(
          payload,
          auth.user.id
        );

      return sendJson(
        res,
        201,
        {
          location
        }
      );
    }


    const locationStatusMatch =
      url.pathname.match(
        /^\/api\/locations\/(\d+)\/status$/
      );

    if (
      req.method === 'PATCH' &&
      locationStatusMatch
    ) {
      const auth =
        requireAnyRole(
          req,
          ['uhp_admin']
        );

      const payload =
        await readJson(req);

      const location =
        setLocationStatus(
          Number(
            locationStatusMatch[1]
          ),
          String(
            payload.status || ''
          ),
          auth.user.id
        );

      return sendJson(
        res,
        200,
        {
          location
        }
      );
    }


    const locationMatch =
      url.pathname.match(
        /^\/api\/locations\/(\d+)$/
      );

    if (
      req.method === 'PATCH' &&
      locationMatch
    ) {
      const auth =
        requireAnyRole(
          req,
          ['uhp_admin']
        );

      const payload =
        await readJson(req);

      const location =
        updateLocation(
          Number(
            locationMatch[1]
          ),
          payload,
          auth.user.id
        );

      return sendJson(
        res,
        200,
        {
          location
        }
      );
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

    if (
      req.method === 'GET' &&
      !url.pathname.startsWith('/api/')
    ) {
      const served =
        serveFrontend(
          res,
          url
        );

      if (served) {
        return;
      }
    }

    return sendJson(
      res,
      404,
      {
        error:
          'Not found'
      }
    );
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

const PORT =
  Number(
    process.env.PORT ||
    3001
  );

const HOST =
  String(
    process.env.HOST ||
    (
      IS_PRODUCTION
        ? '0.0.0.0'
        : '127.0.0.1'
    )
  );

server.listen(
  PORT,
  HOST,
  () => {
    console.log(
      `UHP portal listening on http://${HOST}:${PORT}`
    );

    console.log(
      `Environment: ${NODE_ENV}`
    );

    console.log(
      `SQLite database: ${DB_PATH}`
    );
  }
);

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
