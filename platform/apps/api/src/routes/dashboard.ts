/**
 * Dashboard Router — métricas, gráficos, funil.
 */
import { json, getQuery } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { ApiError, asyncHandler } from '../lib/errors.js';

function count(sql: string, ...args: any[]) {
  return (db.prepare(sql).get(...args) as any).c as number;
}

export const dashboardRouter = asyncHandler(async (req, res, url) => {
  const user = await authenticate(req);
  if (!user) throw ApiError.unauthorized();
  const path = url.pathname;
  const method = req.method;
  if (method !== 'GET') throw ApiError.validation('Apenas GET');

  if (path === '/dashboard/metrics') {
    const q = getQuery(url);
    const dateFrom = q.from || new Date(Date.now() - 30 * 86400000).toISOString();
    const dateTo = q.to || new Date().toISOString();
    const total = Math.max(count(`SELECT COUNT(*) as c FROM leads WHERE created_at BETWEEN ? AND ?`, dateFrom, dateTo), 1);
    const won = count(`SELECT COUNT(*) as c FROM leads WHERE status = 'won' AND created_at BETWEEN ? AND ?`, dateFrom, dateTo);
    const metrics = {
      leads_today: count(`SELECT COUNT(*) as c FROM leads WHERE date(created_at) = date('now')`),
      leads_period: count(`SELECT COUNT(*) as c FROM leads WHERE created_at BETWEEN ? AND ?`, dateFrom, dateTo),
      qualified: count(`SELECT COUNT(*) as c FROM leads WHERE stage_id NOT IN ('stage_new') AND created_at BETWEEN ? AND ?`, dateFrom, dateTo),
      in_attendance: count(`SELECT COUNT(*) as c FROM leads WHERE stage_id IN ('stage_atend','stage_orc','stage_neg') AND status = 'active'`),
      quotes: count(`SELECT COUNT(*) as c FROM quotes WHERE created_at BETWEEN ? AND ?`, dateFrom, dateTo),
      negotiations: count(`SELECT COUNT(*) as c FROM leads WHERE stage_id = 'stage_neg' AND status = 'active'`),
      won,
      lost: count(`SELECT COUNT(*) as c FROM leads WHERE status = 'lost' AND created_at BETWEEN ? AND ?`, dateFrom, dateTo),
      conversion_rate: Math.round((won / total) * 100),
      pipeline_value: (db.prepare(`SELECT COALESCE(SUM(estimated_value),0) as v FROM leads WHERE status = 'active'`).get() as any).v,
      won_value: (db.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM quotes WHERE status = 'approved'`).get() as any).v,
    };
    return json(res, 200, { metrics, range: { from: dateFrom, to: dateTo } });
  }

  if (path === '/dashboard/leads-by-period') {
    const rows = db.prepare(`SELECT date(created_at) as day, COUNT(*) as count FROM leads WHERE created_at >= date('now', '-30 days') GROUP BY date(created_at) ORDER BY day ASC`).all();
    return json(res, 200, { data: rows });
  }

  if (path === '/dashboard/leads-by-source') {
    const rows = db.prepare(`SELECT COALESCE(source, 'site') as source, COUNT(*) as count FROM leads GROUP BY source ORDER BY count DESC`).all();
    return json(res, 200, { data: rows });
  }

  if (path === '/dashboard/leads-by-service') {
    const rows = db.prepare(`SELECT COALESCE(s.name, 'Não definido') as service, COUNT(l.id) as count FROM leads l LEFT JOIN services s ON s.id = l.service_id GROUP BY s.id ORDER BY count DESC`).all();
    return json(res, 200, { data: rows });
  }

  if (path === '/dashboard/funnel') {
    const stages = db.prepare(`SELECT id, name, color, position FROM pipeline_stages WHERE active = 1 ORDER BY position`).all() as any[];
    const counts = db.prepare(`SELECT stage_id, COUNT(*) as count FROM leads WHERE status = 'active' GROUP BY stage_id`).all() as any[];
    const map: Record<string, number> = {};
    for (const c of counts) map[c.stage_id] = c.count;
    return json(res, 200, { data: stages.map(s => ({ id: s.id, name: s.name, color: s.color, count: map[s.id] || 0 })) });
  }

  if (path === '/dashboard/campaigns') {
    const rows = db.prepare(`SELECT COALESCE(campaign, 'Sem campanha') as campaign, COALESCE(source, 'site') as source, COUNT(*) as leads, SUM(CASE WHEN status='won' THEN 1 ELSE 0 END) as won FROM leads WHERE campaign IS NOT NULL OR source IS NOT NULL GROUP BY campaign, source ORDER BY leads DESC`).all();
    return json(res, 200, { data: rows });
  }

  throw ApiError.notFound('Endpoint dashboard');
});
