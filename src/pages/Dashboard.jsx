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
import { playAlarmTone } from '../utils/alarmTone';
import KpiCards from '../components/dashboard/KpiCards';
import AiLogsPanel from '../components/dashboard/AiLogsPanel';
import CameraGrid from '../components/dashboard/CameraGrid';
import ViolationsTable from '../components/dashboard/ViolationsTable';
import NotificationDrawer from '../components/dashboard/NotificationDrawer';
import EvidenceModal from '../components/dashboard/EvidenceModal';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const Dashboard = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "true");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [notifOpen, setNotifOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user] = useState(() => JSON.parse(localStorage.getItem('user') || '{"name":"User","role":"admin","email":"user@example.com"}'));

  const [violations, setViolations] = useState([]);
  const [myViolations, setMyViolations] = useState([]);
  const [showPayModal, setShowPayModal] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCVC, setCardCVC] = useState("");
  const [paying, setPaying] = useState(false);

  const [detectionRunning, setDetectionRunning] = useState(false);
  const [activeWebcamUsers, setActiveWebcamUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [locFilter, setLocFilter] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleString());
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const alarmSound = useRef(null);
  const prevCount = useRef(0);
  const lastSoundAlertRef = useRef(0);

  // Custom premium confirmation states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmCallback, setConfirmCallback] = useState(null);

  // Hidden references for student background webcam streamer
  const studentVideoRef = useRef(null);
  const studentCanvasRef = useRef(null);
  const studentStreamRef = useRef(null);

  useEffect(() => {
    // ONLY run webcam capture for standard users
    if (user.role === 'admin') return;
    
    let activeInterval = null;

    if (detectionRunning) {
      console.log("[AI Stream] Starting background student webcam stream...");
      
      const video = document.createElement('video');
      video.width = 640;
      video.height = 480;
      video.autoplay = true;
      video.playsInline = true;
      studentVideoRef.current = video;

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      studentCanvasRef.current = canvas;

      navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
        .then(stream => {
          studentStreamRef.current = stream;
          video.srcObject = stream;
          video.play();

          const autoCapture = localStorage.getItem('autoCapture') !== 'false';
          const uploadFps = Math.max(1, Number(localStorage.getItem('throttle') || 60));
          const uploadIntervalMs = Math.max(16, Math.round(1000 / uploadFps));
          activeInterval = setInterval(() => {
            if (!autoCapture) return;
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
              const ctx = canvas.getContext('2d');
              ctx.drawImage(video, 0, 0, 640, 480);
              
              // Compress to jpeg at 60% quality to save network bandwidth
              const base64Img = canvas.toDataURL('image/jpeg', 0.60);
              
              fetch('/api/detection/upload_frame', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user.name, image: base64Img })
              }).catch(err => console.error("[AI Stream] Upload failed", err));
            }
          }, uploadIntervalMs);
        })
        .catch(err => {
          console.warn("[AI Stream] Webcam access denied or unavailable:", err);
        });
    }

    return () => {
      if (activeInterval) clearInterval(activeInterval);
      if (studentStreamRef.current) {
        console.log("[AI Stream] Releasing student webcam...");
        studentStreamRef.current.getTracks().forEach(track => track.stop());
        studentStreamRef.current = null;
      }
    };
  }, [detectionRunning, user.role, user.name]);

  // Dynamic AI Diagnostics Live-Stream logs
  const [aiLogs, setAiLogs] = useState([
    `[${new Date().toLocaleTimeString()}] 🟢 Core AI module online. YOLOv8 nano listening...`,
    `[${new Date().toLocaleTimeString()}] 🟢 Active surveillance shield ready.`,
    `[${new Date().toLocaleTimeString()}] 🟡 Passive perimeter scanning engaged.`
  ]);

  const fetchDetectionLogs = async () => {
    try {
      const res = await fetch('/api/detection/logs?limit=50');
      if (!res.ok) return;
      const logs = await res.json();
      if (!Array.isArray(logs) || logs.length === 0) return;
      const mapped = logs.map((entry) => {
        const levelIcon = entry.level === 'error' ? '🔴' : entry.level === 'warn' ? '🟡' : '🟢';
        return `[${entry.timestamp}] ${levelIcon} ${entry.message}`;
      });
      setAiLogs(mapped);
    } catch {}
  };

  const playAlarm = () => {
    const toneId = localStorage.getItem('alarmTone') || 'high_beep';
    playAlarmTone(toneId);
  };

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
        const userSpecific = data.filter(v => 
          v.name && v.name.toLowerCase() === user.name.toLowerCase()
        );
        setMyViolations(userSpecific);
        if (data.length > prevCount.current && prevCount.current > 0) {
          const soundEnabled = localStorage.getItem('soundAlerts') !== 'false';
          const cooldownSeconds = Math.max(1, Number(localStorage.getItem('alertCooldown') || 60));
          const nowMs = Date.now();
          if (soundEnabled) {
            if (nowMs - lastSoundAlertRef.current >= cooldownSeconds * 1000) {
              playAlarm();
              lastSoundAlertRef.current = nowMs;
            }
          }

          fetchDetectionLogs();
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

  const fetchActiveWebcamStreams = async () => {
    if (user.role !== 'admin' || !detectionRunning) {
      setActiveWebcamUsers([]);
      return;
    }
    try {
      const res = await fetch('/api/detection/active_streams');
      if (res.ok) {
        const data = await res.json();
        setActiveWebcamUsers(data);
      }
    } catch (e) {
      console.error("Failed to fetch active webcam streams", e);
    }
  };

  useEffect(() => {
    fetchViolations();
    fetchDetectionStatus();
    fetchDetectionLogs();
    const poll = setInterval(() => {
      fetchViolations();
      fetchDetectionStatus();
      fetchDetectionLogs();
    }, 5000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    if (user.role !== 'admin') return;
    let streamPoll = null;
    if (detectionRunning) {
      fetchActiveWebcamStreams();
      // Fast check for active user cams every 3 seconds to keep UI highly reactive
      streamPoll = setInterval(fetchActiveWebcamStreams, 3000);
    } else {
      setActiveWebcamUsers([]);
    }
    return () => {
      if (streamPoll) clearInterval(streamPoll);
    };
  }, [detectionRunning, user.role]);

  const toggleDetection = async () => {
    if (detectionRunning) {
      await fetch('/api/detection/stop', { method: 'POST' });
      setDetectionRunning(false);
    } else {
      const storedCameras = JSON.parse(localStorage.getItem('cameras')) || [
        { id: 0, location: 'Main Lobby', enabled: true },
        { id: 1, location: 'Parking Area', enabled: false },
        { id: 2, location: 'Cafeteria', enabled: false }
      ];
      const activeCams = storedCameras.filter(c => c.enabled).map(c => ({ index: c.id, location: c.location }));
      await fetch('/api/detection/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cameras: activeCams.length > 0 ? activeCams : [{ index: 0, location: 'Main Lobby' }] })
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

  const activeCams = useMemo(() => {
    if (user.role === 'admin' && activeWebcamUsers.length > 0) {
      return activeWebcamUsers.map((username, i) => ({
        name: `${username}'s Workspace`,
        cam: `Webcam Feed`,
        active: true,
        isWebcam: true,
        userRef: username
      }));
    }

    const stored = JSON.parse(localStorage.getItem('cameras')) || [
      { id: 0, name: 'Camera 0', location: 'Main Lobby', enabled: true },
      { id: 1, name: 'Camera 1', location: 'Parking Area', enabled: false },
      { id: 2, name: 'Camera 2', location: 'Cafeteria', enabled: false }
    ];
    return stored.map(c => ({
      name: c.location,
      cam: c.name,
      active: detectionRunning && c.enabled,
      isWebcam: false,
      userRef: null
    }));
  }, [detectionRunning, activeWebcamUsers, user.role]);

  const filteredViolations = useMemo(() => {
    return violations.filter(v => {
      if (user.role === 'admin' && v.name === user.name) return false;
      const q = searchQuery.toLowerCase();
      const matchQ = !q || v.location?.toLowerCase().includes(q) || v.name?.toLowerCase().includes(q) || v.time?.toLowerCase().includes(q);
      const matchL = !locFilter || v.location === locFilter;
      return matchQ && matchL;
    });
  }, [violations, searchQuery, locFilter, user.name, user.role]);

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

  const userChartData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });

    const counts = days.map(dayStr => {
      return myViolations.filter(v => {
        const vDate = v.time ? v.time.split(' ')[0] : '';
        const vTimestamp = v.timestamp ? v.timestamp.split('T')[0] : '';
        return vDate === dayStr || vTimestamp === dayStr;
      }).length;
    });

    const labels = days.map(dayStr => new Date(dayStr + 'T12:00:00').toLocaleDateString('en', { weekday: 'short' }));

    return {
      labels,
      datasets: [
        {
          label: 'My Violations',
          data: counts,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: true,
          tension: 0.45
        }
      ]
    };
  }, [myViolations]);

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
    setConfirmMessage("Are you sure you want to permanently clear all violation logs? This will wipe the surveillance archive.");
    setConfirmCallback(() => async () => {
      await fetch('/api/violations/clear', { method: 'POST' });
      setViolations([]);
      prevCount.current = 0;
    });
    setShowConfirmModal(true);
  };

  const handleDeleteViolation = async (violationId) => {
    await fetch(`/api/violations/${violationId}/delete`, { method: 'POST' });
    setViolations(prev => prev.filter(x => x.id !== violationId));
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
    const unpaidFine = myViolations.length * 20;
    const MONITORED_ZONES = activeCams.map(c => c.name);

    const handlePaySubmit = (e) => {
      e.preventDefault();
      setPaying(true);
      setTimeout(() => {
        setPaying(false);
        setShowPayModal(false);
        setMyViolations([]);
        setCardNumber("");
        setCardExpiry("");
        setCardCVC("");
      }, 2000);
    };


    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' }, beginAtZero: true }
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

            {/* Health & Fine Status Banner */}
            <div className="user-awareness-banner mb-4 stagger-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', background: unpaidFine > 0 ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.05) 100%)' : 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%)', borderColor: unpaidFine > 0 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)' }}>
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                <div className="uab-icon" style={{ background: unpaidFine > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: unpaidFine > 0 ? 'var(--red)' : 'var(--green)' }}><i className={unpaidFine > 0 ? "fa-solid fa-skull-crossbones" : "fa-solid fa-circle-check"}></i></div>
                <div className="uab-body">
                  <div className="uab-title" style={{ color: unpaidFine > 0 ? 'var(--red)' : 'var(--green)' }}>{unpaidFine > 0 ? "Fine Penalty Warning Issued" : "Clean Account Standing"}</div>
                  <div className="uab-sub" style={{ maxWidth: '600px' }}>{unpaidFine > 0 ? "Our AI detection system logged smoking/vaping violations matching your student ID. Please pay the outstanding fines to prevent academic hold." : "Excellent job! You currently have no outstanding penalties. Keep supporting a smoke-free campus."}</div>
                </div>
              </div>
              <span className={`tag ${unpaidFine > 0 ? 'r' : 'g'}`}>{unpaidFine > 0 ? 'Pending Payment' : 'Healthy Status'}</span>
            </div>

            {/* Status KPIs */}
            <div className="kpi-grid mb-4 stagger-2">
              <div className="kpi r" style={{ borderLeft: '4px solid var(--red)', background: 'var(--card)' }}>
                <div className="kpi-icon" style={{ color: 'var(--red)' }}><i className="fa-solid fa-wallet"></i></div>
                <div className="kpi-val">${unpaidFine.toFixed(2)}</div>
                <div className="kpi-lbl">Outstanding Fine Penalty</div>
              </div>
              <div className="kpi a" style={{ borderLeft: '4px solid var(--amber)', background: 'var(--card)' }}>
                <div className="kpi-icon" style={{ color: 'var(--amber)' }}><i className="fa-solid fa-triangle-exclamation"></i></div>
                <div className="kpi-val">{myViolations.length}</div>
                <div className="kpi-lbl">Total Incidents Logged</div>
              </div>
              <div className="kpi g" style={{ borderLeft: '4px solid var(--green)', background: 'var(--card)' }}>
                <div className="kpi-icon" style={{ color: 'var(--green)' }}><i className="fa-solid fa-heart-pulse"></i></div>
                <div className="kpi-val">{unpaidFine > 0 ? '90.2%' : '100%'}</div>
                <div className="kpi-lbl">Health Score Rating</div>
              </div>
              <div className="kpi b" style={{ borderLeft: '4px solid var(--blue)', background: 'var(--card)' }}>
                <div className="kpi-icon" style={{ color: 'var(--blue)' }}><i className="fa-solid fa-video"></i></div>
                <div className="kpi-val">{MONITORED_ZONES.length}</div>
                <div className="kpi-lbl">Surveillance Cameras</div>
              </div>
            </div>

            <div className="grid-2 mb-4 stagger-3">
              {/* My Violations Details */}
              <div className="c">
                <div className="c-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div className="c-title"><i className="fa-solid fa-receipt me-2" style={{ color: 'var(--red)' }}></i>My Violation Incidents</div>
                    <div className="c-sub">Fines are billed at $20.00 per logged instance</div>
                  </div>
                  {unpaidFine > 0 && (
                    <button className="btn-r btn-sm" onClick={() => setShowPayModal(true)}>
                      <i className="fa-solid fa-credit-card me-1"></i>Pay Outstanding Fine
                    </button>
                  )}
                </div>
                <div className="c-body" style={{ maxHeight: '350px', overflowY: 'auto', padding: '0 16px' }}>
                  {myViolations.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', color: 'var(--tx3)' }}>
                      <i className="fa-solid fa-smile-wink fa-3x mb-3" style={{ color: 'var(--green)' }}></i>
                      <p style={{ fontWeight: 600, color: 'var(--tx1)', marginBottom: 4 }}>No Violations Logged</p>
                      <p style={{ fontSize: 13 }}>Your account record is perfectly clear!</p>
                    </div>
                  ) : (
                    myViolations.map((v, i) => (
                      <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                            <i className="fa-solid fa-exclamation-triangle"></i>
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--tx1)', fontSize: 14 }}>Smoking Detected at {v.location}</div>
                            <div style={{ fontSize: 12, color: 'var(--tx3)' }}><i className="fa-regular fa-clock me-1"></i>{v.time}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, color: 'var(--red)', fontSize: 14 }}>$20.00</div>
                          <span className="tag r" style={{ fontSize: 10, padding: '2px 6px' }}>Unresolved</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Weekly Analytics Chart */}
              <div className="c">
                <div className="c-head">
                  <div>
                    <div className="c-title"><i className="fa-solid fa-chart-line me-2" style={{ color: 'var(--amber)' }}></i>Weekly Incident Progression</div>
                    <div className="c-sub">Your personal smoking detection trend</div>
                  </div>
                </div>
                <div className="c-body" style={{ height: '300px' }}>
                  <Line data={userChartData} options={commonOptions} />
                </div>
              </div>
            </div>

            <div className="grid-2">
              {/* Campus Smoking Guidelines */}
              <div className="c">
                <div className="c-head">
                  <div>
                    <div className="c-title"><i className="fa-solid fa-scale-balanced me-2" style={{ color: 'var(--blue)' }}></i>Rules & Regulations</div>
                    <div className="c-sub">Mandatory compliance directives for campus environment</div>
                  </div>
                </div>
                <div className="c-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className="fa-solid fa-dollar-sign"></i>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--tx1)', fontSize: 14, marginBottom: 4 }}>Standard Fine Penalty ($20.00)</div>
                      <div style={{ fontSize: 13, color: 'var(--tx3)' }}>Every smoking detection (cigarette, vaping device, or smoke cloud) generates a flat $20 ticket tied to the user's student account.</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className="fa-solid fa-graduation-cap"></i>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--tx1)', fontSize: 14, marginBottom: 4 }}>Academic Transcript Hold</div>
                      <div style={{ fontSize: 13, color: 'var(--tx3)' }}>Fines must be settled before the semester registration period ends, or your profile will be locked, restricting grade checkouts.</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className="fa-solid fa-heart-pulse"></i>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--tx1)', fontSize: 14, marginBottom: 4 }}>Smoke Cessation Resources</div>
                      <div style={{ fontSize: 13, color: 'var(--tx3)' }}>Need help quitting? Contact the Campus Medical Hub for free nicotine patches, counseling support, and physical therapy sessions.</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Monitored Campus Zones */}
              <div className="c">
                <div className="c-head">
                  <div>
                    <div className="c-title"><i className="fa-solid fa-location-crosshairs me-2" style={{ color: 'var(--red)' }}></i>Surveillance Campus Zones</div>
                    <div className="c-sub">Areas equipped with real-time AI computer vision models</div>
                  </div>
                </div>
                <div className="c-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {MONITORED_ZONES.map((z, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: activeCams[i]?.active ? 'var(--green)' : 'var(--tx3)', flexShrink: 0 }}></div>
                      <div style={{ flex: 1, fontWeight: 600, fontSize: 14, color: 'var(--tx1)' }}>{z}</div>
                      <span className={`tag ${activeCams[i]?.active ? 'g' : ''}`} style={!(activeCams[i]?.active) ? { color: 'var(--tx3)', background: 'var(--card2)', border: '1px solid var(--border)', fontSize: '11px' } : { fontSize: '11px' }}>
                        {activeCams[i]?.active ? 'Real-Time AI Active' : 'Passive Shield Active'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Custom Payment Modal (Stripe Checkout Form Mock) */}
            {showPayModal && (
              <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                <div className="c" style={{ maxWidth: '450px', width: '100%', background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', borderRadius: 20, overflow: 'hidden' }}>
                  <div className="c-head" style={{ borderBottom: '1px solid var(--border)', padding: '20px 24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '18px', color: 'var(--tx1)' }}><i className="fa-solid fa-credit-card me-2" style={{ color: 'var(--blue)' }}></i>Secure Checkout</div>
                        <div style={{ fontSize: '13px', color: 'var(--tx3)', marginTop: 2 }}>Settling Outstanding Penalty Ticket</div>
                      </div>
                      <div style={{ cursor: 'pointer', fontSize: 18, color: 'var(--tx3)' }} onClick={() => setShowPayModal(false)}><i className="fa-solid fa-xmark"></i></div>
                    </div>
                  </div>
                  <form onSubmit={handlePaySubmit} style={{ padding: '24px' }}>
                    <div style={{ background: 'var(--card2)', border: '1px solid var(--border)', padding: '16px', borderRadius: 12, marginBottom: '20px', textAlign: 'center' }}>
                      <div style={{ fontSize: '13px', color: 'var(--tx3)', marginBottom: '4px' }}>Amount to Pay</div>
                      <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--tx1)' }}>${unpaidFine.toFixed(2)}</div>
                    </div>

                    <div className="mb-3">
                      <label className="form-label" style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)' }}>Cardholder Name</label>
                      <input type="text" className="form-control" defaultValue={user.name} required style={{ background: 'var(--card2)', color: 'var(--tx1)', border: '1px solid var(--border)' }} />
                    </div>

                    <div className="mb-3">
                      <label className="form-label" style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)' }}>Credit Card Number</label>
                      <div style={{ position: 'relative' }}>
                        <input type="text" className="form-control" placeholder="4242 •••• •••• 4242" value={cardNumber} onChange={e => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))} required style={{ background: 'var(--card2)', color: 'var(--tx1)', border: '1px solid var(--border)', paddingLeft: '38px' }} />
                        <i className="fa-solid fa-credit-card" style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--tx3)' }}></i>
                      </div>
                    </div>

                    <div className="row g-3 mb-4">
                      <div className="col-6">
                        <label className="form-label" style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)' }}>Expiration Date</label>
                        <input type="text" className="form-control" placeholder="MM/YY" value={cardExpiry} onChange={e => setCardExpiry(e.target.value.slice(0, 5))} required style={{ background: 'var(--card2)', color: 'var(--tx1)', border: '1px solid var(--border)' }} />
                      </div>
                      <div className="col-6">
                        <label className="form-label" style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)' }}>CVV / CVC</label>
                        <input type="password" className="form-control" placeholder="•••" value={cardCVC} onChange={e => setCardCVC(e.target.value.replace(/\D/g, '').slice(0, 3))} required style={{ background: 'var(--card2)', color: 'var(--tx1)', border: '1px solid var(--border)' }} />
                      </div>
                    </div>

                    <button type="submit" className="btn-r w-100" disabled={paying} style={{ height: '48px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      {paying ? (
                        <>
                          <i className="fa-solid fa-spinner fa-spin"></i>
                          Processing Checkout...
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-lock"></i>
                          Authorize Payment of ${unpaidFine.toFixed(2)}
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    );
  }
  /* ─────────────────────────────────────────────────────────── */

  return (
    <div className="layout">
      <audio ref={alarmSound} src="https://www.soundjay.com/buttons/sounds/beep-01a.mp3" preload="auto"></audio>
      <style>{`
        @keyframes radar-sweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse-glow {
          0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          70% { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
          100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
        }
        @keyframes card-cascade {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        .hud-radar-scanner {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 1px solid rgba(16,185,129,0.3);
          position: relative;
          background: radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 70%);
          overflow: hidden;
        }
        .hud-radar-scanner::after {
          content: "";
          position: absolute;
          top: 0; left: 0; width: 100%; height: 100%;
          background: conic-gradient(from 0deg, rgba(16,185,129,0.4) 0deg, rgba(16,185,129,0.1) 120deg, transparent 240deg);
          border-radius: 50%;
          animation: radar-sweep 3s linear infinite;
          transform-origin: center;
        }

        .cam-feed {
          position: relative;
          overflow: hidden;
        }
        .cf-hud-grid {
          position: absolute;
          top: 0; left: 0; width: 100%; height: 100%;
          background-image: radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 16px 16px;
          pointer-events: none;
          z-index: 1;
        }
        .cf-hud-crosshair {
          position: absolute;
          top: 50%; left: 50%;
          width: 40px; height: 40px;
          border: 1px solid rgba(59,130,246,0.35);
          border-radius: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
          z-index: 1;
        }
        .cf-hud-crosshair::before {
          content: "";
          position: absolute;
          top: 50%; left: -10px; width: 60px; height: 1px;
          background: rgba(59,130,246,0.35);
        }
        .cf-hud-crosshair::after {
          content: "";
          position: absolute;
          left: 50%; top: -10px; width: 1px; height: 60px;
          background: rgba(59,130,246,0.35);
        }

        .cf-hud-telemetry {
          position: absolute;
          top: 45px;
          left: 15px;
          font-family: monospace;
          font-size: 9px;
          color: rgba(59,130,246,0.85);
          line-height: 1.4;
          pointer-events: none;
          z-index: 1;
          text-shadow: 0 0 4px rgba(59,130,246,0.5);
          text-align: left;
        }

        .kpi, .c {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .kpi:hover, .c:hover {
          transform: translateY(-4px) scale(1.01);
          box-shadow: 0 12px 30px rgba(0,0,0,0.3) !important;
          border-color: rgba(245,158,11,0.25) !important;
        }

        .stagger-1 { animation: card-cascade 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
        .stagger-2 { animation: card-cascade 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
        .stagger-3 { animation: card-cascade 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
      `}</style>

      <div className={`sb-overlay ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)}></div>
      <div className={`notif-overlay ${notifOpen ? 'visible' : ''}`} onClick={() => setNotifOpen(false)}></div>

      <NotificationDrawer
        notifOpen={notifOpen}
        violations={violations}
        onClose={() => setNotifOpen(false)}
        onClear={clearLogs}
      />

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
            <button
              className={`btn-ghost btn-sm`}
              onClick={toggleDetection}
              style={{ color: detectionRunning ? 'var(--red)' : 'var(--green)', borderColor: detectionRunning ? 'var(--red)' : 'var(--green)' }}
            >
              <i className={`fa-solid ${detectionRunning ? 'fa-stop' : 'fa-play'} me-1`}></i>
              {detectionRunning ? 'Stop Detection' : 'Start Detection'}
            </button>
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
          <KpiCards
            todayCount={todayCount}
            totalViolations={violations.length}
            detectionRunning={detectionRunning}
          />

          <div className="grid-2-1 stagger-2">
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

            <AiLogsPanel aiLogs={aiLogs} detectionRunning={detectionRunning} />
          </div>

          <CameraGrid
            activeCams={activeCams}
            currentTime={currentTime}
            todayCount={todayCount}
            detectionRunning={detectionRunning}
          />

          <ViolationsTable
            userRole={user.role}
            exportCSV={exportCSV}
            clearLogs={clearLogs}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            locFilter={locFilter}
            setLocFilter={setLocFilter}
            locations={locations}
            filteredViolations={filteredViolations}
            setSelectedEvidence={setSelectedEvidence}
            onDeleteViolation={handleDeleteViolation}
          />
        </div>
      </main>

      <EvidenceModal selectedEvidence={selectedEvidence} onClose={() => setSelectedEvidence(null)} />

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

export default Dashboard;
