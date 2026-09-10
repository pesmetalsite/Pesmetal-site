/**
 * Realtime Router — SSE stream autenticado + polling REST.
 * GET /realtime/stream  (valida Bearer, mantém conexão aberta)
 * GET /realtime/events   (polling REST para browsers)
 */
import { authenticate } from '../lib/auth.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { openStream, getRecentEvents } from '../services/realtime.js';

export const realtimeRouter = asyncHandler(async (req, res, url) => {
  if (url.pathname === '/realtime/stream' && req.method === 'GET') {
    const user = await authenticate(req);
    if (!user) throw ApiError.unauthorized();
    openStream(res);
    return; // não fecha: stream fica aberto
  }
  if (url.pathname === '/realtime/events' && req.method === 'GET') {
    const user = await authenticate(req);
    if (!user) throw ApiError.unauthorized();
    const events = getRecentEvents();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(events));
    return;
  }
  throw ApiError.notFound('Endpoint realtime');
});