import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logo from '../assets/LOGO.png';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="not-found-body">
      <div className="orb orb-1"></div> 
      <div className="orb orb-2"></div>
      <div className="orb orb-3"></div>

      <div className="err-card">
        <div className="err-icon">
          <i className="fa-solid fa-map-location-dot"></i>
        </div>
        <div className="err-code">404</div>
        <div className="err-title">Page not found</div>
        <div className="err-sub">
          The page you're looking for doesn't exist or has been moved. Check the URL or navigate back to the dashboard.
        </div>

        <div className="err-actions">
          <Link to="/" className="btn-home">
            <i className="fa-solid fa-gauge-high me-2"></i>Go to Dashboard
          </Link>
          <button className="btn-back" onClick={() => navigate(-1)}>
            <i className="fa-solid fa-arrow-left me-2"></i>Go Back
          </button>
        </div>

        <div className="err-links">
          <Link className="err-link" to="/">
            <i className="fa-solid fa-gauge-high"></i>Dashboard
          </Link>
          <Link className="err-link" to="/analytics">
            <i className="fa-solid fa-chart-pie"></i>Analytics
          </Link>
          <Link className="err-link" to="/settings">
            <i className="fa-solid fa-gear"></i>Settings
          </Link>
          <Link className="err-link" to="/login">
            <i className="fa-solid fa-right-to-bracket"></i>Login
          </Link>
        </div>

        <div className="brand">
          <img src={logo} alt="SmokeDet Logo" />
          <div className="brand-name">SmokeDet System &copy; 2026</div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
