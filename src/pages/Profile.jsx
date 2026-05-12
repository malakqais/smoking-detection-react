import React, { useState, useEffect, useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import logo from '../assets/LOGO.png';

const AVATAR_COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

const Profile = () => {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "true");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || '{"name":"User","role":"admin","email":"user@example.com"}'));
  const [profilePic, setProfilePic] = useState(() => localStorage.getItem('profilePic') || null);
  const [violationsCount] = useState(() => JSON.parse(localStorage.getItem("violations") || "[]").length);
  
  const [fullName, setFullName] = useState(user.name || "");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [toast, setToast] = useState({ show: false, msg: "", ok: true });
  
  const loginTime = useMemo(() => parseInt(localStorage.getItem("loginTime") || Date.now()), []);
  const [sessionDuration, setSessionDuration] = useState("0m 0s");
  const [lastProfileChange, setLastProfileChange] = useState(() => localStorage.getItem("lastProfileChange"));
  const [lastPassChange, setLastPassChange] = useState(() => localStorage.getItem("lastPassChange"));

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - loginTime) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      setSessionDuration(`${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(timer);
  }, [loginTime]);

  const showToast = (msg, ok = true) => {
    setToast({ show: true, msg, ok });
    setTimeout(() => setToast({ show: false, msg: "", ok: true }), 3000);
  };

  const getInitials = (name) => {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  };

  const colorForName = (name) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  };

  const completion = useMemo(() => {
    const steps = [
      { id: "name", done: fullName.trim().length > 0 },
      { id: "email", done: user.email.trim().length > 0 },
      { id: "photo", done: !!profilePic },
      { id: "pass", done: !!lastPassChange },
    ];
    const count = steps.filter(s => s.done).length;
    const pct = Math.round((count / steps.length) * 100);
    return { pct, steps };
  }, [fullName, user.email, profilePic, lastPassChange]);

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setProfilePic(ev.target.result);
      localStorage.setItem("profilePic", ev.target.result);
      showToast("Profile photo updated");
    };
    reader.readAsDataURL(file);
  };

  const saveChanges = () => {
    if (newPass && newPass !== confirmPass) {
      showToast("Passwords do not match", false);
      return;
    }

    const updatedUser = { ...user, name: fullName };
    setUser(updatedUser);
    localStorage.setItem("user", JSON.stringify(updatedUser));
    
    const now = Date.now();
    localStorage.setItem("lastProfileChange", now);
    setLastProfileChange(now);

    if (newPass) {
      localStorage.setItem("lastPassChange", now);
      setLastPassChange(now);
      setNewPass("");
      setConfirmPass("");
    }

    showToast("Profile saved successfully");
  };

  const clearLocalData = () => {
    if (!window.confirm("Clear all local data? Violations and preferences will be reset.")) return;
    const keep = { isLoggedIn: localStorage.getItem("isLoggedIn"), user: localStorage.getItem("user") };
    localStorage.clear();
    localStorage.setItem("isLoggedIn", keep.isLoggedIn);
    localStorage.setItem("user", keep.user);
    window.location.reload();
  };

  const deleteAccount = () => {
    if (!window.confirm("Delete your account permanently? This cannot be undone.")) return;
    localStorage.clear();
    navigate('/logout');
  };

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
          <button className="sb-collapse-btn" onClick={() => { setSidebarCollapsed(!sidebarCollapsed); localStorage.setItem("sidebarCollapsed", !sidebarCollapsed); }}>
            <i className={`fa-solid ${sidebarCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`}></i>
          </button>
        </div>
        <nav className="sb-nav">
          <div className="sb-section">Main</div>
          <NavLink className="sb-item" to="/"><i className="fa-solid fa-gauge-high"></i><span className="sb-label">Dashboard</span></NavLink>
          <NavLink className="sb-item" to="/analytics"><i className="fa-solid fa-chart-pie"></i><span className="sb-label">Analytics</span></NavLink>
          {user.role === 'admin' && <NavLink className="sb-item" to="/admin"><i className="fa-solid fa-user-shield"></i><span className="sb-label">Admin Panel</span></NavLink>}
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
            <div><div className="pg-title">Profile</div><div className="pg-sub">Manage your account</div></div>
          </div>
          <div className="tb-right">
            <div className="ib" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <i className="fa-solid fa-moon"></i> : <i className="fa-solid fa-sun" style={{ color: 'var(--amber)' }}></i>}
            </div>
            <NavLink to="/settings" className="ib"><i className="fa-solid fa-gear"></i></NavLink>
          </div>
        </header>

        <div className="content fade-in">
          <div className="row g-3">
            <div className="col-lg-4">
              <div className="c" style={{ overflow: 'visible' }}>
                <div className="prof-cover"></div>
                <div style={{ padding: '0 22px 18px' }}>
                  <div className="prof-av-wrap">
                    <div className="prof-av-inner">
                      {profilePic ? (
                        <img src={profilePic} className="prof-av" alt="Profile" />
                      ) : (
                        <div className="prof-av-initials" style={{ background: colorForName(user.name) }}>{getInitials(user.name)}</div>
                      )}
                      <label htmlFor="uploadPic" className="prof-av-btn"><i className="fa-solid fa-camera"></i></label>
                      <input type="file" id="uploadPic" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
                    </div>
                  </div>
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '17px', fontWeight: '800', color: 'var(--tx1)' }}>{user.name}</div>
                    <div style={{ fontSize: '12.5px', color: 'var(--tx3)' }}>{user.email}</div>
                    <div style={{ marginTop: '10px' }}>
                      <span className={`tag ${user.role === 'admin' ? 'r' : 'g'}`}>
                        <i className={`fa-solid ${user.role === 'admin' ? 'fa-shield' : 'fa-user'} me-1`}></i>
                        {user.role === 'admin' ? 'Administrator' : 'Standard User'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="completion-bar-wrap">
                  <div className="completion-label"><span>Profile Completion</span><strong>{completion.pct}%</strong></div>
                  <div className="completion-track"><div className="completion-fill" style={{ width: `${completion.pct}%` }}></div></div>
                  <div className="completion-steps">
                    {completion.steps.map(s => (
                      <div key={s.id} className={`completion-step ${s.done ? 'done' : ''}`}>
                        <i className={`fa-solid ${s.done ? 'fa-circle-check' : 'fa-circle-xmark'}`}></i> {s.id.charAt(0).toUpperCase() + s.id.slice(1)}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', padding: '16px 22px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="stat-pill">
                      <div className="stat-pill-icon" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}><i className="fa-solid fa-triangle-exclamation"></i></div>
                      <div><div className="stat-pill-val">{violationsCount}</div><div className="stat-pill-lbl">Violations</div></div>
                    </div>
                    <div className="stat-pill">
                      <div className="stat-pill-icon" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--blue)' }}><i className="fa-solid fa-video"></i></div>
                      <div><div className="stat-pill-val">3</div><div className="stat-pill-lbl">Cameras</div></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-lg-8" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="c">
                <div className="c-head"><div className="c-title"><i className="fa-solid fa-pen me-2" style={{ color: 'var(--blue)' }}></i>Edit Profile</div></div>
                <div className="c-body">
                  <div className="section-hdr">Personal Information</div>
                  <div className="row g-3 mb-4">
                    <div className="col-md-6">
                      <div className="fgroup mb-0">
                        <label className="flabel">Full Name</label>
                        <div className="input-icon-wrap">
                          <i className="fa-solid fa-user"></i>
                          <input type="text" className="finput" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                        </div>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="fgroup mb-0">
                        <label className="flabel">Email Address</label>
                        <div className="input-icon-wrap"><i className="fa-solid fa-envelope"></i><input type="text" className="finput" value={user.email} readOnly disabled /></div>
                      </div>
                    </div>
                  </div>
                  <div className="section-hdr">Security</div>
                  <div className="row g-3 mb-4">
                    <div className="col-md-6">
                      <div className="fgroup mb-0">
                        <label className="flabel">New Password</label>
                        <div className="input-icon-wrap"><i className="fa-solid fa-lock"></i><input type="password" className="finput" value={newPass} onChange={(e) => setNewPass(e.target.value)} /></div>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="fgroup mb-0">
                        <label className="flabel">Confirm Password</label>
                        <div className="input-icon-wrap"><i className="fa-solid fa-lock"></i><input type="password" className="finput" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} /></div>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" onClick={() => { setFullName(user.name); setNewPass(""); setConfirmPass(""); }}>Reset</button>
                    <button className="btn-r" onClick={saveChanges}><i className="fa-solid fa-check me-1"></i>Save Changes</button>
                  </div>
                </div>
              </div>

              <div className="c">
                <div className="c-head"><div className="c-title"><i className="fa-solid fa-clock-rotate-left me-2" style={{ color: 'var(--purple)' }}></i>Activity Log</div></div>
                <div className="c-body">
                  <div className="activity-item">
                    <div className="activity-icon" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--green)' }}><i className="fa-solid fa-right-to-bracket"></i></div>
                    <div><div className="activity-title">Session Started</div><div className="activity-time">{new Date(loginTime).toLocaleString()}</div></div>
                  </div>
                  <div className="activity-item">
                    <div className="activity-icon" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--blue)' }}><i className="fa-solid fa-pen-to-square"></i></div>
                    <div><div className="activity-title">Last Profile Change</div><div className="activity-time">{lastProfileChange ? new Date(parseInt(lastProfileChange)).toLocaleString() : "Never"}</div></div>
                  </div>
                  <div className="activity-item">
                    <div className="activity-icon" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--amber)' }}><i className="fa-solid fa-clock"></i></div>
                    <div><div className="activity-title">Session Duration</div><div className="activity-time">{sessionDuration}</div></div>
                  </div>
                </div>
              </div>

              <div className="c">
                <div className="c-head"><div className="c-title" style={{ color: 'var(--red)' }}><i className="fa-solid fa-triangle-exclamation me-2"></i>Danger Zone</div></div>
                <div className="c-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="danger-zone">
                    <div className="danger-zone-title"><i className="fa-solid fa-trash me-2"></i>Clear All Local Data</div>
                    <div className="danger-zone-desc">Removes all locally stored data. Credentials are preserved.</div>
                    <button className="btn-danger-outline" onClick={clearLocalData}><i className="fa-solid fa-broom me-1"></i>Clear Data</button>
                  </div>
                  {user.role === 'admin' && (
                    <div className="danger-zone">
                      <div className="danger-zone-title"><i className="fa-solid fa-user-xmark me-2"></i>Delete Account</div>
                      <div className="danger-zone-desc">Permanently removes your account. This action cannot be undone.</div>
                      <button className="btn-danger-outline" onClick={deleteAccount}><i className="fa-solid fa-xmark me-1"></i>Delete Account</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <div className={`toast-notify ${toast.show ? 'show' : ''}`} style={{ 
        borderColor: toast.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
        color: toast.ok ? 'var(--green)' : 'var(--red)'
      }}>
        <i className={`fa-solid ${toast.ok ? 'fa-circle-check' : 'fa-circle-exclamation'}`}></i>
        <span>{toast.msg}</span>
      </div>
    </div>
  );
};

export default Profile;
