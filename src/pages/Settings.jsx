import React, { useState, useEffect, useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import logo from '../assets/LOGO.png';
import useDetectionSettingsSync from '../hooks/useDetectionSettingsSync';
import { playAlarmTone } from '../utils/alarmTone';
import { useLocalStorage } from '../components/useLocalStorage';

const NAV = [
  { id: 'account',       icon: 'fa-user',                 label: 'Account',      desc: 'Profile & password' },
  { id: 'appearance',    icon: 'fa-palette',              label: 'Appearance',   desc: 'Theme & display' },
  { id: 'notifications', icon: 'fa-bell',                 label: 'Notifications',desc: 'Alerts & email' },
  { id: 'detection',     icon: 'fa-crosshairs',           label: 'Detection',    desc: 'AI model settings' },
  { id: 'cameras',       icon: 'fa-video',                label: 'Cameras',      desc: 'Camera sources' },
  { id: 'sysinfo',       icon: 'fa-microchip',            label: 'System Info',  desc: 'Runtime metrics' },
  { id: 'danger',        icon: 'fa-triangle-exclamation', label: 'Danger Zone',  desc: 'Destructive actions', danger: true },
];

const ACCENT_COLORS = [
  { name: 'Red',    val: '#ef4444' },
  { name: 'Blue',   val: '#3b82f6' },
  { name: 'Purple', val: '#8b5cf6' },
  { name: 'Green',  val: '#10b981' },
  { name: 'Amber',  val: '#f59e0b' },
  { name: 'Pink',   val: '#ec4899' },
];

const MODELS = [
  { name: 'cigarette_best1.pt', label: 'Cigarette',  color: '#ef4444' },
  { name: 'smoke_best.pt',      label: 'Smoke',      color: '#94a3b8' },
  { name: 'vape_best.pt',       label: 'Vape',       color: '#8b5cf6' },
  { name: 'face_best.pt',       label: 'Face ID',    color: '#3b82f6' },
];

const ALARM_TONES = [
  { id: 'high_beep',        name: 'High Beep (Default)', desc: 'Piercing sine frequency warning tone', color: 'var(--red)' },
  { id: 'double_pulse',     name: 'Double Pulse',        desc: 'Rapid dual-pulse square frequency warning', color: 'var(--amber)' },
  { id: 'cyber_siren',      name: 'Cyber Siren',         desc: 'Dynamic frequency sweeps and slides alert', color: 'var(--blue)' },
  { id: 'soft_chime',       name: 'Soft Chime',          desc: 'Gentle triangle melodic decay chime', color: 'var(--green)' },
  { id: 'nuclear_meltdown', name: 'Nuclear Meltdown',    desc: 'Heavy low-modulated pulsing warning', color: 'var(--amber)' },
];

const Toggle = ({ checked, onChange }) => (
  <div className="form-check form-switch mb-0">
    <input className="form-check-input" type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ cursor: 'pointer' }} />
  </div>
);

const SRow = ({ icon, iconBg, iconColor, label, desc, children }) => (
  <div className="setting-row">
    <div className="setting-row-icon" style={{ background: iconBg, color: iconColor }}>
      <i className={`fa-solid ${icon}`}></i>
    </div>
    <div className="setting-row-body">
      <div className="setting-row-label">{label}</div>
      <div className="setting-row-desc">{desc}</div>
    </div>
    <div className="setting-row-ctrl">{children}</div>
  </div>
);

const Settings = () => {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || '{"name":"User","role":"admin","email":"user@example.com"}'));
  const [activePanel, setActivePanel] = useState('account');
  const [toast, setToast] = useState({ show: false, msg: '', ok: true });

  // Account
  const [name, setName] = useState(user.name);
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');

  // Appearance (theme is already in state above)

  // Notifications
  const [emailAlerts, setEmailAlerts] = useLocalStorage('emailAlerts', true);
  const [soundAlerts, setSoundAlerts] = useLocalStorage('soundAlerts', true);
  const [alarmTone, setAlarmTone] = useLocalStorage('alarmTone', 'high_beep');
  const [alertCooldown, setAlertCooldown] = useLocalStorage('alertCooldown', 60);
  const [smtpSender, setSmtpSender] = useState('');
  const [smtpAppPass, setSmtpAppPass] = useState('');
  const [smtpRecipient, setSmtpRecipient] = useState(user.email);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(false);

  // Detection
  const [throttle, setThrottle] = useLocalStorage('throttle', 60);
  const [autoCapture, setAutoCapture] = useLocalStorage('autoCapture', true);
  const { confThresh, setConfThresh, enabledClasses, updateEnabledClasses } = useDetectionSettingsSync();

  // Security
  const [twoFA, setTwoFA] = useState(() => user.two_factor_enabled === 1 || localStorage.getItem('twoFA') === 'true');
  const [autoLogout, setAutoLogout] = useLocalStorage('autoLogout', true);
  const [logoutTimeout, setLogoutTimeout] = useLocalStorage('logoutTimeout', 30);
  const [loginNotif, setLoginNotif] = useLocalStorage('loginNotif', true);

  // Google 2FA Setup States
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [twoFASecret, setTwoFASecret] = useState('');
  const [twoFAQrUrl, setTwoFAQrUrl] = useState('');
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFAError, setTwoFAError] = useState('');
  const [verifying2FA, setVerifying2FA] = useState(false);

  // Custom confirmation modal states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmCallback, setConfirmCallback] = useState(null);

  // Appearance extras
  const [compactMode, setCompactMode] = useLocalStorage('compactMode', false);

  // Cameras
  const [cameras, setCameras] = useState(() => {
    const saved = localStorage.getItem('cameras');
    if (saved) return JSON.parse(saved);
    return [
      { id: 0, name: 'Camera 0', location: 'Main Lobby',   enabled: true },
      { id: 1, name: 'Camera 1', location: 'Parking Area', enabled: false },
      { id: 2, name: 'Camera 2', location: 'Cafeteria',    enabled: false },
    ];
  });

  // System
  const loginTime = useMemo(() => parseInt(localStorage.getItem('loginTime') || Date.now()), []);
  const [uptime, setUptime] = useState('0m 0s');
  const [currentSessionStartedAt, setCurrentSessionStartedAt] = useState(() => parseInt(localStorage.getItem('loginTime') || Date.now()));
  const [lastProfileChangeAt, setLastProfileChangeAt] = useState(() => localStorage.getItem('lastProfileChange'));
  const [lastPassChangeAt, setLastPassChangeAt] = useState(() => localStorage.getItem('lastPassChange'));
  const [lastLoginNotificationAt, setLastLoginNotificationAt] = useState(() => localStorage.getItem('lastLoginNotificationAt'));

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-compact', compactMode ? 'true' : 'false');
  }, [compactMode]);

  useEffect(() => {
    localStorage.setItem('twoFA', twoFA);
  }, [twoFA]);

  useEffect(() => {
    fetch('/api/detection/settings')
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.email_alerts === 'boolean') setEmailAlerts(data.email_alerts);
        if (data.alert_cooldown !== null && data.alert_cooldown !== undefined) {
          setAlertCooldown(Number(data.alert_cooldown));
        }
      })
      .catch(() => {});
  }, [setAlertCooldown, setEmailAlerts]);

  useEffect(() => {
    if (user.role !== 'admin') return;
    fetch('/api/settings/smtp')
      .then((r) => r.json())
      .then((data) => {
        if (data.smtp_sender) setSmtpSender(data.smtp_sender);
        if (data.smtp_recipient) setSmtpRecipient(data.smtp_recipient);
        if (typeof data.smtp_password_set === 'boolean') setSmtpPasswordSet(data.smtp_password_set);
      })
      .catch(() => {});
  }, [user.role]);

  useEffect(() => {
    const t = setTimeout(() => {
      fetch('/api/detection/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_alerts: emailAlerts,
          alert_cooldown: alertCooldown,
        }),
      }).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [emailAlerts, alertCooldown]);

  useEffect(() => {
    const t = setInterval(() => {
      const e = Math.floor((Date.now() - loginTime) / 1000);
      const h = Math.floor(e / 3600), m = Math.floor((e % 3600) / 60), s = e % 60;
      setUptime(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(t);
  }, [loginTime]);

  const showToast = (msg, ok = true) => {
    setToast({ show: true, msg, ok });
    setTimeout(() => setToast({ show: false, msg: '', ok: true }), 3000);
  };

  const playTestTone = (toneId) => {
    playAlarmTone(toneId);
  };

  const saveAll = async () => {
    if (newPass && newPass !== confirmPass) { showToast('Passwords do not match', false); return; }
    try {
      const payload = { email: user.email, name };
      if (newPass) payload.password = newPass;

      const res = await fetch('/api/users/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });
      
      if (res.ok) {
          const updated = { ...user, name };
          setUser(updated);
          localStorage.setItem('user', JSON.stringify(updated));
          localStorage.setItem('lastProfileChange', Date.now().toString());
          setLastProfileChangeAt(localStorage.getItem('lastProfileChange'));
          if (newPass) {
            localStorage.setItem('lastPassChange', Date.now().toString());
            setLastPassChangeAt(localStorage.getItem('lastPassChange'));
            setNewPass('');
            setConfirmPass('');
          }
          showToast('Settings saved successfully');
      } else {
          showToast('Error saving settings', false);
      }
    } catch (e) {
      showToast('Network error', false);
    }
  };

  const handleTwoFAChange = async (enable) => {
    if (enable) {
      try {
        const res = await fetch('/api/2fa/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email })
        });
        if (res.ok) {
          const data = await res.json();
          setTwoFASecret(data.secret);
          setTwoFAQrUrl(data.qr_code_url);
          setTwoFACode("");
          setTwoFAError("");
          setShow2FAModal(true);
        } else {
          showToast('Failed to initialize 2FA setup', false);
        }
      } catch {
        showToast('Network error during 2FA setup', false);
      }
    } else {
      try {
        const res = await fetch('/api/2fa/disable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email })
        });
        if (res.ok) {
          setTwoFA(false);
          const updated = { ...user, two_factor_enabled: 0 };
          setUser(updated);
          localStorage.setItem('user', JSON.stringify(updated));
          localStorage.setItem('twoFA', 'false');
          showToast('Two-factor authentication disabled.');
        } else {
          showToast('Failed to disable Two-Factor', false);
        }
      } catch {
        showToast('Network error', false);
      }
    }
  };

  const verify2FA = async (e) => {
    e.preventDefault();
    if (twoFACode.length < 6) {
      setTwoFAError("Please enter the 6-digit code.");
      return;
    }
    setVerifying2FA(true);
    setTwoFAError("");
    try {
      const res = await fetch('/api/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, code: twoFACode, secret: twoFASecret })
      });
      if (res.ok) {
        setTwoFA(true);
        const updated = { ...user, two_factor_enabled: 1 };
        setUser(updated);
        localStorage.setItem('user', JSON.stringify(updated));
        localStorage.setItem('twoFA', 'true');
        setShow2FAModal(false);
        showToast('Two-Factor successfully enabled!');
      } else {
        const data = await res.json().catch(() => ({ message: "Invalid verification code." }));
        setTwoFAError(data.message || "Invalid verification code. Please check your app.");
      }
    } catch {
      setTwoFAError("Connection error. Make sure the server is online.");
    } finally {
      setVerifying2FA(false);
    }
  };

  const testSmtp = async () => {
    if (!smtpRecipient) {
      showToast('Please enter an alert recipient email first', false);
      return;
    }
    setSmtpTesting(true);
    try {
      const res = await fetch('/api/settings/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: smtpRecipient,
          smtp_sender: smtpSender,
          smtp_app_password: smtpAppPass,
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        showToast(data.message || 'Test email sent to ' + smtpRecipient);
      } else {
        showToast(data.message || 'Failed to send test email', false);
      }
    } catch (err) {
      showToast('Network error while sending email', false);
    } finally {
      setSmtpTesting(false);
    }
  };

  const saveSmtp = async () => {
    if (!smtpSender || (!smtpAppPass && !smtpPasswordSet)) {
      showToast('SMTP sender and app password are required', false);
      return;
    }
    setSmtpSaving(true);
    try {
      const res = await fetch('/api/settings/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtp_sender: smtpSender,
          smtp_app_password: smtpAppPass,
          smtp_recipient: smtpRecipient,
        }),
      });
      if (res.ok) {
        setSmtpPasswordSet(!!smtpAppPass || smtpPasswordSet);
        setSmtpAppPass('');
        showToast('SMTP settings saved');
      } else {
        showToast('Failed to save SMTP settings', false);
      }
    } catch (e) {
      showToast('Network error while saving SMTP settings', false);
    } finally {
      setSmtpSaving(false);
    }
  };

  const clearHistory = () => {
    setConfirmMessage("Are you sure you want to permanently clear all violation history from the system database? This cannot be undone.");
    setConfirmCallback(() => async () => {
      try {
        const r = await fetch('/api/violations/clear', { method: 'POST' });
        if (r.ok) showToast('All violation history cleared');
        else showToast('Error clearing history', false);
      } catch { showToast('Network error', false); }
    });
    setShowConfirmModal(true);
  };

  const updateCamera = (id, field, val) => {
    const newCams = cameras.map(c => c.id === id ? { ...c, [field]: val } : c);
    setCameras(newCams);
    localStorage.setItem('cameras', JSON.stringify(newCams));
  };

  const confColor = confThresh >= 80 ? 'var(--green)' : confThresh >= 65 ? 'var(--amber)' : 'var(--red)';
  const isDark = theme === 'dark';

  const visibleNav = NAV.filter(n => !['detection','cameras','sysinfo','danger'].includes(n.id) || user.role === 'admin');

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
            <div>
              <div className="pg-title">Settings</div>
              <div className="pg-sub">System preferences — {user.name}</div>
            </div>
          </div>
          <div className="tb-right">
            <div className="ib" onClick={() => setTheme(isDark ? 'light' : 'dark')} title="Toggle theme">
              {isDark ? <i className="fa-solid fa-moon"></i> : <i className="fa-solid fa-sun" style={{ color: 'var(--amber)' }}></i>}
            </div>
            <button className="btn-r btn-sm" onClick={saveAll}><i className="fa-solid fa-floppy-disk me-1"></i>Save All</button>
          </div>
        </header>

        <div className="content fade-in">
          {/* Quick Overview */}
          <div className="settings-overview mb-4">
            <div className="sov-card">
              <div className="sov-card-icon" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--red)' }}>
                <i className="fa-solid fa-circle-user"></i>
              </div>
              <div className="sov-card-body">
                <div className="sov-card-label">Signed in as</div>
                <div className="sov-card-val">{user.name}</div>
                <div className="sov-card-sub">{user.role} · <span style={{ color: 'var(--green)' }}>● Active</span></div>
              </div>
            </div>
            <div className="sov-card" onClick={() => setTheme(isDark ? 'light' : 'dark')} style={{ cursor: 'pointer' }}>
              <div className="sov-card-icon" style={{ background: isDark ? 'rgba(148,163,184,0.1)' : 'rgba(245,158,11,0.12)', color: isDark ? 'var(--tx2)' : 'var(--amber)' }}>
                <i className={`fa-solid ${isDark ? 'fa-moon' : 'fa-sun'}`}></i>
              </div>
              <div className="sov-card-body">
                <div className="sov-card-label">Interface Theme</div>
                <div className="sov-card-val">{isDark ? 'Dark Mode' : 'Light Mode'}</div>
                <div className="sov-card-sub">Click to switch</div>
              </div>
            </div>
            <div className="sov-card">
              <div className="sov-card-icon" style={{ background: (emailAlerts || soundAlerts) ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.1)', color: (emailAlerts || soundAlerts) ? 'var(--green)' : 'var(--tx3)' }}>
                <i className="fa-solid fa-bell"></i>
              </div>
              <div className="sov-card-body">
                <div className="sov-card-label">Alert Channels</div>
                <div className="sov-card-val">{[emailAlerts && 'Email', soundAlerts && 'Sound'].filter(Boolean).join(' + ') || 'All Off'}</div>
                <div className="sov-card-sub">{alertCooldown}s cooldown</div>
              </div>
            </div>
            {user.role === 'admin' ? (
              <div className="sov-card">
                <div className="sov-card-icon" style={{ background: 'rgba(139,92,246,0.12)', color: 'var(--purple)' }}>
                  <i className="fa-solid fa-crosshairs"></i>
                </div>
                <div className="sov-card-body">
                  <div className="sov-card-label">Detection</div>
                  <div className="sov-card-val">{confThresh}% threshold</div>
                  <div className="sov-card-sub">{Object.values(enabledClasses).filter(Boolean).length} classes active</div>
                </div>
              </div>
            ) : (
              <div className="sov-card">
                <div className="sov-card-icon" style={{ background: twoFA ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)', color: twoFA ? 'var(--green)' : 'var(--red)' }}>
                  <i className="fa-solid fa-shield-halved"></i>
                </div>
                <div className="sov-card-body">
                  <div className="sov-card-label">Security</div>
                  <div className="sov-card-val">2FA {twoFA ? 'On' : 'Off'}</div>
                  <div className="sov-card-sub">Auto-logout {autoLogout ? `${logoutTimeout}m` : 'disabled'}</div>
                </div>
              </div>
            )}
          </div>

          <div className="row g-3 align-items-start">
            {/* Settings Nav */}
            <div className="col-lg-3">
              <div className="c" style={{ position: 'sticky', top: 0 }}>
                <div className="c-body" style={{ padding: '8px' }}>
                  {visibleNav.map((n, i) => (
                    <React.Fragment key={n.id}>
                      {n.danger && <div className="snav-sep"></div>}
                      <div
                        className={`snav-item ${activePanel === n.id ? 'active' : ''}`}
                        onClick={() => setActivePanel(n.id)}
                        style={n.danger ? { color: 'var(--red)' } : {}}
                      >
                        <div className="snav-item-icon">
                          <i className={`fa-solid ${n.icon}`} style={n.danger ? { color: 'var(--red)' } : {}}></i>
                        </div>
                        <div className="snav-item-text">
                          <div className="snav-item-label">{n.label}</div>
                          <div className="snav-item-desc">{n.desc}</div>
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>

            <div className="col-lg-9">
              {/* ── Account ── */}
              <div className={`c setting-panel ${activePanel === 'account' ? 'active' : ''}`}>
                <div className="c-head">
                  <div>
                    <div className="c-title"><i className="fa-solid fa-user me-2" style={{ color: 'var(--blue)' }}></i>Account Settings</div>
                    <div className="c-sub">Manage your profile information and credentials</div>
                  </div>
                </div>
                <div className="c-body">
                  {/* Profile Hero */}
                  <div className="profile-hero mb-4">
                    <div className="profile-hero-avatar">{(name || 'U').charAt(0).toUpperCase()}</div>
                    <div className="profile-hero-meta">
                      <div className="profile-hero-name">{name || 'Unknown User'}</div>
                      <div className="profile-hero-badge"><i className="fa-solid fa-shield-halved me-1"></i>{user.role}</div>
                      <div className="profile-hero-email"><i className="fa-solid fa-envelope me-1" style={{ opacity: 0.6 }}></i>{user.email}</div>
                    </div>
                    <div className="profile-hero-stats">
                      <div className="profile-hero-stat">
                        <div className="profile-hero-stat-val" style={{ color: 'var(--green)' }}>●</div>
                        <div className="profile-hero-stat-label">Online</div>
                      </div>
                      <div className="profile-hero-stat">
                        <div className="profile-hero-stat-val">2025</div>
                        <div className="profile-hero-stat-label">Since</div>
                      </div>
                      <div className="profile-hero-stat">
                        <div className="profile-hero-stat-val">{user.role === 'admin' ? 'Full' : 'View'}</div>
                        <div className="profile-hero-stat-label">Access</div>
                      </div>
                    </div>
                  </div>

                  <div className="section-hdr"><i className="fa-solid fa-id-card me-2"></i>Profile Information</div>
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
                    <div className="col-md-6">
                      <div className="fgroup mb-0">
                        <label className="flabel">Role</label>
                        <div className="input-icon-wrap"><i className="fa-solid fa-shield-halved"></i><input type="text" className="finput" value={user.role} readOnly disabled /></div>
                      </div>
                    </div>
                  </div>

                  <div className="section-hdr"><i className="fa-solid fa-lock me-2"></i>Change Password</div>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <div className="fgroup mb-0">
                        <label className="flabel">New Password</label>
                        <div className="input-icon-wrap"><i className="fa-solid fa-lock"></i><input type="password" className="finput" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="New password" /></div>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="fgroup mb-0">
                        <label className="flabel">Confirm Password</label>
                        <div className="input-icon-wrap"><i className="fa-solid fa-lock"></i><input type="password" className="finput" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="Repeat password" /></div>
                      </div>
                    </div>
                  </div>
                  {newPass && newPass !== confirmPass && (
                    <div className="mt-2" style={{ color: 'var(--red)', fontSize: '13px' }}><i className="fa-solid fa-circle-exclamation me-1"></i>Passwords do not match</div>
                  )}

                  <div className="section-hdr mt-4"><i className="fa-solid fa-shield-halved me-2"></i>Security</div>
                  <SRow icon="fa-mobile-screen" iconBg="rgba(59,130,246,0.1)" iconColor="var(--blue)" label="Two-Factor Authentication" desc="Require a verification code in addition to your password on login">
                    <Toggle checked={twoFA} onChange={handleTwoFAChange} />
                  </SRow>
                  <SRow icon="fa-right-from-bracket" iconBg="rgba(245,158,11,0.1)" iconColor="var(--amber)" label="Auto Logout" desc="Automatically end your session after a period of inactivity">
                    <Toggle checked={autoLogout} onChange={setAutoLogout} />
                  </SRow>
                  {autoLogout && (
                    <div className="mt-3 mb-2 ps-0">
                      <div className="d-flex justify-content-between mb-1">
                        <span className="flabel mb-0">Inactivity timeout</span>
                        <span style={{ color: 'var(--amber)', fontWeight: 600, fontSize: '14px' }}>{logoutTimeout} min</span>
                      </div>
                      <input type="range" className="form-range w-100" min="5" max="120" step="5" value={logoutTimeout} onChange={e => setLogoutTimeout(+e.target.value)} style={{ accentColor: 'var(--amber)' }} />
                      <div className="d-flex justify-content-between" style={{ color: 'var(--tx3)', fontSize: '12px' }}>
                        <span>5 min (strict)</span><span>2 hours (relaxed)</span>
                      </div>
                    </div>
                  )}
                  <SRow icon="fa-key" iconBg="rgba(16,185,129,0.1)" iconColor="var(--green)" label="Login Notifications" desc="Get an email alert whenever a new session is started with your account">
                    <Toggle checked={loginNotif} onChange={setLoginNotif} />
                  </SRow>
                  <div style={{ color: 'var(--tx3)', fontSize: '12px', marginTop: '-6px', marginBottom: '6px' }}>
                    Last notification: {lastLoginNotificationAt ? new Date(parseInt(lastLoginNotificationAt, 10)).toLocaleString() : 'Never'}
                  </div>

                  <div className="section-hdr mt-4"><i className="fa-solid fa-clock-rotate-left me-2"></i>Recent Activity</div>
                  <div className="activity-list">
                    <div className="activity-item">
                      <div className="activity-dot" style={{ background: 'var(--green)' }}></div>
                      <div className="activity-body">
                        <div className="activity-title">Session started</div>
                        <div className="activity-sub">This device · {new Date(currentSessionStartedAt).toLocaleString()}</div>
                      </div>
                      <span className="tag g">Current</span>
                    </div>
                    <div className="activity-item">
                      <div className="activity-dot" style={{ background: 'var(--blue)' }}></div>
                      <div className="activity-body">
                        <div className="activity-title">Password changed</div>
                        <div className="activity-sub">This device · {lastPassChangeAt ? new Date(parseInt(lastPassChangeAt, 10)).toLocaleString() : 'Never'}</div>
                      </div>
                    </div>
                    <div className="activity-item">
                      <div className="activity-dot" style={{ background: 'var(--tx3)' }}></div>
                      <div className="activity-body">
                        <div className="activity-title">Profile updated</div>
                        <div className="activity-sub">This device · {lastProfileChangeAt ? new Date(parseInt(lastProfileChangeAt, 10)).toLocaleString() : 'Never'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Appearance ── */}
              <div className={`c setting-panel ${activePanel === 'appearance' ? 'active' : ''}`}>
                <div className="c-head">
                  <div>
                    <div className="c-title"><i className="fa-solid fa-palette me-2" style={{ color: 'var(--purple)' }}></i>Appearance</div>
                    <div className="c-sub">Customize the look and feel of the interface</div>
                  </div>
                </div>
                <div className="c-body">
                  <div className="section-hdr mb-3"><i className="fa-solid fa-circle-half-stroke me-2"></i>Color Theme</div>
                  <div className="theme-picker-row mb-4">
                    <div
                      className={`theme-card ${!isDark ? 'selected' : ''}`}
                      onClick={() => setTheme('light')}
                    >
                      <div className="theme-preview light-preview">
                        <div className="tp-sidebar"></div>
                        <div className="tp-content">
                          <div className="tp-bar"></div>
                          <div className="tp-card"></div>
                          <div className="tp-card"></div>
                        </div>
                      </div>
                      <div className="theme-label">
                        <i className="fa-solid fa-sun me-1"></i>Light Mode
                        {!isDark && <i className="fa-solid fa-circle-check ms-2" style={{ color: 'var(--green)' }}></i>}
                      </div>
                    </div>
                    <div
                      className={`theme-card ${isDark ? 'selected' : ''}`}
                      onClick={() => setTheme('dark')}
                    >
                      <div className="theme-preview dark-preview">
                        <div className="tp-sidebar"></div>
                        <div className="tp-content">
                          <div className="tp-bar"></div>
                          <div className="tp-card"></div>
                          <div className="tp-card"></div>
                        </div>
                      </div>
                      <div className="theme-label">
                        <i className="fa-solid fa-moon me-1"></i>Dark Mode
                        {isDark && <i className="fa-solid fa-circle-check ms-2" style={{ color: 'var(--green)' }}></i>}
                      </div>
                    </div>
                  </div>

                  <div className="section-hdr mt-4 mb-3"><i className="fa-solid fa-sliders me-2"></i>Display Options</div>
                  <SRow icon="fa-compress" iconBg="rgba(139,92,246,0.1)" iconColor="var(--purple)" label="Compact Mode" desc="Reduce card padding and spacing for a denser information layout">
                    <Toggle checked={compactMode} onChange={setCompactMode} />
                  </SRow>
                  <SRow icon="fa-table-columns" iconBg="rgba(59,130,246,0.1)" iconColor="var(--blue)" label="Collapse Sidebar by Default" desc="Start with the navigation sidebar minimized on every page load">
                    <Toggle checked={sidebarCollapsed} onChange={(v) => { setSidebarCollapsed(v); localStorage.setItem('sidebarCollapsed', v); }} />
                  </SRow>

                  <div className="section-hdr mt-4 mb-3"><i className="fa-solid fa-swatchbook me-2"></i>Accent Color</div>
                  <div className="accent-color-row mb-2">
                    {ACCENT_COLORS.map(ac => (
                      <button
                        key={ac.val}
                        className="accent-dot"
                        style={{ background: ac.val, boxShadow: `0 0 0 3px transparent` }}
                        title={ac.name}
                        onClick={() => document.documentElement.style.setProperty('--red', ac.val)}
                      >
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--tx3)' }}>Changes the accent color used across buttons, active states, and highlights.</div>

                </div>
              </div>

              {/* ── Notifications ── */}
              <div className={`c setting-panel ${activePanel === 'notifications' ? 'active' : ''}`}>
                <div className="c-head">
                  <div>
                    <div className="c-title"><i className="fa-solid fa-bell me-2" style={{ color: 'var(--amber)' }}></i>Notifications</div>
                    <div className="c-sub">Control how and when you receive alerts</div>
                  </div>
                </div>
                <div className="c-body">
                  <div className="section-hdr mb-3"><i className="fa-solid fa-toggle-on me-2"></i>Alert Channels</div>
                  <SRow icon="fa-envelope-circle-check" iconBg="rgba(239,68,68,0.1)" iconColor="var(--red)" label="Email Alerts" desc="Send email notifications for each detection event">
                    <Toggle checked={emailAlerts} onChange={setEmailAlerts} />
                  </SRow>
                  <SRow icon="fa-volume-high" iconBg="rgba(245,158,11,0.1)" iconColor="var(--amber)" label="Sound Alarms" desc="Play an audio alert when a violation is detected">
                    <Toggle checked={soundAlerts} onChange={setSoundAlerts} />
                  </SRow>

                  {soundAlerts && (
                    <div className="mt-3 mb-2 ps-5" style={{ animation: 'fadeIn 0.25s ease-out' }}>
                      <div className="flabel mb-2" style={{ fontWeight: 600, fontSize: '13px', color: 'var(--tx2)' }}>Alarm Tone Profile</div>
                      <div className="d-flex flex-column gap-2">
                        {ALARM_TONES.map(t => (
                          <div 
                            key={t.id} 
                            style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center', 
                              background: alarmTone === t.id ? 'rgba(245,158,11,0.06)' : 'rgba(0,0,0,0.15)', 
                              padding: '10px 14px', 
                              borderRadius: '12px', 
                              border: `1px solid ${alarmTone === t.id ? 'var(--amber)' : 'var(--border)'}`,
                              transition: 'var(--tr)'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => setAlarmTone(t.id)}>
                              <input 
                                type="radio" 
                                name="alarmTone" 
                                checked={alarmTone === t.id} 
                                onChange={() => setAlarmTone(t.id)} 
                                style={{ accentColor: 'var(--amber)', cursor: 'pointer' }} 
                              />
                              <div>
                                <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--tx1)' }}>{t.name}</div>
                                <div style={{ fontSize: '11px', color: 'var(--tx3)', marginTop: '2px' }}>{t.desc}</div>
                              </div>
                            </div>
                            <button 
                              className="btn-icon" 
                              onClick={() => playTestTone(t.id)} 
                              style={{ 
                                background: 'rgba(255,255,255,0.06)', 
                                border: '1px solid var(--border)', 
                                color: 'var(--tx2)',
                                borderRadius: '50%', 
                                width: '30px', 
                                height: '30px', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                cursor: 'pointer',
                                transition: 'var(--tr)'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--amber)'; e.currentTarget.style.color = 'var(--amber)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--tx2)'; }}
                              title="Test Sound"
                            >
                              <i className="fa-solid fa-play" style={{ fontSize: '10px' }}></i>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="section-hdr mt-4 mb-3"><i className="fa-solid fa-stopwatch me-2"></i>Alert Cooldown</div>
                  <div className="mb-4">
                    <div className="d-flex justify-content-between mb-1">
                      <span className="flabel mb-0">Minimum time between alerts</span>
                      <span style={{ color: 'var(--amber)', fontWeight: 600, fontSize: '14px' }}>{alertCooldown}s</span>
                    </div>
                    <input type="range" className="form-range w-100" min="10" max="300" step="10" value={alertCooldown} onChange={e => setAlertCooldown(+e.target.value)} style={{ accentColor: 'var(--amber)' }} />
                    <div className="d-flex justify-content-between" style={{ color: 'var(--tx3)', fontSize: '12px' }}>
                      <span>10s (aggressive)</span><span>5 min (quiet)</span>
                    </div>
                  </div>

                  {user.role === 'admin' && (
                    <>
                      <div className="section-hdr mt-4 mb-3"><i className="fa-solid fa-server me-2"></i>SMTP Configuration</div>
                      <div className="row g-3 mb-3">
                        <div className="col-md-6">
                          <div className="fgroup mb-0">
                            <label className="flabel">Sender Gmail Address</label>
                            <div className="input-icon-wrap"><i className="fa-solid fa-envelope"></i><input type="email" className="finput" value={smtpSender} onChange={e => setSmtpSender(e.target.value)} placeholder="alerts@gmail.com" /></div>
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="fgroup mb-0">
                            <label className="flabel">App Password</label>
                            <div className="input-icon-wrap"><i className="fa-solid fa-key"></i><input type="password" className="finput" value={smtpAppPass} onChange={e => setSmtpAppPass(e.target.value)} placeholder={smtpPasswordSet ? "******** (leave blank to keep current)" : "Google App Password"} /></div>
                            {smtpPasswordSet && (
                              <div style={{ fontSize: '11px', color: 'var(--tx3)', marginTop: '6px' }}>
                                A password is already saved. Enter a new one only if you want to replace it.
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="fgroup mb-0">
                            <label className="flabel">Alert Recipient</label>
                            <div className="input-icon-wrap"><i className="fa-solid fa-inbox"></i><input type="email" className="finput" value={smtpRecipient} onChange={e => setSmtpRecipient(e.target.value)} /></div>
                          </div>
                        </div>
                      </div>
                      <div className="smtp-test-wrap">
                        <div className="smtp-test-icon"><i className="fa-solid fa-paper-plane"></i></div>
                        <div className="smtp-test-body">
                          <div className="smtp-test-label">Send Test Email</div>
                          <div className="smtp-test-desc">Verify your SMTP settings are working correctly</div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="btn-ghost" onClick={saveSmtp} disabled={smtpSaving}>
                            {smtpSaving ? <><i className="fa-solid fa-spinner fa-spin me-1"></i>Saving…</> : <><i className="fa-solid fa-floppy-disk me-1"></i>Save SMTP</>}
                          </button>
                          <button className="btn-ghost" onClick={testSmtp} disabled={smtpTesting}>
                            {smtpTesting ? <><i className="fa-solid fa-spinner fa-spin me-1"></i>Sending…</> : <><i className="fa-solid fa-paper-plane me-1"></i>Send Test</>}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ── Detection ── */}
              <div className={`c setting-panel ${activePanel === 'detection' ? 'active' : ''}`}>
                <div className="c-head">
                  <div>
                    <div className="c-title"><i className="fa-solid fa-crosshairs me-2" style={{ color: 'var(--purple)' }}></i>Detection</div>
                    <div className="c-sub">Configure VIRSION 1 AI model behavior</div>
                  </div>
                </div>
                <div className="c-body">
                  <div className="section-hdr mb-3"><i className="fa-solid fa-sliders me-2"></i>Confidence Threshold</div>
                  <div className="mb-4">
                    <div className="d-flex justify-content-between mb-1">
                      <span className="flabel mb-0">Minimum detection confidence</span>
                      <span style={{ color: confColor, fontWeight: 700, fontSize: '16px' }}>{confThresh}%</span>
                    </div>
                    <input type="range" className="form-range w-100" min="30" max="99" value={confThresh} onChange={e => setConfThresh(+e.target.value)} style={{ accentColor: confColor }} />
                    <div className="d-flex justify-content-between" style={{ color: 'var(--tx3)', fontSize: '12px' }}>
                      <span style={{ color: 'var(--red)' }}>30% (many false positives)</span>
                      <span style={{ color: 'var(--green)' }}>99% (miss detections)</span>
                    </div>
                  </div>

                  <div className="section-hdr mb-3"><i className="fa-solid fa-robot me-2"></i>Active Detection Classes</div>
                  <div className="class-card-grid mb-4">
                    {MODELS.filter(m => m.label !== 'Face ID').map(m => {
                      const key = m.label.toLowerCase();
                      const on = enabledClasses[key] !== false;
                      return (
                        <div
                          key={key}
                          className={`class-card ${on ? 'enabled' : ''}`}
                          onClick={() => {
                            const updated = { ...enabledClasses, [key]: !on };
                            updateEnabledClasses(updated);
                          }}
                          style={{ borderColor: on ? m.color : 'var(--border)' }}
                        >
                          <div className="class-card-dot" style={{ background: m.color }}></div>
                          <div className="class-card-label">{m.label}</div>
                          <div className="class-card-file">{m.name}</div>
                          <div className="class-card-status" style={{ color: on ? m.color : 'var(--tx3)' }}>
                            <i className={`fa-solid ${on ? 'fa-circle-check' : 'fa-circle-xmark'} me-1`}></i>
                            {on ? 'Active' : 'Disabled'}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Dependency warning banner ── */}
                  {(() => {
                    const smokeOn = enabledClasses.smoke !== false;
                    const cigOn   = enabledClasses.cigarette !== false;
                    const vapeOn  = enabledClasses.vape !== false;
                    const anyActive = smokeOn || cigOn || vapeOn;

                    // Nothing enabled at all
                    if (!anyActive) return (
                      <div style={{
                        display: 'flex', alignItems: 'flex-start', gap: '12px',
                        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)',
                        borderRadius: '12px', padding: '12px 14px', marginBottom: '20px',
                        animation: 'fadeIn 0.2s ease-out'
                      }}>
                        <i className="fa-solid fa-ban" style={{ color: 'var(--red)', marginTop: '2px', fontSize: '15px', flexShrink: 0 }}></i>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--red)', marginBottom: '3px' }}>
                            No classes active — detection is off
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--tx2)', lineHeight: 1.5 }}>
                            All detection classes are disabled. Enable at least <strong>Smoke</strong> to allow any violation to be logged.
                          </div>
                        </div>
                      </div>
                    );

                    // Smoke disabled but cigarette or vape is on — they'll never fire
                    if (!smokeOn && (cigOn || vapeOn)) return (
                      <div style={{
                        display: 'flex', alignItems: 'flex-start', gap: '12px',
                        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.4)',
                        borderRadius: '12px', padding: '12px 14px', marginBottom: '20px',
                        animation: 'fadeIn 0.2s ease-out'
                      }}>
                        <i className="fa-solid fa-triangle-exclamation" style={{ color: 'var(--amber)', marginTop: '2px', fontSize: '15px', flexShrink: 0 }}></i>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--amber)', marginBottom: '3px' }}>
                            {[cigOn && 'Cigarette', vapeOn && 'Vape'].filter(Boolean).join(' & ')} will never trigger — Smoke is disabled
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--tx2)', lineHeight: 1.5 }}>
                            The AI requires <strong>corroborating smoke evidence</strong> before logging a cigarette or vape violation
                            (to prevent false positives from pens, fingers, etc.).
                            Re-enable <strong>Smoke</strong>, or rely on smoke-only detection.
                          </div>
                        </div>
                      </div>
                    );

                    // Smoke only — informational
                    if (smokeOn && !cigOn && !vapeOn) return (
                      <div style={{
                        display: 'flex', alignItems: 'flex-start', gap: '12px',
                        background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.3)',
                        borderRadius: '12px', padding: '12px 14px', marginBottom: '20px',
                        animation: 'fadeIn 0.2s ease-out'
                      }}>
                        <i className="fa-solid fa-circle-info" style={{ color: 'var(--blue)', marginTop: '2px', fontSize: '15px', flexShrink: 0 }}></i>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--blue)', marginBottom: '3px' }}>
                            Smoke-only mode active
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--tx2)', lineHeight: 1.5 }}>
                            Only visible smoke clouds will trigger alerts (threshold ≥ 70%). 
                            Cigarette and vape objects without smoke will be ignored.
                          </div>
                        </div>
                      </div>
                    );

                    return null; // normal state — no warning needed
                  })()}

                  <div className="section-hdr mb-3"><i className="fa-solid fa-gauge me-2"></i>Throttle & Capture</div>
                  <div className="mb-4">
                    <div className="d-flex justify-content-between mb-1">
                      <span className="flabel mb-0">Client webcam upload frame rate</span>
                      <span style={{ color: 'var(--blue)', fontWeight: 600 }}>{throttle} FPS</span>
                    </div>
                    <input type="range" className="form-range w-100" min="1" max="60" value={throttle} onChange={e => setThrottle(+e.target.value)} style={{ accentColor: 'var(--blue)' }} />
                    <div className="d-flex justify-content-between" style={{ color: 'var(--tx3)', fontSize: '12px' }}>
                      <span>1 FPS (lighter)</span><span>60 FPS (smoother)</span>
                    </div>
                  </div>
                  <SRow icon="fa-camera" iconBg="rgba(168,85,247,0.1)" iconColor="var(--purple)" label="Auto-capture screenshot" desc="Save a JPEG snapshot for every detection event">
                    <Toggle checked={autoCapture} onChange={setAutoCapture} />
                  </SRow>
                </div>
              </div>

              {/* ── Cameras ── */}
              <div className={`c setting-panel ${activePanel === 'cameras' ? 'active' : ''}`}>
                <div className="c-head">
                  <div>
                    <div className="c-title"><i className="fa-solid fa-video me-2" style={{ color: 'var(--green)' }}></i>Cameras</div>
                    <div className="c-sub">Manage camera sources and their locations</div>
                  </div>
                </div>
                <div className="c-body">
                  {cameras.map(cam => (
                    <div key={cam.id} className="cam-row-card">
                      <div className="cam-row-card-icon" style={{ background: cam.enabled ? 'rgba(16,185,129,0.1)' : 'rgba(148,163,184,0.1)' }}>
                        <i className="fa-solid fa-video" style={{ color: cam.enabled ? 'var(--green)' : 'var(--tx3)' }}></i>
                      </div>
                      <div className="cam-row-card-body">
                        <div className="row g-2">
                          <div className="col-sm-5">
                            <label className="flabel" style={{ fontSize: '11px' }}>Camera Name</label>
                            <input
                              type="text"
                              className="finput finput-sm"
                              value={cam.name}
                              onChange={e => updateCamera(cam.id, 'name', e.target.value)}
                            />
                          </div>
                          <div className="col-sm-5">
                            <label className="flabel" style={{ fontSize: '11px' }}>Location Label</label>
                            <input
                              type="text"
                              className="finput finput-sm"
                              value={cam.location}
                              onChange={e => updateCamera(cam.id, 'location', e.target.value)}
                            />
                          </div>
                          <div className="col-sm-2 d-flex align-items-end justify-content-end pb-1">
                            <Toggle checked={cam.enabled} onChange={v => updateCamera(cam.id, 'enabled', v)} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    className="btn-ghost btn-sm mt-2"
                    onClick={() => {
                      const newCams = [...cameras, { id: cameras.length, name: `Camera ${cameras.length}`, location: 'New Location', enabled: false }];
                      setCameras(newCams);
                      localStorage.setItem('cameras', JSON.stringify(newCams));
                    }}
                  >
                    <i className="fa-solid fa-plus me-1"></i>Add Camera
                  </button>
                </div>
              </div>

              {/* ── System Info ── */}
              <div className={`c setting-panel ${activePanel === 'sysinfo' ? 'active' : ''}`}>
                <div className="c-head">
                  <div>
                    <div className="c-title"><i className="fa-solid fa-microchip me-2" style={{ color: 'var(--green)' }}></i>System Info</div>
                    <div className="c-sub">Runtime statistics and loaded models</div>
                  </div>
                </div>
                <div className="c-body">
                  <div className="section-hdr mb-3"><i className="fa-solid fa-chart-simple me-2"></i>Runtime Metrics</div>
                  <div className="sysinfo-grid mb-4">
                    <div className="sysinfo-item"><div className="sysinfo-label">Session Uptime</div><div className="sysinfo-val">{uptime}</div></div>
                    <div className="sysinfo-item"><div className="sysinfo-label">App Version</div><div className="sysinfo-val">1.0.0</div></div>
                    <div className="sysinfo-item"><div className="sysinfo-label">ML Version</div><div className="sysinfo-val">VIRSION 1</div></div>
                    <div className="sysinfo-item"><div className="sysinfo-label">Framework</div><div className="sysinfo-val">YOLOv8</div></div>
                    <div className="sysinfo-item"><div className="sysinfo-label">Backend</div><div className="sysinfo-val">Flask 3.x</div></div>
                    <div className="sysinfo-item"><div className="sysinfo-label">Database</div><div className="sysinfo-val">SQLite</div></div>
                    <div className="sysinfo-item"><div className="sysinfo-label">Frontend</div><div className="sysinfo-val">React + Vite</div></div>
                    <div className="sysinfo-item"><div className="sysinfo-label">Conf. Threshold</div><div className="sysinfo-val">{confThresh}%</div></div>
                  </div>

                  <div className="section-hdr mb-3"><i className="fa-solid fa-brain me-2"></i>Loaded Models</div>
                  <div className="model-list">
                    {MODELS.map(m => (
                      <div key={m.name} className="model-row">
                        <div className="model-dot" style={{ background: m.color }}></div>
                        <div className="model-info">
                          <div className="model-label">{m.label}</div>
                          <div className="model-file">{m.name}</div>
                        </div>
                        <span className="tag g">Loaded</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Danger Zone ── */}
              <div className={`c setting-panel ${activePanel === 'danger' ? 'active' : ''}`}>
                <div className="c-head" style={{ borderBottom: '1px solid rgba(239,68,68,0.2)' }}>
                  <div>
                    <div className="c-title" style={{ color: 'var(--red)' }}><i className="fa-solid fa-triangle-exclamation me-2"></i>Danger Zone</div>
                    <div className="c-sub">These actions are irreversible — proceed with caution</div>
                  </div>
                </div>
                <div className="c-body">
                  <div className="danger-action">
                    <div className="danger-action-icon"><i className="fa-solid fa-trash-can"></i></div>
                    <div className="danger-action-body">
                      <div className="danger-action-title">Clear Violation History</div>
                      <div className="danger-action-desc">Permanently delete all violation records and saved images from the database. This cannot be undone.</div>
                    </div>
                    <button className="btn-danger-outline" onClick={clearHistory}>
                      <i className="fa-solid fa-trash me-1"></i>Clear History
                    </button>
                  </div>

                  <div className="danger-action">
                    <div className="danger-action-icon"><i className="fa-solid fa-arrow-rotate-left"></i></div>
                    <div className="danger-action-body">
                      <div className="danger-action-title">Reset All Settings</div>
                      <div className="danger-action-desc">Restore all settings to factory defaults. Your account and violation data will not be affected.</div>
                    </div>
                    <button className="btn-danger-outline" onClick={() => {
                      setConfirmMessage("Are you sure you want to reset all platform configurations to factory defaults? Your user profile and logged violations will not be changed.");
                      setConfirmCallback(() => () => {
                        localStorage.removeItem('accentColor');
                        localStorage.removeItem('theme');
                        setTheme('dark');
                        setConfThresh(50);
                        setThrottle(3);
                        setAlertCooldown(60);
                        showToast('Settings reset to defaults');
                      });
                      setShowConfirmModal(true);
                    }}>
                      <i className="fa-solid fa-rotate-left me-1"></i>Reset
                    </button>
                  </div>

                  <div className="danger-action" style={{ border: 'none', marginBottom: 0, paddingBottom: 0 }}>
                    <div className="danger-action-icon"><i className="fa-solid fa-right-from-bracket"></i></div>
                    <div className="danger-action-body">
                      <div className="danger-action-title">Sign Out</div>
                      <div className="danger-action-desc">End your current session and return to the login screen.</div>
                    </div>
                    <button className="btn-danger-outline" onClick={() => { localStorage.removeItem('user'); navigate('/logout'); }}>
                      <i className="fa-solid fa-right-from-bracket me-1"></i>Sign Out
                    </button>
                  </div>
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

      {show2FAModal && (
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
            maxWidth: '420px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            boxShadow: '0 20px 45px rgba(0,0,0,0.4)',
            overflow: 'hidden'
          }}>
            <div className="c-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div className="c-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
                <i className="fa-solid fa-shield-halved" style={{ color: 'var(--blue)' }}></i>Google Authenticator 2FA
              </div>
              <button 
                onClick={() => setShow2FAModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: '18px' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="c-body" style={{ padding: '20px', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: 'var(--tx2)', marginBottom: '16px', lineHeight: 1.5 }}>
                Scan this QR code using the Google Authenticator app on your mobile device to link your account.
              </p>
              
              <div style={{
                background: 'white',
                padding: '12px',
                borderRadius: '12px',
                display: 'inline-block',
                marginBottom: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}>
                <img 
                  src={twoFAQrUrl} 
                  alt="2FA QR Code" 
                  style={{ width: '170px', height: '170px', display: 'block' }} 
                />
              </div>
              
              <div style={{
                background: 'rgba(59, 130, 246, 0.04)',
                border: '1px dashed var(--blue)',
                borderRadius: '8px',
                padding: '8px 12px',
                marginBottom: '20px',
                fontSize: '11px',
                color: 'var(--tx2)',
                wordBreak: 'break-all',
                fontFamily: 'monospace'
              }}>
                <span style={{ display: 'block', fontSize: '9px', textTransform: 'uppercase', color: 'var(--blue)', fontWeight: 600, marginBottom: '2px' }}>
                  Manual Setup Key:
                </span>
                {twoFASecret}
              </div>

              {twoFAError && (
                <div className="error-msg show mb-3" style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '8px', fontSize: '12px' }}>
                  <i className="fa-solid fa-circle-exclamation"></i>
                  <span>{twoFAError}</span>
                </div>
              )}

              <form onSubmit={verify2FA}>
                <div className="fgroup mb-3" style={{ textAlign: 'left' }}>
                  <label className="flabel" style={{ fontSize: '11px' }}>6-Digit Verification Code</label>
                  <div className="input-icon-wrap">
                    <i className="fa-solid fa-key"></i>
                    <input 
                      type="text" 
                      className="finput" 
                      maxLength="6"
                      placeholder="e.g. 123456"
                      value={twoFACode}
                      onChange={e => setTwoFACode(e.target.value.replace(/\D/g, ''))}
                      style={{ letterSpacing: '4px', textAlign: 'center', fontWeight: 700, fontSize: '16px' }}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    type="button" 
                    className="btn-w btn-flex w-100" 
                    onClick={() => setShow2FAModal(false)}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', cursor: 'pointer', height: '40px', borderRadius: '8px' }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="btn-r btn-flex w-100"
                    disabled={verifying2FA}
                    style={{ background: 'var(--blue)', borderColor: 'var(--blue)', color: 'white', cursor: 'pointer', height: '40px', borderRadius: '8px' }}
                  >
                    {verifying2FA ? (
                      <><i className="fa-solid fa-spinner fa-spin me-2"></i>Verifying...</>
                    ) : (
                      <><i className="fa-solid fa-circle-check me-2"></i>Verify & Enable</>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

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

export default Settings;
