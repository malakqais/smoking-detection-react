import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import logo from '../assets/LOGO.png';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const Dashboard = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "true");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [notifOpen, setNotifOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user] = useState(() => JSON.parse(localStorage.getItem('user') || '{"name":"User","role":"admin","email":"user@example.com"}'));

  const [violations, setViolations] = useState([]);
  const [detectionRunning, setDetectionRunning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [locFilter, setLocFilter] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleString());
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const alarmSound = useRef(null);
  const prevCount = useRef(0);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const clock = setInterval(() => setCurrentTime(new Date().toLocaleString()), 1000);
    return () => clearInterval(clock);
  }, []);

  const fetchViolations = async () => {
    try {
      const res = await fetch('/api/violations?limit=500');
      if (res.ok) {
        const data = await res.json();
        setViolations(data);
        if (data.length > prevCount.current && prevCount.current > 0) {
          alarmSound.current?.play().catch(() => {});
        }
        prevCount.current = data.length;
      }
    } catch (e) {
      console.error('Failed to fetch violations', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetectionStatus = async () => {
    try {
      const res = await fetch('/api/detection/status');
      if (res.ok) {
        const data = await res.json();
        setDetectionRunning(data.running);
      }
    } catch {}
  };

  useEffect(() => {
    fetchViolations();
    fetchDetectionStatus();
    const poll = setInterval(() => {
      fetchViolations();
      fetchDetectionStatus();
    }, 5000);
    return () => clearInterval(poll);
  }, []);

  const toggleDetection = async () => {
    if (detectionRunning) {
      await fetch('/api/detection/stop', { method: 'POST' });
      setDetectionRunning(false);
    } else {
      await fetch('/api/detection/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ camera: 0, location: 'Main Lobby' })
      });
      setDetectionRunning(true);
    }
  };

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  const toggleSidebar = () => {
    const s = !sidebarCollapsed;
    setSidebarCollapsed(s);
    localStorage.setItem("sidebarCollapsed", s);
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const todayCount = useMemo(() => violations.filter(v => v.time && v.time.startsWith(todayStr)).length, [violations, todayStr]);

  const locations = useMemo(() => [...new Set(violations.map(v => v.location).filter(Boolean))], [violations]);

  const filteredViolations = useMemo(() => {
    return violations.filter(v => {
      const q = searchQuery.toLowerCase();
      const matchQ = !q || v.location?.toLowerCase().includes(q) || v.name?.toLowerCase().includes(q) || v.time?.toLowerCase().includes(q);
      const matchL = !locFilter || v.location === locFilter;
      return matchQ && matchL;
    });
  }, [violations, searchQuery, locFilter]);

  const chartData = useMemo(() => {
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });
    const counts = last7.map(date => violations.filter(v => v.time?.startsWith(date)).length);
    const labels = last7.map(d => new Date(d + 'T12:00:00').toLocaleDateString('en', { weekday: 'short' }));
    return {
      labels,
      datasets: [{
        data: counts,
        borderColor: '#ef4444',
        backgroundColor: (ctx) => {
          const { chartArea, ctx: c } = ctx.chart;
          if (!chartArea) return null;
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, 'rgba(239,68,68,0.3)');
          g.addColorStop(1, 'rgba(239,68,68,0)');
          return g;
        },
        fill: true,
        tension: 0.45,
        pointBackgroundColor: '#ef4444',
        pointBorderColor: theme === 'dark' ? '#111827' : '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
      }]
    };
  }, [violations, theme]);

  const exportCSV = () => {
    const csv = "Time,Location,Person\n" + violations.map(v => `"${v.time}","${v.location}","${v.name}"`).join("\n");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "violations.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearLogs = async () => {
    if (!window.confirm("Are you sure you want to clear all violation logs?")) return;
    await fetch('/api/violations/clear', { method: 'POST' });
    setViolations([]);
    prevCount.current = 0;
  };

  if (loading) {
    return (
      <div className="layout">
        <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="sb-logo"><img src={logo} alt="Logo" /></div>
        </aside>
        <main className="main">
          <header className="top-bar"></header>
          <div className="content">
            <div className="kpi-grid mb-4">
              <div className="skel skel-kpi"></div><div className="skel skel-kpi"></div>
              <div className="skel skel-kpi"></div><div className="skel skel-kpi"></div>
            </div>
            <div className="grid-2-1">
              <div className="skel skel-chart"></div>
              <div className="skel" style={{ height: '240px', borderRadius: '16px' }}></div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ── USER VIEW ─────────────────────────────────────────────── */
  if (user.role !== 'admin') {
    const MONITORED_ZONES = ['Main Lobby', 'Parking Area', 'Cafeteria', 'Corridor B', 'Entrance Gate'];
    const RULES = [
      { icon: 'fa-ban', color: 'var(--red)',    text: 'Smoking is strictly prohibited in all indoor and outdoor campus areas.' },
      { icon: 'fa-camera', color: 'var(--blue)', text: 'AI-powered cameras monitor all zones 24/7 and log violations automatically.' },
      { icon: 'fa-envelope', color: 'var(--amber)', text: 'Repeated violations may result in formal disciplinary action.' },
      { icon: 'fa-shield-halved', color: 'var(--green)', text: 'Compliance keeps the campus safe and healthy for everyone.' },
    ];
    return (
      <div className="layout">
        <div className={`sb-overlay ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)}></div>
        <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${sidebarOpen ? 'open' : ''}`}>
          <div className="sb-logo">
            <img src={logo} alt="Logo" />
            <div>
              <div className="sb-logo-name">SmokeDet System</div>
              <div className="sb-logo-sub">{user.name} (user)</div>
            </div>
            <button className="sb-collapse-btn" onClick={toggleSidebar}>
              <i className={`fa-solid ${sidebarCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`}></i>
            </button>
          </div>
          <nav className="sb-nav">
            <div className="sb-section">Main</div>
            <NavLink className="sb-item" to="/"><i className="fa-solid fa-gauge-high"></i><span className="sb-label">Dashboard</span></NavLink>
            <NavLink className="sb-item" to="/analytics"><i className="fa-solid fa-chart-pie"></i><span className="sb-label">Analytics</span></NavLink>
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
                <div className="pg-title">Dashboard</div>
                <div className="pg-sub">Welcome back, {user.name}</div>
              </div>
            </div>
            <div className="tb-right">
              <div className="ib" onClick={toggleTheme} title="Toggle theme">
                {theme === 'dark' ? <i className="fa-solid fa-moon"></i> : <i className="fa-solid fa-sun" style={{ color: 'var(--amber)' }}></i>}
              </div>
            </div>
          </header>
          <div className="content fade-in">

            {/* Awareness Banner */}
            <div className="user-awareness-banner mb-4">
              <div className="uab-icon"><i className="fa-solid fa-triangle-exclamation"></i></div>
              <div className="uab-body">
                <div className="uab-title">Campus No-Smoking Policy — Active Monitoring</div>
                <div className="uab-sub">
                  This campus is equipped with an AI-powered smoking detection system. Violations are logged automatically and reviewed by administrators.
                </div>
              </div>
              <span className="tag r"><i className="fa-solid fa-circle me-1" style={{ fontSize: '7px', verticalAlign: 'middle' }}></i>System Active</span>
            </div>

            {/* Status KPIs */}
            <div className="kpi-grid mb-4">
              <div className="kpi g">
                <div className="kpi-icon"><i className="fa-solid fa-shield-check"></i></div>
                <div className="kpi-val" style={{ color: detectionRunning ? 'var(--green)' : 'var(--tx3)' }}>
                  {detectionRunning ? 'Active' : 'Standby'}
                </div>
                <div className="kpi-lbl">Detection System</div>
              </div>
              <div className="kpi r">
                <div className="kpi-icon"><i className="fa-solid fa-triangle-exclamation"></i></div>
                <div className="kpi-val">{todayCount}</div>
                <div className="kpi-lbl">Incidents Today</div>
              </div>
              <div className="kpi b">
                <div className="kpi-icon"><i className="fa-solid fa-video"></i></div>
                <div className="kpi-val">{MONITORED_ZONES.length}</div>
                <div className="kpi-lbl">Monitored Zones</div>
              </div>
              <div className="kpi a">
                <div className="kpi-icon"><i className="fa-solid fa-calendar-week"></i></div>
                <div className="kpi-val">{violations.length}</div>
                <div className="kpi-lbl">Total Logged</div>
              </div>
            </div>

            <div className="grid-2">
              {/* Policy Rules */}
              <div className="c">
                <div className="c-head">
                  <div>
                    <div className="c-title"><i className="fa-solid fa-book-open me-2" style={{ color: 'var(--red)' }}></i>Campus Policy</div>
                    <div className="c-sub">Rules enforced by this system</div>
                  </div>
                </div>
                <div className="c-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {RULES.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${r.color}18`, color: r.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
                        <i className={`fa-solid ${r.icon}`}></i>
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--tx2)', lineHeight: 1.6, paddingTop: 6 }}>{r.text}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Monitored Zones */}
              <div className="c">
                <div className="c-head">
                  <div>
                    <div className="c-title"><i className="fa-solid fa-location-dot me-2" style={{ color: 'var(--blue)' }}></i>Monitored Zones</div>
                    <div className="c-sub">Areas under active surveillance</div>
                  </div>
                </div>
                <div className="c-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {MONITORED_ZONES.map((z, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: detectionRunning && i === 0 ? 'var(--green)' : 'var(--tx3)', flexShrink: 0 }}></div>
                      <div style={{ flex: 1, fontWeight: 600, fontSize: 14, color: 'var(--tx1)' }}>{z}</div>
                      <span className={`tag ${detectionRunning && i === 0 ? 'g' : ''}`} style={!(detectionRunning && i === 0) ? { color: 'var(--tx3)', background: 'var(--card2)', border: '1px solid var(--border)' } : {}}>
                        {detectionRunning && i === 0 ? 'Recording' : 'Monitored'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </main>
      </div>
    );
  }
  /* ─────────────────────────────────────────────────────────── */

  return (
    <div className="layout">
      <audio ref={alarmSound} src="https://www.soundjay.com/buttons/sounds/beep-01a.mp3" preload="auto"></audio>

      <div className={`sb-overlay ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)}></div>
      <div className={`notif-overlay ${notifOpen ? 'visible' : ''}`} onClick={() => setNotifOpen(false)}></div>

      {/* Notification Drawer */}
      <aside className={`notif-drawer ${notifOpen ? 'open' : ''}`}>
        <div className="notif-head">
          <div className="notif-head-title">
            <i className="fa-solid fa-bell" style={{ color: 'var(--red)' }}></i> Notifications
            <span className="notif-head-count">{violations.length}</span>
          </div>
          <div className="notif-head-actions">
            <button className="btn-ghost btn-sm" onClick={() => setNotifOpen(false)}>Close</button>
            <div className="ib" onClick={() => setNotifOpen(false)}><i className="fa-solid fa-xmark"></i></div>
          </div>
        </div>
        <div className="notif-body">
          {violations.length === 0 ? (
            <div className="notif-empty"><i className="fa-solid fa-bell-slash"></i><p>No notifications yet</p></div>
          ) : (
            violations.slice(0, 30).map(v => (
              <div key={v.id} className="notif-item unread fade-in">
                <div className="notif-icon"><i className="fa-solid fa-triangle-exclamation"></i></div>
                <div className="notif-content">
                  <div className="notif-title">Smoking detected at {v.location}</div>
                  <div className="notif-meta"><i className="fa-regular fa-clock me-1"></i>{v.time}</div>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="notif-foot">
          <button className="btn-ghost btn-sm w-100" onClick={clearLogs}>Clear All</button>
        </div>
      </aside>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${sidebarOpen ? 'open' : ''}`}>
        <div className="sb-logo">
          <img src={logo} alt="Logo" />
          <div>
            <div className="sb-logo-name">SmokeDet System</div>
            <div className="sb-logo-sub">{user.name} ({user.role})</div>
          </div>
          <button className="sb-collapse-btn" onClick={toggleSidebar}>
            <i className={`fa-solid ${sidebarCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`}></i>
          </button>
        </div>
        <nav className="sb-nav">
          <div className="sb-section">Main</div>
          <NavLink className="sb-item" to="/"><i className="fa-solid fa-gauge-high"></i><span className="sb-label">Dashboard</span></NavLink>
          <NavLink className="sb-item" to="/analytics"><i className="fa-solid fa-chart-pie"></i><span className="sb-label">Analytics</span></NavLink>
          {user.role === 'admin' && (
            <NavLink className="sb-item" to="/admin"><i className="fa-solid fa-user-shield"></i><span className="sb-label">Admin Panel</span></NavLink>
          )}
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
              <div className="pg-title">Dashboard</div>
              <div className="pg-sub">{currentTime}</div>
            </div>
          </div>
          <div className="tb-right">
            {user.role === 'admin' && (
              <button
                className={`btn-ghost btn-sm`}
                onClick={toggleDetection}
                style={{ color: detectionRunning ? 'var(--red)' : 'var(--green)', borderColor: detectionRunning ? 'var(--red)' : 'var(--green)' }}
              >
                <i className={`fa-solid ${detectionRunning ? 'fa-stop' : 'fa-play'} me-1`}></i>
                {detectionRunning ? 'Stop Detection' : 'Start Detection'}
              </button>
            )}
            <div className="ib" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? <i className="fa-solid fa-moon"></i> : <i className="fa-solid fa-sun" style={{ color: 'var(--amber)' }}></i>}
            </div>
            <div className="ib red" onClick={() => setNotifOpen(true)} title="Notifications">
              <i className="fa-solid fa-bell"></i>
              {violations.length > 0 && <span className="nbadge">{violations.length}</span>}
            </div>
            <div className="dropdown">
              <img src={logo} className="av" data-bs-toggle="dropdown" alt="User" />
              <ul className="dropdown-menu dropdown-menu-end">
                <li className="dropdown-header text-center">{user.email}</li>
                <li><hr className="dropdown-divider" /></li>
                <li><Link className="dropdown-item" to="/profile">Profile</Link></li>
                <li><Link className="dropdown-item" to="/analytics">Analytics</Link></li>
                <li><hr className="dropdown-divider" /></li>
                <li><Link className="dropdown-item text-danger" to="/logout">Logout</Link></li>
              </ul>
            </div>
          </div>
        </header>

        <div className="content fade-in">
          {/* KPIs */}
          <div className="kpi-grid mb-4">
            <div className="kpi r">
              <div className="kpi-icon"><i className="fa-solid fa-triangle-exclamation"></i></div>
              <div className="kpi-val">{todayCount}</div>
              <div className="kpi-lbl">Today's Violations</div>
            </div>
            <div className="kpi a">
              <div className="kpi-icon"><i className="fa-solid fa-calendar-week"></i></div>
              <div className="kpi-val">{violations.length}</div>
              <div className="kpi-lbl">Total Violations</div>
            </div>
            <div className="kpi g">
              <div className="kpi-icon"><i className="fa-solid fa-crosshairs"></i></div>
              <div className="kpi-val">92%</div>
              <div className="kpi-lbl">Detection Accuracy</div>
            </div>
            <div className="kpi b">
              <div className="kpi-icon"><i className="fa-solid fa-video"></i></div>
              <div className="kpi-val" style={{ color: detectionRunning ? 'var(--green)' : 'var(--tx3)' }}>
                {detectionRunning ? 'Active' : 'Off'}
              </div>
              <div className="kpi-lbl">Detection Status</div>
            </div>
          </div>

          <div className="grid-2-1">
            <div className="c">
              <div className="c-head">
                <div>
                  <div className="c-title"><i className="fa-solid fa-chart-line me-2" style={{ color: 'var(--red)' }}></i>Violations Over Time</div>
                  <div className="c-sub">Last 7 days</div>
                </div>
                <span className="tag r"><i className="fa-solid fa-circle me-1" style={{ fontSize: '6px' }}></i>Live</span>
              </div>
              <div className="c-body">
                <div className="chart-wrap">
                  <Line data={chartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8' } }, y: { beginAtZero: true, ticks: { color: '#94a3b8', stepSize: 1 } } } }} />
                </div>
              </div>
            </div>

            <div className="c">
              <div className="c-head">
                <div className="c-title"><i className="fa-solid fa-siren me-2" style={{ color: 'var(--red)' }}></i>Recent Alerts</div>
                <div className="c-sub">{violations.length} total</div>
              </div>
              <div className="c-body scroll-area">
                {violations.length === 0 ? (
                  <div className="empty-state"><i className="fa-solid fa-shield-check" style={{ color: 'var(--green)' }}></i><p>No alerts yet</p></div>
                ) : (
                  violations.slice(0, 8).map(v => (
                    <div key={v.id} className="al fade-in">
                      <div className="al-dot"></div>
                      <div className="al-body">
                        <div className="al-text"><strong>Smoking detected</strong> — {v.location}</div>
                        <div className="al-time"><i className="fa-regular fa-clock me-1"></i>{v.time}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Camera Feed Status */}
          <div className="c mb-4">
            <div className="c-head">
              <div>
                <div className="c-title"><i className="fa-solid fa-camera me-2" style={{ color: 'var(--blue)' }}></i>Detection Status</div>
                <div className="c-sub">Real-time monitoring</div>
              </div>
              <span className={`tag ${detectionRunning ? 'g' : 'r'}`}>{detectionRunning ? 'Running' : 'Stopped'}</span>
            </div>
            <div className="c-body">
              <div className="cam-grid">
                {[
                  { name: "Main Lobby", cam: "CAM-01", active: detectionRunning },
                  { name: "Parking Area", cam: "CAM-02", active: false },
                  { name: "Cafeteria", cam: "CAM-03", active: false }
                ].map((cam, i) => (
                  <div key={i}>
                    <div className="cam-feed">
                      <div className="cf-grid"></div>
                      <div className="scan-line" style={{ animationDelay: `${i * -1.1}s`, animationPlayState: cam.active ? 'running' : 'paused' }}></div>
                      <div className="cf-corner tl"></div><div className="cf-corner tr"></div>
                      <div className="cf-corner bl"></div><div className="cf-corner br"></div>
                      <div className="cf-live">
                        <div className="cf-live-dot" style={{ background: cam.active ? 'var(--red)' : 'var(--tx3)' }}></div>
                        {cam.active ? 'REC' : 'OFF'}
                      </div>
                      <div className="cf-ts">{currentTime}</div>
                      {cam.active && todayCount > 0 ? (
                        <div className="cf-no-det" style={{ color: 'var(--red)', opacity: 1 }}>
                          <i className="fa-solid fa-triangle-exclamation"></i> {todayCount} today
                        </div>
                      ) : (
                        <div className="cf-no-det"><i className="fa-solid fa-shield-check"></i> {cam.active ? 'Clear' : 'Inactive'}</div>
                      )}
                      <div className="cf-info">
                        <span className="cf-name"><i className="fa-solid fa-location-dot me-1"></i>{cam.name}</span>
                        <span className="cf-fps">{cam.cam} | YOLO v8</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Logs Table */}
          <div className="c">
            <div className="c-head">
              <div>
                <div className="c-title"><i className="fa-solid fa-table-list me-2" style={{ color: 'var(--amber)' }}></i>Violation Logs</div>
                <div className="c-sub">Full detection history</div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {user.role === 'admin' && (
                  <>
                    <button className="btn-ghost btn-sm" onClick={exportCSV}><i className="fa-solid fa-download me-1"></i>Export</button>
                    <button className="btn-ghost btn-sm" onClick={clearLogs}><i className="fa-solid fa-trash me-1"></i>Clear</button>
                  </>
                )}
              </div>
            </div>

            <div className="tbl-controls">
              <div className="search-wrap">
                <i className="fa-solid fa-magnifying-glass"></i>
                <input type="text" className="search-input" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
              <select className="sel-filter" value={locFilter} onChange={e => setLocFilter(e.target.value)}>
                <option value="">All Locations</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <span className="tbl-count">{filteredViolations.length} records</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr><th>#</th><th>Timestamp</th><th>Location</th><th>Person</th><th>Detected</th><th>Evidence</th>{user.role === 'admin' && <th></th>}</tr>
                </thead>
                <tbody>
                  {filteredViolations.length === 0 ? (
                    <tr><td colSpan="7" className="text-center py-5 text-muted">No records found</td></tr>
                  ) : (
                    filteredViolations.map((v, i) => {
                      const typeColor = { cigarette: 'var(--red)', smoke: '#94a3b8', vape: 'var(--purple)', unknown: 'var(--tx3)' };
                      const typeIcon  = { cigarette: 'fa-smoking', smoke: 'fa-wind', vape: 'fa-vial', unknown: 'fa-circle-question' };
                      const dt = v.detected_type || 'unknown';
                      return (
                        <tr key={v.id} className="fade-in">
                          <td style={{ color: 'var(--tx3)' }}>{i + 1}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{v.time}</td>
                          <td>{v.location}</td>
                          <td>{v.name}</td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: typeColor[dt] || 'var(--tx3)', background: `${typeColor[dt] || 'var(--tx3)'}18`, padding: '3px 9px', borderRadius: 99 }}>
                              <i className={`fa-solid ${typeIcon[dt] || 'fa-circle-question'}`}></i>
                              {dt}
                            </span>
                          </td>
                          <td>
                            <button className="btn-r btn-sm" onClick={() => setSelectedEvidence(v)}>
                              <i className="fa-solid fa-image me-1"></i>View
                            </button>
                          </td>
                          {user.role === 'admin' && (
                            <td>
                              <button
                                className="ib btn-sm"
                                title="Delete this violation"
                                style={{ color: 'var(--tx3)' }}
                                onClick={async () => {
                                  await fetch(`/api/violations/${v.id}/delete`, { method: 'POST' });
                                  setViolations(prev => prev.filter(x => x.id !== v.id));
                                }}
                              >
                                <i className="fa-solid fa-trash"></i>
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Evidence Modal */}
      {selectedEvidence && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.8)', zIndex: 2000 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content" style={{ background: 'var(--card-bg)', borderColor: 'var(--border)' }}>
              <div className="modal-header border-0" style={{ borderBottom: '1px solid var(--border)' }}>
                <h6 className="modal-title" style={{ color: 'var(--tx1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fa-solid fa-image" style={{ color: 'var(--red)' }}></i>
                  Violation Evidence
                </h6>
                <button className="btn-close btn-close-white" onClick={() => setSelectedEvidence(null)}></button>
              </div>
              <div className="modal-body">
                {selectedEvidence.image ? (
                  <img src={selectedEvidence.image} alt="Evidence" style={{ width: '100%', borderRadius: '10px', maxHeight: '320px', objectFit: 'contain', background: '#000' }} />
                ) : (
                  <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', background: 'var(--card2)', borderRadius: 10 }}>
                    <div className="text-center"><i className="fa-solid fa-image-slash fa-2x mb-2"></i><div>No image captured</div></div>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                  {[
                    { icon: 'fa-clock', label: 'Timestamp', val: selectedEvidence.time },
                    { icon: 'fa-location-dot', label: 'Location', val: selectedEvidence.location },
                    { icon: 'fa-user', label: 'Person', val: selectedEvidence.name },
                    { icon: 'fa-smoking', label: 'Detected', val: selectedEvidence.detected_type || 'unknown' },
                  ].map(r => (
                    <div key={r.label} style={{ background: 'var(--card2)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                        <i className={`fa-solid ${r.icon} me-1`}></i>{r.label}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx1)' }}>{r.val}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
