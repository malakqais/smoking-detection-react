import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import logo from '../assets/LOGO.png';

const ADMIN_DOMAIN = '@smoker.jr';

const avatarColor = (role) => role === 'admin'
  ? 'linear-gradient(135deg,#ef4444,#f97316)'
  : 'linear-gradient(135deg,#3b82f6,#8b5cf6)';

const initials = (name = '') =>
  name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

const fmtDate = (str) => {
  if (!str) return '—';
  const d = new Date(str);
  return isNaN(d) ? str : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const Admin = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [user] = useState(() => JSON.parse(localStorage.getItem('user') || '{"name":"Admin","role":"admin","email":"admin@smoker.jr"}'));
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [toast, setToast] = useState({ show: false, msg: '', ok: true });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const fetchUsers = async () => {
    setFetchError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      } else {
        setFetchError(`Server returned ${res.status}: ${res.statusText}`);
      }
    } catch (e) {
      setFetchError('Cannot reach backend — make sure the Flask server is running on port 5000.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const showToast = (msg, ok = true) => {
    setToast({ show: true, msg, ok });
    setTimeout(() => setToast({ show: false, msg: '', ok: true }), 3000);
  };

  const handleDelete = async (u) => {
    try {
      const res = await fetch('/api/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id }),
      });
      if (res.ok) { fetchUsers(); showToast(`${u.name} deleted`); }
      else showToast('Delete failed', false);
    } catch { showToast('Network error', false); }
    setConfirmDelete(null);
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchQ = !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || String(u.id).includes(q);
    const matchR = roleFilter === 'all' || u.role === roleFilter;
    return matchQ && matchR;
  });

  const admins = users.filter(u => u.role === 'admin').length;
  const regular = users.filter(u => u.role === 'user').length;
  const totalViolations = users.reduce((s, u) => s + (u.violation_count || 0), 0);
  const mostOffender = users.reduce((a, b) => (b.violation_count || 0) > (a.violation_count || 0) ? b : a, users[0] || {});
  const isDark = theme === 'dark';

  return (
    <div className="layout">
      <div className={`sb-overlay ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)}></div>

      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${sidebarOpen ? 'open' : ''}`}>
        <div className="sb-logo">
          <img src={logo} alt="Logo" />
          <div>
            <div className="sb-logo-name">SmokeDet System</div>
            <div className="sb-logo-sub">{user.name} ({user.role})</div>
          </div>
          <button className="sb-collapse-btn" onClick={() => { const s = !sidebarCollapsed; setSidebarCollapsed(s); localStorage.setItem('sidebarCollapsed', s); }}>
            <i className={`fa-solid ${sidebarCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`}></i>
          </button>
        </div>
        <nav className="sb-nav">
          <div className="sb-section">Main</div>
          <NavLink className="sb-item" to="/"><i className="fa-solid fa-gauge-high"></i><span className="sb-label">Dashboard</span></NavLink>
          <NavLink className="sb-item" to="/analytics"><i className="fa-solid fa-chart-pie"></i><span className="sb-label">Analytics</span></NavLink>
          <NavLink className="sb-item" to="/admin"><i className="fa-solid fa-user-shield"></i><span className="sb-label">Admin Panel</span></NavLink>
          <div className="sb-section">Account</div>
          <NavLink className="sb-item" to="/profile"><i className="fa-solid fa-circle-user"></i><span className="sb-label">Profile</span></NavLink>
          <NavLink className="sb-item" to="/settings"><i className="fa-solid fa-sliders"></i><span className="sb-label">Settings</span></NavLink>
          <div className="sb-section">System</div>
          <NavLink className="sb-item" to="/logout"><i className="fa-solid fa-right-from-bracket"></i><span className="sb-label">Logout</span></NavLink>
        </nav>
      </aside>

      <main className="main">
        <header className="top-bar">
          <div className="tb-left">
            <div className="ib d-lg-none" onClick={() => setSidebarOpen(true)}><i className="fa-solid fa-bars"></i></div>
            <div>
              <div className="pg-title">Admin Panel</div>
              <div className="pg-sub">User management &amp; access control</div>
            </div>
          </div>
          <div className="tb-right">
            <div className="ib" onClick={() => setTheme(isDark ? 'light' : 'dark')} title="Toggle theme">
              {isDark ? <i className="fa-solid fa-moon"></i> : <i className="fa-solid fa-sun" style={{ color: 'var(--amber)' }}></i>}
            </div>
            <button className="btn-ghost btn-sm" onClick={fetchUsers}>
              <i className="fa-solid fa-rotate-right me-1"></i>Refresh
            </button>
          </div>
        </header>

        <div className="content fade-in">

          {/* Stat Cards */}
          <div className="admin-stats-row mb-4">
            <div className="admin-stat-card">
              <div className="admin-stat-icon" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--blue)' }}>
                <i className="fa-solid fa-users"></i>
              </div>
              <div>
                <div className="admin-stat-val">{users.length}</div>
                <div className="admin-stat-label">Total Users</div>
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-icon" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--red)' }}>
                <i className="fa-solid fa-user-shield"></i>
              </div>
              <div>
                <div className="admin-stat-val">{admins}</div>
                <div className="admin-stat-label">Administrators</div>
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-icon" style={{ background: 'rgba(139,92,246,0.12)', color: 'var(--purple)' }}>
                <i className="fa-solid fa-circle-user"></i>
              </div>
              <div>
                <div className="admin-stat-val">{regular}</div>
                <div className="admin-stat-label">Regular Users</div>
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-icon" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--red)' }}>
                <i className="fa-solid fa-triangle-exclamation"></i>
              </div>
              <div>
                <div className="admin-stat-val">{totalViolations}</div>
                <div className="admin-stat-label">Total Violations</div>
              </div>
            </div>
          </div>

          {/* Top Offender Alert */}
          {mostOffender?.violation_count > 0 && (
            <div className="admin-top-offender mb-4">
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: avatarColor(mostOffender.role), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {initials(mostOffender.name)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--red)', marginBottom: 3 }}>
                  <i className="fa-solid fa-ranking-star me-1"></i>Top Offender
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--tx1)' }}>{mostOffender.name}</div>
                <div style={{ fontSize: 12, color: 'var(--tx3)' }}>{mostOffender.email}</div>
              </div>
              <div style={{ textAlign: 'center', padding: '8px 20px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--red)', lineHeight: 1 }}>{mostOffender.violation_count}</div>
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 3 }}>violations</div>
              </div>
              {mostOffender.top_location && (
                <div style={{ textAlign: 'center', padding: '8px 20px', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx1)' }}>{mostOffender.top_location}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 3 }}>top location</div>
                </div>
              )}
              <button
                className="btn-ghost btn-sm"
                onClick={() => { const a = document.createElement('a'); a.href = `/api/users/${mostOffender.id}/report`; a.download = ''; a.click(); }}
              >
                <i className="fa-solid fa-file-arrow-down me-1"></i>Export Report
              </button>
            </div>
          )}

          {/* User Table Card */}
          <div className="c">
            <div className="c-head">
              <div>
                <div className="c-title"><i className="fa-solid fa-users-gear me-2" style={{ color: 'var(--red)' }}></i>Registered Users</div>
                <div className="c-sub">{filtered.length} of {users.length} users shown</div>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Role filter */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  {['all', 'admin', 'user'].map(r => (
                    <button
                      key={r}
                      onClick={() => setRoleFilter(r)}
                      style={{
                        padding: '5px 12px', borderRadius: '8px', border: '1px solid var(--border)',
                        background: roleFilter === r ? 'var(--red)' : 'transparent',
                        color: roleFilter === r ? '#fff' : 'var(--tx2)',
                        fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'var(--tr)',
                        fontFamily: 'inherit',
                      }}
                    >
                      {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>
                {/* Search */}
                <div className="input-icon-wrap" style={{ width: '200px', margin: 0 }}>
                  <i className="fa-solid fa-magnifying-glass" style={{ fontSize: '13px' }}></i>
                  <input
                    type="text"
                    className="finput"
                    placeholder="Search users…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ padding: '7px 12px 7px 34px', fontSize: '13px' }}
                  />
                </div>
              </div>
            </div>

            <div className="c-body" style={{ padding: 0 }}>
              {loading ? (
                <div className="text-center py-5">
                  <i className="fa-solid fa-spinner fa-spin fa-2x mb-3" style={{ color: 'var(--red)' }}></i>
                  <div style={{ color: 'var(--tx3)', fontSize: '14px' }}>Loading users…</div>
                </div>
              ) : fetchError ? (
                <div className="text-center py-5">
                  <i className="fa-solid fa-circle-exclamation fa-2x mb-3" style={{ color: 'var(--red)' }}></i>
                  <div style={{ color: 'var(--tx1)', fontWeight: 700, marginBottom: 8 }}>Failed to load users</div>
                  <div style={{ color: 'var(--tx3)', fontSize: '13px', marginBottom: 16 }}>{fetchError}</div>
                  <button className="btn-ghost btn-sm" onClick={fetchUsers}><i className="fa-solid fa-rotate-right me-1"></i>Retry</button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-5">
                  <i className="fa-solid fa-user-slash fa-2x mb-3" style={{ color: 'var(--tx3)' }}></i>
                  <div style={{ color: 'var(--tx3)', fontSize: '14px' }}>No users match your search</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="tbl admin-user-tbl">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th>User</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Violations</th>
                        <th>Top Location</th>
                        <th>Last Incident</th>
                        <th>Joined</th>
                        <th>Account ID</th>
                        <th style={{ width: 100 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((u, i) => {
                        const isAdminDomain = u.email?.endsWith(ADMIN_DOMAIN);
                        const hasViolations = u.violation_count > 0;
                        return (
                          <tr key={u.id} className="admin-user-row">
                            <td style={{ color: 'var(--tx3)', fontSize: '13px' }}>{i + 1}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                  width: 36, height: 36, borderRadius: '50%',
                                  background: avatarColor(u.role),
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '13px', fontWeight: 800, color: '#fff', flexShrink: 0,
                                }}>
                                  {initials(u.name)}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 700, color: 'var(--tx1)', fontSize: '14px' }}>{u.name}</div>
                                  <div style={{ fontSize: '10px', color: isAdminDomain ? 'var(--red)' : 'var(--tx3)', fontWeight: 600 }}>
                                    {isAdminDomain ? <><i className="fa-solid fa-lock me-1"></i>admin domain</> : 'standard'}
                                    {u.email === user.email && <span style={{ color: 'var(--green)', marginLeft: 6 }}>● You</span>}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div style={{ fontSize: '12px', color: 'var(--tx2)', fontFamily: 'monospace' }}>{u.email}</div>
                            </td>
                            <td>
                              <span className={`tag ${u.role === 'admin' ? 'r' : 'b'}`}>
                                <i className={`fa-solid ${u.role === 'admin' ? 'fa-shield-halved' : 'fa-user'} me-1`}></i>
                                {u.role}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                  fontWeight: 800, fontSize: '18px',
                                  color: u.violation_count === 0 ? 'var(--green)' : u.violation_count < 5 ? 'var(--amber)' : 'var(--red)'
                                }}>
                                  {u.violation_count}
                                </span>
                                {u.violation_count > 0 && (
                                  <span style={{ fontSize: '10px', color: 'var(--tx3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    {u.violation_count === 1 ? 'incident' : 'incidents'}
                                  </span>
                                )}
                                {u.violation_count === 0 && (
                                  <span style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 600 }}>clean</span>
                                )}
                              </div>
                            </td>
                            <td>
                              {u.top_location ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <i className="fa-solid fa-location-dot" style={{ color: 'var(--red)', fontSize: '11px' }}></i>
                                  <span style={{ fontSize: '13px', color: 'var(--tx2)' }}>{u.top_location}</span>
                                </div>
                              ) : (
                                <span style={{ fontSize: '12px', color: 'var(--tx3)' }}>—</span>
                              )}
                            </td>
                            <td style={{ fontSize: '12px', color: 'var(--tx3)', whiteSpace: 'nowrap' }}>
                              {u.last_violation ? fmtDate(u.last_violation) : <span style={{ color: 'var(--tx3)' }}>—</span>}
                            </td>
                            <td style={{ fontSize: '12px', color: 'var(--tx2)', whiteSpace: 'nowrap' }}>{fmtDate(u.created_at)}</td>
                            <td>
                              <code style={{ fontSize: '11px', color: 'var(--tx3)', background: 'var(--card2)', padding: '2px 6px', borderRadius: '4px' }}>
                                UID-{String(u.id).padStart(4, '0')}
                              </code>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  className="ib btn-sm"
                                  title="Export user report"
                                  style={{ color: 'var(--blue)' }}
                                  onClick={() => {
                                    const a = document.createElement('a');
                                    a.href = `/api/users/${u.id}/report`;
                                    a.download = '';
                                    a.click();
                                  }}
                                >
                                  <i className="fa-solid fa-file-arrow-down"></i>
                                </button>
                                <button
                                  className="ib btn-sm"
                                  title="Delete user"
                                  style={{ color: 'var(--red)' }}
                                  onClick={() => setConfirmDelete(u)}
                                  disabled={u.email === user.email}
                                >
                                  <i className="fa-solid fa-trash"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Domain legend */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '12px', color: 'var(--tx3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fa-solid fa-lock" style={{ color: 'var(--red)' }}></i>
                <span>Accounts ending in <strong style={{ color: 'var(--tx2)' }}>{ADMIN_DOMAIN}</strong> are permanently locked to admin role</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--tx3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fa-solid fa-circle-info" style={{ color: 'var(--blue)' }}></i>
                <span>You cannot delete your own account</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }}>
          <div className="c" style={{ maxWidth: 420, width: '100%', padding: 0 }}>
            <div className="c-head" style={{ borderBottom: '1px solid rgba(239,68,68,0.2)' }}>
              <div className="c-title" style={{ color: 'var(--red)' }}>
                <i className="fa-solid fa-triangle-exclamation me-2"></i>Delete User
              </div>
            </div>
            <div className="c-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: avatarColor(confirmDelete.role),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '18px', fontWeight: 800, color: '#fff', flexShrink: 0,
                }}>
                  {initials(confirmDelete.name)}
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--tx1)' }}>{confirmDelete.name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--tx3)' }}>{confirmDelete.email}</div>
                </div>
              </div>
              <p style={{ color: 'var(--tx2)', fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>
                This will permanently delete the account and all associated data. This action cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button className="btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button className="btn-danger-outline" onClick={() => handleDelete(confirmDelete)}>
                  <i className="fa-solid fa-trash me-1"></i>Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <div
        className={`toast-notify ${toast.show ? 'show' : ''}`}
        style={{ borderColor: toast.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)', color: toast.ok ? 'var(--green)' : 'var(--red)' }}
      >
        <i className={`fa-solid ${toast.ok ? 'fa-circle-check' : 'fa-circle-exclamation'}`}></i>
        <span>{toast.msg}</span>
      </div>
    </div>
  );
};

export default Admin;
