import { Navigate, Route, Routes } from 'react-router-dom'
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
