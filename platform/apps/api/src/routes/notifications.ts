/**
 * Notifications Router — autenticado.
 * GET  /notifications             → não lidas primeiro (limite 50)
 * GET  /notifications?all=1       → todas (limite 50)
 * POST /notifications/:id/read    → marca como lida
 * POST /notifications/read-all    → marca todas do usuário (admin: todas)
 */
import { json, getQuery } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../services/notifications.js';

export const notificationsRouter = asyncHandler(async (req, res, url) => {
  const user = await authenticate(req);
  if (!user) throw ApiError.unauthorized();
  const path = url.pathname;
  const method = req.method;

  if (path === '/notifications' && method === 'GET') {
    const q = getQuery(url);
    const notifications = await listNotifications(user.id, {
      all: q.all === '1' || q.all === 'true',
      limit: q.limit ? parseInt(q.limit, 10) : 50,
    });
    return json(res, 200, { notifications });
  }

  if (path === '/notifications/read-all' && method === 'POST') {
    const updated = await markAllNotificationsRead(user.id, user.role === 'admin');
    return json(res, 200, { ok: true, updated });
  }

  const idMatch = path.match(/^\/notifications\/([^\/]+)\/read$/);
  if (idMatch && method === 'POST') {
    const ok = await markNotificationRead(idMatch[1], user.id);
    if (!ok) throw ApiError.notFound('Notificação');
    return json(res, 200, { ok: true });
  }

  throw ApiError.notFound('Endpoint notificações');
});