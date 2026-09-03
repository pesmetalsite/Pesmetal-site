/**
 * Settings Router refatorado — usa upsert em company_settings/integration_settings.
 */
import { json, readBody } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { ApiError, asyncHandler } from '../lib/errors.js';

function getAll(table: string) {
  const rows = db.prepare(`SELECT key, value FROM ${table}`).all() as any[];
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function upsertAll(table: string, body: Record<string, unknown>) {
  const stmt = db.prepare(`INSERT INTO ${table} (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`);
  for (const [k, v] of Object.entries(body)) {
    if (v == null) stmt.run(k, null);
    else stmt.run(k, String(v));
  }
}

export const settingsRouter = asyncHandler(async (req, res, url) => {
  const user = await authenticate(req);
  if (!user) throw ApiError.unauthorized();
  const path = url.pathname;
  const method = req.method;

  if (path === '/settings/company' && method === 'GET') {
    return json(res, 200, { settings: getAll('company_settings') });
  }
  if (path === '/settings/company' && method === 'PUT') {
    if (user.role === 'atendente') throw ApiError.forbidden();
    const body = await readBody(req);
    upsertAll('company_settings', body);
    return json(res, 200, { ok: true });
  }

  if (path === '/settings/integrations' && method === 'GET') {
    const out = getAll('integration_settings');
    out.evolution_api_key_set = !!process.env.EVOLUTION_API_KEY;
    return json(res, 200, { settings: out });
  }
  if (path === '/settings/integrations' && method === 'PUT') {
    if (user.role === 'atendente') throw ApiError.forbidden();
    const body = await readBody(req);
    upsertAll('integration_settings', body);
    return json(res, 200, { ok: true });
  }

  throw ApiError.notFound('Endpoint settings');
});
