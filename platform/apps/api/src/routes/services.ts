/**
 * Services Router refatorado.
 */
import { json, readBody } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { ServiceRepository } from '../repositories/miscRepos.js';
import { CreateServiceSchema, parseBody } from '../lib/validators.js';
import { ApiError, asyncHandler } from '../lib/errors.js';

export const servicesRouter = asyncHandler(async (req, res, url) => {
  const user = await authenticate(req);
  if (!user) throw ApiError.unauthorized();
  const path = url.pathname;
  const method = req.method;

  if (path === '/services' && method === 'GET') return json(res, 200, { services: ServiceRepository.list(true) });
  if (path === '/services' && method === 'POST') {
    if (user.role === 'atendente') throw ApiError.forbidden();
    const body = parseBody(CreateServiceSchema, await readBody(req));
    const id = ServiceRepository.insert(body);
    return json(res, 201, { id });
  }

  const idMatch = path.match(/^\/services\/([^\/]+)$/);
  if (idMatch && method === 'PUT') {
    if (user.role === 'atendente') throw ApiError.forbidden();
    const body = await readBody(req);
    ServiceRepository.update(idMatch[1], body);
    return json(res, 200, { ok: true });
  }
  if (idMatch && method === 'DELETE') {
    if (user.role !== 'admin') throw ApiError.forbidden();
    ServiceRepository.delete(idMatch[1]);
    return json(res, 200, { ok: true });
  }

  throw ApiError.notFound('Endpoint services');
});
