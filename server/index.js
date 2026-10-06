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

const ENV_FILE =
  path.join(ROOT, '.env');

if (
  fs.existsSync(ENV_FILE)
) {
  process.loadEnvFile(
    ENV_FILE
  );
}

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

const STAFF_TRANSPORT_LIVE_BOOTSTRAP =
  String(
    process.env.STAFF_TRANSPORT_LIVE_BOOTSTRAP ||
    ''
  )
    .trim()
    .toLowerCase() === 'true';

const STAFF_TRANSPORT_PROGRAMME_CODE =
  String(
    process.env.STAFF_TRANSPORT_PROGRAMME_CODE ||
    'XMAS-2026-27'
  ).trim();

const STAFF_TRANSPORT_PROGRAMME_NAME =
  String(
    process.env.STAFF_TRANSPORT_PROGRAMME_NAME ||
    'Christmas & New Year Staff Transport 2026/27'
  ).trim();

const STAFF_TRANSPORT_REQUEST_OPENS_AT =
  String(
    process.env.STAFF_TRANSPORT_REQUEST_OPENS_AT ||
    '2026-10-01T00:00:00+01:00'
  ).trim();

const STAFF_TRANSPORT_REQUEST_CLOSES_AT =
  String(
    process.env.STAFF_TRANSPORT_REQUEST_CLOSES_AT ||
    '2026-12-24T23:59:59.000Z'
  ).trim();

const STAFF_TRANSPORT_WINDOW_NAME =
  String(
    process.env.STAFF_TRANSPORT_WINDOW_NAME ||
    'Christmas Day Staff Transport'
  ).trim();

const STAFF_TRANSPORT_WINDOW_STARTS_AT =
  String(
    process.env.STAFF_TRANSPORT_WINDOW_STARTS_AT ||
    '2026-12-25T00:00:00.000Z'
  ).trim();

const STAFF_TRANSPORT_WINDOW_ENDS_AT =
  String(
    process.env.STAFF_TRANSPORT_WINDOW_ENDS_AT ||
    '2026-12-25T23:59:59.000Z'
  ).trim();

const STAFF_TRANSPORT_ACCESS_CODE =
  String(
    process.env.STAFF_TRANSPORT_ACCESS_CODE ||
    ''
  ).trim();

const SENDGRID_API_KEY =
  String(
    process.env.SENDGRID_API_KEY ||
    ''
  ).trim();

const SENDGRID_FROM_EMAIL =
  String(
    process.env.SENDGRID_FROM_EMAIL ||
    ''
  ).trim();

const SENDGRID_FROM_NAME =
  String(
    process.env.SENDGRID_FROM_NAME ||
    'UHP Staff Transport'
  ).trim();

const STAFF_SMS_GATEWAY_URL =
  String(
    process.env.STAFF_SMS_GATEWAY_URL ||
    ''
  ).trim();

const STAFF_TRANSPORT_ALLOWED_EMAIL_DOMAINS =
  String(
    process.env
      .STAFF_TRANSPORT_ALLOWED_EMAIL_DOMAINS ||
    ''
  )
    .split(',')
    .map(
      (value) =>
        value
          .trim()
          .toLowerCase()
          .replace(/^@/, '')
    )
    .filter(Boolean);

const STAFF_TRANSPORT_SESSION_COOKIE =
  'uhp_staff_transport_session';

const AUTOCAB_BOOKING_API_URL =
  String(
    process.env.AUTOCAB_BOOKING_API_URL ||
    'https://autocab-api.azure-api.net'
  ).replace(/\/$/, '');

const AUTOCAB_SUBSCRIPTION_KEY =
  String(
    process.env.AUTOCAB_SUBSCRIPTION_KEY ||
    ''
  ).trim();

const AUTOCAB_COMPANY_ID =
  Number(
    process.env.AUTOCAB_COMPANY_ID || 1
  );

const AUTOCAB_UHP_CUSTOMER_ID =
  Number(
    process.env.AUTOCAB_UHP_CUSTOMER_ID ||
    2139
  );

const AUTOCAB_UHP_XMAS_CUSTOMER_ID =
  Number(
    process.env
      .AUTOCAB_UHP_XMAS_CUSTOMER_ID ||
    2023
  );


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


function userIsSpecialTransportOpsOnly(
  user
) {
  const roleCodes =
    (user?.roles || [])
      .map(
        role =>
          String(
            role?.code || ''
          ).trim()
      )
      .filter(Boolean);

  return roleCodes.includes(
    'special_transport_ops'
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

  /*
    Special Transport Ops accounts are
    deliberately isolated from the rest
    of the portal.

    They may use only the dedicated
    Christmas/Special Transport enquiry
    API. Hiding navigation is not relied
    upon as an access-control boundary.
  */
  const scopedAuth =
    getAuthSession(req);

  if (
    scopedAuth &&
    userIsSpecialTransportOpsOnly(
      scopedAuth.user
    )
  ) {
    if (
      pathname ===
        '/api/transport-operations/christmas-enquiries' ||
      pathname.startsWith(
        '/api/transport-operations/christmas-enquiries/'
      )
    ) {
      return scopedAuth;
    }

    const error =
      new Error(
        'This account is restricted to Special Transport enquiries'
      );

    error.statusCode = 403;
    throw error;
  }

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
      '/api/transport-operations/'
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
    pathname === '/api/transport-request-imports' ||
    pathname.startsWith(
      '/api/transport-request-imports/'
    )
  ) {
    return requireAuth(req);
  }


  if (
    pathname === '/api/transport-requests' ||
    pathname.startsWith(
      '/api/transport-requests/'
    )
  ) {
    return requireAuth(req);
  }


  if (
    pathname === '/api/transport-programmes' ||
    pathname.startsWith(
      '/api/transport-programmes/'
    ) ||
    pathname.startsWith(
      '/api/transport-programme-windows/'
    ) ||
    pathname.startsWith(
      '/api/transport-programme-capacity/'
    )
  ) {
    if (req.method === 'GET') {
      return requireAnyRole(
        req,
        [
          'uhp_admin',
          'nac_admin'
        ]
      );
    }

    return requireAnyRole(
      req,
      ['nac_admin']
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
      '/api/booking-favourites' ||
    pathname.startsWith(
      '/api/booking-favourites/'
    ) ||
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
      '/api/pickup-eta' ||
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

function normaliseStaffTransportEmail(
  value
) {
  return String(value || '')
    .trim()
    .toLowerCase();
}


function staffTransportEmailDomain(
  email
) {
  const cleanEmail =
    normaliseStaffTransportEmail(
      email
    );

  const atIndex =
    cleanEmail.lastIndexOf('@');

  if (
    atIndex < 1 ||
    atIndex === cleanEmail.length - 1
  ) {
    return '';
  }

  return cleanEmail.slice(
    atIndex + 1
  );
}


function staffTransportEmailAllowed(
  email
) {
  if (
    STAFF_TRANSPORT_ALLOWED_EMAIL_DOMAINS
      .length === 0
  ) {
    return !IS_PRODUCTION;
  }

  const domain =
    staffTransportEmailDomain(
      email
    );

  return (
    Boolean(domain) &&
    STAFF_TRANSPORT_ALLOWED_EMAIL_DOMAINS
      .includes(domain)
  );
}


function buildStaffTransportSessionCookie(
  token
) {
  const maxAgeSeconds =
    8 * 60 * 60;

  return [
    `${STAFF_TRANSPORT_SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    ...(IS_PRODUCTION
      ? ['Secure']
      : [])
  ].join('; ');
}


function buildExpiredStaffTransportSessionCookie() {
  return [
    `${STAFF_TRANSPORT_SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    ...(IS_PRODUCTION
      ? ['Secure']
      : [])
  ].join('; ');
}


function getStaffTransportIdentityById(
  identityId
) {
  return db.prepare(`
    SELECT
      id,

      first_name
        AS firstName,

      last_name
        AS lastName,

      email,

      mobile,

      status,

      email_verified_at
        AS emailVerifiedAt,

      mobile_verified_at
        AS mobileVerifiedAt,

      last_login_at
        AS lastLoginAt,

      created_at
        AS createdAt,

      updated_at
        AS updatedAt

    FROM transport_staff_identities
    WHERE id = ?
    LIMIT 1
  `).get(
    Number(identityId)
  );
}


function getStaffTransportIdentityByEmail(
  email
) {
  return db.prepare(`
    SELECT
      id,

      first_name
        AS firstName,

      last_name
        AS lastName,

      email,

      mobile,

      status,

      email_verified_at
        AS emailVerifiedAt,

      mobile_verified_at
        AS mobileVerifiedAt,

      last_login_at
        AS lastLoginAt,

      created_at
        AS createdAt,

      updated_at
        AS updatedAt

    FROM transport_staff_identities
    WHERE email = ?
    COLLATE NOCASE
    LIMIT 1
  `).get(
    normaliseStaffTransportEmail(
      email
    )
  );
}


function resolveStaffTransportProgrammeAccessCode(
  suppliedCode
) {
  const cleanCode =
    normaliseTransportProgrammeAccessCode(
      suppliedCode
    );

  if (!cleanCode) {
    return null;
  }

  const now =
    new Date().toISOString();

  const candidates =
    db.prepare(`
      SELECT DISTINCT
        tp.id,
        tp.code,
        tp.name

      FROM transport_programmes tp

      JOIN transport_programme_windows tpw
        ON tpw.programme_id =
          tp.id

      JOIN transport_programme_access_codes tpac
        ON tpac.programme_id =
          tp.id

      WHERE tp.status = 'open'

        AND tpw.is_active = 1

        AND tpac.is_active = 1

        AND (
          tp.request_opens_at IS NULL
          OR tp.request_opens_at <= ?
        )

        AND (
          tp.request_closes_at IS NULL
          OR tp.request_closes_at >= ?
        )

      ORDER BY tp.id
    `).all(
      now,
      now
    );

  const matches =
    candidates.filter(
      (programme) =>
        validateTransportProgrammeAccessCode(
          programme.id,
          cleanCode
        )
    );

  if (matches.length > 1) {
    const error =
      new Error(
        'This access code is configured for more than one active transport programme'
      );

    error.statusCode = 409;
    throw error;
  }

  return matches[0] || null;
}


function ensureStaffTransportIdentityForEmail(
  email,
  accessCode
) {
  const cleanEmail =
    normaliseStaffTransportEmail(
      email
    );

  if (
    !cleanEmail ||
    !cleanEmail.includes('@')
  ) {
    const error =
      new Error(
        'Enter a valid email address'
      );

    error.statusCode = 400;
    throw error;
  }

  const cleanAccessCode =
    normaliseTransportProgrammeAccessCode(
      accessCode
    );

  let identity =
    getStaffTransportIdentityByEmail(
      cleanEmail
    );

  if (identity) {
    if (
      ['suspended', 'archived']
        .includes(
          identity.status
        )
    ) {
      const error =
        new Error(
          'This staff transport account cannot sign in'
        );

      error.statusCode = 403;
      throw error;
    }

    /*
      Returning staff may sign in without entering the
      campaign code again so they can manage existing
      transport requests.

      Supplying a current campaign code grants access
      to that programme if they do not already have it.
    */
    if (cleanAccessCode) {
      const programme =
        resolveStaffTransportProgrammeAccessCode(
          cleanAccessCode
        );

      if (!programme) {
        const error =
          new Error(
            'The UHP Staff Transport access code is invalid or no longer active'
          );

        error.statusCode = 403;
        throw error;
      }

      grantStaffTransportProgrammeAccess(
        identity.id,
        programme.id,
        'campaign_code'
      );
    }

    return identity;
  }

  /*
    A new email address cannot create a staff identity
    unless it presents a valid current UHP campaign code.
  */
  if (!cleanAccessCode) {
    const error =
      new Error(
        'Enter the UHP Staff Transport access code'
      );

    error.statusCode = 403;
    throw error;
  }

  const programme =
    resolveStaffTransportProgrammeAccessCode(
      cleanAccessCode
    );

  if (!programme) {
    const error =
      new Error(
        'The UHP Staff Transport access code is invalid or no longer active'
      );

    error.statusCode = 403;
    throw error;
  }

  const result =
    db.prepare(`
      INSERT INTO transport_staff_identities (
        email,
        status
      )
      VALUES (
        ?,
        'pending'
      )
    `).run(
      cleanEmail
    );

  identity =
    getStaffTransportIdentityById(
      result.lastInsertRowid
    );

  grantStaffTransportProgrammeAccess(
    identity.id,
    programme.id,
    'campaign_code'
  );

  return identity;
}


function invalidateStaffTransportChallenge(
  challengeId
) {
  db.prepare(`
    UPDATE transport_staff_login_challenges
    SET consumed_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND consumed_at IS NULL
  `).run(
    challengeId
  );
}


function staffTransportSmsGatewayMobile(
  mobile
) {
  const value =
    String(mobile || '').trim();

  if (
    /^\+447\d{9}$/.test(value)
  ) {
    return `0${value.slice(3)}`;
  }

  return value;
}


async function sendStaffTransportEmailOtp(
  identity,
  code
) {
  if (
    !SENDGRID_API_KEY ||
    !SENDGRID_FROM_EMAIL
  ) {
    const error =
      new Error(
        'Staff Transport email delivery is not configured'
      );

    error.statusCode = 503;
    throw error;
  }

  let response;

  try {
    response =
      await fetch(
        'https://api.sendgrid.com/v3/mail/send',
        {
          method: 'POST',

          headers: {
            Authorization:
              `Bearer ${SENDGRID_API_KEY}`,

            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            personalizations: [
              {
                to: [
                  {
                    email:
                      identity.email
                  }
                ]
              }
            ],

            from: {
              email:
                SENDGRID_FROM_EMAIL,

              name:
                SENDGRID_FROM_NAME
            },

            subject:
              'Your UHP Staff Transport verification code',

            content: [
              {
                type: 'text/plain',

                value:
                  `Your UHP Staff Transport verification code is ${code}. It expires in 10 minutes.`
              }
            ]
          })
        }
      );
  } catch (error) {
    console.error(
      'Staff Transport SendGrid request failed:',
      error.message
    );

    const deliveryError =
      new Error(
        'We could not send your verification email. Please try again.'
      );

    deliveryError.statusCode = 503;
    throw deliveryError;
  }

  if (!response.ok) {
    console.error(
      'Staff Transport SendGrid delivery failed:',
      response.status
    );

    const error =
      new Error(
        'We could not send your verification email. Please try again.'
      );

    error.statusCode = 503;
    throw error;
  }
}


async function sendStaffTransportSmsOtp(
  identity,
  code
) {
  if (!STAFF_SMS_GATEWAY_URL) {
    const error =
      new Error(
        'Staff Transport SMS delivery is not configured'
      );

    error.statusCode = 503;
    throw error;
  }

  let response;

  try {
    response =
      await fetch(
        STAFF_SMS_GATEWAY_URL,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            customer_phone:
              staffTransportSmsGatewayMobile(
                identity.mobile
              ),

            message:
              `Your UHP Staff Transport verification code is ${code}. It expires in 10 minutes.`
          })
        }
      );
  } catch (error) {
    console.error(
      'Staff Transport SMS gateway request failed:',
      error.message
    );

    const deliveryError =
      new Error(
        'We could not send your verification text message. Please try again.'
      );

    deliveryError.statusCode = 503;
    throw deliveryError;
  }

  let result = null;

  try {
    result =
      await response.json();
  } catch {
    result = null;
  }

  if (
    !response.ok ||
    !result ||
    result.status !== 'success'
  ) {
    console.error(
      'Staff Transport SMS gateway delivery failed:',
      response.status,
      result?.status || 'invalid_response'
    );

    const error =
      new Error(
        'We could not send your verification text message. Please try again.'
      );

    error.statusCode = 503;
    throw error;
  }
}


async function requestStaffTransportEmailCode(
  email,
  accessCode,
  req
) {
  const identity =
    ensureStaffTransportIdentityForEmail(
      email,
      accessCode
    );

  db.prepare(`
    UPDATE transport_staff_login_challenges
    SET consumed_at = CURRENT_TIMESTAMP
    WHERE staff_identity_id = ?
      AND channel = 'email'
      AND purpose = 'verify_email'
      AND consumed_at IS NULL
  `).run(identity.id);

  const challengeId =
    randomBytes(24).toString('hex');

  const code =
    String(
      randomInt(
        0,
        1000000
      )
    ).padStart(6, '0');

  const salt =
    randomBytes(16).toString('hex');

  const codeHash =
    hashOtp(
      code,
      salt
    );

  db.prepare(`
    INSERT INTO transport_staff_login_challenges (
      id,
      staff_identity_id,
      channel,
      purpose,
      destination,
      code_hash,
      code_salt,
      attempts,
      max_attempts,
      expires_at
    )
    VALUES (
      ?,
      ?,
      'email',
      'verify_email',
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
    identity.id,
    identity.email,
    codeHash,
    salt
  );

  /*
    The plaintext OTP is never returned
    through the HTTP API.

    Development keeps the existing console
    delivery so local testing remains simple.

    Production requires SendGrid delivery.
  */
  if (!IS_PRODUCTION) {
    console.log(
      `[STAFF TRANSPORT DEV] Email OTP for ${identity.email}: ${code} challenge=${challengeId} ip=${getRequestIp(req) || 'unknown'}`
    );
  } else {
    try {
      await sendStaffTransportEmailOtp(
        identity,
        code
      );
    } catch (error) {
      invalidateStaffTransportChallenge(
        challengeId
      );

      throw error;
    }
  }

  return {
    challengeId,
    email:
      identity.email,
    expiresInSeconds: 600
  };
}


function verifyStaffTransportEmailCode(
  challengeId,
  code,
  req
) {
  const cleanChallengeId =
    String(
      challengeId || ''
    ).trim();

  const cleanCode =
    String(code || '')
      .replace(/\D/g, '');

  if (
    !cleanChallengeId ||
    cleanCode.length !== 6
  ) {
    const error =
      new Error(
        'Enter the 6-digit verification code'
      );

    error.statusCode = 400;
    throw error;
  }

  const challenge =
    db.prepare(`
      SELECT
        id,

        staff_identity_id
          AS staffIdentityId,

        destination,

        code_hash
          AS codeHash,

        code_salt
          AS codeSalt,

        attempts,

        max_attempts
          AS maxAttempts,

        expires_at
          AS expiresAt,

        consumed_at
          AS consumedAt

      FROM transport_staff_login_challenges
      WHERE id = ?
        AND channel = 'email'
        AND purpose = 'verify_email'
      LIMIT 1
    `).get(
      cleanChallengeId
    );

  if (
    !challenge ||
    challenge.consumedAt
  ) {
    const error =
      new Error(
        'This verification code is no longer valid'
      );

    error.statusCode = 400;
    throw error;
  }

  const expiryCheck =
    db.prepare(`
      SELECT
        CASE
          WHEN ? > CURRENT_TIMESTAMP
          THEN 1
          ELSE 0
        END AS valid
    `).get(
      challenge.expiresAt
    );

  if (
    !expiryCheck?.valid
  ) {
    db.prepare(`
      UPDATE transport_staff_login_challenges
      SET consumed_at =
        CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      challenge.id
    );

    const error =
      new Error(
        'This verification code has expired'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    challenge.attempts >=
      challenge.maxAttempts
  ) {
    const error =
      new Error(
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
      UPDATE transport_staff_login_challenges
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

    const error =
      new Error(
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

  const identity =
    getStaffTransportIdentityById(
      challenge.staffIdentityId
    );

  if (!identity) {
    const error =
      new Error(
        'Staff transport account not found'
      );

    error.statusCode = 404;
    throw error;
  }

  if (
    ['suspended', 'archived']
      .includes(identity.status)
  ) {
    const error =
      new Error(
        'This staff transport account cannot sign in'
      );

    error.statusCode = 403;
    throw error;
  }

  const rawSessionToken =
    randomBytes(32)
      .toString('hex');

  const sessionHash =
    hashSessionToken(
      rawSessionToken
    );

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE transport_staff_login_challenges
      SET consumed_at =
        CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      challenge.id
    );

    db.prepare(`
      UPDATE transport_staff_identities
      SET
        email_verified_at =
          COALESCE(
            email_verified_at,
            CURRENT_TIMESTAMP
          ),

        updated_at =
          CURRENT_TIMESTAMP

      WHERE id = ?
    `).run(
      identity.id
    );

    db.prepare(`
      INSERT INTO transport_staff_sessions (
        session_hash,
        staff_identity_id,
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
      identity.id,
      getRequestIp(req),
      String(
        req.headers['user-agent'] ||
        ''
      ) || null
    );

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return {
    token:
      rawSessionToken,

    staff:
      getStaffTransportIdentityById(
        identity.id
      )
  };
}


function normaliseStaffTransportMobile(
  value
) {
  const raw =
    String(value || '')
      .trim()
      .replace(/[^\d+]/g, '');

  if (
    /^07\d{9}$/.test(raw)
  ) {
    return `+44${raw.slice(1)}`;
  }

  if (
    /^447\d{9}$/.test(raw)
  ) {
    return `+${raw}`;
  }

  if (
    /^\+447\d{9}$/.test(raw)
  ) {
    return raw;
  }

  return '';
}


function updateStaffTransportProfile(
  staffIdentityId,
  payload
) {
  const identity =
    getStaffTransportIdentityById(
      staffIdentityId
    );

  if (!identity) {
    const error =
      new Error(
        'Staff transport account not found'
      );

    error.statusCode = 404;
    throw error;
  }

  if (
    !identity.emailVerifiedAt
  ) {
    const error =
      new Error(
        'Email verification is required first'
      );

    error.statusCode = 403;
    throw error;
  }

  if (
    ['suspended', 'archived']
      .includes(identity.status)
  ) {
    const error =
      new Error(
        'This staff transport account cannot be updated'
      );

    error.statusCode = 403;
    throw error;
  }

  const firstName =
    String(
      payload.firstName || ''
    ).trim();

  const lastName =
    String(
      payload.lastName || ''
    ).trim();

  const mobile =
    normaliseStaffTransportMobile(
      payload.mobile
    );

  if (!firstName) {
    const error =
      new Error(
        'Enter your first name'
      );

    error.statusCode = 400;
    throw error;
  }

  if (!lastName) {
    const error =
      new Error(
        'Enter your last name'
      );

    error.statusCode = 400;
    throw error;
  }

  if (!mobile) {
    const error =
      new Error(
        'Enter a valid UK mobile number'
      );

    error.statusCode = 400;
    throw error;
  }

  const mobileChanged =
    Boolean(
      identity.mobile &&
      identity.mobile !== mobile
    );

  db.prepare(`
    UPDATE transport_staff_identities
    SET
      first_name = ?,
      last_name = ?,
      mobile = ?,

      mobile_verified_at =
        CASE
          WHEN ? = 1
          THEN NULL
          ELSE mobile_verified_at
        END,

      status =
        CASE
          WHEN ? = 1
          THEN 'pending'
          ELSE status
        END,

      updated_at =
        CURRENT_TIMESTAMP

    WHERE id = ?
  `).run(
    firstName,
    lastName,
    mobile,
    mobileChanged ? 1 : 0,
    mobileChanged ? 1 : 0,
    identity.id
  );

  return getStaffTransportIdentityById(
    identity.id
  );
}


async function requestStaffTransportSmsCode(
  staffIdentityId,
  req
) {
  const identity =
    getStaffTransportIdentityById(
      staffIdentityId
    );

  if (!identity) {
    const error =
      new Error(
        'Staff transport account not found'
      );

    error.statusCode = 404;
    throw error;
  }

  if (
    !identity.emailVerifiedAt
  ) {
    const error =
      new Error(
        'Email verification is required first'
      );

    error.statusCode = 403;
    throw error;
  }

  if (
    !identity.firstName ||
    !identity.lastName ||
    !identity.mobile
  ) {
    const error =
      new Error(
        'Complete your name and mobile number first'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    ['suspended', 'archived']
      .includes(identity.status)
  ) {
    const error =
      new Error(
        'This staff transport account cannot sign in'
      );

    error.statusCode = 403;
    throw error;
  }

  const recent =
    db.prepare(`
      SELECT
        id,
        created_at AS createdAt

      FROM transport_staff_login_challenges
      WHERE staff_identity_id = ?
        AND channel = 'sms'
        AND purpose = 'verify_mobile'
        AND consumed_at IS NULL
        AND created_at >
          datetime(
            'now',
            '-60 seconds'
          )
      ORDER BY created_at DESC
      LIMIT 1
    `).get(
      identity.id
    );

  if (recent) {
    const error =
      new Error(
        'Please wait before requesting another verification code'
      );

    error.statusCode = 429;
    throw error;
  }

  db.prepare(`
    UPDATE transport_staff_login_challenges
    SET consumed_at =
      CURRENT_TIMESTAMP
    WHERE staff_identity_id = ?
      AND channel = 'sms'
      AND purpose = 'verify_mobile'
      AND consumed_at IS NULL
  `).run(
    identity.id
  );

  const challengeId =
    randomBytes(24)
      .toString('hex');

  const code =
    String(
      randomInt(
        0,
        1000000
      )
    ).padStart(6, '0');

  const salt =
    randomBytes(16)
      .toString('hex');

  const codeHash =
    hashOtp(
      code,
      salt
    );

  db.prepare(`
    INSERT INTO transport_staff_login_challenges (
      id,
      staff_identity_id,
      channel,
      purpose,
      destination,
      code_hash,
      code_salt,
      attempts,
      max_attempts,
      expires_at
    )
    VALUES (
      ?,
      ?,
      'sms',
      'verify_mobile',
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
    identity.id,
    identity.mobile,
    codeHash,
    salt
  );

  /*
    Development keeps the existing console
    delivery.

    Production requires successful delivery
    through the configured SMS gateway.
  */
  if (!IS_PRODUCTION) {
    console.log(
      `[STAFF TRANSPORT DEV] SMS OTP for ${identity.mobile}: ${code} challenge=${challengeId} ip=${getRequestIp(req) || 'unknown'}`
    );
  } else {
    try {
      await sendStaffTransportSmsOtp(
        identity,
        code
      );
    } catch (error) {
      invalidateStaffTransportChallenge(
        challengeId
      );

      throw error;
    }
  }

  return {
    challengeId,
    mobile:
      identity.mobile,
    expiresInSeconds: 600
  };
}


function verifyStaffTransportSmsCode(
  staffIdentityId,
  challengeId,
  code
) {
  const cleanChallengeId =
    String(
      challengeId || ''
    ).trim();

  const cleanCode =
    String(code || '')
      .replace(/\D/g, '');

  if (
    !cleanChallengeId ||
    cleanCode.length !== 6
  ) {
    const error =
      new Error(
        'Enter the 6-digit verification code'
      );

    error.statusCode = 400;
    throw error;
  }

  const identity =
    getStaffTransportIdentityById(
      staffIdentityId
    );

  if (!identity) {
    const error =
      new Error(
        'Staff transport account not found'
      );

    error.statusCode = 404;
    throw error;
  }

  if (
    !identity.emailVerifiedAt ||
    !identity.firstName ||
    !identity.lastName ||
    !identity.mobile
  ) {
    const error =
      new Error(
        'Complete email verification and your contact details first'
      );

    error.statusCode = 403;
    throw error;
  }

  const challenge =
    db.prepare(`
      SELECT
        id,

        staff_identity_id
          AS staffIdentityId,

        destination,

        code_hash
          AS codeHash,

        code_salt
          AS codeSalt,

        attempts,

        max_attempts
          AS maxAttempts,

        expires_at
          AS expiresAt,

        consumed_at
          AS consumedAt

      FROM transport_staff_login_challenges
      WHERE id = ?
        AND staff_identity_id = ?
        AND channel = 'sms'
        AND purpose = 'verify_mobile'
      LIMIT 1
    `).get(
      cleanChallengeId,
      identity.id
    );

  if (
    !challenge ||
    challenge.consumedAt
  ) {
    const error =
      new Error(
        'This verification code is no longer valid'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    challenge.destination !==
      identity.mobile
  ) {
    const error =
      new Error(
        'This verification code is no longer valid'
      );

    error.statusCode = 400;
    throw error;
  }

  const expiryCheck =
    db.prepare(`
      SELECT
        CASE
          WHEN ? > CURRENT_TIMESTAMP
          THEN 1
          ELSE 0
        END AS valid
    `).get(
      challenge.expiresAt
    );

  if (
    !expiryCheck?.valid
  ) {
    db.prepare(`
      UPDATE transport_staff_login_challenges
      SET consumed_at =
        CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      challenge.id
    );

    const error =
      new Error(
        'This verification code has expired'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    challenge.attempts >=
      challenge.maxAttempts
  ) {
    const error =
      new Error(
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
      UPDATE transport_staff_login_challenges
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

    const error =
      new Error(
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

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE transport_staff_login_challenges
      SET consumed_at =
        CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      challenge.id
    );

    db.prepare(`
      UPDATE transport_staff_identities
      SET
        mobile_verified_at =
          CURRENT_TIMESTAMP,

        status =
          CASE
            WHEN
              email_verified_at
                IS NOT NULL
              AND first_name
                IS NOT NULL
              AND trim(first_name) <> ''
              AND last_name
                IS NOT NULL
              AND trim(last_name) <> ''
              AND mobile
                IS NOT NULL
              AND trim(mobile) <> ''
            THEN 'active'
            ELSE 'pending'
          END,

        last_login_at =
          CURRENT_TIMESTAMP,

        updated_at =
          CURRENT_TIMESTAMP

      WHERE id = ?
    `).run(
      identity.id
    );

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return getStaffTransportIdentityById(
    identity.id
  );
}


function requireActiveStaffTransportAuth(
  req
) {
  const auth =
    requireStaffTransportAuth(
      req
    );

  const staff =
    auth.staff;

  if (
    staff.status !== 'active' ||
    !staff.emailVerifiedAt ||
    !staff.mobileVerifiedAt
  ) {
    const error =
      new Error(
        'Complete staff transport verification first'
      );

    error.statusCode = 403;
    throw error;
  }

  return auth;
}


function getStaffTransportAuthSession(
  req
) {
  const cookies =
    parseCookies(req);

  const token =
    cookies[
      STAFF_TRANSPORT_SESSION_COOKIE
    ];

  if (!token) {
    return null;
  }

  const sessionHash =
    hashSessionToken(token);

  const session =
    db.prepare(`
      SELECT
        id,

        staff_identity_id
          AS staffIdentityId,

        expires_at
          AS expiresAt

      FROM transport_staff_sessions
      WHERE session_hash = ?
        AND revoked_at IS NULL
        AND expires_at >
          CURRENT_TIMESTAMP
      LIMIT 1
    `).get(
      sessionHash
    );

  if (!session) {
    return null;
  }

  const staff =
    getStaffTransportIdentityById(
      session.staffIdentityId
    );

  if (
    !staff ||
    ['suspended', 'archived']
      .includes(staff.status)
  ) {
    return null;
  }

  db.prepare(`
    UPDATE transport_staff_sessions
    SET last_seen_at =
      CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    session.id
  );

  return {
    sessionId:
      session.id,
    staff
  };
}


function requireStaffTransportAuth(
  req
) {
  const auth =
    getStaffTransportAuthSession(
      req
    );

  if (!auth) {
    const error =
      new Error(
        'Staff transport authentication required'
      );

    error.statusCode = 401;
    throw error;
  }

  return auth;
}


function logoutStaffTransportSession(
  req
) {
  const cookies =
    parseCookies(req);

  const token =
    cookies[
      STAFF_TRANSPORT_SESSION_COOKIE
    ];

  if (!token) {
    return;
  }

  const sessionHash =
    hashSessionToken(token);

  db.prepare(`
    UPDATE transport_staff_sessions
    SET revoked_at =
      CURRENT_TIMESTAMP
    WHERE session_hash = ?
  `).run(
    sessionHash
  );
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
  actorUserId = null,
  actorStaffIdentityId = null
}) {
  db.prepare(`
    INSERT INTO audit_log
      (
        actor_user_id,
        actor_staff_identity_id,
        action,
        entity_type,
        entity_id,
        field_name,
        old_value,
        new_value,
        source
      )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    actorUserId,
    actorStaffIdentityId,
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




function normaliseOptionalDateTime(
  value,
  fieldName
) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  ) {
    return null;
  }

  const normalised =
    String(value).trim();

  const parsed =
    new Date(normalised);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    const error =
      new Error(
        `${fieldName} is not a valid date and time`
      );

    error.statusCode = 400;
    throw error;
  }

  return normalised;
}


function normaliseTransportProgrammeAccessCode(
  value
) {
  return String(
    value || ''
  )
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}


function hashTransportProgrammeAccessCode(
  code,
  salt
) {
  return hashOtp(
    normaliseTransportProgrammeAccessCode(
      code
    ),
    salt
  );
}


function getTransportProgrammeAccessCode(
  programmeId
) {
  return db.prepare(`
    SELECT
      id,
      programme_id AS programmeId,
      valid_from AS validFrom,
      expires_at AS expiresAt,
      is_active AS isActive,
      created_by_user_id AS createdByUserId,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM transport_programme_access_codes
    WHERE programme_id = ?
    LIMIT 1
  `).get(
    Number(programmeId)
  ) || null;
}


function getTransportProgrammeAccessCodeSecret(
  programmeId
) {
  return db.prepare(`
    SELECT
      id,
      programme_id AS programmeId,
      code_hash AS codeHash,
      code_salt AS codeSalt,
      valid_from AS validFrom,
      expires_at AS expiresAt,
      is_active AS isActive,
      created_by_user_id AS createdByUserId,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM transport_programme_access_codes
    WHERE programme_id = ?
    LIMIT 1
  `).get(
    Number(programmeId)
  ) || null;
}


function configureTransportProgrammeAccessCode(
  programmeId,
  payload,
  actorUserId
) {
  const programme =
    getTransportProgrammeById(
      programmeId
    );

  if (!programme) {
    const error =
      new Error(
        'Transport programme not found'
      );

    error.statusCode = 404;
    throw error;
  }

  const code =
    normaliseTransportProgrammeAccessCode(
      payload.code
    );

  if (code.length < 6) {
    const error =
      new Error(
        'Access code must contain at least 6 characters'
      );

    error.statusCode = 400;
    throw error;
  }

  if (code.length > 64) {
    const error =
      new Error(
        'Access code is too long'
      );

    error.statusCode = 400;
    throw error;
  }

  const validFrom =
    normaliseOptionalDateTime(
      payload.validFrom,
      'Access code valid-from time'
    );

  const expiresAt =
    normaliseOptionalDateTime(
      payload.expiresAt,
      'Access code expiry time'
    );

  if (
    validFrom &&
    expiresAt &&
    new Date(expiresAt) <=
      new Date(validFrom)
  ) {
    const error =
      new Error(
        'Access code expiry must be after its valid-from time'
      );

    error.statusCode = 400;
    throw error;
  }

  const isActive =
    payload.isActive === undefined
      ? 1
      : payload.isActive
        ? 1
        : 0;

  const existing =
    getTransportProgrammeAccessCode(
      programmeId
    );

  const salt =
    randomBytes(16)
      .toString('hex');

  const codeHash =
    hashTransportProgrammeAccessCode(
      code,
      salt
    );

  db.exec('BEGIN');

  try {
    db.prepare(`
      INSERT INTO transport_programme_access_codes (
        programme_id,
        code_hash,
        code_salt,
        valid_from,
        expires_at,
        is_active,
        created_by_user_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)

      ON CONFLICT(programme_id)
      DO UPDATE SET
        code_hash =
          excluded.code_hash,

        code_salt =
          excluded.code_salt,

        valid_from =
          excluded.valid_from,

        expires_at =
          excluded.expires_at,

        is_active =
          excluded.is_active,

        updated_at =
          CURRENT_TIMESTAMP
    `).run(
      Number(programmeId),
      codeHash,
      salt,
      validFrom,
      expiresAt,
      isActive,
      actorUserId
    );

    const configured =
      getTransportProgrammeAccessCode(
        programmeId
      );

    writeAudit({
      action:
        existing
          ? 'UPDATE'
          : 'CREATE',

      entityType:
        'transport_programme_access_code',

      entityId:
        configured.id,

      oldValue:
        existing
          ? JSON.stringify(
              existing
            )
          : null,

      newValue:
        JSON.stringify(
          configured
        ),

      source:
        'nac_admin',

      actorUserId
    });

    db.exec('COMMIT');

    return configured;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function setTransportProgrammeAccessCodeActive(
  programmeId,
  isActive,
  actorUserId
) {
  const programme =
    getTransportProgrammeById(
      programmeId
    );

  if (!programme) {
    const error =
      new Error(
        'Transport programme not found'
      );

    error.statusCode = 404;
    throw error;
  }

  const existing =
    getTransportProgrammeAccessCode(
      programmeId
    );

  if (!existing) {
    const error =
      new Error(
        'Campaign access code is not configured'
      );

    error.statusCode = 404;
    throw error;
  }

  const nextActive =
    isActive ? 1 : 0;

  if (
    Number(existing.isActive) ===
    nextActive
  ) {
    return existing;
  }

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE transport_programme_access_codes
      SET
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE programme_id = ?
    `).run(
      nextActive,
      Number(programmeId)
    );

    const updated =
      getTransportProgrammeAccessCode(
        programmeId
      );

    writeAudit({
      action: 'UPDATE',
      entityType:
        'transport_programme_access_code',
      entityId:
        existing.id,
      oldValue:
        JSON.stringify(existing),
      newValue:
        JSON.stringify(updated),
      source:
        'nac_admin',
      actorUserId
    });

    db.exec('COMMIT');

    return updated;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}



function validateTransportProgrammeAccessCode(
  programmeId,
  suppliedCode
) {
  const configured =
    getTransportProgrammeAccessCodeSecret(
      programmeId
    );

  if (
    !configured ||
    Number(
      configured.isActive
    ) !== 1
  ) {
    return false;
  }

  const cleanCode =
    normaliseTransportProgrammeAccessCode(
      suppliedCode
    );

  if (!cleanCode) {
    return false;
  }

  const timing =
    db.prepare(`
      SELECT
        CASE
          WHEN
            (? IS NULL OR ? <= CURRENT_TIMESTAMP)
            AND
            (? IS NULL OR ? > CURRENT_TIMESTAMP)
          THEN 1
          ELSE 0
        END AS valid
    `).get(
      configured.validFrom,
      configured.validFrom,
      configured.expiresAt,
      configured.expiresAt
    );

  if (!timing?.valid) {
    return false;
  }

  const suppliedHash =
    hashTransportProgrammeAccessCode(
      cleanCode,
      configured.codeSalt
    );

  return safeHashEqual(
    configured.codeHash,
    suppliedHash
  );
}


function getStaffTransportProgrammeAccess(
  staffIdentityId,
  programmeId
) {
  return db.prepare(`
    SELECT
      id,

      staff_identity_id
        AS staffIdentityId,

      programme_id
        AS programmeId,

      grant_source
        AS grantSource,

      granted_at
        AS grantedAt,

      created_at
        AS createdAt

    FROM transport_staff_programme_access

    WHERE staff_identity_id = ?
      AND programme_id = ?

    LIMIT 1
  `).get(
    Number(staffIdentityId),
    Number(programmeId)
  ) || null;
}


function hasStaffTransportProgrammeAccess(
  staffIdentityId,
  programmeId
) {
  if (
    !Number.isInteger(
      Number(staffIdentityId)
    ) ||
    Number(staffIdentityId) < 1 ||
    !Number.isInteger(
      Number(programmeId)
    ) ||
    Number(programmeId) < 1
  ) {
    return false;
  }

  return Boolean(
    getStaffTransportProgrammeAccess(
      staffIdentityId,
      programmeId
    )
  );
}


function grantStaffTransportProgrammeAccess(
  staffIdentityId,
  programmeId,
  grantSource = 'campaign_code'
) {
  const cleanStaffIdentityId =
    Number(staffIdentityId);

  const cleanProgrammeId =
    Number(programmeId);

  const cleanGrantSource =
    String(
      grantSource ||
        'campaign_code'
    ).trim();

  const allowedGrantSources = [
    'campaign_code',
    'admin',
    'migration'
  ];

  if (
    !Number.isInteger(
      cleanStaffIdentityId
    ) ||
    cleanStaffIdentityId < 1
  ) {
    const error =
      new Error(
        'Valid staff identity is required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    !Number.isInteger(
      cleanProgrammeId
    ) ||
    cleanProgrammeId < 1
  ) {
    const error =
      new Error(
        'Valid transport programme is required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    !allowedGrantSources.includes(
      cleanGrantSource
    )
  ) {
    const error =
      new Error(
        'Invalid staff programme access source'
      );

    error.statusCode = 400;
    throw error;
  }

  const staff =
    getStaffTransportIdentityById(
      cleanStaffIdentityId
    );

  if (!staff) {
    const error =
      new Error(
        'Staff transport identity not found'
      );

    error.statusCode = 404;
    throw error;
  }

  const programme =
    getTransportProgrammeById(
      cleanProgrammeId
    );

  if (!programme) {
    const error =
      new Error(
        'Transport programme not found'
      );

    error.statusCode = 404;
    throw error;
  }

  const existing =
    getStaffTransportProgrammeAccess(
      cleanStaffIdentityId,
      cleanProgrammeId
    );

  if (existing) {
    return existing;
  }

  db.exec('BEGIN');

  try {
    const result =
      db.prepare(`
        INSERT INTO transport_staff_programme_access (
          staff_identity_id,
          programme_id,
          grant_source
        )
        VALUES (?, ?, ?)
      `).run(
        cleanStaffIdentityId,
        cleanProgrammeId,
        cleanGrantSource
      );

    const granted =
      getStaffTransportProgrammeAccess(
        cleanStaffIdentityId,
        cleanProgrammeId
      );

    writeAudit({
      action:
        'CREATE',

      entityType:
        'transport_staff_programme_access',

      entityId:
        Number(
          result.lastInsertRowid
        ),

      newValue:
        JSON.stringify(
          granted
        ),

      source:
        'staff_self_service',

      actorUserId:
        null,

      actorStaffIdentityId:
        cleanStaffIdentityId
    });

    db.exec('COMMIT');

    return granted;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function getTransportProgrammeById(
  programmeId
) {
  return db.prepare(`
    SELECT
      id,
      code,
      name,
      programme_type AS programmeType,
      status,
      request_opens_at AS requestOpensAt,
      request_closes_at AS requestClosesAt,
      confirmation_due_at AS confirmationDueAt,
      route_lock_at AS routeLockAt,
      autocab_account_type AS autocabAccountType,
      public_notes AS publicNotes,
      internal_notes AS internalNotes,
      created_by_user_id AS createdByUserId,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM transport_programmes
    WHERE id = ?
  `).get(
    programmeId
  );
}


function listTransportProgrammes() {
  return db.prepare(`
    SELECT
      id,
      code,
      name,
      programme_type AS programmeType,
      status,
      request_opens_at AS requestOpensAt,
      request_closes_at AS requestClosesAt,
      confirmation_due_at AS confirmationDueAt,
      route_lock_at AS routeLockAt,
      autocab_account_type AS autocabAccountType,
      public_notes AS publicNotes,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM transport_programmes
    ORDER BY
      COALESCE(
        request_opens_at,
        created_at
      ) DESC,
      id DESC
  `).all();
}


function createTransportProgramme(
  payload,
  actorUserId
) {
  const code =
    String(
      payload.code || ''
    )
      .trim()
      .toUpperCase();

  const name =
    String(
      payload.name || ''
    ).trim();

  const programmeType =
    String(
      payload.programmeType ||
        'special_transport'
    ).trim();

  const status =
    String(
      payload.status || 'draft'
    ).trim();

  const allowedStatuses = [
    'draft',
    'open',
    'planning',
    'confirmation',
    'locked',
    'active',
    'completed',
    'cancelled'
  ];

  if (!code || !name) {
    const error =
      new Error(
        'Programme code and name are required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    !allowedStatuses.includes(
      status
    )
  ) {
    const error =
      new Error(
        'Invalid programme status'
      );

    error.statusCode = 400;
    throw error;
  }

  const requestOpensAt =
    normaliseOptionalDateTime(
      payload.requestOpensAt,
      'Request opening time'
    );

  const requestClosesAt =
    normaliseOptionalDateTime(
      payload.requestClosesAt,
      'Request closing time'
    );

  const confirmationDueAt =
    normaliseOptionalDateTime(
      payload.confirmationDueAt,
      'Confirmation deadline'
    );

  const routeLockAt =
    normaliseOptionalDateTime(
      payload.routeLockAt,
      'Route lock time'
    );

  if (
    requestOpensAt &&
    requestClosesAt &&
    new Date(requestClosesAt) <=
      new Date(requestOpensAt)
  ) {
    const error =
      new Error(
        'Request closing time must be after the opening time'
      );

    error.statusCode = 400;
    throw error;
  }

  const autocabAccountType =
    String(
      payload.autocabAccountType ||
        'xmas_staff'
    ).trim();

  const publicNotes =
    String(
      payload.publicNotes || ''
    ).trim() || null;

  const internalNotes =
    String(
      payload.internalNotes || ''
    ).trim() || null;

  const duplicate =
    db.prepare(`
      SELECT id
      FROM transport_programmes
      WHERE code = ?
    `).get(
      code
    );

  if (duplicate) {
    const error =
      new Error(
        'A transport programme with this code already exists'
      );

    error.statusCode = 409;
    throw error;
  }

  db.exec('BEGIN');

  try {
    const result =
      db.prepare(`
        INSERT INTO transport_programmes
        (
          code,
          name,
          programme_type,
          status,
          request_opens_at,
          request_closes_at,
          confirmation_due_at,
          route_lock_at,
          autocab_account_type,
          public_notes,
          internal_notes,
          created_by_user_id
        )
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `).run(
        code,
        name,
        programmeType,
        status,
        requestOpensAt,
        requestClosesAt,
        confirmationDueAt,
        routeLockAt,
        autocabAccountType,
        publicNotes,
        internalNotes,
        actorUserId
      );

    const programmeId =
      Number(
        result.lastInsertRowid
      );

    const programme =
      getTransportProgrammeById(
        programmeId
      );

    writeAudit({
      action: 'CREATE',
      entityType:
        'transport_programme',
      entityId:
        programmeId,
      newValue:
        JSON.stringify(
          programme
        ),
      source:
        'nac_admin',
      actorUserId
    });

    db.exec('COMMIT');

    return programme;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function updateTransportProgramme(
  programmeId,
  payload,
  actorUserId
) {
  const existing =
    getTransportProgrammeById(
      programmeId
    );

  if (!existing) {
    const error =
      new Error(
        'Transport programme not found'
      );

    error.statusCode = 404;
    throw error;
  }

  const name =
    payload.name === undefined
      ? existing.name
      : String(
          payload.name || ''
        ).trim();

  if (!name) {
    const error =
      new Error(
        'Programme name is required'
      );

    error.statusCode = 400;
    throw error;
  }

  const allowedStatuses = [
    'draft',
    'open',
    'planning',
    'confirmation',
    'locked',
    'active',
    'completed',
    'cancelled'
  ];

  const status =
    payload.status === undefined
      ? existing.status
      : String(
          payload.status
        ).trim();

  if (
    !allowedStatuses.includes(
      status
    )
  ) {
    const error =
      new Error(
        'Invalid programme status'
      );

    error.statusCode = 400;
    throw error;
  }

  const requestOpensAt =
    payload.requestOpensAt === undefined
      ? existing.requestOpensAt
      : normaliseOptionalDateTime(
          payload.requestOpensAt,
          'Request opening time'
        );

  const requestClosesAt =
    payload.requestClosesAt === undefined
      ? existing.requestClosesAt
      : normaliseOptionalDateTime(
          payload.requestClosesAt,
          'Request closing time'
        );

  const confirmationDueAt =
    payload.confirmationDueAt === undefined
      ? existing.confirmationDueAt
      : normaliseOptionalDateTime(
          payload.confirmationDueAt,
          'Confirmation deadline'
        );

  const routeLockAt =
    payload.routeLockAt === undefined
      ? existing.routeLockAt
      : normaliseOptionalDateTime(
          payload.routeLockAt,
          'Route lock time'
        );

  if (
    requestOpensAt &&
    requestClosesAt &&
    new Date(requestClosesAt) <=
      new Date(requestOpensAt)
  ) {
    const error =
      new Error(
        'Request closing time must be after the opening time'
      );

    error.statusCode = 400;
    throw error;
  }

  const programmeType =
    payload.programmeType === undefined
      ? existing.programmeType
      : String(
          payload.programmeType ||
            ''
        ).trim();

  const autocabAccountType =
    payload.autocabAccountType === undefined
      ? existing.autocabAccountType
      : String(
          payload.autocabAccountType ||
            ''
        ).trim();

  const publicNotes =
    payload.publicNotes === undefined
      ? existing.publicNotes
      : String(
          payload.publicNotes || ''
        ).trim() || null;

  const internalNotes =
    payload.internalNotes === undefined
      ? existing.internalNotes
      : String(
          payload.internalNotes || ''
        ).trim() || null;

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE transport_programmes
      SET
        name = ?,
        programme_type = ?,
        status = ?,
        request_opens_at = ?,
        request_closes_at = ?,
        confirmation_due_at = ?,
        route_lock_at = ?,
        autocab_account_type = ?,
        public_notes = ?,
        internal_notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name,
      programmeType,
      status,
      requestOpensAt,
      requestClosesAt,
      confirmationDueAt,
      routeLockAt,
      autocabAccountType,
      publicNotes,
      internalNotes,
      programmeId
    );

    const updated =
      getTransportProgrammeById(
        programmeId
      );

    writeAudit({
      action: 'UPDATE',
      entityType:
        'transport_programme',
      entityId:
        programmeId,
      oldValue:
        JSON.stringify(
          existing
        ),
      newValue:
        JSON.stringify(
          updated
        ),
      source:
        'nac_admin',
      actorUserId
    });

    db.exec('COMMIT');

    return updated;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}



function getTransportProgrammeWindowById(
  windowId
) {
  return db.prepare(`
    SELECT
      id,
      programme_id AS programmeId,
      name,
      starts_at AS startsAt,
      ends_at AS endsAt,
      display_order AS displayOrder,
      is_active AS isActive,
      public_notes AS publicNotes,
      internal_notes AS internalNotes,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM transport_programme_windows
    WHERE id = ?
  `).get(
    windowId
  );
}


function listTransportProgrammeWindows(
  programmeId
) {
  return db.prepare(`
    SELECT
      id,
      programme_id AS programmeId,
      name,
      starts_at AS startsAt,
      ends_at AS endsAt,
      display_order AS displayOrder,
      is_active AS isActive,
      public_notes AS publicNotes,
      internal_notes AS internalNotes,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM transport_programme_windows
    WHERE programme_id = ?
    ORDER BY
      display_order,
      starts_at,
      id
  `).all(
    programmeId
  );
}


function createTransportProgrammeWindow(
  programmeId,
  payload,
  actorUserId
) {
  const programme =
    getTransportProgrammeById(
      programmeId
    );

  if (!programme) {
    const error =
      new Error(
        'Transport programme not found'
      );

    error.statusCode = 404;
    throw error;
  }

  const name =
    String(
      payload.name || ''
    ).trim();

  if (!name) {
    const error =
      new Error(
        'Service window name is required'
      );

    error.statusCode = 400;
    throw error;
  }

  const startsAt =
    normaliseOptionalDateTime(
      payload.startsAt,
      'Service window start'
    );

  const endsAt =
    normaliseOptionalDateTime(
      payload.endsAt,
      'Service window end'
    );

  if (!startsAt || !endsAt) {
    const error =
      new Error(
        'Service window start and end are required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    new Date(endsAt) <=
      new Date(startsAt)
  ) {
    const error =
      new Error(
        'Service window end must be after the start'
      );

    error.statusCode = 400;
    throw error;
  }

  const displayOrder =
    Number.isInteger(
      Number(payload.displayOrder)
    )
      ? Number(payload.displayOrder)
      : 0;

  const isActive =
    payload.isActive === undefined
      ? 1
      : payload.isActive
        ? 1
        : 0;

  const publicNotes =
    String(
      payload.publicNotes || ''
    ).trim() || null;

  const internalNotes =
    String(
      payload.internalNotes || ''
    ).trim() || null;

  db.exec('BEGIN');

  try {
    const result =
      db.prepare(`
        INSERT INTO transport_programme_windows
        (
          programme_id,
          name,
          starts_at,
          ends_at,
          display_order,
          is_active,
          public_notes,
          internal_notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        programmeId,
        name,
        startsAt,
        endsAt,
        displayOrder,
        isActive,
        publicNotes,
        internalNotes
      );

    const windowId =
      Number(
        result.lastInsertRowid
      );

    const window =
      getTransportProgrammeWindowById(
        windowId
      );

    writeAudit({
      action: 'CREATE',
      entityType:
        'transport_programme_window',
      entityId:
        windowId,
      newValue:
        JSON.stringify(
          window
        ),
      source:
        'nac_admin',
      actorUserId
    });

    db.exec('COMMIT');

    return window;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function updateTransportProgrammeWindow(
  windowId,
  payload,
  actorUserId
) {
  const existing =
    getTransportProgrammeWindowById(
      windowId
    );

  if (!existing) {
    const error =
      new Error(
        'Service window not found'
      );

    error.statusCode = 404;
    throw error;
  }

  const name =
    payload.name === undefined
      ? existing.name
      : String(
          payload.name || ''
        ).trim();

  if (!name) {
    const error =
      new Error(
        'Service window name is required'
      );

    error.statusCode = 400;
    throw error;
  }

  const startsAt =
    payload.startsAt === undefined
      ? existing.startsAt
      : normaliseOptionalDateTime(
          payload.startsAt,
          'Service window start'
        );

  const endsAt =
    payload.endsAt === undefined
      ? existing.endsAt
      : normaliseOptionalDateTime(
          payload.endsAt,
          'Service window end'
        );

  if (!startsAt || !endsAt) {
    const error =
      new Error(
        'Service window start and end are required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    new Date(endsAt) <=
      new Date(startsAt)
  ) {
    const error =
      new Error(
        'Service window end must be after the start'
      );

    error.statusCode = 400;
    throw error;
  }

  const displayOrder =
    payload.displayOrder === undefined
      ? existing.displayOrder
      : Number(payload.displayOrder);

  if (
    !Number.isInteger(
      displayOrder
    )
  ) {
    const error =
      new Error(
        'Display order must be an integer'
      );

    error.statusCode = 400;
    throw error;
  }

  const isActive =
    payload.isActive === undefined
      ? Number(existing.isActive)
      : payload.isActive
        ? 1
        : 0;

  const publicNotes =
    payload.publicNotes === undefined
      ? existing.publicNotes
      : String(
          payload.publicNotes || ''
        ).trim() || null;

  const internalNotes =
    payload.internalNotes === undefined
      ? existing.internalNotes
      : String(
          payload.internalNotes || ''
        ).trim() || null;

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE transport_programme_windows
      SET
        name = ?,
        starts_at = ?,
        ends_at = ?,
        display_order = ?,
        is_active = ?,
        public_notes = ?,
        internal_notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name,
      startsAt,
      endsAt,
      displayOrder,
      isActive,
      publicNotes,
      internalNotes,
      windowId
    );

    const updated =
      getTransportProgrammeWindowById(
        windowId
      );

    writeAudit({
      action: 'UPDATE',
      entityType:
        'transport_programme_window',
      entityId:
        windowId,
      oldValue:
        JSON.stringify(
          existing
        ),
      newValue:
        JSON.stringify(
          updated
        ),
      source:
        'nac_admin',
      actorUserId
    });

    db.exec('COMMIT');

    return updated;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}



function getTransportProgrammeCapacityById(
  capacityId
) {
  return db.prepare(`
    SELECT
      id,
      programme_window_id AS programmeWindowId,
      vehicle_type AS vehicleType,
      seat_capacity AS seatCapacity,
      quantity,
      is_unlimited AS isUnlimited,
      display_order AS displayOrder,
      notes,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM transport_programme_vehicle_capacity
    WHERE id = ?
  `).get(
    capacityId
  );
}


function listTransportProgrammeCapacity(
  windowId
) {
  return db.prepare(`
    SELECT
      id,
      programme_window_id AS programmeWindowId,
      vehicle_type AS vehicleType,
      seat_capacity AS seatCapacity,
      quantity,
      is_unlimited AS isUnlimited,
      display_order AS displayOrder,
      notes,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM transport_programme_vehicle_capacity
    WHERE programme_window_id = ?
    ORDER BY
      display_order,
      seat_capacity,
      id
  `).all(
    windowId
  );
}


function parseCapacityPositiveInteger(
  value,
  fieldName
) {
  const number =
    Number(value);

  if (
    !Number.isInteger(number) ||
    number < 1
  ) {
    const error =
      new Error(
        `${fieldName} must be a positive integer`
      );

    error.statusCode = 400;
    throw error;
  }

  return number;
}


function parseCapacityNonNegativeInteger(
  value,
  fieldName
) {
  const number =
    Number(value);

  if (
    !Number.isInteger(number) ||
    number < 0
  ) {
    const error =
      new Error(
        `${fieldName} must be zero or a positive integer`
      );

    error.statusCode = 400;
    throw error;
  }

  return number;
}


function createTransportProgrammeCapacity(
  windowId,
  payload,
  actorUserId
) {
  const window =
    getTransportProgrammeWindowById(
      windowId
    );

  if (!window) {
    const error =
      new Error(
        'Service window not found'
      );

    error.statusCode = 404;
    throw error;
  }

  const vehicleType =
    String(
      payload.vehicleType || ''
    ).trim();

  if (!vehicleType) {
    const error =
      new Error(
        'Vehicle type is required'
      );

    error.statusCode = 400;
    throw error;
  }

  const seatCapacity =
    parseCapacityPositiveInteger(
      payload.seatCapacity,
      'Seat capacity'
    );

  const isUnlimited =
    payload.isUnlimited
      ? 1
      : 0;

  let quantity = null;

  if (!isUnlimited) {
    if (
      payload.quantity === undefined ||
      payload.quantity === null ||
      String(payload.quantity).trim() === ''
    ) {
      const error =
        new Error(
          'Quantity is required when capacity is not unlimited'
        );

      error.statusCode = 400;
      throw error;
    }

    quantity =
      parseCapacityNonNegativeInteger(
        payload.quantity,
        'Quantity'
      );
  }

  const displayOrder =
    payload.displayOrder === undefined
      ? 0
      : Number(
          payload.displayOrder
        );

  if (
    !Number.isInteger(
      displayOrder
    )
  ) {
    const error =
      new Error(
        'Display order must be an integer'
      );

    error.statusCode = 400;
    throw error;
  }

  const notes =
    String(
      payload.notes || ''
    ).trim() || null;

  const duplicate =
    db.prepare(`
      SELECT id
      FROM transport_programme_vehicle_capacity
      WHERE programme_window_id = ?
        AND vehicle_type = ?
    `).get(
      windowId,
      vehicleType
    );

  if (duplicate) {
    const error =
      new Error(
        'This vehicle type is already configured for the service window'
      );

    error.statusCode = 409;
    throw error;
  }

  db.exec('BEGIN');

  try {
    const result =
      db.prepare(`
        INSERT INTO transport_programme_vehicle_capacity
        (
          programme_window_id,
          vehicle_type,
          seat_capacity,
          quantity,
          is_unlimited,
          display_order,
          notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        windowId,
        vehicleType,
        seatCapacity,
        quantity,
        isUnlimited,
        displayOrder,
        notes
      );

    const capacityId =
      Number(
        result.lastInsertRowid
      );

    const capacity =
      getTransportProgrammeCapacityById(
        capacityId
      );

    writeAudit({
      action: 'CREATE',
      entityType:
        'transport_programme_capacity',
      entityId:
        capacityId,
      newValue:
        JSON.stringify(
          capacity
        ),
      source:
        'nac_admin',
      actorUserId
    });

    db.exec('COMMIT');

    return capacity;
  } catch (error) {
    db.exec('ROLLBACK');

    if (
      String(
        error.message || ''
      ).includes(
        'UNIQUE constraint failed'
      )
    ) {
      const conflict =
        new Error(
          'This vehicle type is already configured for the service window'
        );

      conflict.statusCode = 409;
      throw conflict;
    }

    throw error;
  }
}


function updateTransportProgrammeCapacity(
  capacityId,
  payload,
  actorUserId
) {
  const existing =
    getTransportProgrammeCapacityById(
      capacityId
    );

  if (!existing) {
    const error =
      new Error(
        'Vehicle capacity configuration not found'
      );

    error.statusCode = 404;
    throw error;
  }

  const vehicleType =
    payload.vehicleType === undefined
      ? existing.vehicleType
      : String(
          payload.vehicleType || ''
        ).trim();

  if (!vehicleType) {
    const error =
      new Error(
        'Vehicle type is required'
      );

    error.statusCode = 400;
    throw error;
  }

  const seatCapacity =
    payload.seatCapacity === undefined
      ? existing.seatCapacity
      : parseCapacityPositiveInteger(
          payload.seatCapacity,
          'Seat capacity'
        );

  const isUnlimited =
    payload.isUnlimited === undefined
      ? Number(
          existing.isUnlimited
        )
      : payload.isUnlimited
        ? 1
        : 0;

  let quantity;

  if (isUnlimited) {
    quantity = null;
  } else {
    const sourceQuantity =
      payload.quantity === undefined
        ? existing.quantity
        : payload.quantity;

    if (
      sourceQuantity === null ||
      sourceQuantity === undefined ||
      String(sourceQuantity).trim() === ''
    ) {
      const error =
        new Error(
          'Quantity is required when capacity is not unlimited'
        );

      error.statusCode = 400;
      throw error;
    }

    quantity =
      parseCapacityNonNegativeInteger(
        sourceQuantity,
        'Quantity'
      );
  }

  const displayOrder =
    payload.displayOrder === undefined
      ? existing.displayOrder
      : Number(
          payload.displayOrder
        );

  if (
    !Number.isInteger(
      displayOrder
    )
  ) {
    const error =
      new Error(
        'Display order must be an integer'
      );

    error.statusCode = 400;
    throw error;
  }

  const notes =
    payload.notes === undefined
      ? existing.notes
      : String(
          payload.notes || ''
        ).trim() || null;

  const duplicate =
    db.prepare(`
      SELECT id
      FROM transport_programme_vehicle_capacity
      WHERE programme_window_id = ?
        AND vehicle_type = ?
        AND id <> ?
    `).get(
      existing.programmeWindowId,
      vehicleType,
      capacityId
    );

  if (duplicate) {
    const error =
      new Error(
        'This vehicle type is already configured for the service window'
      );

    error.statusCode = 409;
    throw error;
  }

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE transport_programme_vehicle_capacity
      SET
        vehicle_type = ?,
        seat_capacity = ?,
        quantity = ?,
        is_unlimited = ?,
        display_order = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      vehicleType,
      seatCapacity,
      quantity,
      isUnlimited,
      displayOrder,
      notes,
      capacityId
    );

    const updated =
      getTransportProgrammeCapacityById(
        capacityId
      );

    writeAudit({
      action: 'UPDATE',
      entityType:
        'transport_programme_capacity',
      entityId:
        capacityId,
      oldValue:
        JSON.stringify(
          existing
        ),
      newValue:
        JSON.stringify(
          updated
        ),
      source:
        'nac_admin',
      actorUserId
    });

    db.exec('COMMIT');

    return updated;
  } catch (error) {
    db.exec('ROLLBACK');

    if (
      String(
        error.message || ''
      ).includes(
        'UNIQUE constraint failed'
      )
    ) {
      const conflict =
        new Error(
          'This vehicle type is already configured for the service window'
        );

      conflict.statusCode = 409;
      throw conflict;
    }

    throw error;
  }
}



function userCanSubmitTransportRequest(
  user
) {
  return userHasAnyRole(
    user,
    [
      'booker',
      'budget_holder',
      'department_manager',
      'uhp_admin'
    ]
  );
}


function userCanViewAllTransportRequests(
  user
) {
  return userHasAnyRole(
    user,
    [
      'uhp_admin',
      'nac_admin'
    ]
  );
}


function normaliseOptionalTransportCoordinate(
  value,
  fieldName
) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ''
  ) {
    return null;
  }

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    const error =
      new Error(
        `${fieldName} must be a valid number`
      );

    error.statusCode = 400;
    throw error;
  }

  return number;
}



const TRANSPORT_REQUEST_CSV_HEADERS = [
  'First Name',
  'Last Name',
  'Mobile',
  'Email',
  'Service',
  'Direction',
  'Shift Date',
  'Shift Time',
  'Pickup Address',
  'Pickup Postcode',
  'Work Destination',
  'Work Postcode',
  'Budget Number',
  'Reason Code',
  'Important Information'
];


function parseTransportRequestCsv(
  csvText
) {
  const input =
    String(
      csvText || ''
    )
      .replace(
        /^\uFEFF/,
        ''
      );

  const rows = [];

  let row = [];
  let value = '';
  let quoted = false;

  for (
    let index = 0;
    index < input.length;
    index += 1
  ) {
    const character =
      input[index];

    if (quoted) {
      if (
        character === '"' &&
        input[index + 1] === '"'
      ) {
        value += '"';
        index += 1;
        continue;
      }

      if (character === '"') {
        quoted = false;
        continue;
      }

      value += character;
      continue;
    }

    if (character === '"') {
      quoted = true;
      continue;
    }

    if (character === ',') {
      row.push(value);
      value = '';
      continue;
    }

    if (
      character === '\n' ||
      character === '\r'
    ) {
      if (
        character === '\r' &&
        input[index + 1] === '\n'
      ) {
        index += 1;
      }

      row.push(value);
      value = '';

      if (
        row.some(
          (cell) =>
            String(
              cell || ''
            ).trim() !== ''
        )
      ) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    value += character;
  }

  if (quoted) {
    const error =
      new Error(
        'The CSV contains an unfinished quoted field'
      );

    error.statusCode = 400;
    throw error;
  }

  row.push(value);

  if (
    row.some(
      (cell) =>
        String(
          cell || ''
        ).trim() !== ''
    )
  ) {
    rows.push(row);
  }

  return rows;
}


function normaliseCsvHeader(
  value
) {
  return String(
    value || ''
  )
    .trim()
    .replace(
      /\s+/g,
      ' '
    )
    .toLowerCase();
}


function normaliseTransportCsvMobile(
  value
) {
  const original =
    String(
      value || ''
    ).trim();

  if (!original) {
    return '';
  }

  let compact =
    original.replace(
      /[\s().-]/g,
      ''
    );

  if (
    /^7\d{9}$/.test(
      compact
    )
  ) {
    compact =
      `0${compact}`;
  }

  if (
    compact.startsWith(
      '0044'
    )
  ) {
    compact =
      `+44${compact.slice(4)}`;
  }

  if (
    compact.startsWith(
      '44'
    )
  ) {
    compact =
      `+${compact}`;
  }

  if (
    compact.startsWith(
      '07'
    )
  ) {
    compact =
      `+44${compact.slice(1)}`;
  }

  if (
    !/^\+447\d{9}$/.test(
      compact
    )
  ) {
    return null;
  }

  return compact;
}


function normaliseTransportCsvPostcode(
  value
) {
  const compact =
    String(
      value || ''
    )
      .trim()
      .toUpperCase()
      .replace(
        /\s+/g,
        ''
      );

  if (!compact) {
    return null;
  }

  if (
    !/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(
      compact
    )
  ) {
    return null;
  }

  return (
    `${compact.slice(0, -3)} ` +
    compact.slice(-3)
  );
}


function normaliseTransportCsvDirection(
  value
) {
  const normalised =
    String(
      value || ''
    )
      .trim()
      .toLowerCase()
      .replace(
        /[_-]+/g,
        ' '
      )
      .replace(
        /\s+/g,
        ' '
      );

  if (
    [
      'to work',
      'towork'
    ].includes(
      normalised
    )
  ) {
    return 'to_work';
  }

  if (
    [
      'from work',
      'fromwork'
    ].includes(
      normalised
    )
  ) {
    return 'from_work';
  }

  return null;
}


function normaliseTransportCsvDate(
  value
) {
  const input =
    String(
      value || ''
    ).trim();

  let year;
  let month;
  let day;

  let match =
    input.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (match) {
    year =
      Number(match[1]);

    month =
      Number(match[2]);

    day =
      Number(match[3]);
  } else {
    match =
      input.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
      );

    if (!match) {
      return null;
    }

    day =
      Number(match[1]);

    month =
      Number(match[2]);

    year =
      Number(match[3]);
  }

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !==
      month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return [
    String(year).padStart(
      4,
      '0'
    ),
    String(month).padStart(
      2,
      '0'
    ),
    String(day).padStart(
      2,
      '0'
    )
  ].join('-');
}


function normaliseTransportCsvTime(
  value
) {
  const input =
    String(
      value || ''
    ).trim();

  const match =
    input.match(
      /^(\d{1,2}):(\d{2})$/
    );

  if (!match) {
    return null;
  }

  const hours =
    Number(
      match[1]
    );

  const minutes =
    Number(
      match[2]
    );

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return (
    `${String(hours).padStart(2, '0')}:` +
    String(minutes).padStart(
      2,
      '0'
    )
  );
}


function normaliseTransportCsvEmail(
  value
) {
  const email =
    String(
      value || ''
    )
      .trim()
      .toLowerCase();

  if (!email) {
    return null;
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {
    return false;
  }

  return email;
}


function getTransportCsvServiceOptions() {
  const now =
    new Date().toISOString();

  return db.prepare(`
    SELECT
      tp.id
        AS programmeId,

      tp.code
        AS programmeCode,

      tp.name
        AS programmeName,

      tpw.id
        AS programmeWindowId,

      tpw.name
        AS serviceName,

      tpw.starts_at
        AS startsAt,

      tpw.ends_at
        AS endsAt

    FROM transport_programmes tp

    JOIN transport_programme_windows tpw
      ON tpw.programme_id =
        tp.id

    WHERE tp.status = 'open'

      AND tpw.is_active = 1

      AND (
        tp.request_opens_at IS NULL
        OR tp.request_opens_at <= ?
      )

      AND (
        tp.request_closes_at IS NULL
        OR tp.request_closes_at >= ?
      )

    ORDER BY
      tpw.starts_at,
      tpw.display_order,
      tpw.id
  `).all(
    now,
    now
  );
}


function findTransportCsvService(
  serviceText,
  serviceOptions
) {
  const wanted =
    String(
      serviceText || ''
    )
      .trim()
      .toLowerCase();

  if (!wanted) {
    return {
      service: null,
      error:
        'Service is required'
    };
  }

  const exact =
    serviceOptions.filter(
      (option) =>
        String(
          option.serviceName ||
          ''
        )
          .trim()
          .toLowerCase() ===
        wanted
    );

  if (exact.length === 1) {
    return {
      service:
        exact[0],
      error: null
    };
  }

  if (exact.length > 1) {
    return {
      service: null,
      error:
        'Service name is ambiguous. Use a unique configured service name.'
    };
  }

  const programmeAndWindow =
    serviceOptions.filter(
      (option) =>
        (
          `${option.programmeName} — ${option.serviceName}`
        )
          .trim()
          .toLowerCase() ===
        wanted ||
        (
          `${option.programmeName} - ${option.serviceName}`
        )
          .trim()
          .toLowerCase() ===
        wanted
    );

  if (
    programmeAndWindow.length ===
    1
  ) {
    return {
      service:
        programmeAndWindow[0],
      error: null
    };
  }

  return {
    service: null,
    error:
      `Unknown or unavailable service: ${serviceText}`
  };
}


function resolveTransportCsvCoding({
  budgetNumber,
  reasonCode
}) {
  const budget =
    db.prepare(`
      SELECT
        id,
        budget_number
          AS budgetNumber

      FROM budgets

      WHERE
        budget_number = ?
        COLLATE NOCASE

        AND status = 'active'

      LIMIT 1
    `).get(
      String(
        budgetNumber || ''
      ).trim()
    );

  if (!budget) {
    return {
      coding: null,
      error:
        `Unknown or inactive budget number: ${budgetNumber}`
    };
  }

  const reason =
    db.prepare(`
      SELECT
        id,
        code

      FROM reason_codes

      WHERE
        code = ?
        COLLATE NOCASE

        AND status = 'active'

      LIMIT 1
    `).get(
      String(
        reasonCode || ''
      ).trim()
    );

  if (!reason) {
    return {
      coding: null,
      error:
        `Unknown or inactive reason code: ${reasonCode}`
    };
  }

  try {
    const coding =
      resolveStaffTransportRequestCoding({
        budgetId:
          budget.id,

        reasonCodeId:
          reason.id
      });

    return {
      coding,
      error: null
    };
  } catch (error) {
    return {
      coding: null,
      error:
        error.message ||
        'Unable to resolve funding details'
    };
  }
}


function findExistingTransportCsvDuplicate({
  programmeWindowId,
  direction,
  passengerName,
  mobile,
  email,
  shiftTime,
  pickupAddress
}) {
  const candidates =
    db.prepare(`
      SELECT
        id,

        passenger_name
          AS passengerName,

        passenger_mobile
          AS passengerMobile,

        passenger_email
          AS passengerEmail,

        shift_time
          AS shiftTime,

        pickup_address
          AS pickupAddress,

        status

      FROM transport_requests

      WHERE programme_window_id = ?
        AND direction = ?

        AND status NOT IN (
          'cancelled',
          'not_accommodated'
        )

      ORDER BY id DESC
    `).all(
      programmeWindowId,
      direction
    );

  const normaliseName =
    (value) =>
      String(
        value || ''
      )
        .trim()
        .toLowerCase()
        .replace(
          /\s+/g,
          ' '
        );

  const normaliseAddress =
    (value) =>
      String(
        value || ''
      )
        .trim()
        .toLowerCase()
        .replace(
          /\s+/g,
          ' '
        );

  const rowName =
    normaliseName(
      passengerName
    );

  const rowAddress =
    normaliseAddress(
      pickupAddress
    );

  for (
    const candidate
    of candidates
  ) {
    const candidateMobile =
      normaliseTransportCsvMobile(
        candidate.passengerMobile
      );

    const candidateEmail =
      normaliseTransportCsvEmail(
        candidate.passengerEmail
      );

    if (
      mobile &&
      candidateMobile &&
      candidateMobile === mobile
    ) {
      return {
        requestId:
          Number(candidate.id),
        reason:
          'Same mobile, service and journey direction'
      };
    }

    if (
      email &&
      candidateEmail &&
      candidateEmail === email
    ) {
      return {
        requestId:
          Number(candidate.id),
        reason:
          'Same email, service and journey direction'
      };
    }

    if (
      normaliseName(
        candidate.passengerName
      ) === rowName &&
      candidate.shiftTime ===
        shiftTime &&
      normaliseAddress(
        candidate.pickupAddress
      ) === rowAddress
    ) {
      return {
        requestId:
          Number(candidate.id),
        reason:
          'Same passenger, shift time and pickup address'
      };
    }
  }

  return null;
}


function transportCsvInternalDuplicateKey(
  row
) {
  return [
    row.programmeWindowId,
    row.direction,
    row.mobile ||
      row.email ||
      String(
        row.passengerName ||
        ''
      ).toLowerCase(),
    row.shiftTime
  ].join('|');
}


function getTransportRequestImportBatch(
  batchId
) {
  const batch =
    db.prepare(`
      SELECT
        trib.id,
        trib.source,
        trib.status,

        trib.original_filename
          AS originalFilename,

        trib.row_count
          AS rowCount,

        trib.ready_count
          AS readyCount,

        trib.warning_count
          AS warningCount,

        trib.error_count
          AS errorCount,

        trib.imported_count
          AS importedCount,

        trib.created_by_user_id
          AS createdByUserId,

        u.first_name || ' ' ||
          u.last_name
          AS createdByName,

        trib.created_at
          AS createdAt,

        trib.updated_at
          AS updatedAt,

        trib.imported_at
          AS importedAt

      FROM transport_request_import_batches trib

      JOIN users u
        ON u.id =
          trib.created_by_user_id

      WHERE trib.id = ?
    `).get(
      Number(batchId)
    );

  if (!batch) {
    return null;
  }

  const rows =
    db.prepare(`
      SELECT
        id,

        batch_id
          AS batchId,

        row_number
          AS rowNumber,

        status,

        raw_json
          AS rawJson,

        normalised_json
          AS normalisedJson,

        error_json
          AS errorJson,

        warning_json
          AS warningJson,

        duplicate_transport_request_id
          AS duplicateTransportRequestId,

        imported_transport_request_id
          AS importedTransportRequestId

      FROM transport_request_import_rows

      WHERE batch_id = ?

      ORDER BY row_number
    `).all(
      Number(batchId)
    )
      .map(
        (row) => ({
          ...row,

          raw:
            JSON.parse(
              row.rawJson
            ),

          normalised:
            row.normalisedJson
              ? JSON.parse(
                  row.normalisedJson
                )
              : null,

          errors:
            row.errorJson
              ? JSON.parse(
                  row.errorJson
                )
              : [],

          warnings:
            row.warningJson
              ? JSON.parse(
                  row.warningJson
                )
              : []
        })
      )
      .map(
        ({
          rawJson,
          normalisedJson,
          errorJson,
          warningJson,
          ...row
        }) => row
      );

  return {
    ...batch,
    rows
  };
}


function createTransportRequestImportPreview(
  payload,
  authUser
) {
  if (
    !userCanSubmitTransportRequest(
      authUser
    )
  ) {
    const error =
      new Error(
        'You do not have permission to import transport requests'
      );

    error.statusCode = 403;
    throw error;
  }

  const filename =
    String(
      payload.filename ||
      'transport-requests.csv'
    )
      .trim()
      .slice(
        0,
        255
      );

  const csvText =
    String(
      payload.csvText ||
      ''
    );

  if (!csvText.trim()) {
    const error =
      new Error(
        'CSV data is required'
      );

    error.statusCode = 400;
    throw error;
  }

  /*
    readJson() is capped at 1 MB already.
    Keep the CSV itself lower so the response/metadata
    also remains comfortably inside that limit.
  */
  if (
    Buffer.byteLength(
      csvText,
      'utf8'
    ) >
    512 * 1024
  ) {
    const error =
      new Error(
        'CSV file is too large. Maximum size is 512 KB.'
      );

    error.statusCode = 413;
    throw error;
  }

  const parsed =
    parseTransportRequestCsv(
      csvText
    );

  if (
    parsed.length < 2
  ) {
    const error =
      new Error(
        'The CSV must contain a header row and at least one request'
      );

    error.statusCode = 400;
    throw error;
  }

  const incomingHeaders =
    parsed[0].map(
      normaliseCsvHeader
    );

  const expectedHeaders =
    TRANSPORT_REQUEST_CSV_HEADERS.map(
      normaliseCsvHeader
    );

  if (
    incomingHeaders.length !==
      expectedHeaders.length ||
    incomingHeaders.some(
      (header, index) =>
        header !==
        expectedHeaders[index]
    )
  ) {
    const error =
      new Error(
        'CSV headers do not match the transport request template'
      );

    error.statusCode = 400;

    error.details = {
      expectedHeaders:
        TRANSPORT_REQUEST_CSV_HEADERS
    };

    throw error;
  }

  const dataRows =
    parsed
      .slice(1)
      .map(
        (cells, index) => ({
          cells,
          rowNumber:
            index + 2
        })
      )
      .filter(
        ({ cells }) =>
          String(
            cells?.[0] || ''
          )
            .trim()
            .toUpperCase() !==
          'EXAMPLE ROW'
      );

  if (
    dataRows.length > 250
  ) {
    const error =
      new Error(
        'CSV contains too many rows. Maximum is 250 requests per upload.'
      );

    error.statusCode = 400;
    throw error;
  }

  const serviceOptions =
    getTransportCsvServiceOptions();

  const stagedRows = [];

  for (
    let index = 0;
    index < dataRows.length;
    index += 1
  ) {
    const {
      cells: sourceCells,
      rowNumber
    } =
      dataRows[index];

    const cells = [
      ...sourceCells
    ];

    while (
      cells.length <
      TRANSPORT_REQUEST_CSV_HEADERS.length
    ) {
      cells.push('');
    }

    const raw = {};

    TRANSPORT_REQUEST_CSV_HEADERS.forEach(
      (header, headerIndex) => {
        raw[header] =
          String(
            cells[headerIndex] ??
            ''
          ).trim();
      }
    );

    const errors = [];
    const warnings = [];

    if (
      cells.length >
      TRANSPORT_REQUEST_CSV_HEADERS.length
    ) {
      errors.push(
        'Row contains more columns than the CSV template'
      );
    }

    const firstName =
      raw['First Name'];

    const lastName =
      raw['Last Name'];

    if (!firstName) {
      errors.push(
        'First Name is required'
      );
    }

    if (!lastName) {
      errors.push(
        'Last Name is required'
      );
    }

    const passengerName =
      [
        firstName,
        lastName
      ]
        .filter(Boolean)
        .join(' ');

    const mobile =
      normaliseTransportCsvMobile(
        raw.Mobile
      );

    if (!raw.Mobile) {
      errors.push(
        'Mobile is required'
      );
    } else if (!mobile) {
      errors.push(
        'Mobile must be a valid UK mobile number'
      );
    }

    const email =
      normaliseTransportCsvEmail(
        raw.Email
      );

    if (
      email === false
    ) {
      errors.push(
        'Email is not valid'
      );
    }

    const direction =
      normaliseTransportCsvDirection(
        raw.Direction
      );

    if (!direction) {
      errors.push(
        'Direction must be To work or From work'
      );
    }

    const shiftDate =
      normaliseTransportCsvDate(
        raw['Shift Date']
      );

    if (!shiftDate) {
      errors.push(
        'Shift Date must be DD/MM/YYYY or YYYY-MM-DD'
      );
    }

    const shiftClockTime =
      normaliseTransportCsvTime(
        raw['Shift Time']
      );

    if (!shiftClockTime) {
      errors.push(
        'Shift Time must be HH:MM'
      );
    }

    const shiftTime =
      shiftDate &&
      shiftClockTime
        ? `${shiftDate}T${shiftClockTime}:00`
        : null;

    if (
      !raw['Pickup Address']
    ) {
      errors.push(
        'Pickup Address is required'
      );
    }

    const pickupPostcode =
      normaliseTransportCsvPostcode(
        raw['Pickup Postcode']
      );

    if (
      raw['Pickup Postcode'] &&
      !pickupPostcode
    ) {
      errors.push(
        'Pickup Postcode is not valid'
      );
    }

    if (
      !raw['Work Destination']
    ) {
      errors.push(
        'Work Destination is required'
      );
    }

    const workPostcode =
      normaliseTransportCsvPostcode(
        raw['Work Postcode']
      );

    if (
      raw['Work Postcode'] &&
      !workPostcode
    ) {
      errors.push(
        'Work Postcode is not valid'
      );
    }

    const serviceResult =
      findTransportCsvService(
        raw.Service,
        serviceOptions
      );

    if (
      serviceResult.error
    ) {
      errors.push(
        serviceResult.error
      );
    }

    const service =
      serviceResult.service;

    if (
      service &&
      shiftTime
    ) {
      const shift =
        new Date(
          shiftTime
        );

      const starts =
        new Date(
          service.startsAt
        );

      const ends =
        new Date(
          service.endsAt
        );

      if (
        Number.isNaN(
          shift.getTime()
        ) ||
        shift < starts ||
        shift > ends
      ) {
        errors.push(
          'Shift time falls outside the selected service window'
        );
      }
    }

    const codingResult =
      resolveTransportCsvCoding({
        budgetNumber:
          raw['Budget Number'],

        reasonCode:
          raw['Reason Code']
      });

    if (
      codingResult.error
    ) {
      errors.push(
        codingResult.error
      );
    }

    const coding =
      codingResult.coding;

    let normalised = null;
    let existingDuplicate =
      null;

    if (
      errors.length === 0
    ) {
      /*
        The template always describes the traveller's
        home/pickup and their work location.

        Direction determines which becomes actual pickup
        and destination for the operational request.
      */
      const homeAddress =
        raw['Pickup Address'];

      const workAddress =
        raw['Work Destination'];

      const actualPickupAddress =
        direction ===
        'to_work'
          ? homeAddress
          : workAddress;

      const actualPickupPostcode =
        direction ===
        'to_work'
          ? pickupPostcode
          : workPostcode;

      const actualDestinationAddress =
        direction ===
        'to_work'
          ? workAddress
          : homeAddress;

      const actualDestinationPostcode =
        direction ===
        'to_work'
          ? workPostcode
          : pickupPostcode;

      normalised = {
        programmeWindowId:
          Number(
            service.programmeWindowId
          ),

        programmeName:
          service.programmeName,

        serviceName:
          service.serviceName,

        passengerName,

        passengerMobile:
          mobile,

        passengerEmail:
          email || null,

        direction,

        shiftTime,

        pickupAddress:
          actualPickupAddress,

        pickupPostcode:
          actualPickupPostcode,

        pickupLatitude: null,
        pickupLongitude: null,

        destinationAddress:
          actualDestinationAddress,

        destinationPostcode:
          actualDestinationPostcode,

        destinationLatitude: null,
        destinationLongitude: null,

        passengerCount: 1,

        passengerNotes:
          raw[
            'Important Information'
          ] ||
          null,

        accessibilityNotes:
          null,

        departmentId:
          coding.departmentId,

        departmentName:
          coding.departmentName,

        budgetId:
          coding.budgetId,

        budgetNumber:
          coding.budgetNumber,

        budgetName:
          coding.budgetName,

        reasonCodeId:
          coding.reasonCodeId,

        reasonCode:
          coding.reasonCode,

        reasonDescription:
          coding.reasonDescription,

        budgetHolderUserId:
          coding.budgetHolderUserId,

        budgetHolderName:
          coding.budgetHolderName
      };

      existingDuplicate =
        findExistingTransportCsvDuplicate({
          programmeWindowId:
            normalised.programmeWindowId,

          direction:
            normalised.direction,

          passengerName:
            normalised.passengerName,

          mobile:
            normalised.passengerMobile,

          email:
            normalised.passengerEmail,

          shiftTime:
            normalised.shiftTime,

          pickupAddress:
            normalised.pickupAddress
        });

      if (
        existingDuplicate
      ) {
        warnings.push(
          `Possible duplicate of request #${existingDuplicate.requestId}: ${existingDuplicate.reason}`
        );
      }
    }

    stagedRows.push({
      rowNumber:
        rowNumber,

      raw,

      normalised,

      errors,
      warnings,

      duplicateTransportRequestId:
        existingDuplicate?.requestId ||
        null
    });
  }

  /*
    Find duplicates within this upload after all rows
    have been normalised.
  */
  const firstByKey =
    new Map();

  for (
    const row
    of stagedRows
  ) {
    if (
      !row.normalised ||
      row.errors.length
    ) {
      continue;
    }

    const key =
      transportCsvInternalDuplicateKey(
        row.normalised
      );

    const earlier =
      firstByKey.get(
        key
      );

    if (earlier) {
      row.warnings.push(
        `Possible duplicate of CSV row ${earlier.rowNumber}`
      );

      if (
        !earlier.warnings.some(
          (warning) =>
            warning.includes(
              `CSV row ${row.rowNumber}`
            )
        )
      ) {
        earlier.warnings.push(
          `Possible duplicate of CSV row ${row.rowNumber}`
        );
      }
    } else {
      firstByKey.set(
        key,
        row
      );
    }
  }

  for (
    const row
    of stagedRows
  ) {
    row.status =
      row.errors.length
        ? 'error'
        : row.warnings.length
          ? 'warning'
          : 'ready';
  }

  const readyCount =
    stagedRows.filter(
      (row) =>
        row.status ===
        'ready'
    ).length;

  const warningCount =
    stagedRows.filter(
      (row) =>
        row.status ===
        'warning'
    ).length;

  const errorCount =
    stagedRows.filter(
      (row) =>
        row.status ===
        'error'
    ).length;

  const batchStatus =
    errorCount > 0
      ? 'has_errors'
      : 'ready';

  db.exec('BEGIN');

  try {
    const batchResult =
      db.prepare(`
        INSERT INTO transport_request_import_batches
        (
          source,
          status,
          original_filename,

          row_count,
          ready_count,
          warning_count,
          error_count,
          imported_count,

          created_by_user_id
        )
        VALUES (
          'department_csv',
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          0,
          ?
        )
      `).run(
        batchStatus,
        filename,
        stagedRows.length,
        readyCount,
        warningCount,
        errorCount,
        authUser.id
      );

    const batchId =
      Number(
        batchResult.lastInsertRowid
      );

    const insertRow =
      db.prepare(`
        INSERT INTO transport_request_import_rows
        (
          batch_id,
          row_number,
          status,

          raw_json,
          normalised_json,

          error_json,
          warning_json,

          duplicate_transport_request_id
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?
        )
      `);

    for (
      const row
      of stagedRows
    ) {
      insertRow.run(
        batchId,
        row.rowNumber,
        row.status,

        JSON.stringify(
          row.raw
        ),

        row.normalised
          ? JSON.stringify(
              row.normalised
            )
          : null,

        row.errors.length
          ? JSON.stringify(
              row.errors
            )
          : null,

        row.warnings.length
          ? JSON.stringify(
              row.warnings
            )
          : null,

        row.duplicateTransportRequestId
      );
    }

    writeAudit({
      action:
        'CREATE',

      entityType:
        'transport_request_import_batch',

      entityId:
        batchId,

      newValue:
        JSON.stringify({
          source:
            'department_csv',

          filename,

          rowCount:
            stagedRows.length,

          readyCount,
          warningCount,
          errorCount,

          status:
            batchStatus
        }),

      source:
        'department_csv',

      actorUserId:
        authUser.id
    });

    db.exec('COMMIT');

    return getTransportRequestImportBatch(
      batchId
    );
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function confirmTransportRequestImport(
  batchId,
  payload,
  authUser
) {
  if (
    !userCanSubmitTransportRequest(
      authUser
    )
  ) {
    const error =
      new Error(
        'You do not have permission to import transport requests'
      );

    error.statusCode = 403;
    throw error;
  }

  const batch =
    getTransportRequestImportBatch(
      batchId
    );

  if (!batch) {
    const error =
      new Error(
        'Transport request import batch not found'
      );

    error.statusCode = 404;
    throw error;
  }

  if (
    Number(
      batch.createdByUserId
    ) !== Number(
      authUser.id
    ) &&
    !userHasAnyRole(
      authUser,
      ['uhp_admin']
    )
  ) {
    const error =
      new Error(
        'Transport request import batch not found'
      );

    error.statusCode = 404;
    throw error;
  }

  if (
    batch.status ===
    'imported'
  ) {
    const error =
      new Error(
        'This CSV batch has already been imported'
      );

    error.statusCode = 409;
    throw error;
  }

  if (
    batch.status !==
    'ready'
  ) {
    const error =
      new Error(
        'This CSV batch is not ready to import'
      );

    error.statusCode = 409;
    throw error;
  }

  if (
    Number(
      batch.errorCount
    ) > 0
  ) {
    const error =
      new Error(
        'CSV batches containing errors cannot be imported'
      );

    error.statusCode = 409;
    throw error;
  }

  const confirmWarnings =
    payload?.confirmWarnings === true;

  if (
    Number(
      batch.warningCount
    ) > 0 &&
    !confirmWarnings
  ) {
    const error =
      new Error(
        'This CSV contains possible duplicates or warnings. Confirm the warnings before importing.'
      );

    error.statusCode = 409;
    throw error;
  }

  if (
    !Array.isArray(
      batch.rows
    ) ||
    batch.rows.length === 0
  ) {
    const error =
      new Error(
        'This CSV batch contains no rows to import'
      );

    error.statusCode = 409;
    throw error;
  }

  /*
    Revalidate every staged row immediately before import.
    Preview data may be several minutes old and budgets,
    service windows or duplicate state may have changed.
  */
  const preparedRows = [];

  for (
    const row
    of batch.rows
  ) {
    if (
      ![
        'ready',
        'warning'
      ].includes(
        row.status
      )
    ) {
      const error =
        new Error(
          `CSV row ${row.rowNumber} is not ready to import`
        );

      error.statusCode = 409;
      throw error;
    }

    if (
      !row.normalised
    ) {
      const error =
        new Error(
          `CSV row ${row.rowNumber} has no validated data`
        );

      error.statusCode = 409;
      throw error;
    }

    const request =
      row.normalised;

    const window =
      getTransportRequestWindowForSubmission(
        Number(
          request.programmeWindowId
        )
      );

    if (!window) {
      const error =
        new Error(
          `CSV row ${row.rowNumber}: service window no longer exists`
        );

      error.statusCode = 409;
      throw error;
    }

    if (
      Number(
        window.isActive
      ) !== 1 ||
      window.programmeStatus !==
        'open'
    ) {
      const error =
        new Error(
          `CSV row ${row.rowNumber}: service is no longer available`
        );

      error.statusCode = 409;
      throw error;
    }

    const now =
      new Date();

    if (
      window.requestOpensAt &&
      now <
        new Date(
          window.requestOpensAt
        )
    ) {
      const error =
        new Error(
          `CSV row ${row.rowNumber}: requests for this service are not open yet`
        );

      error.statusCode = 409;
      throw error;
    }

    if (
      window.requestClosesAt &&
      now >
        new Date(
          window.requestClosesAt
        )
    ) {
      const error =
        new Error(
          `CSV row ${row.rowNumber}: requests for this service are closed`
        );

      error.statusCode = 409;
      throw error;
    }

    /*
      Resolve coding again rather than trusting the preview
      snapshot. This confirms budget/reason/holder are still
      valid at the moment the live request is created.
    */
    const coding =
      resolveStaffTransportRequestCoding({
        budgetId:
          request.budgetId,

        reasonCodeId:
          request.reasonCodeId
      });

    const currentDuplicate =
      findExistingTransportCsvDuplicate({
        programmeWindowId:
          Number(
            request.programmeWindowId
          ),

        direction:
          request.direction,

        passengerName:
          request.passengerName,

        mobile:
          request.passengerMobile,

        email:
          request.passengerEmail,

        shiftTime:
          request.shiftTime,

        pickupAddress:
          request.pickupAddress
      });

    if (
      currentDuplicate &&
      !confirmWarnings
    ) {
      const error =
        new Error(
          `CSV row ${row.rowNumber} may duplicate transport request #${currentDuplicate.requestId}. Confirm warnings before importing.`
        );

      error.statusCode = 409;
      throw error;
    }

    preparedRows.push({
      row,
      request,
      coding,
      currentDuplicate
    });
  }

  db.exec(
    'BEGIN IMMEDIATE'
  );

  try {
    /*
      Lock the batch state inside the transaction so a second
      confirmation cannot import the same staged batch.
    */
    const lockResult =
      db.prepare(`
        UPDATE transport_request_import_batches

        SET
          status = 'importing',
          updated_at =
            CURRENT_TIMESTAMP

        WHERE id = ?
          AND status = 'ready'
      `).run(
        Number(batchId)
      );

    if (
      Number(
        lockResult.changes
      ) !== 1
    ) {
      const error =
        new Error(
          'This CSV batch can no longer be imported'
        );

      error.statusCode = 409;
      throw error;
    }

    const insertRequest =
      db.prepare(`
        INSERT INTO transport_requests
        (
          programme_window_id,

          requested_by_user_id,
          requested_by_staff_identity_id,
          entered_by_user_id,
          source,

          passenger_name,
          passenger_mobile,
          passenger_email,

          direction,
          shift_time,

          pickup_address,
          pickup_postcode,
          pickup_latitude,
          pickup_longitude,

          destination_address,
          destination_postcode,
          destination_latitude,
          destination_longitude,

          passenger_count,

          accessibility_notes,
          passenger_notes,

          department_id,
          budget_id,
          reason_code_id,
          budget_holder_user_id,

          status
        )
        VALUES (
          ?,

          NULL,
          NULL,
          ?,
          'department_csv',

          ?, ?, ?,

          ?, ?,

          ?, ?, ?, ?,

          ?, ?, ?, ?,

          1,

          NULL,
          ?,

          ?, ?, ?, ?,

          'submitted'
        )
      `);

    const insertEvent =
      db.prepare(`
        INSERT INTO transport_request_events
        (
          transport_request_id,
          event_type,

          actor_user_id,
          actor_staff_identity_id,

          old_status,
          new_status,

          notes
        )
        VALUES (
          ?,
          'submitted',

          ?,
          NULL,

          NULL,
          'submitted',

          'Transport request imported from department CSV'
        )
      `);

    const updateImportRow =
      db.prepare(`
        UPDATE transport_request_import_rows

        SET
          status = 'imported',

          imported_transport_request_id = ?,

          updated_at =
            CURRENT_TIMESTAMP

        WHERE id = ?
          AND batch_id = ?
          AND status IN (
            'ready',
            'warning'
          )
          AND imported_transport_request_id IS NULL
      `);

    let importedCount = 0;

    for (
      const prepared
      of preparedRows
    ) {
      const {
        row,
        request,
        coding,
        currentDuplicate
      } = prepared;

      const result =
        insertRequest.run(
          Number(
            request.programmeWindowId
          ),

          authUser.id,

          request.passengerName,
          request.passengerMobile,
          request.passengerEmail ||
            null,

          request.direction,
          request.shiftTime,

          request.pickupAddress,
          request.pickupPostcode ||
            null,
          null,
          null,

          request.destinationAddress,
          request.destinationPostcode ||
            null,
          null,
          null,

          request.passengerNotes ||
            null,

          coding.departmentId,
          coding.budgetId,
          coding.reasonCodeId,
          coding.budgetHolderUserId
        );

      const requestId =
        Number(
          result.lastInsertRowid
        );

      insertEvent.run(
        requestId,
        authUser.id
      );

      writeAudit({
        action:
          'CREATE',

        entityType:
          'transport_request',

        entityId:
          requestId,

        newValue:
          JSON.stringify({
            programmeWindowId:
              Number(
                request.programmeWindowId
              ),

            requestedByUserId:
              null,

            requestedByStaffIdentityId:
              null,

            enteredByUserId:
              authUser.id,

            source:
              'department_csv',

            importBatchId:
              Number(
                batchId
              ),

            importRowNumber:
              Number(
                row.rowNumber
              ),

            passengerName:
              request.passengerName,

            direction:
              request.direction,

            shiftTime:
              request.shiftTime,

            departmentId:
              coding.departmentId,

            budgetId:
              coding.budgetId,

            reasonCodeId:
              coding.reasonCodeId,

            budgetHolderUserId:
              coding.budgetHolderUserId,

            duplicateOverride:
              Boolean(
                currentDuplicate ||
                (
                  Array.isArray(
                    row.warnings
                  ) &&
                  row.warnings.length > 0
                )
              ),

            duplicateTransportRequestId:
              currentDuplicate
                ?.requestId ||
              row
                .duplicateTransportRequestId ||
              null,

            status:
              'submitted'
          }),

        source:
          'department_csv',

        actorUserId:
          authUser.id
      });

      const rowUpdate =
        updateImportRow.run(
          requestId,
          row.id,
          Number(
            batchId
          )
        );

      if (
        Number(
          rowUpdate.changes
        ) !== 1
      ) {
        const error =
          new Error(
            `CSV row ${row.rowNumber} could not be marked imported`
          );

        error.statusCode = 409;
        throw error;
      }

      importedCount += 1;
    }

    db.prepare(`
      UPDATE transport_request_import_batches

      SET
        status = 'imported',

        imported_count = ?,

        imported_at =
          CURRENT_TIMESTAMP,

        updated_at =
          CURRENT_TIMESTAMP

      WHERE id = ?
        AND status = 'importing'
    `).run(
      importedCount,
      Number(
        batchId
      )
    );

    writeAudit({
      action:
        'UPDATE',

      entityType:
        'transport_request_import_batch',

      entityId:
        Number(
          batchId
        ),

      fieldName:
        'status',

      oldValue:
        JSON.stringify({
          status:
            'ready'
        }),

      newValue:
        JSON.stringify({
          status:
            'imported',

          importedCount,

          confirmWarnings
        }),

      source:
        'department_csv',

      actorUserId:
        authUser.id
    });

    db.exec('COMMIT');

    return getTransportRequestImportBatch(
      Number(
        batchId
      )
    );
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function listTransportRequestOptions(
  authUser
) {
  if (
    !userCanSubmitTransportRequest(
      authUser
    )
  ) {
    const error =
      new Error(
        'You do not have permission to submit transport requests'
      );

    error.statusCode = 403;
    throw error;
  }

  const now =
    new Date().toISOString();

  return db.prepare(`
    SELECT
      tp.id
        AS programmeId,

      tp.code
        AS programmeCode,

      tp.name
        AS programmeName,

      tp.programme_type
        AS programmeType,

      tp.request_closes_at
        AS requestClosesAt,

      tp.public_notes
        AS programmePublicNotes,

      tpw.id
        AS windowId,

      tpw.name
        AS windowName,

      tpw.starts_at
        AS startsAt,

      tpw.ends_at
        AS endsAt,

      tpw.public_notes
        AS windowPublicNotes

    FROM transport_programmes tp

    JOIN transport_programme_windows tpw
      ON tpw.programme_id =
        tp.id

    WHERE tp.status = 'open'

      AND tpw.is_active = 1

      AND (
        tp.request_opens_at IS NULL
        OR tp.request_opens_at <= ?
      )

      AND (
        tp.request_closes_at IS NULL
        OR tp.request_closes_at >= ?
      )

    ORDER BY
      tpw.starts_at,
      tpw.display_order,
      tpw.id
  `).all(
    now,
    now
  );
}


function listStaffTransportRequestOptions(
  staffIdentityId
) {
  const now =
    new Date().toISOString();

  const options =
    db.prepare(`
      SELECT
        tp.id
          AS programmeId,

        tp.code
          AS programmeCode,

        tp.name
          AS programmeName,

        tp.programme_type
          AS programmeType,

        tp.request_closes_at
          AS requestClosesAt,

        tp.public_notes
          AS programmePublicNotes,

        tpw.id
          AS windowId,

        tpw.name
          AS windowName,

        tpw.starts_at
          AS startsAt,

        tpw.ends_at
          AS endsAt,

        tpw.public_notes
          AS windowPublicNotes

      FROM transport_programmes tp

      JOIN transport_programme_windows tpw
        ON tpw.programme_id =
          tp.id

      JOIN transport_staff_programme_access tspa
        ON tspa.programme_id =
          tp.id
        AND tspa.staff_identity_id = ?

      WHERE tp.status = 'open'
        AND tpw.is_active = 1

        AND (
          tp.request_opens_at IS NULL
          OR tp.request_opens_at <= ?
        )

        AND (
          tp.request_closes_at IS NULL
          OR tp.request_closes_at >= ?
        )

      ORDER BY
        tpw.starts_at,
        tpw.display_order,
        tpw.id
    `).all(
      Number(staffIdentityId),
      now,
      now
    );

  /*
    Restricted staff are not granted budget
    permissions. This list is only the set of active
    UHP budgets that are structurally usable and have
    a current active primary holder.

    The request remains subject to UHP review before
    planning/booking.
  */
  const budgets =
    db.prepare(`
      SELECT
        b.id,

        b.budget_number
          AS budgetNumber,

        b.name,

        d.name
          AS department

      FROM budgets b

      LEFT JOIN departments d
        ON d.id =
          b.department_id

      WHERE b.status = 'active'

        AND EXISTS (
          SELECT 1

          FROM budget_assignments ba

          JOIN users holder
            ON holder.id =
              ba.user_id
            AND holder.status =
              'active'

          WHERE ba.budget_id =
              b.id

            AND ba.assignment_type =
              'primary_holder'

            AND ba.is_active = 1

            AND (
              ba.valid_from IS NULL
              OR ba.valid_from <=
                date('now')
            )

            AND (
              ba.valid_to IS NULL
              OR ba.valid_to >=
                date('now')
            )
        )

      ORDER BY
        b.budget_number,
        b.id
    `).all();

  const reasonCodes =
    db.prepare(`
      SELECT
        id,
        code,
        description

      FROM reason_codes

      WHERE status = 'active'

      ORDER BY
        code,
        id
    `).all();

  const savedLocations =
    db.prepare(`
      SELECT
        id,
        name,
        address,
        postcode,
        latitude,
        longitude,
        category,
        display_order
          AS displayOrder

      FROM saved_locations

      WHERE is_active = 1

      ORDER BY
        display_order,
        name COLLATE NOCASE
    `).all();

  return {
    options,
    budgets,
    reasonCodes,
    savedLocations
  };
}


function listTransportRequestsForStaffIdentity(
  staffIdentityId
) {
  return db.prepare(`
    SELECT
      tr.id,

      tr.programme_window_id
        AS programmeWindowId,

      tpw.name
        AS programmeWindowName,

      tp.id
        AS programmeId,

      tp.code
        AS programmeCode,

      tp.name
        AS programmeName,

      tr.source,

      tr.passenger_name
        AS passengerName,

      tr.direction,

      tr.shift_time
        AS shiftTime,

      tr.pickup_address
        AS pickupAddress,

      tr.pickup_postcode
        AS pickupPostcode,

      tr.pickup_latitude
        AS pickupLatitude,

      tr.pickup_longitude
        AS pickupLongitude,

      tr.destination_address
        AS destinationAddress,

      tr.destination_postcode
        AS destinationPostcode,

      tr.destination_latitude
        AS destinationLatitude,

      tr.destination_longitude
        AS destinationLongitude,

      tr.passenger_count
        AS passengerCount,

      tr.status,

      tr.submitted_at
        AS submittedAt,

      tr.updated_at
        AS updatedAt

    FROM transport_requests tr

    JOIN transport_programme_windows tpw
      ON tpw.id =
        tr.programme_window_id

    JOIN transport_programmes tp
      ON tp.id =
        tpw.programme_id

    WHERE
      tr.requested_by_staff_identity_id = ?

    ORDER BY
      datetime(tr.submitted_at) DESC,
      tr.id DESC
  `).all(
    Number(staffIdentityId)
  );
}


function getTransportRequestById(
  requestId
) {
  return db.prepare(`
    SELECT
      tr.id,

      tr.programme_window_id
        AS programmeWindowId,

      tpw.name
        AS programmeWindowName,

      tpw.starts_at
        AS windowStartsAt,

      tpw.ends_at
        AS windowEndsAt,

      tp.id
        AS programmeId,

      tp.code
        AS programmeCode,

      tp.name
        AS programmeName,

      tr.requested_by_user_id
        AS requestedByUserId,

      tr.requested_by_staff_identity_id
        AS requestedByStaffIdentityId,

      tr.entered_by_user_id
        AS enteredByUserId,

      tr.source,

      CASE
        WHEN u.id IS NOT NULL
        THEN
          u.first_name || ' ' ||
          u.last_name

        WHEN staff_identity.id IS NOT NULL
        THEN
          staff_identity.first_name || ' ' ||
          staff_identity.last_name

        ELSE NULL
      END
        AS requestedByName,

      COALESCE(
        u.email,
        staff_identity.email
      )
        AS requestedByEmail,

      CASE
        WHEN entered.id IS NOT NULL
        THEN
          entered.first_name || ' ' ||
          entered.last_name
        ELSE NULL
      END
        AS enteredByName,

      tr.passenger_name
        AS passengerName,

      tr.passenger_mobile
        AS passengerMobile,

      tr.passenger_email
        AS passengerEmail,

      tr.direction,

      tr.shift_time
        AS shiftTime,

      tr.pickup_address
        AS pickupAddress,

      tr.pickup_postcode
        AS pickupPostcode,

      tr.pickup_latitude
        AS pickupLatitude,

      tr.pickup_longitude
        AS pickupLongitude,

      tr.destination_address
        AS destinationAddress,

      tr.destination_postcode
        AS destinationPostcode,

      tr.destination_latitude
        AS destinationLatitude,

      tr.destination_longitude
        AS destinationLongitude,

      tr.passenger_count
        AS passengerCount,

      tr.department_id
        AS departmentId,

      department.name
        AS department,

      tr.budget_id
        AS budgetId,

      budget.budget_number
        AS budgetNumber,

      budget.name
        AS budgetName,

      tr.reason_code_id
        AS reasonCodeId,

      reason.code
        AS reasonCode,

      reason.description
        AS reasonDescription,

      tr.budget_holder_user_id
        AS budgetHolderUserId,

      CASE
        WHEN budget_holder.id IS NOT NULL
        THEN
          budget_holder.first_name || ' ' ||
          budget_holder.last_name
        ELSE NULL
      END
        AS budgetHolder,

      tr.accessibility_notes
        AS accessibilityNotes,

      tr.passenger_notes
        AS passengerNotes,

      tr.internal_notes
        AS internalNotes,

      tr.status,

      tr.submitted_at
        AS submittedAt,

      tr.confirmed_at
        AS confirmedAt,

      tr.cancelled_at
        AS cancelledAt,

      tr.created_at
        AS createdAt,

      tr.updated_at
        AS updatedAt

    FROM transport_requests tr

    JOIN transport_programme_windows tpw
      ON tpw.id =
        tr.programme_window_id

    JOIN transport_programmes tp
      ON tp.id =
        tpw.programme_id

    LEFT JOIN users u
      ON u.id =
        tr.requested_by_user_id

    LEFT JOIN transport_staff_identities
      staff_identity
      ON staff_identity.id =
        tr.requested_by_staff_identity_id

    LEFT JOIN users entered
      ON entered.id =
        tr.entered_by_user_id

    LEFT JOIN departments department
      ON department.id =
        tr.department_id

    LEFT JOIN budgets budget
      ON budget.id =
        tr.budget_id

    LEFT JOIN reason_codes reason
      ON reason.id =
        tr.reason_code_id

    LEFT JOIN users budget_holder
      ON budget_holder.id =
        tr.budget_holder_user_id

    WHERE tr.id = ?
  `).get(requestId);
}


function listTransportRequestsForUser(
  userId
) {
  return db.prepare(`
    SELECT
      tr.id,

      tr.programme_window_id
        AS programmeWindowId,

      tpw.name
        AS programmeWindowName,

      tp.id
        AS programmeId,

      tp.code
        AS programmeCode,

      tp.name
        AS programmeName,

      tr.passenger_name
        AS passengerName,

      tr.direction,

      tr.shift_time
        AS shiftTime,

      tr.pickup_address
        AS pickupAddress,

      tr.pickup_postcode
        AS pickupPostcode,

      tr.destination_address
        AS destinationAddress,

      tr.destination_postcode
        AS destinationPostcode,

      tr.passenger_count
        AS passengerCount,
      tr.status,

      tr.submitted_at
        AS submittedAt,

      tr.updated_at
        AS updatedAt

    FROM transport_requests tr

    JOIN transport_programme_windows tpw
      ON tpw.id =
        tr.programme_window_id

    JOIN transport_programmes tp
      ON tp.id =
        tpw.programme_id

    WHERE
      tr.requested_by_user_id = ?
      OR tr.entered_by_user_id = ?

    ORDER BY
      datetime(tr.submitted_at) DESC,
      tr.id DESC
  `).all(
    userId,
    userId
  );
}


function listAllTransportRequests() {
  return db.prepare(`
    SELECT
      tr.id,

      tr.programme_window_id
        AS programmeWindowId,

      tpw.name
        AS programmeWindowName,

      tp.id
        AS programmeId,

      tp.code
        AS programmeCode,

      tp.name
        AS programmeName,

      tr.requested_by_user_id
        AS requestedByUserId,

      tr.requested_by_staff_identity_id
        AS requestedByStaffIdentityId,

      tr.entered_by_user_id
        AS enteredByUserId,

      tr.source,

      CASE
        WHEN u.id IS NOT NULL
        THEN
          u.first_name || ' ' ||
          u.last_name

        WHEN staff_identity.id IS NOT NULL
        THEN
          staff_identity.first_name || ' ' ||
          staff_identity.last_name

        ELSE NULL
      END
        AS requestedByName,

      CASE
        WHEN entered_by.id IS NOT NULL
        THEN
          entered_by.first_name || ' ' ||
          entered_by.last_name

        ELSE NULL
      END
        AS enteredByName,

      tr.passenger_name
        AS passengerName,

      tr.passenger_mobile
        AS passengerMobile,

      tr.passenger_email
        AS passengerEmail,

      tr.direction,

      tr.shift_time
        AS shiftTime,

      tr.pickup_address
        AS pickupAddress,

      tr.pickup_postcode
        AS pickupPostcode,

      tr.destination_address
        AS destinationAddress,

      tr.destination_postcode
        AS destinationPostcode,

      tr.passenger_count
        AS passengerCount,

      budget.budget_number
        AS budgetNumber,

      department.name
        AS department,

      tr.status,

      tr.submitted_at
        AS submittedAt,

      tr.updated_at
        AS updatedAt

    FROM transport_requests tr

    JOIN transport_programme_windows tpw
      ON tpw.id =
        tr.programme_window_id

    JOIN transport_programmes tp
      ON tp.id =
        tpw.programme_id

    LEFT JOIN users u
      ON u.id =
        tr.requested_by_user_id

    LEFT JOIN users entered_by
      ON entered_by.id =
        tr.entered_by_user_id

    LEFT JOIN transport_staff_identities
      staff_identity
      ON staff_identity.id =
        tr.requested_by_staff_identity_id

    LEFT JOIN budgets budget
      ON budget.id =
        tr.budget_id

    LEFT JOIN departments department
      ON department.id =
        tr.department_id

    ORDER BY
      datetime(tr.submitted_at) DESC,
      tr.id DESC
  `).all();
}



function listChristmasTransportEnquiries() {
  return db.prepare(`
    SELECT
      tr.id,

      tr.programme_window_id
        AS programmeWindowId,

      tpw.name
        AS programmeWindowName,

      tp.id
        AS programmeId,

      tp.code
        AS programmeCode,

      tp.name
        AS programmeName,

      tr.passenger_name
        AS passengerName,

      tr.passenger_mobile
        AS passengerMobile,

      tr.passenger_email
        AS passengerEmail,

      tr.direction,

      tr.shift_time
        AS shiftTime,

      tr.pickup_address
        AS pickupAddress,

      tr.pickup_postcode
        AS pickupPostcode,

      tr.destination_address
        AS destinationAddress,

      tr.destination_postcode
        AS destinationPostcode,

      tr.passenger_count
        AS passengerCount,

      tr.status,

      tr.submitted_at
        AS submittedAt,

      tr.updated_at
        AS updatedAt

    FROM transport_requests tr

    JOIN transport_programme_windows tpw
      ON tpw.id =
        tr.programme_window_id

    JOIN transport_programmes tp
      ON tp.id =
        tpw.programme_id

    WHERE tp.autocab_account_type =
      'xmas_staff'

    ORDER BY
      datetime(tr.shift_time),
      tr.passenger_name,
      tr.id
  `).all();
}



function addChristmasTransportInternalNote(
  requestId,
  note,
  authUser
) {
  if (
    !userHasAnyRole(
      authUser,
      [
        'special_transport_ops',
        'nac_controller',
        'nac_admin'
      ]
    )
  ) {
    const error =
      new Error(
        'You do not have permission to update Special Transport enquiries'
      );

    error.statusCode = 403;
    throw error;
  }

  const request =
    getChristmasTransportEnquiry(
      requestId
    );

  if (!request) {
    const error =
      new Error(
        'Christmas transport request not found'
      );

    error.statusCode = 404;
    throw error;
  }

  const cleanNote =
    String(note || '')
      .trim();

  if (!cleanNote) {
    const error =
      new Error(
        'Enter an internal note'
      );

    error.statusCode = 400;
    throw error;
  }

  if (cleanNote.length > 2000) {
    const error =
      new Error(
        'Internal note must be 2000 characters or fewer'
      );

    error.statusCode = 400;
    throw error;
  }

  const previousNotes =
    String(
      request.internalNotes || ''
    ).trim();

  const actorName =
    [
      authUser.firstName,
      authUser.lastName
    ]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    'Need-A-Cab Ops';

  const noteEntry =
    `${actorName}: ${cleanNote}`;

  const nextNotes =
    previousNotes
      ? `${previousNotes}\n${noteEntry}`
      : noteEntry;

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE transport_requests
      SET
        internal_notes = ?,
        updated_at =
          CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      nextNotes,
      requestId
    );

    db.prepare(`
      INSERT INTO transport_request_events
      (
        transport_request_id,
        event_type,
        actor_user_id,
        old_status,
        new_status,
        notes
      )
      VALUES (
        ?,
        'internal_note',
        ?,
        ?,
        ?,
        ?
      )
    `).run(
      requestId,
      authUser.id,
      request.status,
      request.status,
      cleanNote
    );

    writeAudit({
      action:
        'UPDATE',

      entityType:
        'transport_request',

      entityId:
        requestId,

      fieldName:
        'internal_notes',

      oldValue:
        previousNotes || null,

      newValue:
        nextNotes,

      source:
        'special_transport_enquiries',

      actorUserId:
        authUser.id
    });

    db.exec('COMMIT');

    return getChristmasTransportEnquiry(
      requestId
    );
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function amendChristmasTransportEnquiry(
  requestId,
  payload,
  authUser
) {
  if (
    !userHasAnyRole(
      authUser,
      [
        'special_transport_ops',
        'nac_controller',
        'nac_admin'
      ]
    )
  ) {
    const error =
      new Error(
        'You do not have permission to amend Special Transport enquiries'
      );

    error.statusCode = 403;
    throw error;
  }

  const request =
    getChristmasTransportEnquiry(
      requestId
    );

  if (!request) {
    const error =
      new Error(
        'Christmas transport request not found'
      );

    error.statusCode = 404;
    throw error;
  }

  const changeableStatuses = [
    'submitted',
    'needs_information',
    'ready_for_planning'
  ];

  if (
    !changeableStatuses.includes(
      request.status
    )
  ) {
    const error =
      new Error(
        'This transport request can no longer be amended'
      );

    error.statusCode = 409;
    throw error;
  }

  const passengerName =
    String(
      payload.passengerName ?? ''
    ).trim();

  const passengerMobile =
    String(
      payload.passengerMobile ?? ''
    ).trim();

  const passengerEmail =
    String(
      payload.passengerEmail ?? ''
    ).trim() || null;

  const direction =
    String(
      payload.direction ?? ''
    ).trim();

  const shiftTime =
    normaliseOptionalDateTime(
      payload.shiftTime,
      'Shift time'
    );

  const resolvedWindow =
    resolveTransportRequestWindowForShift(
      request.programmeWindowId,
      shiftTime
    );

  const resolvedProgrammeWindowId =
    Number(
      resolvedWindow.id
    );


  const pickupAddress =
    String(
      payload.pickupAddress ?? ''
    ).trim();

  const pickupPostcode =
    String(
      payload.pickupPostcode ?? ''
    ).trim() || null;

  const destinationAddress =
    String(
      payload.destinationAddress ?? ''
    ).trim();

  const destinationPostcode =
    String(
      payload.destinationPostcode ?? ''
    ).trim() || null;

  const passengerNotes =
    String(
      payload.passengerNotes ?? ''
    ).trim() || null;

  if (
    !passengerName ||
    !passengerMobile ||
    !shiftTime ||
    !pickupAddress ||
    !destinationAddress
  ) {
    const error =
      new Error(
        'Passenger name, mobile, shift time, pickup and destination are required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    ![
      'to_work',
      'from_work'
    ].includes(
      direction
    )
  ) {
    const error =
      new Error(
        'Invalid transport direction'
      );

    error.statusCode = 400;
    throw error;
  }

  const changes = [];

  function recordChange(
    label,
    oldValue,
    newValue
  ) {
    if (
      String(oldValue ?? '') !==
      String(newValue ?? '')
    ) {
      changes.push(label);
    }
  }

  recordChange(
    'passenger name',
    request.passengerName,
    passengerName
  );

  recordChange(
    'mobile',
    request.passengerMobile,
    passengerMobile
  );

  recordChange(
    'email',
    request.passengerEmail,
    passengerEmail
  );

  recordChange(
    'direction',
    request.direction,
    direction
  );

  recordChange(
    'shift time',
    request.shiftTime,
    shiftTime
  );

  recordChange(
    'service window',
    request.programmeWindowId,
    resolvedProgrammeWindowId
  );

  recordChange(
    'pickup address',
    request.pickupAddress,
    pickupAddress
  );

  recordChange(
    'pickup postcode',
    request.pickupPostcode,
    pickupPostcode
  );

  recordChange(
    'destination address',
    request.destinationAddress,
    destinationAddress
  );

  recordChange(
    'destination postcode',
    request.destinationPostcode,
    destinationPostcode
  );

  recordChange(
    'passenger notes',
    request.passengerNotes,
    passengerNotes
  );

  if (!changes.length) {
    const error =
      new Error(
        'No changes to save'
      );

    error.statusCode = 400;
    throw error;
  }

  const pickupChanged =
    pickupAddress !==
      request.pickupAddress ||
    pickupPostcode !==
      request.pickupPostcode;

  const destinationChanged =
    destinationAddress !==
      request.destinationAddress ||
    destinationPostcode !==
      request.destinationPostcode;

  const oldValue = {
    programmeWindowId:
      request.programmeWindowId,
    passengerName:
      request.passengerName,
    passengerMobile:
      request.passengerMobile,
    passengerEmail:
      request.passengerEmail,
    direction:
      request.direction,
    shiftTime:
      request.shiftTime,
    pickupAddress:
      request.pickupAddress,
    pickupPostcode:
      request.pickupPostcode,
    destinationAddress:
      request.destinationAddress,
    destinationPostcode:
      request.destinationPostcode,
    passengerNotes:
      request.passengerNotes
  };

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE transport_requests
      SET
        programme_window_id = ?,
        passenger_name = ?,
        passenger_mobile = ?,
        passenger_email = ?,
        direction = ?,
        shift_time = ?,
        pickup_address = ?,
        pickup_postcode = ?,
        pickup_latitude = ?,
        pickup_longitude = ?,
        destination_address = ?,
        destination_postcode = ?,
        destination_latitude = ?,
        destination_longitude = ?,
        passenger_notes = ?,
        updated_at =
          CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      resolvedProgrammeWindowId,
      passengerName,
      passengerMobile,
      passengerEmail,
      direction,
      shiftTime,
      pickupAddress,
      pickupPostcode,
      pickupChanged
        ? null
        : request.pickupLatitude,
      pickupChanged
        ? null
        : request.pickupLongitude,
      destinationAddress,
      destinationPostcode,
      destinationChanged
        ? null
        : request.destinationLatitude,
      destinationChanged
        ? null
        : request.destinationLongitude,
      passengerNotes,
      requestId
    );

    db.prepare(`
      INSERT INTO transport_request_events
      (
        transport_request_id,
        event_type,
        actor_user_id,
        old_status,
        new_status,
        notes
      )
      VALUES (
        ?,
        'amended',
        ?,
        ?,
        ?,
        ?
      )
    `).run(
      requestId,
      authUser.id,
      request.status,
      request.status,
      `Amended: ${changes.join(', ')}`
    );

    const updated =
      getTransportRequestById(
        requestId
      );

    writeAudit({
      action:
        'UPDATE',

      entityType:
        'transport_request',

      entityId:
        requestId,

      fieldName:
        'request_details',

      oldValue:
        JSON.stringify(
          oldValue
        ),

      newValue:
        JSON.stringify({
          programmeWindowId:
            updated.programmeWindowId,
          passengerName:
            updated.passengerName,
          passengerMobile:
            updated.passengerMobile,
          passengerEmail:
            updated.passengerEmail,
          direction:
            updated.direction,
          shiftTime:
            updated.shiftTime,
          pickupAddress:
            updated.pickupAddress,
          pickupPostcode:
            updated.pickupPostcode,
          destinationAddress:
            updated.destinationAddress,
          destinationPostcode:
            updated.destinationPostcode,
          passengerNotes:
            updated.passengerNotes
        }),

      source:
        'special_transport_enquiries',

      actorUserId:
        authUser.id
    });

    db.exec('COMMIT');

    return getChristmasTransportEnquiry(
      requestId
    );
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function getChristmasTransportEnquiry(
  requestId
) {
  const request =
    getTransportRequestById(
      requestId
    );

  if (
    !request ||
    String(
      request.programmeCode || ''
    ).trim() === ''
  ) {
    return null;
  }

  const programme =
    db.prepare(`
      SELECT
        autocab_account_type
          AS autocabAccountType
      FROM transport_programmes
      WHERE id = ?
    `).get(
      request.programmeId
    );

  if (
    programme?.autocabAccountType !==
      'xmas_staff'
  ) {
    return null;
  }

  return {
    ...request,
    events:
      listTransportRequestEvents(
        request.id
      )
  };
}


function transportOperationsPostcodeArea(
  postcode
) {
  const normalised =
    String(
      postcode || ''
    )
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ');

  if (!normalised) {
    return 'Unknown';
  }

  return (
    normalised.split(' ')[0] ||
    'Unknown'
  );
}


function transportOperationsShiftParts(
  shiftTime
) {
  const value =
    String(
      shiftTime || ''
    ).trim();

  const match =
    value.match(
      /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/
    );

  if (!match) {
    return {
      valid: false,
      date: 'Unknown',
      day: 'Unknown',
      hour: 'Unknown'
    };
  }

  const [
    ,
    year,
    month,
    dayOfMonth,
    hour
  ] = match;

  const date =
    `${year}-${month}-${dayOfMonth}`;

  const dateValue =
    new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(dayOfMonth)
      )
    );

  if (
    Number.isNaN(
      dateValue.getTime()
    )
  ) {
    return {
      valid: false,
      date: 'Unknown',
      day: 'Unknown',
      hour: 'Unknown'
    };
  }

  const dayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  ];

  return {
    valid: true,
    date,
    day:
      dayNames[
        dateValue.getUTCDay()
      ],
    hour:
      `${hour}:00`
  };
}


function getTransportOperationsOverview() {
  /*
    Stage 1 operational overview.

    Intentionally local-data only:
    - no Autocab calls
    - no booking creation
    - no transport-request updates
    - no schema changes
  */
  const sourceRequests =
    listAllTransportRequests();

  const statusMap = new Map();
  const dayMap = new Map();
  const hourMap = new Map();
  const directionMap = new Map();
  const pickupAreaMap = new Map();
  const destinationAreaMap = new Map();

  let totalPassengers = 0;
  let activeCount = 0;
  let cancelledCount = 0;

  function addCount(
    map,
    key,
    passengers,
    extra = {}
  ) {
    const current =
      map.get(key) || {
        ...extra,
        requests: 0,
        passengers: 0
      };

    current.requests += 1;
    current.passengers += passengers;

    map.set(
      key,
      current
    );
  }

  const requests =
    sourceRequests.map(
      (request) => {
        const passengerCount =
          Math.max(
            0,
            Number(
              request.passengerCount ||
              0
            ) || 0
          );

        totalPassengers +=
          passengerCount;

        const status =
          String(
            request.status || ''
          ).trim() ||
          'unknown';

        if (
          status === 'cancelled'
        ) {
          cancelledCount += 1;
        } else if (
          status !== 'completed'
        ) {
          activeCount += 1;
        }

        const shift =
          transportOperationsShiftParts(
            request.shiftTime
          );

        const pickupArea =
          transportOperationsPostcodeArea(
            request.pickupPostcode
          );

        const destinationArea =
          transportOperationsPostcodeArea(
            request.destinationPostcode
          );

        const direction =
          String(
            request.direction || ''
          ).trim() ||
          'Unknown';

        addCount(
          statusMap,
          status,
          passengerCount,
          {
            status
          }
        );

        addCount(
          dayMap,
          shift.date,
          passengerCount,
          {
            date: shift.date,
            day: shift.day
          }
        );

        addCount(
          hourMap,
          shift.hour,
          passengerCount,
          {
            hour: shift.hour
          }
        );

        addCount(
          directionMap,
          direction,
          passengerCount,
          {
            direction
          }
        );

        addCount(
          pickupAreaMap,
          pickupArea,
          passengerCount,
          {
            area: pickupArea
          }
        );

        addCount(
          destinationAreaMap,
          destinationArea,
          passengerCount,
          {
            area:
              destinationArea
          }
        );

        const attentionReasons = [];

        if (
          status ===
          'needs_information'
        ) {
          attentionReasons.push(
            'Needs information'
          );
        }

        if (
          !String(
            request.pickupPostcode ||
            ''
          ).trim()
        ) {
          attentionReasons.push(
            'Missing pickup postcode'
          );
        }

        if (
          !String(
            request.destinationPostcode ||
            ''
          ).trim()
        ) {
          attentionReasons.push(
            'Missing destination postcode'
          );
        }

        if (!shift.valid) {
          attentionReasons.push(
            'Missing or invalid shift time'
          );
        }

        const operationalFlags = [];

        if (
          passengerCount > 1
        ) {
          operationalFlags.push(
            `${passengerCount} passengers`
          );
        }

        return {
          ...request,

          passengerCount,

          shiftDate:
            shift.date,

          shiftDay:
            shift.day,

          shiftHour:
            shift.hour,

          pickupArea,

          destinationArea,

          needsAttention:
            attentionReasons.length > 0,

          attentionReasons,

          operationalFlags
        };
      }
    );

  const attention =
    requests.filter(
      (request) =>
        request.needsAttention
    );

  const status =
    Array.from(
      statusMap.values()
    ).sort(
      (a, b) =>
        b.requests -
        a.requests ||
        String(a.status)
          .localeCompare(
            String(b.status)
          )
    );

  const days =
    Array.from(
      dayMap.values()
    ).sort(
      (a, b) => {
        if (
          a.date === 'Unknown'
        ) {
          return 1;
        }

        if (
          b.date === 'Unknown'
        ) {
          return -1;
        }

        return String(
          a.date
        ).localeCompare(
          String(b.date)
        );
      }
    );

  const hours =
    Array.from(
      hourMap.values()
    ).sort(
      (a, b) => {
        if (
          a.hour === 'Unknown'
        ) {
          return 1;
        }

        if (
          b.hour === 'Unknown'
        ) {
          return -1;
        }

        return String(
          a.hour
        ).localeCompare(
          String(b.hour)
        );
      }
    );

  const directions =
    Array.from(
      directionMap.values()
    ).sort(
      (a, b) =>
        b.requests -
        a.requests ||
        String(a.direction)
          .localeCompare(
            String(b.direction)
          )
    );

  const pickupAreas =
    Array.from(
      pickupAreaMap.values()
    ).sort(
      (a, b) =>
        b.requests -
        a.requests ||
        String(a.area)
          .localeCompare(
            String(b.area)
          )
    );

  const destinationAreas =
    Array.from(
      destinationAreaMap.values()
    ).sort(
      (a, b) =>
        b.requests -
        a.requests ||
        String(a.area)
          .localeCompare(
            String(b.area)
          )
    );

  return {
    summary: {
      totalRequests:
        requests.length,

      totalPassengers,

      attentionCount:
        attention.length,

      activeCount,

      cancelledCount
    },

    status,
    days,
    hours,
    directions,
    pickupAreas,
    destinationAreas,
    attention,
    requests
  };
}




function getTransportPlanningCandidates() {
  const overview =
    getTransportOperationsOverview();

  const serviceWindows =
    db.prepare(`
      SELECT
        w.id,
        w.programme_id AS programmeId,
        p.code AS programmeCode,
        p.name AS programmeName,
        w.name,
        w.starts_at AS startsAt,
        w.ends_at AS endsAt,
        w.display_order AS displayOrder,
        w.is_active AS isActive
      FROM transport_programme_windows w
      JOIN transport_programmes p
        ON p.id = w.programme_id
      WHERE w.is_active = 1
      ORDER BY
        p.id,
        w.display_order,
        w.id
    `).all().map(
      window => {
        const capacity =
          listTransportProgrammeCapacity(
            window.id
          );

        const hasUnlimitedCapacity =
          capacity.some(
            row =>
              Number(
                row.isUnlimited
              ) === 1
          );

        const finiteSeatCapacity =
          capacity.reduce(
            (total, row) => {
              if (
                Number(
                  row.isUnlimited
                ) === 1
              ) {
                return total;
              }

              return (
                total +
                Number(
                  row.seatCapacity || 0
                ) *
                  Number(
                    row.quantity || 0
                  )
              );
            },
            0
          );

        return {
          ...window,

          capacityConfigured:
            capacity.length > 0,

          hasUnlimitedCapacity,

          finiteSeatCapacity,

          capacity
        };
      }
    );

  const ready =
    overview.requests.filter(
      request =>
        request.status ===
          'ready_for_planning'
    );

  const groups =
    new Map();

  for (const request of ready) {
    const windowId =
      Number(
        request.programmeWindowId
      );

    const key = [
      windowId,
      request.shiftDate,
      request.shiftHour,
      request.direction
    ].join('|');

    let group =
      groups.get(key);

    if (!group) {
      const capacity =
        listTransportProgrammeCapacity(
          windowId
        );

      const finiteSeatCapacity =
        capacity.reduce(
          (total, row) => {
            if (
              Number(
                row.isUnlimited
              )
            ) {
              return total;
            }

            return (
              total +
              Number(
                row.seatCapacity || 0
              ) *
                Number(
                  row.quantity || 0
                )
            );
          },
          0
        );

      group = {
        key,
        programmeWindowId:
          windowId,
        programmeWindowName:
          request.programmeWindowName,
        programmeId:
          request.programmeId,
        programmeCode:
          request.programmeCode,
        programmeName:
          request.programmeName,

        shiftDate:
          request.shiftDate,
        shiftDay:
          request.shiftDay,
        shiftHour:
          request.shiftHour,
        direction:
          request.direction,

        requestCount: 0,
        passengerCount: 0,

        pickupAreas: {},
        destinationAreas: {},

        capacityConfigured:
          capacity.length > 0,

        hasUnlimitedCapacity:
          capacity.some(
            row =>
              Number(
                row.isUnlimited
              ) === 1
          ),

        finiteSeatCapacity,

        capacityStatus:
          capacity.length === 0
            ? 'not_configured'
            : capacity.some(
                row =>
                  Number(
                    row.isUnlimited
                  ) === 1
              )
            ? 'unlimited'
            : finiteSeatCapacity >=
                Number(
                  request.passengerCount ||
                  0
                )
            ? 'available'
            : 'shortfall',

        capacityShortfall: 0,
        capacitySurplus: 0,

        capacity,

        requests: []
      };

      groups.set(
        key,
        group
      );
    }

    group.requestCount += 1;

    group.passengerCount +=
      Number(
        request.passengerCount ||
        0
      );

    group.pickupAreas[
      request.pickupArea
    ] =
      (
        group.pickupAreas[
          request.pickupArea
        ] || 0
      ) + 1;

    group.destinationAreas[
      request.destinationArea
    ] =
      (
        group.destinationAreas[
          request.destinationArea
        ] || 0
      ) + 1;

    group.requests.push(
      request
    );
  }

  for (const group of groups.values()) {
    if (!group.capacityConfigured) {
      group.capacityStatus =
        'not_configured';

      group.capacityShortfall = 0;
      group.capacitySurplus = 0;
      continue;
    }

    if (group.hasUnlimitedCapacity) {
      group.capacityStatus =
        'unlimited';

      group.capacityShortfall = 0;
      group.capacitySurplus = 0;
      continue;
    }

    const difference =
      Number(
        group.finiteSeatCapacity || 0
      ) -
      Number(
        group.passengerCount || 0
      );

    if (difference >= 0) {
      group.capacityStatus =
        'available';

      group.capacitySurplus =
        difference;

      group.capacityShortfall = 0;
    } else {
      group.capacityStatus =
        'shortfall';

      group.capacitySurplus = 0;

      group.capacityShortfall =
        Math.abs(
          difference
        );
    }
  }

  const result =
    Array.from(
      groups.values()
    ).sort(
      (a, b) =>
        String(
          a.shiftDate
        ).localeCompare(
          String(
            b.shiftDate
          )
        ) ||
        String(
          a.shiftHour
        ).localeCompare(
          String(
            b.shiftHour
          )
        ) ||
        String(
          a.direction
        ).localeCompare(
          String(
            b.direction
          )
        )
    );

  return {
    summary: {
      readyRequests:
        ready.length,

      readyPassengers:
        ready.reduce(
          (total, request) =>
            total +
            Number(
              request.passengerCount ||
              0
            ),
          0
        ),

      planningGroups:
        result.length,

      groupsWithCapacity:
        result.filter(
          group =>
            group.capacityConfigured
        ).length,

      groupsWithoutCapacity:
        result.filter(
          group =>
            !group.capacityConfigured
        ).length
    },

    serviceWindows,

    groups: result
  };
}


function listTransportRequestEvents(
  requestId
) {
  return db.prepare(`
    SELECT
      tre.id,

      tre.transport_request_id
        AS transportRequestId,

      tre.event_type
        AS eventType,

      tre.actor_user_id
        AS actorUserId,

      tre.actor_staff_identity_id
        AS actorStaffIdentityId,

      CASE
        WHEN actor.id IS NOT NULL
        THEN
          actor.first_name || ' ' ||
          actor.last_name

        WHEN staff_actor.id IS NOT NULL
        THEN
          staff_actor.first_name || ' ' ||
          staff_actor.last_name

        ELSE NULL
      END
        AS actorName,

      tre.old_status
        AS oldStatus,

      tre.new_status
        AS newStatus,

      tre.notes,

      tre.created_at
        AS createdAt

    FROM transport_request_events tre

    LEFT JOIN users actor
      ON actor.id =
        tre.actor_user_id

    LEFT JOIN transport_staff_identities
      staff_actor
      ON staff_actor.id =
        tre.actor_staff_identity_id

    WHERE tre.transport_request_id = ?

    ORDER BY
      datetime(tre.created_at),
      tre.id
  `).all(requestId);
}


function getTransportRequestForUser(
  requestId,
  authUser
) {
  const request =
    getTransportRequestById(
      requestId
    );

  if (!request) {
    const error =
      new Error(
        'Transport request not found'
      );

    error.statusCode = 404;
    throw error;
  }

  if (
    !userCanViewAllTransportRequests(
      authUser
    ) &&
    Number(
      request.requestedByUserId
    ) !== Number(
      authUser.id
    ) &&
    Number(
      request.enteredByUserId
    ) !== Number(
      authUser.id
    )
  ) {
    const error =
      new Error(
        'Transport request not found'
      );

    error.statusCode = 404;
    throw error;
  }

  const canViewInternal =
    userCanViewAllTransportRequests(
      authUser
    );

  const responseRequest = {
    ...request,

    events:
      listTransportRequestEvents(
        request.id
      )
  };

  if (!canViewInternal) {
    delete responseRequest.internalNotes;
  }

  return responseRequest;
}


function getTransportRequestWindowForSubmission(
  windowId
) {
  return db.prepare(`
    SELECT
      tpw.id,

      tpw.programme_id
        AS programmeId,

      tpw.name,

      tpw.starts_at
        AS startsAt,

      tpw.ends_at
        AS endsAt,

      tpw.is_active
        AS isActive,

      tp.status
        AS programmeStatus,

      tp.request_opens_at
        AS requestOpensAt,

      tp.request_closes_at
        AS requestClosesAt

    FROM transport_programme_windows tpw

    JOIN transport_programmes tp
      ON tp.id =
        tpw.programme_id

    WHERE tpw.id = ?
  `).get(windowId);
}



function resolveTransportRequestWindowForShift(
  anchorWindowId,
  shiftTime
) {
  const anchorWindow =
    getTransportRequestWindowForSubmission(
      anchorWindowId
    );

  if (!anchorWindow) {
    const error =
      new Error(
        'Transport programme not found'
      );

    error.statusCode = 404;
    throw error;
  }

  const resolved =
    db.prepare(`
      SELECT
        tpw.id,

        tpw.programme_id
          AS programmeId,

        tpw.name,

        tpw.starts_at
          AS startsAt,

        tpw.ends_at
          AS endsAt,

        tpw.is_active
          AS isActive,

        tp.status
          AS programmeStatus,

        tp.request_opens_at
          AS requestOpensAt,

        tp.request_closes_at
          AS requestClosesAt

      FROM transport_programme_windows tpw

      JOIN transport_programmes tp
        ON tp.id =
          tpw.programme_id

      WHERE tpw.programme_id = ?
        AND tpw.is_active = 1
        AND datetime(?) >=
          datetime(tpw.starts_at)
        AND datetime(?) <=
          datetime(tpw.ends_at)

      ORDER BY
        datetime(tpw.starts_at),
        tpw.id

      LIMIT 1
    `).get(
      Number(
        anchorWindow.programmeId
      ),
      shiftTime,
      shiftTime
    );

  if (!resolved) {
    const error =
      new Error(
        'Special Transport is not running at this time. Please choose a shift time within one of the available Christmas or New Year operating periods.'
      );

    error.statusCode = 409;
    throw error;
  }

  return resolved;
}


function reviewTransportRequest(
  requestId,
  payload,
  authUser
) {
  if (
    !userHasAnyRole(
      authUser,
      ['uhp_admin']
    )
  ) {
    const error =
      new Error(
        'You do not have permission to review transport requests'
      );

    error.statusCode = 403;
    throw error;
  }

  const request =
    getTransportRequestById(
      requestId
    );

  if (!request) {
    const error =
      new Error(
        'Transport request not found'
      );

    error.statusCode = 404;
    throw error;
  }

  const nextStatus =
    String(
      payload.status || ''
    ).trim();

  const allowedStatuses = [
    'needs_information',
    'ready_for_planning'
  ];

  if (
    !allowedStatuses.includes(
      nextStatus
    )
  ) {
    const error =
      new Error(
        'Invalid review status'
      );

    error.statusCode = 400;
    throw error;
  }

  const reviewableStatuses = [
    'submitted',
    'needs_information',
    'ready_for_planning'
  ];

  if (
    !reviewableStatuses.includes(
      request.status
    )
  ) {
    const error =
      new Error(
        'This transport request can no longer be changed in UHP review'
      );

    error.statusCode = 409;
    throw error;
  }

  const internalNotes =
    payload.internalNotes ===
      undefined
      ? request.internalNotes
      : String(
          payload.internalNotes || ''
        ).trim() || null;

  const eventType =
    nextStatus ===
      'needs_information'
      ? 'needs_information'
      : 'details_checked';

  const eventNote =
    nextStatus ===
      'needs_information'
      ? 'More information needed'
      : 'Details checked';

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE transport_requests
      SET
        status = ?,
        internal_notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      nextStatus,
      internalNotes,
      requestId
    );

    db.prepare(`
      INSERT INTO transport_request_events
      (
        transport_request_id,
        event_type,
        actor_user_id,
        old_status,
        new_status,
        notes
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        ?
      )
    `).run(
      requestId,
      eventType,
      authUser.id,
      request.status,
      nextStatus,
      eventNote
    );

    const updated =
      getTransportRequestById(
        requestId
      );

    writeAudit({
      action: 'UPDATE',
      entityType:
        'transport_request',
      entityId:
        requestId,
      fieldName:
        'review',
      oldValue:
        JSON.stringify({
          status:
            request.status,
          internalNotes:
            request.internalNotes
        }),
      newValue:
        JSON.stringify({
          status:
            updated.status,
          internalNotes:
            updated.internalNotes
        }),
      source:
        'uhp_admin',
      actorUserId:
        authUser.id
    });

    db.exec('COMMIT');

    return {
      ...updated,

      events:
        listTransportRequestEvents(
          requestId
        )
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}



function userCanManageTransportRequest(
  request,
  authUser
) {
  if (
    userHasAnyRole(
      authUser,
      ['uhp_admin']
    )
  ) {
    return true;
  }

  return (
    Number(
      request.requestedByUserId
    ) === Number(
      authUser.id
    ) ||
    Number(
      request.enteredByUserId
    ) === Number(
      authUser.id
    )
  );
}


function assertTransportRequestCanBeChanged(
  request,
  authUser
) {
  if (
    !userCanManageTransportRequest(
      request,
      authUser
    )
  ) {
    const error =
      new Error(
        'Transport request not found'
      );

    error.statusCode = 404;
    throw error;
  }

  const changeableStatuses = [
    'submitted',
    'needs_information',
    'ready_for_planning'
  ];

  if (
    !changeableStatuses.includes(
      request.status
    )
  ) {
    const error =
      new Error(
        'This transport request can no longer be changed'
      );

    error.statusCode = 409;
    throw error;
  }
}


function amendTransportRequest(
  requestId,
  payload,
  authUser
) {
  const request =
    getTransportRequestById(
      requestId
    );

  if (!request) {
    const error =
      new Error(
        'Transport request not found'
      );

    error.statusCode = 404;
    throw error;
  }

  assertTransportRequestCanBeChanged(
    request,
    authUser
  );

  const passengerName =
    String(
      payload.passengerName ?? ''
    ).trim();

  const passengerMobile =
    String(
      payload.passengerMobile ?? ''
    ).trim();

  const passengerEmail =
    String(
      payload.passengerEmail ?? ''
    ).trim() || null;

  const direction =
    String(
      payload.direction ?? ''
    ).trim();

  const shiftTime =
    normaliseOptionalDateTime(
      payload.shiftTime,
      'Shift time'
    );

  const pickupAddress =
    String(
      payload.pickupAddress ?? ''
    ).trim();

  const pickupPostcode =
    String(
      payload.pickupPostcode ?? ''
    ).trim() || null;

  const destinationAddress =
    String(
      payload.destinationAddress ?? ''
    ).trim();

  const destinationPostcode =
    String(
      payload.destinationPostcode ?? ''
    ).trim() || null;

  const passengerNotes =
    String(
      payload.passengerNotes ?? ''
    ).trim() || null;

  if (
    !passengerName ||
    !passengerMobile ||
    !shiftTime ||
    !pickupAddress ||
    !destinationAddress
  ) {
    const error =
      new Error(
        'Passenger name, mobile, shift time, pickup and destination are required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    ![
      'to_work',
      'from_work'
    ].includes(
      direction
    )
  ) {
    const error =
      new Error(
        'Invalid transport direction'
      );

    error.statusCode = 400;
    throw error;
  }

  const pickupChanged =
    pickupAddress !==
      request.pickupAddress ||
    pickupPostcode !==
      request.pickupPostcode;

  const destinationChanged =
    destinationAddress !==
      request.destinationAddress ||
    destinationPostcode !==
      request.destinationPostcode;

  const pickupLatitude =
    pickupChanged
      ? null
      : request.pickupLatitude;

  const pickupLongitude =
    pickupChanged
      ? null
      : request.pickupLongitude;

  const destinationLatitude =
    destinationChanged
      ? null
      : request.destinationLatitude;

  const destinationLongitude =
    destinationChanged
      ? null
      : request.destinationLongitude;

  const oldValue = {
    passengerName:
      request.passengerName,
    passengerMobile:
      request.passengerMobile,
    passengerEmail:
      request.passengerEmail,
    direction:
      request.direction,
    shiftTime:
      request.shiftTime,
    pickupAddress:
      request.pickupAddress,
    pickupPostcode:
      request.pickupPostcode,
    destinationAddress:
      request.destinationAddress,
    destinationPostcode:
      request.destinationPostcode,
    passengerNotes:
      request.passengerNotes
  };

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE transport_requests

      SET
        passenger_name = ?,
        passenger_mobile = ?,
        passenger_email = ?,

        direction = ?,
        shift_time = ?,

        pickup_address = ?,
        pickup_postcode = ?,
        pickup_latitude = ?,
        pickup_longitude = ?,

        destination_address = ?,
        destination_postcode = ?,
        destination_latitude = ?,
        destination_longitude = ?,

        passenger_notes = ?,

        updated_at =
          CURRENT_TIMESTAMP

      WHERE id = ?
    `).run(
      passengerName,
      passengerMobile,
      passengerEmail,

      direction,
      shiftTime,

      pickupAddress,
      pickupPostcode,
      pickupLatitude,
      pickupLongitude,

      destinationAddress,
      destinationPostcode,
      destinationLatitude,
      destinationLongitude,

      passengerNotes,

      requestId
    );

    db.prepare(`
      INSERT INTO transport_request_events
      (
        transport_request_id,
        event_type,
        actor_user_id,
        old_status,
        new_status,
        notes
      )
      VALUES (
        ?,
        'amended',
        ?,
        ?,
        ?,
        'Transport request amended'
      )
    `).run(
      requestId,
      authUser.id,
      request.status,
      request.status
    );

    const updated =
      getTransportRequestById(
        requestId
      );

    writeAudit({
      action:
        'UPDATE',

      entityType:
        'transport_request',

      entityId:
        requestId,

      fieldName:
        'request_details',

      oldValue:
        JSON.stringify(
          oldValue
        ),

      newValue:
        JSON.stringify({
          passengerName:
            updated.passengerName,
          passengerMobile:
            updated.passengerMobile,
          passengerEmail:
            updated.passengerEmail,
          direction:
            updated.direction,
          shiftTime:
            updated.shiftTime,
          pickupAddress:
            updated.pickupAddress,
          pickupPostcode:
            updated.pickupPostcode,
          destinationAddress:
            updated.destinationAddress,
          destinationPostcode:
            updated.destinationPostcode,
          passengerNotes:
            updated.passengerNotes
        }),

      source:
        'transport_portal',

      actorUserId:
        authUser.id
    });

    db.exec('COMMIT');

    return getTransportRequestForUser(
      requestId,
      authUser
    );
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function cancelTransportRequest(
  requestId,
  authUser
) {
  const request =
    getTransportRequestById(
      requestId
    );

  if (!request) {
    const error =
      new Error(
        'Transport request not found'
      );

    error.statusCode = 404;
    throw error;
  }

  assertTransportRequestCanBeChanged(
    request,
    authUser
  );

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE transport_requests

      SET
        status = 'cancelled',
        cancelled_at =
          CURRENT_TIMESTAMP,
        updated_at =
          CURRENT_TIMESTAMP

      WHERE id = ?
    `).run(
      requestId
    );

    db.prepare(`
      INSERT INTO transport_request_events
      (
        transport_request_id,
        event_type,
        actor_user_id,
        old_status,
        new_status,
        notes
      )
      VALUES (
        ?,
        'cancelled',
        ?,
        ?,
        'cancelled',
        'Transport request cancelled'
      )
    `).run(
      requestId,
      authUser.id,
      request.status
    );

    const updated =
      getTransportRequestById(
        requestId
      );

    writeAudit({
      action:
        'UPDATE',

      entityType:
        'transport_request',

      entityId:
        requestId,

      fieldName:
        'status',

      oldValue:
        JSON.stringify({
          status:
            request.status,
          cancelledAt:
            request.cancelledAt
        }),

      newValue:
        JSON.stringify({
          status:
            updated.status,
          cancelledAt:
            updated.cancelledAt
        }),

      source:
        'transport_portal',

      actorUserId:
        authUser.id
    });

    db.exec('COMMIT');

    return getTransportRequestForUser(
      requestId,
      authUser
    );
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function resolveTransportRequestCoding(
  payload,
  authUser
) {
  const budgetId =
    Number(
      payload.budgetId
    );

  const reasonCodeId =
    Number(
      payload.reasonCodeId
    );

  if (
    !Number.isInteger(budgetId) ||
    budgetId < 1
  ) {
    const error =
      new Error(
        'A valid UHP budget is required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    !Number.isInteger(reasonCodeId) ||
    reasonCodeId < 1
  ) {
    const error =
      new Error(
        'A valid reason code is required'
      );

    error.statusCode = 400;
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
          AS departmentName,
        b.status

      FROM budgets b

      LEFT JOIN departments d
        ON d.id = b.department_id

      WHERE b.id = ?
    `).get(
      budgetId
    );

  if (
    !budget ||
    budget.status !== 'active'
  ) {
    const error =
      new Error(
        'The selected UHP budget is not active'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    !Number.isInteger(
      Number(
        budget.departmentId
      )
    )
  ) {
    const error =
      new Error(
        'The selected UHP budget has no department'
      );

    error.statusCode = 409;
    throw error;
  }

  const isUhpAdmin =
    userHasRoleById(
      authUser.id,
      'uhp_admin'
    );

  if (!isUhpAdmin) {
    const permission =
      db.prepare(`
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
        authUser.id,
        budgetId
      );

    if (!permission) {
      const error =
        new Error(
          'You are not authorised to use the selected UHP budget'
        );

      error.statusCode = 403;
      throw error;
    }
  }

  const reasonCode =
    db.prepare(`
      SELECT
        id,
        code,
        description,
        status

      FROM reason_codes

      WHERE id = ?
    `).get(
      reasonCodeId
    );

  if (
    !reasonCode ||
    reasonCode.status !== 'active'
  ) {
    const error =
      new Error(
        'The selected reason code is not active'
      );

    error.statusCode = 400;
    throw error;
  }

  const budgetHolder =
    db.prepare(`
      SELECT
        u.id,
        u.first_name
          AS firstName,
        u.last_name
          AS lastName

      FROM budget_assignments ba

      JOIN users u
        ON u.id = ba.user_id
        AND u.status = 'active'

      WHERE ba.budget_id = ?
        AND ba.assignment_type =
          'primary_holder'
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
    `).get(
      budgetId
    );

  if (!budgetHolder) {
    const error =
      new Error(
        'The selected budget has no active primary budget holder'
      );

    error.statusCode = 409;
    throw error;
  }

  return {
    departmentId:
      Number(
        budget.departmentId
      ),

    departmentName:
      budget.departmentName,

    budgetId:
      Number(
        budget.id
      ),

    budgetNumber:
      budget.budgetNumber,

    budgetName:
      budget.name,

    reasonCodeId:
      Number(
        reasonCode.id
      ),

    reasonCode:
      reasonCode.code,

    reasonDescription:
      reasonCode.description,

    budgetHolderUserId:
      Number(
        budgetHolder.id
      ),

    budgetHolderName:
      `${budgetHolder.firstName} ${budgetHolder.lastName}`
  };
}


function getTransportRequestForStaffIdentity(
  requestId,
  staffIdentityId
) {
  const request =
    getTransportRequestById(
      requestId
    );

  if (
    !request ||
    Number(
      request.requestedByStaffIdentityId
    ) !== Number(
      staffIdentityId
    )
  ) {
    const error =
      new Error(
        'Transport request not found'
      );

    error.statusCode = 404;
    throw error;
  }

  const responseRequest = {
    ...request,

    events:
      listTransportRequestEvents(
        request.id
      )
  };

  delete responseRequest.internalNotes;

  return responseRequest;
}


function resolveStaffTransportRequestCoding(
  payload
) {
  const budgetId =
    Number(
      payload.budgetId
    );

  const reasonCodeId =
    Number(
      payload.reasonCodeId
    );

  if (
    !Number.isInteger(
      budgetId
    ) ||
    budgetId < 1
  ) {
    const error =
      new Error(
        'A valid budget number is required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    !Number.isInteger(
      reasonCodeId
    ) ||
    reasonCodeId < 1
  ) {
    const error =
      new Error(
        'A valid reason code is required'
      );

    error.statusCode = 400;
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
          AS departmentName,

        b.status

      FROM budgets b

      LEFT JOIN departments d
        ON d.id =
          b.department_id

      WHERE b.id = ?
      LIMIT 1
    `).get(
      budgetId
    );

  if (
    !budget ||
    budget.status !== 'active' ||
    !budget.departmentId
  ) {
    const error =
      new Error(
        'The selected UHP budget is not available'
      );

    error.statusCode = 400;
    throw error;
  }

  const reasonCode =
    db.prepare(`
      SELECT
        id,
        code,
        description,
        status

      FROM reason_codes

      WHERE id = ?
      LIMIT 1
    `).get(
      reasonCodeId
    );

  if (
    !reasonCode ||
    reasonCode.status !== 'active'
  ) {
    const error =
      new Error(
        'The selected reason code is not active'
      );

    error.statusCode = 400;
    throw error;
  }

  const budgetHolder =
    db.prepare(`
      SELECT
        u.id,

        u.first_name
          AS firstName,

        u.last_name
          AS lastName

      FROM budget_assignments ba

      JOIN users u
        ON u.id =
          ba.user_id
        AND u.status = 'active'

      WHERE ba.budget_id = ?

        AND ba.assignment_type =
          'primary_holder'

        AND ba.is_active = 1

        AND (
          ba.valid_from IS NULL
          OR ba.valid_from <=
            date('now')
        )

        AND (
          ba.valid_to IS NULL
          OR ba.valid_to >=
            date('now')
        )

      ORDER BY
        ba.id DESC

      LIMIT 1
    `).get(
      budgetId
    );

  if (!budgetHolder) {
    const error =
      new Error(
        'The selected budget has no active primary budget holder'
      );

    error.statusCode = 409;
    throw error;
  }

  return {
    departmentId:
      Number(
        budget.departmentId
      ),

    departmentName:
      budget.departmentName,

    budgetId:
      Number(
        budget.id
      ),

    budgetNumber:
      budget.budgetNumber,

    budgetName:
      budget.name,

    reasonCodeId:
      Number(
        reasonCode.id
      ),

    reasonCode:
      reasonCode.code,

    reasonDescription:
      reasonCode.description,

    budgetHolderUserId:
      Number(
        budgetHolder.id
      ),

    budgetHolderName:
      `${budgetHolder.firstName} ${budgetHolder.lastName}`
  };
}


function findStaffTransportDuplicate({
  staffIdentityId,
  programmeWindowId,
  direction
}) {
  return db.prepare(`
    SELECT
      id,
      status,
      shift_time
        AS shiftTime,

      submitted_at
        AS submittedAt

    FROM transport_requests

    WHERE
      requested_by_staff_identity_id = ?

      AND programme_window_id = ?

      AND direction = ?

      AND status NOT IN (
        'cancelled',
        'not_accommodated'
      )

    ORDER BY
      datetime(submitted_at) DESC,
      id DESC

    LIMIT 1
  `).get(
    Number(staffIdentityId),
    Number(programmeWindowId),
    direction
  );
}


function amendStaffTransportRequest(
  requestId,
  payload,
  staff
) {
  const request =
    getTransportRequestForStaffIdentity(
      requestId,
      staff.id
    );

  const amendableStatuses = [
    'submitted',
    'needs_information',
    'ready_for_planning'
  ];

  if (
    !amendableStatuses.includes(
      request.status
    )
  ) {
    const error =
      new Error(
        'This transport request can no longer be amended online'
      );

    error.statusCode = 409;
    throw error;
  }

  const direction =
    String(
      payload.direction ??
      request.direction ??
      ''
    ).trim();

  if (
    ![
      'to_work',
      'from_work'
    ].includes(direction)
  ) {
    const error =
      new Error(
        'Invalid transport direction'
      );

    error.statusCode = 400;
    throw error;
  }

  const shiftTime =
    normaliseOptionalDateTime(
      payload.shiftTime ??
        request.shiftTime,
      'Shift time'
    );

  const resolvedWindow =
    resolveTransportRequestWindowForShift(
      request.programmeWindowId,
      shiftTime
    );

  const resolvedProgrammeWindowId =
    Number(
      resolvedWindow.id
    );


  const pickupAddress =
    String(
      payload.pickupAddress ??
      request.pickupAddress ??
      ''
    ).trim();

  const pickupPostcode =
    String(
      payload.pickupPostcode ??
      request.pickupPostcode ??
      ''
    ).trim() || null;

  const destinationAddress =
    String(
      payload.destinationAddress ??
      request.destinationAddress ??
      ''
    ).trim();

  const destinationPostcode =
    String(
      payload.destinationPostcode ??
      request.destinationPostcode ??
      ''
    ).trim() || null;

  if (
    !shiftTime ||
    !pickupAddress ||
    !destinationAddress
  ) {
    const error =
      new Error(
        'Shift time, pickup and destination are required'
      );

    error.statusCode = 400;
    throw error;
  }

  const pickupLatitude =
    normaliseOptionalTransportCoordinate(
      payload.pickupLatitude ===
        undefined
        ? request.pickupLatitude
        : payload.pickupLatitude,
      'Pickup latitude'
    );

  const pickupLongitude =
    normaliseOptionalTransportCoordinate(
      payload.pickupLongitude ===
        undefined
        ? request.pickupLongitude
        : payload.pickupLongitude,
      'Pickup longitude'
    );

  const destinationLatitude =
    normaliseOptionalTransportCoordinate(
      payload.destinationLatitude ===
        undefined
        ? request.destinationLatitude
        : payload.destinationLatitude,
      'Destination latitude'
    );

  const destinationLongitude =
    normaliseOptionalTransportCoordinate(
      payload.destinationLongitude ===
        undefined
        ? request.destinationLongitude
        : payload.destinationLongitude,
      'Destination longitude'
    );

  if (
    (
      pickupLatitude === null
    ) !== (
      pickupLongitude === null
    )
  ) {
    const error =
      new Error(
        'Pickup latitude and longitude must be supplied together'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    (
      destinationLatitude === null
    ) !== (
      destinationLongitude === null
    )
  ) {
    const error =
      new Error(
        'Destination latitude and longitude must be supplied together'
      );

    error.statusCode = 400;
    throw error;
  }

  const passengerNotes =
    String(
      payload.passengerNotes ===
        undefined
        ? request.passengerNotes ||
          ''
        : payload.passengerNotes ||
          ''
    ).trim() || null;

  const conflictingRequest =
    db.prepare(`
      SELECT
        id

      FROM transport_requests

      WHERE requested_by_staff_identity_id = ?
        AND programme_window_id = ?
        AND direction = ?
        AND id <> ?
        AND status NOT IN (
          'cancelled',
          'not_accommodated'
        )

      ORDER BY
        id DESC

      LIMIT 1
    `).get(
      Number(staff.id),
      resolvedProgrammeWindowId,
      direction,
      Number(requestId)
    );

  if (conflictingRequest) {
    const error =
      new Error(
        'You already have an active transport request for this service and direction'
      );

    error.statusCode = 409;
    throw error;
  }


  const coding =
    (
      payload.budgetId !==
        undefined ||
      payload.reasonCodeId !==
        undefined
    )
      ? resolveStaffTransportRequestCoding({
          budgetId:
            payload.budgetId ??
            request.budgetId,

          reasonCodeId:
            payload.reasonCodeId ??
            request.reasonCodeId
        })
      : {
          departmentId:
            request.departmentId,

          budgetId:
            request.budgetId,

          reasonCodeId:
            request.reasonCodeId,

          budgetHolderUserId:
            request.budgetHolderUserId
        };

  const before =
    {
      programmeWindowId:
        request.programmeWindowId,

      direction:
        request.direction,

      shiftTime:
        request.shiftTime,

      pickupAddress:
        request.pickupAddress,

      pickupPostcode:
        request.pickupPostcode,

      pickupLatitude:
        request.pickupLatitude,

      pickupLongitude:
        request.pickupLongitude,

      destinationAddress:
        request.destinationAddress,

      destinationPostcode:
        request.destinationPostcode,

      destinationLatitude:
        request.destinationLatitude,

      destinationLongitude:
        request.destinationLongitude,

      passengerNotes:
        request.passengerNotes,

      departmentId:
        request.departmentId,

      budgetId:
        request.budgetId,

      reasonCodeId:
        request.reasonCodeId,

      budgetHolderUserId:
        request.budgetHolderUserId
    };

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE transport_requests
      SET
        programme_window_id = ?,
        direction = ?,
        shift_time = ?,

        pickup_address = ?,
        pickup_postcode = ?,
        pickup_latitude = ?,
        pickup_longitude = ?,

        destination_address = ?,
        destination_postcode = ?,
        destination_latitude = ?,
        destination_longitude = ?,

        passenger_notes = ?,

        department_id = ?,
        budget_id = ?,
        reason_code_id = ?,
        budget_holder_user_id = ?,

        updated_at =
          CURRENT_TIMESTAMP

      WHERE id = ?
    `).run(
      resolvedProgrammeWindowId,
      direction,
      shiftTime,

      pickupAddress,
      pickupPostcode,
      pickupLatitude,
      pickupLongitude,

      destinationAddress,
      destinationPostcode,
      destinationLatitude,
      destinationLongitude,

      passengerNotes,

      coding.departmentId,
      coding.budgetId,
      coding.reasonCodeId,
      coding.budgetHolderUserId,

      requestId
    );

    db.prepare(`
      INSERT INTO transport_request_events
      (
        transport_request_id,
        event_type,
        actor_user_id,
        actor_staff_identity_id,
        old_status,
        new_status,
        notes
      )
      VALUES (
        ?,
        'amended',
        NULL,
        ?,
        ?,
        ?,
        ?
      )
    `).run(
      requestId,
      staff.id,
      request.status,
      request.status,
      Number(request.programmeWindowId) !==
        resolvedProgrammeWindowId
        ? 'Transport request amended by staff member; service window changed automatically'
        : 'Transport request amended by staff member'
    );

    const updated =
      getTransportRequestById(
        requestId
      );

    writeAudit({
      action:
        'UPDATE',

      entityType:
        'transport_request',

      entityId:
        requestId,

      fieldName:
        'staff_amendment',

      oldValue:
        JSON.stringify(
          before
        ),

      newValue:
        JSON.stringify({
          programmeWindowId:
            updated.programmeWindowId,

          direction:
            updated.direction,

          shiftTime:
            updated.shiftTime,

          pickupAddress:
            updated.pickupAddress,

          pickupPostcode:
            updated.pickupPostcode,

          pickupLatitude:
            updated.pickupLatitude,

          pickupLongitude:
            updated.pickupLongitude,

          destinationAddress:
            updated.destinationAddress,

          destinationPostcode:
            updated.destinationPostcode,

          destinationLatitude:
            updated.destinationLatitude,

          destinationLongitude:
            updated.destinationLongitude,

          passengerNotes:
            updated.passengerNotes,

          departmentId:
            updated.departmentId,

          budgetId:
            updated.budgetId,

          reasonCodeId:
            updated.reasonCodeId,

          budgetHolderUserId:
            updated.budgetHolderUserId
        }),

      source:
        'staff_self_service',

      actorUserId:
        null,

      actorStaffIdentityId:
        staff.id
    });

    db.exec('COMMIT');

    return getTransportRequestForStaffIdentity(
      requestId,
      staff.id
    );
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function cancelStaffTransportRequest(
  requestId,
  staff
) {
  const request =
    getTransportRequestForStaffIdentity(
      requestId,
      staff.id
    );

  const cancellableStatuses = [
    'submitted',
    'needs_information',
    'ready_for_planning',
    'planned',
    'awaiting_confirmation',
    'confirmed'
  ];

  if (
    !cancellableStatuses.includes(
      request.status
    )
  ) {
    const error =
      new Error(
        'This transport request can no longer be cancelled online'
      );

    error.statusCode = 409;
    throw error;
  }

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE transport_requests
      SET
        status =
          'cancelled',

        cancelled_at =
          COALESCE(
            cancelled_at,
            CURRENT_TIMESTAMP
          ),

        updated_at =
          CURRENT_TIMESTAMP

      WHERE id = ?
    `).run(
      requestId
    );

    db.prepare(`
      INSERT INTO transport_request_events
      (
        transport_request_id,
        event_type,
        actor_user_id,
        actor_staff_identity_id,
        old_status,
        new_status,
        notes
      )
      VALUES (
        ?,
        'cancelled',
        NULL,
        ?,
        ?,
        'cancelled',
        'Transport request cancelled by staff member'
      )
    `).run(
      requestId,
      staff.id,
      request.status
    );

    writeAudit({
      action:
        'UPDATE',

      entityType:
        'transport_request',

      entityId:
        requestId,

      fieldName:
        'status',

      oldValue:
        request.status,

      newValue:
        'cancelled',

      source:
        'staff_self_service',

      actorUserId:
        null,

      actorStaffIdentityId:
        staff.id
    });

    db.exec('COMMIT');

    return getTransportRequestForStaffIdentity(
      requestId,
      staff.id
    );
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function createStaffTransportRequest(
  payload,
  staff
) {
  if (
    !staff ||
    staff.status !== 'active' ||
    !staff.emailVerifiedAt ||
    !staff.mobileVerifiedAt
  ) {
    const error =
      new Error(
        'Complete staff transport verification first'
      );

    error.statusCode = 403;
    throw error;
  }

  const programmeWindowId =
    Number(
      payload.programmeWindowId
    );

  if (
    !Number.isInteger(
      programmeWindowId
    ) ||
    programmeWindowId < 1
  ) {
    const error =
      new Error(
        'A valid service window is required'
      );

    error.statusCode = 400;
    throw error;
  }

  const window =
    getTransportRequestWindowForSubmission(
      programmeWindowId
    );

  if (!window) {
    const error =
      new Error(
        'Service window not found'
      );

    error.statusCode = 404;
    throw error;
  }

  if (
    !hasStaffTransportProgrammeAccess(
      staff.id,
      window.programmeId
    )
  ) {
    const error =
      new Error(
        'You do not have access to this staff transport programme'
      );

    error.statusCode = 403;
    throw error;
  }

  if (
    Number(window.isActive) !== 1
  ) {
    const error =
      new Error(
        'This service window is not available for requests'
      );

    error.statusCode = 409;
    throw error;
  }

  if (
    window.programmeStatus !==
      'open'
  ) {
    const error =
      new Error(
        'This transport programme is not accepting requests'
      );

    error.statusCode = 409;
    throw error;
  }

  const now =
    new Date();

  if (
    window.requestOpensAt &&
    now <
      new Date(
        window.requestOpensAt
      )
  ) {
    const error =
      new Error(
        'Requests for this transport programme are not open yet'
      );

    error.statusCode = 409;
    throw error;
  }

  if (
    window.requestClosesAt &&
    now >
      new Date(
        window.requestClosesAt
      )
  ) {
    const error =
      new Error(
        'Requests for this transport programme are closed'
      );

    error.statusCode = 409;
    throw error;
  }

  const direction =
    String(
      payload.direction || ''
    ).trim();

  if (
    ![
      'to_work',
      'from_work'
    ].includes(
      direction
    )
  ) {
    const error =
      new Error(
        'Invalid transport direction'
      );

    error.statusCode = 400;
    throw error;
  }

  const resolvedShiftTime =
    normaliseOptionalDateTime(
      payload.shiftTime,
      'Shift time'
    );

  if (!resolvedShiftTime) {
    const error =
      new Error(
        'Shift time is required'
      );

    error.statusCode = 400;
    throw error;
  }

  const resolvedWindow =
    resolveTransportRequestWindowForShift(
      programmeWindowId,
      resolvedShiftTime
    );

  const resolvedProgrammeWindowId =
    Number(
      resolvedWindow.id
    );


  /*
    Hard duplicate block for self-service.

    A verified staff identity can have one live request
    per service window / direction.

    Cancelled or explicitly unaccommodated requests do
    not block a fresh submission.
  */
  const duplicate =
    findStaffTransportDuplicate({
      staffIdentityId:
        staff.id,
      programmeWindowId:
        resolvedProgrammeWindowId,
      direction
    });

  if (duplicate) {
    const error =
      new Error(
        'You already have an active transport request for this service and direction'
      );

    error.statusCode = 409;
    throw error;
  }

  const coding =
    resolveStaffTransportRequestCoding(
      payload
    );

  const passengerName =
    [
      staff.firstName,
      staff.lastName
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

  const passengerMobile =
    String(
      staff.mobile || ''
    ).trim();

  const passengerEmail =
    String(
      staff.email || ''
    ).trim();

  if (
    !passengerName ||
    !passengerMobile ||
    !passengerEmail
  ) {
    const error =
      new Error(
        'Verified staff identity details are incomplete'
      );

    error.statusCode = 403;
    throw error;
  }

  const shiftTime =
    normaliseOptionalDateTime(
      payload.shiftTime,
      'Shift time'
    );

  const pickupAddress =
    String(
      payload.pickupAddress || ''
    ).trim();

  const pickupPostcode =
    String(
      payload.pickupPostcode || ''
    ).trim() || null;

  const destinationAddress =
    String(
      payload.destinationAddress || ''
    ).trim();

  const destinationPostcode =
    String(
      payload.destinationPostcode || ''
    ).trim() || null;

  if (
    !shiftTime ||
    !pickupAddress ||
    !destinationAddress
  ) {
    const error =
      new Error(
        'Shift time, pickup and destination are required'
      );

    error.statusCode = 400;
    throw error;
  }

  const pickupLatitude =
    normaliseOptionalTransportCoordinate(
      payload.pickupLatitude,
      'Pickup latitude'
    );

  const pickupLongitude =
    normaliseOptionalTransportCoordinate(
      payload.pickupLongitude,
      'Pickup longitude'
    );

  const destinationLatitude =
    normaliseOptionalTransportCoordinate(
      payload.destinationLatitude,
      'Destination latitude'
    );

  const destinationLongitude =
    normaliseOptionalTransportCoordinate(
      payload.destinationLongitude,
      'Destination longitude'
    );

  if (
    (
      pickupLatitude === null
    ) !== (
      pickupLongitude === null
    )
  ) {
    const error =
      new Error(
        'Pickup latitude and longitude must be supplied together'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    (
      destinationLatitude === null
    ) !== (
      destinationLongitude === null
    )
  ) {
    const error =
      new Error(
        'Destination latitude and longitude must be supplied together'
      );

    error.statusCode = 400;
    throw error;
  }

  const passengerNotes =
    String(
      payload.passengerNotes || ''
    ).trim() || null;

  db.exec('BEGIN');

  try {
    const result =
      db.prepare(`
        INSERT INTO transport_requests
        (
          programme_window_id,

          requested_by_user_id,
          requested_by_staff_identity_id,
          entered_by_user_id,
          source,

          passenger_name,
          passenger_mobile,
          passenger_email,

          direction,
          shift_time,

          pickup_address,
          pickup_postcode,
          pickup_latitude,
          pickup_longitude,

          destination_address,
          destination_postcode,
          destination_latitude,
          destination_longitude,

          passenger_count,

          accessibility_notes,
          passenger_notes,

          department_id,
          budget_id,
          reason_code_id,
          budget_holder_user_id,

          status
        )
        VALUES (
          ?,

          NULL,
          ?,
          NULL,
          'staff_self_service',

          ?, ?, ?,

          ?, ?,

          ?, ?, ?, ?,

          ?, ?, ?, ?,

          1,

          NULL,
          ?,

          ?, ?, ?, ?,

          'submitted'
        )
      `).run(
        resolvedProgrammeWindowId,

        staff.id,

        passengerName,
        passengerMobile,
        passengerEmail,

        direction,
        shiftTime,

        pickupAddress,
        pickupPostcode,
        pickupLatitude,
        pickupLongitude,

        destinationAddress,
        destinationPostcode,
        destinationLatitude,
        destinationLongitude,

        passengerNotes,

        coding.departmentId,
        coding.budgetId,
        coding.reasonCodeId,
        coding.budgetHolderUserId
      );

    const requestId =
      Number(
        result.lastInsertRowid
      );

    db.prepare(`
      INSERT INTO transport_request_events
      (
        transport_request_id,
        event_type,
        actor_user_id,
        actor_staff_identity_id,
        old_status,
        new_status,
        notes
      )
      VALUES (
        ?,
        'submitted',
        NULL,
        ?,
        NULL,
        'submitted',
        'Transport request submitted'
      )
    `).run(
      requestId,
      staff.id
    );

    writeAudit({
      action:
        'CREATE',

      entityType:
        'transport_request',

      entityId:
        requestId,

      newValue:
        JSON.stringify({
          programmeWindowId:
            resolvedProgrammeWindowId,

          requestedByStaffIdentityId:
            staff.id,

          source:
            'staff_self_service',

          passengerName,

          direction,
          shiftTime,

          departmentId:
            coding.departmentId,

          budgetId:
            coding.budgetId,

          reasonCodeId:
            coding.reasonCodeId,

          budgetHolderUserId:
            coding.budgetHolderUserId,

          status:
            'submitted'
        }),

      source:
        'staff_self_service',

      actorUserId:
        null,

      actorStaffIdentityId:
        staff.id
    });

    db.exec('COMMIT');

    return getTransportRequestForStaffIdentity(
      requestId,
      staff.id
    );
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function createTransportRequest(
  payload,
  authUser
) {
  if (
    !userCanSubmitTransportRequest(
      authUser
    )
  ) {
    const error =
      new Error(
        'You do not have permission to submit transport requests'
      );

    error.statusCode = 403;
    throw error;
  }

  const programmeWindowId =
    Number(
      payload.programmeWindowId
    );

  if (
    !Number.isInteger(
      programmeWindowId
    ) ||
    programmeWindowId < 1
  ) {
    const error =
      new Error(
        'A valid service window is required'
      );

    error.statusCode = 400;
    throw error;
  }

  const window =
    getTransportRequestWindowForSubmission(
      programmeWindowId
    );

  if (!window) {
    const error =
      new Error(
        'Service window not found'
      );

    error.statusCode = 404;
    throw error;
  }

  if (
    Number(window.isActive) !== 1
  ) {
    const error =
      new Error(
        'This service window is not available for requests'
      );

    error.statusCode = 409;
    throw error;
  }

  if (
    window.programmeStatus !==
      'open'
  ) {
    const error =
      new Error(
        'This transport programme is not accepting requests'
      );

    error.statusCode = 409;
    throw error;
  }

  const now =
    new Date();

  if (
    window.requestOpensAt &&
    now <
      new Date(
        window.requestOpensAt
      )
  ) {
    const error =
      new Error(
        'Requests for this transport programme are not open yet'
      );

    error.statusCode = 409;
    throw error;
  }

  if (
    window.requestClosesAt &&
    now >
      new Date(
        window.requestClosesAt
      )
  ) {
    const error =
      new Error(
        'Requests for this transport programme are closed'
      );

    error.statusCode = 409;
    throw error;
  }

  const coding =
    resolveTransportRequestCoding(
      payload,
      authUser
    );

  const passengerName =
    String(
      payload.passengerName || ''
    ).trim();

  const passengerMobile =
    String(
      payload.passengerMobile || ''
    ).trim();

  const passengerEmail =
    String(
      payload.passengerEmail || ''
    ).trim() || null;

  const direction =
    String(
      payload.direction || ''
    ).trim();

  const shiftTime =
    normaliseOptionalDateTime(
      payload.shiftTime,
      'Shift time'
    );

  const pickupAddress =
    String(
      payload.pickupAddress || ''
    ).trim();

  const pickupPostcode =
    String(
      payload.pickupPostcode || ''
    ).trim() || null;

  const destinationAddress =
    String(
      payload.destinationAddress || ''
    ).trim();

  const destinationPostcode =
    String(
      payload.destinationPostcode || ''
    ).trim() || null;

  const passengerCount =
    payload.passengerCount === undefined
      ? 1
      : Number(
          payload.passengerCount
        );

  if (
    !passengerName ||
    !passengerMobile ||
    !shiftTime ||
    !pickupAddress ||
    !destinationAddress
  ) {
    const error =
      new Error(
        'Passenger name, mobile, shift time, pickup and destination are required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    ![
      'to_work',
      'from_work'
    ].includes(
      direction
    )
  ) {
    const error =
      new Error(
        'Invalid transport direction'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    !Number.isInteger(
      passengerCount
    ) ||
    passengerCount < 1
  ) {
    const error =
      new Error(
        'Passenger count must be at least 1'
      );

    error.statusCode = 400;
    throw error;
  }

  const pickupLatitude =
    normaliseOptionalTransportCoordinate(
      payload.pickupLatitude,
      'Pickup latitude'
    );

  const pickupLongitude =
    normaliseOptionalTransportCoordinate(
      payload.pickupLongitude,
      'Pickup longitude'
    );

  const destinationLatitude =
    normaliseOptionalTransportCoordinate(
      payload.destinationLatitude,
      'Destination latitude'
    );

  const destinationLongitude =
    normaliseOptionalTransportCoordinate(
      payload.destinationLongitude,
      'Destination longitude'
    );

  if (
    (
      pickupLatitude === null
    ) !== (
      pickupLongitude === null
    )
  ) {
    const error =
      new Error(
        'Pickup latitude and longitude must be supplied together'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    (
      destinationLatitude === null
    ) !== (
      destinationLongitude === null
    )
  ) {
    const error =
      new Error(
        'Destination latitude and longitude must be supplied together'
      );

    error.statusCode = 400;
    throw error;
  }

  const accessibilityNotes =
    String(
      payload.accessibilityNotes ||
        ''
    ).trim() || null;

  const passengerNotes =
    String(
      payload.passengerNotes ||
        ''
    ).trim() || null;

  db.exec('BEGIN');

  try {
    const result =
      db.prepare(`
        INSERT INTO transport_requests
        (
          programme_window_id,
          requested_by_user_id,

          passenger_name,
          passenger_mobile,
          passenger_email,

          direction,
          shift_time,

          pickup_address,
          pickup_postcode,
          pickup_latitude,
          pickup_longitude,

          destination_address,
          destination_postcode,
          destination_latitude,
          destination_longitude,

          passenger_count,

          accessibility_notes,
          passenger_notes,

          department_id,
          budget_id,
          reason_code_id,
          budget_holder_user_id,

          status
        )
        VALUES (
          ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?,
          ?, ?,
          ?, ?, ?, ?,
          'submitted'
        )
      `).run(
        programmeWindowId,
        authUser.id,

        passengerName,
        passengerMobile,
        passengerEmail,

        direction,
        shiftTime,

        pickupAddress,
        pickupPostcode,
        pickupLatitude,
        pickupLongitude,

        destinationAddress,
        destinationPostcode,
        destinationLatitude,
        destinationLongitude,

        passengerCount,

        accessibilityNotes,
        passengerNotes,

        coding.departmentId,
        coding.budgetId,
        coding.reasonCodeId,
        coding.budgetHolderUserId
      );

    const requestId =
      Number(
        result.lastInsertRowid
      );

    db.prepare(`
      INSERT INTO transport_request_events
      (
        transport_request_id,
        event_type,
        actor_user_id,
        old_status,
        new_status,
        notes
      )
      VALUES (
        ?,
        'submitted',
        ?,
        NULL,
        'submitted',
        'Transport request submitted'
      )
    `).run(
      requestId,
      authUser.id
    );

    writeAudit({
      action: 'CREATE',
      entityType:
        'transport_request',
      entityId:
        requestId,
      newValue:
        JSON.stringify({
          programmeWindowId,
          requestedByUserId:
            authUser.id,
          passengerName,
          direction,
          shiftTime,
          departmentId:
            coding.departmentId,
          budgetId:
            coding.budgetId,
          reasonCodeId:
            coding.reasonCodeId,
          budgetHolderUserId:
            coding.budgetHolderUserId,
          status:
            'submitted'
        }),
      source:
        'transport_portal',
      actorUserId:
        authUser.id
    });

    db.exec('COMMIT');

    return getTransportRequestById(
      requestId
    );
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
      be.id,
      be.event_type AS eventType,
      be.event_source AS eventSource,
      be.event_at AS eventAt,
      be.old_status AS oldStatus,
      be.new_status AS newStatus,
      be.user_id AS userId,
      CASE
        WHEN u.id IS NULL THEN NULL
        ELSE TRIM(
          u.first_name || ' ' || u.last_name
        )
      END AS actorName,
      be.notes,
      be.raw_payload AS rawPayload
    FROM booking_events be
    LEFT JOIN users u
      ON u.id = be.user_id
    WHERE be.booking_id = ?
    ORDER BY be.id DESC
  `);

  const auditEventsStatement = db.prepare(`
    SELECT
      al.id,
      al.action,
      al.field_name AS fieldName,
      al.old_value AS oldValue,
      al.new_value AS newValue,
      al.source,
      al.actor_user_id AS userId,
      CASE
        WHEN u.id IS NULL THEN NULL
        ELSE TRIM(
          u.first_name || ' ' || u.last_name
        )
      END AS actorName,
      al.created_at AS eventAt
    FROM audit_log al
    LEFT JOIN users u
      ON u.id = al.actor_user_id
    WHERE al.entity_type = 'booking'
      AND al.entity_id = CAST(? AS TEXT)
      AND al.action <> 'STATUS_CHANGE'
    ORDER BY al.id DESC
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
        'Booking update needs attention'
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

    const bookingEvents =
      eventsStatement.all(booking.id);

    return {
      ...booking,

      stops:
        stopsStatement.all(booking.id),

      events:
        bookingEvents,

      hasBeenAmended:
        bookingEvents.some(
          (event) =>
            event.eventType ===
              'booking_amended'
        ),

      auditEvents:
        auditEventsStatement.all(booking.id),

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
      'cancelling',
      'modifying',
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
      operational.codingCheckedAt ?? null,

    hasBeenAmended:
      Boolean(
        operational.hasBeenAmended
      )
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


function listBookingFavourites(userId) {
  const favourites = db.prepare(`
    SELECT
      bf.id,
      bf.name,
      bf.passenger_count AS passengerCount,
      bf.budget_id AS budgetId,
      b.budget_number AS budgetNumber,
      b.name AS budgetName,
      bf.reason_code_id AS reasonCodeId,
      rc.code AS reasonCode,
      rc.description AS reasonDescription,
      bf.driver_notes AS driverNotes,
      bf.created_at AS createdAt,
      bf.updated_at AS updatedAt

    FROM booking_favourites bf

    LEFT JOIN budgets b
      ON b.id = bf.budget_id

    LEFT JOIN reason_codes rc
      ON rc.id = bf.reason_code_id

    WHERE bf.user_id = ?

    ORDER BY
      datetime(bf.updated_at) DESC,
      bf.id DESC
  `).all(userId);

  const stopsStatement = db.prepare(`
    SELECT
      sequence_number AS sequenceNumber,
      stop_type AS stopType,
      address,
      postcode,
      latitude,
      longitude,
      saved_location_id AS savedLocationId,
      location_name AS locationName,
      pickup_instructions AS pickupInstructions

    FROM booking_favourite_stops

    WHERE favourite_id = ?

    ORDER BY sequence_number
  `);

  return favourites.map(
    (favourite) => ({
      ...favourite,
      stops:
        stopsStatement.all(
          favourite.id
        )
    })
  );
}


function validateFavouriteCoding(
  userId,
  budgetId,
  reasonCodeId
) {
  const options =
    getBookingOptions(userId);

  if (budgetId !== null) {
    const permittedBudget =
      options.budgets.some(
        (budget) =>
          Number(budget.id) ===
          Number(budgetId)
      );

    if (!permittedBudget) {
      const error =
        new Error(
          'The selected budget is not available to this user'
        );

      error.statusCode = 400;
      throw error;
    }
  }

  if (reasonCodeId !== null) {
    const permittedReason =
      options.reasonCodes.some(
        (reason) =>
          Number(reason.id) ===
          Number(reasonCodeId)
      );

    if (!permittedReason) {
      const error =
        new Error(
          'The selected reason code is not available'
        );

      error.statusCode = 400;
      throw error;
    }
  }
}


function createBookingFavourite(
  userId,
  payload = {}
) {
  const name =
    String(payload.name || '')
      .trim();

  if (!name) {
    const error =
      new Error(
        'Favourite name is required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (name.length > 80) {
    const error =
      new Error(
        'Favourite name must be 80 characters or fewer'
      );

    error.statusCode = 400;
    throw error;
  }

  const passengerCount =
    Number(
      payload.passengerCount ?? 1
    );

  if (
    !Number.isInteger(passengerCount) ||
    passengerCount < 1 ||
    passengerCount > 99
  ) {
    const error =
      new Error(
        'Passenger count must be between 1 and 99'
      );

    error.statusCode = 400;
    throw error;
  }

  const budgetId =
    payload.budgetId === null ||
    payload.budgetId === undefined ||
    payload.budgetId === ''
      ? null
      : Number(payload.budgetId);

  const reasonCodeId =
    payload.reasonCodeId === null ||
    payload.reasonCodeId === undefined ||
    payload.reasonCodeId === ''
      ? null
      : Number(payload.reasonCodeId);

  if (
    budgetId !== null &&
    (
      !Number.isInteger(budgetId) ||
      budgetId < 1
    )
  ) {
    const error =
      new Error(
        'A valid budget is required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    reasonCodeId !== null &&
    (
      !Number.isInteger(reasonCodeId) ||
      reasonCodeId < 1
    )
  ) {
    const error =
      new Error(
        'A valid reason code is required'
      );

    error.statusCode = 400;
    throw error;
  }

  validateFavouriteCoding(
    userId,
    budgetId,
    reasonCodeId
  );

  const pickup =
    normaliseStop(
      payload.pickup || {}
    );

  const destination =
    normaliseStop(
      payload.destination || {}
    );

  const vias =
    Array.isArray(payload.vias)
      ? payload.vias
          .map(normaliseStop)
          .filter(
            (via) =>
              via.address.trim()
          )
      : [];

  if (!pickup.address.trim()) {
    const error =
      new Error(
        'Favourite pickup is required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (!destination.address.trim()) {
    const error =
      new Error(
        'Favourite destination is required'
      );

    error.statusCode = 400;
    throw error;
  }

  const duplicate =
    db.prepare(`
      SELECT id
      FROM booking_favourites
      WHERE user_id = ?
        AND name = ? COLLATE NOCASE
      LIMIT 1
    `).get(
      userId,
      name
    );

  if (duplicate) {
    const error =
      new Error(
        'You already have a favourite with this name'
      );

    error.statusCode = 409;
    throw error;
  }

  db.exec('BEGIN IMMEDIATE');

  try {
    const result =
      db.prepare(`
        INSERT INTO booking_favourites (
          user_id,
          name,
          passenger_count,
          budget_id,
          reason_code_id,
          driver_notes
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        name,
        passengerCount,
        budgetId,
        reasonCodeId,
        String(
          payload.driverNotes || ''
        ).trim()
      );

    const favouriteId =
      Number(result.lastInsertRowid);

    const insertStop =
      db.prepare(`
        INSERT INTO booking_favourite_stops (
          favourite_id,
          sequence_number,
          stop_type,
          address,
          postcode,
          latitude,
          longitude,
          saved_location_id,
          location_name,
          pickup_instructions
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

    const stops = [
      {
        ...pickup,
        stopType:
          'pickup'
      },

      ...vias.map(
        (via) => ({
          ...via,
          stopType:
            'via'
        })
      ),

      {
        ...destination,
        stopType:
          'destination'
      }
    ];

    stops.forEach(
      (stop, index) => {
        insertStop.run(
          favouriteId,
          index,
          stop.stopType,
          stop.address,
          stop.postcode || '',
          stop.latitude,
          stop.longitude,
          stop.savedLocationId,
          stop.locationName,
          stop.pickupInstructions
        );
      }
    );

    db.exec('COMMIT');

    return listBookingFavourites(
      userId
    ).find(
      (favourite) =>
        favourite.id ===
        favouriteId
    );
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function deleteBookingFavourite(
  favouriteId,
  userId
) {
  if (
    !Number.isInteger(favouriteId) ||
    favouriteId < 1
  ) {
    const error =
      new Error(
        'A valid favourite id is required'
      );

    error.statusCode = 400;
    throw error;
  }

  const favourite =
    db.prepare(`
      SELECT
        id,
        name
      FROM booking_favourites
      WHERE id = ?
        AND user_id = ?
    `).get(
      favouriteId,
      userId
    );

  if (!favourite) {
    const error =
      new Error(
        'Favourite not found'
      );

    error.statusCode = 404;
    throw error;
  }

  db.prepare(`
    DELETE FROM booking_favourites
    WHERE id = ?
      AND user_id = ?
  `).run(
    favouriteId,
    userId
  );

  return favourite;
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
      b.submitted_at AS submittedAt,
      b.confirmed_at AS confirmedAt,
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


function getUhpManageableRawBooking(
  bookingId,
  userId
) {
  const booking =
    db.prepare(`
      SELECT *
      FROM bookings
      WHERE id = ?
    `).get(bookingId);

  if (!booking) {
    const error =
      new Error('Booking not found');

    error.statusCode = 404;
    throw error;
  }

  /*
    Normal portal users may manage only
    bookings they created themselves.
  */
  if (
    Number(
      booking.created_by_user_id
    ) === Number(userId)
  ) {
    return booking;
  }

  /*
    Wider management authority belongs only
    to UHP Admin. Budget-holder visibility
    does not grant mutation rights.
  */
  if (
    !userHasRoleById(
      userId,
      'uhp_admin'
    )
  ) {
    const error =
      new Error('Booking not found');

    error.statusCode = 404;
    throw error;
  }

  /*
    Portal-created rows are UHP-scoped by
    construction because portal creation is
    restricted to uhp_account_only.
  */
  if (booking.source === 'portal') {
    return booking;
  }

  /*
    Imported rows require local proof that
    the original BookingCreated payload
    belonged to the configured UHP account.

    This also safely validates historical
    imported rows created before the newer
    import-time account guard existed.
  */
  if (booking.source === 'import') {
    const settings =
      db.prepare(`
        SELECT
          autocab_customer_id
            AS autocabCustomerId,
          booking_scope
            AS bookingScope
        FROM portal_settings
        WHERE id = 1
      `).get();

    const createdEvent =
      db.prepare(`
        SELECT
          payload_json AS payloadJson
        FROM integration_events
        WHERE booking_id = ?
          AND provider = 'autocab'
          AND direction = 'inbound'
          AND route_suffix = 'created'
        ORDER BY id
        LIMIT 1
      `).get(bookingId);

    let eventPayload = null;

    try {
      eventPayload =
        createdEvent?.payloadJson
          ? JSON.parse(
              createdEvent.payloadJson
            )
          : null;
    } catch {
      eventPayload = null;
    }

    const payloadCustomerId =
      normaliseAutocabScalar(
        eventPayload?.Account?.Id
      );

    const configuredCustomerId =
      normaliseAutocabScalar(
        settings?.autocabCustomerId
      );

    if (
      settings?.bookingScope ===
        'uhp_account_only' &&
      payloadCustomerId &&
      configuredCustomerId &&
      payloadCustomerId ===
        configuredCustomerId
    ) {
      return booking;
    }
  }

  const error =
    new Error('Booking not found');

  error.statusCode = 404;
  throw error;
}


function getUhpManageableBookingDetails(
  bookingId,
  userId
) {
  getUhpManageableRawBooking(
    bookingId,
    userId
  );

  const booking =
    getBookingById(bookingId);

  if (!booking) {
    const error =
      new Error('Booking not found');

    error.statusCode = 404;
    throw error;
  }

  return {
    ...booking,
    stops:
      getBookingStops(bookingId)
  };
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


function getManageableEditableBooking(
  bookingId,
  userId
) {
  const booking =
    getUhpManageableRawBooking(
      bookingId,
      userId
    );

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
  const existing =
    getManageableEditableBooking(
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
      source: 'portal',
      actorUserId: userId
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
          notes,
          latitude,
          longitude
        )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

  const coordinateValue = (value) => {
    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return null;
    }

    const number = Number(value);

    return Number.isFinite(number)
      ? number
      : null;
  };

  const latitudeFor = (stop) =>
    coordinateValue(
      stop?.Coordinates?.Latitude
    );

  const longitudeFor = (stop) =>
    coordinateValue(
      stop?.Coordinates?.Longitude
    );

  let sequence = 0;

  insert.run(
    bookingId,
    sequence++,
    'pickup',
    normaliseAutocabScalar(
      payload?.Pickup?.Address
    ) || '',
    null,
    null,
    latitudeFor(payload?.Pickup),
    longitudeFor(payload?.Pickup)
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
      null,
      latitudeFor(via),
      longitudeFor(via)
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
    null,
    latitudeFor(
      payload?.Destination
    ),
    longitudeFor(
      payload?.Destination
    )
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

  const portalSettings =
    db.prepare(`
      SELECT
        autocab_customer_id AS autocabCustomerId,
        booking_scope AS bookingScope
      FROM portal_settings
      WHERE id = 1
    `).get();

  const payloadCustomerId =
    normaliseAutocabScalar(
      payload?.Account?.Id
    );

  const configuredCustomerId =
    normaliseAutocabScalar(
      portalSettings?.autocabCustomerId
    );

  if (
    !portalSettings ||
    portalSettings.bookingScope !==
      'uhp_account_only' ||
    !payloadCustomerId ||
    !configuredCustomerId ||
    payloadCustomerId !==
      configuredCustomerId
  ) {
    const error = new Error(
      'Autocab booking is outside the configured UHP account'
    );

    error.statusCode = 403;
    throw error;
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
  cancelling: 1,
  modifying: 1,
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

  /*
    While a portal cancellation DELETE is
    in flight, do not let ordinary Autocab
    progress events move the booking out of
    'cancelling'.

    A terminal Autocab event remains
    authoritative and may resolve the job.
  */
  if (currentStatus === 'cancelling') {
    return (
      AUTOCAB_TERMINAL_OPERATIONAL_STATUSES
        .has(nextStatus)
    );
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

          financial_status =
            CASE
              WHEN ? = 'cancelled'
                THEN 'authorisation_withdrawn'
              ELSE financial_status
            END,

          updated_at = CURRENT_TIMESTAMP

        WHERE id = ?
      `).run(
        nextStatus,
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
          routeSuffix === 'cancelled'
            ? payload?.OriginalBookingId ??
              payload?.Id
            : payload?.Id
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


function createAutocabCancellationOutboundEvent({
  bookingId,
  autocabBookingId,
  autocabReference,
  reason
}) {
  const result =
    db.prepare(`
      INSERT INTO integration_events
        (
          provider,
          direction,
          event_type,
          route_suffix,
          category,
          booking_id,
          autocab_booking_id,
          autocab_reference,
          payload_json,
          processing_status
        )
      VALUES (
        'autocab',
        'outbound',
        'booking_cancel',
        'booking',
        'booking',
        ?,
        ?,
        ?,
        ?,
        'received'
      )
    `).run(
      bookingId,
      autocabBookingId,
      autocabReference,
      JSON.stringify({
        request: {
          method: 'DELETE',
          bookingId:
            autocabBookingId,
          reason
        }
      })
    );

  return Number(
    result.lastInsertRowid
  );
}


function writeAutocabCancellationBookingEvent({
  bookingId,
  eventType,
  oldStatus,
  newStatus,
  userId,
  notes,
  rawPayload = null
}) {
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
      ?,
      'portal',
      ?,
      ?,
      ?,
      ?,
      ?
    )
  `).run(
    bookingId,
    eventType,
    oldStatus,
    newStatus,
    userId,
    notes,
    rawPayload
      ? JSON.stringify(rawPayload)
      : null
  );
}


async function cancelPortalBooking(
  bookingId,
  userId,
  payload
) {
  const booking =
    getUhpManageableRawBooking(
      bookingId,
      userId
    );

  const reason =
    String(
      payload.reason || ''
    ).trim();

  if (!reason) {
    const error =
      new Error(
        'Cancellation reason is required'
      );

    error.statusCode = 400;
    throw error;
  }

  /*
    Draft requests have never reached
    Autocab, so they remain a local-only
    cancellation.
  */
  if (
    booking.operational_status ===
      'draft'
  ) {
    db.exec('BEGIN');

    try {
      db.prepare(`
        UPDATE bookings
        SET
          operational_status =
            'cancelled',
          financial_status =
            'authorisation_withdrawn',
          cancelled_at =
            CURRENT_TIMESTAMP,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
          AND operational_status =
            'draft'
      `).run(
        bookingId
      );

      writeAutocabCancellationBookingEvent({
        bookingId,
        eventType:
          'booking_cancelled',
        oldStatus:
          'draft',
        newStatus:
          'cancelled',
        userId,
        notes:
          reason
      });

      writeAudit({
        action:
          'STATUS_CHANGE',
        entityType:
          'booking',
        entityId:
          bookingId,
        fieldName:
          'operational_status',
        oldValue:
          'draft',
        newValue:
          'cancelled',
        source:
          'portal'
      });

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    return {
      ...getBookingById(
        bookingId
      ),
      stops:
        getBookingStops(
          bookingId
        )
    };
  }

  if (
    booking.operational_status ===
      'cancelled'
  ) {
    return {
      ...getBookingById(
        bookingId
      ),
      stops:
        getBookingStops(
          bookingId
        )
    };
  }

  const cancellableStatuses =
    new Set([
      'booked',
      'confirmed',
      'driver_allocated',
      'driver_en_route',
      'driver_arrived'
    ]);

  if (
    !cancellableStatuses.has(
      booking.operational_status
    )
  ) {
    const error =
      new Error(
        `Booking cannot be cancelled from status ${booking.operational_status}`
      );

    error.statusCode = 409;
    throw error;
  }

  const autocabBookingId =
    String(
      booking.autocab_booking_id ||
      ''
    ).trim();

  if (
    !/^\d+$/.test(
      autocabBookingId
    ) ||
    autocabBookingId === '0'
  ) {
    const error =
      new Error(
        'This live booking has no valid Autocab booking ID and requires manual review'
      );

    error.statusCode = 409;
    throw error;
  }

  if (!AUTOCAB_SUBSCRIPTION_KEY) {
    const error =
      new Error(
        'Autocab cancellation is not configured'
      );

    error.statusCode = 503;
    throw error;
  }

  const previousStatus =
    booking.operational_status;

  const eventId =
    createAutocabCancellationOutboundEvent({
      bookingId,
      autocabBookingId,
      autocabReference:
        booking.autocab_reference,
      reason
    });

  /*
    Lock this booking into a dedicated
    cancellation-in-progress state before
    contacting Autocab.

    This prevents two portal requests from
    deleting the same live booking at once.
  */
  db.exec('BEGIN');

  try {
    const update =
      db.prepare(`
        UPDATE bookings
        SET
          operational_status =
            'cancelling',
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
          AND operational_status = ?
          AND autocab_booking_id = ?
      `).run(
        bookingId,
        previousStatus,
        autocabBookingId
      );

    if (update.changes !== 1) {
      const error =
        new Error(
          'Booking cancellation state changed before cancellation started'
        );

      error.statusCode = 409;
      throw error;
    }

    writeAutocabCancellationBookingEvent({
      bookingId,
      eventType:
        'autocab_cancellation_started',
      oldStatus:
        previousStatus,
      newStatus:
        'cancelling',
      userId,
      notes:
        reason,
      rawPayload: {
        autocabBookingId
      }
    });

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');

    updateAutocabOutboundEvent(
      eventId,
      {
        processingStatus:
          'failed',
        autocabBookingId,
        autocabReference:
          booking.autocab_reference,
        processingError:
          String(
            error?.message ||
            'Cancellation state update failed'
          )
      }
    );

    throw error;
  }

  let response;
  let responseText = '';

  try {
    response =
      await fetch(
        `${AUTOCAB_BOOKING_API_URL}/booking/v1/booking/${encodeURIComponent(
          String(
            autocabBookingId
          )
        )}`,
        {
          method:
            'DELETE',

          headers: {
            'Cache-Control':
              'no-cache',

            'Ocp-Apim-Subscription-Key':
              AUTOCAB_SUBSCRIPTION_KEY
          },

          signal:
            AbortSignal.timeout(
              15000
            )
        }
      );

    responseText =
      await response.text();
  } catch (error) {
    /*
      Network/time-out is ambiguous:
      Autocab may have processed the DELETE
      before the connection failed.

      Never retry automatically.
    */
    db.exec('BEGIN');

    try {
      const transition =
        db.prepare(`
          UPDATE bookings
          SET
            operational_status =
              'requires_review',
            updated_at =
              CURRENT_TIMESTAMP
          WHERE id = ?
            AND operational_status =
              'cancelling'
        `).run(
          bookingId
        );

      if (transition.changes === 1) {
        writeAutocabCancellationBookingEvent({
          bookingId,
          eventType:
            'autocab_cancellation_uncertain',
          oldStatus:
            'cancelling',
          newStatus:
            'requires_review',
          userId,
          notes:
            'Autocab cancellation result is uncertain and requires manual review',
          rawPayload: {
            autocabBookingId,
            reason,
            error:
              String(
                error?.message ||
                'Network error'
              )
          }
        });
      }

      db.exec('COMMIT');
    } catch (dbError) {
      db.exec('ROLLBACK');
      throw dbError;
    }

    updateAutocabOutboundEvent(
      eventId,
      {
        processingStatus:
          'failed',
        autocabBookingId,
        autocabReference:
          booking.autocab_reference,
        payload: {
          request: {
            method:
              'DELETE',
            bookingId:
              autocabBookingId,
            reason
          },
          networkError:
            String(
              error?.message ||
              'Network error'
            )
        },
        processingError:
          'Autocab cancellation result is uncertain'
      }
    );

    const uncertainError =
      new Error(
        'Autocab cancellation result is uncertain. Check Autocab before retrying.'
      );

    uncertainError.statusCode =
      502;

    throw uncertainError;
  }

  let responseBody = null;

  if (responseText) {
    try {
      responseBody =
        JSON.parse(
          responseText
        );
    } catch {
      responseBody =
        responseText;
    }
  }

  /*
    A 4xx response is a definitive rejection
    of this DELETE request. Restore the exact
    previous operational state, but only if
    no webhook changed it meanwhile.
  */
  if (
    !response.ok &&
    response.status >= 400 &&
    response.status < 500
  ) {
    db.exec('BEGIN');

    try {
      const transition =
        db.prepare(`
          UPDATE bookings
          SET
            operational_status = ?,
            updated_at =
              CURRENT_TIMESTAMP
          WHERE id = ?
            AND operational_status =
              'cancelling'
        `).run(
          previousStatus,
          bookingId
        );

      if (transition.changes === 1) {
        writeAutocabCancellationBookingEvent({
          bookingId,
          eventType:
            'autocab_cancellation_rejected',
          oldStatus:
            'cancelling',
          newStatus:
            previousStatus,
          userId,
          notes:
            `Autocab rejected cancellation with HTTP ${response.status}`,
          rawPayload: {
            autocabBookingId,
            reason,
            status:
              response.status,
            response:
              responseBody
          }
        });
      }

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    updateAutocabOutboundEvent(
      eventId,
      {
        processingStatus:
          'failed',
        autocabBookingId,
        autocabReference:
          booking.autocab_reference,
        payload: {
          request: {
            method:
              'DELETE',
            bookingId:
              autocabBookingId,
            reason
          },
          responseStatus:
            response.status,
          response:
            responseBody
        },
        processingError:
          `Autocab rejected cancellation with HTTP ${response.status}`
      }
    );

    const error =
      new Error(
        `Autocab rejected the cancellation with HTTP ${response.status}`
      );

    error.statusCode = 502;
    throw error;
  }

  /*
    5xx and any other non-success response
    are ambiguous. Do not retry.
  */
  if (!response.ok) {
    db.exec('BEGIN');

    try {
      const transition =
        db.prepare(`
          UPDATE bookings
          SET
            operational_status =
              'requires_review',
            updated_at =
              CURRENT_TIMESTAMP
          WHERE id = ?
            AND operational_status =
              'cancelling'
        `).run(
          bookingId
        );

      if (transition.changes === 1) {
        writeAutocabCancellationBookingEvent({
          bookingId,
          eventType:
            'autocab_cancellation_uncertain',
          oldStatus:
            'cancelling',
          newStatus:
            'requires_review',
          userId,
          notes:
            'Autocab returned an uncertain cancellation result',
          rawPayload: {
            autocabBookingId,
            reason,
            status:
              response.status,
            response:
              responseBody
          }
        });
      }

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    updateAutocabOutboundEvent(
      eventId,
      {
        processingStatus:
          'failed',
        autocabBookingId,
        autocabReference:
          booking.autocab_reference,
        payload: {
          request: {
            method:
              'DELETE',
            bookingId:
              autocabBookingId,
            reason
          },
          responseStatus:
            response.status,
          response:
            responseBody
        },
        processingError:
          'Autocab cancellation requires manual review'
      }
    );

    const error =
      new Error(
        'Autocab cancellation requires manual review before retrying'
      );

    error.statusCode = 502;
    throw error;
  }

  /*
    Any HTTP 2xx is treated as successful.
    The DELETE documentation supplied for
    this endpoint does not require a
    response body.
  */
  db.exec('BEGIN');

  try {
    const transition =
      db.prepare(`
        UPDATE bookings
        SET
          operational_status =
            'cancelled',
          financial_status =
            'authorisation_withdrawn',
          cancelled_at =
            COALESCE(
              cancelled_at,
              CURRENT_TIMESTAMP
            ),
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
          AND operational_status =
            'cancelling'
      `).run(
        bookingId
      );

    if (transition.changes === 1) {
      writeAutocabCancellationBookingEvent({
        bookingId,
        eventType:
          'autocab_cancellation_succeeded',
        oldStatus:
          'cancelling',
        newStatus:
          'cancelled',
        userId,
        notes:
          reason,
        rawPayload: {
          autocabBookingId,
          status:
            response.status,
          response:
            responseBody
        }
      });

      writeAudit({
        action:
          'STATUS_CHANGE',
        entityType:
          'booking',
        entityId:
          bookingId,
        fieldName:
          'operational_status',
        oldValue:
          previousStatus,
        newValue:
          'cancelled',
        source:
          'portal'
      });
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  updateAutocabOutboundEvent(
    eventId,
    {
      processingStatus:
        'processed',
      autocabBookingId,
      autocabReference:
        booking.autocab_reference,
      payload: {
        request: {
          method:
            'DELETE',
          bookingId:
            autocabBookingId,
          reason
        },
        responseStatus:
          response.status,
        response:
          responseBody
      }
    }
  );

  return {
    ...getBookingById(
      bookingId
    ),
    stops:
      getBookingStops(
        bookingId
      )
  };
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

function getAutocabPortalCustomerId(
  accountType = 'uhp'
) {
  if (accountType === 'xmas_staff') {
    return AUTOCAB_UHP_XMAS_CUSTOMER_ID;
  }

  return AUTOCAB_UHP_CUSTOMER_ID;
}


function buildAutocabRoutePoint(
  stop,
  type
) {
  if (!stop?.address) {
    const error =
      new Error(
        `Autocab ${type.toLowerCase()} address is missing`
      );

    error.statusCode = 409;

    throw error;
  }

  if (
    stop.latitude === null ||
    stop.latitude === undefined ||
    stop.latitude === '' ||
    stop.longitude === null ||
    stop.longitude === undefined ||
    stop.longitude === '' ||
    !Number.isFinite(
      Number(stop.latitude)
    ) ||
    !Number.isFinite(
      Number(stop.longitude)
    )
  ) {
    const error =
      new Error(
        `Autocab ${type.toLowerCase()} coordinates are missing`
      );

    error.statusCode = 409;

    throw error;
  }

  return {
    address: {
      coordinate: {
        latitude:
          Number(stop.latitude),
        longitude:
          Number(stop.longitude)
      },

      id:
        '-1',

      isCustom:
        true,

      postCode:
        stop.postcode || '',

      text:
        stop.address
    },

    note:
      stop.notes ||
      stop.pickupInstructions ||
      '',

    passengerDetailsIndex:
      null,

    type
  };
}




async function calculateAutocabEta(
  stops
) {
  if (!AUTOCAB_SUBSCRIPTION_KEY) {
    const error =
      new Error(
        'Autocab ETA calculation is not configured'
      );

    error.statusCode = 503;

    throw error;
  }

  if (
    !Number.isInteger(
      AUTOCAB_COMPANY_ID
    ) ||
    AUTOCAB_COMPANY_ID < 1
  ) {
    const error =
      new Error(
        'Autocab company ID is invalid'
      );

    error.statusCode = 503;

    throw error;
  }

  const points =
    (Array.isArray(stops)
      ? stops
      : []
    ).map(
      (stop) => {
        if (
          stop?.latitude === null ||
          stop?.latitude === undefined ||
          stop?.latitude === '' ||
          stop?.longitude === null ||
          stop?.longitude === undefined ||
          stop?.longitude === ''
        ) {
          const error =
            new Error(
              'Autocab ETA coordinates are missing'
            );

          error.statusCode = 409;

          throw error;
        }

        const latitude =
          Number(
            stop?.latitude
          );

        const longitude =
          Number(
            stop?.longitude
          );

        if (
          !Number.isFinite(
            latitude
          ) ||
          !Number.isFinite(
            longitude
          ) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180
        ) {
          const error =
            new Error(
              'Autocab ETA coordinates are missing'
            );

          error.statusCode = 409;

          throw error;
        }

        return {
          latitude,
          longitude
        };
      }
    );

  if (points.length < 2) {
    const error =
      new Error(
        'Autocab ETA requires at least two route points'
      );

    error.statusCode = 409;

    throw error;
  }

  let response;
  let responseText = '';

  try {
    response =
      await fetch(
        `${AUTOCAB_BOOKING_API_URL}/booking/v1/calculateeta`,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json',

            'Cache-Control':
              'no-cache',

            'Ocp-Apim-Subscription-Key':
              AUTOCAB_SUBSCRIPTION_KEY
          },

          body:
            JSON.stringify({
              companyId:
                AUTOCAB_COMPANY_ID,

              points
            }),

          signal:
            AbortSignal.timeout(
              15000
            )
        }
      );

    responseText =
      await response.text();
  } catch (error) {
    const etaError =
      new Error(
        'Autocab ETA calculation could not be reached'
      );

    etaError.statusCode = 502;
    etaError.cause = error;

    throw etaError;
  }

  let result = null;

  if (responseText) {
    try {
      result =
        JSON.parse(
          responseText
        );
    } catch {
      result = null;
    }
  }

  if (!response.ok) {
    const error =
      new Error(
        'Autocab ETA calculation failed'
      );

    error.statusCode = 502;
    error.autocabStatus =
      response.status;

    throw error;
  }

  const durationSeconds =
    Number(
      result?.durationSeconds
    );

  const distanceAmount =
    Number(
      result?.distance?.amount
    );

  const distanceType =
    String(
      result?.distance?.type ||
      ''
    ).trim();

  if (
    !Number.isFinite(
      durationSeconds
    ) ||
    durationSeconds < 0
  ) {
    const error =
      new Error(
        'Autocab ETA response is invalid'
      );

    error.statusCode = 502;

    throw error;
  }

  return {
    durationSeconds,

    distance:
      Number.isFinite(
        distanceAmount
      )
        ? {
            amount:
              distanceAmount,

            type:
              distanceType
          }
        : null,

    route:
      typeof result?.route ===
        'string'
        ? result.route
        : ''
  };
}


const EUROPE_LONDON_TIME_FORMATTER =
  new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone:
        'Europe/London',

      year:
        'numeric',

      month:
        '2-digit',

      day:
        '2-digit',

      hour:
        '2-digit',

      minute:
        '2-digit',

      second:
        '2-digit',

      hourCycle:
        'h23'
    }
  );


function getEuropeLondonDateTimeParts(
  date
) {
  const parts =
    EUROPE_LONDON_TIME_FORMATTER
      .formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (
      part.type !==
        'literal'
    ) {
      values[
        part.type
      ] = part.value;
    }
  }

  return {
    year:
      Number(values.year),

    month:
      Number(values.month),

    day:
      Number(values.day),

    hour:
      Number(values.hour),

    minute:
      Number(values.minute),

    second:
      Number(values.second)
  };
}


function formatLocalIsoDateTime(
  {
    year,
    month,
    day,
    hour,
    minute,
    second
  }
) {
  const pad =
    (value) =>
      String(value)
        .padStart(2, '0');

  return (
    `${year}-` +
    `${pad(month)}-` +
    `${pad(day)}T` +
    `${pad(hour)}:` +
    `${pad(minute)}:` +
    `${pad(second)}.000`
  );
}


function normaliseUhpPickupTime(
  value
) {
  const input =
    String(
      value || ''
    ).trim();

  if (!input) {
    const error =
      new Error(
        'Pickup date and time are required'
      );

    error.statusCode = 400;

    throw error;
  }

  /*
    Values already carrying an explicit
    timezone represent an absolute instant.

    Convert that instant back to the
    Europe/London wall-clock value for
    pickupDueTime while preserving the
    absolute UTC instant separately.
  */
  if (
    /(?:Z|[+-]\d{2}:\d{2})$/i
      .test(input)
  ) {
    const instant =
      new Date(input);

    if (
      Number.isNaN(
        instant.getTime()
      )
    ) {
      const error =
        new Error(
          'Pickup date and time are not valid'
        );

      error.statusCode = 400;

      throw error;
    }

    return {
      local:
        formatLocalIsoDateTime(
          getEuropeLondonDateTimeParts(
            instant
          )
        ),

      utc:
        instant.toISOString()
    };
  }

  const match =
    input.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/
    );

  if (!match) {
    const error =
      new Error(
        'Pickup date and time are not valid'
      );

    error.statusCode = 400;

    throw error;
  }

  const target = {
    year:
      Number(match[1]),

    month:
      Number(match[2]),

    day:
      Number(match[3]),

    hour:
      Number(match[4]),

    minute:
      Number(match[5]),

    second:
      Number(
        match[6] || 0
      )
  };

  /*
    Date.UTC normalises impossible dates
    such as 31 February. Verify the parts
    before doing timezone resolution.
  */
  const nominalUtc =
    new Date(
      Date.UTC(
        target.year,
        target.month - 1,
        target.day,
        target.hour,
        target.minute,
        target.second
      )
    );

  if (
    nominalUtc.getUTCFullYear() !==
      target.year ||
    nominalUtc.getUTCMonth() + 1 !==
      target.month ||
    nominalUtc.getUTCDate() !==
      target.day ||
    nominalUtc.getUTCHours() !==
      target.hour ||
    nominalUtc.getUTCMinutes() !==
      target.minute ||
    nominalUtc.getUTCSeconds() !==
      target.second
  ) {
    const error =
      new Error(
        'Pickup date and time are not valid'
      );

    error.statusCode = 400;

    throw error;
  }

  const targetKey =
    formatLocalIsoDateTime(
      target
    );

  const matches =
    new Map();

  /*
    Resolve the Europe/London wall-clock
    time without depending on the server's
    own operating-system timezone.

    Scanning possible offsets also lets us
    detect DST gaps and repeated times.
  */
  for (
    let offsetMinutes = -180;
    offsetMinutes <= 180;
    offsetMinutes += 15
  ) {
    const candidate =
      new Date(
        nominalUtc.getTime() -
        offsetMinutes *
          60 *
          1000
      );

    const localKey =
      formatLocalIsoDateTime(
        getEuropeLondonDateTimeParts(
          candidate
        )
      );

    if (
      localKey === targetKey
    ) {
      matches.set(
        candidate.getTime(),
        candidate
      );
    }
  }

  const candidates =
    [...matches.values()]
      .sort(
        (a, b) =>
          a.getTime() -
          b.getTime()
      );

  if (
    candidates.length === 0
  ) {
    const error =
      new Error(
        'Pickup time does not exist in Europe/London because of the daylight saving clock change'
      );

    error.statusCode = 409;

    throw error;
  }

  if (
    candidates.length > 1
  ) {
    const error =
      new Error(
        'Pickup time is ambiguous in Europe/London because of the daylight saving clock change'
      );

    error.statusCode = 409;

    throw error;
  }

  return {
    local:
      targetKey,

    utc:
      candidates[0]
        .toISOString()
  };
}


function buildAutocabBookingPayload(
  bookingId,
  {
    accountType = 'uhp'
  } = {}
) {
  const booking =
    db.prepare(`
      SELECT
        b.id,
        b.public_reference
          AS publicReference,
        b.requested_pickup_at
          AS requestedPickupAt,
        b.passenger_name
          AS passengerName,
        b.passenger_mobile
          AS passengerMobile,
        b.passenger_count
          AS passengerCount,
        b.driver_notes
          AS driverNotes,
        b.internal_notes
          AS internalNotes,

        creator.email
          AS customerEmail,

        creator.first_name ||
          ' ' ||
          creator.last_name
          AS bookedBy,

        bu.budget_number
          AS budgetNumber,

        rc.code
          AS reasonCode,

        holder.first_name ||
          ' ' ||
          holder.last_name
          AS budgetHolder

      FROM bookings b

      JOIN budgets bu
        ON bu.id = b.budget_id

      JOIN reason_codes rc
        ON rc.id = b.reason_code_id

      JOIN users holder
        ON holder.id =
          b.budget_holder_user_id

      JOIN users creator
        ON creator.id =
          b.created_by_user_id

      WHERE b.id = ?
    `).get(
      bookingId
    );

  if (!booking) {
    const error =
      new Error(
        'Booking not found for Autocab submission'
      );

    error.statusCode = 404;

    throw error;
  }

  const stops =
    getBookingStops(
      bookingId
    );

  const pickup =
    stops.find(
      (stop) =>
        stop.stopType === 'pickup'
    );

  const destination =
    stops.find(
      (stop) =>
        stop.stopType ===
        'destination'
    );

  const vias =
    stops.filter(
      (stop) =>
        stop.stopType === 'via'
    );

  const customerId =
    getAutocabPortalCustomerId(
      accountType
    );

  const ourReference =
    [
      booking.reasonCode,
      booking.budgetNumber,
      booking.budgetHolder
    ]
      .filter(Boolean)
      .join('/');

  const pickupTime =
    normaliseUhpPickupTime(
      booking.requestedPickupAt
    );

  return {
    capabilities: [],

    companyId:
      AUTOCAB_COMPANY_ID,

    customerId,

    customerEmail:
      booking.customerEmail || '',

    driverConstraints: {
      forbiddenDrivers: [],
      requestedDrivers: []
    },

    vehicleConstraints: {
      forbiddenVehicles: [],
      requestedVehicles: []
    },

    driverNote:
      booking.driverNotes || '',

    officeNote:
      [
        'UHP Portal',
        booking.publicReference,
        booking.bookedBy
          ? `Booked by ${booking.bookedBy}`
          : null,
        booking.budgetNumber
          ? `Budget ${booking.budgetNumber}`
          : null,
        booking.reasonCode
          ? `Reason ${booking.reasonCode}`
          : null
      ]
        .filter(Boolean)
        .join(' - '),

    name:
      booking.passengerName,

    passengers:
      String(
        booking.passengerCount || 1
      ),

    luggage:
      0,

    telephoneNumber:
      booking.passengerMobile,

    ourReference,

    pickup:
      buildAutocabRoutePoint(
        pickup,
        'Pickup'
      ),

    vias:
      vias.map(
        (via) =>
          buildAutocabRoutePoint(
            via,
            'Via'
          )
      ),

    destination:
      buildAutocabRoutePoint(
        destination,
        'Destination'
      ),

    /*
      UHP users enter Plymouth local time.

      Autocab receives both the original
      Europe/London wall-clock time and
      the corresponding absolute UTC
      instant.
    */
    pickupDueTime:
      pickupTime.local,

    pickupDueTimeUtc:
      pickupTime.utc,

    priority:
      1,

    priorityOverride:
      true,

    yourReferences: {
      yourReference1:
        booking.publicReference,

      yourReference2:
        ourReference
    },

    hold:
      false
  };
}



function createAutocabOutboundEvent({
  bookingId,
  autocabReference,
  payload
}) {
  const result =
    db.prepare(`
      INSERT INTO integration_events
        (
          provider,
          direction,
          event_type,
          route_suffix,
          category,
          booking_id,
          autocab_reference,
          payload_json,
          processing_status
        )
      VALUES (
        'autocab',
        'outbound',
        'booking_create',
        'booking',
        'booking',
        ?,
        ?,
        ?,
        'received'
      )
    `).run(
      bookingId,
      autocabReference,
      JSON.stringify({
        request: payload
      })
    );

  return Number(
    result.lastInsertRowid
  );
}


function getManageableLiveModifiableBooking(
  bookingId,
  userId
) {
  const booking =
    getUhpManageableRawBooking(
      bookingId,
      userId
    );

  const modifiableStatuses =
    new Set([
      'booked',
      'confirmed'
    ]);

  if (
    !modifiableStatuses.has(
      booking.operational_status
    )
  ) {
    const error =
      new Error(
        `Booking cannot be amended from status ${booking.operational_status}`
      );

    error.statusCode = 409;
    throw error;
  }

  const autocabBookingId =
    String(
      booking.autocab_booking_id ||
      ''
    ).trim();

  if (
    !/^\d+$/.test(
      autocabBookingId
    ) ||
    autocabBookingId === '0'
  ) {
    const error =
      new Error(
        'This live booking has no valid Autocab booking ID and requires manual review'
      );

    error.statusCode = 409;
    throw error;
  }

  return {
    booking,
    autocabBookingId
  };
}


function validateLiveModificationPayload(
  userId,
  payload
) {
  const requestedPickupAt =
    String(
      payload?.requestedPickupAt || ''
    ).trim();

  const passengerName =
    String(
      payload?.passengerName || ''
    ).trim();

  const passengerMobile =
    String(
      payload?.passengerMobile || ''
    ).trim();

  const passengerCount =
    parseRequiredPositiveInteger(
      payload?.passengerCount ?? 1,
      'Passenger count'
    );

  const pickup =
    resolveBookingStop(
      payload?.pickup
    );

  const destination =
    resolveBookingStop(
      payload?.destination
    );

  const vias =
    Array.isArray(
      payload?.vias
    )
      ? payload.vias
          .map(
            resolveBookingStop
          )
          .filter(
            (stop) =>
              stop.address
          )
      : [];

  const driverNotes =
    String(
      payload?.driverNotes || ''
    ).trim();

  const budgetId =
    Number(
      payload?.budgetId
    );

  const reasonCodeId =
    Number(
      payload?.reasonCodeId
    );

  if (!requestedPickupAt) {
    const error =
      new Error(
        'Pickup date and time are required'
      );

    error.statusCode = 400;
    throw error;
  }

  /*
    Use the same Europe/London-aware
    normalisation that will be used for the
    Autocab payload. This catches invalid and
    ambiguous local pickup times before any
    modification lock is taken.
  */
  normaliseUhpPickupTime(
    requestedPickupAt
  );

  if (!passengerName) {
    const error =
      new Error(
        'Passenger name is required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (!passengerMobile) {
    const error =
      new Error(
        'Passenger contact number is required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (!pickup.address) {
    const error =
      new Error(
        'Pickup address is required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (!destination.address) {
    const error =
      new Error(
        'Destination address is required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    !Number.isInteger(
      budgetId
    ) ||
    budgetId < 1
  ) {
    const error =
      new Error(
        'A valid UHP budget is required'
      );

    error.statusCode = 400;
    throw error;
  }

  if (
    !Number.isInteger(
      reasonCodeId
    ) ||
    reasonCodeId < 1
  ) {
    const error =
      new Error(
        'A valid reason code is required'
      );

    error.statusCode = 400;
    throw error;
  }

  const coding =
    validateBookingCoding({
      userId,
      budgetId,
      reasonCodeId
    });

  /*
    Live Autocab modification requires
    coordinates for every route point.
    Validate them before taking the local
    modification lock.
  */
  buildAutocabRoutePoint(
    pickup,
    'Pickup'
  );

  for (const via of vias) {
    buildAutocabRoutePoint(
      via,
      'Via'
    );
  }

  buildAutocabRoutePoint(
    destination,
    'Destination'
  );

  return {
    requestedPickupAt,
    passengerName,
    passengerMobile,
    passengerCount,
    pickup,
    destination,
    vias,
    driverNotes,
    budgetId,
    reasonCodeId,
    ...coding
  };
}


function writeAutocabModificationBookingEvent({
  bookingId,
  eventType,
  oldStatus,
  newStatus,
  userId,
  notes,
  rawPayload = null
}) {
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
      ?,
      'portal',
      ?,
      ?,
      ?,
      ?,
      ?
    )
  `).run(
    bookingId,
    eventType,
    oldStatus,
    newStatus,
    userId,
    notes,
    rawPayload
      ? JSON.stringify(
          rawPayload
        )
      : null
  );
}


function lockLiveBookingForModification({
  bookingId,
  userId,
  autocabBookingId,
  previousStatus,
  rowVersion
}) {
  db.exec('BEGIN');

  try {
    const update =
      db.prepare(`
        UPDATE bookings
        SET
          operational_status =
            'modifying',
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
          AND created_by_user_id = ?
          AND operational_status = ?
          AND autocab_booking_id = ?
      `).run(
        bookingId,
        userId,
        previousStatus,
        autocabBookingId
      );

    if (update.changes !== 1) {
      const error =
        new Error(
          'Booking state changed before modification started'
        );

      error.statusCode = 409;
      throw error;
    }

    writeAutocabModificationBookingEvent({
      bookingId,
      eventType:
        'autocab_modification_started',
      oldStatus:
        previousStatus,
      newStatus:
        'modifying',
      userId,
      notes:
        'Live Autocab booking modification started',
      rawPayload: {
        autocabBookingId,
        rowVersion
      }
    });

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function restoreLiveBookingAfterModificationRejection({
  bookingId,
  userId,
  previousStatus,
  autocabBookingId,
  responseStatus = null
}) {
  db.exec('BEGIN');

  try {
    const transition =
      db.prepare(`
        UPDATE bookings
        SET
          operational_status = ?,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
          AND operational_status =
            'modifying'
      `).run(
        previousStatus,
        bookingId
      );

    if (transition.changes === 1) {
      writeAutocabModificationBookingEvent({
        bookingId,
        eventType:
          'autocab_modification_rejected',
        oldStatus:
          'modifying',
        newStatus:
          previousStatus,
        userId,
        notes:
          responseStatus === null
            ? 'Autocab rejected live booking modification'
            : `Autocab rejected live booking modification with HTTP ${responseStatus}`,
        rawPayload: {
          autocabBookingId,
          responseStatus
        }
      });
    }

    db.exec('COMMIT');

    return (
      transition.changes === 1
    );
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function markLiveBookingModificationUncertain({
  bookingId,
  userId,
  autocabBookingId,
  reason,
  responseStatus = null
}) {
  db.exec('BEGIN');

  try {
    const transition =
      db.prepare(`
        UPDATE bookings
        SET
          operational_status =
            'requires_review',
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
          AND operational_status =
            'modifying'
      `).run(
        bookingId
      );

    if (transition.changes === 1) {
      writeAutocabModificationBookingEvent({
        bookingId,
        eventType:
          'autocab_modification_uncertain',
        oldStatus:
          'modifying',
        newStatus:
          'requires_review',
        userId,
        notes:
          reason ||
          'Autocab modification result is uncertain and requires manual review',
        rawPayload: {
          autocabBookingId,
          responseStatus
        }
      });
    } else {
      /*
        A webhook may legitimately advance the
        booking while the modification request is
        in flight. Preserve that newer operational
        state, but still leave a booking-level
        reconciliation warning.
      */
      const current =
        db.prepare(`
          SELECT operational_status
            AS operationalStatus
          FROM bookings
          WHERE id = ?
        `).get(
          bookingId
        );

      if (current) {
        writeAutocabModificationBookingEvent({
          bookingId,
          eventType:
            'autocab_modification_reconciliation_required',
          oldStatus:
            current.operationalStatus,
          newStatus:
            current.operationalStatus,
          userId,
          notes:
            reason ||
            'Autocab modification result requires manual reconciliation',
          rawPayload: {
            autocabBookingId,
            responseStatus,
            operationalStatusPreserved:
              current.operationalStatus
          }
        });
      }
    }

    db.exec('COMMIT');

    return (
      transition.changes === 1
    );
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function verifyAutocabModificationResult({
  beforeBooking,
  expectedPayload,
  afterBooking
}) {
  if (
    !beforeBooking ||
    typeof beforeBooking !== 'object' ||
    !expectedPayload ||
    typeof expectedPayload !== 'object' ||
    !afterBooking ||
    typeof afterBooking !== 'object'
  ) {
    const error =
      new Error(
        'Autocab modification verification data is invalid'
      );

    error.statusCode = 502;
    throw error;
  }

  const beforeRowVersion =
    Number(
      beforeBooking.rowVersion
    );

  const afterRowVersion =
    Number(
      afterBooking.rowVersion
    );

  if (
    !Number.isFinite(
      beforeRowVersion
    ) ||
    !Number.isFinite(
      afterRowVersion
    ) ||
    afterRowVersion <=
      beforeRowVersion
  ) {
    const error =
      new Error(
        'Autocab modification could not be verified because the row version did not advance'
      );

    error.statusCode = 502;
    throw error;
  }

  const scalar =
    (value) =>
      String(
        value ?? ''
      ).trim();

  const sameInstant =
    (left, right) => {
      const leftTime =
        Date.parse(
          String(
            left || ''
          )
        );

      const rightTime =
        Date.parse(
          String(
            right || ''
          )
        );

      return (
        Number.isFinite(
          leftTime
        ) &&
        Number.isFinite(
          rightTime
        ) &&
        leftTime === rightTime
      );
    };

  const sameCoordinate =
    (left, right) => {
      const leftNumber =
        Number(left);

      const rightNumber =
        Number(right);

      return (
        Number.isFinite(
          leftNumber
        ) &&
        Number.isFinite(
          rightNumber
        ) &&
        Math.abs(
          leftNumber -
          rightNumber
        ) < 0.000001
      );
    };

  const sameRoutePoint =
    (expected, actual) => {
      if (
        !expected ||
        !actual
      ) {
        return false;
      }

      return (
        scalar(
          expected?.address?.text
        ) ===
          scalar(
            actual?.address?.text
          ) &&
        scalar(
          expected?.address?.postCode
        ).toUpperCase() ===
          scalar(
            actual?.address?.postCode
          ).toUpperCase() &&
        sameCoordinate(
          expected?.address
            ?.coordinate
            ?.latitude,
          actual?.address
            ?.coordinate
            ?.latitude
        ) &&
        sameCoordinate(
          expected?.address
            ?.coordinate
            ?.longitude,
          actual?.address
            ?.coordinate
            ?.longitude
        ) &&
        scalar(
          expected?.note
        ) ===
          scalar(
            actual?.note
          ) &&
        scalar(
          expected?.type
        ).toLowerCase() ===
          scalar(
            actual?.type
          ).toLowerCase()
      );
    };

  const expectedVias =
    Array.isArray(
      expectedPayload.vias
    )
      ? expectedPayload.vias
      : [];

  const actualVias =
    Array.isArray(
      afterBooking.vias
    )
      ? afterBooking.vias
      : [];

  const scalarFieldsMatch =
    scalar(
      afterBooking.driverNote
    ) ===
      scalar(
        expectedPayload.driverNote
      ) &&
    scalar(
      afterBooking.officeNote
    ) ===
      scalar(
        expectedPayload.officeNote
      ) &&
    scalar(
      afterBooking.name
    ) ===
      scalar(
        expectedPayload.name
      ) &&
    scalar(
      afterBooking.passengers
    ) ===
      scalar(
        expectedPayload.passengers
      ) &&
    scalar(
      afterBooking.telephoneNumber
    ) ===
      scalar(
        expectedPayload.telephoneNumber
      ) &&
    scalar(
      afterBooking.ourReference
    ) ===
      scalar(
        expectedPayload.ourReference
      ) &&
    scalar(
      afterBooking
        ?.yourReferences
        ?.yourReference1
    ) ===
      scalar(
        expectedPayload
          ?.yourReferences
          ?.yourReference1
      ) &&
    scalar(
      afterBooking
        ?.yourReferences
        ?.yourReference2
    ) ===
      scalar(
        expectedPayload
          ?.yourReferences
          ?.yourReference2
      );

  const routeMatches =
    sameRoutePoint(
      expectedPayload.pickup,
      afterBooking.pickup
    ) &&
    sameRoutePoint(
      expectedPayload.destination,
      afterBooking.destination
    ) &&
    expectedVias.length ===
      actualVias.length &&
    expectedVias.every(
      (expectedVia, index) =>
        sameRoutePoint(
          expectedVia,
          actualVias[index]
        )
    );

  const pickupTimeMatches =
    sameInstant(
      expectedPayload.pickupDueTimeUtc,
      afterBooking.pickupDueTimeUtc
    );

  if (
    !scalarFieldsMatch ||
    !routeMatches ||
    !pickupTimeMatches
  ) {
    const error =
      new Error(
        'Autocab accepted the modification but the updated booking could not be verified'
      );

    error.statusCode = 502;
    throw error;
  }

  return {
    rowVersion:
      afterRowVersion
  };
}


function commitSuccessfulLiveModification({
  bookingId,
  userId,
  autocabBookingId,
  previousStatus,
  validated,
  oldState,
  responseStatus
}) {
  const {
    requestedPickupAt,
    passengerName,
    passengerMobile,
    passengerCount,
    pickup,
    destination,
    vias,
    driverNotes,
    budgetId,
    reasonCodeId,
    budget,
    reasonCode,
    budgetHolder
  } = validated;

  db.exec('BEGIN');

  try {
    /*
      Restore the pre-modification status only
      when the booking is still in our temporary
      'modifying' state.

      If an Autocab webhook advanced the booking
      while the POST was in flight, preserve that
      newer operational state.
    */
    const update =
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
          operational_status =
            CASE
              WHEN operational_status =
                'modifying'
              THEN ?
              ELSE operational_status
            END,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
          AND autocab_booking_id = ?
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
        previousStatus,
        bookingId,
        autocabBookingId
      );

    if (update.changes !== 1) {
      const error =
        new Error(
          'Live booking changed before the confirmed modification could be stored locally'
        );

      error.statusCode = 409;
      throw error;
    }

    db.prepare(`
      DELETE FROM booking_stops
      WHERE booking_id = ?
    `).run(
      bookingId
    );

    const insertStop =
      db.prepare(`
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
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
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

    const snapshotUpdate =
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
          captured_at =
            CURRENT_TIMESTAMP
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

    if (snapshotUpdate.changes !== 1) {
      const error =
        new Error(
          'Live booking account snapshot could not be updated'
        );

      error.statusCode = 500;
      throw error;
    }

    const current =
      db.prepare(`
        SELECT
          operational_status
            AS operationalStatus
        FROM bookings
        WHERE id = ?
      `).get(
        bookingId
      );

    const newState = {
      requestedPickupAt,
      passengerName,
      passengerMobile,
      passengerCount,
      pickupAddress:
        pickup.address,
      destinationAddress:
        destination.address,
      driverNotes:
        driverNotes || null,
      budgetId,
      reasonCodeId,
      budgetHolderUserId:
        budgetHolder.id,
      operationalStatus:
        current?.operationalStatus ||
        previousStatus,
      stops:
        getBookingStops(
          bookingId
        )
    };

    const oldPickup =
      oldState.stops?.find(
        (stop) =>
          stop.stopType === 'pickup'
      ) || null;

    const newPickup =
      newState.stops?.find(
        (stop) =>
          stop.stopType === 'pickup'
      ) || null;

    const oldDestination =
      oldState.stops?.find(
        (stop) =>
          stop.stopType === 'destination'
      ) || null;

    const newDestination =
      newState.stops?.find(
        (stop) =>
          stop.stopType === 'destination'
      ) || null;

    const oldVias =
      (oldState.stops || [])
        .filter(
          (stop) =>
            stop.stopType === 'via'
        );

    const newVias =
      (newState.stops || [])
        .filter(
          (stop) =>
            stop.stopType === 'via'
        );

    const amendmentStopSummary =
      (stop) =>
        stop
          ? [
              stop.address,
              stop.postcode
            ]
              .filter(Boolean)
              .join(', ')
          : '';

    const amendmentViaSummary =
      (stops) =>
        stops.length
          ? stops
              .map(
                amendmentStopSummary
              )
              .join(' → ')
          : 'None';

    const amendmentValue =
      (value) =>
        value === null ||
        value === undefined
          ? ''
          : String(value).trim();

    const amendmentChanges = [
      {
        field: 'requestedPickupAt',
        label: 'Pickup date & time',
        before:
          oldState.requestedPickupAt,
        after:
          newState.requestedPickupAt,
        valueType: 'datetime'
      },
      {
        field: 'pickup',
        label: 'Pickup',
        before:
          amendmentStopSummary(
            oldPickup
          ) ||
          oldState.pickupAddress ||
          '',
        after:
          amendmentStopSummary(
            newPickup
          ) ||
          newState.pickupAddress ||
          ''
      },
      {
        field: 'vias',
        label: 'Via points',
        before:
          amendmentViaSummary(
            oldVias
          ),
        after:
          amendmentViaSummary(
            newVias
          )
      },
      {
        field: 'destination',
        label: 'Destination',
        before:
          amendmentStopSummary(
            oldDestination
          ) ||
          oldState.destinationAddress ||
          '',
        after:
          amendmentStopSummary(
            newDestination
          ) ||
          newState.destinationAddress ||
          ''
      },
      {
        field: 'passengerName',
        label: 'Passenger name',
        before:
          oldState.passengerName,
        after:
          newState.passengerName
      },
      {
        field: 'passengerMobile',
        label: 'Contact number',
        before:
          oldState.passengerMobile,
        after:
          newState.passengerMobile
      },
      {
        field: 'passengerCount',
        label: 'Passenger count',
        before:
          oldState.passengerCount,
        after:
          newState.passengerCount
      },
      {
        field: 'budget',
        label: 'Budget',
        before:
          [
            oldState.accountSnapshot
              ?.budget_number,
            oldState.accountSnapshot
              ?.budget_name
          ]
            .filter(Boolean)
            .join(' — ') ||
          String(
            oldState.budgetId || ''
          ),
        after:
          [
            budget.budgetNumber,
            budget.name
          ]
            .filter(Boolean)
            .join(' — ')
      },
      {
        field: 'reasonCode',
        label: 'Reason code',
        before:
          [
            oldState.accountSnapshot
              ?.reason_code,
            oldState.accountSnapshot
              ?.reason_description
          ]
            .filter(Boolean)
            .join(' — ') ||
          String(
            oldState.reasonCodeId || ''
          ),
        after:
          [
            reasonCode.code,
            reasonCode.description
          ]
            .filter(Boolean)
            .join(' — ')
      },
      {
        field: 'budgetHolder',
        label: 'Budget holder',
        before:
          oldState.accountSnapshot
            ?.budget_holder_name ||
          '',
        after:
          `${budgetHolder.firstName} ${budgetHolder.lastName}`
            .trim()
      },
      {
        field: 'driverNotes',
        label: 'Driver notes',
        before:
          oldState.driverNotes || '',
        after:
          newState.driverNotes || ''
      }
    ].filter(
      (change) =>
        amendmentValue(
          change.before
        ) !==
        amendmentValue(
          change.after
        )
    );

    writeAutocabModificationBookingEvent({
      bookingId,
      eventType:
        'booking_amended',
      oldStatus:
        'modifying',
      newStatus:
        newState.operationalStatus,
      userId,
      notes:
        'UHP portal live booking amended',
      rawPayload: {
        autocabBookingId,
        responseStatus,
        changes:
          amendmentChanges
      }
    });

    writeAudit({
      action:
        'UPDATE',
      entityType:
        'booking',
      entityId:
        bookingId,
      oldValue:
        JSON.stringify(
          oldState
        ),
      newValue:
        JSON.stringify(
          newState
        ),
      source:
        'portal',
      actorUserId:
        userId
    });

    db.exec('COMMIT');

    return {
      ...getBookingById(
        bookingId
      ),
      stops:
        getBookingStops(
          bookingId
        )
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function buildAutocabModificationPayload({
  currentBooking,
  publicReference,
  bookedBy,
  requestedPickupAt,
  passengerName,
  passengerMobile,
  passengerCount,
  driverNotes,
  pickup,
  vias,
  destination,
  budgetNumber,
  reasonCode,
  budgetHolder
}) {
  if (
    !currentBooking ||
    typeof currentBooking !== 'object' ||
    Array.isArray(currentBooking)
  ) {
    const error =
      new Error(
        'Current Autocab booking is invalid'
      );

    error.statusCode = 502;
    throw error;
  }

  if (
    !Number.isFinite(
      Number(
        currentBooking.rowVersion
      )
    )
  ) {
    const error =
      new Error(
        'Current Autocab booking has no valid row version'
      );

    error.statusCode = 502;
    throw error;
  }

  const pickupTime =
    normaliseUhpPickupTime(
      requestedPickupAt
    );

  const ourReference =
    [
      reasonCode,
      budgetNumber,
      budgetHolder
    ]
      .filter(Boolean)
      .join('/');

  /*
    Start with the complete authoritative
    Autocab booking returned by GET.

    Only fields controlled by the UHP portal
    are replaced. All other Autocab-managed
    fields, including rowVersion, pricing,
    allocation and booking metadata, remain
    untouched.
  */
  const modified = {
    ...currentBooking,

    driverNote:
      driverNotes || '',

    officeNote:
      [
        'UHP Portal',
        publicReference,
        bookedBy
          ? `Booked by ${bookedBy}`
          : null,
        budgetNumber
          ? `Budget ${budgetNumber}`
          : null,
        reasonCode
          ? `Reason ${reasonCode}`
          : null
      ]
        .filter(Boolean)
        .join(' - '),

    name:
      passengerName,

    passengers:
      String(
        passengerCount || 1
      ),

    telephoneNumber:
      passengerMobile,

    ourReference,

    pickup:
      buildAutocabRoutePoint(
        pickup,
        'Pickup'
      ),

    vias:
      (Array.isArray(vias)
        ? vias
        : []
      ).map(
        (via) =>
          buildAutocabRoutePoint(
            via,
            'Via'
          )
      ),

    destination:
      buildAutocabRoutePoint(
        destination,
        'Destination'
      ),

    pickupDueTime:
      pickupTime.local,

    pickupDueTimeUtc:
      pickupTime.utc,

    yourReferences: {
      ...(
        currentBooking.yourReferences &&
        typeof currentBooking.yourReferences ===
          'object'
          ? currentBooking.yourReferences
          : {}
      ),

      yourReference1:
        publicReference,

      yourReference2:
        ourReference
    }
  };

  return modified;
}


function createAutocabModificationOutboundEvent({
  bookingId,
  autocabBookingId,
  autocabReference,
  payload
}) {
  const result =
    db.prepare(`
      INSERT INTO integration_events
        (
          provider,
          direction,
          event_type,
          route_suffix,
          category,
          booking_id,
          autocab_booking_id,
          autocab_reference,
          payload_json,
          processing_status
        )
      VALUES (
        'autocab',
        'outbound',
        'booking_modify',
        'booking',
        'booking',
        ?,
        ?,
        ?,
        ?,
        'received'
      )
    `).run(
      bookingId,
      autocabBookingId,
      autocabReference,
      JSON.stringify({
        request: {
          method: 'POST',
          bookingId:
            autocabBookingId,
          body: payload
        }
      })
    );

  return Number(
    result.lastInsertRowid
  );
}


async function getAutocabBookingForModification(
  autocabBookingId
) {
  if (!AUTOCAB_SUBSCRIPTION_KEY) {
    const error =
      new Error(
        'Autocab booking modification is not configured'
      );

    error.statusCode = 503;
    throw error;
  }

  const response =
    await fetch(
      `${AUTOCAB_BOOKING_API_URL}/booking/v1/booking/${encodeURIComponent(
        autocabBookingId
      )}`,
      {
        method: 'GET',

        headers: {
          'Cache-Control':
            'no-cache',

          'Ocp-Apim-Subscription-Key':
            AUTOCAB_SUBSCRIPTION_KEY
        },

        signal:
          AbortSignal.timeout(
            15000
          )
      }
    );

  const responseText =
    await response.text();

  if (!response.ok) {
    const error =
      new Error(
        `Autocab booking lookup failed with status ${response.status}`
      );

    error.statusCode = 502;
    error.autocabStatus =
      response.status;
    error.autocabResponse =
      responseText;

    throw error;
  }

  let payload;

  try {
    payload =
      JSON.parse(
        responseText
      );
  } catch {
    const error =
      new Error(
        'Autocab booking lookup returned invalid JSON'
      );

    error.statusCode = 502;
    throw error;
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    const error =
      new Error(
        'Autocab booking lookup returned an invalid booking'
      );

    error.statusCode = 502;
    throw error;
  }

  if (
    !Number.isFinite(
      Number(
        payload.rowVersion
      )
    )
  ) {
    const error =
      new Error(
        'Autocab booking does not contain a valid row version'
      );

    error.statusCode = 502;
    throw error;
  }

  return payload;
}


async function postAutocabBookingModification(
  autocabBookingId,
  payload
) {
  if (!AUTOCAB_SUBSCRIPTION_KEY) {
    const error =
      new Error(
        'Autocab booking modification is not configured'
      );

    error.statusCode = 503;
    throw error;
  }

  const response =
    await fetch(
      `${AUTOCAB_BOOKING_API_URL}/booking/v1/booking/${encodeURIComponent(
        autocabBookingId
      )}`,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',

          'Cache-Control':
            'no-cache',

          'Ocp-Apim-Subscription-Key':
            AUTOCAB_SUBSCRIPTION_KEY
        },

        body:
          JSON.stringify(
            payload
          ),

        signal:
          AbortSignal.timeout(
            15000
          )
      }
    );

  const responseText =
    await response.text();

  let responsePayload = null;

  if (responseText) {
    try {
      responsePayload =
        JSON.parse(
          responseText
        );
    } catch {
      responsePayload = null;
    }
  }

  return {
    status:
      response.status,
    ok:
      response.ok,
    responseText,
    responsePayload
  };
}


function updateAutocabOutboundEvent(
  eventId,
  {
    processingStatus,
    autocabBookingId = null,
    autocabReference = null,
    payload = null,
    processingError = null
  }
) {
  db.prepare(`
    UPDATE integration_events
    SET
      autocab_booking_id =
        COALESCE(?, autocab_booking_id),

      autocab_reference =
        COALESCE(?, autocab_reference),

      payload_json =
        COALESCE(?, payload_json),

      processing_status = ?,
      processing_error = ?,

      processed_at =
        CURRENT_TIMESTAMP

    WHERE id = ?
  `).run(
    autocabBookingId,
    autocabReference,
    payload
      ? JSON.stringify(payload)
      : null,
    processingStatus,
    processingError,
    eventId
  );
}


function writeAutocabSubmissionBookingEvent({
  bookingId,
  eventType,
  oldStatus,
  newStatus,
  notes,
  rawPayload = null
}) {
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
      ?,
      'portal',
      ?,
      ?,
      ?,
      ?
    )
  `).run(
    bookingId,
    eventType,
    oldStatus,
    newStatus,
    notes,
    rawPayload
      ? JSON.stringify(rawPayload)
      : null
  );
}


async function modifyLivePortalBooking(
  bookingId,
  userId,
  payload
) {
  /*
    1. Confirm management authority/current state.
    2. Fully validate the proposed UHP data.
    3. GET the authoritative Autocab booking.
    4. Build a full-object modification using
       Autocab's current rowVersion.
    5. Create the outbound integration record.
    6. CAS-lock the local booking as modifying.
    7. POST the modification.
    8. Treat any HTTP 2xx as authoritative success.
    9. Commit the validated amendment locally.
  */
  const {
    booking,
    autocabBookingId
  } =
    getManageableLiveModifiableBooking(
      bookingId,
      userId
    );

  const previousStatus =
    booking.operational_status;

  const validated =
    validateLiveModificationPayload(
      userId,
      payload
    );

  const bookingDetails =
    getBookingById(
      bookingId
    );

  if (!bookingDetails) {
    const error =
      new Error(
        'Booking not found'
      );

    error.statusCode = 404;
    throw error;
  }

  const oldStops =
    getBookingStops(
      bookingId
    );

  const previousSnapshot =
    db.prepare(`
      SELECT *
      FROM booking_account_snapshot
      WHERE booking_id = ?
    `).get(
      bookingId
    );

  const oldState = {
    requestedPickupAt:
      bookingDetails.requestedPickupAt,
    passengerName:
      bookingDetails.passengerName,
    passengerMobile:
      bookingDetails.passengerMobile,
    passengerCount:
      bookingDetails.passengerCount,
    pickupAddress:
      bookingDetails.pickupAddress,
    destinationAddress:
      bookingDetails.destinationAddress,
    driverNotes:
      bookingDetails.driverNotes,
    budgetId:
      bookingDetails.budgetId,
    reasonCodeId:
      bookingDetails.reasonCodeId,
    budgetHolderUserId:
      bookingDetails.budgetHolderUserId,
    operationalStatus:
      bookingDetails.operationalStatus,
    stops:
      oldStops,
    accountSnapshot:
      previousSnapshot || null
  };

  /*
    This GET happens before the local lock so a
    slow/unavailable Autocab service does not
    leave the booking unnecessarily blocked.
  */
  const beforeBooking =
    await getAutocabBookingForModification(
      autocabBookingId
    );

  const modificationPayload =
    buildAutocabModificationPayload({
      currentBooking:
        beforeBooking,
      publicReference:
        bookingDetails.publicReference,
      bookedBy:
        bookingDetails.createdBy,
      requestedPickupAt:
        validated.requestedPickupAt,
      passengerName:
        validated.passengerName,
      passengerMobile:
        validated.passengerMobile,
      passengerCount:
        validated.passengerCount,
      driverNotes:
        validated.driverNotes,
      pickup:
        validated.pickup,
      vias:
        validated.vias,
      destination:
        validated.destination,
      budgetNumber:
        validated.budget.budgetNumber,
      reasonCode:
        validated.reasonCode.code,
      budgetHolder:
        `${validated.budgetHolder.firstName} ${validated.budgetHolder.lastName}`
    });

  const eventId =
    createAutocabModificationOutboundEvent({
      bookingId,
      autocabBookingId,
      autocabReference:
        booking.autocab_reference,
      payload:
        modificationPayload
    });

  try {
    lockLiveBookingForModification({
      bookingId,
      userId,
      autocabBookingId,
      previousStatus,
      rowVersion:
        beforeBooking.rowVersion
    });
  } catch (error) {
    updateAutocabOutboundEvent(
      eventId,
      {
        processingStatus:
          'failed',
        autocabBookingId,
        autocabReference:
          booking.autocab_reference,
        processingError:
          String(
            error?.message ||
            'Modification state update failed'
          )
      }
    );

    throw error;
  }

  let response;

  try {
    response =
      await postAutocabBookingModification(
        autocabBookingId,
        modificationPayload
      );
  } catch (error) {
    /*
      Network/timeout is ambiguous. Autocab may
      have processed the POST before the response
      was lost. Never retry automatically.
    */
    markLiveBookingModificationUncertain({
      bookingId,
      userId,
      autocabBookingId,
      reason:
        'Autocab modification result is uncertain after a network or timeout error'
    });

    updateAutocabOutboundEvent(
      eventId,
      {
        processingStatus:
          'failed',
        autocabBookingId,
        autocabReference:
          booking.autocab_reference,
        payload: {
          request: {
            method:
              'POST',
            bookingId:
              autocabBookingId,
            body:
              modificationPayload
          },
          networkError:
            String(
              error?.message ||
              'Network error'
            )
        },
        processingError:
          'Autocab modification result is uncertain'
      }
    );

    const uncertainError =
      new Error(
        'Autocab modification result is uncertain. Check Autocab before retrying.'
      );

    uncertainError.statusCode = 502;
    throw uncertainError;
  }

  /*
    A 4xx response is a definitive rejection of
    this exact POST. Restore the previous local
    state only if no webhook changed it meanwhile.
  */
  if (
    !response.ok &&
    response.status >= 400 &&
    response.status < 500
  ) {
    restoreLiveBookingAfterModificationRejection({
      bookingId,
      userId,
      previousStatus,
      autocabBookingId,
      responseStatus:
        response.status
    });

    updateAutocabOutboundEvent(
      eventId,
      {
        processingStatus:
          'failed',
        autocabBookingId,
        autocabReference:
          booking.autocab_reference,
        payload: {
          request: {
            method:
              'POST',
            bookingId:
              autocabBookingId,
            body:
              modificationPayload
          },
          responseStatus:
            response.status,
          response:
            response.responsePayload
        },
        processingError:
          `Autocab rejected modification with HTTP ${response.status}`
      }
    );

    const error =
      new Error(
        `Autocab rejected the booking amendment with HTTP ${response.status}`
      );

    error.statusCode = 502;
    throw error;
  }

  /*
    5xx and any other non-success response are
    ambiguous. Do not retry automatically.
  */
  if (!response.ok) {
    markLiveBookingModificationUncertain({
      bookingId,
      userId,
      autocabBookingId,
      reason:
        'Autocab returned an uncertain booking modification result',
      responseStatus:
        response.status
    });

    updateAutocabOutboundEvent(
      eventId,
      {
        processingStatus:
          'failed',
        autocabBookingId,
        autocabReference:
          booking.autocab_reference,
        payload: {
          request: {
            method:
              'POST',
            bookingId:
              autocabBookingId,
            body:
              modificationPayload
          },
          responseStatus:
            response.status,
          response:
            response.responsePayload
        },
        processingError:
          'Autocab modification requires manual review'
      }
    );

    const error =
      new Error(
        'Autocab booking amendment requires manual review before retrying'
      );

    error.statusCode = 502;
    throw error;
  }

  /*
    Any HTTP 2xx response from the Autocab
    modification endpoint is authoritative
    success for this amendment.

    Do not perform a second GET here. The
    validated local amendment can be committed
    immediately, avoiding an unnecessary
    Autocab API call.
  */

  let amendedBooking;

  try {
    amendedBooking =
      commitSuccessfulLiveModification({
        bookingId,
        userId,
        autocabBookingId,
        previousStatus,
        validated,
        oldState,
        responseStatus:
          response.status
      });
  } catch (error) {
    /*
      Autocab has already returned a successful
      response. A local persistence failure therefore
      means UHP and Autocab may differ and requires
      reconciliation rather than rollback/retry.
    */
    markLiveBookingModificationUncertain({
      bookingId,
      userId,
      autocabBookingId,
      reason:
        'Autocab modification succeeded but the confirmed amendment could not be stored locally',
      responseStatus:
        response.status
    });

    updateAutocabOutboundEvent(
      eventId,
      {
        processingStatus:
          'failed',
        autocabBookingId,
        autocabReference:
          booking.autocab_reference,
        payload: {
          request: {
            method:
              'POST',
            bookingId:
              autocabBookingId,
            body:
              modificationPayload
          },
          responseStatus:
            response.status,
          response:
            response.responsePayload,
          persistenceError:
            String(
              error?.message ||
              'Local persistence failed'
            )
        },
        processingError:
          'Autocab amendment succeeded but local reconciliation failed'
      }
    );

    const persistenceError =
      new Error(
        'The booking was amended in Autocab but the portal could not store the confirmed amendment. Manual reconciliation is required.'
      );

    persistenceError.statusCode =
      500;

    throw persistenceError;
  }

  updateAutocabOutboundEvent(
    eventId,
    {
      processingStatus:
        'processed',
      autocabBookingId,
      autocabReference:
        booking.autocab_reference,
      payload: {
        request: {
          method:
            'POST',
          bookingId:
            autocabBookingId,
          body:
            modificationPayload
        },
        responseStatus:
          response.status,
        response:
          response.responsePayload
      },
      processingError:
        null
    }
  );

  return {
    booking:
      amendedBooking,
    modified:
      true,
    responseStatus:
      response.status
  };
}


async function submitPortalBookingToAutocab(
  bookingId,
  {
    accountType = 'uhp'
  } = {}
) {
  if (!AUTOCAB_SUBSCRIPTION_KEY) {
    const error =
      new Error(
        'Autocab booking submission is not configured'
      );

    error.statusCode = 503;

    throw error;
  }

  if (
    !Number.isInteger(
      AUTOCAB_COMPANY_ID
    ) ||
    AUTOCAB_COMPANY_ID < 1
  ) {
    const error =
      new Error(
        'Autocab company ID is not configured correctly'
      );

    error.statusCode = 500;

    throw error;
  }

  const booking =
    db.prepare(`
      SELECT
        id,
        public_reference
          AS publicReference,
        operational_status
          AS operationalStatus,
        autocab_booking_id
          AS autocabBookingId
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

  /*
    Successful submission is idempotent
    from the portal's point of view.
  */
  if (
    booking.autocabBookingId &&
    [
      'booked',
      'confirmed',
      'driver_allocated',
      'driver_en_route',
      'driver_arrived',
      'passenger_on_board',
      'completed'
    ].includes(
      booking.operationalStatus
    )
  ) {
    return {
      booking: {
        ...getBookingById(
          bookingId
        ),
        stops:
          getBookingStops(
            bookingId
          )
      },

      alreadySubmitted:
        true
    };
  }

  if (
    booking.operationalStatus !==
      'draft'
  ) {
    const error =
      new Error(
        `Booking cannot be submitted from status ${booking.operationalStatus}`
      );

    error.statusCode = 409;

    throw error;
  }

  const payload =
    buildAutocabBookingPayload(
      bookingId,
      {
        accountType
      }
    );

  const eventId =
    createAutocabOutboundEvent({
      bookingId,
      autocabReference:
        payload.ourReference,
      payload
    });

  db.exec('BEGIN');

  try {
    const update =
      db.prepare(`
        UPDATE bookings
        SET
          operational_status =
            'submitting',
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
          AND operational_status =
            'draft'
          AND autocab_booking_id
            IS NULL
      `).run(
        bookingId
      );

    if (update.changes !== 1) {
      const error =
        new Error(
          'Booking submission state changed before submission started'
        );

      error.statusCode = 409;

      throw error;
    }

    writeAutocabSubmissionBookingEvent({
      bookingId,
      eventType:
        'autocab_submission_started',
      oldStatus:
        'draft',
      newStatus:
        'submitting',
      notes:
        'UHP portal submission to Autocab started',
      rawPayload: {
        customerId:
          payload.customerId,
        ourReference:
          payload.ourReference,
        publicReference:
          booking.publicReference
      }
    });

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');

    updateAutocabOutboundEvent(
      eventId,
      {
        processingStatus:
          'failed',

        autocabReference:
          payload.ourReference,

        processingError:
          String(
            error?.message ||
            'Submission state update failed'
          )
      }
    );

    throw error;
  }

  let response;
  let responseText = '';

  try {
    response =
      await fetch(
        `${AUTOCAB_BOOKING_API_URL}/booking/v1/booking?override=true`,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json',

            'Cache-Control':
              'no-cache',

            'Ocp-Apim-Subscription-Key':
              AUTOCAB_SUBSCRIPTION_KEY
          },

          body:
            JSON.stringify(
              payload
            ),

          signal:
            AbortSignal.timeout(
              15000
            )
        }
      );

    responseText =
      await response.text();
  } catch (error) {
    /*
      Network/time-out failures are
      ambiguous: Autocab may have created
      the booking before the connection
      failed.

      Never retry automatically.
    */
    db.exec('BEGIN');

    try {
      db.prepare(`
        UPDATE bookings
        SET
          operational_status =
            'requires_review',
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
          AND operational_status =
            'submitting'
      `).run(
        bookingId
      );

      writeAutocabSubmissionBookingEvent({
        bookingId,
        eventType:
          'autocab_submission_uncertain',
        oldStatus:
          'submitting',
        newStatus:
          'requires_review',
        notes:
          'Autocab submission result is uncertain and requires manual review',
        rawPayload: {
          error:
            String(
              error?.message ||
              'Network error'
            )
        }
      });

      db.exec('COMMIT');
    } catch (dbError) {
      db.exec('ROLLBACK');
      throw dbError;
    }

    updateAutocabOutboundEvent(
      eventId,
      {
        processingStatus:
          'failed',

        autocabReference:
          payload.ourReference,

        payload: {
          request: payload,
          networkError:
            String(
              error?.message ||
              'Network error'
            )
        },

        processingError:
          'Autocab submission result is uncertain'
      }
    );

    const uncertainError =
      new Error(
        'Autocab submission result is uncertain. Check Autocab before retrying.'
      );

    uncertainError.statusCode =
      502;

    throw uncertainError;
  }

  let responseBody = null;

  if (responseText) {
    try {
      responseBody =
        JSON.parse(
          responseText
        );
    } catch {
      responseBody =
        responseText;
    }
  }

  const autocabBookingId =
    responseBody &&
    typeof responseBody ===
      'object'
      ? Number(
          responseBody.bookingId
        )
      : NaN;

  const validBookingId =
    Number.isInteger(
      autocabBookingId
    ) &&
    autocabBookingId > 0;

  /*
    4xx is a definitive rejection.
    No Autocab booking should have been
    created, so this can safely be failed.
  */
  if (
    !response.ok &&
    response.status >= 400 &&
    response.status < 500
  ) {
    db.exec('BEGIN');

    try {
      db.prepare(`
        UPDATE bookings
        SET
          operational_status =
            'failed',
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
          AND operational_status =
            'submitting'
      `).run(
        bookingId
      );

      writeAutocabSubmissionBookingEvent({
        bookingId,
        eventType:
          'autocab_submission_failed',
        oldStatus:
          'submitting',
        newStatus:
          'failed',
        notes:
          `Autocab rejected booking submission with HTTP ${response.status}`,
        rawPayload: {
          status:
            response.status,
          response:
            responseBody
        }
      });

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    updateAutocabOutboundEvent(
      eventId,
      {
        processingStatus:
          'failed',

        autocabReference:
          payload.ourReference,

        payload: {
          request: payload,
          responseStatus:
            response.status,
          response:
            responseBody
        },

        processingError:
          `Autocab rejected booking with HTTP ${response.status}`
      }
    );

    const error =
      new Error(
        `Autocab rejected the booking with HTTP ${response.status}`
      );

    error.statusCode = 502;

    throw error;
  }

  /*
    5xx, unexpected non-2xx responses,
    or a success response with no usable
    bookingId are ambiguous.

    Do not automatically retry.
  */
  if (
    !response.ok ||
    !validBookingId
  ) {
    db.exec('BEGIN');

    try {
      db.prepare(`
        UPDATE bookings
        SET
          operational_status =
            'requires_review',
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
          AND operational_status =
            'submitting'
      `).run(
        bookingId
      );

      writeAutocabSubmissionBookingEvent({
        bookingId,
        eventType:
          'autocab_submission_uncertain',
        oldStatus:
          'submitting',
        newStatus:
          'requires_review',
        notes:
          'Autocab returned an uncertain booking submission result',
        rawPayload: {
          status:
            response.status,
          response:
            responseBody
        }
      });

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    updateAutocabOutboundEvent(
      eventId,
      {
        processingStatus:
          'failed',

        autocabReference:
          payload.ourReference,

        payload: {
          request: payload,
          responseStatus:
            response.status,
          response:
            responseBody
        },

        processingError:
          'Autocab submission requires manual review'
      }
    );

    const error =
      new Error(
        'Autocab submission requires manual review before retrying'
      );

    error.statusCode = 502;

    throw error;
  }

  const now =
    new Date().toISOString();

  db.exec('BEGIN');

  try {
    db.prepare(`
      UPDATE bookings
      SET
        autocab_booking_id = ?,
        autocab_reference = ?,
        autocab_booked_by =
          'UHP Portal',
        autocab_booking_source =
          'API',
        autocab_booked_at = ?,
        operational_status =
          'booked',
        submitted_at = ?,
        updated_at =
          CURRENT_TIMESTAMP
      WHERE id = ?
        AND operational_status =
          'submitting'
        AND autocab_booking_id
          IS NULL
    `).run(
      String(
        autocabBookingId
      ),
      payload.ourReference,
      now,
      now,
      bookingId
    );

    /*
      Keep the financial snapshot aligned
      with the customer ID actually sent
      to Autocab.
    */
    db.prepare(`
      UPDATE booking_account_snapshot
      SET
        customer_id = ?,
        captured_at =
          CURRENT_TIMESTAMP
      WHERE booking_id = ?
    `).run(
      String(
        payload.customerId
      ),
      bookingId
    );

    writeAutocabSubmissionBookingEvent({
      bookingId,
      eventType:
        'autocab_booking_created',
      oldStatus:
        'submitting',
      newStatus:
        'booked',
      notes:
        `Autocab booking ${autocabBookingId} created`,
      rawPayload: {
        bookingId:
          autocabBookingId,
        ourReference:
          payload.ourReference,
        customerId:
          payload.customerId
      }
    });

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');

    /*
      Autocab definitely returned a valid
      bookingId but our local persistence
      failed. This must be manually
      reconciled rather than retried.
    */
    db.prepare(`
      UPDATE bookings
      SET
        operational_status =
          'requires_review',
        updated_at =
          CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      bookingId
    );

    updateAutocabOutboundEvent(
      eventId,
      {
        processingStatus:
          'failed',

        autocabBookingId:
          String(
            autocabBookingId
          ),

        autocabReference:
          payload.ourReference,

        payload: {
          request: payload,
          responseStatus:
            response.status,
          response:
            responseBody
        },

        processingError:
          `Autocab booking ${autocabBookingId} was created but local persistence failed`
      }
    );

    const persistenceError =
      new Error(
        `Autocab booking ${autocabBookingId} exists but the portal requires reconciliation`
      );

    persistenceError.statusCode =
      500;

    throw persistenceError;
  }

  updateAutocabOutboundEvent(
    eventId,
    {
      processingStatus:
        'processed',

      autocabBookingId:
        String(
          autocabBookingId
        ),

      autocabReference:
        payload.ourReference,

      payload: {
        request:
          payload,

        responseStatus:
          response.status,

        response:
          responseBody
      },

      processingError:
        null
    }
  );

  return {
    booking: {
      ...getBookingById(
        bookingId
      ),

      stops:
        getBookingStops(
          bookingId
        )
    },

    autocab: {
      bookingId:
        autocabBookingId,

      reference:
        payload.ourReference,

      customerId:
        payload.customerId
    },

    alreadySubmitted:
      false
  };
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


function geocodingDistanceKm(
  latitude,
  longitude,
  targetLatitude = 50.4168,
  targetLongitude = -4.1427
) {
  const lat =
    Number(latitude);

  const lon =
    Number(longitude);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return null;
  }

  const toRadians =
    (value) =>
      value * Math.PI / 180;

  const earthRadiusKm =
    6371;

  const dLat =
    toRadians(
      lat - targetLatitude
    );

  const dLon =
    toRadians(
      lon - targetLongitude
    );

  const a =
    Math.sin(
      dLat / 2
    ) ** 2 +
    Math.cos(
      toRadians(
        targetLatitude
      )
    ) *
    Math.cos(
      toRadians(lat)
    ) *
    Math.sin(
      dLon / 2
    ) ** 2;

  return (
    earthRadiusKm *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}


function scoreGeocodingResult(
  result,
  query
) {
  const text =
    [
      result?.label,
      result?.address,
      result?.postcode
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

  const cleanQuery =
    String(
      query || ''
    )
      .trim()
      .toLowerCase();

  let score = 0;

  /*
   * Plymouth / PL results should beat similarly
   * named distant addresses for this local taxi
   * operation, while UK-wide destinations remain
   * available lower in the results.
   */
  if (
    /^pl\d/i.test(
      String(
        result?.postcode || ''
      ).trim()
    )
  ) {
    score += 1200;
  }

  if (
    text.includes(
      'plymouth'
    )
  ) {
    score += 900;
  }

  if (
    text.includes(
      'derriford'
    )
  ) {
    score += 250;
  }

  const distanceKm =
    geocodingDistanceKm(
      result?.latitude,
      result?.longitude
    );

  if (
    distanceKm !== null
  ) {
    if (distanceKm <= 10) {
      score += 700;
    } else if (
      distanceKm <= 25
    ) {
      score += 450;
    } else if (
      distanceKm <= 60
    ) {
      score += 180;
    }
  }

  if (
    cleanQuery &&
    text.startsWith(
      cleanQuery
    )
  ) {
    score += 220;
  }

  const queryTokens =
    cleanQuery
      .split(
        /[^a-z0-9]+/i
      )
      .filter(
        (token) =>
          token.length >= 3
      );

  for (
    const token of
    queryTokens
  ) {
    if (
      text.includes(token)
    ) {
      score += 40;
    }
  }

  return score;
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

  const queryText =
    String(
      query || ''
    ).trim();

  /*
   * MapTiler can rank an exact-number match in another
   * city above a partially typed local street, for example:
   *
   *   11 thack
   *
   * Search the street portion instead and let Plymouth
   * proximity rank the local street. The user's house
   * number is preserved by the autocomplete when they
   * select the result.
   *
   * This is still one MapTiler request.
   */
  const houseNumberQuery =
    queryText.match(
      /^(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s+(.+)$/
    );

  const providerQuery =
    houseNumberQuery?.[2] &&
    houseNumberQuery[2].trim().length >= 3
      ? houseNumberQuery[2].trim()
      : queryText;

  const url =
    new URL(
      `https://api.maptiler.com/geocoding/${encodeURIComponent(providerQuery)}.json`
    );

  url.searchParams.set(
    'key',
    MAPTILER_GEOCODING_API_KEY
  );

  /*
   * Pull a slightly wider candidate set, then
   * rank it locally. This does not add another
   * API request.
   */
  url.searchParams.set(
    'limit',
    '10'
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
    .map(
      (result, index) => ({
        result,
        index,
        score:
          scoreGeocodingResult(
            result,
            query
          )
      })
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.index - b.index
    )
    .slice(0, 8)
    .map(
      (entry) =>
        entry.result
    );
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


function calculateCoordinateDistanceKm(
  latitude1,
  longitude1,
  latitude2,
  longitude2
) {
  const toRadians =
    (degrees) =>
      degrees *
      Math.PI /
      180;

  const earthRadiusKm =
    6371;

  const deltaLatitude =
    toRadians(
      latitude2 -
      latitude1
    );

  const deltaLongitude =
    toRadians(
      longitude2 -
      longitude1
    );

  const firstLatitude =
    toRadians(latitude1);

  const secondLatitude =
    toRadians(latitude2);

  const a =
    Math.sin(
      deltaLatitude / 2
    ) ** 2 +
    Math.cos(firstLatitude) *
    Math.cos(secondLatitude) *
    Math.sin(
      deltaLongitude / 2
    ) ** 2;

  return (
    earthRadiusKm *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}


async function calculatePickupEta(
  pickup
) {
  if (
    pickup?.latitude === null ||
    pickup?.latitude === undefined ||
    pickup?.latitude === '' ||
    pickup?.longitude === null ||
    pickup?.longitude === undefined ||
    pickup?.longitude === ''
  ) {
    const error =
      new Error(
        'Pickup coordinates are required'
      );

    error.statusCode = 400;

    throw error;
  }

  const latitude =
    Number(
      pickup.latitude
    );

  const longitude =
    Number(
      pickup.longitude
    );

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    const error =
      new Error(
        'Pickup coordinates are invalid'
      );

    error.statusCode = 400;

    throw error;
  }

  const nearbyVehicles =
    listFreshClearVehicles()
      .map(
        (vehicle) => ({
          ...vehicle,

          distanceKm:
            calculateCoordinateDistanceKm(
              latitude,
              longitude,
              vehicle.latitude,
              vehicle.longitude
            )
        })
      )
      .filter(
        (vehicle) =>
          Number.isFinite(
            vehicle.distanceKm
          ) &&
          vehicle.distanceKm <= 15
      )
      .sort(
        (a, b) =>
          a.distanceKm -
          b.distanceKm
      )
      .slice(
        0,
        5
      );

  if (!nearbyVehicles.length) {
    return {
      status: 'unavailable',
      durationSeconds: null,
      nearbyCount: 0
    };
  }

  const candidateResults =
    await Promise.allSettled(
      nearbyVehicles.map(
        async (vehicle) => {
          const eta =
            await calculateAutocabEta([
              {
                latitude:
                  vehicle.latitude,

                longitude:
                  vehicle.longitude
              },

              {
                latitude,
                longitude
              }
            ]);

          return {
            durationSeconds:
              Number(
                eta.durationSeconds
              )
          };
        }
      )
    );

  const successfulEtas =
    candidateResults
      .filter(
        (result) =>
          result.status ===
            'fulfilled' &&
          Number.isFinite(
            result.value
              .durationSeconds
          ) &&
          result.value
            .durationSeconds >= 0
      )
      .map(
        (result) =>
          result.value
            .durationSeconds
      )
      .sort(
        (a, b) =>
          a - b
      );

  if (!successfulEtas.length) {
    return {
      status: 'unavailable',
      durationSeconds: null,
      nearbyCount:
        nearbyVehicles.length
    };
  }

  return {
    status: 'success',

    durationSeconds:
      successfulEtas[0],

    nearbyCount:
      nearbyVehicles.length
  };
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
      url.pathname ===
        '/api/staff-transport/auth/request-email-code'
    ) {
      const payload =
        await readJson(req);

      const challenge =
        await requestStaffTransportEmailCode(
          payload.email,
          payload.accessCode,
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
      url.pathname ===
        '/api/staff-transport/auth/verify-email-code'
    ) {
      const payload =
        await readJson(req);

      const result =
        verifyStaffTransportEmailCode(
          payload.challengeId,
          payload.code,
          req
        );

      return sendJson(
        res,
        200,
        {
          authenticated: true,
          verificationStage:
            'email_verified',
          staff:
            result.staff
        },
        {
          'Set-Cookie':
            buildStaffTransportSessionCookie(
              result.token
            )
        }
      );
    }

    if (
      req.method === 'PATCH' &&
      url.pathname ===
        '/api/staff-transport/auth/profile'
    ) {
      const auth =
        requireStaffTransportAuth(
          req
        );

      const payload =
        await readJson(req);

      const staff =
        updateStaffTransportProfile(
          auth.staff.id,
          payload
        );

      return sendJson(
        res,
        200,
        {
          staff
        }
      );
    }

    if (
      req.method === 'POST' &&
      url.pathname ===
        '/api/staff-transport/auth/request-sms-code'
    ) {
      const auth =
        requireStaffTransportAuth(
          req
        );

      const challenge =
        await requestStaffTransportSmsCode(
          auth.staff.id,
          req
        );

      return sendJson(
        res,
        200,
        {
          ok: true,

          challengeId:
            challenge.challengeId,

          mobile:
            challenge.mobile,

          expiresInSeconds:
            challenge.expiresInSeconds
        }
      );
    }

    if (
      req.method === 'POST' &&
      url.pathname ===
        '/api/staff-transport/auth/verify-sms-code'
    ) {
      const auth =
        requireStaffTransportAuth(
          req
        );

      const payload =
        await readJson(req);

      const staff =
        verifyStaffTransportSmsCode(
          auth.staff.id,
          payload.challengeId,
          payload.code
        );

      return sendJson(
        res,
        200,
        {
          authenticated: true,
          verificationStage:
            staff.status === 'active'
              ? 'complete'
              : 'mobile_verified',
          staff
        }
      );
    }

    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/staff-transport/auth/me'
    ) {
      const auth =
        requireStaffTransportAuth(
          req
        );

      return sendJson(
        res,
        200,
        {
          authenticated: true,
          staff:
            auth.staff
        }
      );
    }

    if (
      req.method === 'POST' &&
      url.pathname ===
        '/api/staff-transport/auth/logout'
    ) {
      logoutStaffTransportSession(
        req
      );

      return sendJson(
        res,
        200,
        {
          authenticated: false
        },
        {
          'Set-Cookie':
            buildExpiredStaffTransportSessionCookie()
        }
      );
    }

    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/staff-transport/request-options'
    ) {
      const auth =
        requireActiveStaffTransportAuth(
          req
        );

      return sendJson(
        res,
        200,
        listStaffTransportRequestOptions(
          auth.staff.id
        )
      );
    }

    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/staff-transport/requests'
    ) {
      const auth =
        requireActiveStaffTransportAuth(
          req
        );

      return sendJson(
        res,
        200,
        {
          requests:
            listTransportRequestsForStaffIdentity(
              auth.staff.id
            )
        }
      );
    }

    if (
      req.method === 'POST' &&
      url.pathname ===
        '/api/staff-transport/requests'
    ) {
      const auth =
        requireActiveStaffTransportAuth(
          req
        );

      const payload =
        await readJson(req);

      const request =
        createStaffTransportRequest(
          payload,
          auth.staff
        );

      return sendJson(
        res,
        201,
        {
          request
        }
      );
    }

    const staffTransportRequestMatch =
      url.pathname.match(
        /^\/api\/staff-transport\/requests\/(\d+)$/
      );

    if (
      req.method === 'PATCH' &&
      staffTransportRequestMatch
    ) {
      const auth =
        requireActiveStaffTransportAuth(
          req
        );

      const payload =
        await readJson(req);

      const request =
        amendStaffTransportRequest(
          Number(
            staffTransportRequestMatch[1]
          ),
          payload,
          auth.staff
        );

      return sendJson(
        res,
        200,
        {
          request
        }
      );
    }

    const staffTransportCancelMatch =
      url.pathname.match(
        /^\/api\/staff-transport\/requests\/(\d+)\/cancel$/
      );

    if (
      req.method === 'POST' &&
      staffTransportCancelMatch
    ) {
      const auth =
        requireActiveStaffTransportAuth(
          req
        );

      const request =
        cancelStaffTransportRequest(
          Number(
            staffTransportCancelMatch[1]
          ),
          auth.staff
        );

      return sendJson(
        res,
        200,
        {
          request
        }
      );
    }

    if (
      req.method === 'GET' &&
      staffTransportRequestMatch
    ) {
      const auth =
        requireActiveStaffTransportAuth(
          req
        );

      const request =
        getTransportRequestForStaffIdentity(
          Number(
            staffTransportRequestMatch[1]
          ),
          auth.staff.id
        );

      return sendJson(
        res,
        200,
        {
          request
        }
      );
    }

    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/staff-transport/geocoding/search'
    ) {
      requireActiveStaffTransportAuth(
        req
      );

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


    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/transport-programmes'
    ) {
      return sendJson(
        res,
        200,
        {
          programmes:
            listTransportProgrammes()
        }
      );
    }


    const transportProgrammeMatch =
      url.pathname.match(
        /^\/api\/transport-programmes\/(\d+)$/
      );


    if (
      req.method === 'GET' &&
      transportProgrammeMatch
    ) {
      const programme =
        getTransportProgrammeById(
          Number(
            transportProgrammeMatch[1]
          )
        );

      if (!programme) {
        const error =
          new Error(
            'Transport programme not found'
          );

        error.statusCode = 404;
        throw error;
      }

      return sendJson(
        res,
        200,
        {
          programme
        }
      );
    }


    if (
      req.method === 'POST' &&
      url.pathname ===
        '/api/transport-programmes'
    ) {
      const auth =
        requireAnyRole(
          req,
          ['nac_admin']
        );

      const payload =
        await readJson(req);

      const programme =
        createTransportProgramme(
          payload,
          auth.user.id
        );

      return sendJson(
        res,
        201,
        {
          programme
        }
      );
    }


    if (
      req.method === 'PATCH' &&
      transportProgrammeMatch
    ) {
      const auth =
        requireAnyRole(
          req,
          ['nac_admin']
        );

      const payload =
        await readJson(req);

      const programme =
        updateTransportProgramme(
          Number(
            transportProgrammeMatch[1]
          ),
          payload,
          auth.user.id
        );

      return sendJson(
        res,
        200,
        {
          programme
        }
      );
    }



    const transportProgrammeAccessCodeMatch =
      url.pathname.match(
        /^\/api\/transport-programmes\/(\d+)\/access-code$/
      );


    if (
      req.method === 'GET' &&
      transportProgrammeAccessCodeMatch
    ) {
      requireAnyRole(
        req,
        ['nac_admin']
      );

      const programmeId =
        Number(
          transportProgrammeAccessCodeMatch[1]
        );

      const programme =
        getTransportProgrammeById(
          programmeId
        );

      if (!programme) {
        const error =
          new Error(
            'Transport programme not found'
          );

        error.statusCode = 404;
        throw error;
      }

      return sendJson(
        res,
        200,
        {
          configured:
            getTransportProgrammeAccessCode(
              programmeId
            )
        }
      );
    }


    if (
      req.method === 'PATCH' &&
      transportProgrammeAccessCodeMatch
    ) {
      const auth =
        requireAnyRole(
          req,
          ['nac_admin']
        );

      const payload =
        await readJson(req);

      if (
        payload.code === undefined &&
        typeof payload.isActive !== 'boolean'
      ) {
        const error =
          new Error(
            'Access code status must be true or false'
          );

        error.statusCode = 400;
        throw error;
      }

      const configured =
        payload.code === undefined
          ? setTransportProgrammeAccessCodeActive(
              Number(
                transportProgrammeAccessCodeMatch[1]
              ),
              payload.isActive,
              auth.user.id
            )
          : configureTransportProgrammeAccessCode(
          Number(
            transportProgrammeAccessCodeMatch[1]
          ),
          payload,
          auth.user.id
        );

      return sendJson(
        res,
        200,
        {
          configured
        }
      );
    }



    const transportProgrammeWindowsMatch =
      url.pathname.match(
        /^\/api\/transport-programmes\/(\d+)\/windows$/
      );


    if (
      req.method === 'GET' &&
      transportProgrammeWindowsMatch
    ) {
      const programmeId =
        Number(
          transportProgrammeWindowsMatch[1]
        );

      const programme =
        getTransportProgrammeById(
          programmeId
        );

      if (!programme) {
        const error =
          new Error(
            'Transport programme not found'
          );

        error.statusCode = 404;
        throw error;
      }

      return sendJson(
        res,
        200,
        {
          windows:
            listTransportProgrammeWindows(
              programmeId
            )
        }
      );
    }


    if (
      req.method === 'POST' &&
      transportProgrammeWindowsMatch
    ) {
      const auth =
        requireAnyRole(
          req,
          ['nac_admin']
        );

      const payload =
        await readJson(req);

      const window =
        createTransportProgrammeWindow(
          Number(
            transportProgrammeWindowsMatch[1]
          ),
          payload,
          auth.user.id
        );

      return sendJson(
        res,
        201,
        {
          window
        }
      );
    }


    const transportProgrammeWindowMatch =
      url.pathname.match(
        /^\/api\/transport-programme-windows\/(\d+)$/
      );


    if (
      req.method === 'GET' &&
      transportProgrammeWindowMatch
    ) {
      const window =
        getTransportProgrammeWindowById(
          Number(
            transportProgrammeWindowMatch[1]
          )
        );

      if (!window) {
        const error =
          new Error(
            'Service window not found'
          );

        error.statusCode = 404;
        throw error;
      }

      return sendJson(
        res,
        200,
        {
          window
        }
      );
    }


    if (
      req.method === 'PATCH' &&
      transportProgrammeWindowMatch
    ) {
      const auth =
        requireAnyRole(
          req,
          ['nac_admin']
        );

      const payload =
        await readJson(req);

      const window =
        updateTransportProgrammeWindow(
          Number(
            transportProgrammeWindowMatch[1]
          ),
          payload,
          auth.user.id
        );

      return sendJson(
        res,
        200,
        {
          window
        }
      );
    }



    const transportProgrammeWindowCapacityMatch =
      url.pathname.match(
        /^\/api\/transport-programme-windows\/(\d+)\/capacity$/
      );


    if (
      req.method === 'GET' &&
      transportProgrammeWindowCapacityMatch
    ) {
      const windowId =
        Number(
          transportProgrammeWindowCapacityMatch[1]
        );

      const window =
        getTransportProgrammeWindowById(
          windowId
        );

      if (!window) {
        const error =
          new Error(
            'Service window not found'
          );

        error.statusCode = 404;
        throw error;
      }

      return sendJson(
        res,
        200,
        {
          capacity:
            listTransportProgrammeCapacity(
              windowId
            )
        }
      );
    }


    if (
      req.method === 'POST' &&
      transportProgrammeWindowCapacityMatch
    ) {
      const auth =
        requireAnyRole(
          req,
          ['nac_admin']
        );

      const payload =
        await readJson(req);

      const capacity =
        createTransportProgrammeCapacity(
          Number(
            transportProgrammeWindowCapacityMatch[1]
          ),
          payload,
          auth.user.id
        );

      return sendJson(
        res,
        201,
        {
          capacity
        }
      );
    }


    const transportProgrammeCapacityMatch =
      url.pathname.match(
        /^\/api\/transport-programme-capacity\/(\d+)$/
      );


    if (
      req.method === 'GET' &&
      transportProgrammeCapacityMatch
    ) {
      const capacity =
        getTransportProgrammeCapacityById(
          Number(
            transportProgrammeCapacityMatch[1]
          )
        );

      if (!capacity) {
        const error =
          new Error(
            'Vehicle capacity configuration not found'
          );

        error.statusCode = 404;
        throw error;
      }

      return sendJson(
        res,
        200,
        {
          capacity
        }
      );
    }


    if (
      req.method === 'PATCH' &&
      transportProgrammeCapacityMatch
    ) {
      const auth =
        requireAnyRole(
          req,
          ['nac_admin']
        );

      const payload =
        await readJson(req);

      const capacity =
        updateTransportProgrammeCapacity(
          Number(
            transportProgrammeCapacityMatch[1]
          ),
          payload,
          auth.user.id
        );

      return sendJson(
        res,
        200,
        {
          capacity
        }
      );
    }



    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/transport-request-options'
    ) {
      const auth =
        requireAuth(req);

      return sendJson(
        res,
        200,
        {
          options:
            listTransportRequestOptions(
              auth.user
            )
        }
      );
    }


    if (
      req.method === 'POST' &&
      url.pathname ===
        '/api/transport-request-imports/preview'
    ) {
      const auth =
        requireAuth(
          req
        );

      const payload =
        await readJson(req);

      const batch =
        createTransportRequestImportPreview(
          payload,
          auth.user
        );

      return sendJson(
        res,
        201,
        {
          batch
        }
      );
    }


    const transportRequestImportConfirmMatch =
      url.pathname.match(
        /^\/api\/transport-request-imports\/(\d+)\/confirm$/
      );


    if (
      req.method === 'POST' &&
      transportRequestImportConfirmMatch
    ) {
      const auth =
        requireAuth(
          req
        );

      const payload =
        await readJson(req);

      const batch =
        confirmTransportRequestImport(
          Number(
            transportRequestImportConfirmMatch[1]
          ),
          payload,
          auth.user
        );

      return sendJson(
        res,
        200,
        {
          batch
        }
      );
    }


    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/transport-requests'
    ) {
      const auth =
        requireAuth(req);

      return sendJson(
        res,
        200,
        {
          requests:
            userCanViewAllTransportRequests(
              auth.user
            )
              ? listAllTransportRequests()
              : listTransportRequestsForUser(
                  auth.user.id
                )
        }
      );
    }


    if (
      req.method === 'POST' &&
      url.pathname ===
        '/api/transport-requests'
    ) {
      const auth =
        requireAuth(req);

      const payload =
        await readJson(req);

      const request =
        createTransportRequest(
          payload,
          auth.user
        );

      return sendJson(
        res,
        201,
        {
          request
        }
      );
    }


    const transportRequestMatch =
      url.pathname.match(
        /^\/api\/transport-requests\/(\d+)$/
      );


    const transportRequestAmendMatch =
      url.pathname.match(
        /^\/api\/transport-requests\/(\d+)\/amend$/
      );


    if (
      req.method === 'PATCH' &&
      transportRequestAmendMatch
    ) {
      const auth =
        requireAuth(
          req
        );

      const payload =
        await readJson(req);

      const request =
        amendTransportRequest(
          Number(
            transportRequestAmendMatch[1]
          ),
          payload,
          auth.user
        );

      return sendJson(
        res,
        200,
        {
          request
        }
      );
    }


    const transportRequestCancelMatch =
      url.pathname.match(
        /^\/api\/transport-requests\/(\d+)\/cancel$/
      );


    if (
      req.method === 'POST' &&
      transportRequestCancelMatch
    ) {
      const auth =
        requireAuth(
          req
        );

      const request =
        cancelTransportRequest(
          Number(
            transportRequestCancelMatch[1]
          ),
          auth.user
        );

      return sendJson(
        res,
        200,
        {
          request
        }
      );
    }


    if (
      req.method === 'PATCH' &&
      transportRequestMatch
    ) {
      const auth =
        requireAnyRole(
          req,
          ['uhp_admin']
        );

      const payload =
        await readJson(req);

      const request =
        reviewTransportRequest(
          Number(
            transportRequestMatch[1]
          ),
          payload,
          auth.user
        );

      return sendJson(
        res,
        200,
        {
          request
        }
      );
    }


    if (
      req.method === 'GET' &&
      transportRequestMatch
    ) {
      const auth =
        requireAuth(req);

      const request =
        getTransportRequestForUser(
          Number(
            transportRequestMatch[1]
          ),
          auth.user
        );

      return sendJson(
        res,
        200,
        {
          request
        }
      );
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
        '/api/booking-favourites'
    ) {
      const auth =
        requireAuth(req);

      return sendJson(
        res,
        200,
        {
          favourites:
            listBookingFavourites(
              auth.user.id
            )
        }
      );
    }


    if (
      req.method === 'POST' &&
      url.pathname ===
        '/api/booking-favourites'
    ) {
      const auth =
        requireAuth(req);

      const payload =
        await readJson(req);

      const favourite =
        createBookingFavourite(
          auth.user.id,
          payload
        );

      return sendJson(
        res,
        201,
        {
          favourite
        }
      );
    }


    const favouriteDeleteMatch =
      url.pathname.match(
        /^\/api\/booking-favourites\/(\d+)$/
      );

    if (
      req.method === 'DELETE' &&
      favouriteDeleteMatch
    ) {
      const auth =
        requireAuth(req);

      const favourite =
        deleteBookingFavourite(
          Number(
            favouriteDeleteMatch[1]
          ),
          auth.user.id
        );

      return sendJson(
        res,
        200,
        {
          favourite
        }
      );
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
      url.pathname ===
        '/api/transport-operations/overview'
    ) {
      return sendJson(
        res,
        200,
        getTransportOperationsOverview()
      );
    }



    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/transport-operations/christmas-enquiries'
    ) {
      return sendJson(
        res,
        200,
        {
          requests:
            listChristmasTransportEnquiries()
        }
      );
    }


    const christmasTransportEnquiryMatch =
      url.pathname.match(
        /^\/api\/transport-operations\/christmas-enquiries\/(\d+)$/
      );


    const christmasTransportInternalNoteMatch =
      url.pathname.match(
        /^\/api\/transport-operations\/christmas-enquiries\/(\d+)\/internal-note$/
      );


    if (
      req.method === 'POST' &&
      christmasTransportInternalNoteMatch
    ) {
      const auth =
        requireAnyRole(
          req,
          [
            'special_transport_ops',
            'nac_controller',
            'nac_admin'
          ]
        );

      const payload =
        await readJson(req);

      const request =
        addChristmasTransportInternalNote(
          Number(
            christmasTransportInternalNoteMatch[1]
          ),
          payload.note,
          auth.user
        );

      return sendJson(
        res,
        200,
        {
          request
        }
      );
    }


    const christmasTransportAmendMatch =
      url.pathname.match(
        /^\/api\/transport-operations\/christmas-enquiries\/(\d+)\/amend$/
      );


    if (
      req.method === 'PATCH' &&
      christmasTransportAmendMatch
    ) {
      const auth =
        requireAnyRole(
          req,
          [
            'special_transport_ops',
            'nac_controller',
            'nac_admin'
          ]
        );

      const payload =
        await readJson(req);

      const request =
        amendChristmasTransportEnquiry(
          Number(
            christmasTransportAmendMatch[1]
          ),
          payload,
          auth.user
        );

      return sendJson(
        res,
        200,
        {
          request
        }
      );
    }


    if (
      req.method === 'GET' &&
      christmasTransportEnquiryMatch
    ) {
      const request =
        getChristmasTransportEnquiry(
          Number(
            christmasTransportEnquiryMatch[1]
          )
        );

      if (!request) {
        const error =
          new Error(
            'Christmas transport request not found'
          );

        error.statusCode = 404;
        throw error;
      }

      return sendJson(
        res,
        200,
        {
          request
        }
      );
    }


    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/transport-operations/planning-candidates'
    ) {
      return sendJson(
        res,
        200,
        getTransportPlanningCandidates()
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
          getUhpManageableBookingDetails(
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

      /*
        Resolve ownership and current status
        before selecting the amendment path.

        Draft bookings retain the existing
        local-only amendment behaviour.

        Only booked/confirmed live bookings are
        allowed into the Autocab modification
        workflow.
      */
      const existing =
        getUhpManageableBookingDetails(
          bookingId,
          auth.user.id
        );

      let booking;

      if (
        existing.operationalStatus ===
          'draft'
      ) {
        booking =
          amendPortalBooking(
            bookingId,
            auth.user.id,
            payload
          );
      } else if (
        existing.operationalStatus ===
          'booked' ||
        existing.operationalStatus ===
          'confirmed'
      ) {
        const result =
          await modifyLivePortalBooking(
            bookingId,
            auth.user.id,
            payload
          );

        booking =
          result.booking;
      } else {
        const error =
          new Error(
            `Booking cannot be amended from status ${existing.operationalStatus}`
          );

        error.statusCode = 409;
        throw error;
      }

      return sendJson(res, 200, {
        booking
      });
    }

    if (
      req.method === 'POST' &&
      url.pathname ===
        '/api/pickup-eta'
    ) {
      const payload =
        await readJson(req);

      requireAuth(req);

      const pickupEta =
        await calculatePickupEta({
          latitude:
            payload?.latitude,

          longitude:
            payload?.longitude
        });

      return sendJson(
        res,
        200,
        {
          pickupEta
        }
      );
    }


    if (
      req.method === 'POST' &&
      url.pathname === '/api/eta'
    ) {
      const payload =
        await readJson(req);

      requireAuth(req);

      const rawPoints =
        Array.isArray(
          payload?.points
        )
          ? payload.points
          : [];

      /*
        Only route coordinates are accepted
        from the browser.

        Autocab credentials and company
        configuration remain server-side.
      */
      const points =
        rawPoints.map(
          (point) => ({
            latitude:
              point?.latitude,

            longitude:
              point?.longitude
          })
        );

      const eta =
        await calculateAutocabEta(
          points
        );

      return sendJson(
        res,
        200,
        {
          eta
        }
      );
    }


    const bookingEtaMatch =
      url.pathname.match(
        /^\/api\/bookings\/(\d+)\/eta$/
      );

    if (
      req.method === 'GET' &&
      bookingEtaMatch
    ) {
      const bookingId =
        Number(
          bookingEtaMatch[1]
        );

      const auth =
        requireAuth(req);

      /*
        Ownership is checked server-side.

        The browser never supplies Autocab
        credentials or company configuration.
      */
      const booking =
        getOwnedBookingDetails(
          bookingId,
          auth.user.id
        );

      const eta =
        await calculateAutocabEta(
          booking.stops
        );

      return sendJson(
        res,
        200,
        {
          eta
        }
      );
    }


    const bookingSubmitMatch =
      url.pathname.match(
        /^\/api\/bookings\/(\d+)\/submit$/
      );

    if (
      req.method === 'POST' &&
      bookingSubmitMatch
    ) {
      const bookingId =
        Number(
          bookingSubmitMatch[1]
        );

      const auth =
        requireAuth(req);

      /*
        Ownership check is server-side.
        Do not trust a user/customer ID
        supplied by the browser.
      */
      getOwnedBookingDetails(
        bookingId,
        auth.user.id
      );

      const result =
        await submitPortalBookingToAutocab(
          bookingId,
          {
            accountType:
              'uhp'
          }
        );

      return sendJson(
        res,
        200,
        result
      );
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
        await cancelPortalBooking(
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

function bootstrapLiveStaffTransportProgramme() {
  if (!STAFF_TRANSPORT_LIVE_BOOTSTRAP) {
    return;
  }

  console.log(
    'Staff Transport live bootstrap enabled'
  );

  let programme =
    db.prepare(`
      SELECT id
      FROM transport_programmes
      WHERE code = ?
      LIMIT 1
    `).get(
      STAFF_TRANSPORT_PROGRAMME_CODE
        .toUpperCase()
    );

  if (!programme) {
    const created =
      createTransportProgramme(
        {
          code:
            STAFF_TRANSPORT_PROGRAMME_CODE,

          name:
            STAFF_TRANSPORT_PROGRAMME_NAME,

          programmeType:
            'special_transport',

          status:
            'open',

          requestOpensAt:
            STAFF_TRANSPORT_REQUEST_OPENS_AT,

          requestClosesAt:
            STAFF_TRANSPORT_REQUEST_CLOSES_AT,

          autocabAccountType:
            'xmas_staff',

          publicNotes:
            'UHP Christmas Day staff transport',

          internalNotes:
            'Created automatically from live Staff Transport configuration'
        },
        null
      );

    programme = {
      id: created.id
    };

    console.log(
      `Created Staff Transport programme ${created.code}`
    );
  } else {
    console.log(
      `Staff Transport programme already exists: ${STAFF_TRANSPORT_PROGRAMME_CODE}`
    );
  }

  const existingWindow =
    db.prepare(`
      SELECT id
      FROM transport_programme_windows
      WHERE programme_id = ?
        AND name = ?
        AND starts_at = ?
        AND ends_at = ?
      LIMIT 1
    `).get(
      programme.id,
      STAFF_TRANSPORT_WINDOW_NAME,
      STAFF_TRANSPORT_WINDOW_STARTS_AT,
      STAFF_TRANSPORT_WINDOW_ENDS_AT
    );

  if (!existingWindow) {
    const window =
      createTransportProgrammeWindow(
        programme.id,
        {
          name:
            STAFF_TRANSPORT_WINDOW_NAME,

          startsAt:
            STAFF_TRANSPORT_WINDOW_STARTS_AT,

          endsAt:
            STAFF_TRANSPORT_WINDOW_ENDS_AT,

          displayOrder: 1,
          isActive: true,

          publicNotes:
            'Christmas Day staff transport',

          internalNotes:
            'Created automatically from live Staff Transport configuration'
        },
        null
      );

    console.log(
      `Created Staff Transport window ${window.name}`
    );
  } else {
    console.log(
      `Staff Transport window already exists: ${STAFF_TRANSPORT_WINDOW_NAME}`
    );
  }

  if (STAFF_TRANSPORT_ACCESS_CODE) {
    const existingAccessCode =
      getTransportProgrammeAccessCode(
        programme.id
      );

    if (!existingAccessCode) {
      configureTransportProgrammeAccessCode(
        programme.id,
        {
          code:
            STAFF_TRANSPORT_ACCESS_CODE,
          isActive: true
        },
        null
      );

      console.log(
        'Configured Staff Transport access code'
      );
    } else {
      console.log(
        'Staff Transport access code already configured'
      );
    }
  } else {
    console.log(
      'Staff Transport access code not supplied; existing configuration unchanged'
    );
  }
}


bootstrapLiveStaffTransportProgramme();


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
