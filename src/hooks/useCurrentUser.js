import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../utils/api.js';
import { normalizeRole } from '../utils/roles.js';

function readStoredUser() {
  try {
    const raw = JSON.parse(localStorage.getItem('user') || '{}');
    return { ...raw, role: normalizeRole(raw.role) };
  } catch {
    return { role: 'user' };
  }
}

export function useCurrentUser() {
  const [user, setUser] = useState(readStoredUser);
  const [syncing, setSyncing] = useState(true);

  const applyUser = useCallback((next) => {
    if (!next) return;
    const normalized = { ...next, role: normalizeRole(next.role) };
    setUser(normalized);
    localStorage.setItem('user', JSON.stringify(normalized));
  }, []);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('sessionToken');
    if (!token) return readStoredUser();
    try {
      const res = await apiFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          applyUser(data.user);
          return data.user;
        }
      }
    } catch {
      /* keep cached user */
    }
    return readStoredUser();
  }, [applyUser]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshUser();
      if (!cancelled) setSyncing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  return { user, syncing, refreshUser, setUser: applyUser };
}
