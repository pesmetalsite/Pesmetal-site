/**
 * Settings Router refatorado — usa upsert em company_settings/integration_settings.
 * Whitelist rigorosa de tabelas para prevenir SQL injection.
 */
import { json, readBody } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { q, qe } from '../lib/db.js';
import { ApiError, asyncHandler } from '../lib/errors.js';

const ALLOWED_TABLES = ['company_settings', 'integration_settings'] as const;
type AllowedTable = typeof ALLOWED_TABLES[number];

function assertAllowedTable(table: string): asserts table is AllowedTable {
  if (!ALLOWED_TABLES.includes(table as AllowedTable)) {
    throw ApiError.validation('Tabela não permitida');
  }
}

async function getAll(table: AllowedTable) {
  const rows = (await q(`SELECT key, value FROM ${table}`)) as any[];
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

async function upsertAll(table: AllowedTable, body: Record<string, unknown>) {
  // Whitelist de keys permitidas
  const allowedKeys = new Set([
    'company_name', 'company_phone', 'company_whatsapp', 'company_email',
    'company_city', 'company_state', 'company_address', 'company_business_hours',
    'company_experience_years', 'company_about',
    'evolution_api_url', 'evolution_instance',
  ]);
  for (const [k, v] of Object.entries(body)) {
    if (!allowedKeys.has(k)) continue;
    await qe(`INSERT INTO ${table} (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = now()`,
      [k, v == null ? null : String(v).slice(0, 1000)]);
  }
}

export const settingsRouter = asyncHandler(async (req, res, url) => {
  const user = await authenticate(req);
  if (!user) throw ApiError.unauthorized();
  const path = url.pathname;
  const method = req.method;

  if (path === '/settings/company' && method === 'GET') {
    return json(res, 200, { settings: await getAll('company_settings') });
  }
  if (path === '/settings/company' && method === 'PUT') {
    if (user.role === 'atendente') throw ApiError.forbidden();
    const body = await readBody(req);
    await upsertAll('company_settings', body);
    return json(res, 200, { ok: true });
  }

  if (path === '/settings/integrations' && method === 'GET') {
    const out = await getAll('integration_settings');
    out.evolution_api_key_set = !!process.env.EVOLUTION_API_KEY;
    return json(res, 200, { settings: out });
  }
  if (path === '/settings/integrations' && method === 'PUT') {
    if (user.role === 'atendente') throw ApiError.forbidden();
    const body = await readBody(req);
    await upsertAll('integration_settings', body);
    return json(res, 200, { ok: true });
  }

  throw ApiError.notFound('Endpoint settings');
});
