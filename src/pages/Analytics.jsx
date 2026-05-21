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
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/violations/stats');
      if (res.ok) setStats(await res.json());

      const vRes = await fetch('/api/violations?limit=500');
      if (vRes.ok) setViolations(await vRes.json());
    } catch (e) {
      console.error('Failed to fetch stats', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const poll = setInterval(fetchStats, 5000);
    return () => clearInterval(poll);
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

  const userViolations = useMemo(() => {
    return violations.filter(v => 
      v.name && v.name.toLowerCase().includes(user.name.toLowerCase().split(' ')[0])
    );
  }, [violations, user.name]);

  const userTypeData = useMemo(() => {
    const counts = { cigarette: 0, vape: 0, smoke: 0 };
    userViolations.forEach(v => {
      const type = (v.detected_type || 'cigarette').toLowerCase();
      if (type.includes('vape')) counts.vape++;
      else if (type.includes('smoke')) counts.smoke++;
      else counts.cigarette++;
    });
    return {
      labels: ['Cigarette', 'Vaping', 'Smoke Cloud'],
      datasets: [{
        data: [counts.cigarette, counts.vape, counts.smoke],
        backgroundColor: ['#ef4444', '#3b82f6', '#f59e0b'],
        borderColor: isDark ? '#111827' : '#fff',
        borderWidth: 3
      }]
    };
  }, [userViolations, isDark]);

  const userLocationData = useMemo(() => {
    const locMap = {};
    userViolations.forEach(v => {
      locMap[v.location] = (locMap[v.location] || 0) + 1;
    });
    const labels = Object.keys(locMap);
    const data = Object.values(locMap);
    return {
      labels,
      datasets: [{
        label: 'Violations',
        data,
        backgroundColor: 'rgba(59, 130, 246, 0.7)',
        borderRadius: 5
      }]
    };
  }, [userViolations]);

  const userTrendData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });

    const counts = days.map(dayStr => {
      return userViolations.filter(v => {
        const vDate = v.time ? v.time.split(' ')[0] : '';
        const vTimestamp = v.timestamp ? v.timestamp.split('T')[0] : '';
        return vDate === dayStr || vTimestamp === dayStr;
      }).length;
    });

    const labels = days.map(dayStr => new Date(dayStr + 'T12:00:00').toLocaleDateString('en', { weekday: 'short' }));

    return {
      labels,
      datasets: [{
        data: counts,
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.15)',
        fill: true,
        tension: 0.4
      }]
    };
  }, [userViolations]);

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
            /* ── USER FULL PERSONAL ANALYTICS ── */
            <>
              <div className="user-awareness-banner mb-4" style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 100%)', borderColor: 'rgba(59, 130, 246, 0.25)' }}>
                <div className="uab-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--blue)' }}><i className="fa-solid fa-heart-pulse"></i></div>
                <div className="uab-body">
                  <div className="uab-title" style={{ color: 'var(--blue)' }}>Personal Health & Violation Analytics</div>
                  <div className="uab-sub">Track your health progress, view violation details, and keep track of student fine tallies.</div>
                </div>
                <span className="tag b">My Account</span>
              </div>

              {/* Personal KPIs */}
              <div className="kpi-grid mb-4">
                <div className="kpi r" style={{ borderLeft: '4px solid var(--red)' }}>
                  <div className="kpi-icon" style={{ color: 'var(--red)' }}><i className="fa-solid fa-wallet"></i></div>
                  <div className="kpi-val">${(userViolations.length * 20).toFixed(2)}</div>
                  <div className="kpi-lbl">My Accumulated Fines</div>
                </div>
                <div className="kpi a" style={{ borderLeft: '4px solid var(--amber)' }}>
                  <div className="kpi-icon" style={{ color: 'var(--amber)' }}><i className="fa-solid fa-skull"></i></div>
                  <div className="kpi-val">{userViolations.length}</div>
                  <div className="kpi-lbl">Logged Detections</div>
                </div>
                <div className="kpi g" style={{ borderLeft: '4px solid var(--green)' }}>
                  <div className="kpi-icon" style={{ color: 'var(--green)' }}><i className="fa-solid fa-award"></i></div>
                  <div className="kpi-val">{userViolations.length > 3 ? 'Needs Action' : userViolations.length > 0 ? 'Warning Standing' : 'Perfect Gold Card'}</div>
                  <div className="kpi-lbl">My Wellness Status</div>
                </div>
                <div className="kpi b" style={{ borderLeft: '4px solid var(--blue)' }}>
                  <div className="kpi-icon" style={{ color: 'var(--blue)' }}><i className="fa-solid fa-user-group"></i></div>
                  <div className="kpi-val">{userViolations.length === 0 ? 'Top 1%' : 'Top 25%'}</div>
                  <div className="kpi-lbl">Campus Health Standings</div>
                </div>
              </div>

              <div className="grid-2 mb-4">
                {/* 7-Day Personal Trend */}
                <div className="c">
                  <div className="c-head">
                    <div>
                      <div className="c-title"><i className="fa-solid fa-chart-line me-2" style={{ color: 'var(--red)' }}></i>My 7-Day Trend</div>
                      <div className="c-sub">Your personal logged instances this week</div>
                    </div>
                  </div>
                  <div className="c-body">
                    <div className="chart-h240">
                      <Line data={userTrendData} options={commonOptions} />
                    </div>
                  </div>
                </div>

                {/* Personal Breakdown by Type */}
                <div className="c">
                  <div className="c-head">
                    <div>
                      <div className="c-title"><i className="fa-solid fa-chart-pie me-2" style={{ color: 'var(--purple)' }}></i>Breakdown by Device</div>
                      <div className="c-sub">Incidents categorized by detection signature</div>
                    </div>
                  </div>
                  <div className="c-body">
                    {userViolations.length === 0 ? (
                      <div className="empty-state" style={{ height: '240px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fa-solid fa-circle-check fa-2x mb-2" style={{ color: 'var(--green)' }}></i>
                        <p>No device violations recorded</p>
                      </div>
                    ) : (
                      <div className="chart-h240">
                        <Doughnut data={userTypeData} options={{ ...commonOptions, cutout: '70%' }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Personal Locations Bar */}
              <div className="grid-2 mb-4">
                <div className="c">
                  <div className="c-head">
                    <div>
                      <div className="c-title"><i className="fa-solid fa-location-arrow me-2" style={{ color: 'var(--blue)' }}></i>Most Visited Warning Zones</div>
                      <div className="c-sub">Locations where detections were registered</div>
                    </div>
                  </div>
                  <div className="c-body">
                    {userViolations.length === 0 ? (
                      <div className="empty-state" style={{ height: '240px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fa-solid fa-map-location-dot fa-2x mb-2" style={{ color: 'var(--blue)' }}></i>
                        <p>Your campus footprint is completely clean</p>
                      </div>
                    ) : (
                      <div className="chart-h240">
                        <Bar data={userLocationData} options={commonOptions} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Nicotine Quit Advisory Support */}
                <div className="c" style={{ border: '1px solid rgba(16, 185, 129, 0.2)', background: 'rgba(16, 185, 129, 0.02)' }}>
                  <div className="c-head">
                    <div>
                      <div className="c-title"><i className="fa-solid fa-hand-holding-heart me-2" style={{ color: 'var(--green)' }}></i>Personal Cessation Support</div>
                      <div className="c-sub">Smart automated wellness coaching suggestions</div>
                    </div>
                  </div>
                  <div className="c-body">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', padding: '16px', borderRadius: 12 }}>
                        <div style={{ fontWeight: 700, color: 'var(--tx1)', marginBottom: '6px', fontSize: '14px' }}>
                          <i className="fa-solid fa-brain me-2" style={{ color: 'var(--amber)' }}></i>Quitting Tip of the Day
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--tx3)', lineHeight: 1.6 }}>
                          {userViolations.length > 0 
                            ? "We noticed some detections registered. Quitting is a journey—substituting cravings with a quick 5-minute sugar-free chewable candy or holding a straw can mimic hand-to-mouth habits and significantly reduce the urge."
                            : "Splendid job! Maintaining a clean record is excellent for your cardiovascular endurance. Consistent clean weeks can increase lung capacity by up to 30%!"}
                        </div>
                      </div>
                      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', padding: '16px', borderRadius: 12 }}>
                        <div style={{ fontWeight: 700, color: 'var(--tx1)', marginBottom: '6px', fontSize: '14px' }}>
                          <i className="fa-solid fa-stethoscope me-2" style={{ color: 'var(--blue)' }}></i>Health Milestones
                        </div>
                        <ul style={{ fontSize: '13px', color: 'var(--tx3)', paddingLeft: '18px', margin: 0, lineHeight: 1.8 }}>
                          <li><strong>24 Hours:</strong> Nicotine levels in the bloodstream drop to near-zero.</li>
                          <li><strong>48 Hours:</strong> Nerve endings start regenerating; smell and taste senses improve.</li>
                          <li><strong>1 Year:</strong> Excess risk of coronary heart disease is halved compared to active smokers.</li>
                        </ul>
                      </div>
                    </div>
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
