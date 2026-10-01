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

const roleNav = {
  uhp_admin: [
    ['Dashboard', LayoutDashboard],
    ['Users', UserRoundCog],
    ['Budgets', WalletCards],
    ['Reason Codes', Tags],
    ['Reports', BarChart3]
  ],
  booker: [
    ['Dashboard', LayoutDashboard],
    ['Book UHP Transport', CarFront],
    ['My Bookings', CalendarDays]
  ],
  budget_holder: [
    ['Dashboard', LayoutDashboard],
    ['Bookings', CalendarDays],
    ['Invoices', WalletCards],
    ['Reports', BarChart3]
  ],
  nac: [
    ['Control', LayoutDashboard],
    ['Bookings', CalendarDays],
    ['Exceptions', AlertTriangle],
    ['Christmas', CarFront]
  ]
};

function App() {
  const [role, setRole] = useState('uhp_admin');
  const [active, setActive] = useState('Users');
  const nav = roleNav[role];

  const switchRole = (nextRole) => {
    setRole(nextRole);
    setActive(roleNav[nextRole][0][0]);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><strong>UHP</strong><span>Transport Portal</span></div>
        <div className="role-switch">
          <label>Preview role</label>
          <select value={role} onChange={(e) => switchRole(e.target.value)}>
            <option value="uhp_admin">UHP Admin</option>
            <option value="booker">Booker</option>
            <option value="budget_holder">Budget Holder</option>
            <option value="nac">Need-A-Cab</option>
          </select>
        </div>
        <nav>
          {nav.map(([label, Icon]) => (
            <button key={label} className={active === label ? 'nav-item active' : 'nav-item'} onClick={() => setActive(label)}>
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="search"><Search size={18}/><input placeholder="Search users, budgets, bookings..." /></div>
          <div className="top-actions"><Bell size={20}/><div className="avatar">UA</div><div><strong>UHP Admin</strong><small>Hospital Administration</small></div></div>
        </header>

        <section className="content">
          {role === 'uhp_admin' && active === 'Users' ? <UsersPage/> : <Placeholder role={role} active={active}/>}
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
        fetch('http://localhost:3001/api/users'),
        fetch('http://localhost:3001/api/departments'),
        fetch('http://localhost:3001/api/budgets'),
        fetch('http://localhost:3001/api/roles')
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
      const response = await fetch(
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
      const response = await fetch(
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
