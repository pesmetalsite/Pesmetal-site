/**
 * Migration endpoints — TODOS exigem role admin (CRITICAL security).
 * POST /migrate/contacts             — adiciona colunas no_automation, is_favorite
 * POST /migrate/leads-campaign       — adiciona colunas de tracking
 *
 * NOTA: /migrate/sql foi REMOVIDO. Era endpoint temporário para dev e representa
 * um risco CRÍTICO de SQL injection arbitrário + exfiltração de dados. Se precisar
 * executar SQL administrativo, use o shell `railway run` ou psql diretamente.
 */
import { json } from '../lib/http.js';
import { pool } from '../lib/db.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { authenticate, requireRole } from '../lib/auth.js';

export const migrateRouter = asyncHandler(async (req, res, url) => {
  const user = await authenticate(req);
  if (!user || !requireRole('admin', user.role)) {
    throw ApiError.unauthorized();
  }

  const path = url.pathname;

  if (path === '/migrate/contacts' && req.method === 'POST') {
    try {
      await pool.query(`
        ALTER TABLE contacts
        ADD COLUMN IF NOT EXISTS no_automation BOOLEAN DEFAULT FALSE;
      `);
      await pool.query(`
        ALTER TABLE contacts
        ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;
      `);
      return json(res, 200, { ok: true, message: 'Migration completed' });
    } catch (e: any) {
      if (e.code === '42701') {
        return json(res, 200, { ok: true, message: 'Columns already exist' });
      }
      return json(res, 500, { error: e.message });
    }
  }

  if (path === '/migrate/leads-campaign' && req.method === 'POST') {
    try {
      const columns = [
        'campaign VARCHAR(255)',
        'adset VARCHAR(255)',
        'ad_name VARCHAR(255)',
        'utm_source VARCHAR(255)',
        'utm_medium VARCHAR(255)',
        'utm_campaign VARCHAR(255)',
        'utm_content VARCHAR(255)',
        'utm_term VARCHAR(255)',
        'fbclid VARCHAR(255)',
        'gclid VARCHAR(255)',
        'landing_page TEXT',
        'referrer TEXT',
        'tracking_session_id VARCHAR(255)',
      ];
      // Whitelist explícita de nomes de coluna — nunca usar input do usuário
      for (const col of columns) {
        await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ${col};`);
      }
      return json(res, 200, { ok: true, message: 'Leads campaign columns ensured' });
    } catch (e: any) {
      if (e.code === '42701') {
        return json(res, 200, { ok: true, message: 'Columns already exist' });
      }
      return json(res, 500, { error: e.message });
    }
  }

  // POST /migrate/automation-steps — adiciona colunas steps/step_options em automations + client_id em whatsapp_messages
  if (path === '/migrate/automation-steps' && req.method === 'POST') {
    try {
      await pool.query(`ALTER TABLE automations ADD COLUMN IF NOT EXISTS steps text`);
      await pool.query(`ALTER TABLE automations ADD COLUMN IF NOT EXISTS step_options text`);
      await pool.query(`ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS client_id text`);
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_client_id ON whatsapp_messages(client_id) WHERE client_id IS NOT NULL`);
      return json(res, 200, { ok: true, message: 'Automation steps + client_id columns ensured' });
    } catch (e: any) {
      if (e.code === '42701') {
        return json(res, 200, { ok: true, message: 'Columns already exist' });
      }
      return json(res, 500, { error: e.message });
    }
  }

  throw ApiError.notFound('Migration endpoint');
});
