import React from 'react';

const NotificationDrawer = ({ notifOpen, violations, onClose, onClear }) => {
  return (
    <aside className={`notif-drawer ${notifOpen ? 'open' : ''}`}>
      <div className="notif-head">
        <div className="notif-head-title">
          <i className="fa-solid fa-bell" style={{ color: 'var(--red)' }}></i> Notifications
          <span className="notif-head-count">{violations.length}</span>
        </div>
        <div className="notif-head-actions">
          <button className="btn-ghost btn-sm" onClick={onClose}>Close</button>
          <div className="ib" onClick={onClose}><i className="fa-solid fa-xmark"></i></div>
        </div>
      </div>
      <div className="notif-body">
        {violations.length === 0 ? (
          <div className="notif-empty"><i className="fa-solid fa-bell-slash"></i><p>No notifications yet</p></div>
        ) : (
          violations.slice(0, 30).map(v => (
            <div key={v.id} className="notif-item unread fade-in">
              <div className="notif-icon"><i className="fa-solid fa-triangle-exclamation"></i></div>
              <div className="notif-content">
                <div className="notif-title">Smoking detected at {v.location}</div>
                <div className="notif-meta"><i className="fa-regular fa-clock me-1"></i>{v.time}</div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="notif-foot">
        <button className="btn-ghost btn-sm w-100" onClick={onClear}>Clear All</button>
      </div>
    </aside>
  );
};

export default NotificationDrawer;
