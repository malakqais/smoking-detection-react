/** Keys kept when user clears local app data (session stays active). */
export const AUTH_STORAGE_KEYS = [
  'isLoggedIn',
  'user',
  'sessionToken',
  'loginTime',
  'activeSessionId',
];

export function snapshotAuthStorage() {
  const keep = {};
  for (const key of AUTH_STORAGE_KEYS) {
    const value = localStorage.getItem(key);
    if (value != null && value !== '') {
      keep[key] = value;
    }
  }
  return keep;
}

export function restoreAuthStorage(snapshot) {
  Object.entries(snapshot).forEach(([key, value]) => {
    localStorage.setItem(key, value);
  });
}

export function clearNonAuthLocalStorage() {
  const keep = snapshotAuthStorage();
  localStorage.clear();
  restoreAuthStorage(keep);
}
