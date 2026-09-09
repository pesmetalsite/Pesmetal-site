/**
 * Appointments Router refatorado.
 */
import { json, readBody, getQuery } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { AppointmentRepository } from '../repositories/miscRepos.js';
import { CreateAppointmentSchema, parseBody } from '../lib/validators.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { publish } from '../services/realtime.js';

export const appointmentsRouter = asyncHandler(async (req, res, url) => {
  const user = await authenticate(req);
  if (!user) throw ApiError.unauthorized();
  const path = url.pathname;
  const method = req.method;

  if (path === '/appointments' && method === 'GET') {
    const q = getQuery(url);
    const list = await AppointmentRepository.list({ user_id: q.user_id, lead_id: q.lead_id, contact_id: q.contact_id, from: q.from, to: q.to });
    return json(res, 200, { appointments: list });
  }
  if (path === '/appointments' && method === 'POST') {
    const body = parseBody(CreateAppointmentSchema, await readBody(req));
    const id = await AppointmentRepository.insert({ ...body, user_id: body.user_id ?? user.id, time: body.time || null });
    publish('appointments', 'created', { id, ...body });
    return json(res, 201, { id });
  }

  const idMatch = path.match(/^\/appointments\/([^\/]+)$/);
  if (idMatch && method === 'PUT') {
    const body = await readBody(req);
    await AppointmentRepository.update(idMatch[1], body);
    publish('appointments', 'updated', { id: idMatch[1], ...body });
    return json(res, 200, { ok: true });
  }
  if (idMatch && method === 'DELETE') {
    await AppointmentRepository.delete(idMatch[1]);
    publish('appointments', 'deleted', { id: idMatch[1] });
    return json(res, 200, { ok: true });
  }

  throw ApiError.notFound('Endpoint appointments');
});
