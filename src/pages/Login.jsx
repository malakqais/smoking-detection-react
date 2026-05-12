import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logo from '../assets/LOGO.png';

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log("Submitting login to /login...");
      const response = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      console.log("Response status:", response.status);

      if (response.ok) {
        // Safe JSON parse for success
        const result = await response.json().catch(() => ({}));
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('user', JSON.stringify({ 
          name: result.user?.name || "Admin", 
          email: email, 
          role: result.user?.role || "admin" 
        }));
        navigate('/');
      } else {
        // Safe JSON parse for errors
        const result = await response.json().catch(() => ({ message: "Server error (" + response.status + ")" }));
        setError(result.message || "Invalid email or password.");
      }
    } catch (err) {
      setError("Cannot connect to server. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      {/* Left panel */}
      <div className="auth-left">
        <img src={logo} className="auth-brand-logo" alt="Logo" />
        <div className="auth-tagline">Intelligent<br /><span>Smoke Detection</span></div>
        <p className="auth-desc">AI-powered real-time monitoring system that detects smoking violations using advanced computer vision.</p>

        <div style={{ width: '100%', maxWidth: '340px' }}>
          <div className="auth-feature">
            <div className="af-icon"><i className="fa-solid fa-eye"></i></div>
            <div>
              <div className="af-text">Real-time Detection</div>
              <div className="af-sub">YOLOv8-powered vision at 92% accuracy</div>
            </div>
          </div>
          <div className="auth-feature">
            <div className="af-icon"><i className="fa-solid fa-bell"></i></div>
            <div>
              <div className="af-text">Instant Alerts</div>
              <div className="af-sub">Email notifications within seconds</div>
            </div>
          </div>
          <div className="auth-feature">
            <div className="af-icon"><i className="fa-solid fa-chart-line"></i></div>
            <div>
              <div className="af-text">Full Analytics</div>
              <div className="af-sub">Track violations across all zones</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="auth-right">
        <div className="auth-form">
          <img src={logo} alt="Logo" style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '10px', marginBottom: '20px' }} />
          <div className="form-title">Welcome back</div>
          <div className="form-sub">Sign in to your account</div>

          <div className={`error-msg ${error ? 'show' : ''}`}>
            <i className="fa-solid fa-circle-exclamation"></i>
            <span>{error}</span>
          </div>

          <form onSubmit={handleLogin} noValidate>
            <div className="fgroup">
              <label className="flabel">Email address</label>
              <div className="input-icon-wrap">
                <i className="fa-solid fa-envelope"></i>
                <input
                  type="email"
                  className="finput"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="fgroup">
              <label className="flabel">Password</label>
              <div className="input-icon-wrap">
                <i className="fa-solid fa-lock"></i>
                <input
                  type={showPassword ? "text" : "password"}
                  className="finput"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <span className="show-pass" onClick={() => setShowPassword(!showPassword)}>
                  <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </span>
              </div>
            </div>

            <button type="submit" className="btn-auth" disabled={loading}>
              {loading ? (
                <><i className="fa-solid fa-spinner fa-spin me-2"></i>Signing in...</>
              ) : (
                <><i className="fa-solid fa-right-to-bracket me-2"></i>Sign In</>
              )}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '13px', color: 'var(--tx3)' }}>
            Don't have an account? <Link to="/signup" className="link-r">Create account</Link>
          </p>

          <div style={{ textAlign: 'center', marginTop: '28px' }}>
            <button
              onClick={toggleTheme}
              style={{ background: 'rgba(0,0,0,0.06)', border: '1px solid var(--border)', borderRadius: '20px', padding: '6px 14px', fontSize: '12px', color: 'var(--tx2)', cursor: 'pointer', fontFamily: 'inherit', transition: 'var(--tr)' }}
            >
              <i className={`fa-solid ${theme === 'dark' ? 'fa-moon' : 'fa-sun'} me-2`}></i>
              {theme === 'dark' ? 'Dark mode' : 'Light mode'}
            </button>
          </div>
          <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '11px', color: 'var(--tx3)' }}>
            Smoking Detection System &copy; 2026
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
