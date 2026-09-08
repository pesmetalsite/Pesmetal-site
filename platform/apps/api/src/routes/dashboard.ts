/**
 * Dashboard Router — métricas, gráficos, funil.
 */
import { json, getQuery } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { q, q1 } from '../lib/db.js';
import { ApiError, asyncHandler } from '../lib/errors.js';

async function count(sql: string, ...args: any[]): Promise<number> {
  const row = (await q1(sql, args)) as any;
  return Number(row?.c ?? 0);
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
    const total = Math.max(await count(`SELECT COUNT(*)::int as c FROM leads WHERE created_at BETWEEN $1 AND $2`, dateFrom, dateTo), 1);
    const won = await count(`SELECT COUNT(*)::int as c FROM leads WHERE status = 'won' AND created_at BETWEEN $1 AND $2`, dateFrom, dateTo);
    const metrics = {
      leads_today: await count(`SELECT COUNT(*)::int as c FROM leads WHERE created_at::date = current_date`),
      leads_period: await count(`SELECT COUNT(*)::int as c FROM leads WHERE created_at BETWEEN $1 AND $2`, dateFrom, dateTo),
      qualified: await count(`SELECT COUNT(*)::int as c FROM leads WHERE stage_id NOT IN ('stage_new') AND created_at BETWEEN $1 AND $2`, dateFrom, dateTo),
      in_attendance: await count(`SELECT COUNT(*)::int as c FROM leads WHERE stage_id IN ('stage_atend','stage_orc','stage_neg') AND status = 'active'`),
      quotes: await count(`SELECT COUNT(*)::int as c FROM quotes WHERE created_at BETWEEN $1 AND $2`, dateFrom, dateTo),
      negotiations: await count(`SELECT COUNT(*)::int as c FROM leads WHERE stage_id = 'stage_neg' AND status = 'active'`),
      won,
      lost: await count(`SELECT COUNT(*)::int as c FROM leads WHERE status = 'lost' AND created_at BETWEEN $1 AND $2`, dateFrom, dateTo),
      conversion_rate: Math.round((won / total) * 100),
      pipeline_value: Number(((await q1(`SELECT COALESCE(SUM(estimated_value),0) as v FROM leads WHERE status = 'active'`)) as any)?.v ?? 0),
      won_value: Number(((await q1(`SELECT COALESCE(SUM(amount),0) as v FROM quotes WHERE status = 'approved'`)) as any)?.v ?? 0),
    };
    return json(res, 200, { metrics, range: { from: dateFrom, to: dateTo } });
  }

  if (path === '/dashboard/leads-by-period') {
    const rows = await q(`SELECT created_at::date as day, COUNT(*)::int as count FROM leads WHERE created_at >= now() - interval '30 days' GROUP BY created_at::date ORDER BY day ASC`);
    return json(res, 200, { data: rows });
  }

  if (path === '/dashboard/leads-by-source') {
    const rows = await q(`SELECT COALESCE(source, 'site') as source, COUNT(*)::int as count FROM leads GROUP BY source ORDER BY count DESC`);
    return json(res, 200, { data: rows });
  }

  if (path === '/dashboard/leads-by-service') {
    const rows = await q(`SELECT COALESCE(s.name, 'Não definido') as service, COUNT(l.id)::int as count FROM leads l LEFT JOIN services s ON s.id = l.service_id GROUP BY s.id ORDER BY count DESC`);
    return json(res, 200, { data: rows });
  }

  if (path === '/dashboard/funnel') {
    const stages = (await q(`SELECT id, name, color, position FROM pipeline_stages WHERE active = 1 ORDER BY position`)) as any[];
    const counts = (await q(`SELECT stage_id, COUNT(*)::int as count FROM leads WHERE status = 'active' GROUP BY stage_id`)) as any[];
    const map: Record<string, number> = {};
    for (const c of counts) map[c.stage_id] = c.count;
    return json(res, 200, { data: stages.map(s => ({ id: s.id, name: s.name, color: s.color, count: map[s.id] || 0 })) });
  }

  if (path === '/dashboard/campaigns') {
    const rows = await q(`SELECT COALESCE(campaign, 'Sem campanha') as campaign, COALESCE(source, 'site') as source, COUNT(*)::int as leads, SUM(CASE WHEN status='won' THEN 1 ELSE 0 END)::int as won FROM leads WHERE campaign IS NOT NULL OR source IS NOT NULL GROUP BY campaign, source ORDER BY leads DESC`);
    return json(res, 200, { data: rows });
  }

  throw ApiError.notFound('Endpoint dashboard');
});
