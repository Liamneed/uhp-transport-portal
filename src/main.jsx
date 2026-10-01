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
    ['Book Transport', CarFront],
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
  const [query, setQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const [usersResponse, departmentsResponse] = await Promise.all([
          fetch('http://localhost:3001/api/users'),
          fetch('http://localhost:3001/api/departments')
        ]);

        if (!usersResponse.ok || !departmentsResponse.ok) {
          throw new Error('Unable to load administration data');
        }

        const usersData = await usersResponse.json();
        const departmentsData = await departmentsResponse.json();

        if (!cancelled) {
          setUsers(usersData.users ?? []);
          setDepartments(departmentsData.departments ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load users'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
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

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Users</h1>
          <p>Manage hospital access without exposing complex permission settings.</p>
        </div>
        <button className="primary">
          <Plus size={18}/>
          Add User
        </button>
      </div>

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

        {!loading && error && (
          <div className="state-panel error">
            <strong>Unable to load users.</strong>
            <span>{error}</span>
            <small>Make sure the local API is running with npm run dev:api.</small>
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.firstName} {user.lastName}</strong>
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
                      <button className="icon-btn" aria-label={`Actions for ${user.firstName} ${user.lastName}`}>
                        <MoreHorizontal size={18}/>
                      </button>
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
  return <div className="placeholder card"><h1>{active}</h1><p>This screen is reserved in the MVP shell. Current role: <strong>{role.replaceAll('_',' ')}</strong>.</p><p>The next implementation step is UHP administration data entry, followed by the Book Transport workflow.</p></div>;
}

createRoot(document.getElementById('root')).render(<App/>);
