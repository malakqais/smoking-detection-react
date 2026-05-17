import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logo from '../assets/LOGO.png';

const SignUp = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const pwStrength = useMemo(() => {
    if (!password) return { width: '0%', color: 'transparent' };
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    
    const colors = ["#ef4444", "#f59e0b", "#3b82f6", "#10b981"];
    const widths = ["25%", "50%", "75%", "100%"];
    
    return {
      width: widths[score - 1] || "25%",
      color: colors[score - 1] || colors[0]
    };
  }, [password]);

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      console.log("Submitting signup to /signup...");
      const response = await fetch('/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });

      console.log("Response status:", response.status);

      if (response.ok) {
        // Safe JSON parse for success
        const result = await response.json().catch(() => ({})); 
        setSuccess(true);
        setTimeout(() => navigate('/login'), 1500);
      } else {
        // Safe JSON parse for errors
        const result = await response.json().catch(() => ({ message: "Server error (" + response.status + ")" }));
        setError(result.message || "Signup failed");
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
        <div className="auth-tagline">Join the<br /><span>Detection Network</span></div>
        <p className="auth-desc">Create your account to start monitoring smoking violations across your facility.</p>

        <div style={{ width: '100%', maxWidth: '340px' }}>
          <div className="auth-feature">
            <div className="af-icon"><i className="fa-solid fa-shield-halved"></i></div>
            <div>
              <div className="af-text">Secure Access</div>
              <div className="af-sub">Role-based dashboard access control</div>
            </div>
          </div>
          <div className="auth-feature">
            <div className="af-icon"><i className="fa-solid fa-camera"></i></div>
            <div>
              <div className="af-text">Multi-Camera Support</div>
              <div className="af-sub">Monitor all zones from one dashboard</div>
            </div>
          </div>
          <div className="auth-feature">
            <div className="af-icon"><i className="fa-solid fa-envelope"></i></div>
            <div>
              <div className="af-text">Email Notifications</div>
              <div className="af-sub">Get instant violation alerts via email</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="auth-right">
        <div className="auth-form">
          <img src={logo} alt="Logo" style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '10px', marginBottom: '20px' }} />
          <div className="form-title">Create account</div>
          <div className="form-sub">Join the detection network</div>

          <div className={`success-msg ${success ? 'show' : ''}`}>
            <i className="fa-solid fa-circle-check"></i>
            <span>Account created! Redirecting to login...</span>
          </div>

          <div className={`error-msg ${error ? 'show' : ''}`}>
            <i className="fa-solid fa-circle-exclamation"></i>
            <span>{error}</span>
          </div>

          <form onSubmit={handleSignup} noValidate>
            <div className="fgroup">
              <label className="flabel">Full Name</label>
              <div className="input-icon-wrap">
                <i className="fa-solid fa-user"></i>
                <input
                  type="text"
                  className="finput"
                  placeholder="John Smith"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>

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
              {email.endsWith('@smoker.jr') ? (
                <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fa-solid fa-shield-halved"></i> This email will receive <strong>admin</strong> access
                </div>
              ) : email.includes('@') && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--tx3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fa-solid fa-circle-user"></i> Standard user account
                </div>
              )}
            </div>

            <div className="fgroup">
              <label className="flabel">Password</label>
              <div className="input-icon-wrap">
                <i className="fa-solid fa-lock"></i>
                <input
                  type={showPassword ? "text" : "password"}
                  className="finput"
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <span className="show-pass" onClick={() => setShowPassword(!showPassword)}>
                  <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </span>
              </div>
              <div className="pw-strength">
                <div className="pw-bar" style={{ width: pwStrength.width, background: pwStrength.color }}></div>
              </div>
            </div>

            <button type="submit" className="btn-auth" disabled={loading}>
              {loading ? (
                <><i className="fa-solid fa-spinner fa-spin me-2"></i>Creating account...</>
              ) : (
                <><i className="fa-solid fa-user-plus me-2"></i>Create Account</>
              )}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '13px', color: 'var(--tx3)' }}>
            Already have an account? <Link to="/login" className="link-r">Sign in</Link>
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

export default SignUp;
