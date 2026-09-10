/**
 * HTTP helpers — CORS restritivo + headers de segurança.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

const ALLOWED_ORIGINS = new Set([
  'https://pesmetal.com.br',
  'https://www.pesmetal.com.br',
  'https://pesmetal-server.up.railway.app',
  'http://localhost:3000',
  'http://localhost:4000',
]);

export function corsHeaders(origin?: string) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://pesmetal.com.br';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

/** Headers de segurança obrigatórios em todas as respostas. */
export function securityHeaders() {
  return {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  };
}

export function json(res: ServerResponse, status: number, body: any) {
  if (!res.getHeader('Content-Type')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }
  res.writeHead(status);
  res.end(JSON.stringify(body));
}

export async function readBody(req: IncomingMessage): Promise<any> {
  // Limite de 1MB para prevenir DoS por payload grande
  const MAX_BODY_SIZE = 1024 * 1024;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    req.on('data', c => {
      totalSize += c.length;
      if (totalSize > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(Buffer.from(c));
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

export function getQuery(url: URL) {
  const obj: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { obj[k] = v; });
  return obj;
}