/**
 * Projects Router refatorado.
 */
import { json, readBody } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { ProjectRepository } from '../repositories/miscRepos.js';
import { CreateProjectSchema, parseBody } from '../lib/validators.js';
import { ApiError, asyncHandler } from '../lib/errors.js';

function deserialize(p: any) {
  return { ...p, images: p.images ? JSON.parse(p.images) : [] };
}

export const projectsRouter = asyncHandler(async (req, res, url) => {
  const user = await authenticate(req);
  if (!user) throw ApiError.unauthorized();
  const path = url.pathname;
  const method = req.method;

  if (path === '/projects' && method === 'GET') {
    const list = ProjectRepository.list(true).map(deserialize);
    return json(res, 200, { projects: list });
  }
  if (path === '/projects' && method === 'POST') {
    if (user.role === 'atendente') throw ApiError.forbidden();
    const body = parseBody(CreateProjectSchema, await readBody(req));
    const id = ProjectRepository.insert(body);
    return json(res, 201, { id });
  }

  const idMatch = path.match(/^\/projects\/([^\/]+)$/);
  if (idMatch && method === 'PUT') {
    if (user.role === 'atendente') throw ApiError.forbidden();
    const body = await readBody(req);
    ProjectRepository.update(idMatch[1], body);
    return json(res, 200, { ok: true });
  }
  if (idMatch && method === 'DELETE') {
    if (user.role !== 'admin') throw ApiError.forbidden();
    ProjectRepository.delete(idMatch[1]);
    return json(res, 200, { ok: true });
  }

  throw ApiError.notFound('Endpoint projects');
});
