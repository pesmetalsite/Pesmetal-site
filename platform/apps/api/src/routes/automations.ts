/**
 * Automations Router refatorado.
 */
import { json, readBody } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { AutomationRepository } from '../repositories/automationRepo.js';
import { CreateAutomationSchema, parseBody } from '../lib/validators.js';
import { ApiError, asyncHandler } from '../lib/errors.js';

const DEFAULT_AUTOMATION_GRAPH = {
  entry: 'welcome',
  nodes: [
    { id: 'welcome', type: 'message', config: { text: 'Olá! Somos a Pes Metal — caldeiraria, soldagem, usinagem e projetos industriais.\n\nComo podemos ajudar?' }, next: 'menu_services' },
    { id: 'menu_services', type: 'menu', config: { text: 'Escolha uma opção:' }, options: [
      { key: '1', label: 'Caldeiraria', next: 'set_caldeiraria' },
      { key: '2', label: 'Usinagem', next: 'set_usinagem' },
      { key: '3', label: 'Soldagem', next: 'set_soldagem' },
      { key: '4', label: 'Projetos e fabricação', next: 'set_projetos' },
      { key: '5', label: 'Falar com atendente', next: 'transfer_human' },
    ]},
    { id: 'set_caldeiraria', type: 'set_interest', config: { value: 'caldeiraria' }, next: 'move_caldeiraria' },
    { id: 'move_caldeiraria', type: 'move_stage', config: { stage_id: 'stage_cald' }, next: 'ask_details' },
    { id: 'set_usinagem', type: 'set_interest', config: { value: 'usinagem' }, next: 'move_usinagem' },
    { id: 'move_usinagem', type: 'move_stage', config: { stage_id: 'stage_usin' }, next: 'ask_details' },
    { id: 'set_soldagem', type: 'set_interest', config: { value: 'soldagem' }, next: 'move_soldagem' },
    { id: 'move_soldagem', type: 'move_stage', config: { stage_id: 'stage_sold' }, next: 'ask_details' },
    { id: 'set_projetos', type: 'set_interest', config: { value: 'projetos' }, next: 'move_projetos' },
    { id: 'move_projetos', type: 'move_stage', config: { stage_id: 'stage_proj' }, next: 'ask_details' },
    { id: 'ask_details', type: 'request_info', config: { text: 'Por favor, descreva seu projeto ou envie uma foto/desenho técnico. Nossa equipe vai analisar e retornar com um orçamento.' }, next: 'end' },
    { id: 'transfer_human', type: 'transfer_human', config: {} },
    { id: 'end', type: 'end', config: {} },
  ],
};

export const automationsRouter = asyncHandler(async (req, res, url) => {
  const user = await authenticate(req);
  if (!user) throw ApiError.unauthorized();
  const path = url.pathname;
  const method = req.method;

  if (path === '/automations' && method === 'GET') {
    const list = AutomationRepository.list();
    return json(res, 200, { automations: list.map(a => ({
      id: a.id, name: a.name, description: a.description, trigger: a.trigger,
      status: a.status, updated_at: a.updated_at,
    })) });
  }

  if (path === '/automations' && method === 'POST') {
    if (user.role === 'atendente') throw ApiError.forbidden();
    const body = parseBody(CreateAutomationSchema, await readBody(req));
    const id = AutomationRepository.insert({ ...body, graph: JSON.stringify(body.graph) });
    return json(res, 201, { id });
  }

  const idMatch = path.match(/^\/automations\/([^\/]+)$/);
  if (idMatch && method === 'GET') {
    const a = AutomationRepository.findById(idMatch[1]);
    if (!a) throw ApiError.notFound('Automação');
    return json(res, 200, { automation: a });
  }
  if (idMatch && method === 'PUT') {
    if (user.role === 'atendente') throw ApiError.forbidden();
    let body: any;
    try {
      body = (await readBody(req)) || {};
    } catch {
      body = {};
    }
    if (typeof body !== 'object' || body === null) body = {};
    const fields: any = {};
    for (const k of ['name','description','trigger','keyword','status'] as const) {
      if (Object.prototype.hasOwnProperty.call(body, k)) fields[k] = body[k];
    }
    if (body.graph) fields.graph = JSON.stringify(body.graph);
    AutomationRepository.update(idMatch[1], fields);
    return json(res, 200, { ok: true });
  }
  if (idMatch && method === 'DELETE') {
    if (user.role !== 'admin') throw ApiError.forbidden('Apenas admin');
    AutomationRepository.delete(idMatch[1]);
    return json(res, 200, { ok: true });
  }

  if (path === '/automations/seed-defaults' && method === 'POST') {
    if (user.role === 'atendente') throw ApiError.forbidden();
    const id = AutomationRepository.insert({
      name: 'Atendimento Principal',
      description: 'Menu inicial com 5 opções: caldeiraria, usinagem, soldagem, projetos ou atendente.',
      trigger: 'new_contact',
      status: 'active',
      graph: JSON.stringify(DEFAULT_AUTOMATION_GRAPH),
    });
    return json(res, 201, { id });
  }

  throw ApiError.notFound('Endpoint automações');
});
