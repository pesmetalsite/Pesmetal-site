/**
 * Migration endpoint — adiciona colunas no_automation e is_favorite
 * POST /migrate/contacts
 * POST /migrate/sql — executa SQL raw
 */
import { json, readBody } from '../lib/http.js';
import { pool } from '../lib/db.js';
import { ApiError, asyncHandler } from '../lib/errors.js';

export const migrateRouter = asyncHandler(async (req, res, url) => {
  const path = url.pathname;

  if (path === '/migrate/contacts' && req.method === 'POST') {
    try {
      // Adicionar no_automation
      await pool.query(`
        ALTER TABLE contacts
        ADD COLUMN IF NOT EXISTS no_automation BOOLEAN DEFAULT FALSE;
      `);

      // Adicionar is_favorite
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

  // POST /migrate/sql — executa SQL arbitrário (temporário)
  if (path === '/migrate/sql' && req.method === 'POST') {
    const body = await readBody(req);
    const sql = body?.sql;
    if (!sql || typeof sql !== 'string') {
      return json(res, 400, { error: 'sql required' });
    }

    try {
      const result = await pool.query(sql);
      return json(res, 200, { ok: true, rows: result.rowCount, data: result.rows });
    } catch (e: any) {
      return json(res, 500, { error: e.message, code: e.code });
    }
  }

  throw ApiError.notFound('Migration endpoint');
});
