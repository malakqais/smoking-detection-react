import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/LOGO.png';

const Logout = () => {
  const navigate = useNavigate();
  const [secs, setSecs] = useState(5);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("user");
    localStorage.removeItem("loginTime");
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    const timer = setInterval(() => {
      setSecs((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/login');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div className="logout-body">
      <div className="bg-orb orb-l1"></div>
      <div className="bg-orb orb-l2"></div>

      <div className="logout-card">
        <div className="check-ring"><i className="fa-solid fa-check"></i></div>

        <div className="logout-title">Signed Out</div>
        <div className="logout-sub">You've been securely logged out.<br />Your session has been cleared.</div>

        <div className="countdown-bar">
          <div 
            className="countdown-fill" 
            style={{ width: `${(secs / 5) * 100}%` }}
          ></div>
        </div>
        <div className="countdown-text">Redirecting to login in <strong>{secs}</strong>s</div>

        <button className="btn-login-go" onClick={() => navigate('/login')}>
          <i className="fa-solid fa-right-to-bracket me-2"></i>
          Go to Login
        </button>

        <div className="divider-or">or</div>

        <button className="btn-dashboard-out" onClick={() => navigate('/login')}>
          <i className="fa-solid fa-gauge-high me-2"></i>
          Back to Dashboard
        </button>

        <div className="brand">
          <img src={logo} alt="Logo" />
          <div className="brand-name">SmokeDet System &copy; 2026</div>
        </div>
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button 
            onClick={toggleTheme} 
            style={{ background: 'rgba(0,0,0,0.06)', border: '1px solid var(--border)', borderRadius: '20px', padding: '5px 13px', fontSize: '11.5px', color: 'var(--tx3)', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <i className={`fa-solid ${theme === 'dark' ? 'fa-moon' : 'fa-sun'} me-2`}></i>
            {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Logout;
