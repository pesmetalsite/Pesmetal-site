export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://lucid-contentment-production-17bc.up.railway.app';

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
    let code: string | undefined;
    try {
      const body = await res.json();
      msg = body.error || msg;
      code = body.code;
    } catch {}
    const err: any = new Error(msg);
    err.status = res.status;
    err.code = code;
    throw err;
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