import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import logo from '../assets/LOGO.png';
import { apiFetch } from '../utils/api.js';
import { isSupervisor, normalizeRole } from '../utils/roles.js';
import { isValidTotpCode, normalizeTotpInput } from '../utils/totp.js';
import { useCurrentUser } from '../hooks/useCurrentUser.js';
import DisputesReviewPanel from '../components/disputes/DisputesReviewPanel.jsx';

const userOptionLabel = (u) => {
  const role = normalizeRole(u.role);
  const tfa = u.two_factor_enabled ? '2FA on' : '2FA off';
  return `${u.name} (${u.email}) — ${role}, ${tfa}`;
};

const Supervisor = () => {
  const { user, syncing } = useCurrentUser();
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [totpCode, setTotpCode] = useState('');
  const [actionGrantToken, setActionGrantToken] = useState('');
  const [totpVerified, setTotpVerified] = useState(false);
  const [validatingTotp, setValidatingTotp] = useState(false);
  const [transferId, setTransferId] = useState('');
  const [promoteUserId, setPromoteUserId] = useState('');
  const [promoteAdminUserId, setPromoteAdminUserId] = useState('');
  const [toast, setToast] = useState({ show: false, msg: '', ok: true });
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [promotingManager, setPromotingManager] = useState(false);
  const [promotingAdmin, setPromotingAdmin] = useState(false);

  const showToast = (msg, ok = true) => {
    setToast({ show: true, msg, ok });
    setTimeout(() => setToast({ show: false, msg: '', ok: true }), ok ? 5000 : 6000);
  };

  const clearGrant = () => {
    setActionGrantToken('');
    setTotpVerified(false);
    setTotpCode('');
  };

  const load = async () => {
    setLoadingUsers(true);
    const [aRes, uRes] = await Promise.all([
      apiFetch('/api/audit/logs?limit=40'),
      apiFetch('/api/supervisor/users'),
    ]);
    if (aRes.ok) setAuditLogs(await aRes.json());
    if (uRes.ok) {
      setUsers(await uRes.json());
    } else {
      const err = await uRes.json().catch(() => ({}));
      showToast(err.message || 'Could not load user list', false);
      setUsers([]);
    }
    setLoadingUsers(false);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    load();
  }, [theme]);

  const validateTotp = async () => {
    if (!isValidTotpCode(totpCode)) {
      showToast('Enter a valid 6-digit code from your authenticator', false);
      return;
    }
    setValidatingTotp(true);
    try {
      const res = await apiFetch('/api/auth/supervisor-2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ totp_code: totpCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.action_grant_token) {
        setActionGrantToken(data.action_grant_token);
        setTotpVerified(true);
        showToast(data.message || 'Console unlocked');
      } else {
        clearGrant();
        showToast(data.message || 'Invalid code', false);
      }
    } catch {
      showToast('Could not verify code', false);
    } finally {
      setValidatingTotp(false);
    }
  };

  const requireGrant = () => {
    if (!totpVerified || !actionGrantToken) {
      showToast('Validate your 6-digit code to unlock the console first', false);
      return false;
    }
    return true;
  };

  const demote = async (uid) => {
    if (!requireGrant()) return;
    const res = await apiFetch('/api/users/demote-manager', {
      method: 'POST',
      body: JSON.stringify({ id: uid, action_grant_token: actionGrantToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showToast(data.message);
      load();
    } else {
      showToast(data.message || 'Failed', false);
      if (res.status === 403) clearGrant();
    }
  };

  const promoteAdmin = async () => {
    if (!promoteAdminUserId) {
      showToast('Select a user to promote as admin', false);
      return;
    }
    if (!requireGrant()) return;
    setPromotingAdmin(true);
    try {
      const res = await apiFetch('/api/staff/promote-admin', {
        method: 'POST',
        body: JSON.stringify({
          user_id: Number(promoteAdminUserId),
          action_grant_token: actionGrantToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(data.message || 'User promoted to admin');
        setPromoteAdminUserId('');
        await load();
      } else {
        showToast(data.message || `Failed (${res.status})`, false);
        if (res.status === 403) clearGrant();
      }
    } catch {
      showToast('Network error — is the backend running?', false);
    } finally {
      setPromotingAdmin(false);
    }
  };

  const demoteAdmin = async (uid) => {
    if (!requireGrant()) return;
    const res = await apiFetch('/api/users/demote-admin', {
      method: 'POST',
      body: JSON.stringify({ id: uid, action_grant_token: actionGrantToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showToast(data.message);
      load();
    } else {
      showToast(data.message || 'Failed', false);
      if (res.status === 403) clearGrant();
    }
  };

  const promoteManager = async () => {
    if (!promoteUserId) {
      showToast('Select a user to promote', false);
      return;
    }
    if (!requireGrant()) return;
    setPromotingManager(true);
    try {
      const res = await apiFetch('/api/staff/promote-manager', {
        method: 'POST',
        body: JSON.stringify({
          user_id: Number(promoteUserId),
          action_grant_token: actionGrantToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(data.message || 'User promoted to manager');
        setPromoteUserId('');
        await load();
      } else {
        showToast(data.message || `Failed (${res.status})`, false);
        if (res.status === 403) clearGrant();
      }
    } catch {
      showToast('Network error — is the backend running?', false);
    } finally {
      setPromotingManager(false);
    }
  };

  const transfer = async () => {
    if (!transferId) return;
    if (!requireGrant()) return;
    const res = await apiFetch('/api/users/transfer-supervisor', {
      method: 'POST',
      body: JSON.stringify({ id: Number(transferId), action_grant_token: actionGrantToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.requires_relogin) {
      localStorage.clear();
      window.location.href = '/login';
      return;
    }
    if (res.ok) {
      showToast(data.message);
      load();
    } else {
      showToast(data.message || 'Failed', false);
      if (res.status === 403) clearGrant();
    }
  };

  const managers = users.filter((u) => normalizeRole(u.role) === 'manager' && u.status === 'active');
  const admins = users.filter((u) => normalizeRole(u.role) === 'admin' && u.status === 'active');
  const promoteCandidates = users.filter(
    (u) => normalizeRole(u.role) === 'user' && u.status === 'active',
  );
  const promoteAdminCandidates = promoteCandidates;
  const transferCandidates = users.filter((u) => u.status === 'active' && normalizeRole(u.role) !== 'supervisor');

  if (syncing) {
    return (
      <div className="content p-5 text-center">
        <p style={{ color: 'var(--tx3)' }}>Loading supervisor console…</p>
      </div>
    );
  }

  if (!isSupervisor(user)) {
    return (
      <div className="content p-5 text-center">
        <p>Supervisor access only. Your role is <strong>{normalizeRole(user.role)}</strong>.</p>
        <p style={{ color: 'var(--tx3)', fontSize: 13 }}>Log out and sign in with the supervisor account if this is wrong.</p>
        <NavLink to="/">Back to dashboard</NavLink>
      </div>
    );
  }

  return (
    <div className="layout">
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${sidebarOpen ? 'open' : ''}`}>
        <div className="sb-logo">
          <img src={logo} alt="Logo" />
          <div>
            <div className="sb-logo-name">SmokeDet</div>
            <div className="sb-logo-sub">Supervisor console</div>
          </div>
        </div>
        <nav className="sb-nav">
          <NavLink className="sb-item" to="/"><i className="fa-solid fa-gauge-high"></i><span className="sb-label">Dashboard</span></NavLink>
          <NavLink className="sb-item" to="/admin"><i className="fa-solid fa-users"></i><span className="sb-label">Staff Panel</span></NavLink>
          <NavLink className="sb-item" to="/supervisor"><i className="fa-solid fa-crown"></i><span className="sb-label">Supervisor</span></NavLink>
          <NavLink className="sb-item" to="/settings"><i className="fa-solid fa-sliders"></i><span className="sb-label">Settings</span></NavLink>
        </nav>
      </aside>

      <main className="main">
        <header className="top-bar">
          <div className="tb-left">
            <div>
              <div className="pg-title">Supervisor Console</div>
              <div className="pg-sub">Approvals, role control, and security oversight</div>
            </div>
          </div>
        </header>

        <div className="content fade-in">
          <div className="c mb-4 supervisor-2fa-card">
            <div className="c-body">
              <div className="supervisor-2fa-row">
                <i className="fa-solid fa-key supervisor-2fa-icon"></i>
                <div className="supervisor-2fa-copy">
                  <div style={{ fontWeight: 700 }}>Supervisor 2FA</div>
                  <div style={{ fontSize: 13, color: 'var(--tx3)' }}>
                    Validate once with your authenticator to unlock this console for <strong>30 minutes</strong>
                    (add admin/manager, approve, demote, transfer).
                  </div>
                </div>
                <div className="supervisor-2fa-controls">
                  <input
                    className="finput supervisor-totp-input"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    value={totpCode}
                    onChange={(e) => {
                      setTotpCode(normalizeTotpInput(e.target.value));
                      if (totpVerified) clearGrant();
                    }}
                    maxLength={6}
                    disabled={validatingTotp}
                  />
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={validateTotp}
                    disabled={validatingTotp || !isValidTotpCode(totpCode)}
                  >
                    {validatingTotp ? (
                      <><i className="fa-solid fa-spinner fa-spin me-1"></i>Checking…</>
                    ) : (
                      <><i className="fa-solid fa-shield-check me-1"></i>Validate</>
                    )}
                  </button>
                </div>
              </div>
              {totpVerified ? (
                <div className="supervisor-2fa-ready">
                  <i className="fa-solid fa-circle-check me-2"></i>
                  Console unlocked — you can perform multiple actions until the session expires.
                  <button type="button" className="auth-link-btn ms-2" onClick={clearGrant}>Lock</button>
                </div>
              ) : (
                <div className="supervisor-2fa-hint">
                  Enter 6 digits from your authenticator app, then click Validate.
                </div>
              )}
            </div>
          </div>

          <div className="row g-4">
            <div className="col-lg-12">
              <div className="c mb-4">
                <div className="c-head"><div className="c-title"><i className="fa-solid fa-user-gear me-2"></i>Active admins ({admins.length})</div></div>
                <div className="c-body">
                  {admins.map((a) => (
                    <div key={a.id} className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                      <span>{a.name} <span style={{ color: 'var(--tx3)', fontSize: 12 }}>{a.email}</span></span>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => demoteAdmin(a.id)} disabled={!totpVerified}>
                        Demote
                      </button>
                    </div>
                  ))}
                  {admins.length === 0 && (
                    <p style={{ color: 'var(--tx3)', margin: '0 0 16px' }}>No admins yet. Add one below.</p>
                  )}
                  <div className="supervisor-add-manager">
                    <label className="flabel" htmlFor="promote-admin-user">Add admin</label>
                    <p className="transfer-supervisor-hint">Pick an active <strong>User</strong> role account. Validate your 6-digit code above first.</p>
                    <select
                      id="promote-admin-user"
                      className="finput finput-select mb-2"
                      value={promoteAdminUserId}
                      onChange={(e) => setPromoteAdminUserId(e.target.value)}
                      disabled={loadingUsers}
                    >
                      <option value="">{loadingUsers ? 'Loading users…' : 'Select user…'}</option>
                      {promoteAdminCandidates.map((u) => (
                        <option key={u.id} value={String(u.id)}>{userOptionLabel(u)}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={promoteAdmin}
                      disabled={!totpVerified || !promoteAdminUserId || promotingAdmin}
                    >
                      {promotingAdmin ? (
                        <><i className="fa-solid fa-spinner fa-spin me-1"></i>Adding…</>
                      ) : (
                        <><i className="fa-solid fa-user-plus me-1"></i>Add as admin</>
                      )}
                    </button>
                    {promoteAdminCandidates.length === 0 && !loadingUsers && (
                      <p style={{ color: 'var(--tx3)', fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                        No eligible accounts (need role <strong>user</strong> and status active).
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="c mb-4">
                <div className="c-head"><div className="c-title"><i className="fa-solid fa-user-shield me-2"></i>Active managers ({managers.length})</div></div>
                <div className="c-body">
                  {managers.map((m) => (
                    <div key={m.id} className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                      <span>{m.name} <span style={{ color: 'var(--tx3)', fontSize: 12 }}>{m.email}</span></span>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => demote(m.id)} disabled={!totpVerified}>
                        Demote
                      </button>
                    </div>
                  ))}
                  {managers.length === 0 && (
                    <p style={{ color: 'var(--tx3)', margin: '0 0 16px' }}>No managers yet. Add one below.</p>
                  )}

                  <div className="supervisor-add-manager">
                    <label className="flabel" htmlFor="promote-manager-user">Add manager</label>
                    <p className="transfer-supervisor-hint">Pick an active <strong>User</strong> role account. Validate your 6-digit code above first.</p>
                    <select
                      id="promote-manager-user"
                      className="finput finput-select mb-2"
                      value={promoteUserId}
                      onChange={(e) => setPromoteUserId(e.target.value)}
                      disabled={loadingUsers}
                    >
                      <option value="">{loadingUsers ? 'Loading users…' : 'Select user…'}</option>
                      {promoteCandidates.map((u) => (
                        <option key={u.id} value={String(u.id)}>{userOptionLabel(u)}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={promoteManager}
                      disabled={!totpVerified || !promoteUserId || promotingManager}
                    >
                      {promotingManager ? (
                        <><i className="fa-solid fa-spinner fa-spin me-1"></i>Adding…</>
                      ) : (
                        <><i className="fa-solid fa-user-plus me-1"></i>Add as manager</>
                      )}
                    </button>
                    {promoteCandidates.length === 0 && !loadingUsers && (
                      <p style={{ color: 'var(--tx3)', fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                        No eligible accounts (need role <strong>user</strong> and status active).
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="c">
                <div className="c-head"><div className="c-title"><i className="fa-solid fa-crown me-2"></i>Transfer supervisor</div></div>
                <div className="c-body">
                  <p className="transfer-supervisor-hint">Hand off supervisor role to a user with 2FA. You will become a manager and must sign in again.</p>
                  <div className="fgroup" style={{ marginBottom: 12 }}>
                    <label className="flabel" htmlFor="transfer-supervisor-user">New supervisor</label>
                    <select
                      id="transfer-supervisor-user"
                      className="finput finput-select"
                      value={transferId}
                      onChange={(e) => setTransferId(e.target.value)}
                    >
                      <option value="">Select user…</option>
                      {transferCandidates.map((u) => (
                        <option key={u.id} value={u.id}>{u.name} ({u.email}) — {normalizeRole(u.role)}</option>
                      ))}
                    </select>
                  </div>
                  <button type="button" className="btn-danger-outline btn-sm" onClick={transfer} disabled={!totpVerified || !transferId}>
                    Transfer (uses verified code)
                  </button>
                </div>
              </div>
            </div>
          </div>

          <DisputesReviewPanel
            user={user}
            actionGrantToken={actionGrantToken}
            totpVerified={totpVerified}
            onNeedTotp={() => showToast('Verify your 6-digit code first', false)}
          />

          <div className="c mt-4">
            <div className="c-head"><div className="c-title"><i className="fa-solid fa-clipboard-list me-2"></i>Recent audit (read-only)</div></div>
            <div className="c-body" style={{ maxHeight: 240, overflowY: 'auto', padding: 0 }}>
              <table className="tbl" style={{ fontSize: 12 }}>
                <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Details</th></tr></thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{log.created_at}</td>
                      <td>{log.actor_email}</td>
                      <td><code>{log.action}</code></td>
                      <td>{log.details || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      <div className={`toast-notify ${toast.show ? 'show' : ''}`} style={{ borderColor: toast.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)', color: toast.ok ? 'var(--green)' : 'var(--red)' }}>
        <span>{toast.msg}</span>
      </div>
    </div>
  );
};

export default Supervisor;
