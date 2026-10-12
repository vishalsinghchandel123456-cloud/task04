// src/api.js — tiny fetch helper for the REST API.
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// The session is stored per-tab so two tabs can log in as two different roles
// (handy for demonstrating real-time messaging between user and agent).
export function setSession(token, user) {
  sessionStorage.setItem('token', token);
  sessionStorage.setItem('user', JSON.stringify(user));
}
export function clearSession() {
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
}
export function getToken() {
  return sessionStorage.getItem('token');
}
export function getUser() {
  const raw = sessionStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

// Every request automatically carries the JWT
export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export { BASE };
