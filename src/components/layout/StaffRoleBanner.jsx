import { isAdmin, isManager, isStaff, isSupervisor } from '../../utils/roles.js';

export default function StaffRoleBanner({ user }) {
  if (!isStaff(user)) return null;

  if (isSupervisor(user)) {
    return (
      <div className="staff-role-banner staff-role-banner--supervisor mb-4">
        <div className="staff-role-banner__icon"><i className="fa-solid fa-crown"></i></div>
        <div>
          <div className="staff-role-banner__title">Supervisor</div>
          <div className="staff-role-banner__sub">
            Full oversight including the Supervisor Console (managers, admins, role changes).
          </div>
        </div>
        <span className="tag r">Supervisor</span>
      </div>
    );
  }

  if (isAdmin(user)) {
    return (
      <div className="staff-role-banner staff-role-banner--admin mb-4">
        <div className="staff-role-banner__icon"><i className="fa-solid fa-user-gear"></i></div>
        <div>
          <div className="staff-role-banner__title">Admin operations</div>
          <div className="staff-role-banner__sub">
            Same operational access as supervisors on the dashboard, analytics, and Admin Panel — suspend users,
            clear violations, and configure detection. The Supervisor Console is not available to admins.
          </div>
        </div>
        <span className="tag admin-tag">Admin</span>
      </div>
    );
  }

  if (isManager(user)) {
    return (
      <div className="staff-role-banner staff-role-banner--manager mb-4">
        <div className="staff-role-banner__icon"><i className="fa-solid fa-user-shield"></i></div>
        <div>
          <div className="staff-role-banner__title">Manager operations</div>
          <div className="staff-role-banner__sub">
            Monitor live detection, review all violations, suspend users, and configure detection from Settings.
            Open <strong>Staff Panel</strong> for user management.
          </div>
        </div>
        <span className="tag p">Manager</span>
      </div>
    );
  }

  return null;
}
