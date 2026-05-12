import React, { useState, useEffect, useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import logo from '../assets/LOGO.png';

const Settings = () => {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "true");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || '{"name":"User","role":"admin","email":"user@example.com"}'));
  const [activePanel, setActivePanel] = useState('account');
  const [toast, setToast] = useState({ show: false, msg: "", ok: true });
  
  const [name, setName] = useState(user.name);
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [confThresh, setConfThresh] = useState(85);
  
  const bootTime = useMemo(() => Date.now(), []);
  const [uptime, setUptime] = useState("0m 0s");
  const violationsCount = useMemo(() => JSON.parse(localStorage.getItem("violations") || "[]").length, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - bootTime) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      setUptime(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(timer);
  }, [bootTime]);

  const showToast = (msg, ok = true) => {
    setToast({ show: true, msg, ok });
    setTimeout(() => setToast({ show: false, msg: "", ok: true }), 3000);
  };

  const saveAll = () => {
    if (newPass && newPass !== confirmPass) {
      showToast("Passwords do not match", false);
      return;
    }
    const updatedUser = { ...user, name };
    setUser(updatedUser);
    localStorage.setItem("user", JSON.stringify(updatedUser));
    if (newPass) localStorage.setItem("lastPassChange", Date.now());
    setNewPass("");
    setConfirmPass("");
    showToast("All settings saved successfully");
  };

  const testSmtp = () => {
    setSmtpTesting(true);
    setTimeout(() => {
      setSmtpTesting(false);
      showToast("Test email sent to " + user.email);
    }, 1800);
  };

  const clearHistory = async () => {
    if (!window.confirm("Permanently clear all violation history?")) return;
    try {
      const response = await fetch('/clear_logs', { method: 'POST' });
      if (response.ok) {
        localStorage.removeItem("violations");
        showToast("All logs and images cleared");
      } else {
        showToast("Error clearing logs", false);
      }
    } catch (e) {
      showToast("Network error", false);
    }
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
            <div><div className="pg-title">Settings</div><div className="pg-sub">Configure system preferences</div></div>
          </div>
          <div className="tb-right">
            <div className="ib" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <i className="fa-solid fa-moon"></i> : <i className="fa-solid fa-sun" style={{ color: 'var(--amber)' }}></i>}
            </div>
            <button className="btn-r btn-sm" onClick={saveAll}><i className="fa-solid fa-check me-1"></i>Save All</button>
          </div>
        </header>

        <div className="content fade-in">
          <div className="row g-3">
            <div className="col-lg-3">
              <div className="c">
                <div className="c-body" style={{ padding: '10px' }}>
                  <div className="settings-nav">
                    <div className={`snav-item ${activePanel === 'account' ? 'active' : ''}`} onClick={() => setActivePanel('account')}>
                      <i className="nav-icon fa-solid fa-user"></i> Account
                    </div>
                    <div className={`snav-item ${activePanel === 'notifications' ? 'active' : ''}`} onClick={() => setActivePanel('notifications')}>
                      <i className="nav-icon fa-solid fa-bell"></i> Notifications
                    </div>
                    {user.role === 'admin' && (
                      <>
                        <div className={`snav-item ${activePanel === 'cameras' ? 'active' : ''}`} onClick={() => setActivePanel('cameras')}>
                          <i className="nav-icon fa-solid fa-video"></i> Cameras
                        </div>
                        <div className={`snav-item ${activePanel === 'detection' ? 'active' : ''}`} onClick={() => setActivePanel('detection')}>
                          <i className="nav-icon fa-solid fa-crosshairs"></i> Detection
                        </div>
                        <div className="snav-sep"></div>
                        <div className={`snav-item ${activePanel === 'sysinfo' ? 'active' : ''}`} onClick={() => setActivePanel('sysinfo')}>
                          <i className="nav-icon fa-solid fa-microchip"></i> System Info
                        </div>
                        <div className={`snav-item ${activePanel === 'danger' ? 'active' : ''}`} onClick={() => setActivePanel('danger')}>
                          <i className="nav-icon fa-solid fa-triangle-exclamation" style={{ color: 'var(--red)' }}></i>
                          <span style={{ color: 'var(--red)' }}>Danger Zone</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="col-lg-9">
              {/* Account Panel */}
              <div className={`c setting-panel ${activePanel === 'account' ? 'active' : ''}`}>
                <div className="c-head"><div className="c-title"><i className="fa-solid fa-user me-2" style={{ color: 'var(--blue)' }}></i>Account Settings</div></div>
                <div className="c-body">
                  <div className="section-hdr"><i className="fa-solid fa-id-card"></i> Profile Information</div>
                  <div className="row g-3 mb-4">
                    <div className="col-md-6">
                      <div className="fgroup mb-0">
                        <label className="flabel">Full Name</label>
                        <div className="input-icon-wrap"><i className="fa-solid fa-user"></i><input type="text" className="finput" value={name} onChange={e => setName(e.target.value)} /></div>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="fgroup mb-0">
                        <label className="flabel">Email Address</label>
                        <div className="input-icon-wrap"><i className="fa-solid fa-envelope"></i><input type="email" className="finput" value={user.email} readOnly disabled /></div>
                      </div>
                    </div>
                  </div>
                  <div className="section-hdr"><i className="fa-solid fa-lock"></i> Change Password</div>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <div className="fgroup mb-0">
                        <label className="flabel">New Password</label>
                        <div className="input-icon-wrap"><i className="fa-solid fa-lock"></i><input type="password" className="finput" value={newPass} onChange={e => setNewPass(e.target.value)} /></div>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="fgroup mb-0">
                        <label className="flabel">Confirm Password</label>
                        <div className="input-icon-wrap"><i className="fa-solid fa-lock"></i><input type="password" className="finput" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} /></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notifications Panel */}
              <div className={`c setting-panel ${activePanel === 'notifications' ? 'active' : ''}`}>
                <div className="c-head"><div className="c-title"><i className="fa-solid fa-bell me-2" style={{ color: 'var(--amber)' }}></i>Notifications</div></div>
                <div className="c-body">
                  <div className="setting-row">
                    <div className="setting-row-icon" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}><i className="fa-solid fa-envelope-circle-check"></i></div>
                    <div className="setting-row-body"><div className="setting-row-label">Email Alerts</div><div className="setting-row-desc">Receive email notifications for detections.</div></div>
                    <div className="setting-row-ctrl"><div className="form-check form-switch"><input className="form-check-input" type="checkbox" defaultChecked /></div></div>
                  </div>
                  <div className="setting-row">
                    <div className="setting-row-icon" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--amber)' }}><i className="fa-solid fa-volume-high"></i></div>
                    <div className="setting-row-body"><div className="setting-row-label">Sound Alarms</div><div className="setting-row-desc">Play sound on detection.</div></div>
                    <div className="setting-row-ctrl"><div className="form-check form-switch"><input className="form-check-input" type="checkbox" defaultChecked /></div></div>
                  </div>
                  {user.role === 'admin' && (
                    <div className="smtp-test-wrap mt-4">
                      <div className="smtp-test-icon"><i className="fa-solid fa-paper-plane"></i></div>
                      <div className="smtp-test-body"><div className="smtp-test-label">SMTP Test</div><div className="smtp-test-desc">Send test email.</div></div>
                      <button className="btn-ghost" onClick={testSmtp} disabled={smtpTesting}>{smtpTesting ? 'Sending...' : 'Send Test'}</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Cameras Panel */}
              <div className={`c setting-panel ${activePanel === 'cameras' ? 'active' : ''}`}>
                <div className="c-head"><div className="c-title"><i className="fa-solid fa-video me-2" style={{ color: 'var(--green)' }}></i>Cameras</div></div>
                <div className="c-body">
                  {["Main Lobby", "Parking Area", "Cafeteria"].map((loc, i) => (
                    <div key={i} className="cam-row">
                      <div className="cam-row-info">
                        <div className="cam-row-icon"><i className="fa-solid fa-video"></i></div>
                        <div><div className="cam-row-name">Camera {i + 1}</div><div className="cam-row-loc">{loc}</div></div>
                      </div>
                      <div className="form-check form-switch"><input className="form-check-input" type="checkbox" defaultChecked /></div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detection Panel */}
              <div className={`c setting-panel ${activePanel === 'detection' ? 'active' : ''}`}>
                <div className="c-head"><div className="c-title"><i className="fa-solid fa-crosshairs me-2" style={{ color: 'var(--purple)' }}></i>Detection</div></div>
                <div className="c-body">
                  <label className="flabel">Confidence Threshold: {confThresh}%</label>
                  <input type="range" className="form-range w-100 mb-4" min="50" max="99" value={confThresh} onChange={e => setConfThresh(e.target.value)} style={{ accentColor: 'var(--red)' }} />
                  <div className="setting-row">
                    <div className="setting-row-icon" style={{ background: 'rgba(168,85,247,0.1)', color: 'var(--purple)' }}><i className="fa-solid fa-camera"></i></div>
                    <div className="setting-row-body"><div className="setting-row-label">Auto-capture</div><div className="setting-row-desc">Save screenshot on detection.</div></div>
                    <div className="setting-row-ctrl"><div className="form-check form-switch"><input className="form-check-input" type="checkbox" defaultChecked /></div></div>
                  </div>
                </div>
              </div>

              {/* System Info Panel */}
              <div className={`c setting-panel ${activePanel === 'sysinfo' ? 'active' : ''}`}>
                <div className="c-head"><div className="c-title"><i className="fa-solid fa-microchip me-2" style={{ color: 'var(--green)' }}></i>System Info</div></div>
                <div className="c-body">
                  <div className="sysinfo-grid">
                    <div className="sysinfo-item"><div className="sysinfo-label">Model</div><div className="sysinfo-val">YOLOv8n</div><div className="sysinfo-badge">Loaded</div></div>
                    <div className="sysinfo-item"><div className="sysinfo-label">Uptime</div><div className="sysinfo-val">{uptime}</div></div>
                    <div className="sysinfo-item"><div className="sysinfo-label">Detections</div><div className="sysinfo-val">{violationsCount}</div></div>
                    <div className="sysinfo-item"><div className="sysinfo-label">Version</div><div className="sysinfo-val">1.0.0</div></div>
                  </div>
                </div>
              </div>

              {/* Danger Zone Panel */}
              <div className={`c setting-panel ${activePanel === 'danger' ? 'active' : ''}`}>
                <div className="c-head"><div className="c-title" style={{ color: 'var(--red)' }}><i className="fa-solid fa-triangle-exclamation me-2"></i>Danger Zone</div></div>
                <div className="c-body">
                  <div className="danger-zone">
                    <div className="danger-zone-title">Clear History</div>
                    <div className="danger-zone-desc">Delete all records permanently.</div>
                    <button className="btn-danger-outline" onClick={clearHistory}>Clear History</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <div className={`toast-notify ${toast.show ? 'show' : ''}`} style={{ borderColor: toast.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)', color: toast.ok ? 'var(--green)' : 'var(--red)' }}>
        <i className={`fa-solid ${toast.ok ? 'fa-circle-check' : 'fa-circle-exclamation'}`}></i>
        <span>{toast.msg}</span>
      </div>
    </div>
  );
};

export default Settings;
