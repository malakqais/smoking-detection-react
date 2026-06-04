import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import logo from '../assets/LOGO.png';
import { apiFetch } from '../utils/api.js';
import { Link } from 'react-router-dom';
import { isAdmin, isManager, isSupervisor, ROLE_LABELS, normalizeRole, staffPanelLabel, canExportReports, canSuspendUsers, canViewAudit } from '../utils/roles.js';
import { useCurrentUser } from '../hooks/useCurrentUser.js';
import AppSidebar from '../components/layout/AppSidebar.jsx';
import { downloadAuthenticated } from '../utils/download.js';
import DisputesReviewPanel from '../components/disputes/DisputesReviewPanel.jsx';

const avatarColor = (role) => {
  const r = normalizeRole(role);
  if (r === 'supervisor') return 'linear-gradient(135deg,#ef4444,#f97316)';
  if (r === 'admin') return 'linear-gradient(135deg,#0ea5e9,#6366f1)';
  if (r === 'manager') return 'linear-gradient(135deg,#8b5cf6,#6366f1)';
  return 'linear-gradient(135deg,#3b82f6,#22d3ee)';
};

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
  const { user } = useCurrentUser();
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [tab, setTab] = useState('users');
  const [toast, setToast] = useState({ show: false, msg: '', ok: true });
  const [confirmSuspend, setConfirmSuspend] = useState(null);
  const [suspendTotp, setSuspendTotp] = useState('');

  const fetchUsers = async () => {
    setFetchError(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/users');
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

  const fetchAudit = async () => {
    try {
      const res = await apiFetch('/api/audit/logs?limit=80');
      if (res.ok) setAuditLogs(await res.json());
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchUsers(); if (canViewAudit(user)) fetchAudit(); }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const showToast = (msg, ok = true) => {
    setToast({ show: true, msg, ok });
    setTimeout(() => setToast({ show: false, msg: '', ok: true }), 3000);
  };

  const downloadUserReport = async (uid, name) => {
    try {
      await downloadAuthenticated(
        `/api/users/${uid}/report`,
        `SmokeDet_User_Report_${(name || 'user').replace(/\s+/g, '_')}.xlsx`,
      );
      showToast('Excel report downloaded');
    } catch (e) {
      showToast(e.message || 'Download failed', false);
    }
  };

  const downloadPlatformReport = async () => {
    try {
      await downloadAuthenticated(
        '/api/reports/platform',
        `SmokeDet_Platform_Report_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      showToast('Platform Excel report downloaded');
    } catch (e) {
      showToast(e.message || 'Download failed', false);
    }
  };

  const handleSuspend = async (u, reason, totp_code) => {
    try {
      const res = await apiFetch('/api/users/suspend', {
        method: 'POST',
        body: JSON.stringify({ id: u.id, reason, totp_code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { fetchUsers(); fetchAudit(); showToast(data.message || `${u.name} suspended`); }
      else showToast(data.message || 'Suspend failed', false);
    } catch { showToast('Network error', false); }
    setConfirmSuspend(null);
    setSuspendTotp('');
  };

  const handleReactivate = async (u) => {
    const code = !isSupervisor(user) ? suspendTotp || window.prompt('Manager 2FA code:') : undefined;
    try {
      const res = await apiFetch('/api/users/reactivate', {
        method: 'POST',
        body: JSON.stringify({ id: u.id, totp_code: code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { fetchUsers(); fetchAudit(); showToast(data.message || `${u.name} reactivated`); }
      else showToast(data.message || 'Failed', false);
    } catch { showToast('Network error', false); }
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchQ = !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || String(u.id).includes(q);
    const matchR = roleFilter === 'all'
      || (roleFilter === 'suspended' ? u.status === 'suspended' : normalizeRole(u.role) === roleFilter);
    return matchQ && matchR;
  });

  const supervisors = users.filter(u => normalizeRole(u.role) === 'supervisor').length;
  const managers = users.filter(u => normalizeRole(u.role) === 'manager').length;
  const admins = users.filter(u => normalizeRole(u.role) === 'admin').length;
  const regular = users.filter(u => normalizeRole(u.role) === 'user').length;
  const suspended = users.filter(u => u.status === 'suspended').length;
  const totalViolations = users.reduce((s, u) => s + (u.violation_count || 0), 0);
  const mostOffender = users.reduce((a, b) => (b.violation_count || 0) > (a.violation_count || 0) ? b : a, users[0] || {});
  const isDark = theme === 'dark';

  return (
    <div className="layout">
      <div className={`sb-overlay ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)}></div>

      <AppSidebar
        user={user}
        collapsed={sidebarCollapsed}
        open={sidebarOpen}
        onToggleCollapse={() => {
          const s = !sidebarCollapsed;
          setSidebarCollapsed(s);
          localStorage.setItem('sidebarCollapsed', s);
        }}
      />

      <main className="main">
        <header className="top-bar">
          <div className="tb-left">
            <div className="ib d-lg-none" onClick={() => setSidebarOpen(true)}><i className="fa-solid fa-bars"></i></div>
            <div>
              <div className="pg-title">{staffPanelLabel(user)}</div>
              <div className="pg-sub">
                {isSupervisor(user) && 'Supervisor — full access including Supervisor Console'}
                {isAdmin(user) && 'Admin — user management, Excel reports, dispute voting, audit log'}
                {isManager(user) && !isAdmin(user) && !isSupervisor(user) && 'Manager — live ops, dispute first review, remove mistaken violations'}
              </div>
            </div>
          </div>
          <div className="tb-right">
            <div className="ib" onClick={() => setTheme(isDark ? 'light' : 'dark')} title="Toggle theme">
              {isDark ? <i className="fa-solid fa-moon"></i> : <i className="fa-solid fa-sun" style={{ color: 'var(--amber)' }}></i>}
            </div>
            {isSupervisor(user) && (
              <Link to="/supervisor" className="btn-ghost btn-sm"><i className="fa-solid fa-crown me-1"></i>Supervisor Console</Link>
            )}
            {canExportReports(user) && (
              <button type="button" className="btn-ghost btn-sm" onClick={downloadPlatformReport}>
                <i className="fa-solid fa-file-excel me-1"></i>Platform Excel
              </button>
            )}
            <button type="button" className="btn-ghost btn-sm" onClick={() => { fetchUsers(); if (canViewAudit(user)) fetchAudit(); }}>
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
                <div className="admin-stat-val">{managers}</div>
                <div className="admin-stat-label">Managers</div>
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-icon" style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8' }}>
                <i className="fa-solid fa-user-gear"></i>
              </div>
              <div>
                <div className="admin-stat-val">{admins}</div>
                <div className="admin-stat-label">Admins</div>
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
              {canExportReports(user) && (
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => downloadUserReport(mostOffender.id, mostOffender.name)}
              >
                <i className="fa-solid fa-file-excel me-1"></i>Export Excel
              </button>
              )}
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
                  {['all', 'supervisor', 'admin', 'manager', 'user', 'suspended'].map(r => (
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
                        const roleNorm = normalizeRole(u.role);
                        const isSup = roleNorm === 'supervisor';
                        const isAdm = roleNorm === 'admin';
                        const isSuspended = u.status === 'suspended';
                        const maySuspend = canSuspendUsers(user)
                          && u.email !== user.email
                          && roleNorm !== 'supervisor'
                          && (isSupervisor(user) || (roleNorm !== 'manager' && roleNorm !== 'admin'));
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
                                  <div style={{ fontSize: '10px', color: isSuspended ? 'var(--red)' : 'var(--tx3)', fontWeight: 600 }}>
                                    {isSuspended ? <><i className="fa-solid fa-ban me-1"></i>suspended</> : ROLE_LABELS[normalizeRole(u.role)]}
                                    {u.email === user.email && <span style={{ color: 'var(--green)', marginLeft: 6 }}>● You</span>}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div style={{ fontSize: '12px', color: 'var(--tx2)', fontFamily: 'monospace' }}>{u.email}</div>
                            </td>
                            <td>
                              <span className={`tag ${isSup ? 'r' : isAdm ? 'admin-tag' : roleNorm === 'manager' ? 'p' : 'b'}`}>
                                <i className={`fa-solid ${isSup ? 'fa-crown' : isAdm ? 'fa-user-gear' : roleNorm === 'manager' ? 'fa-user-shield' : 'fa-user'} me-1`}></i>
                                {ROLE_LABELS[roleNorm] || u.role}
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
                                {canExportReports(user) && (
                                <button
                                  className="ib btn-sm"
                                  title="Export user report"
                                  style={{ color: 'var(--blue)' }}
                                  onClick={() => downloadUserReport(u.id, u.name)}
                                >
                                  <i className="fa-solid fa-file-arrow-down"></i>
                                </button>
                                )}
                                {canSuspendUsers(user) && (
                                <>
                                {u.status === 'suspended' ? (
                                  <button className="ib btn-sm" title="Reactivate" style={{ color: 'var(--green)' }} onClick={() => handleReactivate(u)}>
                                    <i className="fa-solid fa-user-check"></i>
                                  </button>
                                ) : (
                                  <button
                                    className="ib btn-sm"
                                    title="Suspend user"
                                    style={{ color: 'var(--amber)' }}
                                    onClick={() => setConfirmSuspend(u)}
                                    disabled={!maySuspend}
                                  >
                                    <i className="fa-solid fa-ban"></i>
                                  </button>
                                )}
                                </>
                                )}
                                {isSupervisor(user) && normalizeRole(u.role) === 'manager' && (
                                  <Link to="/supervisor" className="ib btn-sm" title="Demote in Supervisor Console" style={{ color: 'var(--tx3)' }}>
                                    <i className="fa-solid fa-crown"></i>
                                  </Link>
                                )}
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

            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--tx3)' }}>
              <i className="fa-solid fa-shield-halved me-1" style={{ color: 'var(--amber)' }}></i>
              {isManager(user) && !isAdmin(user) && 'Managers review disputes and may remove mistaken violations (2FA). User suspend and Excel export are admin-only.'}
              {(isAdmin(user) || isSupervisor(user)) && (
                <>Users are <strong>suspended</strong>, not deleted. Role changes are Supervisor Console only.{suspended > 0 && <span style={{ marginLeft: 8, color: 'var(--red)' }}>{suspended} suspended</span>}</>
              )}
            </div>
          </div>

          <DisputesReviewPanel user={user} />

          {canViewAudit(user) && (
          <div className="c mt-4">
            <div className="c-head">
              <div className="c-title"><i className="fa-solid fa-clipboard-list me-2"></i>Audit log (read-only)</div>
              <div className="c-sub">Security events — cannot be deleted</div>
            </div>
            <div className="c-body" style={{ maxHeight: 280, overflowY: 'auto', padding: 0 }}>
              <table className="tbl" style={{ fontSize: 12 }}>
                <thead><tr><th>Time</th><th>Actor</th><th>Role</th><th>Action</th><th>Details</th></tr></thead>
                <tbody>
                  {auditLogs.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-4 text-muted">No audit entries yet</td></tr>
                  ) : auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{log.created_at}</td>
                      <td>{log.actor_email}</td>
                      <td>{log.actor_role}</td>
                      <td><code>{log.action}</code></td>
                      <td style={{ color: 'var(--tx3)' }}>{log.details || log.target_id || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </div>
      </main>

      {confirmSuspend && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }}>
          <div className="c" style={{ maxWidth: 420, width: '100%', padding: 0 }}>
            <div className="c-head" style={{ borderBottom: '1px solid rgba(239,68,68,0.2)' }}>
              <div className="c-title" style={{ color: 'var(--red)' }}>
                <i className="fa-solid fa-triangle-exclamation me-2"></i>Suspend User
              </div>
            </div>
            <div className="c-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: avatarColor(confirmSuspend.role),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '18px', fontWeight: 800, color: '#fff', flexShrink: 0,
                }}>
                  {initials(confirmSuspend.name)}
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--tx1)' }}>{confirmSuspend.name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--tx3)' }}>{confirmSuspend.email}</div>
                </div>
              </div>
              <p style={{ color: 'var(--tx2)', fontSize: '14px', lineHeight: 1.6, marginBottom: '12px' }}>
                Suspended users cannot sign in. Violation history is kept for audit. You can reactivate later.
              </p>
              <input className="finput mb-2" id="suspend-reason" placeholder="Reason (optional)" defaultValue="Policy violation" />
              {!isSupervisor(user) && (
                <input className="finput mb-3" placeholder="Your 2FA code (required)" value={suspendTotp} onChange={(e) => setSuspendTotp(e.target.value)} maxLength={6} />
              )}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button className="btn-ghost btn-sm" onClick={() => setConfirmSuspend(null)}>Cancel</button>
                <button className="btn-danger-outline" onClick={() => {
                  const reason = document.getElementById('suspend-reason')?.value || 'Policy violation';
                  handleSuspend(confirmSuspend, reason, isSupervisor(user) ? undefined : suspendTotp);
                }}>
                  <i className="fa-solid fa-ban me-1"></i>Suspend
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
