import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Analytics from './pages/Analytics.jsx'
import SignUp from './pages/SignUp.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Settings from './pages/Settings.jsx'
import Profile from './pages/Profile.jsx'
import Admin from './pages/Admin.jsx'
import Supervisor from './pages/Supervisor.jsx'
import Logout from './pages/Logout.jsx'
import NotFound from './pages/NotFound.jsx'
import { isStaff, isSupervisor, normalizeRole } from './utils/roles.js'
import { apiFetch } from './utils/api.js'

function ProtectedRoute({ children, staffOnly = false, supervisorOnly = false, roles = null }) {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true'
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const role = normalizeRole(user.role)
  
  if (!isLoggedIn) return <Navigate to="/login" replace />
  if (user.account_status === 'suspended') return <Navigate to="/login" replace />
  if (supervisorOnly && !isSupervisor(user)) return <Navigate to="/" replace />
  if (staffOnly && !isStaff(user)) return <Navigate to="/" replace />
  if (roles && !roles.includes(role)) return <Navigate to="/" replace />
  
  return children
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const excluded = ['/login', '/signup', '/logout']
    if (excluded.includes(location.pathname)) return undefined

    const token = localStorage.getItem('sessionToken')
    if (token) {
      apiFetch('/api/auth/me')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.user) {
            const normalized = { ...data.user, role: normalizeRole(data.user.role) }
            localStorage.setItem('user', JSON.stringify(normalized))
          }
        })
        .catch(() => {})
    }

    let timeoutId

    const resetTimer = () => {
      const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true'
      const autoLogout = localStorage.getItem('autoLogout') !== 'false'
      if (!isLoggedIn || !autoLogout) return

      const timeoutMinutes = Number(localStorage.getItem('logoutTimeout') || 30)
      const timeoutMs = Math.max(1, timeoutMinutes) * 60 * 1000
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        const history = JSON.parse(localStorage.getItem('sessionHistory') || '[]')
        const activeSessionId = localStorage.getItem('activeSessionId')
        if (activeSessionId) {
          const endedAt = Date.now()
          const updated = history.map((s) => (s.id === activeSessionId ? { ...s, endedAt } : s))
          localStorage.setItem('sessionHistory', JSON.stringify(updated))
        }
        localStorage.removeItem('isLoggedIn')
        localStorage.removeItem('user')
        localStorage.removeItem('activeSessionId')
        navigate('/login', { replace: true })
      }, timeoutMs)
    }

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
    activityEvents.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }))
    resetTimer()

    return () => {
      clearTimeout(timeoutId)
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, resetTimer))
    }
  }, [location.pathname, navigate])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute staffOnly><Admin /></ProtectedRoute>} />
      <Route path="/supervisor" element={<ProtectedRoute supervisorOnly><Supervisor /></ProtectedRoute>} />
      <Route path="/logout" element={<ProtectedRoute><Logout /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
