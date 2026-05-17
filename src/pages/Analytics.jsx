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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

const COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#8b5cf6", "#10b981", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#e11d48"];

const Analytics = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "true");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [notifOpen, setNotifOpen] = useState(false);
  const [user] = useState(() => JSON.parse(localStorage.getItem('user') || '{"name":"User","role":"admin","email":"user@example.com"}'));
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/violations/stats');
      if (res.ok) setStats(await res.json());
    } catch (e) {
      console.error('Failed to fetch stats', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  const toggleSidebar = () => {
    const s = !sidebarCollapsed;
    setSidebarCollapsed(s);
    localStorage.setItem("sidebarCollapsed", s);
  };

  const isDark = theme === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const tickColor = '#94a3b8';
  const isAdmin = user.role === 'admin';
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } } },
      y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } }, beginAtZero: true }
    }
  };

  const trendData = useMemo(() => {
    if (!stats) return { labels: [], datasets: [] };
    const labels = stats.days_7.map(d => new Date(d.date + 'T12:00:00').toLocaleDateString('en', { weekday: 'short' }));
    const data = stats.days_7.map(d => d.count);
    return {
      labels,
      datasets: [{
        data,
        borderColor: '#ef4444',
        backgroundColor: (ctx) => {
          const { chartArea, ctx: c } = ctx.chart;
          if (!chartArea) return null;
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, 'rgba(239,68,68,0.3)');
          g.addColorStop(1, 'rgba(239,68,68,0)');
          return g;
        },
        fill: true, tension: 0.45,
        pointBackgroundColor: '#ef4444',
        pointBorderColor: isDark ? '#111827' : '#fff',
        pointBorderWidth: 2, pointRadius: 5,
      }]
    };
  }, [stats, isDark]);

  const donutData = useMemo(() => {
    if (!stats) return { labels: [], datasets: [] };
    const top5 = stats.by_location.slice(0, 5);
    return {
      labels: top5.map(z => z.name),
      datasets: [{
        data: top5.map(z => z.count),
        backgroundColor: COLORS.slice(0, 5),
        borderColor: isDark ? '#111827' : '#fff',
        borderWidth: 3,
        hoverOffset: 6
      }]
    };
  }, [stats, isDark]);

  const hourlyChartData = useMemo(() => {
    if (!stats) return { labels: [], datasets: [] };
    return {
      labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
      datasets: [{ data: stats.by_hour, backgroundColor: 'rgba(245,158,11,0.8)', borderRadius: 5 }]
    };
  }, [stats]);

  const compareData = useMemo(() => {
    if (!stats) return { labels: [], datasets: [] };
    const labels = stats.days_7.map(d => new Date(d.date + 'T12:00:00').toLocaleDateString('en', { weekday: 'short' }));
    return {
      labels,
      datasets: [
        { label: 'This Week', data: stats.days_7.map(d => d.count), backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 4 },
        { label: 'Last Week', data: stats.prev_7.map(d => d.count), backgroundColor: 'rgba(59,130,246,0.5)', borderRadius: 4 }
      ]
    };
  }, [stats]);

  const zoneCounts = stats?.by_location || [];
  const total = stats?.total || 0;
  const top5 = zoneCounts.slice(0, 5);

  return (
    <div className="layout">
      <div className={`sb-overlay ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)}></div>
      <div className={`notif-overlay ${notifOpen ? 'visible' : ''}`} onClick={() => setNotifOpen(false)}></div>

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
              <div className="pg-sub">Detailed violation statistics — {user.name}</div>
            </div>
          </div>
          <div className="tb-right">
            <button className="btn-ghost btn-sm" onClick={fetchStats}><i className="fa-solid fa-rotate-right me-1"></i>Refresh</button>
            <div className="ib" onClick={toggleTheme} title="Toggle theme">
              {isDark ? <i className="fa-solid fa-moon"></i> : <i className="fa-solid fa-sun" style={{ color: 'var(--amber)' }}></i>}
            </div>
            <div className="dropdown">
              <img src={logo} className="av" data-bs-toggle="dropdown" alt="User" />
              <ul className="dropdown-menu dropdown-menu-end">
                <li className="dropdown-header text-center">{user.email}</li>
                <li><hr className="dropdown-divider" /></li>
                <li><Link className="dropdown-item" to="/profile">Profile</Link></li>
                <li><Link className="dropdown-item" to="/settings">Settings</Link></li>
                <li><hr className="dropdown-divider" /></li>
                <li><Link className="dropdown-item text-danger" to="/logout">Logout</Link></li>
              </ul>
            </div>
          </div>
        </header>

        <div className="content">
          {loading ? (
            <div className="text-center py-5">
              <i className="fa-solid fa-spinner fa-spin fa-2x mb-2" style={{ color: 'var(--red)' }}></i>
              <p style={{ color: 'var(--tx3)' }}>Loading statistics...</p>
            </div>
          ) : !isAdmin ? (
            /* ── USER READ-ONLY VIEW ── */
            <>
              <div className="user-awareness-banner mb-4">
                <div className="uab-icon"><i className="fa-solid fa-chart-pie"></i></div>
                <div className="uab-body">
                  <div className="uab-title">Violation Trend — Read-Only View</div>
                  <div className="uab-sub">You are viewing a summary of system-wide detection activity. Detailed breakdowns are available to administrators only.</div>
                </div>
                <span className="tag b">View Only</span>
              </div>

              <div className="kpi-grid mb-4">
                <div className="kpi r">
                  <div className="kpi-icon"><i className="fa-solid fa-triangle-exclamation"></i></div>
                  <div className="kpi-val">{total}</div>
                  <div className="kpi-lbl">Total Violations</div>
                </div>
                <div className="kpi a">
                  <div className="kpi-icon"><i className="fa-solid fa-chart-line"></i></div>
                  <div className="kpi-val">{stats?.avg_per_day ?? 0}</div>
                  <div className="kpi-lbl">Avg / Day</div>
                </div>
                <div className="kpi g">
                  <div className="kpi-icon"><i className="fa-solid fa-shield-check"></i></div>
                  <div className="kpi-val">92%</div>
                  <div className="kpi-lbl">Detection Accuracy</div>
                </div>
                <div className="kpi b">
                  <div className="kpi-icon"><i className="fa-solid fa-video"></i></div>
                  <div className="kpi-val">5</div>
                  <div className="kpi-lbl">Active Cameras</div>
                </div>
              </div>

              <div className="c">
                <div className="c-head">
                  <div>
                    <div className="c-title"><i className="fa-solid fa-chart-line me-2" style={{ color: 'var(--red)' }}></i>7-Day Trend</div>
                    <div className="c-sub">Campus-wide daily violation count</div>
                  </div>
                </div>
                <div className="c-body"><div className="chart-h240"><Line data={trendData} options={commonOptions} /></div></div>
              </div>

              <div className="c mt-3" style={{ border: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.03)' }}>
                <div className="c-body" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(239,68,68,0.1)', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                    <i className="fa-solid fa-lock"></i>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--tx1)', marginBottom: 4 }}>Full Analytics Restricted</div>
                    <div style={{ fontSize: 13, color: 'var(--tx3)' }}>Zone heatmaps, hourly breakdowns, week comparisons, and person-level data are available to administrators only.</div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ── ADMIN FULL VIEW ── */
            <>
              {/* KPIs */}
              <div className="kpi-grid mb-4">
                <div className="kpi r">
                  <div className="kpi-icon"><i className="fa-solid fa-triangle-exclamation"></i></div>
                  <div className="kpi-val">{total}</div>
                  <div className="kpi-lbl">Total Violations</div>
                </div>
                <div className="kpi a">
                  <div className="kpi-icon"><i className="fa-solid fa-clock"></i></div>
                  <div className="kpi-val">{stats?.peak_hour ?? 0}:00</div>
                  <div className="kpi-lbl">Peak Hour</div>
                </div>
                <div className="kpi g">
                  <div className="kpi-icon"><i className="fa-solid fa-location-dot"></i></div>
                  <div className="kpi-val" style={{ fontSize: '16px' }}>{stats?.top_zone?.split(" ")[0] ?? 'N/A'}</div>
                  <div className="kpi-lbl">Hottest Zone</div>
                </div>
                <div className="kpi b">
                  <div className="kpi-icon"><i className="fa-solid fa-chart-line"></i></div>
                  <div className="kpi-val">{stats?.avg_per_day ?? 0}</div>
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
                    <div><div className="c-title"><i className="fa-solid fa-chart-pie me-2" style={{ color: 'var(--purple)' }}></i>By Location</div><div className="c-sub">Top 5 zones</div></div>
                  </div>
                  <div className="c-body">
                    {total === 0 ? (
                      <div className="empty-state"><i className="fa-solid fa-database"></i><p>No data yet</p></div>
                    ) : (
                      <div className="row g-0 align-items-center">
                        <div className="col-7">
                          <div className="chart-container chart-h240">
                            <Doughnut data={donutData} options={{ ...commonOptions, cutout: '68%' }} />
                            <div className="donut-center">
                              <div className="donut-val">{total}</div>
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
                    )}
                  </div>
                </div>
              </div>

              {/* Hourly Bar */}
              <div className="c mb-4">
                <div className="c-head">
                  <div><div className="c-title"><i className="fa-solid fa-clock me-2" style={{ color: 'var(--amber)' }}></i>Hourly Distribution</div><div className="c-sub">Most active hours of the day</div></div>
                </div>
                <div className="c-body"><div className="chart-h280"><Bar data={hourlyChartData} options={commonOptions} /></div></div>
              </div>

              {/* Heatmap */}
              {zoneCounts.length > 0 && (
                <div className="c mb-4">
                  <div className="c-head">
                    <div><div className="c-title"><i className="fa-solid fa-fire me-2" style={{ color: 'var(--red)' }}></i>Zone Heatmap</div><div className="c-sub">Violation intensity by location</div></div>
                  </div>
                  <div className="c-body">
                    <div className="heatmap">
                      {zoneCounts.map(z => {
                        const max = Math.max(...zoneCounts.map(zc => zc.count));
                        const ratio = max > 0 ? z.count / max : 0;
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
              )}

              {/* Week Comparison */}
              <div className="c">
                <div className="c-head">
                  <div><div className="c-title"><i className="fa-solid fa-calendar-week me-2" style={{ color: 'var(--blue)' }}></i>Week Comparison</div><div className="c-sub">This week vs last week</div></div>
                </div>
                <div className="c-body">
                  <div className="chart-h280">
                    <Bar data={compareData} options={{ ...commonOptions, plugins: { legend: { display: true, labels: { color: tickColor } } } }} />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Analytics;
