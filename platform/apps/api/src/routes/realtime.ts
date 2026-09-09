/**
 * Realtime Router — SSE stream autenticado.
 * GET /realtime/stream  (valida Bearer, mantém conexão aberta)
 */
import { authenticate } from '../lib/auth.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { openStream } from '../services/realtime.js';

export const realtimeRouter = asyncHandler(async (req, res, url) => {
  if (url.pathname === '/realtime/stream' && req.method === 'GET') {
    const user = await authenticate(req);
    if (!user) throw ApiError.unauthorized();
    openStream(res);
    return; // não fecha: stream fica aberto
  }
  throw ApiError.notFound('Endpoint realtime');
});