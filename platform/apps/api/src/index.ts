/**
 * PESMETAL API Server — refatorado com error middleware global,
 * logger estruturado, camadas routes → services → repositories.
 */

import http from 'node:http';
import { URL } from 'node:url';
import { migrate } from './lib/db.js';
import { ensureAdminUser } from './lib/auth.js';
import { logger } from './lib/logger.js';
import { ApiError, serializeError } from './lib/errors.js';
import { corsHeaders } from './lib/http.js';
import { authRouter } from './routes/auth.js';
import { leadsRouter } from './routes/leads.js';
import { kanbanRouter } from './routes/kanban.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { automationsRouter } from './routes/automations.js';
import { servicesRouter } from './routes/services.js';
import { projectsRouter } from './routes/projects.js';
import { appointmentsRouter } from './routes/appointments.js';
import { quotesRouter } from './routes/quotes.js';
import { settingsRouter } from './routes/settings.js';
import { dashboardRouter } from './routes/dashboard.js';
import { publicRouter } from './routes/public.js';
import { instancesRouter } from './routes/instances.js';
import { webhookHandler } from './routes/webhook.js';
import { uploadRouter } from './routes/upload.js';

const PORT = parseInt(process.env.PORT || '4000');
const START = Date.now();

await migrate();
await ensureAdminUser();

const routes: Array<{ prefix: string; handler: (req: any, res: any, url: URL) => any; authRequired?: boolean }> = [
  { prefix: '/webhook/', handler: webhookHandler },
  { prefix: '/instances', handler: instancesRouter },
  { prefix: '/public/', handler: publicRouter },
  { prefix: '/auth/', handler: authRouter },
  { prefix: '/upload', handler: uploadRouter },
  { prefix: '/leads', handler: leadsRouter },
  { prefix: '/kanban', handler: kanbanRouter },
  { prefix: '/whatsapp', handler: whatsappRouter },
  { prefix: '/automations', handler: automationsRouter },
  { prefix: '/services', handler: servicesRouter },
  { prefix: '/projects', handler: projectsRouter },
  { prefix: '/appointments', handler: appointmentsRouter },
  { prefix: '/quotes', handler: quotesRouter },
  { prefix: '/settings', handler: settingsRouter },
  { prefix: '/dashboard', handler: dashboardRouter },
];

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    if (pathname === '/health') {
      return res.end(JSON.stringify({
        ok: true,
        ts: new Date().toISOString(),
        uptime: Math.round((Date.now() - START) / 1000),
        version: '2.0.0',
      }));
    }

    for (const r of routes) {
      if (pathname.startsWith(r.prefix)) {
        return await r.handler(req, res, url);
      }
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Rota não encontrada', code: 'not_found', path: pathname }));
  } catch (err: any) {
    if (err instanceof ApiError) {
      logger.warn('API error', { path: pathname, status: err.status, code: err.code, msg: err.message });
    } else {
      logger.error('unhandled error', { path: pathname, error: String(err?.message || err), stack: err?.stack });
    }
    const status = err instanceof ApiError ? err.status : 500;
    const body = serializeError(err);
    if (!res.headersSent) res.writeHead(status);
    res.end(JSON.stringify(body));
  } finally {
    logger.debug('request', { method: req.method, path: pathname, ms: Date.now() - t0 });
  }
});

server.listen(PORT, () => {
  logger.info(`🔥 PESMETAL API v2.0 rodando em http://localhost:${PORT}`);
  logger.info(`Admin: ${process.env.ADMIN_EMAIL || 'admin@pesmetal.local'} / ${process.env.ADMIN_PASSWORD || 'pesmetal123'}`);
});
