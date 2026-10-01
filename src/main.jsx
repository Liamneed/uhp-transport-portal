import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
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
  UsersRound
} from 'lucide-react';
import './styles.css';

const API_BASE =
  'http://localhost:3001';

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
    ['admin-users', 'Users', UserRoundCog],
    ['admin-budgets', 'Budgets', WalletCards],
    ['admin-reasons', 'Reason Codes', Tags],
    ['admin-reports', 'Reports', BarChart3]
  ],

  booker: [
    ['booker-dashboard', 'Dashboard', LayoutDashboard],
    ['book-transport', 'Book UHP Transport', CarFront],
    ['my-bookings', 'My Bookings', CalendarDays]
  ],

  budget_holder: [
    ['holder-dashboard', 'Dashboard', LayoutDashboard],
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
          {active === 'admin-users' ? (
            <UsersPage/>
          ) : active === 'admin-budgets' ? (
            <BudgetsPage/>
          ) : active === 'admin-reasons' ? (
            <ReasonCodesPage/>
          ) : active === 'book-transport' ? (
            <BookTransportPage
              currentUser={currentUser}
            />
          ) : active === 'my-bookings' ? (
            <MyBookingsPage
              currentUser={currentUser}
            />
          ) : active === 'nac-control' ? (
            <NacControlPage/>
          ) : active === 'nac-bookings' ? (
            <NacBookingsPage/>
          ) : active === 'nac-exceptions' ? (
            <NacBookingsPage
              exceptionsOnly
            />
          ) : (
            <Placeholder
              role="authenticated"
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
        apiFetch('http://localhost:3001/api/users'),
        apiFetch('http://localhost:3001/api/departments'),
        apiFetch('http://localhost:3001/api/budgets'),
        apiFetch('http://localhost:3001/api/roles')
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
        'http://localhost:3001/api/users',
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
        `http://localhost:3001/api/users/${user.id}/status`,
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
    booked: 'Booked',
    confirmed: 'Confirmed',
    driver_allocated: 'Driver Allocated',
    driver_en_route: 'Driver En Route',
    driver_arrived: 'Driver Arrived',
    passenger_on_board: 'Passenger On Board',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No Show',
    failed: 'Failed',
    requires_review: 'Requires Review'
  };

  return map[status] || formatStatus(status);
}

function formatBookingDateTime(value) {
  if (!value) return '—';

  return value
    .replace('T', ' ')
    .slice(0, 16);
}

function NacControlPage() {
  const [summary, setSummary] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadControl() {
    setLoading(true);
    setError('');

    try {
      const [summaryResponse, bookingsResponse] =
        await Promise.all([
          apiFetch(
            'http://localhost:3001/api/control/summary'
          ),
          apiFetch(
            'http://localhost:3001/api/control/bookings'
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

  const upcoming = useMemo(
    () =>
      bookings
        .filter(
          (booking) =>
            ![
              'completed',
              'cancelled',
              'no_show'
            ].includes(
              booking.operationalStatus
            )
        )
        .sort(
          (a, b) =>
            new Date(a.requestedPickupAt) -
            new Date(b.requestedPickupAt)
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
              <h2>Upcoming Requests</h2>

              <p>
                Next UHP journeys requiring
                operational visibility.
              </p>
            </div>
          </div>

          {upcoming.length === 0 ? (
            <div className="empty-bookings compact-empty">
              <CalendarDays size={28}/>

              <strong>
                No upcoming requests
              </strong>

              <span>
                New portal bookings will
                appear here.
              </span>
            </div>
          ) : (
            <div className="control-booking-list">
              {upcoming.map((booking) => (
                <div
                  className="control-booking-item"
                  key={booking.id}
                >
                  <div className="control-time">
                    <strong>
                      {formatBookingDateTime(
                        booking.requestedPickupAt
                      )}
                    </strong>

                    <small>
                      {booking.publicReference}
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
            Autocab dispatch integration is
            not yet enabled. Portal requests
            remain local until that integration
            is switched on.
          </div>
        </aside>
      </div>
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
  const [dateFilter, setDateFilter] =
    useState('');

  const [expandedId, setExpandedId] =
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
          'http://localhost:3001/api/control/bookings'
        ),
        apiFetch(
          'http://localhost:3001/api/departments'
        ),
        apiFetch(
          'http://localhost:3001/api/budgets'
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
        booking.operationalStatus !==
          statusFilter
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

      if (
        dateFilter &&
        String(
          booking.requestedPickupAt || ''
        ).slice(0, 10) !== dateFilter
      ) {
        return false;
      }

      if (!term) return true;

      return [
        booking.publicReference,
        booking.autocabReference,
        booking.passengerName,
        booking.passengerMobile,
        booking.pickupAddress,
        booking.destinationAddress,
        booking.budgetNumber,
        booking.budgetName,
        booking.reasonCode,
        booking.reasonDescription,
        booking.budgetHolder,
        booking.createdBy,
        booking.department
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [
    bookings,
    exceptionsOnly,
    query,
    statusFilter,
    departmentFilter,
    budgetFilter,
    dateFilter
  ]);

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

      <div className="card nac-bookings-card">
        <div className="nac-filter-grid">
          <div className="search compact">
            <Search size={17}/>

            <input
              value={query}
              onChange={(e) =>
                setQuery(e.target.value)
              }
              placeholder="Search passenger, reference, journey..."
            />
          </div>

          <input
            type="date"
            value={dateFilter}
            onChange={(e) =>
              setDateFilter(e.target.value)
            }
          />

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value)
            }
          >
            <option value="all">
              All statuses
            </option>

            <option value="draft">
              Request Recorded
            </option>

            <option value="submitting">
              Sending to Dispatch
            </option>

            <option value="booked">
              Booked
            </option>

            <option value="confirmed">
              Confirmed
            </option>

            <option value="driver_allocated">
              Driver Allocated
            </option>

            <option value="completed">
              Completed
            </option>

            <option value="cancelled">
              Cancelled
            </option>

            <option value="failed">
              Failed
            </option>

            <option value="requires_review">
              Requires Review
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
            <table className="bookings-table nac-bookings-table">
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Reference</th>
                  <th>Passenger</th>
                  <th>Journey</th>
                  <th>Department</th>
                  <th>Budget</th>
                  <th>Status</th>
                  <th/>
                </tr>
              </thead>

              <tbody>
                {filteredBookings.map(
                  (booking) => {
                    const isExpanded =
                      expandedId === booking.id;

                    return (
                      <React.Fragment
                        key={booking.id}
                      >
                        <tr
                          className={
                            booking.hasException
                              ? 'exception-row'
                              : ''
                          }
                        >
                          <td>
                            <strong>
                              {formatBookingDateTime(
                                booking.requestedPickupAt
                              )}
                            </strong>

                            <small>
                              Created {booking.createdAt}
                            </small>
                          </td>

                          <td>
                            <strong>
                              {booking.publicReference}
                            </strong>

                            <small>
                              {booking.autocabReference
                                ? `Autocab ${booking.autocabReference}`
                                : 'Not sent to Autocab'}
                            </small>
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
                              Booked by {booking.createdBy}
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

                            {booking.hasException && (
                              <span className="exception-chip table-exception">
                                Attention
                              </span>
                            )}
                          </td>

                          <td>
                            <button
                              type="button"
                              className="text-action"
                              onClick={() =>
                                setExpandedId(
                                  isExpanded
                                    ? null
                                    : booking.id
                                )
                              }
                            >
                              {isExpanded
                                ? 'Hide'
                                : 'Details'}
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="booking-detail-row">
                            <td colSpan="8">
                              <div className="booking-detail-panel">
                                <div className="booking-detail-grid nac-detail-grid">
                                  <div>
                                    <small>
                                      Passenger Count
                                    </small>

                                    <strong>
                                      {booking.passengerCount}
                                    </strong>
                                  </div>

                                  <div>
                                    <small>
                                      Budget Holder
                                    </small>

                                    <strong>
                                      {booking.budgetHolder}
                                    </strong>
                                  </div>

                                  <div>
                                    <small>
                                      Reason
                                    </small>

                                    <strong>
                                      {booking.reasonCode}
                                      {' · '}
                                      {booking.reasonDescription}
                                    </strong>
                                  </div>

                                  <div>
                                    <small>
                                      Financial Status
                                    </small>

                                    <strong>
                                      {formatStatus(
                                        booking.financialStatus
                                      )}
                                    </strong>
                                  </div>

                                  <div>
                                    <small>
                                      Portal Source
                                    </small>

                                    <strong>
                                      {formatStatus(
                                        booking.source
                                      )}
                                    </strong>
                                  </div>

                                  <div>
                                    <small>
                                      Last Updated
                                    </small>

                                    <strong>
                                      {booking.updatedAt}
                                    </strong>
                                  </div>

                                  <div>
                                    <small>
                                      Driver Notes
                                    </small>

                                    <strong>
                                      {booking.driverNotes || '—'}
                                    </strong>
                                  </div>

                                  <div>
                                    <small>
                                      Internal Notes
                                    </small>

                                    <strong>
                                      {booking.internalNotes || '—'}
                                    </strong>
                                  </div>
                                </div>

                                {booking.hasException && (
                                  <div className="exception-panel">
                                    <strong>
                                      Attention Required
                                    </strong>

                                    {booking.exceptionReasons.map(
                                      (reason) => (
                                        <span key={reason}>
                                          {reason}
                                        </span>
                                      )
                                    )}
                                  </div>
                                )}

                                <div className="nac-detail-columns">
                                  <div className="booking-route-detail">
                                    <h4>Journey</h4>

                                    {booking.stops?.map(
                                      (stop) => (
                                        <div
                                          className="detail-stop"
                                          key={
                                            `${booking.id}-${stop.sequenceNumber}`
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
                                                  : `Via ${stop.sequenceNumber}`}
                                            </small>

                                            <strong>
                                              {stop.address}
                                            </strong>

                                            {stop.postcode && (
                                              <span>
                                                {stop.postcode}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    )}
                                  </div>

                                  <div className="booking-history-panel">
                                    <h4>History</h4>

                                    {booking.events?.length ? (
                                      booking.events.map(
                                        (event) => (
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
                                        )
                                      )
                                    ) : (
                                      <span className="history-empty">
                                        No recorded events.
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function MyBookingsPage({ currentUser }) {
  const bookingUserId = currentUser.id;

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  const [editingBooking, setEditingBooking] = useState(null);
  const [editOptions, setEditOptions] = useState({
    budgets: [],
    reasonCodes: []
  });
  const [editForm, setEditForm] = useState(null);
  const [editVias, setEditVias] = useState([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const [cancelBooking, setCancelBooking] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  async function loadBookings() {
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch(
        `http://localhost:3001/api/my-bookings?userId=${bookingUserId}`
      );

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
  }, []);

  const filteredBookings = useMemo(() => {
    const term = query.trim().toLowerCase();

    return bookings.filter((booking) => {
      const matchesStatus =
        statusFilter === 'all' ||
        booking.operationalStatus === statusFilter;

      const matchesQuery =
        !term ||
        [
          booking.publicReference,
          booking.passengerName,
          booking.pickupAddress,
          booking.destinationAddress,
          booking.budgetNumber,
          booking.reasonCode,
          booking.reasonDescription
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(term);

      return matchesStatus && matchesQuery;
    });
  }, [bookings, query, statusFilter]);

  const stats = useMemo(() => ({
    total: bookings.length,
    draft: bookings.filter(
      (booking) =>
        booking.operationalStatus === 'draft'
    ).length,
    booked: bookings.filter(
      (booking) =>
        booking.operationalStatus === 'booked' ||
        booking.operationalStatus === 'confirmed'
    ).length,
    completed: bookings.filter(
      (booking) =>
        booking.operationalStatus === 'completed'
    ).length
  }), [bookings]);

  function formatPickup(value) {
    if (!value) return '—';

    return value
      .replace('T', ' ')
      .slice(0, 16);
  }

  function friendlyBookingStatus(status) {
    const map = {
      draft: 'Request Recorded',
      submitting: 'Sending to Dispatch',
      booked: 'Booked',
      confirmed: 'Confirmed',
      driver_allocated: 'Driver Allocated',
      driver_en_route: 'Driver En Route',
      driver_arrived: 'Driver Arrived',
      passenger_on_board: 'Passenger On Board',
      completed: 'Completed',
      cancelled: 'Cancelled',
      no_show: 'No Show',
      failed: 'Needs Attention',
      requires_review: 'Needs Review'
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
            `http://localhost:3001/api/bookings/${bookingId}?userId=${bookingUserId}`
          ),
          apiFetch(
            `http://localhost:3001/api/booking-options?userId=${bookingUserId}`
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

      if (booking.operationalStatus !== 'draft') {
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

      setEditVias(vias);
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
        postcode: ''
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
  }

  async function submitAmendment(event) {
    event.preventDefault();

    if (!editingBooking || !editForm) return;

    setSavingEdit(true);
    setError('');
    setNotice('');

    try {
      const response = await apiFetch(
        `http://localhost:3001/api/bookings/${editingBooking.id}`,
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
                editForm.pickupPostcode
            },

            vias: editVias
              .filter(
                (via) => via.address.trim()
              )
              .map((via) => ({
                address: via.address,
                postcode: via.postcode
              })),

            destination: {
              address:
                editForm.destinationAddress,
              postcode:
                editForm.destinationPostcode
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
        `${data.booking.publicReference} has been amended successfully.`
      );

      setExpandedId(data.booking.id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to amend booking'
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
        `http://localhost:3001/api/bookings/${cancelBooking.id}/cancel`,
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
        `${data.booking.publicReference} has been cancelled.`
      );

      setExpandedId(data.booking.id);
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
          <h1>My Bookings</h1>

          <p>
            View and manage UHP transport requests
            you have created.
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

      <div className="stats-grid">
        <Stat
          icon={<CalendarDays/>}
          label="Total"
          value={stats.total}
        />

        <Stat
          icon={<Clock3/>}
          label="Request Recorded"
          value={stats.draft}
        />

        <Stat
          icon={<CheckCircle2/>}
          label="Booked / Confirmed"
          value={stats.booked}
        />

        <Stat
          icon={<UsersRound/>}
          label="Completed"
          value={stats.completed}
        />
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
              placeholder="Search bookings..."
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value)
            }
          >
            <option value="all">
              All statuses
            </option>

            <option value="draft">
              Request Recorded
            </option>

            <option value="booked">
              Booked
            </option>

            <option value="confirmed">
              Confirmed
            </option>

            <option value="completed">
              Completed
            </option>

            <option value="cancelled">
              Cancelled
            </option>
          </select>
        </div>

        {filteredBookings.length === 0 ? (
          <div className="empty-bookings">
            <CalendarDays size={30}/>

            <strong>No bookings found</strong>

            <span>
              New UHP transport requests
              will appear here.
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="bookings-table">
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Reference</th>
                  <th>Passenger</th>
                  <th>Journey</th>
                  <th>Budget</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th/>
                </tr>
              </thead>

              <tbody>
                {filteredBookings.map(
                  (booking) => {
                    const isExpanded =
                      expandedId === booking.id;

                    const viaStops =
                      booking.stops?.filter(
                        (stop) =>
                          stop.stopType === 'via'
                      ) ?? [];

                    const canManage =
                      booking.operationalStatus ===
                      'draft';

                    return (
                      <React.Fragment
                        key={booking.id}
                      >
                        <tr>
                          <td>
                            <strong>
                              {formatPickup(
                                booking.requestedPickupAt
                              )}
                            </strong>

                            <small>
                              Created {booking.createdAt}
                            </small>
                          </td>

                          <td>
                            <strong>
                              {booking.publicReference}
                            </strong>
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
                          </td>

                          <td>
                            <button
                              type="button"
                              className="text-action"
                              onClick={() =>
                                setExpandedId(
                                  isExpanded
                                    ? null
                                    : booking.id
                                )
                              }
                            >
                              {isExpanded
                                ? 'Hide'
                                : 'Details'}
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="booking-detail-row">
                            <td colSpan="8">
                              <div className="booking-detail-panel">
                                <div className="booking-detail-grid">
                                  <div>
                                    <small>
                                      Passenger Count
                                    </small>

                                    <strong>
                                      {booking.passengerCount}
                                    </strong>
                                  </div>

                                  <div>
                                    <small>
                                      Budget Holder
                                    </small>

                                    <strong>
                                      {booking.budgetHolder}
                                    </strong>
                                  </div>

                                  <div>
                                    <small>
                                      Financial Status
                                    </small>

                                    <strong>
                                      {formatStatus(
                                        booking.financialStatus
                                      )}
                                    </strong>
                                  </div>

                                  <div>
                                    <small>
                                      Driver Notes
                                    </small>

                                    <strong>
                                      {booking.driverNotes || '—'}
                                    </strong>
                                  </div>
                                </div>

                                <div className="booking-route-detail">
                                  <h4>Journey</h4>

                                  {booking.stops?.map(
                                    (stop) => (
                                      <div
                                        className="detail-stop"
                                        key={
                                          `${booking.id}-${stop.sequenceNumber}`
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
                                                : `Via ${stop.sequenceNumber}`}
                                          </small>

                                          <strong>
                                            {stop.address}
                                          </strong>

                                          {stop.postcode && (
                                            <span>
                                              {stop.postcode}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  )}

                                  {viaStops.length === 0 && (
                                    <small className="no-vias">
                                      Direct journey — no vias.
                                    </small>
                                  )}
                                </div>

                                {canManage && (
                                  <div className="booking-actions">
                                    <button
                                      type="button"
                                      className="secondary"
                                      onClick={() =>
                                        openAmend(
                                          booking.id
                                        )
                                      }
                                    >
                                      Amend Booking
                                    </button>

                                    <button
                                      type="button"
                                      className="danger-button"
                                      onClick={() =>
                                        openCancel(
                                          booking
                                        )
                                      }
                                    >
                                      Cancel Booking
                                    </button>
                                  </div>
                                )}

                                {!canManage &&
                                  booking.operationalStatus === 'cancelled' && (
                                    <div className="managed-booking-note">
                                      This booking has been cancelled
                                      and can no longer be amended.
                                    </div>
                                  )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingBooking && editForm && (
        <div className="modal-backdrop">
          <div className="modal-card booking-edit-modal">
            <div className="modal-header">
              <div>
                <h2>Amend Booking</h2>

                <p>
                  {editingBooking.publicReference}
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

            <form onSubmit={submitAmendment}>
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
                  <input
                    required
                    value={editForm.pickupAddress}
                    onChange={(e) =>
                      updateEditForm(
                        'pickupAddress',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Pickup Postcode
                  <input
                    value={editForm.pickupPostcode}
                    onChange={(e) =>
                      updateEditForm(
                        'pickupPostcode',
                        e.target.value.toUpperCase()
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
                      <input
                        value={via.address}
                        onChange={(e) =>
                          updateEditVia(
                            index,
                            'address',
                            e.target.value
                          )
                        }
                      />
                    </label>

                    <label>
                      Postcode
                      <input
                        value={via.postcode}
                        onChange={(e) =>
                          updateEditVia(
                            index,
                            'postcode',
                            e.target.value.toUpperCase()
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
                  <input
                    required
                    value={editForm.destinationAddress}
                    onChange={(e) =>
                      updateEditForm(
                        'destinationAddress',
                        e.target.value
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
                      updateEditForm(
                        'destinationPostcode',
                        e.target.value.toUpperCase()
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
                  {savingEdit
                    ? 'Saving Changes...'
                    : 'Save Changes'}
                </button>
              </div>
            </form>
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
                  {cancelBooking.publicReference}
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
                This will cancel the UHP transport
                request. The booking will remain in
                the audit history.
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

function BookTransportPage({ currentUser }) {
  const bookingUserId = currentUser.id;

  const initialForm = {
    pickupDate: '',
    pickupTime: '',
    pickupAddress: '',
    pickupPostcode: '',
    destinationAddress: '',
    destinationPostcode: '',
    passengerName: '',
    passengerMobile: '',
    passengerCount: 1,
    budgetId: '',
    reasonCodeId: '',
    driverNotes: ''
  };

  const [form, setForm] = useState(initialForm);
  const [vias, setVias] = useState([]);

  const [bookingUser, setBookingUser] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [reasonCodes, setReasonCodes] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    loadBookingOptions();
  }, []);

  async function loadBookingOptions() {
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch(
        `http://localhost:3001/api/booking-options?userId=${bookingUserId}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || 'Unable to load booking options'
        );
      }

      setBookingUser(data.user ?? null);
      setBudgets(data.budgets ?? []);
      setReasonCodes(data.reasonCodes ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load booking options'
      );
    } finally {
      setLoading(false);
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
        postcode: ''
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
    setForm(initialForm);
    setVias([]);
    setConfirmation(null);
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

      const response = await apiFetch(
        'http://localhost:3001/api/bookings',
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
              address: form.pickupAddress,
              postcode: form.pickupPostcode
            },

            vias: vias
              .filter((via) => via.address.trim())
              .map((via) => ({
                address: via.address,
                postcode: via.postcode
              })),

            destination: {
              address: form.destinationAddress,
              postcode: form.destinationPostcode
            },

            driverNotes: form.driverNotes,

            budgetId: Number(form.budgetId),
            reasonCodeId: Number(form.reasonCodeId),
            createdByUserId: bookingUserId
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || 'Unable to create booking'
        );
      }

      setConfirmation(result.booking);
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

        <h1>Transport request created</h1>

        <p className="confirmation-lead">
          The UHP transport request has been recorded successfully.
        </p>

        <div className="confirmation-reference">
          <small>UHP Reference</small>
          <strong>{confirmation.publicReference}</strong>
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
          This request is currently stored in the UHP Transport Portal.
          Autocab dispatch integration has not yet been enabled.
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

      <form
        className="booking-layout"
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
                  <input
                    required
                    placeholder="Enter pickup address"
                    value={form.pickupAddress}
                    onChange={(e) =>
                      updateForm(
                        'pickupAddress',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label className="postcode-field">
                  Postcode
                  <input
                    placeholder="Optional"
                    value={form.pickupPostcode}
                    onChange={(e) =>
                      updateForm(
                        'pickupPostcode',
                        e.target.value.toUpperCase()
                      )
                    }
                  />
                </label>
              </div>
            </div>

            {vias.map((via, index) => (
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
                    <input
                      placeholder="Enter via address"
                      value={via.address}
                      onChange={(e) =>
                        updateVia(
                          index,
                          'address',
                          e.target.value
                        )
                      }
                    />
                  </label>

                  <label className="postcode-field">
                    Postcode
                    <input
                      placeholder="Optional"
                      value={via.postcode}
                      onChange={(e) =>
                        updateVia(
                          index,
                          'postcode',
                          e.target.value.toUpperCase()
                        )
                      }
                    />
                  </label>

                  <button
                    type="button"
                    className="remove-stop"
                    onClick={() => removeVia(index)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="add-via"
              onClick={addVia}
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
                  <input
                    required
                    placeholder="Enter destination address"
                    value={form.destinationAddress}
                    onChange={(e) =>
                      updateForm(
                        'destinationAddress',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label className="postcode-field">
                  Postcode
                  <input
                    placeholder="Optional"
                    value={form.destinationPostcode}
                    onChange={(e) =>
                      updateForm(
                        'destinationPostcode',
                        e.target.value.toUpperCase()
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

            <button
              type="submit"
              className="primary booking-submit"
              disabled={
                saving ||
                budgets.length === 0
              }
            >
              {saving
                ? 'Creating Request...'
                : 'Create Transport Request'}
            </button>
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
        apiFetch('http://localhost:3001/api/budgets'),
        apiFetch('http://localhost:3001/api/departments'),
        apiFetch('http://localhost:3001/api/users')
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
        ? `http://localhost:3001/api/budgets/${editingBudget.id}`
        : 'http://localhost:3001/api/budgets';

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
        `http://localhost:3001/api/budgets/${budget.id}/status`,
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
        'http://localhost:3001/api/reason-codes'
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
          ? `http://localhost:3001/api/reason-codes/${editingReason.id}`
          : 'http://localhost:3001/api/reason-codes',
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
        `http://localhost:3001/api/reason-codes/${reason.id}/status`,
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
