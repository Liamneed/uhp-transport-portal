import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  LayoutDashboard,
  UserRoundCog,
  WalletCards,
  Tags,
  BarChart3,
  CarFront,
  CalendarDays,
  AlertTriangle,
  Search,
  Bell,
  Plus,
  MoreHorizontal,
  CheckCircle2,
  Clock3,
  UsersRound,
  MapPin
} from 'lucide-react';
import './styles.css';

const API_BASE =
  import.meta.env.DEV
    ? 'http://localhost:3001'
    : '';

const MAP_TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL ||
  (
    import.meta.env.DEV
      ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      : ''
  );

const MAP_TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_TILE_ATTRIBUTION ||
  '&copy; OpenStreetMap contributors';

const LIVE_BOOKING_REFRESH_MS = 10000;

async function apiFetch(
  input,
  options = {}
) {
  return window.fetch(
    input,
    {
      ...options,
      credentials: 'include'
    }
  );
}

const navDefinitions = {
  uhp_admin: [
    ['admin-dashboard', 'Dashboard', LayoutDashboard],
    ['book-transport', 'Book UHP Transport', CarFront],
    ['uhp-bookings', 'All Bookings', CalendarDays],
    ['admin-users', 'Users', UserRoundCog],
    ['admin-budgets', 'Budgets', WalletCards],
    ['admin-reasons', 'Reason Codes', Tags],
    ['admin-locations', 'Locations', MapPin],
    ['coding-review', 'Coding Review', AlertTriangle],
    ['admin-reports', 'Reports', BarChart3]
  ],

  booker: [
    ['booker-dashboard', 'Dashboard', LayoutDashboard],
    ['book-transport', 'Book UHP Transport', CarFront],
    ['my-bookings', 'My Bookings', CalendarDays]
  ],

  budget_holder: [
    ['holder-dashboard', 'Dashboard', LayoutDashboard],
    ['book-transport', 'Book UHP Transport', CarFront],
    ['holder-bookings', 'Bookings', CalendarDays],
    ['holder-invoices', 'Invoices', WalletCards],
    ['holder-reports', 'Reports', BarChart3]
  ],

  department_manager: [
    ['manager-dashboard', 'Dashboard', LayoutDashboard],
    ['manager-bookings', 'Bookings', CalendarDays],
    ['manager-reports', 'Reports', BarChart3]
  ],

  finance: [
    ['finance-dashboard', 'Dashboard', LayoutDashboard],
    ['finance-invoices', 'Invoices', WalletCards],
    ['finance-reports', 'Reports', BarChart3]
  ],

  nac_controller: [
    ['nac-control', 'Control', LayoutDashboard],
    ['nac-bookings', 'Bookings', CalendarDays],
    ['nac-exceptions', 'Exceptions', AlertTriangle],
    ['nac-christmas', 'Christmas', CarFront]
  ],

  nac_admin: [
    ['nac-control', 'Control', LayoutDashboard],
    ['nac-bookings', 'Bookings', CalendarDays],
    ['nac-exceptions', 'Exceptions', AlertTriangle],
    ['coding-review', 'Coding Review', AlertTriangle],
    ['nac-christmas', 'Christmas', CarFront]
  ]
};

function navigationForUser(user) {
  const seen = new Set();
  const items = [];

  for (const role of user?.roles ?? []) {
    for (
      const item of
      navDefinitions[role.code] ?? []
    ) {
      const [key] = item;

      if (seen.has(key)) continue;

      seen.add(key);
      items.push(item);
    }
  }

  return items;
}

function initialsForUser(user) {
  const first =
    String(user?.firstName || '')
      .trim()
      .charAt(0);

  const last =
    String(user?.lastName || '')
      .trim()
      .charAt(0);

  return `${first}${last}`.toUpperCase() || 'U';
}

function roleSummary(user) {
  const names =
    (user?.roles ?? [])
      .map((role) => role.name)
      .filter(Boolean);

  return names.join(' · ') || 'Portal User';
}

function LoginPage({
  onAuthenticated
}) {
  const [step, setStep] =
    useState('email');

  const [email, setEmail] =
    useState('');

  const [challengeId, setChallengeId] =
    useState('');

  const [code, setCode] =
    useState('');

  const [sending, setSending] =
    useState(false);

  const [error, setError] =
    useState('');

  async function requestCode(event) {
    event.preventDefault();

    setSending(true);
    setError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/auth/request-code`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              email
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to send verification code'
        );
      }

      setChallengeId(
        data.challengeId
      );

      setEmail(data.email);
      setStep('code');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to sign in'
      );
    } finally {
      setSending(false);
    }
  }

  async function verifyCode(event) {
    event.preventDefault();

    setSending(true);
    setError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/auth/verify-code`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              challengeId,
              code
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to verify code'
        );
      }

      onAuthenticated(
        data.user
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to verify code'
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-brand">
          <strong>UHP</strong>
          <span>Transport Portal</span>
        </div>

        <div className="auth-card">
          <div className="auth-heading">
            <span className="auth-kicker">
              Secure access
            </span>

            <h1>
              {step === 'email'
                ? 'Sign in to the transport portal'
                : 'Enter your verification code'}
            </h1>

            <p>
              {step === 'email'
                ? 'Use the email address registered against your UHP Transport Portal account.'
                : `We sent a 6-digit sign-in code to ${email}.`}
            </p>
          </div>

          {error && (
            <div className="notice error">
              {error}
            </div>
          )}

          {step === 'email' ? (
            <form
              className="auth-form"
              onSubmit={requestCode}
            >
              <label>
                Email address

                <input
                  type="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(
                      event.target.value
                    )
                  }
                  placeholder="name@example.nhs.uk"
                  autoComplete="email"
                  required
                  autoFocus
                />
              </label>

              <button
                className="primary-button auth-submit"
                disabled={sending}
              >
                {sending
                  ? 'Sending...'
                  : 'Send verification code'}
              </button>
            </form>
          ) : (
            <form
              className="auth-form"
              onSubmit={verifyCode}
            >
              <label>
                6-digit verification code

                <input
                  className="auth-code-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength="6"
                  pattern="[0-9]{6}"
                  value={code}
                  onChange={(event) =>
                    setCode(
                      event.target.value
                        .replace(/\D/g, '')
                        .slice(0, 6)
                    )
                  }
                  placeholder="000000"
                  required
                  autoFocus
                />
              </label>

              <button
                className="primary-button auth-submit"
                disabled={
                  sending ||
                  code.length !== 6
                }
              >
                {sending
                  ? 'Checking...'
                  : 'Sign in'}
              </button>

              <button
                type="button"
                className="auth-back-button"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setChallengeId('');
                  setError('');
                }}
                disabled={sending}
              >
                Use a different email
              </button>
            </form>
          )}

          <div className="auth-security-note">
            Passwordless access · Verification
            codes expire after 10 minutes.
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [currentUser, setCurrentUser] =
    useState(null);

  const [checkingSession, setCheckingSession] =
    useState(true);

  const [active, setActive] =
    useState('');

  const nav =
    useMemo(
      () =>
        navigationForUser(currentUser),
      [currentUser]
    );

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const response =
          await apiFetch(
            `${API_BASE}/api/auth/me`
          );

        if (!response.ok) {
          if (!cancelled) {
            setCurrentUser(null);
          }

          return;
        }

        const data =
          await response.json();

        if (!cancelled) {
          setCurrentUser(data.user);
        }
      } catch {
        if (!cancelled) {
          setCurrentUser(null);
        }
      } finally {
        if (!cancelled) {
          setCheckingSession(false);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setActive('');
      return;
    }

    const available =
      navigationForUser(currentUser);

    if (
      !available.some(
        ([key]) => key === active
      )
    ) {
      setActive(
        available[0]?.[0] || ''
      );
    }
  }, [currentUser, active]);

  async function logout() {
    try {
      await apiFetch(
        `${API_BASE}/api/auth/logout`,
        {
          method: 'POST'
        }
      );
    } finally {
      setCurrentUser(null);
      setActive('');
    }
  }

  if (checkingSession) {
    return (
      <div className="auth-shell">
        <div className="auth-loading">
          Checking secure session...
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginPage
        onAuthenticated={
          setCurrentUser
        }
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>UHP</strong>
          <span>Transport Portal</span>
        </div>

        <div className="signed-in-summary">
          <small>Signed in as</small>

          <strong>
            {currentUser.firstName}{' '}
            {currentUser.lastName}
          </strong>

          <span>
            {roleSummary(currentUser)}
          </span>
        </div>

        <nav>
          {nav.map(
            ([key, label, Icon]) => (
              <button
                key={key}
                className={
                  active === key
                    ? 'nav-item active'
                    : 'nav-item'
                }
                onClick={() =>
                  setActive(key)
                }
              >
                <Icon size={19}/>
                <span>{label}</span>
              </button>
            )
          )}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="search">
            <Search size={18}/>

            <input
              placeholder="Search users, budgets, bookings..."
            />
          </div>

          <div className="top-actions">
            <Bell size={20}/>

            <div className="avatar">
              {initialsForUser(
                currentUser
              )}
            </div>

            <div className="signed-in-user">
              <strong>
                {currentUser.firstName}{' '}
                {currentUser.lastName}
              </strong>

              <small>
                {currentUser.department ||
                  roleSummary(
                    currentUser
                  )}
              </small>
            </div>

            <button
              type="button"
              className="logout-button"
              onClick={logout}
            >
              Sign out
            </button>
          </div>
        </header>

        <section className="content">
          {active === 'admin-dashboard' ? (
            <UhpAdminDashboard/>
          ) : active === 'admin-users' ? (
            <UsersPage/>
          ) : active === 'admin-budgets' ? (
            <BudgetsPage/>
          ) : active === 'admin-reasons' ? (
            <ReasonCodesPage/>
          ) : active === 'admin-locations' ? (
            <LocationsPage/>
          ) : active === 'book-transport' ? (
            <BookTransportPage
              currentUser={currentUser}
            />
          ) : active === 'my-bookings' ? (
            <MyBookingsPage
              currentUser={currentUser}
            />
          ) : active === 'uhp-bookings' ? (
            <MyBookingsPage
              currentUser={currentUser}
              scope="all"
            />
          ) : active === 'holder-bookings' ? (
            <MyBookingsPage
              currentUser={currentUser}
              scope="budget"
            />
          ) : active === 'holder-invoices' ? (
            <BudgetInvoicesPage/>
          ) : active === 'nac-control' ? (
            <NacControlPage/>
          ) : active === 'nac-bookings' ? (
            <NacBookingsPage/>
          ) : active === 'nac-exceptions' ? (
            <NacBookingsPage
              exceptionsOnly
            />
          ) : active === 'coding-review' ? (
            <CodingReviewPage/>
          ) : (
            <Placeholder
              role={roleSummary(currentUser)}
              active={
                nav.find(
                  ([key]) =>
                    key === active
                )?.[1] ||
                'Dashboard'
              }
            />
          )}
        </section>
      </main>
    </div>
  );
}

function UhpAdminDashboard() {
  const [bookings, setBookings] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [selectedBooking, setSelectedBooking] =
    useState(null);

  useEscapeClose(
    Boolean(selectedBooking),
    () => setSelectedBooking(null)
  );

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setError('');

      try {
        const response =
          await apiFetch(
            `${API_BASE}/api/uhp/bookings`
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
            'Unable to load dashboard'
          );
        }

        if (!cancelled) {
          setBookings(
            data.bookings ?? []
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load dashboard'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const dashboard = useMemo(() => {
    const now = new Date();

    const today =
      [
        now.getFullYear(),
        String(
          now.getMonth() + 1
        ).padStart(2, '0'),
        String(
          now.getDate()
        ).padStart(2, '0')
      ].join('-');

    const todaysBookings =
      bookings.filter(
        (booking) =>
          String(
            booking.requestedPickupAt || ''
          ).slice(0, 10) === today
      );

    const live =
      bookings.filter(
        (booking) =>
          bookingStatusGroup(
            booking
          ) === 'live'
      );

    const completedToday =
      bookings.filter(
        (booking) =>
          booking.operationalStatus ===
            'completed' &&
          String(
            booking.completedAt || ''
          ).slice(0, 10) === today
      );

    const codingRequired =
      bookings.filter(
        (booking) =>
          booking.financialStatus ===
            'coding_required'
      );

    const terminal =
      new Set([
        'completed',
        'cancelled',
        'no_show',
        'no_fare',
        'failed'
      ]);

    const upcoming =
      bookings
        .filter(
          (booking) => {
            if (
              terminal.has(
                booking.operationalStatus
              )
            ) {
              return false;
            }

            const pickup =
              new Date(
                String(
                  booking.requestedPickupAt ||
                    ''
                ).replace(' ', 'T')
              );

            return (
              !Number.isNaN(
                pickup.getTime()
              ) &&
              pickup.getTime() >=
                now.getTime()
            );
          }
        )
        .sort(
          (a, b) =>
            new Date(
              String(
                a.requestedPickupAt
              ).replace(' ', 'T')
            ) -
            new Date(
              String(
                b.requestedPickupAt
              ).replace(' ', 'T')
            )
        )
        .slice(0, 6);

    const recent =
      [...bookings]
        .sort(
          (a, b) =>
            new Date(
              String(
                bookingDisplayBookedAt(b) ||
                  ''
              ).replace(' ', 'T')
            ) -
            new Date(
              String(
                bookingDisplayBookedAt(a) ||
                  ''
              ).replace(' ', 'T')
            )
        )
        .slice(0, 6);

    return {
      today,
      todaysBookings,
      live,
      completedToday,
      codingRequired,
      upcoming,
      recent
    };
  }, [bookings]);

  function dashboardBookingRow(
    booking
  ) {
    return (
      <button
        key={booking.id}
        type="button"
        className="dashboard-booking-row"
        onClick={() =>
          setSelectedBooking(booking)
        }
      >
        <div className="dashboard-booking-time">
          <strong>
            {formatBookingDateTime(
              booking.requestedPickupAt
            )}
          </strong>

          <small>
            {autocabBookingPrimary(
              booking
            )}
          </small>
        </div>

        <div className="dashboard-booking-main">
          <strong>
            {booking.passengerName ||
              'Passenger'}
          </strong>

          <small>
            {booking.pickupAddress || '—'}
            {' → '}
            {booking.destinationAddress ||
              '—'}
          </small>
        </div>

        <div className="dashboard-booking-meta">
          <span
            className={
              `badge ${
                booking.operationalStatus
              }`
            }
          >
            {formatOperationalStatus(
              booking.operationalStatus
            )}
          </span>

          {bookingIsStale(
                              booking
                            ) && (
                              <span className="stale-chip">
                                Stale
                              </span>
                            )}

                            {bookingIsOverdue(
            booking
          ) && (
            <span className="overdue-chip">
              Overdue
            </span>
          )}
        </div>
      </button>
    );
  }

  if (loading) {
    return (
      <div className="card state-panel">
        Loading UHP dashboard...
      </div>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>UHP Transport Dashboard</h1>

          <p>
            Hospital-wide overview of UHP
            transport activity and coding
            workload.
          </p>
        </div>
      </div>

      {error && (
        <div className="notice error">
          {error}
        </div>
      )}

      <div className="dashboard-kpi-grid">
        <div className="card dashboard-kpi">
          <div className="dashboard-kpi-icon">
            <CalendarDays/>
          </div>

          <div>
            <small>
              Today's Bookings
            </small>

            <strong>
              {
                dashboard
                  .todaysBookings
                  .length
              }
            </strong>
          </div>
        </div>

        <div className="card dashboard-kpi">
          <div className="dashboard-kpi-icon">
            <CarFront/>
          </div>

          <div>
            <small>Live Now</small>

            <strong>
              {dashboard.live.length}
            </strong>
          </div>
        </div>

        <div className="card dashboard-kpi">
          <div className="dashboard-kpi-icon">
            <CheckCircle2/>
          </div>

          <div>
            <small>
              Completed Today
            </small>

            <strong>
              {
                dashboard
                  .completedToday
                  .length
              }
            </strong>
          </div>
        </div>

        <div className="card dashboard-kpi">
          <div className="dashboard-kpi-icon">
            <AlertTriangle/>
          </div>

          <div>
            <small>
              Coding Required
            </small>

            <strong>
              {
                dashboard
                  .codingRequired
                  .length
              }
            </strong>
          </div>
        </div>
      </div>

      <div className="uhp-dashboard-grid">
        <section className="card dashboard-panel">
          <div className="panel-heading">
            <div>
              <h2>Next UHP Journeys</h2>

              <p>
                Upcoming non-terminal
                hospital transport bookings.
              </p>
            </div>
          </div>

          {dashboard.upcoming.length ? (
            <div className="dashboard-booking-list">
              {dashboard.upcoming.map(
                dashboardBookingRow
              )}
            </div>
          ) : (
            <div className="empty-bookings compact-empty">
              <CalendarDays size={28}/>

              <strong>
                No upcoming journeys
              </strong>

              <span>
                Future UHP bookings will
                appear here.
              </span>
            </div>
          )}
        </section>

        <aside className="card dashboard-panel">
          <div className="panel-heading">
            <div>
              <h2>Coding Overview</h2>

              <p>
                Bookings currently waiting
                for valid UHP coding.
              </p>
            </div>
          </div>

          <div className="dashboard-coding-summary">
            <strong>
              {
                dashboard
                  .codingRequired
                  .length
              }
            </strong>

            <span>
              booking
              {
                dashboard
                  .codingRequired
                  .length === 1
                  ? ''
                  : 's'
              } requiring coding review
            </span>
          </div>

          {dashboard.codingRequired
            .slice(0, 5)
            .map(
              dashboardBookingRow
            )}

          {dashboard.codingRequired.length ===
            0 && (
            <div className="dashboard-clear-state">
              <CheckCircle2 size={22}/>

              <span>
                No bookings currently
                require coding.
              </span>
            </div>
          )}
        </aside>
      </div>

      <section className="card dashboard-panel dashboard-recent-panel">
        <div className="panel-heading">
          <div>
            <h2>Recent Bookings</h2>

            <p>
              Latest UHP transport bookings
              received by the portal.
            </p>
          </div>
        </div>

        {dashboard.recent.length ? (
          <div className="dashboard-booking-list">
            {dashboard.recent.map(
              dashboardBookingRow
            )}
          </div>
        ) : (
          <div className="empty-bookings compact-empty">
            <CalendarDays size={28}/>

            <strong>
              No bookings yet
            </strong>
          </div>
        )}
      </section>

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          context="uhp"
          onClose={() =>
            setSelectedBooking(null)
          }
        />
      )}
    </>
  );
}



function UsersPage() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [roles, setRoles] = useState([]);

  const [query, setQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [showAddUser, setShowAddUser] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    departmentId: '',
    roleCode: 'booker',
    budgetIds: []
  });

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [
        usersResponse,
        departmentsResponse,
        budgetsResponse,
        rolesResponse
      ] = await Promise.all([
        apiFetch(`${API_BASE}/api/users`),
        apiFetch(`${API_BASE}/api/departments`),
        apiFetch(`${API_BASE}/api/budgets`),
        apiFetch(`${API_BASE}/api/roles`)
      ]);

      if (
        !usersResponse.ok ||
        !departmentsResponse.ok ||
        !budgetsResponse.ok ||
        !rolesResponse.ok
      ) {
        throw new Error('Unable to load administration data');
      }

      const usersData = await usersResponse.json();
      const departmentsData = await departmentsResponse.json();
      const budgetsData = await budgetsResponse.json();
      const rolesData = await rolesResponse.json();

      setUsers(usersData.users ?? []);
      setDepartments(departmentsData.departments ?? []);
      setBudgets(budgetsData.budgets ?? []);
      setRoles(rolesData.roles ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load users'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const stats = useMemo(() => {
    return {
      active: users.filter((u) => u.status === 'active').length,
      invited: users.filter((u) => u.status === 'invited').length,
      budgetHolders: users.filter((u) =>
        String(u.roles || '').toLowerCase().includes('budget holder')
      ).length,
      suspended: users.filter((u) => u.status === 'suspended').length
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return users.filter((user) => {
      const matchesQuery =
        !normalizedQuery ||
        [
          user.firstName,
          user.lastName,
          user.email,
          user.department,
          user.roles,
          user.budgets
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);

      const matchesDepartment =
        departmentFilter === 'all' ||
        String(user.departmentId) === departmentFilter;

      const matchesStatus =
        statusFilter === 'all' ||
        user.status === statusFilter;

      return matchesQuery && matchesDepartment && matchesStatus;
    });
  }, [users, query, departmentFilter, statusFilter]);

  function resetForm() {
    setForm({
      firstName: '',
      lastName: '',
      email: '',
      departmentId: '',
      roleCode: 'booker',
      budgetIds: []
    });
  }

  function toggleBudget(budgetId) {
    setForm((current) => {
      const exists = current.budgetIds.includes(budgetId);

      return {
        ...current,
        budgetIds: exists
          ? current.budgetIds.filter((id) => id !== budgetId)
          : [...current.budgetIds, budgetId]
      };
    });
  }

  async function submitUser(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    try {
      const response = await apiFetch(
        `${API_BASE}/api/users`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...form,
            departmentId: Number(form.departmentId)
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Unable to create user');
      }

      setNotice(
        `${form.firstName} ${form.lastName} has been invited.`
      );

      setShowAddUser(false);
      resetForm();
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to create user'
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(user, status) {
    const labels = {
      active: 'reactivate',
      suspended: 'suspend',
      archived: 'archive'
    };

    const action = labels[status] || 'update';

    if (
      !window.confirm(
        `Are you sure you want to ${action} ${user.firstName} ${user.lastName}?`
      )
    ) {
      return;
    }

    setError('');
    setNotice('');

    try {
      const response = await apiFetch(
        `${API_BASE}/api/users/${user.id}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Unable to update user');
      }

      setNotice(
        `${user.firstName} ${user.lastName} is now ${formatStatus(status).toLowerCase()}.`
      );

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to update user'
      );
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Users</h1>
          <p>Manage hospital access without exposing complex permission settings.</p>
        </div>

        <button
          className="primary"
          onClick={() => {
            setError('');
            setNotice('');
            setShowAddUser(true);
          }}
        >
          <Plus size={18}/>
          Add User
        </button>
      </div>

      {notice && (
        <div className="notice success">
          {notice}
        </div>
      )}

      {error && !loading && (
        <div className="notice error">
          {error}
        </div>
      )}

      <div className="stats-grid">
        <Stat icon={<UsersRound/>} label="Active Users" value={stats.active} />
        <Stat icon={<Clock3/>} label="Invited" value={stats.invited} />
        <Stat icon={<CheckCircle2/>} label="Budget Holders" value={stats.budgetHolders} />
        <Stat icon={<AlertTriangle/>} label="Suspended" value={stats.suspended} />
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search compact">
            <Search size={17}/>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users..."
            />
          </div>

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
          >
            <option value="all">All departments</option>
            {departments.map((department) => (
              <option key={department.id} value={String(department.id)}>
                {department.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="suspended">Suspended</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {loading && (
          <div className="state-panel">
            Loading users...
          </div>
        )}

        {!loading && !error && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Department</th>
                  <th>Role</th>
                  <th>Budget Access</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>
                        {user.firstName} {user.lastName}
                      </strong>
                      <small>{user.email}</small>
                    </td>

                    <td>{user.department || '—'}</td>
                    <td>{user.roles || '—'}</td>
                    <td>{user.budgets || '—'}</td>

                    <td>
                      <span className={`badge ${user.status}`}>
                        {formatStatus(user.status)}
                      </span>
                    </td>

                    <td>
                      <div className="row-actions">
                        {user.status !== 'active' && (
                          <button
                            className="text-action"
                            onClick={() => changeStatus(user, 'active')}
                          >
                            Reactivate
                          </button>
                        )}

                        {user.status === 'active' && (
                          <button
                            className="text-action warning"
                            onClick={() => changeStatus(user, 'suspended')}
                          >
                            Suspend
                          </button>
                        )}

                        {user.status !== 'archived' && (
                          <button
                            className="text-action danger"
                            onClick={() => changeStatus(user, 'archived')}
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan="6">
                      <div className="empty-table">
                        No users match the current filters.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddUser && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setShowAddUser(false);
            }
          }}
        >
          <form className="modal-card" onSubmit={submitUser}>
            <div className="modal-header">
              <div>
                <h2>Add User</h2>
                <p>
                  Invite a hospital user and assign their initial access.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() => setShowAddUser(false)}
                disabled={saving}
              >
                ×
              </button>
            </div>

            <div className="form-grid two">
              <label>
                First Name
                <input
                  required
                  value={form.firstName}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      firstName: e.target.value
                    })
                  }
                />
              </label>

              <label>
                Last Name
                <input
                  required
                  value={form.lastName}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      lastName: e.target.value
                    })
                  }
                />
              </label>
            </div>

            <label>
              Email
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) =>
                  setForm({
                    ...form,
                    email: e.target.value
                  })
                }
              />
            </label>

            <div className="form-grid two">
              <label>
                Department
                <select
                  required
                  value={form.departmentId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      departmentId: e.target.value
                    })
                  }
                >
                  <option value="">Select department...</option>

                  {departments
                    .filter((department) => department.status === 'active')
                    .map((department) => (
                      <option
                        key={department.id}
                        value={department.id}
                      >
                        {department.name}
                      </option>
                    ))}
                </select>
              </label>

              <label>
                Role
                <select
                  required
                  value={form.roleCode}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      roleCode: e.target.value
                    })
                  }
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.code}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset className="budget-picker">
              <legend>Budget Access</legend>
              <p>
                Select the budgets this user is allowed to access.
              </p>

              <div className="budget-options">
                {budgets
                  .filter((budget) => budget.status === 'active')
                  .map((budget) => (
                    <label
                      key={budget.id}
                      className="budget-option"
                    >
                      <input
                        type="checkbox"
                        checked={form.budgetIds.includes(budget.id)}
                        onChange={() => toggleBudget(budget.id)}
                      />

                      <span>
                        <strong>{budget.budgetNumber}</strong>
                        <small>
                          {budget.name}
                          {budget.department
                            ? ` · ${budget.department}`
                            : ''}
                        </small>
                      </span>
                    </label>
                  ))}
              </div>
            </fieldset>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowAddUser(false)}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Send Invite'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}





function formatOperationalStatus(status) {
  const map = {
    draft: 'Request Recorded',
    submitting: 'Sending to Dispatch',
    cancelling: 'Cancelling',
    booked: 'Booked',
    confirmed: 'Confirmed',
    driver_allocated: 'Driver Allocated',
    driver_en_route: 'Driver En Route',
    driver_arrived: 'Driver Arrived',
    passenger_on_board: 'Passenger On Board',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No Show',
    no_fare: 'No Fare',
    failed: 'Failed',
    requires_review: 'Needs Attention'
  };

  return map[status] || formatStatus(status);
}

function formatBookingDateTime(value) {
  if (!value) return '—';

  return value
    .replace('T', ' ')
    .slice(0, 16);
}


function friendlyAutocabText(value) {
  if (!value) return '—';

  return String(value)
    .replace(/[._]+/g, ' ')
    .replace(
      /([a-z0-9])([A-Z])/g,
      '$1 $2'
    )
    .replace(/\s+/g, ' ')
    .trim();
}


function bookingDisplayBooker(booking) {
  if (
    booking?.source === 'portal' &&
    booking?.createdBy
  ) {
    return booking.createdBy;
  }

  if (booking?.autocabBookedBy) {
    return friendlyAutocabText(
      booking.autocabBookedBy
    );
  }

  if (booking?.createdBy) {
    return booking.createdBy;
  }

  return booking?.source === 'portal'
    ? 'Portal user unavailable'
    : 'Autocab / external booking';
}


function bookingDisplaySource(booking) {
  if (booking?.source === 'portal') {
    return 'UHP Transport Portal';
  }

  if (booking?.autocabBookingSource) {
    return friendlyAutocabText(
      booking.autocabBookingSource
    );
  }

  return booking?.source
    ? formatStatus(booking.source)
    : '—';
}


function bookingDisplayBookedAt(booking) {
  return (
    booking?.autocabBookedAt ||
    booking?.submittedAt ||
    booking?.createdAt ||
    null
  );
}


function bookingHasVisiblePortalReference(
  booking
) {
  return (
    booking?.source === 'portal' &&
    Boolean(booking?.publicReference)
  );
}


const LIVE_OPERATIONAL_STATUSES =
  new Set([
    'driver_allocated',
    'driver_en_route',
    'driver_arrived',
    'passenger_on_board'
  ]);


const BOOKED_OPERATIONAL_STATUSES =
  new Set([
    'draft',
    'submitting',
    'cancelling',
    'booked',
    'confirmed',
    'requires_review'
  ]);


const CANCELLABLE_OPERATIONAL_STATUSES =
  new Set([
    'draft',
    'booked',
    'confirmed',
    'driver_allocated',
    'driver_en_route',
    'driver_arrived'
  ]);


function bookingStatusGroup(booking) {
  const status =
    booking?.operationalStatus;

  if (
    LIVE_OPERATIONAL_STATUSES.has(
      status
    )
  ) {
    if (
      booking?.liveState === 'stale'
    ) {
      return 'stale';
    }

    return 'live';
  }

  if (
    BOOKED_OPERATIONAL_STATUSES.has(
      status
    )
  ) {
    return 'booked';
  }

  if (status === 'completed') {
    return 'completed';
  }

  if (status === 'no_fare') {
    return 'no_fare';
  }

  if (status === 'cancelled') {
    return 'cancelled';
  }

  return 'other';
}


function bookingIsStale(booking) {
  return (
    booking?.liveState === 'stale' &&
    LIVE_OPERATIONAL_STATUSES.has(
      booking?.operationalStatus
    )
  );
}


function bookingIsOverdue(booking) {
  if (
    bookingStatusGroup(booking) !==
      'booked' ||
    !booking?.requestedPickupAt
  ) {
    return false;
  }

  const pickup =
    new Date(
      String(
        booking.requestedPickupAt
      ).replace(' ', 'T')
    );

  if (
    Number.isNaN(
      pickup.getTime()
    )
  ) {
    return false;
  }

  return pickup.getTime() < Date.now();
}


function bookingSearchText(booking) {
  return [
    booking?.autocabBookingId,
    booking?.publicReference,
    booking?.autocabReference,
    booking?.passengerName,
    booking?.passengerMobile,
    booking?.pickupAddress,
    booking?.destinationAddress,
    booking?.budgetNumber,
    booking?.budgetName,
    booking?.reasonCode,
    booking?.reasonDescription,
    booking?.createdBy,
    booking?.autocabBookedBy,
    bookingDisplayBooker(booking),
    booking?.department
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}


function useEscapeClose(
  active,
  onClose
) {
  useEffect(() => {
    if (!active) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      onClose();
    }

    document.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {
      document.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, [
    active,
    onClose
  ]);
}



function bookingMapPointIsValid(point) {
  return (
    Number.isFinite(
      Number(point?.latitude)
    ) &&
    Number.isFinite(
      Number(point?.longitude)
    )
  );
}


function bookingMapStopLabel(
  point,
  index,
  total
) {
  if (point?.stopType === 'pickup') {
    return 'P';
  }

  if (
    point?.stopType === 'destination' ||
    index === total - 1
  ) {
    return 'D';
  }

  return String(index);
}


function bookingMapStopTitle(
  point,
  index
) {
  if (point?.stopType === 'pickup') {
    return 'Pickup';
  }

  if (point?.stopType === 'destination') {
    return 'Destination';
  }

  return `Via ${index}`;
}


function bookingCodingStatusText(status) {
  const labels = {
    valid: 'Recognised',
    invalid: 'Not recognised',
    mismatch: 'Does not match',
    not_checked: 'Not checked',
    missing: 'Missing'
  };

  return (
    labels[status] ||
    formatStatus(status || '')
  );
}


function AnimatedVehicleMarker({
  position,
  icon,
  children
}) {
  const markerRef =
    useRef(null);

  const previousPositionRef =
    useRef(position);

  useEffect(() => {
    const marker =
      markerRef.current;

    if (
      !marker ||
      !Array.isArray(position) ||
      position.length !== 2
    ) {
      return;
    }

    const previous =
      previousPositionRef.current;

    previousPositionRef.current =
      position;

    if (
      !Array.isArray(previous) ||
      previous.length !== 2
    ) {
      marker.setLatLng(position);
      return;
    }

    const fromLat =
      Number(previous[0]);

    const fromLng =
      Number(previous[1]);

    const toLat =
      Number(position[0]);

    const toLng =
      Number(position[1]);

    if (
      !Number.isFinite(fromLat) ||
      !Number.isFinite(fromLng) ||
      !Number.isFinite(toLat) ||
      !Number.isFinite(toLng)
    ) {
      marker.setLatLng(position);
      return;
    }

    if (
      fromLat === toLat &&
      fromLng === toLng
    ) {
      return;
    }

    const durationMs = 1400;
    const startedAt =
      performance.now();

    let animationFrame = null;

    function animate(now) {
      const elapsed =
        now - startedAt;

      const progress =
        Math.min(
          elapsed / durationMs,
          1
        );

      const eased =
        1 -
        Math.pow(
          1 - progress,
          3
        );

      const nextLat =
        fromLat +
        (
          toLat - fromLat
        ) * eased;

      const nextLng =
        fromLng +
        (
          toLng - fromLng
        ) * eased;

      marker.setLatLng([
        nextLat,
        nextLng
      ]);

      if (progress < 1) {
        animationFrame =
          requestAnimationFrame(
            animate
          );
      }
    }

    animationFrame =
      requestAnimationFrame(
        animate
      );

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(
          animationFrame
        );
      }
    };
  }, [position]);

  return (
    <Marker
      ref={markerRef}
      position={
        previousPositionRef.current
      }
      icon={icon}
      zIndexOffset={1000}
    >
      {children}
    </Marker>
  );
}


function BookingMapBounds({
  coordinates
}) {
  const map = useMap();

  useEffect(() => {
    if (!coordinates.length) {
      return;
    }

    const bounds =
      L.latLngBounds(
        coordinates.map(
          ([latitude, longitude]) =>
            [latitude, longitude]
        )
      );

    map.invalidateSize();

    if (coordinates.length === 1) {
      map.setView(
        coordinates[0],
        15
      );

      return;
    }

    map.fitBounds(
      bounds,
      {
        padding: [48, 48],
        maxZoom: 14
      }
    );
  }, [map, coordinates]);

  return null;
}


function BookingRouteMap({
  booking
}) {
  const routePoints =
    (
      Array.isArray(
        booking?.routePoints
      )
        ? booking.routePoints
        : []
    )
      .filter(
        bookingMapPointIsValid
      )
      .map(
        (point) => ({
          ...point,
          latitude:
            Number(point.latitude),
          longitude:
            Number(point.longitude)
        })
      )
      .sort(
        (a, b) =>
          Number(
            a.sequenceNumber ?? 0
          ) -
          Number(
            b.sequenceNumber ?? 0
          )
      );

  const hasLiveVehicle =
    booking?.liveState === 'live' &&
    Number.isFinite(
      Number(
        booking?.vehicleLatitude
      )
    ) &&
    Number.isFinite(
      Number(
        booking?.vehicleLongitude
      )
    );

  const liveVehiclePoint =
    hasLiveVehicle
      ? [
          Number(
            booking.vehicleLatitude
          ),
          Number(
            booking.vehicleLongitude
          )
        ]
      : null;

  const routeCoordinates =
    routePoints.map(
      (point) => [
        point.latitude,
        point.longitude
      ]
    );

  const routeRequestCoordinates =
    routeCoordinates
      .map(
        ([latitude, longitude]) =>
          `${longitude},${latitude}`
      )
      .join(';');

  const [
    roadRouteCoordinates,
    setRoadRouteCoordinates
  ] = useState([]);

  const [
    roadRouteState,
    setRoadRouteState
  ] = useState(
    routeCoordinates.length > 1
      ? 'loading'
      : 'idle'
  );

  useEffect(() => {
    if (
      routeCoordinates.length < 2 ||
      !routeRequestCoordinates
    ) {
      setRoadRouteCoordinates([]);
      setRoadRouteState('idle');
      return;
    }

    const controller =
      new AbortController();

    setRoadRouteCoordinates([]);
    setRoadRouteState('loading');

    const url =
      `${API_BASE}/api/routing/route?` +
      new URLSearchParams({
        coordinates:
          routeRequestCoordinates
      }).toString();

    apiFetch(
      url,
      {
        signal: controller.signal
      }
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Routing service returned ${response.status}`
          );
        }

        return response.json();
      })
      .then((data) => {
        const coordinates =
          data?.route
            ?.geometry
            ?.coordinates;

        if (
          data?.code !== 'Ok' ||
          !Array.isArray(coordinates)
        ) {
          throw new Error(
            'Routing service returned no usable route'
          );
        }

        const roadCoordinates =
          coordinates
            .map((coordinate) => {
              const longitude =
                Number(coordinate?.[0]);

              const latitude =
                Number(coordinate?.[1]);

              return [
                latitude,
                longitude
              ];
            })
            .filter(
              ([latitude, longitude]) =>
                Number.isFinite(latitude) &&
                Number.isFinite(longitude)
            );

        if (
          roadCoordinates.length < 2
        ) {
          throw new Error(
            'Routing service returned an empty route'
          );
        }

        setRoadRouteCoordinates(
          roadCoordinates
        );

        setRoadRouteState('ready');
      })
      .catch((error) => {
        if (
          error?.name ===
          'AbortError'
        ) {
          return;
        }

        setRoadRouteCoordinates([]);
        setRoadRouteState('fallback');
      });

    return () => {
      controller.abort();
    };
  }, [routeRequestCoordinates]);

  const displayedRouteCoordinates =
    roadRouteCoordinates.length > 1
      ? roadRouteCoordinates
      : routeCoordinates;

  const allCoordinates = [
    ...displayedRouteCoordinates,
    ...(
      liveVehiclePoint
        ? [liveVehiclePoint]
        : []
    )
  ];

  if (!allCoordinates.length) {
    return (
      <div className="booking-map-unavailable">
        Route coordinates are not available for this booking.
      </div>
    );
  }

  const initialCentre =
    routeCoordinates[0] ||
    liveVehiclePoint;

  const createStopPinIcon = (
    markerClass,
    label
  ) =>
    L.divIcon({
      className:
        'booking-map-div-icon booking-map-pin-wrapper',
      html: `
        <span class="booking-map-pin ${markerClass}">
          <span class="booking-map-pin-label">
            ${label}
          </span>
        </span>
      `,
      iconSize: [32, 44],
      iconAnchor: [16, 44],
      popupAnchor: [0, -39]
    });

  const pickupIcon =
    createStopPinIcon(
      'pickup',
      'P'
    );

  const destinationIcon =
    createStopPinIcon(
      'destination',
      'D'
    );

  const viaIcon = (label) =>
    createStopPinIcon(
      'via',
      label
    );

  const vehicleHeading =
    Number.isFinite(
      Number(
        booking.vehicleHeadingDegrees
      )
    )
      ? Number(
          booking.vehicleHeadingDegrees
        )
      : 0;

  const vehicleIcon =
    L.divIcon({
      className:
        'booking-map-div-icon booking-live-vehicle-icon',
      html: `
        <span class="booking-live-vehicle-marker">
          <span class="booking-live-vehicle-badge">
            <svg
              class="booking-live-vehicle-svg"
              viewBox="0 0 32 32"
              aria-hidden="true"
              focusable="false"
              style="transform:rotate(${vehicleHeading}deg)"
            >
              <g class="booking-live-vehicle-shape">
                <rect
                  x="10"
                  y="5"
                  width="12"
                  height="22"
                  rx="4"
                />
                <rect
                  x="12"
                  y="8"
                  width="8"
                  height="5"
                  rx="1.5"
                  class="booking-live-vehicle-glass"
                />
                <rect
                  x="12"
                  y="15"
                  width="8"
                  height="5"
                  rx="1.5"
                  class="booking-live-vehicle-glass"
                />
                <rect
                  x="8"
                  y="9"
                  width="3"
                  height="5"
                  rx="1"
                />
                <rect
                  x="21"
                  y="9"
                  width="3"
                  height="5"
                  rx="1"
                />
                <rect
                  x="8"
                  y="18"
                  width="3"
                  height="5"
                  rx="1"
                />
                <rect
                  x="21"
                  y="18"
                  width="3"
                  height="5"
                  rx="1"
                />
                <path
                  d="
                    M13 5
                    L16 2
                    L19 5
                    Z
                  "
                />
              </g>
            </svg>
          </span>

          <span
            class="booking-live-vehicle-status"
            aria-hidden="true"
          />
        </span>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -18]
    });

  return (
    <div className="booking-route-map-shell">
      <MapContainer
        className="booking-route-map"
        center={initialCentre}
        zoom={13}
        scrollWheelZoom={false}
      >
        {MAP_TILE_URL && (
          <TileLayer
            attribution={
              MAP_TILE_ATTRIBUTION
            }
            url={MAP_TILE_URL}
          />
        )}

        <BookingMapBounds
          coordinates={
            allCoordinates
          }
        />

        {displayedRouteCoordinates.length > 1 && (
          <Polyline
            positions={
              displayedRouteCoordinates
            }
            pathOptions={{
              weight: 4,
              opacity: 0.78
            }}
          />
        )}

        {routePoints.map(
          (point, index) => {
            const label =
              bookingMapStopLabel(
                point,
                index,
                routePoints.length
              );

            const icon =
              point.stopType ===
                'pickup'
                ? pickupIcon
                : point.stopType ===
                    'destination'
                  ? destinationIcon
                  : viaIcon(label);

            return (
              <Marker
                key={
                  `${booking.id}-map-${point.stopType}-${point.sequenceNumber ?? index}`
                }
                position={[
                  point.latitude,
                  point.longitude
                ]}
                icon={icon}
              >
                <Popup>
                  <strong>
                    {bookingMapStopTitle(
                      point,
                      index
                    )}
                  </strong>

                  <div>
                    {point.address ||
                      'Address unavailable'}
                  </div>
                </Popup>
              </Marker>
            );
          }
        )}

        {liveVehiclePoint && (
          <AnimatedVehicleMarker
            position={
              liveVehiclePoint
            }
            icon={vehicleIcon}
          >
            <Popup>
              <strong>
                Live taxi
                {booking.vehicleCallsign
                  ? ` ${booking.vehicleCallsign}`
                  : ''}
              </strong>

              {booking.driverName && (
                <div>
                  {booking.driverName}
                </div>
              )}

              {booking.vehicleRegistration && (
                <div>
                  {booking.vehicleRegistration}
                </div>
              )}

              {booking.vehicleSpeedMph !==
                null &&
                booking.vehicleSpeedMph !==
                  undefined && (
                  <div>
                    {booking.vehicleSpeedMph} mph
                    {booking.vehicleHeadingDirection
                      ? ` · ${booking.vehicleHeadingDirection}`
                      : ''}
                  </div>
                )}
            </Popup>
          </AnimatedVehicleMarker>
        )}
      </MapContainer>

      <div className="booking-map-legend">
        <span>
          <i className="booking-map-legend-dot pickup"/>
          Pickup
        </span>

        <span>
          <i className="booking-map-legend-dot via"/>
          Via
        </span>

        <span>
          <i className="booking-map-legend-dot destination"/>
          Destination
        </span>

        {liveVehiclePoint && (
          <span className="booking-map-live-legend">
            <i
              className="booking-map-live-car-symbol"
              aria-hidden="true"
            />
            Live taxi
          </span>
        )}
      </div>

      {routeCoordinates.length > 1 && (
        <div
          className={`booking-map-route-status ${roadRouteState}`}
        >
          {roadRouteState === 'ready'
            ? 'Road route shown between the booked stops.'
            : roadRouteState === 'loading'
              ? 'Loading road route…'
              : roadRouteState === 'fallback'
                ? 'Road routing is unavailable. Showing the booked stops with an approximate route.'
                : ''}
        </div>
      )}
    </div>
  );
}


function formatBookingAuditEvent(event) {
  const labels = {
    booking_created: 'Booking Created',
    booking_imported: 'Booking Created',
    booking_amended: 'Booking Amended',
    booking_modified: 'Booking Modified',
    autocab_submission_started: 'Sent to Autocab',
    autocab_booking_created: 'Autocab Booking Created',
    booking_dispatch_accepted: 'Driver Allocated / Dispatched',
    booking_arrived: 'Driver Arrived',
    passenger_on_board: 'Passenger On Board',
    booking_running_late: 'Running Late',
    booking_complete: 'Booking Completed',
    booking_completed: 'Booking Completed',
    booking_cancelled: 'Booking Cancelled',
    autocab_cancellation_started: 'Cancellation Sent to Autocab',
    autocab_cancellation_succeeded: 'Cancellation Confirmed',
    no_fare: 'No Fare',
    invoice_created: 'Invoice Created',
    credit_note_issued: 'Credit Note Issued'
  };

  return (
    labels[event?.eventType] ||
    String(event?.eventType || 'Booking Event')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (character) =>
        character.toUpperCase()
      )
  );
}


function bookingEventPayload(event) {
  if (
    !event?.rawPayload
  ) {
    return null;
  }

  if (
    typeof event.rawPayload ===
      'object'
  ) {
    return event.rawPayload;
  }

  try {
    return JSON.parse(
      event.rawPayload
    );
  } catch {
    return null;
  }
}


function bookingAmendmentChanges(event) {
  if (
    event?.eventType !==
      'booking_amended'
  ) {
    return [];
  }

  const payload =
    bookingEventPayload(event);

  return Array.isArray(
    payload?.changes
  )
    ? payload.changes
        .filter(
          (change) =>
            change &&
            change.label &&
            (
              change.before !==
                undefined ||
              change.after !==
                undefined
            )
        )
    : [];
}


function formatAmendmentHistoryValue(
  change,
  value
) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  ) {
    return 'None';
  }

  if (
    change?.valueType ===
      'datetime'
  ) {
    return formatBookingDateTime(
      value
    );
  }

  return String(value);
}


function formatAuditSource(source) {
  const labels = {
    autocab: 'Autocab',
    portal: 'UHP Portal',
    uhp_admin: 'UHP Portal',
    system: 'System'
  };

  return (
    labels[source] ||
    String(source || 'System')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (character) =>
        character.toUpperCase()
      )
  );
}


function formatInternalAuditAction(action) {
  return String(action || 'Internal Action')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
}


function BookingDetailModal({
  booking: initialBooking,
  onClose,
  context = 'uhp',
  actions = null,
  children
}) {
  const [
    liveOperational,
    setLiveOperational
  ] = useState({});

  useEscapeClose(
    Boolean(initialBooking),
    onClose
  );

  useEffect(() => {
    setLiveOperational({});

    if (!initialBooking?.id) {
      return;
    }

    const shouldTrack =
      LIVE_OPERATIONAL_STATUSES.has(
        initialBooking.operationalStatus
      ) ||
      initialBooking.liveState === 'live' ||
      initialBooking.liveState === 'stale';

    if (!shouldTrack) {
      return;
    }

    let cancelled = false;
    let timerId = null;

    async function refreshLiveState() {
      try {
        const response =
          await apiFetch(
            `${API_BASE}/api/bookings/${initialBooking.id}/live-state`
          );

        if (!response.ok) {
          return;
        }

        const data =
          await response.json();

        if (
          cancelled ||
          !data?.booking
        ) {
          return;
        }

        setLiveOperational(
          data.booking
        );

        const nextStatus =
          data.booking
            .operationalStatus;

        const stillOperational =
          LIVE_OPERATIONAL_STATUSES.has(
            nextStatus
          ) ||
          data.booking.liveState ===
            'live' ||
          data.booking.liveState ===
            'stale';

        if (
          !stillOperational &&
          timerId
        ) {
          window.clearInterval(
            timerId
          );

          timerId = null;
        }
      } catch {
        // Keep the last known operational
        // state if a refresh temporarily fails.
      }
    }

    refreshLiveState();

    timerId =
      window.setInterval(
        refreshLiveState,
        LIVE_BOOKING_REFRESH_MS
      );

    return () => {
      cancelled = true;

      if (timerId) {
        window.clearInterval(
          timerId
        );
      }
    };
  }, [
    initialBooking?.id,
    initialBooking?.operationalStatus,
    initialBooking?.liveState
  ]);

  if (!initialBooking) return null;

  const booking = {
    ...initialBooking,
    ...liveOperational
  };

  const stops =
    booking.stops?.length
      ? booking.stops
      : [
          {
            sequenceNumber: 0,
            stopType: 'pickup',
            address: booking.pickupAddress,
            postcode: booking.pickupPostcode
          },
          {
            sequenceNumber: 999,
            stopType: 'destination',
            address: booking.destinationAddress,
            postcode: booking.destinationPostcode
          }
        ].filter((stop) => stop.address);

  const history =
    booking.events ?? [];

  const internalAuditHistory =
    booking.auditEvents ?? [];

  const uhpVisibleBookingEvents =
    new Set([
      'booking_imported',
      'booking_created',
      'booking_amended',
      'autocab_submission_started',
      'autocab_booking_created',
      'booking_dispatch_accepted',
      'booking_arrived',
      'passenger_on_board',
      'booking_complete',
      'booking_completed',
      'booking_cancelled',
      'autocab_cancellation_started',
      'autocab_cancellation_succeeded',
      'no_fare'
    ]);

  const unifiedAuditHistory = [
    ...history
      .filter((event) =>
        uhpVisibleBookingEvents.has(
          event.eventType
        )
      )
      .map((event) => ({
        ...event,
        auditKey: `event-${event.id}`,
        auditType: 'booking'
      })),

    ...internalAuditHistory.map((event) => ({
      ...event,
      auditKey: `audit-${event.id}`,
      auditType: 'internal',
      eventSource: event.source || 'system',
      eventType: event.action || 'internal_action',
      oldStatus: null,
      newStatus: null,
      notes:
        event.fieldName
          ? [
              event.fieldName
                .replaceAll('_', ' ')
                .replace(/\b\w/g, (character) =>
                  character.toUpperCase()
                ),
              event.oldValue !== null &&
              event.oldValue !== undefined &&
              event.newValue !== null &&
              event.newValue !== undefined
                ? `${event.oldValue} → ${event.newValue}`
                : event.newValue !== null &&
                    event.newValue !== undefined
                  ? String(event.newValue)
                  : null
            ]
              .filter(Boolean)
              .join(': ')
          : null
    }))
  ]
    .sort((left, right) => {
      const leftTime =
        Date.parse(left.eventAt || '') || 0;

      const rightTime =
        Date.parse(right.eventAt || '') || 0;

      return rightTime - leftTime;
    });

  const compactAuditHistory =
    unifiedAuditHistory.reduce(
      (items, event) => {
        const previous =
          items[items.length - 1];

        const groupable =
          event.auditType === 'booking' &&
          event.eventType === 'booking_modified' &&
          event.eventSource === 'autocab';

        if (
          groupable &&
          previous &&
          previous.auditType === 'booking' &&
          previous.eventType === 'booking_modified' &&
          previous.eventSource === 'autocab'
        ) {
          previous.repeatCount += 1;
          return items;
        }

        items.push({
          ...event,
          repeatCount: 1
        });

        return items;
      },
      []
    );

  const isNac =
    context === 'nac';

  const codingReviewRequired =
    booking.financialStatus ===
      'coding_required';

  const hasParsedCoding =
    Boolean(
      booking.parsedReasonCode ||
      booking.parsedBudgetNumber ||
      booking.parsedBudgetHolder
    );

  const hasOperationalDetail =
    Boolean(
      booking.driverName ||
      booking.driverCallsign ||
      booking.vehicleCallsign ||
      booking.vehicleRegistration ||
      booking.vehiclePlateNumber ||
      booking.acceptedAt ||
      booking.arrivedAt ||
      booking.passengerOnBoardAt ||
      booking.completedEventAt ||
      booking.cancelledEventAt ||
      booking.noFareAt ||
      booking.liveState
    );

  const operationalTimeline = [
    {
      label: 'Driver Allocated / Dispatched',
      at: booking.acceptedAt
    },
    {
      label: 'Driver Arrived',
      at: booking.arrivedAt
    },
    {
      label: 'Passenger On Board',
      at: booking.passengerOnBoardAt
    },
    {
      label: 'Completed',
      at:
        booking.completedEventAt ||
        booking.completedAt
    },
    {
      label: 'Cancelled',
      at:
        booking.cancelledEventAt ||
        booking.cancelledAt
    },
    {
      label: 'No Fare',
      at: booking.noFareAt
    }
  ].filter((item) => item.at);

  return (
    <div
      className="modal-backdrop booking-detail-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="modal-card booking-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Booking details"
      >
        <div className="booking-modal-header">
          <div>
            {bookingHasVisiblePortalReference(
              booking
            ) && (
              <div className="booking-modal-eyebrow">
                {portalBookingReference(
                  booking
                )}
              </div>
            )}

            <div className="booking-modal-title-row">
              <h2>
                {autocabBookingPrimary(booking)}
              </h2>

              <span
                className={
                  `badge ${booking.operationalStatus}`
                }
              >
                {formatOperationalStatus(
                  booking.operationalStatus
                )}
              </span>

              {(
                booking.hasBeenAmended ||
                booking.events?.some(
                  (event) =>
                    event.eventType ===
                      'booking_amended'
                )
              ) && (
                <span className="amended-chip">
                  Amended
                </span>
              )}

              {booking.hasException && (
                <span className="exception-chip">
                  Attention
                </span>
              )}
            </div>

            <p>
              {formatBookingDateTime(
                booking.requestedPickupAt
              )}
              {' · '}
              {booking.passengerName || 'Passenger'}
            </p>
          </div>

          <button
            type="button"
            className="modal-close booking-detail-close"
            onClick={onClose}
            aria-label="Close booking details"
          >
            ×
          </button>
        </div>

        <div className="booking-modal-body">
          {actions && (
            <div className="booking-modal-primary-actions">
              {actions}
            </div>
          )}

          {booking.hasException && (
            <div className="exception-panel">
              <strong>
                Attention Required
              </strong>

              {booking.exceptionReasons?.map(
                (reason) => (
                  <span key={reason}>
                    {reason}
                  </span>
                )
              )}
            </div>
          )}

          <div className="booking-modal-section">
            <div className="booking-modal-section-heading">
              <h3>Passenger & Booking</h3>
            </div>

            <div className="booking-modal-facts">
              <div>
                <small>Passenger</small>
                <strong>
                  {booking.passengerName || '—'}
                </strong>
              </div>

              <div>
                <small>Contact Number</small>
                <strong>
                  {booking.passengerMobile || '—'}
                </strong>
              </div>

              <div>
                <small>Passengers</small>
                <strong>
                  {booking.passengerCount ?? '—'}
                </strong>
              </div>

              <div>
                <small>Booked By</small>
                <strong>
                  {bookingDisplayBooker(booking)}
                </strong>
              </div>

              <div>
                <small>Booking Source</small>
                <strong>
                  {bookingDisplaySource(booking)}
                </strong>
              </div>

              <div>
                <small>Pickup Date & Time</small>
                <strong>
                  {formatBookingDateTime(
                    booking.requestedPickupAt
                  )}
                </strong>
              </div>

              <div>
                <small>Booked At</small>
                <strong>
                  {formatBookingDateTime(
                    bookingDisplayBookedAt(booking)
                  )}
                </strong>
              </div>

              <div>
                <small>Autocab Booking</small>
                <strong>
                  {booking.autocabBookingId || 'Pending'}
                </strong>
              </div>

              {bookingHasVisiblePortalReference(
                booking
              ) && (
                <div>
                  <small>
                    Portal Reference
                  </small>

                  <strong>
                    {booking.publicReference}
                  </strong>
                </div>
              )}
            </div>
          </div>

          <div className="booking-modal-columns">
            <div className="booking-modal-section">
              <div className="booking-modal-section-heading">
                <h3>Journey</h3>
              </div>

              <div className="booking-route-detail booking-modal-route">
                {stops.map((stop, index) => (
                  <div
                    className="detail-stop"
                    key={
                      `${booking.id}-${stop.sequenceNumber ?? index}`
                    }
                  >
                    <span
                      className={
                        `detail-stop-dot ${stop.stopType}`
                      }
                    />

                    <div>
                      <small>
                        {stop.stopType === 'pickup'
                          ? 'Pickup'
                          : stop.stopType === 'destination'
                            ? 'Destination'
                            : `Via ${index}`}
                      </small>

                      <strong>
                        {stop.address || '—'}
                      </strong>

                      {stop.postcode && (
                        <span>
                          {stop.postcode}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="booking-modal-map">
                <BookingRouteMap
                  booking={booking}
                />
              </div>
            </div>

            <div className="booking-modal-section">
              <div className="booking-modal-section-heading">
                <h3>UHP Coding</h3>
              </div>

              {codingReviewRequired && (
                <div className="booking-coding-review booking-coding-review-compact">
                  <div className="booking-coding-review-heading">
                    <strong>
                      Coding review required
                    </strong>

                    <span>
                      Requested Autocab coding needs matching to UHP records.
                    </span>
                  </div>

                  {hasParsedCoding && (
                    <div className="booking-coding-requested booking-coding-requested-compact">
                      <div>
                        <small>Reason</small>
                        <strong>
                          {booking.parsedReasonCode ||
                            'Not supplied'}
                        </strong>
                        {booking.codingReasonStatus && (
                          <span>
                            {bookingCodingStatusText(
                              booking.codingReasonStatus
                            )}
                          </span>
                        )}
                      </div>

                      <div>
                        <small>Budget</small>
                        <strong>
                          {booking.parsedBudgetNumber ||
                            'Not supplied'}
                        </strong>
                        {booking.codingBudgetStatus && (
                          <span>
                            {bookingCodingStatusText(
                              booking.codingBudgetStatus
                            )}
                          </span>
                        )}
                      </div>

                      <div>
                        <small>Budget Holder</small>
                        <strong>
                          {booking.parsedBudgetHolder ||
                            'Not supplied'}
                        </strong>
                        {booking.codingHolderStatus && (
                          <span>
                            {bookingCodingStatusText(
                              booking.codingHolderStatus
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="booking-modal-facts booking-modal-facts-single">
                {booking.department && (
                  <div>
                    <small>Department</small>
                    <strong>
                      {booking.department}
                    </strong>
                  </div>
                )}

                {booking.budgetNumber && (
                  <div>
                    <small>Budget</small>
                    <strong>
                      {booking.budgetNumber}
                      {booking.budgetName
                        ? ` · ${booking.budgetName}`
                        : ''}
                    </strong>
                  </div>
                )}

                {booking.budgetHolder && (
                  <div>
                    <small>Budget Holder</small>
                    <strong>
                      {booking.budgetHolder}
                    </strong>
                  </div>
                )}

                {booking.reasonCode && (
                  <div>
                    <small>Reason</small>
                    <strong>
                      {booking.reasonCode}
                      {booking.reasonDescription
                        ? ` · ${booking.reasonDescription}`
                        : ''}
                    </strong>
                  </div>
                )}

                <div>
                  <small>Financial Status</small>
                  <strong>
                    {booking.financialStatus
                      ? formatStatus(
                          booking.financialStatus
                        )
                      : '—'}
                  </strong>
                </div>

                {isNac && (
                  <div>
                    <small>OurReference</small>
                    <strong>
                      {booking.autocabReference || '—'}
                    </strong>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="booking-modal-section">
            <div className="booking-modal-section-heading">
              <h3>Notes</h3>
            </div>

            <div className="booking-modal-notes">
              <div>
                <small>Driver Notes</small>
                <p>
                  {booking.driverNotes || 'No driver notes.'}
                </p>
              </div>

              {isNac && (
                <div>
                  <small>Office / Internal Notes</small>
                  <p>
                    {booking.internalNotes ||
                      'No internal notes.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {hasOperationalDetail && (
            <>
              <div className="booking-modal-section">
                <div className="booking-modal-section-heading">
                  <h3>Driver &amp; Vehicle</h3>
                </div>

                <div className="booking-modal-facts">
                  <div>
                    <small>Driver</small>
                    <strong>
                      {booking.driverName || '—'}
                    </strong>
                  </div>

                  <div>
                    <small>Driver Callsign</small>
                    <strong>
                      {booking.driverCallsign || '—'}
                    </strong>
                  </div>

                  <div>
                    <small>Vehicle</small>
                    <strong>
                      {booking.vehicleCallsign || '—'}
                    </strong>
                  </div>

                  <div>
                    <small>Registration</small>
                    <strong>
                      {booking.vehicleRegistration || '—'}
                    </strong>
                  </div>

                  <div>
                    <small>Plate Number</small>
                    <strong>
                      {booking.vehiclePlateNumber || '—'}
                    </strong>
                  </div>

                  <div>
                    <small>Operational State</small>
                    <strong>
                      {booking.liveState === 'live'
                        ? 'Live'
                        : booking.liveState === 'stale'
                          ? 'Stale last-known status'
                          : 'Not Live'}
                    </strong>
                  </div>

                  <div>
                    <small>Last Fleet Update</small>
                    <strong>
                      {formatBookingDateTime(
                        booking.fleetStateAt
                      )}
                    </strong>
                  </div>

                  <div>
                    <small>Snapshot Captured</small>
                    <strong>
                      {formatBookingDateTime(
                        booking.identitySnapshotAt ||
                        booking.operationalSnapshotAt
                      )}
                    </strong>
                  </div>
                </div>

                {booking.liveState === 'stale' && (
                  <div className="operational-state-note stale">
                    <strong>
                      Last known Autocab status
                    </strong>

                    <span>
                      {formatOperationalStatus(
                        booking.operationalStatus
                      )}
                      {booking.liveStateReason
                        ? ` · ${booking.liveStateReason}`
                        : ''}
                    </span>
                  </div>
                )}

                {booking.liveState === 'live' &&
                  booking.vehicleLatitude !== null &&
                  booking.vehicleLatitude !== undefined &&
                  booking.vehicleLongitude !== null &&
                  booking.vehicleLongitude !== undefined && (
                    <div className="operational-state-note live">
                      <strong>
                        Live vehicle telemetry
                      </strong>

                      <span>
                        {booking.vehicleSpeedMph !== null &&
                        booking.vehicleSpeedMph !== undefined
                          ? `${booking.vehicleSpeedMph} mph`
                          : 'Position available'}

                        {booking.vehicleHeadingDirection
                          ? ` · ${booking.vehicleHeadingDirection}`
                          : ''}

                        {booking.vehiclePositionAt
                          ? ` · Updated ${formatBookingDateTime(
                              booking.vehiclePositionAt
                            )}`
                          : ''}
                      </span>
                    </div>
                  )}
              </div>

              {isNac && (
                <div className="booking-modal-section">
                  <div className="booking-modal-section-heading">
                    <h3>Operational Timeline</h3>
                  </div>

                  {operationalTimeline.length ? (
                    <div className="operational-timeline">
                      {operationalTimeline.map(
                        (item) => (
                          <div
                            className="operational-timeline-item"
                            key={`${item.label}-${item.at}`}
                          >
                            <span className="operational-timeline-dot"/>

                            <div>
                              <strong>
                                {item.label}
                              </strong>

                              <small>
                                {formatBookingDateTime(
                                  item.at
                                )}
                              </small>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <span className="history-empty">
                      No operational timestamps recorded yet.
                    </span>
                  )}
                </div>
              )}

            </>
          )}

          {!isNac && (
            <div className="booking-modal-section booking-audit-section">
              <div className="booking-modal-section-heading">
                <h3>Booking History</h3>
              </div>

              {compactAuditHistory.length ? (
                <div className="booking-audit-log">
                  {compactAuditHistory.map((event) => {
                    const importedBooker =
                      booking.autocabBookedBy ||
                      booking.bookedBy ||
                      booking.createdBy ||
                      booking.bookerName ||
                      null;

                    let actor = 'System';

                    if (event.auditType === 'internal') {
                      actor = event.actorName
                        ? `${event.actorName} · UHP`
                        : 'UHP Portal · System';
                    } else if (
                      event.eventSource === 'portal'
                    ) {
                      actor = event.actorName
                        ? `${event.actorName} · UHP`
                        : 'UHP Portal · System';
                    } else if (
                      event.eventSource === 'autocab'
                    ) {
                      if (event.actorName) {
                        actor =
                          `${event.actorName} · Need-A-Cab`;
                      } else if (
                        (
                          event.eventType ===
                            'booking_imported' ||
                          event.eventType ===
                            'booking_created'
                        ) &&
                        importedBooker
                      ) {
                        actor =
                          `${importedBooker} · Need-A-Cab`;
                      } else {
                        actor = 'Autocab · System';
                      }
                    }

                    const title =
                      event.auditType === 'internal'
                        ? formatInternalAuditAction(
                            event.eventType
                          )
                        : formatBookingAuditEvent(
                            event
                          );

                    const amendmentChanges =
                      bookingAmendmentChanges(
                        event
                      );

                    return (
                      <div
                        className="booking-audit-item"
                        key={event.auditKey}
                      >
                        <div className="booking-audit-heading">
                          <strong>
                            {title}

                            {event.repeatCount > 1 && (
                              <span className="booking-audit-repeat">
                                ×{event.repeatCount}
                              </span>
                            )}
                          </strong>

                          <span className="booking-audit-summary">
                            {actor}

                            {event.eventType !==
                              'booking_amended' &&
                              event.oldStatus &&
                              event.newStatus &&
                              event.oldStatus !==
                                event.newStatus && (
                              <>
                                {' · '}
                                {formatOperationalStatus(
                                  event.oldStatus
                                )}
                                {' → '}
                                {formatOperationalStatus(
                                  event.newStatus
                                )}
                              </>
                            )}
                          </span>

                          <small>
                            {formatBookingDateTime(
                              event.eventAt
                            )}
                          </small>
                        </div>

                        {amendmentChanges.length > 0 && (
                          <div className="booking-audit-changes">
                            {amendmentChanges.map(
                              (
                                change,
                                changeIndex
                              ) => (
                                <div
                                  className="booking-audit-change"
                                  key={
                                    `${event.auditKey}-${change.field || changeIndex}`
                                  }
                                >
                                  <strong>
                                    {change.label}
                                  </strong>

                                  <div>
                                    <span>
                                      {formatAmendmentHistoryValue(
                                        change,
                                        change.before
                                      )}
                                    </span>

                                    <span
                                      className="booking-audit-change-arrow"
                                      aria-hidden="true"
                                    >
                                      →
                                    </span>

                                    <span>
                                      {formatAmendmentHistoryValue(
                                        change,
                                        change.after
                                      )}
                                    </span>
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        )}

                        {event.notes &&
                          amendmentChanges.length === 0 && (
                          <div className="booking-audit-notes">
                            {event.notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <span className="history-empty">
                  No audit events recorded for this booking.
                </span>
              )}
            </div>
          )}


          {isNac && (
            <div className="booking-modal-section">
              <div className="booking-modal-section-heading">
                <h3>Job History</h3>
              </div>

              <div className="booking-history-panel booking-modal-history">
                {history.length ? (
                  history.map((event) => (
                    <div
                      className="history-event"
                      key={event.id}
                    >
                      <strong>
                        {formatStatus(
                          event.eventType
                        )}
                      </strong>

                      <span>
                        {event.eventAt}
                      </span>

                      {event.notes && (
                        <small>
                          {event.notes}
                        </small>
                      )}
                    </div>
                  ))
                ) : (
                  <span className="history-empty">
                    No recorded events.
                  </span>
                )}
              </div>
            </div>
          )}

          {children && (
            <div className="booking-modal-actions-area">
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function NacControlPage() {
  const [summary, setSummary] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedBooking, setSelectedBooking] =
    useState(null);

  async function loadControl() {
    setLoading(true);
    setError('');

    try {
      const [summaryResponse, bookingsResponse] =
        await Promise.all([
          apiFetch(
            `${API_BASE}/api/control/summary`
          ),
          apiFetch(
            `${API_BASE}/api/control/bookings`
          )
        ]);

      const summaryData =
        await summaryResponse.json();

      const bookingData =
        await bookingsResponse.json();

      if (!summaryResponse.ok) {
        throw new Error(
          summaryData.error ||
          'Unable to load control summary'
        );
      }

      if (!bookingsResponse.ok) {
        throw new Error(
          bookingData.error ||
          'Unable to load bookings'
        );
      }

      setSummary(summaryData);
      setBookings(bookingData.bookings ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load control'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadControl();
  }, []);

  const operationalQueue = useMemo(
    () =>
      bookings
        .filter(
          (booking) =>
            [
              'live',
              'stale',
              'booked'
            ].includes(
              bookingStatusGroup(
                booking
              )
            )
        )
        .sort(
          (a, b) => {
            const aOverdue =
              bookingIsOverdue(a);

            const bOverdue =
              bookingIsOverdue(b);

            if (
              aOverdue !== bOverdue
            ) {
              return aOverdue
                ? -1
                : 1;
            }

            return (
              new Date(
                a.requestedPickupAt
              ) -
              new Date(
                b.requestedPickupAt
              )
            );
          }
        )
        .slice(0, 8),
    [bookings]
  );


  if (loading) {
    return (
      <div className="card state-panel">
        Loading Need-A-Cab control...
      </div>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Need-A-Cab Control</h1>

          <p>
            Operational view of UHP-funded
            transport requests.
          </p>
        </div>
      </div>

      {error && (
        <div className="notice error">
          {error}
        </div>
      )}

      <div className="stats-grid nac-control-stats">
        <Stat
          icon={<CarFront/>}
          label="Active"
          value={summary?.active ?? 0}
        />

        <Stat
          icon={<Clock3/>}
          label="Due Today"
          value={summary?.dueToday ?? 0}
        />

        <Stat
          icon={<CheckCircle2/>}
          label="Completed"
          value={summary?.completed ?? 0}
        />

        <Stat
          icon={<AlertTriangle/>}
          label="Exceptions"
          value={summary?.exceptions ?? 0}
        />
      </div>

      <div className="control-grid">
        <section className="card control-panel">
          <div className="panel-heading">
            <div>
              <h2>Operational Queue</h2>

              <p>
                Live, upcoming and overdue UHP
                journeys requiring operational
                visibility.
              </p>
            </div>
          </div>

          {operationalQueue.length === 0 ? (
            <div className="empty-bookings compact-empty">
              <CalendarDays size={28}/>

              <strong>
                No active requests
              </strong>

              <span>
                New or live UHP bookings will
                appear here.
              </span>
            </div>
          ) : (
            <div className="control-booking-list">
              {operationalQueue.map((booking) => (
                <div
                  className="control-booking-item booking-row-clickable"
                  key={booking.id}
                  role="button"
                  tabIndex="0"
                  onClick={() =>
                    setSelectedBooking(booking)
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' ||
                      event.key === ' '
                    ) {
                      event.preventDefault();
                      setSelectedBooking(booking);
                    }
                  }}
                >
                  <div className="control-time">
                    <strong>
                      {formatBookingDateTime(
                        booking.requestedPickupAt
                      )}
                    </strong>

                    <small>
                      {autocabBookingPrimary(booking)}
                    </small>
                  </div>

                  <div className="control-passenger">
                    <strong>
                      {booking.passengerName}
                    </strong>

                    <small>
                      {booking.pickupAddress}
                      {' → '}
                      {booking.destinationAddress}
                    </small>
                  </div>

                  <div className="control-meta">
                    <span
                      className={
                        `badge ${booking.operationalStatus}`
                      }
                    >
                      {formatOperationalStatus(
                        booking.operationalStatus
                      )}
                    </span>

                    {bookingIsStale(
                              booking
                            ) && (
                              <span className="stale-chip">
                                Stale
                              </span>
                            )}

                            {bookingIsOverdue(
                      booking
                    ) && (
                      <span className="overdue-chip">
                        Overdue
                      </span>
                    )}

                    {booking.hasException && (
                      <span className="exception-chip">
                        Exception
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="card control-side-panel">
          <h3>Portal Status</h3>

          <div className="control-kpi">
            <span>Request Recorded</span>
            <strong>
              {summary?.requestRecorded ?? 0}
            </strong>
          </div>

          <div className="control-kpi">
            <span>Cancelled</span>
            <strong>
              {summary?.cancelled ?? 0}
            </strong>
          </div>

          <div className="control-kpi">
            <span>Total Requests</span>
            <strong>
              {summary?.total ?? 0}
            </strong>
          </div>

          <div className="control-note">
            Autocab-linked UHP bookings and
            portal requests are shown together
            in this operational view.
          </div>
        </aside>
      </div>

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          context="nac"
          onClose={() =>
            setSelectedBooking(null)
          }
        />
      )}
    </>
  );
}

function NacBookingsPage({
  exceptionsOnly = false
}) {
  const [bookings, setBookings] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [budgets, setBudgets] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] =
    useState('all');
  const [departmentFilter, setDepartmentFilter] =
    useState('all');
  const [budgetFilter, setBudgetFilter] =
    useState('all');
  const [fromDate, setFromDate] =
    useState('');

  const [toDate, setToDate] =
    useState('');

  const [selectedBooking, setSelectedBooking] =
    useState(null);

  async function loadOperationalBookings() {
    setLoading(true);
    setError('');

    try {
      const [
        bookingResponse,
        departmentResponse,
        budgetResponse
      ] = await Promise.all([
        apiFetch(
          `${API_BASE}/api/control/bookings`
        ),
        apiFetch(
          `${API_BASE}/api/departments`
        ),
        apiFetch(
          `${API_BASE}/api/budgets`
        )
      ]);

      const bookingData =
        await bookingResponse.json();

      const departmentData =
        await departmentResponse.json();

      const budgetData =
        await budgetResponse.json();

      if (!bookingResponse.ok) {
        throw new Error(
          bookingData.error ||
          'Unable to load operational bookings'
        );
      }

      if (!departmentResponse.ok) {
        throw new Error(
          departmentData.error ||
          'Unable to load departments'
        );
      }

      if (!budgetResponse.ok) {
        throw new Error(
          budgetData.error ||
          'Unable to load budgets'
        );
      }

      setBookings(
        bookingData.bookings ?? []
      );

      setDepartments(
        departmentData.departments ?? []
      );

      setBudgets(
        budgetData.budgets ?? []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load operational bookings'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOperationalBookings();
  }, []);

  const filteredBookings = useMemo(() => {
    const term =
      query.trim().toLowerCase();

    return bookings.filter((booking) => {
      if (
        exceptionsOnly &&
        !booking.hasException
      ) {
        return false;
      }

      if (
        statusFilter !== 'all' &&
        bookingStatusGroup(
          booking
        ) !== statusFilter
      ) {
        return false;
      }

      if (
        departmentFilter !== 'all' &&
        String(booking.departmentId) !==
          String(departmentFilter)
      ) {
        return false;
      }

      if (
        budgetFilter !== 'all' &&
        String(booking.budgetId) !==
          String(budgetFilter)
      ) {
        return false;
      }

      const pickupDate =
        String(
          booking.requestedPickupAt || ''
        ).slice(0, 10);

      if (
        fromDate &&
        pickupDate < fromDate
      ) {
        return false;
      }

      if (
        toDate &&
        pickupDate > toDate
      ) {
        return false;
      }

      if (!term) {
        return true;
      }

      return bookingSearchText(
        booking
      ).includes(term);
    });
  }, [
    bookings,
    exceptionsOnly,
    query,
    statusFilter,
    departmentFilter,
    budgetFilter,
    fromDate,
    toDate
  ]);

  const statusCounts = useMemo(
    () => ({
      all: bookings.length,

      live: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'live'
      ).length,

      booked: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'booked'
      ).length,

      completed: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'completed'
      ).length,

      no_fare: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'no_fare'
      ).length,

      cancelled: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'cancelled'
      ).length
    }),
    [bookings]
  );


  if (loading) {
    return (
      <div className="card state-panel">
        Loading operational bookings...
      </div>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {exceptionsOnly
              ? 'UHP Exceptions'
              : 'UHP Bookings'}
          </h1>

          <p>
            {exceptionsOnly
              ? 'Bookings requiring operational or financial attention.'
              : 'All UHP-funded transport requests across the portal.'}
          </p>
        </div>
      </div>

      {error && (
        <div className="notice error">
          {error}
        </div>
      )}

      {!exceptionsOnly && (
        <div className="booking-status-cards">
          {[
            ['all', 'All', statusCounts.all],
            ['live', 'Live', statusCounts.live],
            ['booked', 'Booked', statusCounts.booked],
            ['completed', 'Completed', statusCounts.completed],
            ['no_fare', 'No Fare', statusCounts.no_fare],
            ['cancelled', 'Cancelled', statusCounts.cancelled]
          ].map(
            ([key, label, value]) => (
              <button
                key={key}
                type="button"
                className={
                  `booking-status-card ${
                    statusFilter === key
                      ? 'active'
                      : ''
                  }`
                }
                onClick={() =>
                  setStatusFilter(key)
                }
              >
                <small>{label}</small>
                <strong>{value}</strong>
              </button>
            )
          )}
        </div>
      )}

      <div className="card nac-bookings-card">
        <div className="nac-filter-grid">
          <div className="search compact">
            <Search size={17}/>

            <input
              value={query}
              onChange={(e) =>
                setQuery(e.target.value)
              }
              placeholder="Search ID, passenger, phone, journey, booked by..."
            />
          </div>

          <label className="date-filter-field">
            <span>From</span>

            <input
              type="date"
              value={fromDate}
              onChange={(e) =>
                setFromDate(
                  e.target.value
                )
              }
            />
          </label>

          <label className="date-filter-field">
            <span>To</span>

            <input
              type="date"
              value={toDate}
              onChange={(e) =>
                setToDate(
                  e.target.value
                )
              }
            />
          </label>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value
              )
            }
          >
            <option value="all">
              All statuses
            </option>

            <option value="live">
              Live
            </option>

            <option value="booked">
              Booked
            </option>

            <option value="completed">
              Completed
            </option>

            <option value="no_fare">
              No Fare
            </option>

            <option value="cancelled">
              Cancelled
            </option>
          </select>

          <select
            value={departmentFilter}
            onChange={(e) =>
              setDepartmentFilter(
                e.target.value
              )
            }
          >
            <option value="all">
              All departments
            </option>

            {departments.map(
              (department) => (
                <option
                  key={department.id}
                  value={department.id}
                >
                  {department.name}
                </option>
              )
            )}
          </select>

          <select
            value={budgetFilter}
            onChange={(e) =>
              setBudgetFilter(
                e.target.value
              )
            }
          >
            <option value="all">
              All budgets
            </option>

            {budgets.map((budget) => (
              <option
                key={budget.id}
                value={budget.id}
              >
                {budget.budgetNumber}
              </option>
            ))}
          </select>
        </div>

        <div className="nac-results-summary">
          <strong>
            {filteredBookings.length}
          </strong>

          <span>
            {exceptionsOnly
              ? 'exceptions'
              : 'bookings'}
          </span>
        </div>

        {filteredBookings.length === 0 ? (
          <div className="empty-bookings">
            {exceptionsOnly ? (
              <AlertTriangle size={30}/>
            ) : (
              <CalendarDays size={30}/>
            )}

            <strong>
              {exceptionsOnly
                ? 'No exceptions'
                : 'No bookings found'}
            </strong>

            <span>
              {exceptionsOnly
                ? 'There are currently no bookings requiring attention.'
                : 'Adjust the filters or create a UHP transport request.'}
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="bookings-table booking-list-compact nac-bookings-table">
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Booking</th>
                  <th>Passenger</th>
                  <th>Journey</th>
                  <th>Department</th>
                  <th>Budget</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {filteredBookings.map(
                  (booking) => {
                    return (
                      <React.Fragment
                        key={booking.id}
                      >
                        <tr
                          className={
                            `booking-row-clickable ${
                              booking.hasException
                                ? 'exception-row'
                                : ''
                            }`
                          }
                          role="button"
                          tabIndex="0"
                          onClick={() =>
                            setSelectedBooking(booking)
                          }
                          onKeyDown={(event) => {
                            if (
                              event.key === 'Enter' ||
                              event.key === ' '
                            ) {
                              event.preventDefault();
                              setSelectedBooking(booking);
                            }
                          }}
                        >
                          <td>
                            <strong>
                              {formatBookingDateTime(
                                booking.requestedPickupAt
                              )}
                            </strong>

                            <small>
                              Booked{' '}
                              {formatBookingDateTime(
                                bookingDisplayBookedAt(
                                  booking
                                )
                              )}
                            </small>
                          </td>

                          <td>
                            <strong>
                              {autocabBookingPrimary(booking)}
                            </strong>

                            {bookingHasVisiblePortalReference(
                              booking
                            ) && (
                              <small>
                                {portalBookingReference(
                                  booking
                                )}
                              </small>
                            )}
                          </td>

                          <td>
                            <strong>
                              {booking.passengerName}
                            </strong>

                            <small>
                              {booking.passengerMobile}
                            </small>
                          </td>

                          <td className="journey-cell">
                            <strong>
                              {booking.pickupAddress}
                            </strong>

                            <small>
                              to {booking.destinationAddress}
                            </small>
                          </td>

                          <td>
                            <strong>
                              {booking.department || '—'}
                            </strong>

                            <small>
                              Booked by {bookingDisplayBooker(booking)}
                            </small>
                          </td>

                          <td>
                            <strong>
                              {booking.budgetNumber}
                            </strong>

                            <small>
                              {booking.reasonCode}
                            </small>
                          </td>

                          <td>
                            <span
                              className={
                                `badge ${booking.operationalStatus}`
                              }
                            >
                              {formatOperationalStatus(
                                booking.operationalStatus
                              )}
                            </span>

                            {booking.hasBeenAmended && (
                              <span className="amended-chip">
                                Amended
                              </span>
                            )}

                            {bookingIsStale(
                              booking
                            ) && (
                              <span className="stale-chip">
                                Stale
                              </span>
                            )}

                            {bookingIsOverdue(
                              booking
                            ) && (
                              <span className="overdue-chip">
                                Overdue
                              </span>
                            )}

                            {booking.hasException && (
                              <span className="exception-chip table-exception">
                                Attention
                              </span>
                            )}
                          </td>

                        </tr>

                      </React.Fragment>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          context="nac"
          onClose={() =>
            setSelectedBooking(null)
          }
        />
      )}
    </>
  );
}


function formatMoneyFromPence(
  value,
  currency = 'GBP'
) {
  if (
    value === null ||
    value === undefined
  ) {
    return '—';
  }

  return new Intl.NumberFormat(
    'en-GB',
    {
      style: 'currency',
      currency
    }
  ).format(
    Number(value) / 100
  );
}


function autocabBookingPrimary(booking) {
  return booking?.autocabBookingId
    ? `Autocab ${booking.autocabBookingId}`
    : 'Autocab Pending';
}


function portalBookingReference(booking) {
  return booking?.publicReference
    ? `Portal Ref: ${booking.publicReference}`
    : 'Portal Ref: —';
}


function bookingNoticeReference(booking) {
  if (booking?.autocabBookingId) {
    return `Autocab ${booking.autocabBookingId}`;
  }

  if (booking?.publicReference) {
    return `Portal ${booking.publicReference}`;
  }

  return 'Booking';
}


function formatPickup(value) {
  if (!value) return '—';

  return value
    .replace('T', ' ')
    .slice(0, 16);
}


function BudgetInvoicesPage() {
  const [bookings, setBookings] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [query, setQuery] =
    useState('');

  const [statusFilter, setStatusFilter] =
    useState('all');

  useEffect(() => {
    let cancelled = false;

    async function loadInvoiceReady() {
      setLoading(true);
      setError('');

      try {
        const response = await apiFetch(
          `${API_BASE}/api/budget-invoice-ready`
        );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
            'Unable to load invoice-ready bookings'
          );
        }

        if (!cancelled) {
          setBookings(
            data.bookings ?? []
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load invoice-ready bookings'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadInvoiceReady();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredBookings =
    useMemo(() => {
      const term =
        query.trim().toLowerCase();

      return bookings.filter(
        (booking) => {
          const matchesStatus =
            statusFilter === 'all' ||
            booking.financialStatus ===
              statusFilter;

          const matchesQuery =
            !term ||
            [
              booking.autocabBookingId,
              booking.publicReference,
              booking.autocabReference,
              booking.passengerName,
              booking.pickupAddress,
              booking.destinationAddress,
              booking.budgetNumber,
              booking.budgetName,
              booking.reasonCode,
              booking.reasonDescription,
              booking.createdBy,
              booking.department
            ]
              .filter(Boolean)
              .some((value) =>
                String(value)
                  .toLowerCase()
                  .includes(term)
              );

          return (
            matchesStatus &&
            matchesQuery
          );
        }
      );
    }, [
      bookings,
      query,
      statusFilter
    ]);

  const readyCount =
    bookings.filter(
      (booking) =>
        booking.financialStatus ===
          'approved_for_invoice'
    ).length;

  const invoicedCount =
    bookings.filter(
      (booking) =>
        booking.financialStatus ===
          'invoiced'
    ).length;

  if (loading) {
    return (
      <div className="card state-panel">
        Loading invoice-ready bookings...
      </div>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Invoices</h1>

          <p>
            View completed UHP transport that has passed financial review for budgets you oversee.
          </p>
        </div>
      </div>

      {error && (
        <div className="notice error">
          {error}
        </div>
      )}

      <div className="invoice-foundation-note">
        Fare totals, invoice numbers and downloadable invoices will appear here once completed fare data and invoice generation are integrated.
      </div>

      <div className="stats-grid">
        <Stat
          icon={<CheckCircle2/>}
          label="Ready for Invoice"
          value={readyCount}
        />

        <Stat
          icon={<WalletCards/>}
          label="Invoiced"
          value={invoicedCount}
        />
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search compact">
            <Search size={17}/>

            <input
              value={query}
              onChange={(event) =>
                setQuery(
                  event.target.value
                )
              }
              placeholder="Search invoice-ready bookings..."
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value
              )
            }
          >
            <option value="all">
              All financial statuses
            </option>

            <option value="approved_for_invoice">
              Ready for Invoice
            </option>

            <option value="invoiced">
              Invoiced
            </option>
          </select>
        </div>

        {filteredBookings.length === 0 ? (
          <div className="empty-bookings">
            <WalletCards size={30}/>

            <strong>
              No invoice-ready bookings
            </strong>

            <span>
              Completed bookings will appear here after they have been approved for invoice.
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="bookings-table invoice-ready-table">
              <thead>
                <tr>
                  <th>Completed</th>
                  <th>Booking</th>
                  <th>Passenger</th>
                  <th>Journey</th>
                  <th>Budget</th>
                  <th>Reason</th>
                  <th>Booked By</th>
                  <th>Actual Fare</th>
                  <th>Financial Status</th>
                </tr>
              </thead>

              <tbody>
                {filteredBookings.map(
                  (booking) => (
                    <tr key={booking.id}>
                      <td>
                        <strong>
                          {booking.completedAt
                            ? formatPickup(
                                booking.completedAt
                              )
                            : '—'}
                        </strong>
                      </td>

                      <td>
                        <strong>
                          {autocabBookingPrimary(booking)}
                        </strong>

                        <small>
                          {portalBookingReference(booking)}
                        </small>
                      </td>

                      <td>
                        <strong>
                          {booking.passengerName}
                        </strong>
                      </td>

                      <td className="journey-cell">
                        <strong>
                          {booking.pickupAddress}
                        </strong>

                        <small>
                          to{' '}
                          {booking.destinationAddress}
                        </small>
                      </td>

                      <td>
                        <strong>
                          {booking.budgetNumber}
                        </strong>

                        <small>
                          {booking.budgetName}
                        </small>
                      </td>

                      <td>
                        <strong>
                          {booking.reasonCode}
                        </strong>

                        <small>
                          {booking.reasonDescription}
                        </small>
                      </td>

                      <td>
                        <strong>
                          {booking.createdBy || '—'}
                        </strong>
                      </td>

                      <td>
                        <strong>
                          {formatMoneyFromPence(
                            booking.grossAmountPence,
                            booking.currency || 'GBP'
                          )}
                        </strong>

                        {booking.grossAmountPence ===
                          null ||
                        booking.grossAmountPence ===
                          undefined ? (
                          <small>
                            Fare not received
                          </small>
                        ) : (
                          <small>
                            {booking.financialSource
                              ? formatStatus(
                                  booking.financialSource
                                )
                              : 'Posted fare'}
                          </small>
                        )}
                      </td>

                      <td>
                        <span
                          className={
                            `badge financial-${booking.financialStatus}`
                          }
                        >
                          {booking.financialStatus ===
                          'approved_for_invoice'
                            ? 'Ready for Invoice'
                            : formatStatus(
                                booking.financialStatus
                              )}
                        </span>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}



function CodingReviewPage() {
  const [bookings, setBookings] =
    useState([]);

  const [options, setOptions] =
    useState({
      reasonCodes: [],
      budgets: []
    });

  const [selectedBookingId, setSelectedBookingId] =
    useState(null);

  const [form, setForm] =
    useState({
      reasonCodeId: '',
      budgetId: '',
      budgetHolderUserId: ''
    });

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState('');

  const [notice, setNotice] =
    useState('');


  async function loadCodingReview(
    preferredBookingId = null
  ) {
    setLoading(true);
    setError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/coding-review`
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to load coding review'
        );
      }

      const nextBookings =
        data.bookings ?? [];

      setBookings(
        nextBookings
      );

      setOptions({
        reasonCodes:
          data.options?.reasonCodes ?? [],

        budgets:
          data.options?.budgets ?? []
      });

      const stillExists =
        preferredBookingId &&
        nextBookings.some(
          (booking) =>
            booking.id ===
              preferredBookingId
        );

      const nextSelectedId =
        stillExists
          ? preferredBookingId
          : nextBookings[0]?.id ??
            null;

      setSelectedBookingId(
        nextSelectedId
      );

      setForm({
        reasonCodeId: '',
        budgetId: '',
        budgetHolderUserId: ''
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load coding review'
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    loadCodingReview();
  }, []);


  const selectedBooking =
    useMemo(
      () =>
        bookings.find(
          (booking) =>
            booking.id ===
              selectedBookingId
        ) || null,
      [
        bookings,
        selectedBookingId
      ]
    );


  const selectedBudget =
    useMemo(
      () =>
        options.budgets.find(
          (budget) =>
            String(budget.id) ===
              String(form.budgetId)
        ) || null,
      [
        options.budgets,
        form.budgetId
      ]
    );


  const availableHolders =
    selectedBudget?.holders ?? [];


  function selectBooking(bookingId) {
    setSelectedBookingId(
      bookingId
    );

    setForm({
      reasonCodeId: '',
      budgetId: '',
      budgetHolderUserId: ''
    });

    setError('');
    setNotice('');
  }


  function codingStatusLabel(status) {
    if (!status) {
      return 'Not provided';
    }

    return formatStatus(status);
  }


  function codingStatusClass(status) {
    if (status === 'valid') {
      return 'valid';
    }

    if (
      status === 'missing' ||
      status === 'invalid' ||
      status === 'mismatch'
    ) {
      return 'invalid';
    }

    return 'neutral';
  }


  async function approveCoding(event) {
    event.preventDefault();

    if (
      !selectedBooking ||
      !form.reasonCodeId ||
      !form.budgetId ||
      !form.budgetHolderUserId
    ) {
      setError(
        'Select a reason code, budget and budget holder before approving.'
      );

      return;
    }

    setSaving(true);
    setError('');
    setNotice('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/coding-review/${selectedBooking.id}/approve`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body:
              JSON.stringify({
                reasonCodeId:
                  Number(
                    form.reasonCodeId
                  ),

                budgetId:
                  Number(
                    form.budgetId
                  ),

                budgetHolderUserId:
                  Number(
                    form.budgetHolderUserId
                  )
              })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to approve coding'
        );
      }

      const approvedReference =
        bookingNoticeReference(selectedBooking);

      setNotice(
        `${approvedReference} coding has been approved.`
      );

      await loadCodingReview();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to approve coding'
      );
    } finally {
      setSaving(false);
    }
  }


  if (loading) {
    return (
      <div className="card state-panel">
        Loading coding review...
      </div>
    );
  }


  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Coding Review</h1>

          <p>
            Review UHP bookings where the
            operator-supplied financial coding
            could not be validated.
          </p>
        </div>

        <div className="coding-review-count">
          <strong>
            {bookings.length}
          </strong>

          <span>
            awaiting review
          </span>
        </div>
      </div>


      {error && (
        <div className="notice error">
          {error}
        </div>
      )}


      {notice && (
        <div className="notice success">
          {notice}
        </div>
      )}


      {!bookings.length ? (
        <div className="card coding-review-empty">
          <CheckCircle2 size={36}/>

          <strong>
            No coding exceptions
          </strong>

          <span>
            All imported UHP bookings currently
            have valid financial coding.
          </span>
        </div>
      ) : (
        <div className="coding-review-layout">
          <div className="card coding-review-queue">
            <div className="coding-review-card-heading">
              <div>
                <h2>
                  Awaiting Review
                </h2>

                <p>
                  Select a booking to inspect the
                  original Autocab coding.
                </p>
              </div>
            </div>


            <div className="coding-review-list">
              {bookings.map(
                (booking) => {
                  const active =
                    booking.id ===
                      selectedBookingId;

                  return (
                    <button
                      type="button"
                      key={booking.id}
                      className={
                        active
                          ? 'coding-review-list-item active'
                          : 'coding-review-list-item'
                      }
                      onClick={() =>
                        selectBooking(
                          booking.id
                        )
                      }
                    >
                      <div className="coding-review-list-top">
                        <strong>
                          {autocabBookingPrimary(booking)}
                        </strong>

                        <span className="coding-required-chip">
                          Coding Required
                        </span>
                      </div>

                      <small>
                        {portalBookingReference(booking)}
                      </small>

                      <span>
                        {formatPickup(
                          booking.requestedPickupAt
                        )}
                      </span>

                      <small>
                        {booking.passengerName}
                      </small>

                      <small>
                        {booking.pickupAddress}
                        {' → '}
                        {booking.destinationAddress}
                      </small>
                    </button>
                  );
                }
              )}
            </div>
          </div>


          {selectedBooking && (
            <div className="coding-review-main">
              <div className="card coding-review-booking">
                <div className="coding-review-card-heading">
                  <div>
                    <span className="coding-review-kicker">
                      Booking
                    </span>

                    <h2>
                      {autocabBookingPrimary(selectedBooking)}
                    </h2>

                    <p>
                      {selectedBooking.passengerName}
                      {' · '}
                      {formatPickup(
                        selectedBooking.requestedPickupAt
                      )}
                    </p>
                  </div>

                  <div className="coding-autocab-id">
                    <small>
                      Portal Reference
                    </small>

                    <strong>
                      {selectedBooking.publicReference || '—'}
                    </strong>
                  </div>
                </div>


                <div className="coding-journey-grid">
                  <div>
                    <small>
                      Pickup
                    </small>

                    <strong>
                      {selectedBooking.pickupAddress}
                    </strong>
                  </div>

                  <div>
                    <small>
                      Destination
                    </small>

                    <strong>
                      {selectedBooking.destinationAddress}
                    </strong>
                  </div>
                </div>


                {selectedBooking.stops?.length > 2 && (
                  <div className="coding-vias">
                    <small>
                      Vias
                    </small>

                    {selectedBooking.stops
                      .filter(
                        (stop) =>
                          stop.stopType ===
                            'via'
                      )
                      .map(
                        (stop) => (
                          <span
                            key={
                              `${selectedBooking.id}-${stop.sequenceNumber}`
                            }
                          >
                            {stop.address}
                          </span>
                        )
                      )}
                  </div>
                )}
              </div>


              <div className="card coding-source-card">
                <div className="coding-review-card-heading">
                  <div>
                    <span className="coding-review-kicker">
                      Original Autocab coding
                    </span>

                    <h2>
                      Validation Result
                    </h2>

                    <p>
                      The original values are
                      retained for audit purposes
                      and are not overwritten.
                    </p>
                  </div>
                </div>


                <div className="coding-raw-reference">
                  <small>
                    Raw OurReference
                  </small>

                  <strong>
                    {selectedBooking.rawReference ||
                      selectedBooking.autocabReference ||
                      '—'}
                  </strong>
                </div>


                <div className="coding-source-grid">
                  <div>
                    <small>
                      Reason Code
                    </small>

                    <strong>
                      {selectedBooking.parsedReasonCode ||
                        '—'}
                    </strong>

                    <span
                      className={
                        `coding-validation ${codingStatusClass(
                          selectedBooking.reasonStatus
                        )}`
                      }
                    >
                      {codingStatusLabel(
                        selectedBooking.reasonStatus
                      )}
                    </span>
                  </div>


                  <div>
                    <small>
                      Budget
                    </small>

                    <strong>
                      {selectedBooking.parsedBudgetNumber ||
                        '—'}
                    </strong>

                    <span
                      className={
                        `coding-validation ${codingStatusClass(
                          selectedBooking.budgetStatus
                        )}`
                      }
                    >
                      {codingStatusLabel(
                        selectedBooking.budgetStatus
                      )}
                    </span>
                  </div>


                  <div>
                    <small>
                      Budget Holder
                    </small>

                    <strong>
                      {selectedBooking.parsedBudgetHolder ||
                        '—'}
                    </strong>

                    <span
                      className={
                        `coding-validation ${codingStatusClass(
                          selectedBooking.holderStatus
                        )}`
                      }
                    >
                      {codingStatusLabel(
                        selectedBooking.holderStatus
                      )}
                    </span>
                  </div>
                </div>
              </div>


              <form
                className="card coding-correction-card"
                onSubmit={approveCoding}
              >
                <div className="coding-review-card-heading">
                  <div>
                    <span className="coding-review-kicker">
                      Correct coding
                    </span>

                    <h2>
                      Apply Valid Master Data
                    </h2>

                    <p>
                      Select existing approved UHP
                      reference data. This does not
                      create new budgets, reason
                      codes or holders.
                    </p>
                  </div>
                </div>


                <div className="coding-form-grid">
                  <label>
                    Reason Code

                    <select
                      required
                      value={
                        form.reasonCodeId
                      }
                      onChange={(event) =>
                        setForm({
                          ...form,
                          reasonCodeId:
                            event.target.value
                        })
                      }
                    >
                      <option value="">
                        Select reason code...
                      </option>

                      {options.reasonCodes.map(
                        (reason) => (
                          <option
                            key={reason.id}
                            value={reason.id}
                          >
                            {reason.code}
                            {' — '}
                            {reason.description}
                          </option>
                        )
                      )}
                    </select>
                  </label>


                  <label>
                    Budget

                    <select
                      required
                      value={
                        form.budgetId
                      }
                      onChange={(event) =>
                        setForm({
                          ...form,
                          budgetId:
                            event.target.value,
                          budgetHolderUserId:
                            ''
                        })
                      }
                    >
                      <option value="">
                        Select budget...
                      </option>

                      {options.budgets.map(
                        (budget) => (
                          <option
                            key={budget.id}
                            value={budget.id}
                          >
                            {budget.budgetNumber}
                            {' — '}
                            {budget.name}
                          </option>
                        )
                      )}
                    </select>
                  </label>


                  <label>
                    Budget Holder

                    <select
                      required
                      disabled={
                        !form.budgetId ||
                        !availableHolders.length
                      }
                      value={
                        form.budgetHolderUserId
                      }
                      onChange={(event) =>
                        setForm({
                          ...form,
                          budgetHolderUserId:
                            event.target.value
                        })
                      }
                    >
                      <option value="">
                        {!form.budgetId
                          ? 'Select a budget first...'
                          : availableHolders.length
                            ? 'Select budget holder...'
                            : 'No active holder assigned'}
                      </option>

                      {availableHolders.map(
                        (holder) => (
                          <option
                            key={
                              `${selectedBudget.id}-${holder.id}-${holder.assignmentType}`
                            }
                            value={holder.id}
                          >
                            {holder.name}
                            {' — '}
                            {formatStatus(
                              holder.assignmentType
                            )}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                </div>


                {form.budgetId &&
                  !availableHolders.length && (
                    <div className="inline-warning">
                      The selected budget has no
                      active primary or deputy
                      budget holder. Update the
                      budget assignment before
                      approving this booking.
                    </div>
                  )}


                <div className="coding-approval-note">
                  <AlertTriangle size={18}/>

                  <span>
                    Approval changes the booking
                    from <strong>Coding Required</strong>
                    {' '}to <strong>Authorised</strong>
                    {' '}and records the approving
                    user in the audit trail.
                  </span>
                </div>


                <div className="coding-review-actions">
                  <button
                    type="submit"
                    className="primary"
                    disabled={
                      saving ||
                      !form.reasonCodeId ||
                      !form.budgetId ||
                      !form.budgetHolderUserId
                    }
                  >
                    <CheckCircle2 size={17}/>

                    {saving
                      ? 'Approving...'
                      : 'Approve Coding'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </>
  );
}



function MyBookingsPage({
  currentUser,
  scope = 'mine'
}) {
  const bookingUserId = currentUser.id;

  const budgetScope =
    scope === 'budget';

  const allScope =
    scope === 'all';

  const ownScope =
    scope === 'mine';

  const broaderScope =
    budgetScope || allScope;

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] =
    useState('all');

  const [fromDate, setFromDate] =
    useState('');

  const [toDate, setToDate] =
    useState('');

  const [selectedBooking, setSelectedBooking] =
    useState(null);

  const selectedBookingOwnedByCurrentUser =
    Boolean(
      selectedBooking &&
      selectedBooking.createdByUserId ===
        currentUser.id
    );

  const selectedBookingManageable =
    Boolean(
      selectedBooking &&
      (
        selectedBookingOwnedByCurrentUser ||
        allScope
      )
    );

  const [editingBooking, setEditingBooking] = useState(null);
  const [editOptions, setEditOptions] = useState({
    budgets: [],
    reasonCodes: []
  });
  const [editForm, setEditForm] = useState(null);
  const [editVias, setEditVias] = useState([]);

  const [
    editSavedLocations,
    setEditSavedLocations
  ] = useState([]);

  const [savingEdit, setSavingEdit] = useState(false);
  const [editReview, setEditReview] = useState(null);
  const [
    editFailureMode,
    setEditFailureMode
  ] = useState(null);

  const [cancelBooking, setCancelBooking] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const [financialActionId, setFinancialActionId] =
    useState(null);

  const [disputeBooking, setDisputeBooking] =
    useState(null);

  const [disputeReason, setDisputeReason] =
    useState('');

  const [financialActionError, setFinancialActionError] =
    useState('');

  useEscapeClose(
    Boolean(disputeBooking),
    () => {
      if (
        disputeBooking &&
        financialActionId !==
          disputeBooking.id
      ) {
        closeDisputeFinancialBooking();
      }
    }
  );

  useEffect(() => {
    if (!editingBooking?.id) {
      setEditSavedLocations([]);
      return undefined;
    }

    let cancelled = false;

    async function loadEditSavedLocations() {
      try {
        const response =
          await apiFetch(
            `${API_BASE}/api/booking-options?userId=${bookingUserId}`
          );

        const data =
          await response.json();

        if (
          cancelled ||
          !response.ok
        ) {
          return;
        }

        setEditSavedLocations(
          Array.isArray(data.savedLocations)
            ? data.savedLocations
            : []
        );
      } catch {
        if (!cancelled) {
          /*
            Amendment remains usable with
            external address search if the
            shared directory is temporarily
            unavailable.
          */
          setEditSavedLocations([]);
        }
      }
    }

    loadEditSavedLocations();

    return () => {
      cancelled = true;
    };
  }, [
    editingBooking?.id,
    bookingUserId
  ]);


  useEscapeClose(
    Boolean(editingBooking),
    () => {
      if (!savingEdit) {
        closeAmend();
      }
    }
  );

  useEscapeClose(
    Boolean(cancelBooking),
    () => {
      if (!cancelling) {
        closeCancel();
      }
    }
  );


  async function loadBookings() {
    setLoading(true);
    setError('');

    try {
      const endpoint =
        allScope
          ? `${API_BASE}/api/uhp/bookings`
          : budgetScope
            ? `${API_BASE}/api/budget-bookings`
            : `${API_BASE}/api/my-bookings`;

      const response =
        await apiFetch(endpoint);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || 'Unable to load bookings'
        );
      }

      setBookings(data.bookings ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load bookings'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBookings();
  }, [
    allScope,
    budgetScope,
    bookingUserId
  ]);

  const filteredBookings = useMemo(() => {
    const term =
      query.trim().toLowerCase();

    return bookings.filter((booking) => {
      const matchesStatus =
        statusFilter === 'all' ||
        bookingStatusGroup(
          booking
        ) === statusFilter;

      const pickupDate =
        String(
          booking.requestedPickupAt || ''
        ).slice(0, 10);

      const matchesFrom =
        !fromDate ||
        pickupDate >= fromDate;

      const matchesTo =
        !toDate ||
        pickupDate <= toDate;

      const matchesQuery =
        !term ||
        bookingSearchText(
          booking
        ).includes(term);

      return (
        matchesStatus &&
        matchesFrom &&
        matchesTo &&
        matchesQuery
      );
    });
  }, [
    bookings,
    query,
    statusFilter,
    fromDate,
    toDate
  ]);

  const stats = useMemo(
    () => ({
      total: bookings.length,

      live: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'live'
      ).length,

      booked: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'booked'
      ).length,

      completed: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'completed'
      ).length,

      noFare: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'no_fare'
      ).length,

      cancelled: bookings.filter(
        (booking) =>
          bookingStatusGroup(booking) ===
            'cancelled'
      ).length
    }),
    [bookings]
  );

  function friendlyBookingStatus(status) {
    const map = {
      draft: 'Request Recorded',
      submitting: 'Sending to Dispatch',
      cancelling: 'Cancelling',
      modifying: 'Updating Booking',
      booked: 'Booked',
      confirmed: 'Confirmed',
      driver_allocated: 'Driver Allocated',
      driver_en_route: 'Driver En Route',
      driver_arrived: 'Driver Arrived',
      passenger_on_board: 'Passenger On Board',
      completed: 'Completed',
      cancelled: 'Cancelled',
      no_show: 'No Show',
      no_fare: 'No Fare',
      failed: 'Needs Attention',
      requires_review: 'Needs Attention'
    };

    return map[status] || formatStatus(status);
  }

  async function openAmend(bookingId) {
    setError('');
    setNotice('');

    try {
      const [bookingResponse, optionsResponse] =
        await Promise.all([
          apiFetch(
            `${API_BASE}/api/bookings/${bookingId}?userId=${bookingUserId}`
          ),
          apiFetch(
            `${API_BASE}/api/booking-options?userId=${bookingUserId}`
          )
        ]);

      const bookingData =
        await bookingResponse.json();

      const optionsData =
        await optionsResponse.json();

      if (!bookingResponse.ok) {
        throw new Error(
          bookingData.error ||
          'Unable to load booking'
        );
      }

      if (!optionsResponse.ok) {
        throw new Error(
          optionsData.error ||
          'Unable to load booking options'
        );
      }

      const booking = bookingData.booking;

      if (
        ![
          'draft',
          'booked',
          'confirmed'
        ].includes(
          booking.operationalStatus
        )
      ) {
        throw new Error(
          'This booking can no longer be amended'
        );
      }

      const [pickupDate = '', pickupTime = ''] =
        String(booking.requestedPickupAt || '')
          .split('T');

      const pickup =
        booking.stops?.find(
          (stop) => stop.stopType === 'pickup'
        ) ?? {};

      const destination =
        booking.stops?.find(
          (stop) => stop.stopType === 'destination'
        ) ?? {};

      const vias =
        booking.stops
          ?.filter(
            (stop) => stop.stopType === 'via'
          )
          .map((stop) => ({
            address: stop.address || '',
            postcode: stop.postcode || ''
          })) ?? [];

      setEditOptions({
        budgets: optionsData.budgets ?? [],
        reasonCodes:
          optionsData.reasonCodes ?? []
      });

      setEditForm({
        pickupDate,
        pickupTime: pickupTime.slice(0, 5),
        pickupAddress:
          pickup.address ||
          booking.pickupAddress ||
          '',
        pickupPostcode:
          pickup.postcode ||
          booking.pickupPostcode ||
          '',
        destinationAddress:
          destination.address ||
          booking.destinationAddress ||
          '',
        destinationPostcode:
          destination.postcode ||
          booking.destinationPostcode ||
          '',
        passengerName:
          booking.passengerName || '',
        passengerMobile:
          booking.passengerMobile || '',
        passengerCount:
          booking.passengerCount || 1,
        budgetId:
          String(booking.budgetId || ''),
        reasonCodeId:
          String(booking.reasonCodeId || ''),
        driverNotes:
          booking.driverNotes || ''
      });

      setEditForm(
        (current) => ({
          ...current,

          pickupLatitude:
            pickup.latitude ?? null,
          pickupLongitude:
            pickup.longitude ?? null,
          pickupSavedLocationId:
            pickup.savedLocationId ?? null,
          pickupLocationName:
            pickup.locationName ?? null,
          pickupPickupInstructions:
            pickup.pickupInstructions ?? null,

          destinationLatitude:
            destination.latitude ?? null,
          destinationLongitude:
            destination.longitude ?? null,
          destinationSavedLocationId:
            destination.savedLocationId ?? null,
          destinationLocationName:
            destination.locationName ?? null,
          destinationPickupInstructions:
            destination.pickupInstructions ?? null
        })
      );

      setEditVias(
        (
          Array.isArray(booking.stops)
            ? booking.stops
            : []
        )
          .filter(
            (stop) =>
              stop.stopType === 'via'
          )
          .map((stop) => ({
            address:
              stop.address || '',
            postcode:
              stop.postcode || '',
            latitude:
              stop.latitude ?? null,
            longitude:
              stop.longitude ?? null,
            savedLocationId:
              stop.savedLocationId ?? null,
            locationName:
              stop.locationName ?? null,
            pickupInstructions:
              stop.pickupInstructions ?? null
          }))
      );

      setEditingBooking(booking);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load booking'
      );
    }
  }

  function updateEditForm(field, value) {
    setEditForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function addEditVia() {
    setEditVias((current) => [
      ...current,
      {
        address: '',
        postcode: '',
        latitude: null,
        longitude: null,
        savedLocationId: null,
        locationName: null,
        pickupInstructions: null
      }
    ]);
  }

  function updateEditVia(
    index,
    field,
    value
  ) {
    setEditVias((current) =>
      current.map((via, viaIndex) =>
        viaIndex === index
          ? {
              ...via,
              [field]: value
            }
          : via
      )
    );
  }

  function removeEditVia(index) {
    setEditVias((current) =>
      current.filter(
        (_, viaIndex) => viaIndex !== index
      )
    );
  }

  function closeAmend() {
    if (savingEdit) return;

    setEditingBooking(null);
    setEditForm(null);
    setEditVias([]);
    setEditSavedLocations([]);
    setEditReview(null);
    setEditFailureMode(null);
    setError('');
  }

  function amendmentReviewValue(value) {
    const normalised =
      String(value ?? '').trim();

    return normalised || '—';
  }

  function amendmentRouteSummary(stops) {
    return (
      Array.isArray(stops)
        ? stops
            .filter(
              (stop) =>
                stop?.address
            )
            .map(
              (stop) =>
                [
                  stop.address,
                  stop.postcode
                ]
                  .filter(Boolean)
                  .join(', ')
            )
            .join(' → ')
        : ''
    );
  }

  function reviewAmendment(event) {
    event.preventDefault();

    if (!editingBooking || !editForm) {
      return;
    }

    setError('');
    setNotice('');
    setEditFailureMode(null);

    const originalPickup =
      editingBooking.stops?.find(
        (stop) =>
          stop.stopType === 'pickup'
      ) ?? {};

    const originalDestination =
      editingBooking.stops?.find(
        (stop) =>
          stop.stopType === 'destination'
      ) ?? {};

    const originalVias =
      (
        Array.isArray(
          editingBooking.stops
        )
          ? editingBooking.stops
          : []
      ).filter(
        (stop) =>
          stop.stopType === 'via'
      );

    const proposedVias =
      editVias.filter(
        (via) =>
          via.address.trim()
      );

    const originalBudget =
      editOptions.budgets.find(
        (budget) =>
          Number(budget.id) ===
          Number(editingBooking.budgetId)
      );

    const proposedBudget =
      editOptions.budgets.find(
        (budget) =>
          Number(budget.id) ===
          Number(editForm.budgetId)
      );

    const originalReason =
      editOptions.reasonCodes.find(
        (reason) =>
          Number(reason.id) ===
          Number(editingBooking.reasonCodeId)
      );

    const proposedReason =
      editOptions.reasonCodes.find(
        (reason) =>
          Number(reason.id) ===
          Number(editForm.reasonCodeId)
      );

    const rows = [
      {
        label:
          'Pickup date & time',

        before:
          String(
            editingBooking.requestedPickupAt ||
            ''
          )
            .replace('T', ' ')
            .slice(0, 16),

        after:
          `${editForm.pickupDate} ${editForm.pickupTime}`
      },

      {
        label:
          'Pickup',

        before:
          [
            originalPickup.address ||
              editingBooking.pickupAddress,
            originalPickup.postcode ||
              editingBooking.pickupPostcode
          ]
            .filter(Boolean)
            .join(', '),

        after:
          [
            editForm.pickupAddress,
            editForm.pickupPostcode
          ]
            .filter(Boolean)
            .join(', ')
      },

      {
        label:
          'Via points',

        before:
          amendmentRouteSummary(
            originalVias
          ),

        after:
          amendmentRouteSummary(
            proposedVias
          )
      },

      {
        label:
          'Destination',

        before:
          [
            originalDestination.address ||
              editingBooking.destinationAddress,
            originalDestination.postcode ||
              editingBooking.destinationPostcode
          ]
            .filter(Boolean)
            .join(', '),

        after:
          [
            editForm.destinationAddress,
            editForm.destinationPostcode
          ]
            .filter(Boolean)
            .join(', ')
      },

      {
        label:
          'Passenger name',

        before:
          editingBooking.passengerName,

        after:
          editForm.passengerName
      },

      {
        label:
          'Contact number',

        before:
          editingBooking.passengerMobile,

        after:
          editForm.passengerMobile
      },

      {
        label:
          'Passenger count',

        before:
          editingBooking.passengerCount,

        after:
          editForm.passengerCount
      },

      {
        label:
          'Budget',

        before:
          originalBudget
            ? `${originalBudget.budgetNumber} — ${originalBudget.name}`
            : editingBooking.budgetNumber,

        after:
          proposedBudget
            ? `${proposedBudget.budgetNumber} — ${proposedBudget.name}`
            : editForm.budgetId
      },

      {
        label:
          'Reason code',

        before:
          originalReason
            ? `${originalReason.code} — ${originalReason.description}`
            : editingBooking.reasonCode,

        after:
          proposedReason
            ? `${proposedReason.code} — ${proposedReason.description}`
            : editForm.reasonCodeId
      },

      {
        label:
          'Driver notes',

        before:
          editingBooking.driverNotes,

        after:
          editForm.driverNotes
      }
    ];

    const changes =
      rows
        .map((row) => ({
          ...row,

          before:
            amendmentReviewValue(
              row.before
            ),

          after:
            amendmentReviewValue(
              row.after
            )
        }))
        .filter(
          (row) =>
            row.before !== row.after
        );

    if (changes.length === 0) {
      setError(
        'No changes have been made to this booking.'
      );
      return;
    }

    setEditReview({
      changes,

      isLive:
        editingBooking.operationalStatus ===
          'booked' ||
        editingBooking.operationalStatus ===
          'confirmed'
    });
  }

  async function submitAmendment() {
    if (!editingBooking || !editForm) return;

    setSavingEdit(true);
    setError('');
    setNotice('');

    try {
      const response = await apiFetch(
        `${API_BASE}/api/bookings/${editingBooking.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: bookingUserId,

            requestedPickupAt:
              `${editForm.pickupDate}T${editForm.pickupTime}:00`,

            passengerName:
              editForm.passengerName,

            passengerMobile:
              editForm.passengerMobile,

            passengerCount:
              Number(editForm.passengerCount),

            pickup: {
              address:
                editForm.pickupAddress,
              postcode:
                editForm.pickupPostcode,
              latitude:
                editForm.pickupLatitude,
              longitude:
                editForm.pickupLongitude,
              savedLocationId:
                editForm.pickupSavedLocationId,
              locationName:
                editForm.pickupLocationName,
              pickupInstructions:
                editForm.pickupPickupInstructions
            },

            vias: editVias
              .filter(
                (via) => via.address.trim()
              )
              .map((via) => ({
                address:
                  via.address,
                postcode:
                  via.postcode,
                latitude:
                  via.latitude,
                longitude:
                  via.longitude,
                savedLocationId:
                  via.savedLocationId,
                locationName:
                  via.locationName,
                pickupInstructions:
                  via.pickupInstructions
              })),

            destination: {
              address:
                editForm.destinationAddress,
              postcode:
                editForm.destinationPostcode,
              latitude:
                editForm.destinationLatitude,
              longitude:
                editForm.destinationLongitude,
              savedLocationId:
                editForm.destinationSavedLocationId,
              locationName:
                editForm.destinationLocationName,
              pickupInstructions:
                editForm.destinationPickupInstructions
            },

            driverNotes:
              editForm.driverNotes,

            budgetId:
              Number(editForm.budgetId),

            reasonCodeId:
              Number(editForm.reasonCodeId)
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to amend booking'
        );
      }

      closeAmend();
      await loadBookings();

      setNotice(
        `${bookingNoticeReference(data.booking)} has been amended successfully.`
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to amend booking';

      const requiresManualReview =
        message.includes(
          'result is uncertain'
        ) ||
        message.includes(
          'requires manual review'
        ) ||
        message.includes(
          'could not be verified'
        ) ||
        message.includes(
          'Manual reconciliation is required'
        );

      if (requiresManualReview) {
        await loadBookings();
      }

      setError(message);

      setEditFailureMode(
        requiresManualReview
          ? 'manual_review'
          : 'rejected'
      );
    } finally {
      setSavingEdit(false);
    }
  }

  function openCancel(booking) {
    setError('');
    setNotice('');
    setCancelReason('');
    setCancelBooking(booking);
  }

  function closeCancel() {
    if (cancelling) return;

    setCancelBooking(null);
    setCancelReason('');
  }

  async function confirmCancel(event) {
    event.preventDefault();

    if (!cancelBooking) return;

    setCancelling(true);
    setError('');
    setNotice('');

    try {
      const response = await apiFetch(
        `${API_BASE}/api/bookings/${cancelBooking.id}/cancel`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: bookingUserId,
            reason: cancelReason
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to cancel booking'
        );
      }

      closeCancel();
      await loadBookings();

      setNotice(
        `${bookingNoticeReference(data.booking)} has been cancelled.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to cancel booking'
      );
    } finally {
      setCancelling(false);
    }
  }

  async function approveFinancialBooking(
    booking
  ) {
    setFinancialActionId(booking.id);
    setFinancialActionError('');
    setError('');
    setNotice('');

    try {
      const response = await apiFetch(
        `${API_BASE}/api/bookings/${booking.id}/approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to approve booking'
        );
      }

      await loadBookings();

      setNotice(
        `${bookingNoticeReference(booking)} has been approved for invoice.`
      );

      setSelectedBooking(null);
    } catch (err) {
      setFinancialActionError(
        err instanceof Error
          ? err.message
          : 'Unable to approve booking'
      );
    } finally {
      setFinancialActionId(null);
    }
  }

  function openDisputeFinancialBooking(
    booking
  ) {
    setDisputeBooking(booking);
    setDisputeReason('');
    setFinancialActionError('');
    setError('');
    setNotice('');
  }

  function closeDisputeFinancialBooking() {
    if (financialActionId) return;

    setDisputeBooking(null);
    setDisputeReason('');
  }

  async function submitFinancialDispute(
    event
  ) {
    event.preventDefault();

    if (!disputeBooking) return;

    setFinancialActionId(
      disputeBooking.id
    );

    setFinancialActionError('');
    setError('');
    setNotice('');

    try {
      const response = await apiFetch(
        `${API_BASE}/api/bookings/${disputeBooking.id}/dispute`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            reason: disputeReason
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to dispute booking'
        );
      }

      const reference =
        bookingNoticeReference(disputeBooking);

      setDisputeBooking(null);
      setDisputeReason('');

      await loadBookings();

      setNotice(
        `${reference} has been marked as disputed.`
      );
    } catch (err) {
      setFinancialActionError(
        err instanceof Error
          ? err.message
          : 'Unable to dispute booking'
      );
    } finally {
      setFinancialActionId(null);
    }
  }

  if (loading) {
    return (
      <div className="card state-panel">
        Loading bookings...
      </div>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {allScope
              ? 'All UHP Bookings'
              : budgetScope
                ? 'Budget Bookings'
                : 'My Bookings'}
          </h1>

          <p>
            {allScope
              ? 'View all UHP account transport bookings across the hospital.'
              : budgetScope
                ? 'View UHP transport requests charged to budgets you are authorised to oversee.'
                : 'View and manage UHP transport requests you have created.'}
          </p>
        </div>
      </div>

      {error && (
        <div className="notice error">
          {error}
        </div>
      )}

      {notice && (
        <div className="notice success">
          {notice}
        </div>
      )}

      {financialActionError && (
        <div className="notice error">
          {financialActionError}
        </div>
      )}

      <div className="booking-status-cards">
        {[
          ['all', 'All', stats.total],
          ['live', 'Live', stats.live],
          ['booked', 'Booked', stats.booked],
          ['completed', 'Completed', stats.completed],
          ['no_fare', 'No Fare', stats.noFare],
          ['cancelled', 'Cancelled', stats.cancelled]
        ].map(
          ([key, label, value]) => (
            <button
              key={key}
              type="button"
              className={
                `booking-status-card ${
                  statusFilter === key
                    ? 'active'
                    : ''
                }`
              }
              onClick={() =>
                setStatusFilter(key)
              }
            >
              <small>{label}</small>
              <strong>{value}</strong>
            </button>
          )
        )}
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search compact">
            <Search size={17}/>

            <input
              value={query}
              onChange={(e) =>
                setQuery(e.target.value)
              }
              placeholder="Search ID, passenger, phone, journey, booked by..."
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value
              )
            }
          >
            <option value="all">
              All statuses
            </option>

            <option value="live">
              Live
            </option>

            <option value="booked">
              Booked
            </option>

            <option value="completed">
              Completed
            </option>

            <option value="no_fare">
              No Fare
            </option>

            <option value="cancelled">
              Cancelled
            </option>
          </select>

          <label className="date-filter-field">
            <span>From</span>

            <input
              type="date"
              value={fromDate}
              onChange={(e) =>
                setFromDate(
                  e.target.value
                )
              }
            />
          </label>

          <label className="date-filter-field">
            <span>To</span>

            <input
              type="date"
              value={toDate}
              onChange={(e) =>
                setToDate(
                  e.target.value
                )
              }
            />
          </label>
        </div>

        {filteredBookings.length === 0 ? (
          <div className="empty-bookings">
            <CalendarDays size={30}/>

            <strong>No bookings found</strong>

            <span>
              {allScope
                ? 'UHP account bookings will appear here.'
                : budgetScope
                  ? 'Bookings charged to your authorised budgets will appear here.'
                  : 'New UHP transport requests will appear here.'}
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="bookings-table booking-list-compact">
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Booking</th>
                  <th>Passenger</th>
                  <th>Journey</th>
                  <th>Budget</th>
                  <th>Reason</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {filteredBookings.map(
                  (booking) => {
                    return (
                      <React.Fragment
                        key={booking.id}
                      >
                        <tr
                          className="booking-row-clickable"
                          role="button"
                          tabIndex="0"
                          onClick={() =>
                            setSelectedBooking(booking)
                          }
                          onKeyDown={(event) => {
                            if (
                              event.key === 'Enter' ||
                              event.key === ' '
                            ) {
                              event.preventDefault();
                              setSelectedBooking(booking);
                            }
                          }}
                        >
                          <td>
                            <strong>
                              {formatPickup(
                                booking.requestedPickupAt
                              )}
                            </strong>

                            <small>
                              Booked{' '}
                              {formatBookingDateTime(
                                bookingDisplayBookedAt(
                                  booking
                                )
                              )}
                            </small>
                          </td>

                          <td>
                            <strong>
                              {autocabBookingPrimary(booking)}
                            </strong>

                            {bookingHasVisiblePortalReference(
                              booking
                            ) && (
                              <small>
                                {portalBookingReference(
                                  booking
                                )}
                              </small>
                            )}

                            {broaderScope && (
                              <small>
                                Booked by{' '}
                                {bookingDisplayBooker(booking)}
                              </small>
                            )}
                          </td>

                          <td>
                            <strong>
                              {booking.passengerName}
                            </strong>

                            <small>
                              {booking.passengerMobile}
                            </small>
                          </td>

                          <td className="journey-cell">
                            <strong>
                              {booking.pickupAddress}
                            </strong>

                            <small>
                              to {booking.destinationAddress}
                            </small>
                          </td>

                          <td>
                            <strong>
                              {booking.budgetNumber}
                            </strong>

                            <small>
                              {booking.budgetName}
                            </small>
                          </td>

                          <td>
                            <strong>
                              {booking.reasonCode}
                            </strong>

                            <small>
                              {booking.reasonDescription}
                            </small>
                          </td>

                          <td>
                            <span
                              className={
                                `badge ${booking.operationalStatus}`
                              }
                            >
                              {friendlyBookingStatus(
                                booking.operationalStatus
                              )}
                            </span>

                            {(
                              booking.hasBeenAmended ||
                              booking.events?.some(
                                (event) =>
                                  event.eventType ===
                                    'booking_amended'
                              )
                            ) && (
                              <span className="amended-chip">
                                Amended
                              </span>
                            )}

                            {bookingIsStale(
                              booking
                            ) && (
                              <span className="stale-chip">
                                Stale
                              </span>
                            )}

                            {bookingIsOverdue(
                              booking
                            ) && (
                              <span className="overdue-chip">
                                Overdue
                              </span>
                            )}
                          </td>

                        </tr>

                      </React.Fragment>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          context="uhp"
          onClose={() =>
            setSelectedBooking(null)
          }
          actions={
            selectedBookingManageable
              ? (
                <>
                  {[
                    'draft',
                    'booked',
                    'confirmed'
                  ].includes(
                    selectedBooking.operationalStatus
                  ) && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        const id =
                          selectedBooking.id;

                        setSelectedBooking(null);
                        openAmend(id);
                      }}
                    >
                      Amend Booking
                    </button>
                  )}

                  {CANCELLABLE_OPERATIONAL_STATUSES.has(
                    selectedBooking.operationalStatus
                  ) && (
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => {
                        const booking =
                          selectedBooking;

                        setSelectedBooking(null);
                        openCancel(booking);
                      }}
                    >
                      Cancel Booking
                    </button>
                  )}
                </>
              )
              : null
          }
        >
          {budgetScope &&
            selectedBooking.operationalStatus ===
              'completed' &&
            selectedBooking.financialStatus ===
              'pending_review' && (
              <div className="financial-review-actions">
                <div className="financial-review-copy">
                  <strong>
                    Financial review required
                  </strong>

                  <span>
                    Confirm this completed journey is
                    correct before it proceeds to
                    invoicing, or dispute it for review.
                  </span>
                </div>

                <div className="financial-review-buttons">
                  <button
                    type="button"
                    className="secondary"
                    disabled={
                      financialActionId ===
                      selectedBooking.id
                    }
                    onClick={() => {
                      setSelectedBooking(null);
                      openDisputeFinancialBooking(
                        selectedBooking
                      );
                    }}
                  >
                    Dispute
                  </button>

                  <button
                    type="button"
                    className="financial-approve-button"
                    disabled={
                      financialActionId ===
                      selectedBooking.id
                    }
                    onClick={() =>
                      approveFinancialBooking(
                        selectedBooking
                      )
                    }
                  >
                    {financialActionId ===
                    selectedBooking.id
                      ? 'Processing...'
                      : 'Approve for Invoice'}
                  </button>
                </div>
              </div>
            )}

          {selectedBooking.operationalStatus ===
            'cancelled' && (
            <div className="managed-booking-note">
              This booking has been cancelled and can
              no longer be amended.
            </div>
          )}
        </BookingDetailModal>
      )}

      {disputeBooking && (
        <div className="modal-backdrop">
          <div className="modal-card modal-card-small">
            <div className="modal-header">
              <div>
                <h2>Dispute Booking</h2>

                <p>
                  {autocabBookingPrimary(disputeBooking)}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={
                  closeDisputeFinancialBooking
                }
                disabled={
                  financialActionId ===
                  disputeBooking.id
                }
              >
                ×
              </button>
            </div>

            <form
              onSubmit={
                submitFinancialDispute
              }
            >
              <div className="cancel-warning">
                This booking will be held from invoicing until the dispute has been reviewed.
              </div>

              <label>
                Dispute reason

                <textarea
                  rows="5"
                  value={disputeReason}
                  onChange={(event) =>
                    setDisputeReason(
                      event.target.value
                    )
                  }
                  placeholder="Explain what needs to be reviewed..."
                  required
                />
              </label>

              {financialActionError && (
                <div className="notice error">
                  {financialActionError}
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={
                    closeDisputeFinancialBooking
                  }
                  disabled={
                    financialActionId ===
                    disputeBooking.id
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="danger-button"
                  disabled={
                    financialActionId ===
                      disputeBooking.id ||
                    !disputeReason.trim()
                  }
                >
                  {financialActionId ===
                  disputeBooking.id
                    ? 'Submitting...'
                    : 'Submit Dispute'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingBooking &&
        editForm &&
        !editReview && (
        <div className="modal-backdrop">
          <div className="modal-card booking-edit-modal">
            <div className="modal-header">
              <div>
                <h2>Amend Booking</h2>

                <p>
                  {autocabBookingPrimary(editingBooking)}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeAmend}
                disabled={savingEdit}
              >
                ×
              </button>
            </div>

            <form onSubmit={reviewAmendment}>
              <div className="form-grid two">
                <label>
                  Pickup Date
                  <input
                    type="date"
                    required
                    value={editForm.pickupDate}
                    onChange={(e) =>
                      updateEditForm(
                        'pickupDate',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Pickup Time
                  <input
                    type="time"
                    required
                    value={editForm.pickupTime}
                    onChange={(e) =>
                      updateEditForm(
                        'pickupTime',
                        e.target.value
                      )
                    }
                  />
                </label>
              </div>

              <div className="form-grid two">
                <label>
                  Pickup

                  <BookingAddressAutocomplete
                    savedLocations={
                      editSavedLocations
                    }
                    required
                    searchEnabled={
                      editForm.pickupLatitude === null ||
                      editForm.pickupLongitude === null
                    }
                    placeholder="Start typing pickup address"
                    value={
                      editForm.pickupAddress
                    }
                    onChange={(value) =>
                      setEditForm(
                        (current) => ({
                          ...current,
                          pickupAddress:
                            value,
                          pickupPostcode:
                            current.pickupLatitude !== null &&
                            current.pickupLongitude !== null
                              ? ''
                              : current.pickupPostcode,
                          pickupLatitude:
                            null,
                          pickupLongitude:
                            null,
                          pickupSavedLocationId:
                            null,
                          pickupLocationName:
                            null,
                          pickupPickupInstructions:
                            null
                        })
                      )
                    }
                    onSelect={(result) =>
                      setEditForm(
                        (current) => ({
                          ...current,
                          pickupAddress:
                            result.address,
                          pickupPostcode:
                            result.postcode ||
                            current.pickupPostcode,
                          pickupLatitude:
                            result.latitude,
                          pickupLongitude:
                            result.longitude,
                          pickupSavedLocationId:
                            result.savedLocationId ||
                            null,
                          pickupLocationName:
                            result.locationName ||
                            null,
                          pickupPickupInstructions:
                            result.pickupInstructions ||
                            null
                        })
                      )
                    }
                  />
                </label>

                <label>
                  Pickup Postcode
                  <input
                    value={editForm.pickupPostcode}
                    onChange={(e) =>
                      setEditForm(
                        (current) => ({
                          ...current,
                          pickupPostcode:
                            e.target.value.toUpperCase(),
                          pickupLatitude:
                            null,
                          pickupLongitude:
                            null,
                          pickupSavedLocationId:
                            null,
                          pickupLocationName:
                            null,
                          pickupPickupInstructions:
                            null
                        })
                      )
                    }
                  />
                </label>
              </div>

              <div className="edit-vias">
                {editVias.map((via, index) => (
                  <div
                    className="edit-via-row"
                    key={index}
                  >
                    <label>
                      Via {index + 1}

                      <BookingAddressAutocomplete
                        savedLocations={
                          editSavedLocations
                        }
                        searchEnabled={
                          via.latitude === null ||
                          via.longitude === null
                        }
                        placeholder="Start typing via address"
                        value={
                          via.address
                        }
                        onChange={(value) =>
                          setEditVias(
                            (current) =>
                              current.map(
                                (
                                  currentVia,
                                  viaIndex
                                ) =>
                                  viaIndex === index
                                    ? {
                                        ...currentVia,
                                        address:
                                          value,
                                        postcode:
                                          currentVia.latitude !== null &&
                                          currentVia.longitude !== null
                                            ? ''
                                            : currentVia.postcode,
                                        latitude:
                                          null,
                                        longitude:
                                          null,
                                        savedLocationId:
                                          null,
                                        locationName:
                                          null,
                                        pickupInstructions:
                                          null
                                      }
                                    : currentVia
                              )
                          )
                        }
                        onSelect={(result) =>
                          setEditVias(
                            (current) =>
                              current.map(
                                (
                                  currentVia,
                                  viaIndex
                                ) =>
                                  viaIndex === index
                                    ? {
                                        ...currentVia,
                                        address:
                                          result.address,
                                        postcode:
                                          result.postcode ||
                                          currentVia.postcode,
                                        latitude:
                                          result.latitude,
                                        longitude:
                                          result.longitude,
                                        savedLocationId:
                                          result.savedLocationId ||
                                          null,
                                        locationName:
                                          result.locationName ||
                                          null,
                                        pickupInstructions:
                                          result.pickupInstructions ||
                                          null
                                      }
                                    : currentVia
                              )
                          )
                        }
                      />
                    </label>

                    <label>
                      Postcode
                      <input
                        value={via.postcode}
                        onChange={(e) =>
                          setEditVias(
                            (current) =>
                              current.map(
                                (
                                  currentVia,
                                  viaIndex
                                ) =>
                                  viaIndex === index
                                    ? {
                                        ...currentVia,
                                        postcode:
                                          e.target.value.toUpperCase(),
                                        latitude:
                                          null,
                                        longitude:
                                          null,
                                        savedLocationId:
                                          null,
                                        locationName:
                                          null,
                                        pickupInstructions:
                                          null
                                      }
                                    : currentVia
                              )
                          )
                        }
                      />
                    </label>

                    <button
                      type="button"
                      className="remove-stop"
                      onClick={() =>
                        removeEditVia(index)
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  className="add-via edit-add-via"
                  onClick={addEditVia}
                >
                  <Plus size={16}/>
                  Add Via
                </button>
              </div>

              <div className="form-grid two">
                <label>
                  Destination

                  <BookingAddressAutocomplete
                    savedLocations={
                      editSavedLocations
                    }
                    required
                    searchEnabled={
                      editForm.destinationLatitude === null ||
                      editForm.destinationLongitude === null
                    }
                    placeholder="Start typing destination address"
                    value={
                      editForm.destinationAddress
                    }
                    onChange={(value) =>
                      setEditForm(
                        (current) => ({
                          ...current,
                          destinationAddress:
                            value,
                          destinationPostcode:
                            current.destinationLatitude !== null &&
                            current.destinationLongitude !== null
                              ? ''
                              : current.destinationPostcode,
                          destinationLatitude:
                            null,
                          destinationLongitude:
                            null,
                          destinationSavedLocationId:
                            null,
                          destinationLocationName:
                            null,
                          destinationPickupInstructions:
                            null
                        })
                      )
                    }
                    onSelect={(result) =>
                      setEditForm(
                        (current) => ({
                          ...current,
                          destinationAddress:
                            result.address,
                          destinationPostcode:
                            result.postcode ||
                            current.destinationPostcode,
                          destinationLatitude:
                            result.latitude,
                          destinationLongitude:
                            result.longitude,
                          destinationSavedLocationId:
                            result.savedLocationId ||
                            null,
                          destinationLocationName:
                            result.locationName ||
                            null,
                          destinationPickupInstructions:
                            result.pickupInstructions ||
                            null
                        })
                      )
                    }
                  />
                </label>

                <label>
                  Destination Postcode
                  <input
                    value={
                      editForm.destinationPostcode
                    }
                    onChange={(e) =>
                      setEditForm(
                        (current) => ({
                          ...current,
                          destinationPostcode:
                            e.target.value.toUpperCase(),
                          destinationLatitude:
                            null,
                          destinationLongitude:
                            null,
                          destinationSavedLocationId:
                            null,
                          destinationLocationName:
                            null,
                          destinationPickupInstructions:
                            null
                        })
                      )
                    }
                  />
                </label>
              </div>

              <div className="form-grid two">
                <label>
                  Passenger Name
                  <input
                    required
                    value={editForm.passengerName}
                    onChange={(e) =>
                      updateEditForm(
                        'passengerName',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Contact Number
                  <input
                    type="tel"
                    required
                    value={editForm.passengerMobile}
                    onChange={(e) =>
                      updateEditForm(
                        'passengerMobile',
                        e.target.value
                      )
                    }
                  />
                </label>
              </div>

              <div className="form-grid two">
                <label>
                  Passenger Count
                  <input
                    type="number"
                    min="1"
                    required
                    value={editForm.passengerCount}
                    onChange={(e) =>
                      updateEditForm(
                        'passengerCount',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Reason Code
                  <select
                    required
                    value={editForm.reasonCodeId}
                    onChange={(e) =>
                      updateEditForm(
                        'reasonCodeId',
                        e.target.value
                      )
                    }
                  >
                    <option value="">
                      Select reason...
                    </option>

                    {editOptions.reasonCodes.map(
                      (reason) => (
                        <option
                          key={reason.id}
                          value={reason.id}
                        >
                          {reason.code} — {reason.description}
                        </option>
                      )
                    )}
                  </select>
                </label>
              </div>

              <label>
                Budget
                <select
                  required
                  value={editForm.budgetId}
                  onChange={(e) =>
                    updateEditForm(
                      'budgetId',
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    Select budget...
                  </option>

                  {editOptions.budgets.map(
                    (budget) => (
                      <option
                        key={budget.id}
                        value={budget.id}
                      >
                        {budget.budgetNumber} — {budget.name}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Driver Notes
                <textarea
                  rows="3"
                  value={editForm.driverNotes}
                  onChange={(e) =>
                    updateEditForm(
                      'driverNotes',
                      e.target.value
                    )
                  }
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeAmend}
                  disabled={savingEdit}
                >
                  Keep Existing
                </button>

                <button
                  type="submit"
                  className="primary"
                  disabled={savingEdit}
                >
                  Review Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingBooking &&
        editForm &&
        editReview && (
        <div className="modal-backdrop">
          <div className="modal-card booking-edit-modal">
            <div className="modal-header">
              <div>
                <h2>Review Changes</h2>

                <p>
                  {autocabBookingPrimary(
                    editingBooking
                  )}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() =>
                  setEditReview(null)
                }
                disabled={savingEdit}
              >
                ×
              </button>
            </div>

            {editReview.isLive && (
              <div className="managed-booking-note">
                This is a live booking. Confirming these
                changes will update the booking in
                Autocab dispatch.
              </div>
            )}

            <div className="amendment-review-list">
              {editReview.changes.map(
                (change) => (
                  <div
                    className="amendment-review-item"
                    key={change.label}
                  >
                    <div className="amendment-review-label">
                      {change.label}
                    </div>

                    <div className="amendment-review-comparison">
                      <div className="amendment-review-value">
                        <small>
                          Existing
                        </small>

                        <span>
                          {change.before}
                        </span>
                      </div>

                      <div
                        className="amendment-review-arrow"
                        aria-hidden="true"
                      >
                        →
                      </div>

                      <div className="amendment-review-value amendment-review-new">
                        <small>
                          New
                        </small>

                        <span>
                          {change.after}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>

            {error && (
              <div
                className={
                  editFailureMode ===
                  'manual_review'
                    ? 'amendment-review-warning'
                    : 'amendment-review-error'
                }
              >
                <strong>
                  {editFailureMode ===
                  'manual_review'
                    ? 'Booking requires review'
                    : 'Amendment not applied'}
                </strong>

                <span>
                  {error}
                </span>

                {editFailureMode ===
                  'manual_review' && (
                  <span>
                    Do not retry this amendment until
                    the booking has been checked in
                    Autocab.
                  </span>
                )}
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (
                    editFailureMode ===
                    'manual_review'
                  ) {
                    closeAmend();
                    return;
                  }

                  setError('');
                  setEditFailureMode(null);
                  setEditReview(null);
                }}
                disabled={savingEdit}
              >
                {editFailureMode ===
                'manual_review'
                  ? 'Close'
                  : 'Back to Edit'}
              </button>

              <button
                type="button"
                className="primary"
                onClick={submitAmendment}
                disabled={
                  savingEdit ||
                  editFailureMode ===
                    'manual_review'
                }
              >
                {savingEdit
                  ? 'Updating Booking...'
                  : editFailureMode ===
                      'manual_review'
                    ? 'Review Required'
                    : editReview.isLive
                      ? 'Confirm & Update Booking'
                      : 'Confirm Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelBooking && (
        <div className="modal-backdrop">
          <div className="modal-card modal-card-small">
            <div className="modal-header">
              <div>
                <h2>Cancel Booking</h2>

                <p>
                  {autocabBookingPrimary(cancelBooking)}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeCancel}
                disabled={cancelling}
              >
                ×
              </button>
            </div>

            <form onSubmit={confirmCancel}>
              <div className="cancel-warning">
                {cancelBooking.operationalStatus ===
                'draft'
                  ? (
                    <>
                      This will cancel the UHP transport
                      request. It has not yet been sent to
                      dispatch.
                    </>
                  )
                  : (
                    <>
                      This will send a cancellation request
                      to Autocab. The booking will remain in
                      the audit history.
                    </>
                  )}
              </div>

              <label>
                Cancellation Reason
                <textarea
                  required
                  rows="4"
                  placeholder="Enter the reason for cancellation..."
                  value={cancelReason}
                  onChange={(e) =>
                    setCancelReason(e.target.value)
                  }
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeCancel}
                  disabled={cancelling}
                >
                  Keep Booking
                </button>

                <button
                  type="submit"
                  className="danger-button"
                  disabled={
                    cancelling ||
                    !cancelReason.trim()
                  }
                >
                  {cancelling
                    ? 'Cancelling...'
                    : 'Cancel Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function createInitialBookingForm() {
  const now =
    new Date();

  const pad = (value) =>
    String(value).padStart(2, '0');

  return {
    pickupDate:
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,

    pickupTime:
      `${pad(now.getHours())}:${pad(now.getMinutes())}`,

    pickupAddress: '',
    pickupPostcode: '',
    pickupLatitude: null,
    pickupLongitude: null,
    pickupSavedLocationId: null,
    pickupLocationName: null,
    pickupPickupInstructions: null,

    destinationAddress: '',
    destinationPostcode: '',
    destinationLatitude: null,
    destinationLongitude: null,
    destinationSavedLocationId: null,
    destinationLocationName: null,
    destinationPickupInstructions: null,

    passengerName: '',
    passengerMobile: '',
    passengerCount: 1,
    budgetId: '',
    reasonCodeId: '',
    driverNotes: ''
  };
}


function sharedLocationSearchResult(
  location
) {
  return {
    id:
      `uhp-${location.id}`,
    source: 'uhp',
    savedLocationId:
      location.id,
    label:
      location.name,
    locationName:
      location.name,
    parentSite:
      location.parentSite || null,
    address:
      location.address,
    postcode:
      location.postcode || '',
    latitude:
      location.latitude,
    longitude:
      location.longitude,
    pickupInstructions:
      location.pickupInstructions || null
  };
}


function BookingAddressAutocomplete({
  value,
  placeholder,
  required = false,
  searchEnabled = true,
  savedLocations = [],
  onChange,
  onSelect
}) {
  const [
    results,
    setResults
  ] = useState([]);

  const [
    searchState,
    setSearchState
  ] = useState('idle');

  const [
    open,
    setOpen
  ] = useState(false);

  const suppressNextSearch =
    useRef(false);

  useEffect(() => {
    const query =
      String(value || '')
        .trim();

    if (!searchEnabled) {
      suppressNextSearch.current =
        false;

      setResults([]);
      setSearchState('idle');
      setOpen(false);

      return;
    }

    if (suppressNextSearch.current) {
      suppressNextSearch.current =
        false;

      return;
    }

    if (query.length < 3) {
      setResults([]);
      setSearchState('idle');
      setOpen(false);

      return;
    }

    const normalisedQuery =
      query.toLowerCase();

    const sharedMatches =
      (
        Array.isArray(savedLocations)
          ? savedLocations
          : []
      )
        .filter((location) => {
          const searchable =
            [
              location.name,
              location.parentSite,
              location.address,
              location.postcode,
              location.category
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();

          return searchable.includes(
            normalisedQuery
          );
        })
        .slice(0, 8)
        .map(
          sharedLocationSearchResult
        );

    /*
      Shared UHP locations are available
      immediately and always rank above
      external address results.
    */
    setResults(sharedMatches);

    setSearchState(
      sharedMatches.length
        ? 'ready'
        : 'loading'
    );

    setOpen(
      sharedMatches.length > 0
    );

    const controller =
      new AbortController();

    const timer =
      window.setTimeout(
        async () => {
          if (!sharedMatches.length) {
            setSearchState(
              'loading'
            );
          }

          try {
            const response =
              await apiFetch(
                `${API_BASE}/api/geocoding/search?` +
                new URLSearchParams({
                  q: query
                }).toString(),
                {
                  signal:
                    controller.signal
                }
              );

            const data =
              await response.json();

            if (!response.ok) {
              throw new Error(
                data.error ||
                'Unable to search addresses'
              );
            }

            const sharedAddresses =
              new Set(
                sharedMatches
                  .map(
                    (result) =>
                      String(
                        result.address ||
                        ''
                      )
                        .trim()
                        .toLowerCase()
                  )
                  .filter(Boolean)
              );

            const externalResults =
              (
                Array.isArray(
                  data.results
                )
                  ? data.results
                  : []
              )
                .map(
                  (result) => ({
                    ...result,
                    source:
                      'maptiler',
                    savedLocationId:
                      null,
                    locationName:
                      null,
                    pickupInstructions:
                      null,
                    parentSite:
                      null
                  })
                )
                .filter(
                  (result) =>
                    !sharedAddresses.has(
                      String(
                        result.address ||
                        ''
                      )
                        .trim()
                        .toLowerCase()
                    )
                );

            const nextResults = [
              ...sharedMatches,
              ...externalResults
            ];

            setResults(
              nextResults
            );

            setSearchState(
              'ready'
            );

            setOpen(
              nextResults.length > 0
            );
          } catch (error) {
            if (
              error?.name ===
              'AbortError'
            ) {
              return;
            }

            /*
              External lookup failure must
              not hide valid UHP locations.
            */
            if (sharedMatches.length) {
              setResults(
                sharedMatches
              );

              setSearchState(
                'ready'
              );

              setOpen(true);

              return;
            }

            setResults([]);
            setSearchState('error');
            setOpen(false);
          }
        },
        300
      );

    return () => {
      window.clearTimeout(
        timer
      );

      controller.abort();
    };
  }, [
    value,
    searchEnabled,
    savedLocations
  ]);

  function chooseResult(
    result
  ) {
    suppressNextSearch.current =
      true;

    setResults([]);
    setOpen(false);
    setSearchState('idle');

    onSelect(
      result
    );
  }

  return (
    <div className="booking-address-search">
      <input
        required={required}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          const nextValue =
            event.target.value;

          onChange(
            nextValue
          );

          if (
            nextValue
              .trim()
              .length >= 3
          ) {
            setOpen(true);
          }
        }}
        onFocus={() => {
          if (results.length) {
            setOpen(true);
          }
        }}
        onBlur={() => {
          window.setTimeout(
            () =>
              setOpen(false),
            140
          );
        }}
      />

      {searchState === 'loading' && (
        <span className="booking-address-search-state">
          Searching…
        </span>
      )}

      {open && results.length > 0 && (
        <div
          className="booking-address-results"
          role="listbox"
        >
          {results.map(
            (result) => (
              <button
                key={result.id}
                type="button"
                className={
                  `booking-address-result${
                    result.source === 'uhp'
                      ? ' uhp'
                      : ''
                  }`
                }
                onMouseDown={(event) =>
                  event.preventDefault()
                }
                onClick={() =>
                  chooseResult(
                    result
                  )
                }
              >
                <div className="booking-address-result-heading">
                  <strong>
                    {result.label}
                  </strong>

                  {result.source === 'uhp' && (
                    <span className="booking-address-result-badge">
                      UHP location
                    </span>
                  )}
                </div>

                {result.source === 'uhp' && (
                  <span className="booking-address-result-context">
                    {
                      [
                        result.parentSite,
                        result.address
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    }
                  </span>
                )}

                {result.postcode && (
                  <span className="booking-address-result-postcode">
                    {result.postcode}
                  </span>
                )}
              </button>
            )
          )}
        </div>
      )}

      {searchState === 'error' && (
        <span className="booking-address-search-state error">
          Address search temporarily unavailable
        </span>
      )}
    </div>
  );
}


function SavedLocationChips({
  locations,
  onSelect
}) {
  if (
    !Array.isArray(locations) ||
    locations.length === 0
  ) {
    return null;
  }

  return (
    <div className="booking-saved-locations">
      <span className="booking-saved-locations-label">
        Shared UHP locations
      </span>

      <div className="booking-saved-location-list">
        {locations.map(
          (location) => (
            <button
              key={location.id}
              type="button"
              className="booking-saved-location"
              onClick={() =>
                onSelect(location)
              }
              title={location.address}
            >
              {location.name}
            </button>
          )
        )}
      </div>
    </div>
  );
}


function BookingPlanningMap({
  pickup,
  vias,
  destination
}) {
  const [
    clearVehicles,
    setClearVehicles
  ] = useState([]);

  const [
    fleetState,
    setFleetState
  ] = useState('loading');

  const [
    fleetUpdatedAt,
    setFleetUpdatedAt
  ] = useState(null);

  const [
    roadRouteCoordinates,
    setRoadRouteCoordinates
  ] = useState([]);

  const [
    roadRouteState,
    setRoadRouteState
  ] = useState('idle');

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;

    async function loadClearVehicles() {
      try {
        const response =
          await apiFetch(
            `${API_BASE}/api/booking-map/clear-vehicles`
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
            'Unable to load clear vehicles'
          );
        }

        if (cancelled) {
          return;
        }

        setClearVehicles(
          Array.isArray(
            data.vehicles
          )
            ? data.vehicles
            : []
        );

        setFleetUpdatedAt(
          data.generatedAt ||
          new Date().toISOString()
        );

        setFleetState(
          'ready'
        );
      } catch {
        if (cancelled) {
          return;
        }

        setFleetState(
          'error'
        );
      }
    }

    loadClearVehicles();

    intervalId =
      window.setInterval(
        loadClearVehicles,
        10000
      );

    return () => {
      cancelled = true;

      if (intervalId) {
        window.clearInterval(
          intervalId
        );
      }
    };
  }, []);

  function normalisePlanningStop(
    stop
  ) {
    if (
      stop?.latitude === null ||
      stop?.latitude === undefined ||
      stop?.longitude === null ||
      stop?.longitude === undefined
    ) {
      return null;
    }

    const latitude =
      Number(
        stop.latitude
      );

    const longitude =
      Number(
        stop.longitude
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
      return null;
    }

    return {
      ...stop,
      latitude,
      longitude
    };
  }

  const selectedPickup =
    normalisePlanningStop({
      stopType: 'pickup',
      label: 'P',
      address:
        pickup?.address,
      latitude:
        pickup?.latitude,
      longitude:
        pickup?.longitude
    });

  const selectedDestination =
    normalisePlanningStop({
      stopType:
        'destination',
      label: 'D',
      address:
        destination?.address,
      latitude:
        destination?.latitude,
      longitude:
        destination?.longitude
    });

  const journeyViaSelections =
    (
      Array.isArray(vias)
        ? vias
        : []
    )
      .map(
        (via, index) => ({
          via,
          index
        })
      )
      .filter(
        ({ via }) =>
          String(
            via?.address || ''
          )
            .trim()
            .length > 0
      )
      .map(
        ({ via, index }) =>
          normalisePlanningStop({
            stopType: 'via',
            label:
              String(
                index + 1
              ),
            address:
              via.address,
            latitude:
              via.latitude,
            longitude:
              via.longitude
          })
      );

  const allJourneyViasSelected =
    journeyViaSelections.every(
      Boolean
    );

  const selectedVias =
    journeyViaSelections
      .filter(Boolean);

  function distanceBetweenKm(
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
      toRadians(
        latitude1
      );

    const secondLatitude =
      toRadians(
        latitude2
      );

    const a =
      Math.sin(
        deltaLatitude / 2
      ) ** 2 +
      Math.cos(
        firstLatitude
      ) *
      Math.cos(
        secondLatitude
      ) *
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

  const nearbyClearVehicles =
    selectedPickup
      ? clearVehicles
          .map(
            (vehicle) => ({
              ...vehicle,

              distanceKm:
                distanceBetweenKm(
                  selectedPickup.latitude,
                  selectedPickup.longitude,
                  Number(
                    vehicle.latitude
                  ),
                  Number(
                    vehicle.longitude
                  )
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
          )
      : [];

  const visibleStops =
    [
      selectedPickup,
      ...selectedVias,
      selectedDestination
    ]
      .filter(Boolean);

  const canRoute =
    Boolean(
      selectedPickup &&
      selectedDestination &&
      allJourneyViasSelected
    );

  const routedStops =
    canRoute
      ? [
          selectedPickup,
          ...selectedVias,
          selectedDestination
        ]
      : [];

  const routeCoordinates =
    routedStops.map(
      (stop) => [
        stop.latitude,
        stop.longitude
      ]
    );

  const routeRequestCoordinates =
    canRoute
      ? routedStops
          .map(
            (stop) =>
              `${stop.longitude},${stop.latitude}`
          )
          .join(';')
      : '';

  useEffect(() => {
    if (
      !canRoute ||
      routedStops.length < 2 ||
      !routeRequestCoordinates
    ) {
      setRoadRouteCoordinates(
        []
      );

      setRoadRouteState(
        'idle'
      );

      return;
    }

    const controller =
      new AbortController();

    setRoadRouteCoordinates(
      []
    );

    setRoadRouteState(
      'loading'
    );

    const url =
      `${API_BASE}/api/routing/route?` +
      new URLSearchParams({
        coordinates:
          routeRequestCoordinates
      }).toString();

    apiFetch(
      url,
      {
        signal:
          controller.signal
      }
    )
      .then(
        async (response) => {
          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data.error ||
              'Unable to calculate route'
            );
          }

          return data;
        }
      )
      .then((data) => {
        const coordinates =
          data?.route
            ?.geometry
            ?.coordinates;

        if (
          data?.code !== 'Ok' ||
          !Array.isArray(
            coordinates
          )
        ) {
          throw new Error(
            'Routing service returned no usable route'
          );
        }

        const roadCoordinates =
          coordinates
            .map(
              (coordinate) => [
                Number(
                  coordinate?.[1]
                ),
                Number(
                  coordinate?.[0]
                )
              ]
            )
            .filter(
              ([latitude, longitude]) =>
                Number.isFinite(
                  latitude
                ) &&
                Number.isFinite(
                  longitude
                )
            );

        if (
          roadCoordinates.length < 2
        ) {
          throw new Error(
            'Routing service returned an empty route'
          );
        }

        setRoadRouteCoordinates(
          roadCoordinates
        );

        setRoadRouteState(
          'ready'
        );
      })
      .catch((error) => {
        if (
          error?.name ===
          'AbortError'
        ) {
          return;
        }

        setRoadRouteCoordinates(
          []
        );

        setRoadRouteState(
          'fallback'
        );
      });

    return () => {
      controller.abort();
    };
  }, [
    canRoute,
    routeRequestCoordinates
  ]);

  const displayedRouteCoordinates =
    roadRouteCoordinates.length > 1
      ? roadRouteCoordinates
      : routeCoordinates;

  const pickupFleetCoordinates =
    selectedPickup
      ? [
          [
            selectedPickup.latitude,
            selectedPickup.longitude
          ],

          ...nearbyClearVehicles.map(
            (vehicle) => [
              Number(
                vehicle.latitude
              ),
              Number(
                vehicle.longitude
              )
            ]
          )
        ]
      : [];

  const mapBoundsCoordinates =
    canRoute
      ? displayedRouteCoordinates
      : pickupFleetCoordinates.length
        ? pickupFleetCoordinates
        : visibleStops.map(
            (stop) => [
              stop.latitude,
              stop.longitude
            ]
          );

  const defaultCentre =
    mapBoundsCoordinates[0] ||
    [50.4169, -4.1138];

  const createStopPinIcon = (
    markerClass,
    label
  ) =>
    L.divIcon({
      className:
        'booking-map-div-icon booking-map-pin-wrapper',

      html: `
        <span class="booking-map-pin ${markerClass}">
          <span class="booking-map-pin-label">
            ${label}
          </span>
        </span>
      `,

      iconSize: [32, 44],
      iconAnchor: [16, 44],
      popupAnchor: [0, -39]
    });

  const pickupIcon =
    createStopPinIcon(
      'pickup',
      'P'
    );

  const destinationIcon =
    createStopPinIcon(
      'destination',
      'D'
    );

  const viaIcon = (
    label
  ) =>
    createStopPinIcon(
      'via',
      label
    );

  const clearVehicleIcon =
    (vehicle) => {
      const heading =
        Number.isFinite(
          Number(
            vehicle.headingDegrees
          )
        )
          ? Number(
              vehicle.headingDegrees
            )
          : 0;

      const callsign =
        String(
          vehicle.callsign || '?'
        )
          .replace(
            /[<>&"']/g,
            ''
          );

      return L.divIcon({
        className:
          'booking-map-div-icon booking-clear-vehicle-icon',

        html: `
          <span class="booking-clear-vehicle-marker">
            <span class="booking-clear-vehicle-badge">
              <svg
                class="booking-clear-vehicle-svg"
                viewBox="0 0 32 32"
                aria-hidden="true"
                focusable="false"
                style="transform:rotate(${heading}deg)"
              >
                <rect
                  x="10"
                  y="5"
                  width="12"
                  height="22"
                  rx="4"
                />
                <rect
                  x="12"
                  y="8"
                  width="8"
                  height="5"
                  rx="1.5"
                  class="booking-clear-vehicle-glass"
                />
                <rect
                  x="12"
                  y="15"
                  width="8"
                  height="5"
                  rx="1.5"
                  class="booking-clear-vehicle-glass"
                />
                <rect
                  x="8"
                  y="9"
                  width="3"
                  height="5"
                  rx="1"
                />
                <rect
                  x="21"
                  y="9"
                  width="3"
                  height="5"
                  rx="1"
                />
                <rect
                  x="8"
                  y="18"
                  width="3"
                  height="5"
                  rx="1"
                />
                <rect
                  x="21"
                  y="18"
                  width="3"
                  height="5"
                  rx="1"
                />
                <path
                  d="M13 5 L16 2 L19 5 Z"
                />
              </svg>

              <span
                class="booking-clear-vehicle-status"
                aria-hidden="true"
              ></span>
            </span>

            <span class="booking-clear-vehicle-callsign">
              ${callsign}
            </span>
          </span>
        `,

        iconSize: [54, 48],
        iconAnchor: [20, 20],
        popupAnchor: [0, -17]
      });
    };

  return (
    <div className="booking-planning-map-card">
      <div className="booking-planning-map-heading">
        <div>
          <span className="booking-planning-eyebrow">
            Live Fleet
          </span>

          <h3>
            Journey Map
          </h3>

          <p>
            The five nearest clear vehicles appear after a pickup is selected.
          </p>
        </div>

        <div
          className={`booking-clear-count ${fleetState}`}
        >
          <strong>
            {selectedPickup &&
            fleetState === 'ready'
              ? nearbyClearVehicles.length
              : '—'}
          </strong>

          <span>
            Nearby
          </span>
        </div>
      </div>

      <div className="booking-route-map-shell booking-planning-map-shell">
        <MapContainer
          className="booking-route-map booking-planning-map"
          center={defaultCentre}
          zoom={12}
          scrollWheelZoom={false}
        >
          {MAP_TILE_URL && (
            <TileLayer
              attribution={
                MAP_TILE_ATTRIBUTION
              }
              url={
                MAP_TILE_URL
              }
            />
          )}

          {mapBoundsCoordinates.length > 0 && (
            <BookingMapBounds
              coordinates={
                mapBoundsCoordinates
              }
            />
          )}

          {displayedRouteCoordinates.length > 1 && (
            <Polyline
              positions={
                displayedRouteCoordinates
              }
              pathOptions={{
                weight: 4,
                opacity: 0.78
              }}
            />
          )}

          {visibleStops.map(
            (stop, index) => {
              const icon =
                stop.stopType ===
                  'pickup'
                  ? pickupIcon
                  : stop.stopType ===
                      'destination'
                    ? destinationIcon
                    : viaIcon(
                        stop.label
                      );

              return (
                <Marker
                  key={
                    `planning-${stop.stopType}-${index}`
                  }
                  position={[
                    stop.latitude,
                    stop.longitude
                  ]}
                  icon={icon}
                  zIndexOffset={500}
                >
                  <Popup>
                    <strong>
                      {stop.stopType ===
                      'pickup'
                        ? 'Pickup'
                        : stop.stopType ===
                            'destination'
                          ? 'Destination'
                          : `Via ${stop.label}`}
                    </strong>

                    {stop.address && (
                      <div>
                        {stop.address}
                      </div>
                    )}
                  </Popup>
                </Marker>
              );
            }
          )}

          {nearbyClearVehicles.map(
            (vehicle) => (
              <Marker
                key={
                  `clear-${vehicle.vehicleId}`
                }
                position={[
                  vehicle.latitude,
                  vehicle.longitude
                ]}
                icon={
                  clearVehicleIcon(
                    vehicle
                  )
                }
              >
                <Popup>
                  <strong>
                    Clear car {vehicle.callsign || '—'}
                  </strong>

                  <div>
                    Available
                    {Number.isFinite(
                      vehicle.distanceKm
                    )
                      ? ` · ${vehicle.distanceKm.toFixed(1)} km from pickup`
                      : ''}
                  </div>
                </Popup>
              </Marker>
            )
          )}
        </MapContainer>

        <div className="booking-planning-map-footer">
          <span className="booking-clear-legend">
            <i
              className="booking-map-live-car-symbol"
              aria-hidden="true"
            />

            Nearest clear vehicles
          </span>

          <span>
            {roadRouteState === 'loading'
              ? 'Calculating road route…'
              : roadRouteState === 'ready'
                ? 'Road route ready'
                : roadRouteState === 'fallback'
                  ? 'Showing stop-to-stop route'
                  : fleetState === 'loading'
                    ? 'Loading live fleet…'
                    : fleetState === 'error'
                      ? 'Live fleet temporarily unavailable'
                      : fleetUpdatedAt
                        ? 'Live fleet connected'
                        : ''}
          </span>
        </div>
      </div>

      <div className="booking-planning-route-hint">
        {canRoute
          ? 'Route updates automatically when journey locations change.'
          : 'Select every entered journey location to show the road route.'}
      </div>
    </div>
  );
}


function BookTransportPage({ currentUser }) {
  const bookingUserId = currentUser.id;

  const [
    form,
    setForm
  ] = useState(
    () =>
      createInitialBookingForm()
  );
  const [vias, setVias] = useState([]);

  const [bookingUser, setBookingUser] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [reasonCodes, setReasonCodes] = useState([]);
  const [savedLocations, setSavedLocations] = useState([]);
  const [bookingFavourites, setBookingFavourites] = useState([]);
  const [recentBookings, setRecentBookings] = useState([]);
  const [quickBookLoading, setQuickBookLoading] = useState(true);
  const [savingFavourite, setSavingFavourite] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [pendingBookingId, setPendingBookingId] = useState(null);
  const [
    pendingBookingReference,
    setPendingBookingReference
  ] = useState('');

  const [journeyEta, setJourneyEta] =
    useState({
      status: 'idle',
      durationSeconds: null,
      distance: null
    });

  const [pickupEta, setPickupEta] =
    useState({
      status: 'idle',
      durationSeconds: null,
      nearbyCount: 0
    });

  useEffect(() => {
    loadBookingOptions();
  }, []);

  async function loadBookingOptions() {
    setLoading(true);
    setError('');

    try {
      const [
        response,
        favouritesResponse,
        recentResponse
      ] = await Promise.all([
        apiFetch(
          `${API_BASE}/api/booking-options?userId=${bookingUserId}`
        ),
        apiFetch(
          `${API_BASE}/api/booking-favourites`
        ),
        apiFetch(
          `${API_BASE}/api/my-bookings`
        )
      ]);

      const [
        data,
        favouritesData,
        recentData
      ] = await Promise.all([
        response.json(),
        favouritesResponse.json(),
        recentResponse.json()
      ]);

      if (!response.ok) {
        throw new Error(
          data.error || 'Unable to load booking options'
        );
      }

      if (!favouritesResponse.ok) {
        throw new Error(
          favouritesData.error ||
            'Unable to load favourite bookings'
        );
      }

      if (!recentResponse.ok) {
        throw new Error(
          recentData.error ||
            'Unable to load recent bookings'
        );
      }

      setBookingUser(data.user ?? null);
      setBudgets(data.budgets ?? []);
      setReasonCodes(data.reasonCodes ?? []);
      setSavedLocations(
        Array.isArray(data.savedLocations)
          ? data.savedLocations
          : []
      );

      setBookingFavourites(
        Array.isArray(favouritesData.favourites)
          ? favouritesData.favourites
          : []
      );

      setRecentBookings(
        Array.isArray(recentData.bookings)
          ? recentData.bookings.slice(0, 6)
          : []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load booking options'
      );
    } finally {
      setLoading(false);
      setQuickBookLoading(false);
    }
  }

  const selectedBudget = useMemo(
    () =>
      budgets.find(
        (budget) =>
          String(budget.id) === String(form.budgetId)
      ) ?? null,
    [budgets, form.budgetId]
  );

  useEffect(
    () => {
      const hasCoordinate =
        (value) =>
          value !== null &&
          value !== undefined &&
          value !== '' &&
          Number.isFinite(
            Number(value)
          );

      const pickupReady =
        hasCoordinate(
          form.pickupLatitude
        ) &&
        hasCoordinate(
          form.pickupLongitude
        );

      if (!pickupReady) {
        setPickupEta({
          status: 'idle',
          durationSeconds: null,
          nearbyCount: 0
        });

        return undefined;
      }

      let cancelled = false;
      let intervalId = null;
      let inFlight = false;

      const controller =
        new AbortController();

      async function loadPickupEta() {
        if (
          cancelled ||
          inFlight
        ) {
          return;
        }

        inFlight = true;

        setPickupEta(
          (current) =>
            current.status ===
              'success'
              ? current
              : {
                  ...current,
                  status: 'loading'
                }
        );

        try {
          const response =
            await apiFetch(
              `${API_BASE}/api/pickup-eta`,
              {
                method: 'POST',

                headers: {
                  'Content-Type':
                    'application/json'
                },

                body:
                  JSON.stringify({
                    latitude:
                      Number(
                        form.pickupLatitude
                      ),

                    longitude:
                      Number(
                        form.pickupLongitude
                      )
                  }),

                signal:
                  controller.signal
              }
            );

          const result =
            await response.json();

          if (!response.ok) {
            throw new Error(
              result.error ||
              'Pickup estimate unavailable'
            );
          }

          if (cancelled) {
            return;
          }

          const durationSeconds =
            Number(
              result?.pickupEta
                ?.durationSeconds
            );

          const nearbyCount =
            Number(
              result?.pickupEta
                ?.nearbyCount
            );

          if (
            result?.pickupEta?.status ===
              'success' &&
            Number.isFinite(
              durationSeconds
            ) &&
            durationSeconds >= 0
          ) {
            setPickupEta({
              status: 'success',
              durationSeconds,
              nearbyCount:
                Number.isFinite(
                  nearbyCount
                )
                  ? nearbyCount
                  : 0
            });
          } else {
            setPickupEta({
              status: 'unavailable',
              durationSeconds: null,
              nearbyCount:
                Number.isFinite(
                  nearbyCount
                )
                  ? nearbyCount
                  : 0
            });
          }
        } catch (err) {
          if (
            cancelled ||
            err?.name ===
              'AbortError'
          ) {
            return;
          }

          setPickupEta({
            status: 'error',
            durationSeconds: null,
            nearbyCount: 0
          });
        } finally {
          inFlight = false;
        }
      }

      const timer =
        window.setTimeout(
          () => {
            loadPickupEta();

            intervalId =
              window.setInterval(
                loadPickupEta,
                15000
              );
          },
          350
        );

      return () => {
        cancelled = true;

        window.clearTimeout(
          timer
        );

        if (intervalId) {
          window.clearInterval(
            intervalId
          );
        }

        controller.abort();
      };
    },
    [
      form.pickupLatitude,
      form.pickupLongitude
    ]
  );


  const etaRoute = useMemo(
    () => {
      const hasCoordinate =
        (value) =>
          value !== null &&
          value !== undefined &&
          value !== '' &&
          Number.isFinite(
            Number(value)
          );

      const pickupReady =
        hasCoordinate(
          form.pickupLatitude
        ) &&
        hasCoordinate(
          form.pickupLongitude
        );

      const destinationReady =
        hasCoordinate(
          form.destinationLatitude
        ) &&
        hasCoordinate(
          form.destinationLongitude
        );

      const enteredVias =
        vias.filter(
          (via) =>
            Boolean(
              via.address?.trim()
            )
        );

      const viasReady =
        enteredVias.every(
          (via) =>
            hasCoordinate(
              via.latitude
            ) &&
            hasCoordinate(
              via.longitude
            )
        );

      if (
        !pickupReady ||
        !destinationReady ||
        !viasReady
      ) {
        return {
          ready: false,
          points: []
        };
      }

      return {
        ready: true,

        points: [
          {
            latitude:
              Number(
                form.pickupLatitude
              ),

            longitude:
              Number(
                form.pickupLongitude
              )
          },

          ...enteredVias.map(
            (via) => ({
              latitude:
                Number(
                  via.latitude
                ),

              longitude:
                Number(
                  via.longitude
                )
            })
          ),

          {
            latitude:
              Number(
                form.destinationLatitude
              ),

            longitude:
              Number(
                form.destinationLongitude
              )
          }
        ]
      };
    },
    [
      form.pickupLatitude,
      form.pickupLongitude,
      form.destinationLatitude,
      form.destinationLongitude,
      vias
    ]
  );

  useEffect(
    () => {
      if (!etaRoute.ready) {
        setJourneyEta({
          status: 'idle',
          durationSeconds: null,
          distance: null
        });

        return undefined;
      }

      const controller =
        new AbortController();

      const timer =
        window.setTimeout(
          async () => {
            setJourneyEta(
              (current) => ({
                ...current,
                status: 'loading'
              })
            );

            try {
              const response =
                await apiFetch(
                  `${API_BASE}/api/eta`,
                  {
                    method: 'POST',

                    headers: {
                      'Content-Type':
                        'application/json'
                    },

                    body:
                      JSON.stringify({
                        points:
                          etaRoute.points
                      }),

                    signal:
                      controller.signal
                  }
                );

              const result =
                await response.json();

              if (!response.ok) {
                throw new Error(
                  result.error ||
                    'Journey estimate unavailable'
                );
              }

              const durationSeconds =
                Number(
                  result?.eta
                    ?.durationSeconds
                );

              if (
                !Number.isFinite(
                  durationSeconds
                ) ||
                durationSeconds < 0
              ) {
                throw new Error(
                  'Journey estimate unavailable'
                );
              }

              setJourneyEta({
                status: 'success',
                durationSeconds,
                distance:
                  result?.eta?.distance ??
                  null
              });
            } catch (err) {
              if (
                err?.name ===
                'AbortError'
              ) {
                return;
              }

              setJourneyEta({
                status: 'error',
                durationSeconds: null,
                distance: null
              });
            }
          },
          350
        );

      return () => {
        window.clearTimeout(
          timer
        );

        controller.abort();
      };
    },
    [etaRoute]
  );

  const journeyEtaMinutes =
    journeyEta.status === 'success'
      ? Math.max(
          1,
          Math.round(
            journeyEta.durationSeconds /
              60
          )
        )
      : null;

  const journeyEtaDistance =
    journeyEta.status === 'success' &&
    Number.isFinite(
      Number(
        journeyEta.distance?.amount
      )
    )
      ? `${Number(
          journeyEta.distance.amount
        ).toFixed(1)} ${
          journeyEta.distance?.type ||
          'mi'
        }`
      : '';

  const pickupEtaMinutes =
    pickupEta.status === 'success'
      ? Math.max(
          1,
          Math.round(
            pickupEta.durationSeconds /
              60
          )
        ) + 5
      : null;

  const pickupEtaTone =
    pickupEtaMinutes === null
      ? 'eta-neutral'
      : pickupEtaMinutes < 10
        ? 'eta-green'
        : pickupEtaMinutes <= 20
          ? 'eta-amber'
          : 'eta-red';


  function applyJourneyTemplate({
    pickup,
    vias: templateVias = [],
    destination,
    passengerCount = 1,
    budgetId = '',
    reasonCodeId = '',
    driverNotes = '',
    passengerName = '',
    passengerMobile = ''
  }) {
    if (!pickup || !destination) {
      return;
    }

    setForm(
      (current) => ({
        ...current,

        pickupAddress:
          pickup.address || '',
        pickupPostcode:
          pickup.postcode || '',
        pickupLatitude:
          pickup.latitude ?? null,
        pickupLongitude:
          pickup.longitude ?? null,
        pickupSavedLocationId:
          pickup.savedLocationId ?? null,
        pickupLocationName:
          pickup.locationName ?? null,
        pickupPickupInstructions:
          pickup.pickupInstructions ?? null,

        destinationAddress:
          destination.address || '',
        destinationPostcode:
          destination.postcode || '',
        destinationLatitude:
          destination.latitude ?? null,
        destinationLongitude:
          destination.longitude ?? null,
        destinationSavedLocationId:
          destination.savedLocationId ?? null,
        destinationLocationName:
          destination.locationName ?? null,
        destinationPickupInstructions:
          destination.pickupInstructions ?? null,

        passengerName:
          passengerName || '',
        passengerMobile:
          passengerMobile || '',
        passengerCount:
          String(passengerCount || 1),

        budgetId:
          budgetId
            ? String(budgetId)
            : '',

        reasonCodeId:
          reasonCodeId
            ? String(reasonCodeId)
            : '',

        driverNotes:
          driverNotes || ''
      })
    );

    setVias(
      templateVias.map(
        (via) => ({
          address:
            via.address || '',
          postcode:
            via.postcode || '',
          latitude:
            via.latitude ?? null,
          longitude:
            via.longitude ?? null,
          savedLocationId:
            via.savedLocationId ?? null,
          locationName:
            via.locationName ?? null,
          pickupInstructions:
            via.pickupInstructions ?? null
        })
      )
    );

    setError('');
  }


  function applyFavourite(favourite) {
    const stops =
      Array.isArray(favourite.stops)
        ? favourite.stops
        : [];

    const pickup =
      stops.find(
        (stop) =>
          stop.stopType === 'pickup'
      );

    const destination =
      stops.find(
        (stop) =>
          stop.stopType === 'destination'
      );

    const favouriteVias =
      stops.filter(
        (stop) =>
          stop.stopType === 'via'
      );

    applyJourneyTemplate({
      pickup,
      vias:
        favouriteVias,
      destination,
      passengerCount:
        favourite.passengerCount,
      budgetId:
        favourite.budgetId,
      reasonCodeId:
        favourite.reasonCodeId,
      driverNotes:
        favourite.driverNotes
    });
  }


  function applyRecentBooking(booking) {
    const stops =
      Array.isArray(booking.stops)
        ? booking.stops
        : [];

    const pickup =
      stops.find(
        (stop) =>
          stop.stopType === 'pickup'
      ) || {
        address:
          booking.pickupAddress,
        postcode:
          booking.pickupPostcode
      };

    const destination =
      stops.find(
        (stop) =>
          stop.stopType === 'destination'
      ) || {
        address:
          booking.destinationAddress,
        postcode:
          booking.destinationPostcode
      };

    const bookingVias =
      stops.filter(
        (stop) =>
          stop.stopType === 'via'
      );

    applyJourneyTemplate({
      pickup,
      vias:
        bookingVias,
      destination,
      passengerCount:
        booking.passengerCount,
      budgetId:
        booking.budgetId,
      reasonCodeId:
        booking.reasonCodeId,
      driverNotes:
        booking.driverNotes,
      passengerName:
        booking.passengerName,
      passengerMobile:
        booking.passengerMobile
    });
  }


  async function saveCurrentFavourite() {
    const defaultName =
      [
        form.pickupLocationName ||
          form.pickupAddress,
        form.destinationLocationName ||
          form.destinationAddress
      ]
        .filter(Boolean)
        .join(' → ')
        .slice(0, 80);

    const name =
      window.prompt(
        'Name this favourite journey',
        defaultName
      );

    if (!name) {
      return;
    }

    setSavingFavourite(true);
    setError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/booking-favourites`,
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body:
              JSON.stringify({
                name,

                passengerCount:
                  Number(
                    form.passengerCount || 1
                  ),

                budgetId:
                  form.budgetId || null,

                reasonCodeId:
                  form.reasonCodeId || null,

                driverNotes:
                  form.driverNotes,

                pickup: {
                  address:
                    form.pickupAddress,
                  postcode:
                    form.pickupPostcode,
                  latitude:
                    form.pickupLatitude,
                  longitude:
                    form.pickupLongitude,
                  savedLocationId:
                    form.pickupSavedLocationId,
                  locationName:
                    form.pickupLocationName,
                  pickupInstructions:
                    form.pickupPickupInstructions
                },

                vias:
                  vias
                    .filter(
                      (via) =>
                        via.address.trim()
                    )
                    .map(
                      (via) => ({
                        address:
                          via.address,
                        postcode:
                          via.postcode,
                        latitude:
                          via.latitude,
                        longitude:
                          via.longitude,
                        savedLocationId:
                          via.savedLocationId,
                        locationName:
                          via.locationName,
                        pickupInstructions:
                          via.pickupInstructions
                      })
                    ),

                destination: {
                  address:
                    form.destinationAddress,
                  postcode:
                    form.destinationPostcode,
                  latitude:
                    form.destinationLatitude,
                  longitude:
                    form.destinationLongitude,
                  savedLocationId:
                    form.destinationSavedLocationId,
                  locationName:
                    form.destinationLocationName,
                  pickupInstructions:
                    form.destinationPickupInstructions
                }
              })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to save favourite'
        );
      }

      setBookingFavourites(
        (current) => [
          data.favourite,
          ...current.filter(
            (item) =>
              item.id !==
              data.favourite.id
          )
        ]
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save favourite'
      );
    } finally {
      setSavingFavourite(false);
    }
  }


  async function removeFavourite(
    favourite
  ) {
    if (
      !window.confirm(
        `Remove "${favourite.name}" from your favourites?`
      )
    ) {
      return;
    }

    setError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/booking-favourites/${favourite.id}`,
          {
            method:
              'DELETE'
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to remove favourite'
        );
      }

      setBookingFavourites(
        (current) =>
          current.filter(
            (item) =>
              item.id !== favourite.id
          )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to remove favourite'
      );
    }
  }


  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function addVia() {
    setVias((current) => [
      ...current,
      {
        address: '',
        postcode: '',
        latitude: null,
        longitude: null,
        savedLocationId: null,
        locationName: null,
        pickupInstructions: null
      }
    ]);
  }

  function updateVia(index, field, value) {
    setVias((current) =>
      current.map((via, viaIndex) =>
        viaIndex === index
          ? {
              ...via,
              [field]: value
            }
          : via
      )
    );
  }

  function removeVia(index) {
    setVias((current) =>
      current.filter((_, viaIndex) => viaIndex !== index)
    );
  }

  function resetBooking() {
    setForm(
      createInitialBookingForm()
    );

    setVias([]);
    setConfirmation(null);
    setPendingBookingId(null);
    setPendingBookingReference('');
    setError('');
  }

  const bookingHasEnteredData =
    Boolean(
      form.pickupAddress?.trim() ||
      form.destinationAddress?.trim() ||
      form.passengerName?.trim() ||
      form.passengerMobile?.trim() ||
      form.budgetId ||
      form.reasonCodeId ||
      form.driverNotes?.trim() ||
      vias.some(
        (via) =>
          via.address?.trim()
      )
    );


  function startAgain() {
    if (
      bookingHasEnteredData &&
      !window.confirm(
        'Clear the current transport request and start again?'
      )
    ) {
      return;
    }

    resetBooking();
    setError('');
  }


  async function submitBooking(event) {
    event.preventDefault();

    setSaving(true);
    setError('');
    setConfirmation(null);

    try {
      if (!form.pickupDate || !form.pickupTime) {
        throw new Error(
          'Pickup date and time are required'
        );
      }

      let bookingId =
        pendingBookingId;

      if (!bookingId) {
        const response = await apiFetch(
          `${API_BASE}/api/bookings`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              requestedPickupAt:
                `${form.pickupDate}T${form.pickupTime}:00`,

              passengerName: form.passengerName,
              passengerMobile: form.passengerMobile,
              passengerCount: Number(form.passengerCount),

              pickup: {
                address:
                  form.pickupAddress,
                postcode:
                  form.pickupPostcode,
                latitude:
                  form.pickupLatitude,
                longitude:
                  form.pickupLongitude,
                savedLocationId:
                  form.pickupSavedLocationId,
                locationName:
                  form.pickupLocationName,
                pickupInstructions:
                  form.pickupPickupInstructions
              },

              vias: vias
                .filter(
                  (via) =>
                    via.address.trim()
                )
                .map((via) => ({
                  address:
                    via.address,
                  postcode:
                    via.postcode,
                  latitude:
                    via.latitude,
                  longitude:
                    via.longitude,
                  savedLocationId:
                    via.savedLocationId,
                  locationName:
                    via.locationName,
                  pickupInstructions:
                    via.pickupInstructions
                })),

              destination: {
                address:
                  form.destinationAddress,
                postcode:
                  form.destinationPostcode,
                latitude:
                  form.destinationLatitude,
                longitude:
                  form.destinationLongitude,
                savedLocationId:
                  form.destinationSavedLocationId,
                locationName:
                  form.destinationLocationName,
                pickupInstructions:
                  form.destinationPickupInstructions
              },

              driverNotes: form.driverNotes,

              budgetId: Number(form.budgetId),
              reasonCodeId: Number(form.reasonCodeId),
              createdByUserId: bookingUserId
            })
          }
        );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ||
            'Unable to create booking'
          );
        }

        bookingId =
          result.booking.id;

        setPendingBookingId(
          bookingId
        );

        setPendingBookingReference(
          result.booking.publicReference ||
          `Booking ${bookingId}`
        );
      }

      const submitResponse = await apiFetch(
        `${API_BASE}/api/bookings/${bookingId}/submit`,
        {
          method: 'POST'
        }
      );

      const submitResult =
        await submitResponse.json();

      if (!submitResponse.ok) {
        throw new Error(
          submitResult.error ||
          'Unable to submit booking to dispatch'
        );
      }

      setConfirmation(
        submitResult.booking
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to create booking'
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card state-panel">
        Loading booking options...
      </div>
    );
  }

  if (confirmation) {
    return (
      <div className="booking-confirmation">
        <div className="confirmation-icon">
          <CheckCircle2 size={34}/>
        </div>

        <h1>Transport booked</h1>

        <p className="confirmation-lead">
          The UHP transport booking has been sent to dispatch successfully.
        </p>

        <div className="confirmation-reference">
          <small>Autocab Booking</small>
          <strong>
            {confirmation.autocabBookingId || 'Pending'}
          </strong>

          <small>
            {portalBookingReference(confirmation)}
          </small>
        </div>

        <div className="confirmation-grid">
          <div>
            <small>Passenger</small>
            <strong>{confirmation.passengerName}</strong>
          </div>

          <div>
            <small>Pickup</small>
            <strong>
              {confirmation.requestedPickupAt
                .replace('T', ' ')
                .slice(0, 16)}
            </strong>
          </div>

          <div>
            <small>Budget</small>
            <strong>
              {confirmation.budgetNumber}
            </strong>
          </div>

          <div>
            <small>Budget Holder</small>
            <strong>
              {confirmation.budgetHolder}
            </strong>
          </div>

          <div>
            <small>Reason</small>
            <strong>
              {confirmation.reasonCode} · {confirmation.reasonDescription}
            </strong>
          </div>

          <div>
            <small>Status</small>
            <strong>
              {formatStatus(
                confirmation.operationalStatus
              )}
            </strong>
          </div>
        </div>

        <div className="confirmation-note">
          This booking has been sent to Autocab dispatch and linked to the UHP Transport Portal.
        </div>

        <button
          className="primary"
          onClick={resetBooking}
        >
          <Plus size={18}/>
          Book Another Journey
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="page-heading booking-heading">
        <div>
          <h1>Book UHP Transport</h1>

          <p>
            For authorised UHP-funded transport only.
          </p>
        </div>

        {bookingUser && (
          <div className="booking-user-chip">
            <small>Booking as</small>
            <strong>
              {bookingUser.firstName} {bookingUser.lastName}
            </strong>
          </div>
        )}
      </div>

      {error && (
        <div className="notice error">
          {error}
        </div>
      )}

      {budgets.length === 0 && (
        <div className="notice error">
          This user does not currently have any fully configured
          budgets available for transport bookings.
        </div>
      )}

      <section className="card booking-quick-book">
        <div className="booking-quick-book-heading">
          <div>
            <span className="booking-quick-book-eyebrow">
              Quick Book
            </span>

            <h2>
              Frequent journeys
            </h2>

            <p>
              Reuse a favourite or recent journey without entering everything again.
            </p>
          </div>

          <span className="booking-quick-book-user">
            Personal to {bookingUser?.firstName || 'you'}
          </span>
        </div>

        <div className="booking-quick-book-content">
          <div className="booking-quick-book-group">
            <div className="booking-quick-book-group-heading">
              <strong>
                Favourites
              </strong>

              <button
                type="button"
                className="booking-save-favourite"
                disabled={
                  savingFavourite ||
                  !form.pickupAddress.trim() ||
                  !form.destinationAddress.trim()
                }
                onClick={
                  saveCurrentFavourite
                }
              >
                {savingFavourite
                  ? 'Saving...'
                  : '+ Save current'}
              </button>
            </div>

            <div className="booking-quick-book-list">
              {quickBookLoading ? (
                <span className="booking-quick-empty">
                  Loading...
                </span>
              ) : bookingFavourites.length === 0 ? (
                <span className="booking-quick-empty">
                  No favourites yet
                </span>
              ) : (
                bookingFavourites
                  .slice(0, 5)
                  .map(
                    (favourite) => (
                      <div
                        key={favourite.id}
                        className="booking-quick-item-wrap"
                      >
                        <button
                          type="button"
                          className="booking-quick-item"
                          onClick={() =>
                            applyFavourite(
                              favourite
                            )
                          }
                        >
                          <strong>
                            {favourite.name}
                          </strong>
                        </button>

                        <button
                          type="button"
                          className="booking-quick-remove"
                          aria-label={`Remove ${favourite.name}`}
                          onClick={() =>
                            removeFavourite(
                              favourite
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                    )
                  )
              )}
            </div>
          </div>

          <div className="booking-quick-book-group">
            <div className="booking-quick-book-group-heading">
              <strong>
                Recent
              </strong>

              <span>
                Rebook
              </span>
            </div>

            <div className="booking-quick-book-list">
              {quickBookLoading ? (
                <span className="booking-quick-empty">
                  Loading...
                </span>
              ) : recentBookings.length === 0 ? (
                <span className="booking-quick-empty">
                  No recent journeys
                </span>
              ) : (
                recentBookings
                  .slice(0, 5)
                  .map(
                    (booking) => (
                      <button
                        key={booking.id}
                        type="button"
                        className="booking-quick-item"
                        onClick={() =>
                          applyRecentBooking(
                            booking
                          )
                        }
                      >
                        <strong>
                          {booking.pickupAddress}
                        </strong>

                        <span>
                          →
                          {' '}
                          {booking.destinationAddress}
                        </span>
                      </button>
                    )
                  )
              )}
            </div>
          </div>
        </div>
      </section>

      <form
        className="booking-layout booking-layout-modern"
        onSubmit={submitBooking}
      >
        <div className="booking-main">
          <section className="card booking-section">
            <div className="section-heading">
              <span className="section-number">1</span>

              <div>
                <h2>Date &amp; Time</h2>
                <p>
                  When should the passenger be collected?
                </p>
              </div>
            </div>

            <div className="booking-time-layout">
              <div className="form-grid two">
              <label>
                Pickup Date
                <input
                  type="date"
                  required
                  value={form.pickupDate}
                  onChange={(e) =>
                    updateForm(
                      'pickupDate',
                      e.target.value
                    )
                  }
                />
              </label>

              <label>
                Pickup Time
                <input
                  type="time"
                  required
                  value={form.pickupTime}
                  onChange={(e) =>
                    updateForm(
                      'pickupTime',
                      e.target.value
                    )
                  }
                />
              </label>
              </div>

              <div
                className={`booking-eta-preview pickup-eta-preview ${pickupEtaTone}`}
              >
                <small>
                  Nearest clear car
                </small>

                <strong>
                  {pickupEta.status === 'loading'
                    ? 'Checking...'
                    : pickupEta.status === 'success'
                      ? `${pickupEtaMinutes} min`
                      : pickupEta.status === 'unavailable' ||
                          pickupEta.status === 'error'
                        ? 'Estimate unavailable'
                        : 'Select pickup'}
                </strong>

                <span>
                  {pickupEta.status === 'success'
                    ? `${pickupEta.nearbyCount} clear ${
                        pickupEta.nearbyCount === 1
                          ? 'car'
                          : 'cars'
                      } nearby`
                    : pickupEta.status === 'loading'
                      ? 'Finding the nearest clear car.'
                      : pickupEta.status === 'unavailable'
                        ? pickupEta.nearbyCount > 0
                          ? `${pickupEta.nearbyCount} clear ${
                              pickupEta.nearbyCount === 1
                                ? 'car'
                                : 'cars'
                            } nearby · ETA unavailable`
                          : 'No fresh clear cars nearby.'
                        : pickupEta.status === 'error'
                          ? 'Live pickup estimate temporarily unavailable.'
                          : 'Choose a pickup location to calculate.'}
                </span>
              </div>

              <div className="booking-eta-preview journey-eta-preview">
                <small>Journey estimate</small>

                <strong>
                  {journeyEta.status === 'loading'
                    ? 'Calculating...'
                    : journeyEta.status === 'success'
                      ? `${journeyEtaMinutes} min`
                      : journeyEta.status === 'error'
                        ? 'Estimate unavailable'
                        : 'Select route locations'}
                </strong>

                <span>
                  {journeyEta.status === 'success'
                    ? (
                        journeyEtaDistance ||
                        'Live Autocab route estimate'
                      )
                    : journeyEta.status === 'loading'
                      ? 'Checking the live route with Autocab.'
                      : journeyEta.status === 'error'
                        ? 'You can still create the transport request.'
                        : 'Choose pickup and destination to calculate.'}
                </span>
              </div>
            </div>
          </section>

          <section className="card booking-section">
            <div className="section-heading">
              <span className="section-number">2</span>

              <div>
                <h2>Journey</h2>
                <p>
                  Enter the pickup, any stops, and destination.
                </p>
              </div>
            </div>

            <div className="journey-stop pickup-stop">
              <div className="stop-marker">
                <span/>
              </div>

              <div className="stop-fields">
                <label>
                  Pickup

                  <SavedLocationChips
                    locations={
                      savedLocations
                    }
                    onSelect={(location) =>
                      setForm(
                        (current) => ({
                          ...current,
                          pickupAddress:
                            location.address,
                          pickupPostcode:
                            location.postcode ||
                            '',
                          pickupLatitude:
                            location.latitude,
                          pickupLongitude:
                            location.longitude,
                          pickupSavedLocationId:
                            location.id,
                          pickupLocationName:
                            location.name,
                          pickupPickupInstructions:
                            location.pickupInstructions ||
                            null
                        })
                      )
                    }
                  />

                  <BookingAddressAutocomplete
                    savedLocations={
                      savedLocations
                    }
                    required
                    searchEnabled={
                      form.pickupLatitude === null ||
                      form.pickupLongitude === null
                    }
                    placeholder="Start typing pickup address"
                    value={
                      form.pickupAddress
                    }
                    onChange={(value) =>
                      setForm(
                        (current) => ({
                          ...current,
                          pickupAddress:
                            value,
                          pickupPostcode:
                            current.pickupLatitude !== null &&
                            current.pickupLongitude !== null
                              ? ''
                              : current.pickupPostcode,
                          pickupLatitude:
                            null,
                          pickupLongitude:
                            null,
                          pickupSavedLocationId:
                            null,
                          pickupLocationName:
                            null,
                          pickupPickupInstructions:
                            null
                        })
                      )
                    }
                    onSelect={(result) =>
                      setForm(
                        (current) => ({
                          ...current,
                          pickupAddress:
                            result.address,
                          pickupPostcode:
                            result.postcode ||
                            current.pickupPostcode,
                          pickupLatitude:
                            result.latitude,
                          pickupLongitude:
                            result.longitude,
                          pickupSavedLocationId:
                            result.savedLocationId ||
                            null,
                          pickupLocationName:
                            result.locationName ||
                            null,
                          pickupPickupInstructions:
                            result.pickupInstructions ||
                            null
                        })
                      )
                    }
                  />
                </label>

                <label className="postcode-field">
                  Postcode

                  <input
                    placeholder="Optional"
                    value={
                      form.pickupPostcode
                    }
                    onChange={(event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          pickupPostcode:
                            event.target.value
                              .toUpperCase(),
                          pickupLatitude:
                            null,
                          pickupLongitude:
                            null,
                          pickupSavedLocationId:
                            null,
                          pickupLocationName:
                            null,
                          pickupPickupInstructions:
                            null
                        })
                      )
                    }
                  />
                </label>
              </div>
            </div>

            {vias.map(
              (via, index) => (
                <div
                  className="journey-stop via-stop"
                  key={index}
                >
                  <div className="stop-marker">
                    <span/>
                  </div>

                  <div className="stop-fields">
                    <label>
                      Via {index + 1}

                      <SavedLocationChips
                        locations={
                          savedLocations
                        }
                        onSelect={(location) =>
                          setVias(
                            (current) =>
                              current.map(
                                (
                                  currentVia,
                                  viaIndex
                                ) =>
                                  viaIndex === index
                                    ? {
                                        ...currentVia,
                                        address:
                                          location.address,
                                        postcode:
                                          location.postcode ||
                                          '',
                                        latitude:
                                          location.latitude,
                                        longitude:
                                          location.longitude,
                                        savedLocationId:
                                          location.id,
                                        locationName:
                                          location.name,
                                        pickupInstructions:
                                          location.pickupInstructions ||
                                          null
                                      }
                                    : currentVia
                              )
                          )
                        }
                      />

                      <BookingAddressAutocomplete
                        savedLocations={
                          savedLocations
                        }
                        searchEnabled={
                          via.latitude === null ||
                          via.longitude === null
                        }
                        placeholder="Start typing via address"
                        value={
                          via.address
                        }
                        onChange={(value) =>
                          setVias(
                            (current) =>
                              current.map(
                                (
                                  currentVia,
                                  viaIndex
                                ) =>
                                  viaIndex === index
                                    ? {
                                        ...currentVia,
                                        address:
                                          value,
                                        postcode:
                                          currentVia.latitude !== null &&
                                          currentVia.longitude !== null
                                            ? ''
                                            : currentVia.postcode,
                                        latitude:
                                          null,
                                        longitude:
                                          null,
                                        savedLocationId:
                                          null,
                                        locationName:
                                          null,
                                        pickupInstructions:
                                          null
                                      }
                                    : currentVia
                              )
                          )
                        }
                        onSelect={(result) =>
                          setVias(
                            (current) =>
                              current.map(
                                (
                                  currentVia,
                                  viaIndex
                                ) =>
                                  viaIndex === index
                                    ? {
                                        ...currentVia,
                                        address:
                                          result.address,
                                        postcode:
                                          result.postcode ||
                                          currentVia.postcode,
                                        latitude:
                                          result.latitude,
                                        longitude:
                                          result.longitude,
                                        savedLocationId:
                                          result.savedLocationId ||
                                          null,
                                        locationName:
                                          result.locationName ||
                                          null,
                                        pickupInstructions:
                                          result.pickupInstructions ||
                                          null
                                      }
                                    : currentVia
                              )
                          )
                        }
                      />
                    </label>

                    <label className="postcode-field">
                      Postcode

                      <input
                        placeholder="Optional"
                        value={
                          via.postcode
                        }
                        onChange={(event) =>
                          setVias(
                            (current) =>
                              current.map(
                                (
                                  currentVia,
                                  viaIndex
                                ) =>
                                  viaIndex === index
                                    ? {
                                        ...currentVia,
                                        postcode:
                                          event.target.value
                                            .toUpperCase(),
                                        latitude:
                                          null,
                                        longitude:
                                          null,
                                        savedLocationId:
                                          null,
                                        locationName:
                                          null,
                                        pickupInstructions:
                                          null
                                      }
                                    : currentVia
                              )
                          )
                        }
                      />
                    </label>

                    <button
                      type="button"
                      className="remove-stop"
                      onClick={() =>
                        removeVia(
                          index
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )
            )}

            <button
              type="button"
              className="add-via"
              onClick={
                addVia
              }
            >
              <Plus size={16}/>
              Add Via
            </button>

            <div className="journey-stop destination-stop">
              <div className="stop-marker">
                <span/>
              </div>

              <div className="stop-fields">
                <label>
                  Destination

                  <SavedLocationChips
                    locations={
                      savedLocations
                    }
                    onSelect={(location) =>
                      setForm(
                        (current) => ({
                          ...current,
                          destinationAddress:
                            location.address,
                          destinationPostcode:
                            location.postcode ||
                            '',
                          destinationLatitude:
                            location.latitude,
                          destinationLongitude:
                            location.longitude,
                          destinationSavedLocationId:
                            location.id,
                          destinationLocationName:
                            location.name,
                          destinationPickupInstructions:
                            location.pickupInstructions ||
                            null
                        })
                      )
                    }
                  />

                  <BookingAddressAutocomplete
                    savedLocations={
                      savedLocations
                    }
                    required
                    searchEnabled={
                      form.destinationLatitude === null ||
                      form.destinationLongitude === null
                    }
                    placeholder="Start typing destination address"
                    value={
                      form.destinationAddress
                    }
                    onChange={(value) =>
                      setForm(
                        (current) => ({
                          ...current,
                          destinationAddress:
                            value,
                          destinationPostcode:
                            current.destinationLatitude !== null &&
                            current.destinationLongitude !== null
                              ? ''
                              : current.destinationPostcode,
                          destinationLatitude:
                            null,
                          destinationLongitude:
                            null,
                          destinationSavedLocationId:
                            null,
                          destinationLocationName:
                            null,
                          destinationPickupInstructions:
                            null
                        })
                      )
                    }
                    onSelect={(result) =>
                      setForm(
                        (current) => ({
                          ...current,
                          destinationAddress:
                            result.address,
                          destinationPostcode:
                            result.postcode ||
                            current.destinationPostcode,
                          destinationLatitude:
                            result.latitude,
                          destinationLongitude:
                            result.longitude,
                          destinationSavedLocationId:
                            result.savedLocationId ||
                            null,
                          destinationLocationName:
                            result.locationName ||
                            null,
                          destinationPickupInstructions:
                            result.pickupInstructions ||
                            null
                        })
                      )
                    }
                  />
                </label>

                <label className="postcode-field">
                  Postcode

                  <input
                    placeholder="Optional"
                    value={
                      form.destinationPostcode
                    }
                    onChange={(event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          destinationPostcode:
                            event.target.value
                              .toUpperCase(),
                          destinationLatitude:
                            null,
                          destinationLongitude:
                            null,
                          destinationSavedLocationId:
                            null,
                          destinationLocationName:
                            null,
                          destinationPickupInstructions:
                            null
                        })
                      )
                    }
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="card booking-section">
            <div className="section-heading">
              <span className="section-number">3</span>

              <div>
                <h2>Passenger</h2>
                <p>
                  Who is travelling?
                </p>
              </div>
            </div>

            <div className="form-grid two">
              <label>
                Passenger Name
                <input
                  required
                  value={form.passengerName}
                  onChange={(e) =>
                    updateForm(
                      'passengerName',
                      e.target.value
                    )
                  }
                />
              </label>

              <label>
                Contact Number
                <input
                  type="tel"
                  required
                  value={form.passengerMobile}
                  onChange={(e) =>
                    updateForm(
                      'passengerMobile',
                      e.target.value
                    )
                  }
                />
              </label>
            </div>

            <label className="short-field">
              Number of Passengers
              <input
                type="number"
                min="1"
                required
                value={form.passengerCount}
                onChange={(e) =>
                  updateForm(
                    'passengerCount',
                    e.target.value
                  )
                }
              />
            </label>
          </section>

          <section className="card booking-section">
            <div className="section-heading">
              <span className="section-number">4</span>

              <div>
                <h2>UHP Authorisation</h2>
                <p>
                  Select the approved reason and budget.
                </p>
              </div>
            </div>

            <div className="form-grid two">
              <label>
                Reason Code
                <select
                  required
                  value={form.reasonCodeId}
                  onChange={(e) =>
                    updateForm(
                      'reasonCodeId',
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    Select reason...
                  </option>

                  {reasonCodes.map((reason) => (
                    <option
                      key={reason.id}
                      value={reason.id}
                    >
                      {reason.code} — {reason.description}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Budget Number
                <select
                  required
                  value={form.budgetId}
                  onChange={(e) =>
                    updateForm(
                      'budgetId',
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    Select budget...
                  </option>

                  {budgets.map((budget) => (
                    <option
                      key={budget.id}
                      value={budget.id}
                    >
                      {budget.budgetNumber} — {budget.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedBudget && (
              <div className="budget-holder-panel">
                <div>
                  <small>Budget Holder</small>
                  <strong>
                    {selectedBudget.budgetHolder}
                  </strong>
                </div>

                <div>
                  <small>Department</small>
                  <strong>
                    {selectedBudget.department || '—'}
                  </strong>
                </div>
              </div>
            )}
          </section>

          <section className="card booking-section">
            <div className="section-heading">
              <span className="section-number">5</span>

              <div>
                <h2>Driver Notes</h2>
                <p>
                  Optional information the driver may need.
                </p>
              </div>
            </div>

            <label>
              Notes
              <textarea
                rows="4"
                placeholder="For example: collection point, ward entrance or passenger assistance information."
                value={form.driverNotes}
                onChange={(e) =>
                  updateForm(
                    'driverNotes',
                    e.target.value
                  )
                }
              />
            </label>
          </section>
        </div>

        <aside className="booking-summary">
          <BookingPlanningMap
            pickup={{
              address:
                form.pickupAddress,
              latitude:
                form.pickupLatitude,
              longitude:
                form.pickupLongitude
            }}
            vias={
              vias
            }
            destination={{
              address:
                form.destinationAddress,
              latitude:
                form.destinationLatitude,
              longitude:
                form.destinationLongitude
            }}
          />

          <div className="card summary-card">
            <h3>UHP Account Booking</h3>

            <div className="account-only-chip">
              UHP Funded
            </div>

            <p>
              All journeys booked here require an approved UHP
              budget and reason code.
            </p>

            <div className="summary-rule"/>

            <div className="summary-item">
              <small>Budget</small>

              <strong>
                {selectedBudget
                  ? selectedBudget.budgetNumber
                  : 'Not selected'}
              </strong>
            </div>

            <div className="summary-item">
              <small>Budget Holder</small>

              <strong>
                {selectedBudget
                  ? selectedBudget.budgetHolder
                  : '—'}
              </strong>
            </div>

            <div className="summary-rule"/>

            <div className="no-fare-note">
              No fare is shown at the point of booking.
              Completed journey costs will be posted through the
              UHP account process.
            </div>

            {error && pendingBookingId && (
              <div className="notice error">
                <strong>
                  Dispatch confirmation needs review.
                </strong>

                <div>
                  This transport request has already been recorded
                  in the UHP Transport Portal
                  {pendingBookingReference
                    ? ` as ${pendingBookingReference}`
                    : ''}.
                  {' '}Do not create another request for the same journey.
                </div>

                <div>
                  {error}
                </div>
              </div>
            )}

            <div className="booking-submit-actions">
              <button
                type="button"
                className="booking-start-again"
                disabled={
                  saving ||
                  Boolean(pendingBookingId) ||
                  !bookingHasEnteredData
                }
                onClick={startAgain}
              >
                Start Again
              </button>

              <button
                type="submit"
                className="primary booking-submit"
                disabled={
                  saving ||
                  budgets.length === 0 ||
                  Boolean(pendingBookingId)
                }
              >
                {saving
                  ? 'Creating Request...'
                  : pendingBookingId
                    ? 'Dispatch Review Required'
                    : 'Create Transport Request'}
              </button>
            </div>
          </div>
        </aside>
      </form>
    </>
  );
}

function BudgetsPage() {
  const [budgets, setBudgets] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);

  const emptyForm = {
    budgetNumber: '',
    name: '',
    departmentId: '',
    holderUserId: '',
    deputyUserId: ''
  };

  const [form, setForm] = useState(emptyForm);

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [
        budgetsResponse,
        departmentsResponse,
        usersResponse
      ] = await Promise.all([
        apiFetch(`${API_BASE}/api/budgets`),
        apiFetch(`${API_BASE}/api/departments`),
        apiFetch(`${API_BASE}/api/users`)
      ]);

      if (
        !budgetsResponse.ok ||
        !departmentsResponse.ok ||
        !usersResponse.ok
      ) {
        throw new Error('Unable to load budget administration data');
      }

      const budgetData = await budgetsResponse.json();
      const departmentData = await departmentsResponse.json();
      const userData = await usersResponse.json();

      setBudgets(budgetData.budgets ?? []);
      setDepartments(departmentData.departments ?? []);
      setUsers(userData.users ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load budgets'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredBudgets = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (!term) return budgets;

    return budgets.filter((budget) =>
      [
        budget.budgetNumber,
        budget.name,
        budget.department,
        budget.budgetHolder,
        budget.deputyHolder,
        budget.status
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [budgets, query]);

  const stats = useMemo(() => ({
    active: budgets.filter((b) => b.status === 'active').length,
    inactive: budgets.filter((b) => b.status === 'inactive').length,
    missingHolder: budgets.filter(
      (b) => b.status === 'active' && !b.holderUserId
    ).length
  }), [budgets]);

  const eligibleUsers = users.filter(
    (user) =>
      user.status === 'active' ||
      user.status === 'invited'
  );

  function openCreate() {
    setEditingBudget(null);
    setForm(emptyForm);
    setError('');
    setNotice('');
    setShowModal(true);
  }

  function openEdit(budget) {
    setEditingBudget(budget);

    setForm({
      budgetNumber: budget.budgetNumber,
      name: budget.name,
      departmentId: String(budget.departmentId ?? ''),
      holderUserId: String(budget.holderUserId ?? ''),
      deputyUserId: String(budget.deputyUserId ?? '')
    });

    setError('');
    setNotice('');
    setShowModal(true);
  }

  async function submitBudget(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    try {
      const isEditing = Boolean(editingBudget);

      const url = isEditing
        ? `${API_BASE}/api/budgets/${editingBudget.id}`
        : `${API_BASE}/api/budgets`;

      const payload = {
        budgetNumber: form.budgetNumber,
        name: form.name,
        departmentId: Number(form.departmentId),
        holderUserId: form.holderUserId
          ? Number(form.holderUserId)
          : null,
        deputyUserId: form.deputyUserId
          ? Number(form.deputyUserId)
          : null
      };

      const response = await apiFetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
          `Unable to ${isEditing ? 'update' : 'create'} budget`
        );
      }

      setShowModal(false);
      setEditingBudget(null);
      setForm(emptyForm);

      setNotice(
        isEditing
          ? 'Budget updated successfully.'
          : 'Budget created successfully.'
      );

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save budget'
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(budget) {
    const nextStatus =
      budget.status === 'active'
        ? 'inactive'
        : 'active';

    const verb =
      nextStatus === 'inactive'
        ? 'deactivate'
        : 'reactivate';

    if (
      !window.confirm(
        `Are you sure you want to ${verb} budget ${budget.budgetNumber}?`
      )
    ) {
      return;
    }

    setError('');
    setNotice('');

    try {
      const response = await apiFetch(
        `${API_BASE}/api/budgets/${budget.id}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: nextStatus
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
          'Unable to update budget status'
        );
      }

      setNotice(
        `Budget ${budget.budgetNumber} is now ${nextStatus}.`
      );

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to update budget'
      );
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Budgets</h1>
          <p>
            Manage the UHP budgets authorised to fund transport bookings.
          </p>
        </div>

        <button
          className="primary"
          onClick={openCreate}
        >
          <Plus size={18}/>
          Add Budget
        </button>
      </div>

      {notice && (
        <div className="notice success">
          {notice}
        </div>
      )}

      {error && !loading && (
        <div className="notice error">
          {error}
        </div>
      )}

      <div className="stats-grid">
        <Stat
          icon={<WalletCards/>}
          label="Active Budgets"
          value={stats.active}
        />

        <Stat
          icon={<Clock3/>}
          label="Inactive"
          value={stats.inactive}
        />

        <Stat
          icon={<AlertTriangle/>}
          label="Needs Budget Holder"
          value={stats.missingHolder}
        />
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search compact">
            <Search size={17}/>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search budgets..."
            />
          </div>
        </div>

        {loading ? (
          <div className="state-panel">
            Loading budgets...
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Budget</th>
                  <th>Department</th>
                  <th>Primary Holder</th>
                  <th>Deputy</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredBudgets.map((budget) => (
                  <tr key={budget.id}>
                    <td>
                      <strong>{budget.budgetNumber}</strong>
                      <small>{budget.name}</small>
                    </td>

                    <td>{budget.department || '—'}</td>

                    <td>
                      {budget.budgetHolder || (
                        <span className="attention-text">
                          Needs holder
                        </span>
                      )}
                    </td>

                    <td>
                      {budget.deputyHolder || '—'}
                    </td>

                    <td>
                      <span className={`badge ${budget.status}`}>
                        {formatStatus(budget.status)}
                      </span>
                    </td>

                    <td>
                      <div className="row-actions">
                        <button
                          className="text-action"
                          onClick={() => openEdit(budget)}
                        >
                          Edit
                        </button>

                        <button
                          className={
                            budget.status === 'active'
                              ? 'text-action warning'
                              : 'text-action'
                          }
                          onClick={() => changeStatus(budget)}
                        >
                          {budget.status === 'active'
                            ? 'Deactivate'
                            : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredBudgets.length === 0 && (
                  <tr>
                    <td colSpan="6">
                      <div className="empty-table">
                        No budgets match your search.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !saving
            ) {
              setShowModal(false);
            }
          }}
        >
          <form
            className="modal-card"
            onSubmit={submitBudget}
          >
            <div className="modal-header">
              <div>
                <h2>
                  {editingBudget
                    ? 'Edit Budget'
                    : 'Add Budget'}
                </h2>

                <p>
                  Configure the budget and the people responsible for it.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() => setShowModal(false)}
                disabled={saving}
              >
                ×
              </button>
            </div>

            <div className="form-grid two">
              <label>
                Budget Number
                <input
                  required
                  disabled={Boolean(editingBudget)}
                  value={form.budgetNumber}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      budgetNumber: e.target.value
                    })
                  }
                />
              </label>

              <label>
                Department
                <select
                  required
                  value={form.departmentId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      departmentId: e.target.value
                    })
                  }
                >
                  <option value="">
                    Select department...
                  </option>

                  {departments
                    .filter(
                      (department) =>
                        department.status === 'active'
                    )
                    .map((department) => (
                      <option
                        key={department.id}
                        value={department.id}
                      >
                        {department.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <label>
              Budget Name
              <input
                required
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value
                  })
                }
              />
            </label>

            <div className="form-grid two">
              <label>
                Primary Budget Holder
                <select
                  value={form.holderUserId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      holderUserId: e.target.value
                    })
                  }
                >
                  <option value="">
                    Not assigned
                  </option>

                  {eligibleUsers.map((user) => (
                    <option
                      key={user.id}
                      value={user.id}
                    >
                      {user.firstName} {user.lastName}
                      {user.department
                        ? ` — ${user.department}`
                        : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Deputy Budget Holder
                <select
                  value={form.deputyUserId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      deputyUserId: e.target.value
                    })
                  }
                >
                  <option value="">
                    Not assigned
                  </option>

                  {eligibleUsers.map((user) => (
                    <option
                      key={user.id}
                      value={user.id}
                    >
                      {user.firstName} {user.lastName}
                      {user.department
                        ? ` — ${user.department}`
                        : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {form.holderUserId &&
              form.holderUserId === form.deputyUserId && (
                <div className="inline-warning">
                  Primary and deputy cannot be the same person.
                  The deputy assignment will be ignored.
                </div>
              )}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowModal(false)}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary"
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : editingBudget
                    ? 'Save Changes'
                    : 'Create Budget'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function LocationMapClickHandler({
  onSelect
}) {
  useMapEvents({
    click(event) {
      onSelect({
        latitude:
          event.latlng.lat,
        longitude:
          event.latlng.lng
      });
    }
  });

  return null;
}


function LocationMapRecenter({
  latitude,
  longitude
}) {
  const map = useMap();

  useEffect(() => {
    if (
      latitude === null ||
      latitude === undefined ||
      longitude === null ||
      longitude === undefined ||
      !Number.isFinite(
        Number(latitude)
      ) ||
      !Number.isFinite(
        Number(longitude)
      )
    ) {
      return;
    }

    map.setView(
      [
        Number(latitude),
        Number(longitude)
      ],
      Math.max(
        map.getZoom(),
        16
      ),
      {
        animate: true
      }
    );
  }, [
    map,
    latitude,
    longitude
  ]);

  return null;
}


function LocationEditorMap({
  latitude,
  longitude,
  onSelect
}) {
  const hasCoordinate = (value) =>
    value !== null &&
    value !== undefined &&
    !(
      typeof value === 'string' &&
      !value.trim()
    ) &&
    Number.isFinite(
      Number(value)
    );

  const hasPin =
    hasCoordinate(latitude) &&
    hasCoordinate(longitude);

  const defaultCentre = [
    50.41716618389792,
    -4.116519158583742
  ];

  const locationIcon =
    L.divIcon({
      className:
        'booking-map-div-icon location-editor-icon',

      html: `
        <span class="booking-map-pin-wrapper">
          <span class="booking-map-pin pickup">
            <span class="booking-map-pin-label">
              P
            </span>
          </span>
        </span>
      `,

      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -28]
    });

  return (
    <div className="location-editor-map-shell">
      <MapContainer
        className="location-editor-map"
        center={
          hasPin
            ? [
                Number(latitude),
                Number(longitude)
              ]
            : defaultCentre
        }
        zoom={
          hasPin
            ? 16
            : 14
        }
        scrollWheelZoom
      >
        {MAP_TILE_URL && (
          <TileLayer
            attribution={
              MAP_TILE_ATTRIBUTION
            }
            url={MAP_TILE_URL}
          />
        )}

        <LocationMapClickHandler
          onSelect={onSelect}
        />

        {hasPin && (
          <>
            <LocationMapRecenter
              latitude={latitude}
              longitude={longitude}
            />

            <Marker
              position={[
                Number(latitude),
                Number(longitude)
              ]}
              icon={locationIcon}
            >
              <Popup>
                Exact transport point
              </Popup>
            </Marker>
          </>
        )}
      </MapContainer>

      <div className="location-editor-map-help">
        <strong>
          Click the map to set the exact transport point.
        </strong>

        <span>
          Use the entrance or roadside position where the taxi should
          actually collect or drop off — not simply the centre of the
          postcode.
        </span>
      </div>
    </div>
  );
}


function LocationsPage() {
  const emptyForm = {
    name: '',
    parentSite: '',
    address: '',
    postcode: '',
    latitude: null,
    longitude: null,
    category: 'hospital',
    pickupInstructions: '',
    driverInstructions: '',
    displayOrder: 0
  };

  const [
    locations,
    setLocations
  ] = useState([]);

  const [
    loading,
    setLoading
  ] = useState(true);

  const [
    saving,
    setSaving
  ] = useState(false);

  const [
    error,
    setError
  ] = useState('');

  const [
    notice,
    setNotice
  ] = useState('');

  const [
    query,
    setQuery
  ] = useState('');

  const [
    showModal,
    setShowModal
  ] = useState(false);

  const [
    editingLocation,
    setEditingLocation
  ] = useState(null);

  const [
    form,
    setForm
  ] = useState(emptyForm);

  async function loadLocations() {
    setLoading(true);
    setError('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/locations`
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to load locations'
        );
      }

      setLocations(
        data.locations ?? []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load locations'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLocations();
  }, []);

  const filteredLocations =
    useMemo(() => {
      const term =
        query
          .trim()
          .toLowerCase();

      if (!term) {
        return locations;
      }

      return locations.filter(
        (location) =>
          [
            location.name,
            location.parentSite,
            location.address,
            location.postcode,
            location.category,
            location.status
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(term)
      );
    }, [
      locations,
      query
    ]);

  const stats =
    useMemo(
      () => ({
        active:
          locations.filter(
            (location) =>
              location.status ===
              'active'
          ).length,

        inactive:
          locations.filter(
            (location) =>
              location.status ===
              'inactive'
          ).length,

        hospitals:
          locations.filter(
            (location) =>
              location.category ===
              'hospital'
          ).length
      }),
      [locations]
    );

  function openCreate() {
    setEditingLocation(null);
    setForm({
      ...emptyForm
    });

    setError('');
    setNotice('');
    setShowModal(true);
  }

  function openEdit(location) {
    setEditingLocation(location);

    setForm({
      name:
        location.name || '',

      parentSite:
        location.parentSite || '',

      address:
        location.address || '',

      postcode:
        location.postcode || '',

      latitude:
        location.latitude ?? null,

      longitude:
        location.longitude ?? null,

      category:
        location.category ||
        'hospital',

      pickupInstructions:
        location.pickupInstructions ||
        '',

      driverInstructions:
        location.driverInstructions ||
        '',

      displayOrder:
        location.displayOrder ?? 0
    });

    setError('');
    setNotice('');
    setShowModal(true);
  }

  function setMapPoint({
    latitude,
    longitude
  }) {
    setForm(
      (current) => ({
        ...current,
        latitude,
        longitude
      })
    );
  }

  async function submitLocation(
    event
  ) {
    event.preventDefault();

    setSaving(true);
    setError('');
    setNotice('');

    try {
      const isEditing =
        Boolean(
          editingLocation
        );

      const response =
        await apiFetch(
          isEditing
            ? `${API_BASE}/api/locations/${editingLocation.id}`
            : `${API_BASE}/api/locations`,
          {
            method:
              isEditing
                ? 'PATCH'
                : 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body:
              JSON.stringify({
                name:
                  form.name,

                parentSite:
                  form.parentSite,

                address:
                  form.address,

                postcode:
                  form.postcode,

                latitude:
                  form.latitude,

                longitude:
                  form.longitude,

                category:
                  form.category,

                pickupInstructions:
                  form.pickupInstructions,

                driverInstructions:
                  form.driverInstructions,

                displayOrder:
                  Number(
                    form.displayOrder
                  )
              })
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
          `Unable to ${
            isEditing
              ? 'update'
              : 'create'
          } location`
        );
      }

      setShowModal(false);
      setEditingLocation(null);

      setNotice(
        isEditing
          ? 'Location updated successfully.'
          : 'Location created successfully.'
      );

      await loadLocations();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save location'
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(
    location
  ) {
    const nextStatus =
      location.status ===
        'active'
        ? 'inactive'
        : 'active';

    const verb =
      nextStatus === 'inactive'
        ? 'deactivate'
        : 'reactivate';

    if (
      !window.confirm(
        `Are you sure you want to ${verb} ${location.name}?`
      )
    ) {
      return;
    }

    setError('');
    setNotice('');

    try {
      const response =
        await apiFetch(
          `${API_BASE}/api/locations/${location.id}/status`,
          {
            method: 'PATCH',

            headers: {
              'Content-Type':
                'application/json'
            },

            body:
              JSON.stringify({
                status:
                  nextStatus
              })
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
          'Unable to update location status'
        );
      }

      setNotice(
        `${location.name} is now ${nextStatus}.`
      );

      await loadLocations();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to update location'
      );
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            UHP Locations
          </h1>

          <p>
            Maintain exact hospital, clinic, entrance and transport
            pickup points used across UHP transport bookings.
          </p>
        </div>

        <button
          type="button"
          className="primary"
          onClick={openCreate}
        >
          <Plus size={18}/>
          Add Location
        </button>
      </div>

      {notice && (
        <div className="notice success">
          {notice}
        </div>
      )}

      {error &&
      !showModal &&
      !loading && (
        <div className="notice error">
          {error}
        </div>
      )}

      <div className="stats-grid location-stats-grid">
        <Stat
          icon={<MapPin/>}
          label="Active Locations"
          value={stats.active}
        />

        <Stat
          icon={<Clock3/>}
          label="Inactive"
          value={stats.inactive}
        />

        <Stat
          icon={<CarFront/>}
          label="Hospital Points"
          value={stats.hospitals}
        />
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search compact">
            <Search size={17}/>

            <input
              value={query}
              onChange={(event) =>
                setQuery(
                  event.target.value
                )
              }
              placeholder="Search locations, sites or postcodes..."
            />
          </div>
        </div>

        {loading ? (
          <div className="state-panel">
            Loading locations...
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Site / Address</th>
                  <th>Category</th>
                  <th>Pin</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredLocations.map(
                  (location) => (
                    <tr
                      key={
                        location.id
                      }
                    >
                      <td>
                        <strong>
                          {location.name}
                        </strong>
                      </td>

                      <td>
                        <div className="location-table-address">
                          {location.parentSite && (
                            <strong>
                              {location.parentSite}
                            </strong>
                          )}

                          <span>
                            {location.address}
                          </span>

                          {location.postcode && (
                            <small>
                              {location.postcode}
                            </small>
                          )}
                        </div>
                      </td>

                      <td>
                        {formatStatus(
                          location.category
                        )}
                      </td>

                      <td>
                        <span className="location-pin-status">
                          <MapPin size={14}/>
                          Exact
                        </span>
                      </td>

                      <td>
                        <span
                          className={`badge ${location.status}`}
                        >
                          {formatStatus(
                            location.status
                          )}
                        </span>
                      </td>

                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="text-action"
                            onClick={() =>
                              openEdit(
                                location
                              )
                            }
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className={
                              location.status ===
                                'active'
                                ? 'text-action warning'
                                : 'text-action'
                            }
                            onClick={() =>
                              changeStatus(
                                location
                              )
                            }
                          >
                            {location.status ===
                              'active'
                              ? 'Deactivate'
                              : 'Reactivate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}

                {filteredLocations.length ===
                  0 && (
                  <tr>
                    <td colSpan="6">
                      <div className="empty-table">
                        No locations match your search.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
                event.currentTarget &&
              !saving
            ) {
              setShowModal(false);
            }
          }}
        >
          <form
            className="modal-card location-editor-modal"
            onSubmit={
              submitLocation
            }
          >
            <div className="modal-header">
              <div>
                <h2>
                  {editingLocation
                    ? 'Edit UHP Location'
                    : 'Add UHP Location'}
                </h2>

                <p>
                  Define the descriptive location and then place the
                  pin where the taxi should actually collect or drop off.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() =>
                  setShowModal(false)
                }
                disabled={saving}
              >
                ×
              </button>
            </div>

            {error && (
              <div className="notice error">
                {error}
              </div>
            )}

            <div className="location-editor-layout">
              <div className="location-editor-fields">
                <div className="form-grid two">
                  <label>
                    Location Name
                    <input
                      required
                      value={
                        form.name
                      }
                      onChange={(event) =>
                        setForm({
                          ...form,
                          name:
                            event.target.value
                        })
                      }
                      placeholder="e.g. Renal Clinic"
                    />
                  </label>

                  <label>
                    Parent Site
                    <input
                      value={
                        form.parentSite
                      }
                      onChange={(event) =>
                        setForm({
                          ...form,
                          parentSite:
                            event.target.value
                        })
                      }
                      placeholder="e.g. Derriford Hospital"
                    />
                  </label>
                </div>

                <label>
                  Address / Site Search

                  <BookingAddressAutocomplete
                    required
                    searchEnabled={
                      form.latitude ===
                        null ||
                      form.longitude ===
                        null
                    }
                    value={
                      form.address
                    }
                    placeholder="Search for the hospital or nearest address"
                    onChange={(value) =>
                      setForm(
                        (current) => ({
                          ...current,
                          address:
                            value,
                          postcode:
                            '',
                          latitude:
                            null,
                          longitude:
                            null
                        })
                      )
                    }
                    onSelect={(result) =>
                      setForm(
                        (current) => ({
                          ...current,
                          address:
                            result.label,
                          postcode:
                            result.postcode ||
                            '',
                          latitude:
                            result.latitude,
                          longitude:
                            result.longitude
                        })
                      )
                    }
                  />
                </label>

                <div className="form-grid two">
                  <label>
                    Postcode
                    <input
                      value={
                        form.postcode
                      }
                      onChange={(event) =>
                        setForm({
                          ...form,
                          postcode:
                            event.target.value
                              .toUpperCase()
                        })
                      }
                    />
                  </label>

                  <label>
                    Category
                    <select
                      value={
                        form.category
                      }
                      onChange={(event) =>
                        setForm({
                          ...form,
                          category:
                            event.target.value
                        })
                      }
                    >
                      <option value="hospital">
                        Hospital / Clinic
                      </option>

                      <option value="uhp">
                        UHP
                      </option>

                      <option value="transport">
                        Transport
                      </option>

                      <option value="other">
                        Other
                      </option>
                    </select>
                  </label>
                </div>

                <div className="form-grid two">
                  <label>
                    Latitude
                    <input
                      readOnly
                      value={
                        form.latitude ===
                          null
                          ? ''
                          : Number(
                              form.latitude
                            ).toFixed(6)
                      }
                      placeholder="Set using map"
                    />
                  </label>

                  <label>
                    Longitude
                    <input
                      readOnly
                      value={
                        form.longitude ===
                          null
                          ? ''
                          : Number(
                              form.longitude
                            ).toFixed(6)
                      }
                      placeholder="Set using map"
                    />
                  </label>
                </div>

                <label>
                  Pickup Instructions
                  <textarea
                    rows="3"
                    value={
                      form.pickupInstructions
                    }
                    onChange={(event) =>
                      setForm({
                        ...form,
                        pickupInstructions:
                          event.target.value
                      })
                    }
                    placeholder="What should the UHP booker know about this pickup point?"
                  />
                </label>

                <label>
                  Driver Instructions
                  <textarea
                    rows="3"
                    value={
                      form.driverInstructions
                    }
                    onChange={(event) =>
                      setForm({
                        ...form,
                        driverInstructions:
                          event.target.value
                      })
                    }
                    placeholder="Operational instructions that help the driver locate the exact point."
                  />
                </label>

                <label className="location-display-order">
                  Display Order
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={
                      form.displayOrder
                    }
                    onChange={(event) =>
                      setForm({
                        ...form,
                        displayOrder:
                          event.target.value
                      })
                    }
                  />
                </label>
              </div>

              <div className="location-editor-map-column">
                <LocationEditorMap
                  latitude={
                    form.latitude
                  }
                  longitude={
                    form.longitude
                  }
                  onSelect={
                    setMapPoint
                  }
                />
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setShowModal(false)
                }
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary"
                disabled={
                  saving ||
                  form.latitude ===
                    null ||
                  form.longitude ===
                    null
                }
              >
                {saving
                  ? 'Saving...'
                  : editingLocation
                    ? 'Save Changes'
                    : 'Create Location'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}


function ReasonCodesPage() {
  const [reasonCodes, setReasonCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingReason, setEditingReason] = useState(null);

  const [form, setForm] = useState({
    code: '',
    description: ''
  });

  async function loadReasonCodes() {
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch(
        `${API_BASE}/api/reason-codes`
      );

      if (!response.ok) {
        throw new Error('Unable to load reason codes');
      }

      const data = await response.json();
      setReasonCodes(data.reasonCodes ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load reason codes'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReasonCodes();
  }, []);

  const filteredReasonCodes = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (!term) return reasonCodes;

    return reasonCodes.filter((reason) =>
      [
        reason.code,
        reason.description,
        reason.status
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [reasonCodes, query]);

  const stats = useMemo(() => ({
    active: reasonCodes.filter(
      (reason) => reason.status === 'active'
    ).length,
    inactive: reasonCodes.filter(
      (reason) => reason.status === 'inactive'
    ).length
  }), [reasonCodes]);

  function openCreate() {
    setEditingReason(null);

    setForm({
      code: '',
      description: ''
    });

    setError('');
    setNotice('');
    setShowModal(true);
  }

  function openEdit(reason) {
    setEditingReason(reason);

    setForm({
      code: reason.code,
      description: reason.description
    });

    setError('');
    setNotice('');
    setShowModal(true);
  }

  async function submitReason(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    try {
      const isEditing = Boolean(editingReason);

      const response = await apiFetch(
        isEditing
          ? `${API_BASE}/api/reason-codes/${editingReason.id}`
          : `${API_BASE}/api/reason-codes`,
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            code: form.code,
            description: form.description
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
          `Unable to ${isEditing ? 'update' : 'create'} reason code`
        );
      }

      setShowModal(false);
      setEditingReason(null);

      setForm({
        code: '',
        description: ''
      });

      setNotice(
        isEditing
          ? 'Reason code updated successfully.'
          : 'Reason code created successfully.'
      );

      await loadReasonCodes();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save reason code'
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(reason) {
    const nextStatus =
      reason.status === 'active'
        ? 'inactive'
        : 'active';

    const verb =
      nextStatus === 'inactive'
        ? 'deactivate'
        : 'reactivate';

    if (
      !window.confirm(
        `Are you sure you want to ${verb} ${reason.code}?`
      )
    ) {
      return;
    }

    setError('');
    setNotice('');

    try {
      const response = await apiFetch(
        `${API_BASE}/api/reason-codes/${reason.id}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: nextStatus
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
          'Unable to update reason code status'
        );
      }

      setNotice(
        `${reason.code} is now ${nextStatus}.`
      );

      await loadReasonCodes();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to update reason code'
      );
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Reason Codes</h1>
          <p>
            Control the valid reasons available for UHP-funded transport.
          </p>
        </div>

        <button
          className="primary"
          onClick={openCreate}
        >
          <Plus size={18}/>
          Add Reason Code
        </button>
      </div>

      {notice && (
        <div className="notice success">
          {notice}
        </div>
      )}

      {error && !loading && (
        <div className="notice error">
          {error}
        </div>
      )}

      <div className="stats-grid">
        <Stat
          icon={<Tags/>}
          label="Active Codes"
          value={stats.active}
        />

        <Stat
          icon={<Clock3/>}
          label="Inactive"
          value={stats.inactive}
        />
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search compact">
            <Search size={17}/>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search reason codes..."
            />
          </div>
        </div>

        {loading ? (
          <div className="state-panel">
            Loading reason codes...
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredReasonCodes.map((reason) => (
                  <tr key={reason.id}>
                    <td>
                      <strong>{reason.code}</strong>
                    </td>

                    <td>{reason.description}</td>

                    <td>
                      <span className={`badge ${reason.status}`}>
                        {formatStatus(reason.status)}
                      </span>
                    </td>

                    <td>
                      <div className="row-actions">
                        <button
                          className="text-action"
                          onClick={() => openEdit(reason)}
                        >
                          Edit
                        </button>

                        <button
                          className={
                            reason.status === 'active'
                              ? 'text-action warning'
                              : 'text-action'
                          }
                          onClick={() => changeStatus(reason)}
                        >
                          {reason.status === 'active'
                            ? 'Deactivate'
                            : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredReasonCodes.length === 0 && (
                  <tr>
                    <td colSpan="4">
                      <div className="empty-table">
                        No reason codes match your search.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !saving
            ) {
              setShowModal(false);
            }
          }}
        >
          <form
            className="modal-card modal-card-small"
            onSubmit={submitReason}
          >
            <div className="modal-header">
              <div>
                <h2>
                  {editingReason
                    ? 'Edit Reason Code'
                    : 'Add Reason Code'}
                </h2>

                <p>
                  Only active codes will be offered on new bookings.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() => setShowModal(false)}
                disabled={saving}
              >
                ×
              </button>
            </div>

            <label>
              Reason Code
              <input
                required
                disabled={Boolean(editingReason)}
                value={form.code}
                onChange={(e) =>
                  setForm({
                    ...form,
                    code: e.target.value.toUpperCase()
                  })
                }
              />
            </label>

            <label>
              Description
              <input
                required
                value={form.description}
                onChange={(e) =>
                  setForm({
                    ...form,
                    description: e.target.value
                  })
                }
              />
            </label>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowModal(false)}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary"
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : editingReason
                    ? 'Save Changes'
                    : 'Create Reason Code'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function formatStatus(status) {
  if (!status) return 'Unknown';

  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function Stat({icon, label, value}) {
  return <div className="stat"><div className="stat-icon">{icon}</div><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function Placeholder({role, active}) {
  const isBooking = active === 'Book UHP Transport';

  return (
    <div className="placeholder card">
      <h1>{active}</h1>

      {isBooking ? (
        <>
          <p>
            For authorised UHP-funded transport only.
          </p>
          <p>
            Cash bookings remain outside this portal and continue through the normal Need-A-Cab booking channels.
          </p>
        </>
      ) : (
        <>
          <p>
            This screen is reserved in the MVP shell. Current role: <strong>{role.replaceAll('_',' ')}</strong>.
          </p>
          <p>
            The next implementation step is UHP administration data entry, followed by the UHP account booking workflow.
          </p>
        </>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App/>);
