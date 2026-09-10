/**
 * Rate Limiter simples em memória — suficiente para single-instance.
 * Para multi-instance, mover para Redis.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export interface RateLimitOpts {
  windowMs: number;   // janela em ms
  max: number;        // máximo de requests na janela
  keyFn?: (req: any) => string;  // função para extrair chave (ex.: IP)
}

/**
 * Verifica se o request excedeu o rate limit.
 * Retorna { allowed: true } ou { allowed: false, retryAfter: number }.
 */
export function checkRateLimit(req: any, opts: RateLimitOpts): { allowed: boolean; retryAfter?: number } {
  const key = opts.keyFn ? opts.keyFn(req) : getClientIp(req);
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + opts.windowMs };
    buckets.set(key, bucket);
  }

  bucket.count++;
  if (bucket.count > opts.max) {
    return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true };
}

/** Limpa buckets expirados periodicamente para evitar memory leak. */
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets.entries()) {
    if (b.resetAt < now) buckets.delete(k);
  }
}, 60_000).unref();

function getClientIp(req: any): string {
  const xff = req?.headers?.['x-forwarded-for'];
  if (typeof xff === 'string') return xff.split(',')[0].trim();
  return req?.socket?.remoteAddress || 'unknown';
}
