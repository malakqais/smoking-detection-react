export function getSessionToken() {
  return localStorage.getItem('sessionToken');
}

export function setSessionToken(token) {
  if (token) localStorage.setItem('sessionToken', token);
  else localStorage.removeItem('sessionToken');
}

export async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  const token = getSessionToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('user');
    const onAuthPage = ['/login', '/signup'].some((p) => window.location.pathname.startsWith(p));
    if (!onAuthPage) {
      window.location.assign('/login');
    }
  }
  return res;
}
