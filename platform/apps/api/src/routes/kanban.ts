/**
 * Kanban refatorado — usa StageRepository.
 */
import { json, readBody } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { StageRepository } from '../repositories/stageRepo.js';
import { LeadRepository } from '../repositories/leadRepo.js';
import { moveLead } from '../services/crm.js';
import { LeadEventRepository } from '../repositories/miscRepos.js';
import { CreateStageSchema, UpdateStageSchema, MoveLeadSchema, parseBody } from '../lib/validators.js';
import { ApiError, asyncHandler } from '../lib/errors.js';

export const kanbanRouter = asyncHandler(async (req, res, url) => {
  const user = await authenticate(req);
  if (!user) throw ApiError.unauthorized();
  const path = url.pathname;
  const method = req.method;

  // GET /kanban/board
  if (path === '/kanban/board' && method === 'GET') {
    const stages = StageRepository.list(true);
    const leads = LeadRepository.list({ status: 'active' });
    return json(res, 200, { stages, leads });
  }

  // GET /kanban/stages
  if (path === '/kanban/stages' && method === 'GET') {
    return json(res, 200, { stages: StageRepository.list(false) });
  }

  // POST /kanban/stages
  if (path === '/kanban/stages' && method === 'POST') {
    if (user.role === 'atendente') throw ApiError.forbidden();
    const body = parseBody(CreateStageSchema, await readBody(req));
    const id = StageRepository.insert(body);
    return json(res, 201, { id });
  }

  // PUT /kanban/stages/:id
  const stageMatch = path.match(/^\/kanban\/stages\/([^\/]+)$/);
  if (stageMatch && method === 'PUT') {
    if (user.role === 'atendente') throw ApiError.forbidden();
    const body = parseBody(UpdateStageSchema, await readBody(req));
    StageRepository.update(stageMatch[1], body as any);
    return json(res, 200, { ok: true });
  }

  // DELETE /kanban/stages/:id
  if (stageMatch && method === 'DELETE') {
    if (user.role !== 'admin') throw ApiError.forbidden('Apenas admin');
    StageRepository.delete(stageMatch[1]);
    return json(res, 200, { ok: true });
  }

  // POST /kanban/move
  if (path === '/kanban/move' && method === 'POST') {
    const body = parseBody(MoveLeadSchema, await readBody(req));
    const ok = moveLead(body.lead_id, body.stage_id, user.id);
    if (!ok) throw ApiError.notFound('Lead ou stage');
    return json(res, 200, { ok: true });
  }

  throw ApiError.notFound('Endpoint Kanban');
});
