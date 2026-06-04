import { NavLink } from 'react-router-dom';
import logo from '../../assets/LOGO.png';
import {
  canUseSupervisorConsole,
  isStaff,
  normalizeRole,
  ROLE_LABELS,
  staffPanelLabel,
} from '../../utils/roles.js';

export default function AppSidebar({ user, collapsed, open, onToggleCollapse }) {
  const role = normalizeRole(user?.role);
  const roleLabel = ROLE_LABELS[role] || role;
  const staff = isStaff(user);
  const supervisorConsole = canUseSupervisorConsole(user);
  const panelLabel = staffPanelLabel(user);

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${open ? 'open' : ''}`}>
      <div className="sb-logo">
        <img src={logo} alt="Logo" />
        <div>
          <div className="sb-logo-name">SmokeDet System</div>
          <div className="sb-logo-sub sb-logo-sub--role">
            <span className="sb-user-name">{user?.name || 'User'}</span>
            <span className={`role-pill role-pill--${role}`}>{roleLabel}</span>
          </div>
        </div>
        <button
          type="button"
          className="sb-collapse-btn"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <i className={`fa-solid ${collapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`}></i>
        </button>
      </div>
      <nav className="sb-nav">
        <div className="sb-section">Main</div>
        <NavLink className="sb-item" to="/" end>
          <i className="fa-solid fa-gauge-high"></i>
          <span className="sb-label">Dashboard</span>
        </NavLink>
        <NavLink className="sb-item" to="/analytics">
          <i className="fa-solid fa-chart-pie"></i>
          <span className="sb-label">Analytics</span>
        </NavLink>
        {staff && (
          <NavLink className="sb-item" to="/admin">
            <i className="fa-solid fa-user-shield"></i>
            <span className="sb-label">{panelLabel}</span>
          </NavLink>
        )}
        {supervisorConsole && (
          <NavLink className="sb-item" to="/supervisor">
            <i className="fa-solid fa-crown"></i>
            <span className="sb-label">Supervisor Console</span>
          </NavLink>
        )}
        <div className="sb-section">Account</div>
        <NavLink className="sb-item" to="/profile">
          <i className="fa-solid fa-circle-user"></i>
          <span className="sb-label">Profile</span>
        </NavLink>
        <NavLink className="sb-item" to="/settings">
          <i className="fa-solid fa-sliders"></i>
          <span className="sb-label">Settings</span>
        </NavLink>
        <div className="sb-section">System</div>
        <NavLink className="sb-item" to="/logout">
          <i className="fa-solid fa-right-from-bracket"></i>
          <span className="sb-label">Logout</span>
        </NavLink>
      </nav>
    </aside>
  );
}
