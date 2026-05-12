import { Link, NavLink } from 'react-router-dom'
import { FaBell, FaUser } from 'react-icons/fa'
import logo from '../assets/LOGO.png'

export default function Navbar({ onAlerts }) {
  return (
    <nav className="navbar navbar-expand-lg navbar-dark app-navbar">
      <div className="container-fluid">
        <img src={logo} className="logo" alt="Logo" />
        <Link className="navbar-brand brand-text ms-3" to="/">Intelligent Smoking Detection</Link>
        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navMenu">
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse justify-content-end" id="navMenu">
          <button className="btn btn-outline-light me-2 btn-large" style={{ color: 'red' }} onClick={onAlerts}>
            <FaBell /> Alerts
          </button>
          <div className="dropdown">
            <button className="btn btn-outline-light dropdown-toggle btn-large" data-bs-toggle="dropdown">
              <FaUser /> Admin
            </button>
            <ul className="dropdown-menu dropdown-menu-dark">
              <li><NavLink className="dropdown-item" to="/">Dashboard</NavLink></li>
              <li><NavLink className="dropdown-item" to="/profile">Profile</NavLink></li>
              <li><NavLink className="dropdown-item" to="/settings">Settings</NavLink></li>
              <li><NavLink className="dropdown-item" to="/logout">Logout</NavLink></li>
            </ul>
          </div>
        </div>
      </div>
    </nav>
  )
}
