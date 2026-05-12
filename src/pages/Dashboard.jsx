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

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

const LOCATIONS = ["Main Lobby", "Parking Area", "Office Zone", "Cafeteria", "Stairwell", "Camera 1"];

const Dashboard = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "true");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [notifOpen, setNotifOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user] = useState(() => JSON.parse(localStorage.getItem('user') || '{"name":"User","role":"admin","email":"user@example.com"}'));
  
  const [violations, setViolations] = useState(() => JSON.parse(localStorage.getItem("violations") || "[]"));
  const [searchQuery, setSearchQuery] = useState("");
  const [locFilter, setLocFilter] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleString());
  
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const alarmSound = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const clock = setInterval(() => setCurrentTime(new Date().toLocaleString()), 1000);
    return () => clearInterval(clock);
  }, []);

  // Simulation Logic
  useEffect(() => {
    const simulation = setInterval(() => {
      const newViolation = {
        id: crypto.randomUUID(),
        time: new Date().toLocaleString(),
        location: LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)],
        name: "Unknown",
        image: ""
      };
      setViolations(prev => {
        const updated = [newViolation, ...prev];
        localStorage.setItem("violations", JSON.stringify(updated));
        return updated;
      });
      if (alarmSound.current) {
        alarmSound.current.play().catch(() => {});
      }
    }, 10000);
    return () => clearInterval(simulation);
  }, []);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  const toggleSidebar = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem("sidebarCollapsed", newState);
  };

  const filteredViolations = useMemo(() => {
    return violations.filter(v => {
      const matchQ = !searchQuery || 
        v.location.toLowerCase().includes(searchQuery.toLowerCase()) || 
        v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.time.toLowerCase().includes(searchQuery.toLowerCase());
      const matchL = !locFilter || v.location === locFilter;
      return matchQ && matchL;
    });
  }, [violations, searchQuery, locFilter]);

  const chartData = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    violations.forEach(() => counts[Math.floor(Math.random() * 7)]++);
    
    return {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        data: counts,
        borderColor: '#ef4444',
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return null;
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(239,68,68,0.3)');
          gradient.addColorStop(1, 'rgba(239,68,68,0)');
          return gradient;
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

  const clearLogs = () => {
    if (window.confirm("Are you sure you want to clear all violation logs?")) {
      setViolations([]);
      localStorage.setItem("violations", JSON.stringify([]));
    }
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
           <button className="btn-ghost btn-sm w-100" onClick={() => { setViolations([]); localStorage.setItem("violations", "[]"); }}>Clear All</button>
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
              <div className="kpi-val">{violations.length}</div>
              <div className="kpi-lbl">Today's Violations</div>
            </div>
            <div className="kpi a">
              <div className="kpi-icon"><i className="fa-solid fa-calendar-week"></i></div>
              <div className="kpi-val">{violations.length}</div>
              <div className="kpi-lbl">This Week</div>
            </div>
            <div className="kpi g">
              <div className="kpi-icon"><i className="fa-solid fa-crosshairs"></i></div>
              <div className="kpi-val">92%</div>
              <div className="kpi-lbl">Detection Accuracy</div>
            </div>
            <div className="kpi b">
              <div className="kpi-icon"><i className="fa-solid fa-video"></i></div>
              <div className="kpi-val">3/3</div>
              <div className="kpi-lbl">Cameras Online</div>
            </div>
          </div>

          <div className="grid-2-1">
            <div className="c">
              <div className="c-head">
                <div><div className="c-title"><i className="fa-solid fa-chart-line me-2" style={{ color: 'var(--red)' }}></i>Violations Over Time</div><div className="c-sub">Last 7 days</div></div>
                <span className="tag r"><i className="fa-solid fa-circle me-1" style={{ fontSize: '6px' }}></i>Live</span>
              </div>
              <div className="c-body"><div className="chart-wrap"><Line data={chartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8' } }, y: { beginAtZero: true, ticks: { color: '#94a3b8', stepSize: 1 } } } }} /></div></div>
            </div>

            <div className="c">
              <div className="c-head">
                <div className="c-title"><i className="fa-solid fa-siren me-2" style={{ color: 'var(--red)' }}></i>Recent Alerts</div>
                <div className="c-sub">{violations.length} alerts</div>
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

          {/* Camera Feeds */}
          <div className="c mb-4">
            <div className="c-head">
              <div><div className="c-title"><i className="fa-solid fa-camera me-2" style={{ color: 'var(--blue)' }}></i>Live Camera Feeds</div><div className="c-sub">Real-time monitoring</div></div>
              <span className="tag g">3 Online</span>
            </div>
            <div className="c-body">
              <div className="cam-grid">
                {[
                  { name: "Main Lobby", cam: "CAM-01", det: true, pos: { top: '28%', left: '18%', w: '28%', h: '36%' }, label: "Smoking 94%" },
                  { name: "Parking Area", cam: "CAM-02", det: false },
                  { name: "Cafeteria", cam: "CAM-03", det: true, pos: { top: '40%', left: '55%', w: '22%', h: '30%' }, label: "Smoking 88%" }
                ].map((cam, i) => (
                  <div key={i}>
                    <div className="cam-feed">
                      <div className="cf-grid"></div>
                      <div className="scan-line" style={{ animationDelay: `${i * -1.1}s` }}></div>
                      <div className="cf-corner tl"></div><div className="cf-corner tr"></div>
                      <div className="cf-corner bl"></div><div className="cf-corner br"></div>
                      <div className="cf-live"><div className="cf-live-dot"></div>REC</div>
                      <div className="cf-ts">{currentTime}</div>
                      {cam.det ? (
                        <div className="det-box" style={{ top: cam.pos.top, left: cam.pos.left, width: cam.pos.w, height: cam.pos.h }}>
                          <div className="det-corner tl"></div><div className="det-corner tr"></div>
                          <div className="det-corner bl"></div><div className="det-corner br"></div>
                          <div className="det-label">{cam.label}</div>
                        </div>
                      ) : (
                        <div className="cf-no-det"><i className="fa-solid fa-shield-check"></i> Clear</div>
                      )}
                      <div className="cf-info">
                        <span className="cf-name"><i className="fa-solid fa-location-dot me-1"></i>{cam.name}</span>
                        <span className="cf-fps">{cam.cam} | 30 FPS</span>
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
              <div><div className="c-title"><i className="fa-solid fa-table-list me-2" style={{ color: 'var(--amber)' }}></i>Violation Logs</div><div className="c-sub">Full detection history</div></div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {user.role === 'admin' && (
                  <>
                    <button className="btn-ghost btn-sm" onClick={exportCSV}><i className="fa-solid fa-download me-1"></i>Export</button>
                    <button className="btn-ghost btn-sm" onClick={clearLogs}><i className="fa-solid fa-trash me-1"></i>Clear Logs</button>
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
                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <span className="tbl-count">{filteredViolations.length} records</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr><th>#</th><th>Timestamp</th><th>Location</th><th>Person</th><th>Status</th><th>Evidence</th></tr>
                </thead>
                <tbody>
                  {filteredViolations.length === 0 ? (
                    <tr><td colSpan="6" className="text-center py-5 text-muted">No records found</td></tr>
                  ) : (
                    filteredViolations.map((v, i) => (
                      <tr key={v.id} className="fade-in">
                        <td style={{ color: 'var(--tx3)' }}>{i + 1}</td>
                        <td>{v.time}</td>
                        <td>{v.location}</td>
                        <td>{v.name}</td>
                        <td><span className="tag r">Detected</span></td>
                        <td>
                          <button className="btn-r btn-sm" onClick={() => setSelectedEvidence(v)}>View</button>
                        </td>
                      </tr>
                    ))
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
              <div className="modal-header border-0">
                <h6 className="modal-title text-white">Violation Evidence</h6>
                <button className="btn-close btn-close-white" onClick={() => setSelectedEvidence(null)}></button>
              </div>
              <div className="modal-body text-center">
                <div className="hotspot-box mb-3" style={{ height: '240px' }}>Evidence Image Placeholder</div>
                <p style={{ fontSize: '12px', color: 'var(--tx3)' }}>
                  {selectedEvidence.time} | {selectedEvidence.location}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
