import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import logo from '../assets/LOGO.png';

const Admin = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "true");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [user] = useState(() => JSON.parse(localStorage.getItem('user') || '{"name":"User","role":"admin","email":"user@example.com"}'));
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleRole = async (userId) => {
    try {
      const response = await fetch('/api/users/toggle_role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId })
      });
      if (response.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error("Error toggling role:", error);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;
    try {
      const response = await fetch('/api/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId })
      });
      if (response.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error("Error deleting user:", error);
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <div className="layout">
      <div className={`sb-overlay ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)}></div>

      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${sidebarOpen ? 'open' : ''}`}>
        <div className="sb-logo">
          <img src={logo} alt="Logo" />
          <div>
            <div className="sb-logo-name">SmokeDet System</div>
            <div className="sb-logo-sub">{user.name} ({user.role})</div>
          </div>
          <button className="sb-collapse-btn" onClick={() => { setSidebarCollapsed(!sidebarCollapsed); localStorage.setItem("sidebarCollapsed", !sidebarCollapsed); }}>
            <i className={`fa-solid ${sidebarCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`}></i>
          </button>
        </div>
        <nav className="sb-nav">
          <div className="sb-section">Main</div>
          <NavLink className="sb-item" to="/"><i className="fa-solid fa-gauge-high"></i><span className="sb-label">Dashboard</span></NavLink>
          <NavLink className="sb-item" to="/analytics"><i className="fa-solid fa-chart-pie"></i><span className="sb-label">Analytics</span></NavLink>
          <NavLink className="sb-item" to="/admin"><i className="fa-solid fa-user-shield"></i><span className="sb-label">Admin Panel</span></NavLink>
          <div className="sb-section">Account</div>
          <NavLink className="sb-item" to="/profile"><i className="fa-solid fa-circle-user"></i><span className="sb-label">Profile</span></NavLink>
          <NavLink className="sb-item" to="/settings"><i className="fa-solid fa-sliders"></i><span className="sb-label">Settings</span></NavLink>
          <div className="sb-section">System</div>
          <NavLink className="sb-item" to="/logout"><i className="fa-solid fa-right-from-bracket"></i><span className="sb-label">Logout</span></NavLink>
        </nav>
      </aside>

      <main className="main">
        <header className="top-bar">
          <div className="tb-left">
            <div className="ib d-lg-none" onClick={() => setSidebarOpen(true)}><i className="fa-solid fa-bars"></i></div>
            <div><div className="pg-title">Admin Panel</div><div className="pg-sub">Manage system users and permissions</div></div>
          </div>
          <div className="tb-right">
            <div className="ib" onClick={toggleTheme}>
              {theme === 'dark' ? <i className="fa-solid fa-moon"></i> : <i className="fa-solid fa-sun" style={{ color: 'var(--amber)' }}></i>}
            </div>
          </div>
        </header>

        <div className="content fade-in">
          <div className="c">
            <div className="c-head">
              <div className="c-title">User Management</div>
              <div className="pg-sub">{users.length} registered users</div>
            </div>
            <div className="c-body">
              {loading ? (
                <div className="text-center py-5">
                  <i className="fa-solid fa-spinner fa-spin fa-2x mb-2" style={{ color: 'var(--red)' }}></i>
                  <p>Loading users...</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="tbl">
                    <thead>
                      <tr><th>#</th><th>User</th><th>Role</th><th>Status</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {users.length === 0 ? (
                        <tr><td colSpan="5" className="text-center py-4">No users found.</td></tr>
                      ) : (
                        users.map((u, i) => (
                          <tr key={u.id}>
                            <td style={{ color: 'var(--tx3)' }}>{i + 1}</td>
                            <td>
                              <div style={{ fontWeight: '600', color: 'var(--tx1)' }}>{u.name}</div>
                              <div style={{ fontSize: '11px', color: 'var(--tx3)' }}>{u.email}</div>
                            </td>
                            <td><span className={`tag ${u.role === 'admin' ? 'r' : 'b'}`}>{u.role}</span></td>
                            <td><span className={`tag ${u.status === 'active' ? 'g' : 'y'}`}>{u.status}</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button 
                                  className="ib btn-sm" 
                                  title={u.role === 'admin' ? "Demote to User" : "Promote to Admin"}
                                  onClick={() => handleToggleRole(u.id)}
                                >
                                  <i className={`fa-solid ${u.role === 'admin' ? 'fa-user-minus' : 'fa-user-shield'}`}></i>
                                </button>
                                <button 
                                  className="ib btn-sm text-danger" 
                                  title="Delete User"
                                  onClick={() => handleDeleteUser(u.id)}
                                >
                                  <i className="fa-solid fa-trash"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Admin;
