/**
 * Appointments Router refatorado.
 */
import { json, readBody, getQuery } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { AppointmentRepository } from '../repositories/miscRepos.js';
import { CreateAppointmentSchema, parseBody } from '../lib/validators.js';
import { ApiError, asyncHandler } from '../lib/errors.js';

export const appointmentsRouter = asyncHandler(async (req, res, url) => {
  const user = await authenticate(req);
  if (!user) throw ApiError.unauthorized();
  const path = url.pathname;
  const method = req.method;

  if (path === '/appointments' && method === 'GET') {
    const q = getQuery(url);
    const list = AppointmentRepository.list({ user_id: q.user_id, lead_id: q.lead_id, from: q.from, to: q.to });
    return json(res, 200, { appointments: list });
  }
  if (path === '/appointments' && method === 'POST') {
    const body = parseBody(CreateAppointmentSchema, await readBody(req));
    const id = AppointmentRepository.insert({ ...body, user_id: body.user_id ?? user.id });
    return json(res, 201, { id });
  }

  const idMatch = path.match(/^\/appointments\/([^\/]+)$/);
  if (idMatch && method === 'PUT') {
    const body = await readBody(req);
    AppointmentRepository.update(idMatch[1], body);
    return json(res, 200, { ok: true });
  }
  if (idMatch && method === 'DELETE') {
    AppointmentRepository.delete(idMatch[1]);
    return json(res, 200, { ok: true });
  }

  throw ApiError.notFound('Endpoint appointments');
});
