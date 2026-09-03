/**
 * Refatorado: usa validators Zod, ApiError e repositories.
 */
import { json, readBody, getQuery } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { LeadRepository, type LeadRow } from '../repositories/leadRepo.js';
import { LeadNoteRepository, LeadEventRepository } from '../repositories/miscRepos.js';
import { createLead, getLeadFull, listLeads, moveLead, deleteLead, recordEvent } from '../services/crm.js';
import { CreateLeadSchema, UpdateLeadSchema, MoveLeadSchema, LeadNoteSchema, parseBody } from '../lib/validators.js';
import { ApiError, asyncHandler } from '../lib/errors.js';

export const leadsRouter = asyncHandler(async (req, res, url) => {
  const user = await authenticate(req);
  if (!user) throw ApiError.unauthorized();
  const path = url.pathname;
  const method = req.method;

  // POST /leads — criação manual
  if (path === '/leads' && method === 'POST') {
    if (user.role === 'atendente') throw ApiError.forbidden('Apenas admin/gestor pode criar leads manualmente');
    const body = parseBody(CreateLeadSchema, await readBody(req));
    const { lead_id, contact_id, is_new } = createLead({ ...body, source: body.source || 'manual' });
    if (body.stage_id) moveLead(lead_id, body.stage_id, user.id);
    if (body.assigned_user_id) LeadRepository.updateFields(lead_id, { assigned_user_id: body.assigned_user_id });
    return json(res, is_new ? 201 : 200, { lead_id, contact_id, is_new });
  }

  // GET /leads — listagem
  if (path === '/leads' && method === 'GET') {
    const q = getQuery(url);
    return json(res, 200, { leads: listLeads({
      stage_id: q.stage_id, service_id: q.service_id, source: q.source,
      assigned_user_id: q.assigned_user_id, search: q.search,
      date_from: q.date_from, date_to: q.date_to, status: q.status as any,
    })});
  }

  // /leads/:id
  const idMatch = path.match(/^\/leads\/([^\/]+)$/);
  if (idMatch && method === 'GET') {
    const lead = getLeadFull(idMatch[1]);
    if (!lead) throw ApiError.notFound('Lead');
    const notes = LeadNoteRepository.listByLead(idMatch[1]);
    const events = LeadEventRepository.listByLead(idMatch[1]);
    return json(res, 200, { lead: { ...lead, notes, events } });
  }

  if (idMatch && method === 'PUT') {
    const body = parseBody(UpdateLeadSchema, await readBody(req));
    LeadRepository.updateFields(idMatch[1], body as Partial<LeadRow>);
    recordEvent({ lead_id: idMatch[1], user_id: user.id, type: 'lead_updated', description: 'Lead atualizado' });
    return json(res, 200, { ok: true });
  }

  if (idMatch && method === 'DELETE') {
    if (user.role !== 'admin') throw ApiError.forbidden('Apenas admin');
    deleteLead(idMatch[1]);
    return json(res, 200, { ok: true });
  }

  // POST /leads/:id/stage — mover no Kanban
  const stageMatch = path.match(/^\/leads\/([^\/]+)\/stage$/);
  if (stageMatch && method === 'POST') {
    const body = parseBody(MoveLeadSchema, await readBody(req));
    const ok = moveLead(stageMatch[1], body.stage_id, user.id);
    if (!ok) throw ApiError.notFound('Lead ou stage');
    return json(res, 200, { ok: true });
  }

  // POST /leads/:id/notes
  const noteMatch = path.match(/^\/leads\/([^\/]+)\/notes$/);
  if (noteMatch && method === 'POST') {
    const body = parseBody(LeadNoteSchema, await readBody(req));
    const id = LeadNoteRepository.insert({ lead_id: noteMatch[1], user_id: user.id, content: body.content });
    recordEvent({ lead_id: noteMatch[1], user_id: user.id, type: 'note_added', description: 'Nota adicionada' });
    return json(res, 201, { id });
  }

  throw ApiError.notFound('Endpoint de leads');
});
