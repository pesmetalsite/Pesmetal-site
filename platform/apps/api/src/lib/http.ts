/**
 * HTTP helpers
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'Access-Control-Max-Age': '86400',
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
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(Buffer.from(c)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { resolve({ raw }); }
    });
    req.on('error', reject);
  });
}

export function getQuery(url: URL) {
  const obj: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { obj[k] = v; });
  return obj;
}