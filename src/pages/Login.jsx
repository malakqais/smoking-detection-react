import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logo from '../assets/LOGO.png';
import { setSessionToken } from '../utils/api.js';
import { normalizeRole } from '../utils/roles.js';
import { isValidTotpCode, normalizeTotpInput } from '../utils/totp.js';
import { getClientMeta } from '../utils/clientMeta.js';

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  // authView: login | 2fa | forgot | reset
  const [authView, setAuthView] = useState('login');
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [pendingUser, setPendingUser] = useState(null);
  const [pendingPassword, setPendingPassword] = useState('');
  const [otpError, setOtpError] = useState('');
  const [useEmail2FA, setUseEmail2FA] = useState(false);
  const [email2FACode, setEmail2FACode] = useState('');
  const [email2FASent, setEmail2FASent] = useState(false);
  const [infoMsg, setInfoMsg] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const establishSession = (userData) => {
    const now = Date.now();
    const sessionId = `${now}-${Math.random().toString(36).slice(2, 10)}`;

    if (userData.session_token) setSessionToken(userData.session_token);
    const normalized = { ...userData, role: normalizeRole(userData.role) };
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('loginTime', now.toString());
    localStorage.setItem('activeSessionId', sessionId);
    localStorage.setItem('user', JSON.stringify(normalized));

    const history = JSON.parse(localStorage.getItem('sessionHistory') || '[]');
    history.unshift({
      id: sessionId,
      startedAt: now,
      userEmail: userData?.email || email,
      device: 'This device',
    });
    localStorage.setItem('sessionHistory', JSON.stringify(history.slice(0, 20)));

  };

  const markLoginNotificationSent = (result) => {
    if (result?.login_notification_sent) {
      localStorage.setItem('lastLoginNotificationAt', Date.now().toString());
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
        body: JSON.stringify({
          email: (pendingUser?.email || email).trim().toLowerCase(),
          code: entered,
          client: getClientMeta(),
        }),
      });

      if (res.ok) {
        const result = await res.json();
        establishSession(result.user);
        markLoginNotificationSent(result);
        await refreshSessionUser(result.user?.session_token);
        navigate('/');
      } else {
        const result = await res.json().catch(() => ({ message: "Invalid verification code." }));
        setOtpError(result.message || "Invalid verification code. Please check Authenticator.");
      }
    } catch {
      setOtpError("Connection error. Make sure the server is online.");
    } finally {
      setLoading(false);
    }
  };

  const sendLoginEmailCode = async () => {
    setLoading(true);
    setOtpError('');
    try {
      const res = await fetch('/api/auth/2fa/send-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: (pendingUser?.email || email).trim().toLowerCase(),
          purpose: 'login_2fa',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEmail2FASent(true);
        setInfoMsg(data.message || 'Check your email for a 6-digit code.');
      } else {
        setOtpError(data.message || 'Could not send code');
      }
    } catch {
      setOtpError('Connection error.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmail2FASubmit = async (e) => {
    e.preventDefault();
    if (!isValidTotpCode(email2FACode)) {
      setOtpError('Enter the 6-digit code from your email');
      return;
    }
    setLoading(true);
    setOtpError('');
    try {
      const res = await fetch('/api/auth/login/email-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: (pendingUser?.email || email).trim().toLowerCase(),
          password: pendingPassword,
          code: email2FACode,
          client: getClientMeta(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        establishSession(data.user);
        markLoginNotificationSent(data);
        await refreshSessionUser(data.user?.session_token);
        navigate('/');
      } else {
        setOtpError(data.message || 'Invalid code or password');
      }
    } catch {
      setOtpError('Connection error.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfoMsg('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setInfoMsg(data.message);
        setAuthView('reset');
      } else {
        setError(data.message || 'Request failed');
      }
    } catch {
      setError('Connection error.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!isValidTotpCode(resetCode)) {
      setError('Enter the 6-digit code from your email');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: resetCode, new_password: newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setInfoMsg(data.message || 'Password updated.');
        setPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setResetCode('');
        setAuthView('login');
      } else {
        setError(data.message || 'Reset failed');
      }
    } catch {
      setError('Connection error.');
    } finally {
      setLoading(false);
    }
  };

  const backToLogin = () => {
    setAuthView('login');
    setError('');
    setOtpError('');
    setInfoMsg('');
    setOtp(['', '', '', '', '', '']);
    setUseEmail2FA(false);
  };

  const refreshSessionUser = async (token) => {
    if (!token) return;
    try {
      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        if (me.user) establishSession(me.user);
      }
    } catch { /* keep login payload */ }
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
        body: JSON.stringify({ email, password, client: getClientMeta() })
      });

      console.log("Response status:", response.status);

      if (response.ok) {
        const result = await response.json().catch(() => ({}));
        if (result.status === "2fa_required") {
          setPendingUser(result.user);
          setPendingPassword(password);
          if (result.email) setEmail(result.email);
          else if (result.user?.email) setEmail(result.user.email);
          setAuthView('2fa');
          setUseEmail2FA(false);
          setEmail2FACode('');
          setEmail2FASent(false);
        } else {
          establishSession(result.user);
          markLoginNotificationSent(result);
          await refreshSessionUser(result.user?.session_token);
          navigate('/');
        }
      } else {
        const result = await response.json().catch(() => ({ message: "Server error (" + response.status + ")" }));
        setError(result.message || "Invalid email or password.");
      }
    } catch (err) {
      console.error("Login Error:", err);
      if (err instanceof TypeError && err.message === "Failed to fetch") {
        setError("Cannot connect to server. Make sure the backend is running.");
      } else {
        setError(err.message || "An unexpected error occurred during login.");
      }
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
          {authView === 'login' && (
            <>
              <div className="form-title">Welcome back</div>
              <div className="form-sub">Sign in to your account</div>

              <div className={`error-msg ${error ? 'show' : ''}`}>
                <i className="fa-solid fa-circle-exclamation"></i>
                <span>{error}</span>
              </div>
              {infoMsg && (
                <div className="auth-info-msg"><i className="fa-solid fa-circle-info me-2"></i>{infoMsg}</div>
              )}

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
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <label className="flabel" style={{ marginBottom: 0 }}>Password</label>
                    <button type="button" className="auth-link-btn" onClick={() => { setAuthView('forgot'); setError(''); setInfoMsg(''); }}>
                      Forgot password?
                    </button>
                  </div>
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
          )}

          {authView === 'forgot' && (
            <>
              <div className="form-title">Reset password</div>
              <div className="form-sub">We will email you a 6-digit code to set a new password.</div>
              <div className={`error-msg ${error ? 'show' : ''}`}><i className="fa-solid fa-circle-exclamation"></i><span>{error}</span></div>
              <form onSubmit={handleForgotSubmit}>
                <div className="fgroup">
                  <label className="flabel">Email address</label>
                  <input type="email" className="finput" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <button type="submit" className="btn-auth" disabled={loading}>
                  {loading ? <><i className="fa-solid fa-spinner fa-spin me-2"></i>Sending…</> : <><i className="fa-solid fa-envelope me-2"></i>Send code</>}
                </button>
              </form>
              <p className="auth-back-link" onClick={backToLogin}><i className="fa-solid fa-chevron-left me-1"></i>Back to sign in</p>
            </>
          )}

          {authView === 'reset' && (
            <>
              <div className="form-title">New password</div>
              <div className="form-sub">Enter the code from your email and choose a new password.</div>
              <div className={`error-msg ${error ? 'show' : ''}`}><i className="fa-solid fa-circle-exclamation"></i><span>{error}</span></div>
              {infoMsg && <div className="auth-info-msg">{infoMsg}</div>}
              <form onSubmit={handleResetSubmit}>
                <div className="fgroup">
                  <label className="flabel">Email</label>
                  <input type="email" className="finput" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="fgroup">
                  <label className="flabel">6-digit code</label>
                  <input
                    className="finput supervisor-totp-input"
                    inputMode="numeric"
                    maxLength={6}
                    value={resetCode}
                    onChange={(e) => setResetCode(normalizeTotpInput(e.target.value))}
                    placeholder="000000"
                    required
                  />
                </div>
                <div className="fgroup">
                  <label className="flabel">New password</label>
                  <input type="password" className="finput" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required />
                </div>
                <div className="fgroup">
                  <label className="flabel">Confirm password</label>
                  <input type="password" className="finput" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} minLength={8} required />
                </div>
                <button type="submit" className="btn-auth" disabled={loading}>Update password</button>
              </form>
              <p className="auth-back-link" onClick={backToLogin}><i className="fa-solid fa-chevron-left me-1"></i>Back to sign in</p>
            </>
          )}

          {authView === '2fa' && (
            <>
              <div className="form-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-shield-halved" style={{ color: 'var(--red)' }}></i>Two-Factor Verification
              </div>
              <div className="form-sub">
                {useEmail2FA
                  ? 'Enter the 6-digit code we sent to your email.'
                  : 'Enter the code from your authenticator app, or use email instead.'}
              </div>

              <div className={`error-msg ${otpError ? 'show' : ''}`}>
                <i className="fa-solid fa-circle-exclamation"></i>
                <span>{otpError}</span>
              </div>
              {infoMsg && useEmail2FA && <div className="auth-info-msg">{infoMsg}</div>}

              {!useEmail2FA ? (
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
                        className="auth-otp-cell"
                      />
                    ))}
                  </div>
                  <button type="submit" className="btn-auth" disabled={loading}>
                    <i className="fa-solid fa-shield-check me-2"></i>Verify with app
                  </button>
                </form>
              ) : (
                <form onSubmit={handleEmail2FASubmit}>
                  <div className="fgroup">
                    <label className="flabel">Email code</label>
                    <input
                      className="finput supervisor-totp-input"
                      inputMode="numeric"
                      maxLength={6}
                      value={email2FACode}
                      onChange={(e) => setEmail2FACode(normalizeTotpInput(e.target.value))}
                      placeholder="000000"
                      required
                    />
                  </div>
                  {!email2FASent && (
                    <button type="button" className="btn-ghost btn-sm w-100 mb-2" onClick={sendLoginEmailCode} disabled={loading}>
                      Send code to {email}
                    </button>
                  )}
                  <button type="submit" className="btn-auth" disabled={loading || !email2FASent}>
                    Verify with email code
                  </button>
                </form>
              )}

              <p className="auth-back-link" style={{ marginTop: 16 }}>
                <button type="button" className="auth-link-btn" onClick={() => { setUseEmail2FA(!useEmail2FA); setOtpError(''); setInfoMsg(''); }}>
                  {useEmail2FA ? 'Use authenticator app instead' : 'Email me a code instead'}
                </button>
              </p>
              <p className="auth-back-link" onClick={backToLogin}>
                <i className="fa-solid fa-chevron-left me-1"></i>Back to sign in
              </p>
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
