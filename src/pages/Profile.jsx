import React, { useState, useEffect, useMemo } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import logo from '../assets/LOGO.png';

const AVATAR_COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

const Profile = () => {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || '{"name":"User","role":"user","email":"user@example.com"}'));
  const [profilePic, setProfilePic] = useState(() => localStorage.getItem('profilePic') || null);

  const [fullName, setFullName] = useState(user.name || '');
  const [toast, setToast] = useState({ show: false, msg: '', ok: true });

  const loginTime = useMemo(() => parseInt(localStorage.getItem('loginTime') || Date.now()), []);
  const [sessionDuration, setSessionDuration] = useState('0m 0s');
  const [lastProfileChange, setLastProfileChange] = useState(() => localStorage.getItem('lastProfileChange'));
  const lastPassChange = localStorage.getItem('lastPassChange');

  // For regular users — their violation tickets
  const [myTickets, setMyTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  // For admins — system overview
  const [sysStats, setSysStats] = useState(null);
  const [detectionRunning, setDetectionRunning] = useState(false);

  // Custom confirmation modal states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmCallback, setConfirmCallback] = useState(null);

  const isAdmin = user.role === 'admin';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const t = setInterval(() => {
      const e = Math.floor((Date.now() - loginTime) / 1000);
      const m = Math.floor(e / 60), s = e % 60;
      setSessionDuration(`${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(t);
  }, [loginTime]);

  // Fetch data based on role
  useEffect(() => {
    if (isAdmin) {
      fetch('/api/violations/stats').then(r => r.ok ? r.json() : null).then(d => d && setSysStats(d));
      fetch('/api/detection/status').then(r => r.ok ? r.json() : null).then(d => d && setDetectionRunning(d.running));
    } else {
      setTicketsLoading(true);
      fetch('/api/violations?limit=500')
        .then(r => r.ok ? r.json() : [])
        .then(data => {
          const nameMatch = data.filter(v =>
            v.name && v.name.toLowerCase() === user.name.toLowerCase()
          );
          setMyTickets(nameMatch);
        })
        .catch(() => setMyTickets([]))
        .finally(() => setTicketsLoading(false));
    }
  }, [isAdmin, user.name]);

  const showToast = (msg, ok = true) => {
    setToast({ show: true, msg, ok });
    setTimeout(() => setToast({ show: false, msg: '', ok: true }), 3000);
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
  };

  const colorForName = (name) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  };

  const completion = useMemo(() => {
    const steps = [
      { id: 'Name', done: fullName.trim().length > 0 },
      { id: 'Email', done: user.email.trim().length > 0 },
      { id: 'Photo', done: !!profilePic },
      { id: 'Password', done: !!lastPassChange },
    ];
    const pct = Math.round((steps.filter(s => s.done).length / steps.length) * 100);
    return { pct, steps };
  }, [fullName, user.email, profilePic, lastPassChange]);

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setProfilePic(ev.target.result); localStorage.setItem('profilePic', ev.target.result); showToast('Profile photo updated'); };
    reader.readAsDataURL(file);
  };

  const saveChanges = async () => {
    const updated = { ...user, name: fullName };
    try {
      const res = await fetch('/api/users/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email, name: fullName })
      });
      if (res.ok) {
          setUser(updated);
          localStorage.setItem('user', JSON.stringify(updated));
          const now = Date.now();
          localStorage.setItem('lastProfileChange', now);
          setLastProfileChange(now);
          showToast('Profile saved successfully');
      } else {
          showToast('Failed to save profile', false);
      }
    } catch (e) {
      showToast('Network error', false);
    }
  };

  const clearLocalData = () => {
    setConfirmMessage("Are you sure you want to clear all locally cached settings and appearance choices? Your credentials will remain intact.");
    setConfirmCallback(() => () => {
      const keep = { isLoggedIn: localStorage.getItem('isLoggedIn'), user: localStorage.getItem('user') };
      localStorage.clear();
      Object.entries(keep).forEach(([k, v]) => v && localStorage.setItem(k, v));
      window.location.reload();
    });
    setShowConfirmModal(true);
  };

  const deleteAccount = () => {
    setConfirmMessage("Are you sure you want to permanently delete your account? This action is absolutely irreversible.");
    setConfirmCallback(() => () => {
      localStorage.clear();
      navigate('/logout');
    });
    setShowConfirmModal(true);
  };

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
          {isAdmin && <NavLink className="sb-item" to="/admin"><i className="fa-solid fa-user-shield"></i><span className="sb-label">Admin Panel</span></NavLink>}
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
              <div className="pg-title">Profile</div>
              <div className="pg-sub">{isAdmin ? 'Administrator account' : 'Your account & violation tickets'}</div>
            </div>
          </div>
          <div className="tb-right">
            <div className="ib" onClick={() => setTheme(isDark ? 'light' : 'dark')} title="Toggle theme">
              {isDark ? <i className="fa-solid fa-moon"></i> : <i className="fa-solid fa-sun" style={{ color: 'var(--amber)' }}></i>}
            </div>
            <NavLink to="/settings" className="ib" title="Settings"><i className="fa-solid fa-gear"></i></NavLink>
          </div>
        </header>

        <div className="content fade-in">
          <div className="row g-3">

            {/* ── Left column: avatar card ── */}
            <div className="col-lg-4">
              <div className="c" style={{ overflow: 'visible' }}>
                {/* Role-colored cover strip */}
                <div className="prof-cover" style={{ background: isAdmin ? 'linear-gradient(135deg,#ef4444,#b91c1c)' : 'linear-gradient(135deg,#3b82f6,#1d4ed8)' }}></div>
                <div style={{ padding: '0 22px 18px' }}>
                  <div className="prof-av-wrap">
                    <div className="prof-av-inner">
                      {profilePic
                        ? <img src={profilePic} className="prof-av" alt="Profile" />
                        : <div className="prof-av-initials" style={{ background: colorForName(user.name) }}>{getInitials(user.name)}</div>
                      }
                      <label htmlFor="uploadPic" className="prof-av-btn"><i className="fa-solid fa-camera"></i></label>
                      <input type="file" id="uploadPic" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
                    </div>
                  </div>
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '17px', fontWeight: '800', color: 'var(--tx1)' }}>{user.name}</div>
                    <div style={{ fontSize: '12.5px', color: 'var(--tx3)', marginBottom: '10px' }}>{user.email}</div>
                    <span className={`tag ${isAdmin ? 'r' : 'b'}`}>
                      <i className={`fa-solid ${isAdmin ? 'fa-shield-halved' : 'fa-id-card'} me-1`}></i>
                      {isAdmin ? 'Administrator' : 'Standard User'}
                    </span>
                  </div>
                </div>

                {/* Profile completion */}
                <div className="completion-bar-wrap">
                  <div className="completion-label"><span>Profile Completion</span><strong>{completion.pct}%</strong></div>
                  <div className="completion-track"><div className="completion-fill" style={{ width: `${completion.pct}%` }}></div></div>
                  <div className="completion-steps">
                    {completion.steps.map(s => (
                      <div key={s.id} className={`completion-step ${s.done ? 'done' : ''}`}>
                        <i className={`fa-solid ${s.done ? 'fa-circle-check' : 'fa-circle'}`}></i> {s.id}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Role-specific quick stats */}
                <div style={{ borderTop: '1px solid var(--border)', padding: '16px 22px' }}>
                  {isAdmin ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div className="stat-pill">
                        <div className="stat-pill-icon" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}><i className="fa-solid fa-triangle-exclamation"></i></div>
                        <div><div className="stat-pill-val">{sysStats?.total ?? '—'}</div><div className="stat-pill-lbl">Total Violations</div></div>
                      </div>
                      <div className="stat-pill">
                        <div className="stat-pill-icon" style={{ background: detectionRunning ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)', color: detectionRunning ? 'var(--green)' : 'var(--tx3)' }}>
                          <i className="fa-solid fa-circle-dot"></i>
                        </div>
                        <div><div className="stat-pill-val" style={{ fontSize: '13px', color: detectionRunning ? 'var(--green)' : 'var(--tx3)' }}>{detectionRunning ? 'Live' : 'Idle'}</div><div className="stat-pill-lbl">Detection</div></div>
                      </div>
                      <div className="stat-pill">
                        <div className="stat-pill-icon" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--amber)' }}><i className="fa-solid fa-clock"></i></div>
                        <div><div className="stat-pill-val" style={{ fontSize: '12px' }}>{sysStats?.peak_hour != null ? `${sysStats.peak_hour}:00` : '—'}</div><div className="stat-pill-lbl">Peak Hour</div></div>
                      </div>
                      <div className="stat-pill">
                        <div className="stat-pill-icon" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--blue)' }}><i className="fa-solid fa-chart-line"></i></div>
                        <div><div className="stat-pill-val">{sysStats?.avg_per_day ?? '—'}</div><div className="stat-pill-lbl">Avg / Day</div></div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div className="stat-pill">
                        <div className="stat-pill-icon" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}><i className="fa-solid fa-ticket"></i></div>
                        <div><div className="stat-pill-val">{myTickets.length}</div><div className="stat-pill-lbl">My Tickets</div></div>
                      </div>
                      <div className="stat-pill">
                        <div className="stat-pill-icon" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--blue)' }}><i className="fa-solid fa-clock-rotate-left"></i></div>
                        <div><div className="stat-pill-val" style={{ fontSize: '12px' }}>{sessionDuration}</div><div className="stat-pill-lbl">Session</div></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Right column: role-specific content ── */}
            <div className="col-lg-8" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

              {/* Edit Profile — shared */}
              <div className="c">
                <div className="c-head">
                  <div>
                    <div className="c-title"><i className="fa-solid fa-pen me-2" style={{ color: 'var(--blue)' }}></i>Edit Profile</div>
                    <div className="c-sub">Update your display name and password</div>
                  </div>
                </div>
                <div className="c-body">
                  <div className="section-hdr"><i className="fa-solid fa-id-card me-2"></i>Personal Information</div>
                  <div className="row g-3 mb-4">
                    <div className="col-md-6">
                      <div className="fgroup mb-0">
                        <label className="flabel">Full Name</label>
                        <div className="input-icon-wrap"><i className="fa-solid fa-user"></i><input type="text" className="finput" value={fullName} onChange={e => setFullName(e.target.value)} /></div>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="fgroup mb-0">
                        <label className="flabel">Email Address</label>
                        <div className="input-icon-wrap"><i className="fa-solid fa-envelope"></i><input type="text" className="finput" value={user.email} readOnly disabled /></div>
                      </div>
                    </div>
                  </div>
                  <div className="d-flex gap-2 justify-content-end">
                    <button className="btn-ghost" onClick={() => { setFullName(user.name); setNewPass(''); setConfirmPass(''); }}>Reset</button>
                    <button className="btn-r" onClick={saveChanges}><i className="fa-solid fa-floppy-disk me-1"></i>Save Changes</button>
                  </div>
                </div>
              </div>

              {/* ── ADMIN: System Overview ── */}
              {isAdmin && (
                <div className="c">
                  <div className="c-head">
                    <div>
                      <div className="c-title"><i className="fa-solid fa-gauge-high me-2" style={{ color: 'var(--red)' }}></i>System Overview</div>
                      <div className="c-sub">Live snapshot of the detection system</div>
                    </div>
                    <Link to="/" className="btn-ghost btn-sm"><i className="fa-solid fa-arrow-right me-1"></i>Dashboard</Link>
                  </div>
                  <div className="c-body">
                    <div className="sysinfo-grid mb-4">
                      <div className="sysinfo-item">
                        <div className="sysinfo-label">Total Violations</div>
                        <div className="sysinfo-val" style={{ color: 'var(--red)' }}>{sysStats?.total ?? '—'}</div>
                      </div>
                      <div className="sysinfo-item">
                        <div className="sysinfo-label">Avg Per Day</div>
                        <div className="sysinfo-val">{sysStats?.avg_per_day ?? '—'}</div>
                      </div>
                      <div className="sysinfo-item">
                        <div className="sysinfo-label">Peak Hour</div>
                        <div className="sysinfo-val">{sysStats?.peak_hour != null ? `${sysStats.peak_hour}:00` : '—'}</div>
                      </div>
                      <div className="sysinfo-item">
                        <div className="sysinfo-label">Hottest Zone</div>
                        <div className="sysinfo-val" style={{ fontSize: '13px' }}>{sysStats?.top_zone ?? '—'}</div>
                      </div>
                      <div className="sysinfo-item">
                        <div className="sysinfo-label">Detection Status</div>
                        <div className="sysinfo-val" style={{ color: detectionRunning ? 'var(--green)' : 'var(--tx3)' }}>
                          {detectionRunning ? '● Live' : '○ Idle'}
                        </div>
                      </div>
                      <div className="sysinfo-item">
                        <div className="sysinfo-label">Session</div>
                        <div className="sysinfo-val" style={{ fontSize: '13px' }}>{sessionDuration}</div>
                      </div>
                    </div>

                    {/* Top zones */}
                    {sysStats?.by_location?.length > 0 && (
                      <>
                        <div className="section-hdr mb-2"><i className="fa-solid fa-location-dot me-2"></i>Top Violation Zones</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {sysStats.by_location.slice(0, 4).map((z, i) => {
                            const max = sysStats.by_location[0].count;
                            const pct = max > 0 ? Math.round((z.count / max) * 100) : 0;
                            const colors = ['var(--red)', 'var(--amber)', 'var(--blue)', 'var(--purple)'];
                            return (
                              <div key={z.name}>
                                <div className="d-flex justify-content-between mb-1" style={{ fontSize: '12.5px' }}>
                                  <span style={{ color: 'var(--tx1)', fontWeight: 600 }}>{z.name}</span>
                                  <span style={{ color: 'var(--tx3)' }}>{z.count} violations</span>
                                </div>
                                <div style={{ height: '6px', borderRadius: '4px', background: 'var(--card2)', overflow: 'hidden' }}>
                                  <div style={{ width: `${pct}%`, height: '100%', background: colors[i], borderRadius: '4px', transition: 'width 0.6s ease' }}></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── USER: My Violation Tickets ── */}
              {!isAdmin && (
                <div className="c">
                  <div className="c-head">
                    <div>
                      <div className="c-title"><i className="fa-solid fa-ticket me-2" style={{ color: 'var(--amber)' }}></i>My Violation Tickets</div>
                      <div className="c-sub">Smoking violations associated with your account</div>
                    </div>
                    {myTickets.length > 0 && (
                      <span className="tag a">{myTickets.length} ticket{myTickets.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  <div className="c-body">
                    {ticketsLoading ? (
                      <div className="text-center py-4">
                        <i className="fa-solid fa-spinner fa-spin" style={{ color: 'var(--amber)' }}></i>
                        <p style={{ color: 'var(--tx3)', fontSize: '13px', marginTop: '8px' }}>Loading tickets…</p>
                      </div>
                    ) : myTickets.length === 0 ? (
                      <div className="empty-state">
                        <i className="fa-solid fa-circle-check" style={{ color: 'var(--green)' }}></i>
                        <p>No violation tickets on record</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {myTickets.slice(0, 10).map(v => (
                          <div key={v.id} className="ticket-row">
                            <div className="ticket-icon">
                              <i className="fa-solid fa-triangle-exclamation"></i>
                            </div>
                            <div className="ticket-body">
                              <div className="ticket-title">Smoking Violation Detected</div>
                              <div className="ticket-meta">
                                <span><i className="fa-solid fa-location-dot me-1"></i>{v.location}</span>
                                <span><i className="fa-solid fa-clock me-1"></i>{v.time?.replace('T', ' ').slice(0, 16)}</span>
                              </div>
                            </div>
                            {v.image && (
                              <img src={v.image} className="ticket-thumb" alt="Evidence" onError={e => e.target.style.display='none'} />
                            )}
                            <span className="tag r ticket-tag">Issued</span>
                          </div>
                        ))}
                        {myTickets.length > 10 && (
                          <div style={{ textAlign: 'center', color: 'var(--tx3)', fontSize: '12.5px', padding: '6px 0' }}>
                            + {myTickets.length - 10} more tickets
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Activity Log — shared */}
              <div className="c">
                <div className="c-head">
                  <div className="c-title"><i className="fa-solid fa-clock-rotate-left me-2" style={{ color: 'var(--purple)' }}></i>Activity Log</div>
                </div>
                <div className="c-body">
                  <div className="activity-item">
                    <div className="activity-icon" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--green)' }}><i className="fa-solid fa-right-to-bracket"></i></div>
                    <div><div className="activity-title">Session Started</div><div className="activity-time">{new Date(loginTime).toLocaleString()}</div></div>
                  </div>
                  <div className="activity-item">
                    <div className="activity-icon" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--blue)' }}><i className="fa-solid fa-pen-to-square"></i></div>
                    <div><div className="activity-title">Last Profile Change</div><div className="activity-time">{lastProfileChange ? new Date(parseInt(lastProfileChange)).toLocaleString() : 'Never'}</div></div>
                  </div>
                  <div className="activity-item">
                    <div className="activity-icon" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--amber)' }}><i className="fa-solid fa-lock"></i></div>
                    <div><div className="activity-title">Last Password Change</div><div className="activity-time">{lastPassChange ? new Date(parseInt(lastPassChange)).toLocaleString() : 'Never'}</div></div>
                  </div>
                  <div className="activity-item" style={{ border: 'none', paddingBottom: 0 }}>
                    <div className="activity-icon" style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--purple)' }}><i className="fa-solid fa-stopwatch"></i></div>
                    <div><div className="activity-title">Current Session Duration</div><div className="activity-time">{sessionDuration}</div></div>
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="c">
                <div className="c-head" style={{ borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
                  <div className="c-title" style={{ color: 'var(--red)' }}><i className="fa-solid fa-triangle-exclamation me-2"></i>Danger Zone</div>
                </div>
                <div className="c-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="danger-zone">
                    <div className="danger-zone-title"><i className="fa-solid fa-broom me-2"></i>Clear All Local Data</div>
                    <div className="danger-zone-desc">Removes all locally stored data. Your account credentials are preserved.</div>
                    <button className="btn-danger-outline" onClick={clearLocalData}><i className="fa-solid fa-broom me-1"></i>Clear Data</button>
                  </div>
                  {isAdmin && (
                    <div className="danger-zone">
                      <div className="danger-zone-title"><i className="fa-solid fa-user-xmark me-2"></i>Delete Account</div>
                      <div className="danger-zone-desc">Permanently removes your admin account. This action cannot be undone.</div>
                      <button className="btn-danger-outline" onClick={deleteAccount}><i className="fa-solid fa-xmark me-1"></i>Delete Account</button>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>

      <div
        className={`toast-notify ${toast.show ? 'show' : ''}`}
        style={{ borderColor: toast.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)', color: toast.ok ? 'var(--green)' : 'var(--red)' }}
      >
        <i className={`fa-solid ${toast.ok ? 'fa-circle-check' : 'fa-circle-exclamation'}`}></i>
        <span>{toast.msg}</span>
      </div>

      {showConfirmModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div className="c stagger-1" style={{
            width: '100%',
            maxWidth: '400px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            boxShadow: '0 20px 45px rgba(0,0,0,0.4)',
            overflow: 'hidden'
          }}>
            <div className="c-head" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div className="c-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
                <i className="fa-solid fa-triangle-exclamation" style={{ color: 'var(--red)' }}></i>Confirm Action
              </div>
            </div>
            <div className="c-body" style={{ padding: '20px', textAlign: 'center' }}>
              <p style={{ fontSize: '13.5px', color: 'var(--tx1)', marginBottom: '24px', lineHeight: 1.5 }}>
                {confirmMessage}
              </p>
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  type="button" 
                  className="btn-w btn-flex w-100" 
                  onClick={() => setShowConfirmModal(false)}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', cursor: 'pointer', height: '40px', borderRadius: '8px', fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn-r btn-flex w-100"
                  onClick={() => {
                    if (confirmCallback) confirmCallback();
                    setShowConfirmModal(false);
                  }}
                  style={{ background: 'var(--red)', borderColor: 'var(--red)', color: 'white', cursor: 'pointer', height: '40px', borderRadius: '8px', fontWeight: 600 }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
