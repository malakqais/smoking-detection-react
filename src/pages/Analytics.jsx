import React, { useState, useEffect, useMemo } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
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
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

const ZONES = ["Main Lobby", "Parking Area", "Office A", "Office B", "Cafeteria", "Stairwell", "Restroom", "Meeting Rm", "Entrance", "Corridor", "Break Room", "Server Rm"];
const COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#8b5cf6", "#10b981", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#e11d48"];

const Analytics = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "true");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [notifOpen, setNotifOpen] = useState(false);
  const [user] = useState(() => JSON.parse(localStorage.getItem('user') || '{"name":"User","role":"admin","email":"user@example.com"}'));

  const [violations, setViolations] = useState(() => JSON.parse(localStorage.getItem("violations") || "[]"));

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const toggleSidebar = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem("sidebarCollapsed", newState);
  };

  // Synthetic Data
  const zoneCounts = useMemo(() => {
    const counts = ZONES.map((z, i) => ({
      name: z,
      count: violations.filter(v => v.location === z).length || Math.floor(Math.random() * 80 + (i < 3 ? 60 : 5))
    }));
    return counts.sort((a, b) => b.count - a.count);
  }, [violations]);

  const hourlyData = useMemo(() => {
    return Array.from({ length: 24 }, (_, h) => (h >= 8 && h <= 18) ? Math.floor(Math.random() * 40 + 10) : Math.floor(Math.random() * 8));
  }, []);

  const days7 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const week1 = useMemo(() => days7.map(() => Math.floor(Math.random() * 60 + 20)), []);
  const week2 = useMemo(() => days7.map(() => Math.floor(Math.random() * 60 + 20)), []);

  const totalViolations = useMemo(() => violations.length || zoneCounts.reduce((s, z) => s + z.count, 0), [violations, zoneCounts]);
  const peakHour = useMemo(() => hourlyData.indexOf(Math.max(...hourlyData)), [hourlyData]);

  // Chart Options
  const isDark = theme === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const tickColor = '#94a3b8';

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } } },
      y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } }, beginAtZero: true }
    }
  };

  const trendData = {
    labels: days7,
    datasets: [{
      data: week1,
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
      pointBorderColor: isDark ? '#111827' : '#fff',
      pointBorderWidth: 2,
      pointRadius: 5,
    }]
  };

  const top5 = zoneCounts.slice(0, 5);
  const donutData = {
    labels: top5.map(z => z.name),
    datasets: [{
      data: top5.map(z => z.count),
      backgroundColor: COLORS.slice(0, 5),
      borderColor: isDark ? '#111827' : '#fff',
      borderWidth: 3,
      hoverOffset: 6
    }]
  };

  const hourlyChartData = {
    labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
    datasets: [{
      data: hourlyData,
      backgroundColor: 'rgba(245,158,11,0.8)',
      borderRadius: 5,
    }]
  };

  const compareData = {
    labels: days7,
    datasets: [
      { label: 'This Week', data: week1, backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 4 },
      { label: 'Last Week', data: week2, backgroundColor: 'rgba(59,130,246,0.5)', borderRadius: 4 }
    ]
  };

  return (
    <div className="layout">
      {/* Sidebar Overlay */}
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
            <div className="ib" onClick={() => setNotifOpen(false)}><i className="fa-solid fa-xmark"></i></div>
          </div>
        </div>
        <div className="notif-body">
          {violations.length === 0 ? (
            <div className="notif-empty"><i className="fa-solid fa-bell-slash"></i><p>No notifications</p></div>
          ) : (
            violations.slice(0, 20).map(v => (
              <div key={v.id} className="notif-item unread">
                <div className="notif-icon"><i className="fa-solid fa-triangle-exclamation"></i></div>
                <div className="notif-content">
                  <div className="notif-title">Smoking detected at {v.location}</div>
                  <div className="notif-meta"><i className="fa-regular fa-clock me-1"></i>{v.time}</div>
                </div>
              </div>
            ))
          )}
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

      {/* Main Area */}
      <main className="main">
        <header className="top-bar">
          <div className="tb-left">
            <div className="ib d-lg-none" onClick={() => setSidebarOpen(true)}><i className="fa-solid fa-bars"></i></div>
            <div>
              <div className="pg-title">Analytics</div>
              <div className="pg-sub">Detailed violation statistics & insights for {user.name}</div>
            </div>
          </div>
          <div className="tb-right">
            <div className="ib" onClick={toggleTheme} title="Toggle theme">
              {isDark ? <i className="fa-solid fa-moon"></i> : <i className="fa-solid fa-sun" style={{ color: 'var(--amber)' }}></i>}
            </div>
            <div className="ib red" onClick={() => setNotifOpen(true)} title="Notifications">
              <i className="fa-solid fa-bell"></i>
              {violations.length > 0 && <span className="nbadge">{violations.length}</span>}
            </div>
            <div className="dropdown">
              <img src={logo} className="av" id="topAvatar" data-bs-toggle="dropdown" alt="User" />
              <ul className="dropdown-menu dropdown-menu-end">
                <li className="dropdown-header text-center">{user.email}</li>
                <li><hr className="dropdown-divider" /></li>
                <li><Link className="dropdown-item" to="/profile"><i className="fa-solid fa-user me-2"></i>Profile</Link></li>
                <li><Link className="dropdown-item" to="/settings"><i className="fa-solid fa-gear me-2"></i>Settings</Link></li>
                <li><hr className="dropdown-divider" /></li>
                <li><Link className="dropdown-item text-danger" to="/logout"><i className="fa-solid fa-right-from-bracket me-2"></i>Logout</Link></li>
              </ul>
            </div>
          </div>
        </header>

        <div className="content">
          {/* Summary KPIs */}
          <div className="kpi-grid mb-4">
            <div className="kpi r">
              <div className="kpi-icon"><i className="fa-solid fa-triangle-exclamation"></i></div>
              <div className="kpi-val">{totalViolations}</div>
              <div className="kpi-lbl">Total Violations</div>
            </div>
            <div className="kpi a">
              <div className="kpi-icon"><i className="fa-solid fa-clock"></i></div>
              <div className="kpi-val">{peakHour}:00</div>
              <div className="kpi-lbl">Peak Hour</div>
            </div>
            <div className="kpi g">
              <div className="kpi-icon"><i className="fa-solid fa-location-dot"></i></div>
              <div className="kpi-val">{zoneCounts[0]?.name.split(" ")[0]}</div>
              <div className="kpi-lbl">Hottest Zone</div>
            </div>
            <div className="kpi b">
              <div className="kpi-icon"><i className="fa-solid fa-chart-line"></i></div>
              <div className="kpi-val">{Math.round(totalViolations / 7)}</div>
              <div className="kpi-lbl">Avg / Day</div>
            </div>
          </div>

          {/* Trend + Donut */}
          <div className="grid-2">
            <div className="c">
              <div className="c-head">
                <div><div className="c-title"><i className="fa-solid fa-chart-line me-2" style={{ color: 'var(--red)' }}></i>7-Day Trend</div><div className="c-sub">Daily violation count</div></div>
              </div>
              <div className="c-body"><div className="chart-h240"><Line data={trendData} options={commonOptions} /></div></div>
            </div>
            <div className="c">
              <div className="c-head">
                <div><div className="c-title"><i className="fa-solid fa-chart-pie me-2" style={{ color: 'var(--purple)' }}></i>By Location</div><div className="c-sub">Distribution across zones</div></div>
              </div>
              <div className="c-body">
                <div className="row g-0 align-items-center">
                  <div className="col-7">
                    <div className="chart-container chart-h240">
                      <Doughnut data={donutData} options={{ ...commonOptions, cutout: '68%' }} />
                      <div className="donut-center">
                        <div className="donut-val">{totalViolations}</div>
                        <div className="donut-lbl">Total</div>
                      </div>
                    </div>
                  </div>
                  <div className="col-5 ps-3">
                    {top5.map((z, i) => (
                      <div key={z.name} className="legend-row">
                        <div className="legend-dot" style={{ background: COLORS[i] }}></div>
                        <div className="legend-name">{z.name}</div>
                        <span className="legend-val">{z.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Hourly Bar */}
          <div className="c mb-4">
            <div className="c-head">
              <div><div className="c-title"><i className="fa-solid fa-clock me-2" style={{ color: 'var(--amber)' }}></i>Hourly Distribution</div><div className="c-sub">Most active hours</div></div>
            </div>
            <div className="c-body"><div className="chart-h280"><Bar data={hourlyChartData} options={commonOptions} /></div></div>
          </div>

          {/* Heatmap */}
          <div className="c mb-4">
            <div className="c-head">
              <div><div className="c-title"><i className="fa-solid fa-fire me-2" style={{ color: 'var(--red)' }}></i>Zone Heatmap</div><div className="c-sub">Violation intensity</div></div>
            </div>
            <div className="c-body">
              <div className="heatmap">
                {zoneCounts.map(z => {
                  const max = Math.max(...zoneCounts.map(zc => zc.count));
                  const ratio = z.count / max;
                  const cls = ratio > 0.75 ? "heat-3" : ratio > 0.45 ? "heat-2" : ratio > 0.2 ? "heat-1" : "heat-0";
                  return (
                    <div key={z.name} className={`heat-cell ${cls}`}>
                      <div className="heat-name">{z.name}</div>
                      <div className="heat-count">{z.count}</div>
                      <div className="heat-lbl">violations</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Comparison */}
          <div className="c">
            <div className="c-head">
              <div><div className="c-title"><i className="fa-solid fa-calendar-week me-2" style={{ color: 'var(--blue)' }}></i>Week Comparison</div><div className="c-sub">This week vs Last week</div></div>
            </div>
            <div className="c-body"><div className="chart-h280"><Bar data={compareData} options={{ ...commonOptions, plugins: { legend: { display: true, labels: { color: tickColor } } } }} /></div></div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Analytics;
