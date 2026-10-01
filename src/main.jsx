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
          {role === 'uhp_admin' && active === 'Users' ? (
            <UsersPage/>
          ) : role === 'uhp_admin' && active === 'Budgets' ? (
            <BudgetsPage/>
          ) : role === 'uhp_admin' && active === 'Reason Codes' ? (
            <ReasonCodesPage/>
          ) : (
            <Placeholder role={role} active={active}/>
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
        fetch('http://localhost:3001/api/budgets'),
        fetch('http://localhost:3001/api/departments'),
        fetch('http://localhost:3001/api/users')
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

      const response = await fetch(url, {
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
      const response = await fetch(
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
      const response = await fetch(
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

      const response = await fetch(
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
      const response = await fetch(
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
