export const ROLE_LABELS = {
  user: 'User',
  manager: 'Manager',
  admin: 'Admin',
  supervisor: 'Supervisor',
};

export function normalizeRole(role) {
  return role || 'user';
}

export function isSupervisor(user) {
  return normalizeRole(user?.role) === 'supervisor';
}

export function isAdmin(user) {
  return normalizeRole(user?.role) === 'admin';
}

export function isManager(user) {
  return normalizeRole(user?.role) === 'manager';
}

export function isStaff(user) {
  const r = normalizeRole(user?.role);
  return r === 'manager' || r === 'admin' || r === 'supervisor';
}

export function isElevatedStaff(user) {
  const r = normalizeRole(user?.role);
  return r === 'admin' || r === 'supervisor';
}

export function staffPanelLabel(user) {
  if (isSupervisor(user)) return 'Staff Panel';
  if (isAdmin(user)) return 'Admin Panel';
  if (isManager(user)) return 'Manager Panel';
  return 'Staff Panel';
}

export function canManageUsers(user) {
  return isAdmin(user) || isSupervisor(user);
}

export function canSuspendUsers(user) {
  return isAdmin(user) || isSupervisor(user);
}

export function canExportReports(user) {
  return isAdmin(user) || isSupervisor(user);
}

export function canViewAudit(user) {
  return isAdmin(user) || isSupervisor(user);
}

export function canReviewDisputesAsManager(user) {
  const r = normalizeRole(user?.role);
  return r === 'manager' || r === 'supervisor';
}

export function canVoteDisputes(user) {
  return isAdmin(user);
}

export function canDecideDisputes(user) {
  return isSupervisor(user);
}

export function canRemoveViolations(user) {
  const r = normalizeRole(user?.role);
  return r === 'manager' || r === 'supervisor';
}

export function canManageManagers(user) {
  return isSupervisor(user);
}

export function canUseSupervisorConsole(user) {
  return isSupervisor(user);
}

export function hasPermission(user, key) {
  return user?.permissions?.[key] === true;
}
