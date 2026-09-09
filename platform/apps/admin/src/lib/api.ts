export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://lucid-contentment-production-17bc.up.railway.app';

interface CacheEntry { data: any; ts: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30_000; // 30s

function cacheKey(path: string): string {
  return path.split('?')[0];
}

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

/**
 * GET com cache stale-while-revalidate.
 * Retorna cache imediato se disponível e atualiza em background.
 * useRevalidate = false → apenas usa cache se fresco.
 */
export async function apiCached(path: string, token: string, opts: { ttl?: number; useRevalidate?: boolean } = {}): Promise<any> {
  const key = cacheKey(path);
  const now = Date.now();
  const ttl = opts.ttl ?? CACHE_TTL;
  const entry = cache.get(key);

  const doFetch = async (): Promise<any> => {
    const data = await api(path, {}, token);
    cache.set(key, { data, ts: now });
    return data;
  };

  if (entry) {
    const fresh = now - entry.ts < ttl;
    if (fresh) return entry.data;
    if (opts.useRevalidate !== false) {
      // retorna stale e atualiza em background (sem await)
      doFetch().catch(() => { /* mantém stale */ });
      return entry.data;
    }
    return doFetch();
  }

  return doFetch();
}

/** Invalida um prefixo de cache (ex.: chamar após mutação). */
export function invalidateCache(pathPrefix: string) {
  cache.forEach((_, k) => {
    if (k.startsWith(pathPrefix)) cache.delete(k)
  })
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