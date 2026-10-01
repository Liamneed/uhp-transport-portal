import React, { useState } from 'react';
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

const demoUsers = [
  { name: 'Sarah Jones', email: 'sarah.jones@example.nhs.uk', dept: 'Patient Flow', role: 'Budget Holder', budgets: '410023, 410027', status: 'Active' },
  { name: 'Mark Brown', email: 'mark.brown@example.nhs.uk', dept: 'Radiology', role: 'Booker', budgets: '420114', status: 'Active' },
  { name: 'Helen Carter', email: 'helen.carter@example.nhs.uk', dept: 'Finance', role: 'Finance', budgets: 'All', status: 'Invited' },
  { name: 'James White', email: 'james.white@example.nhs.uk', dept: 'Discharge', role: 'Booker', budgets: '410023', status: 'Suspended' }
];

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
  return (
    <>
      <div className="page-heading">
        <div><h1>Users</h1><p>Manage hospital access without exposing complex permission settings.</p></div>
        <button className="primary"><Plus size={18}/> Add User</button>
      </div>

      <div className="stats-grid">
        <Stat icon={<UsersRound/>} label="Active Users" value="48" />
        <Stat icon={<Clock3/>} label="Invited" value="5" />
        <Stat icon={<CheckCircle2/>} label="Budget Holders" value="12" />
        <Stat icon={<AlertTriangle/>} label="Suspended" value="2" />
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search compact"><Search size={17}/><input placeholder="Search users..."/></div>
          <select><option>All departments</option><option>Patient Flow</option><option>Radiology</option></select>
          <select><option>All statuses</option><option>Active</option><option>Invited</option><option>Suspended</option></select>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Department</th><th>Role</th><th>Budget Access</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {demoUsers.map((u) => (
                <tr key={u.email}>
                  <td><strong>{u.name}</strong><small>{u.email}</small></td>
                  <td>{u.dept}</td>
                  <td>{u.role}</td>
                  <td>{u.budgets}</td>
                  <td><span className={`badge ${u.status.toLowerCase()}`}>{u.status}</span></td>
                  <td><button className="icon-btn"><MoreHorizontal size={18}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Stat({icon, label, value}) {
  return <div className="stat"><div className="stat-icon">{icon}</div><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function Placeholder({role, active}) {
  return <div className="placeholder card"><h1>{active}</h1><p>This screen is reserved in the MVP shell. Current role: <strong>{role.replaceAll('_',' ')}</strong>.</p><p>The next implementation step is UHP administration data entry, followed by the Book Transport workflow.</p></div>;
}

createRoot(document.getElementById('root')).render(<App/>);
