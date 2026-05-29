import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Analytics from './pages/Analytics.jsx'
import SignUp from './pages/SignUp.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Settings from './pages/Settings.jsx'
import Profile from './pages/Profile.jsx'
import Admin from './pages/Admin.jsx'
import Logout from './pages/Logout.jsx'
import NotFound from './pages/NotFound.jsx'

function ProtectedRoute({ children, adminOnly = false }) {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true'
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  
  if (!isLoggedIn) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />
  
  return children
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const excluded = ['/login', '/signup', '/logout']
    if (excluded.includes(location.pathname)) return undefined

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
      <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
      <Route path="/logout" element={<ProtectedRoute><Logout /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
