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

  // Two-Factor Authentication states
  const [show2FA, setShow2FA] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [pendingUser, setPendingUser] = useState(null);
  const [otpError, setOtpError] = useState("");

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const establishSession = (userData) => {
    const now = Date.now();
    const sessionId = `${now}-${Math.random().toString(36).slice(2, 10)}`;

    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('loginTime', now.toString());
    localStorage.setItem('activeSessionId', sessionId);
    localStorage.setItem('user', JSON.stringify(userData));

    const history = JSON.parse(localStorage.getItem('sessionHistory') || '[]');
    history.unshift({
      id: sessionId,
      startedAt: now,
      userEmail: userData?.email || email,
      device: 'This device',
    });
    localStorage.setItem('sessionHistory', JSON.stringify(history.slice(0, 20)));

    const loginNotifEnabled = localStorage.getItem('loginNotif') !== 'false';
    if (loginNotifEnabled) {
      localStorage.setItem('lastLoginNotificationAt', now.toString());
    }
  };

  const handleOTPChange = (value, index) => {
    if (value && isNaN(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.substring(value.length - 1);
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      setTimeout(() => {
        document.getElementById(`otp-${index + 1}`)?.focus();
      }, 10);
    }
  };

  const handleOTPKeyDown = (e, index) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      setTimeout(() => {
        document.getElementById(`otp-${index - 1}`)?.focus();
      }, 10);
    }
  };

  const handleOTPSubmit = async (e) => {
    e.preventDefault();
    const entered = otp.join("");
    if (entered.length < 6) {
      setOtpError("Please enter all 6 digits.");
      return;
    }
    
    setLoading(true);
    setOtpError("");
    try {
      const res = await fetch('/login/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: entered })
      });
      
      if (res.ok) {
        const result = await res.json();
        establishSession(result.user);
        navigate('/');
      } else {
        const result = await res.json().catch(() => ({ message: "Invalid verification code." }));
        setOtpError(result.message || "Invalid verification code. Please check Authenticator.");
      }
    } catch (err) {
      setOtpError("Connection error. Make sure the server is online.");
    } finally {
      setLoading(false);
    }
  };

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
        const result = await response.json().catch(() => ({}));
        if (result.status === "2fa_required") {
          setPendingUser(result.user);
          setShow2FA(true);
        } else {
          establishSession(result.user);
          navigate('/');
        }
      } else {
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
          {!show2FA ? (
            <>
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
                    <button
                      type="button"
                      className="show-pass"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                    </button>
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
            </>
          ) : (
            <>
              <div className="form-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-shield-halved" style={{ color: 'var(--red)' }}></i>Two-Factor Code
              </div>
              <div className="form-sub">A security verification credential is required to proceed. Enter the 6-digit code below.</div>

              <div className={`error-msg ${otpError ? 'show' : ''}`}>
                <i className="fa-solid fa-circle-exclamation"></i>
                <span>{otpError}</span>
              </div>

              <form onSubmit={handleOTPSubmit}>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', margin: '24px 0' }}>
                  {otp.map((digit, idx) => (
                    <input
                      key={idx}
                      id={`otp-${idx}`}
                      type="text"
                      maxLength="1"
                      value={digit}
                      onChange={(e) => handleOTPChange(e.target.value, idx)}
                      onKeyDown={(e) => handleOTPKeyDown(e, idx)}
                      style={{
                        width: '42px',
                        height: '48px',
                        borderRadius: '10px',
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        color: 'var(--tx1)',
                        textAlign: 'center',
                        fontSize: '18px',
                        fontWeight: 700,
                        outline: 'none',
                        fontFamily: 'monospace',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                        transition: 'border-color 0.2s'
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--red)'}
                      onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                    />
                  ))}
                </div>

                <button type="submit" className="btn-auth">
                  <i className="fa-solid fa-shield-check me-2"></i>Verify & Authenticate
                </button>

                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px', fontSize: '13px' }}>
                  <span onClick={() => { setShow2FA(false); setOtpError(""); setOtp(["", "", "", "", "", ""]); }} style={{ color: 'var(--tx3)', cursor: 'pointer' }}>
                    <i className="fa-solid fa-chevron-left me-1"></i>Back to Sign In
                  </span>
                </div>
              </form>
            </>
          )}

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
