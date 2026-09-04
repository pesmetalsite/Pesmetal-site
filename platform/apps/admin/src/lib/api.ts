export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function api(path: string, opts: RequestInit = {}, token?: string) {
  const headers: any = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  if (res.status === 401) {
    // Token expirado/inválido — limpa sessão e força novo login
    if (typeof window !== 'undefined' && !path.startsWith('/auth/')) {
      clearToken();
      window.location.href = '/login?expired=1';
    }
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('pesmetal_token');
}

export function setToken(token: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('pesmetal_token', token);
}

export function clearToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('pesmetal_token');
  localStorage.removeItem('pesmetal_user');
}

export function getUser(): any | null {
  if (typeof window === 'undefined') return null;
  const u = localStorage.getItem('pesmetal_user');
  return u ? JSON.parse(u) : null;
}

export function setUser(u: any) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('pesmetal_user', JSON.stringify(u));
}