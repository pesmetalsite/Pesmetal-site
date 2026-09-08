/**
 * Contacts Router — clientes do orçamento.
 * CRUD sobre a tabela `contacts` (que também serve de vínculo de WhatsApp).
 */
import { json, readBody, getQuery } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { ContactRepository } from '../repositories/contactRepo.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

function normalizePhone(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

export const contactsRouter = asyncHandler(async (req, res, url) => {
  const user = await authenticate(req);
  if (!user) throw ApiError.unauthorized();
  const path = url.pathname;
  const method = req.method;

  // GET /contacts — listagem + busca
  if (path === '/contacts' && method === 'GET') {
    const q = getQuery(url);
    const contacts = await ContactRepository.list({ search: q.search, limit: q.limit ? parseInt(q.limit, 10) : 100 });
    return json(res, 200, { contacts });
  }

  // POST /contacts — cria cliente
  if (path === '/contacts' && method === 'POST') {
    const body = await readBody(req);
    const name = String(body?.name || '').trim();
    const phone = normalizePhone(body?.phone || '');
    if (!name) throw ApiError.validation('Nome do cliente é obrigatório');
    if (!phone || phone.length < 8) throw ApiError.validation('Telefone do cliente é obrigatório');
    const existing = await ContactRepository.findByPhone(phone);
    if (existing) {
      return json(res, 200, { id: existing.id, existing: true, contact: existing });
    }
    const id = await ContactRepository.insert({
      phone,
      name,
      email: body?.email ? String(body.email).trim() : null,
      company: body?.company ? String(body.company).trim() : null,
      document: body?.document ? String(body.document).trim() : null,
      address_line: body?.address_line ? String(body.address_line).trim() : null,
      address_city: body?.address_city ? String(body.address_city).trim() : null,
      address_state: body?.address_state ? String(body.address_state).trim() : null,
      address_zip: body?.address_zip ? String(body.address_zip).trim() : null,
    });
    logger.info('contact created', { id, user_id: user.id });
    return json(res, 201, { id, existing: false });
  }

  // GET /contacts/:id
  const idMatch = path.match(/^\/contacts\/([^\/]+)$/);
  if (idMatch && method === 'GET') {
    const contact = await ContactRepository.findById(idMatch[1]);
    if (!contact) throw ApiError.notFound('Cliente');
    return json(res, 200, { contact });
  }

  // PUT /contacts/:id — atualiza dados do cliente
  if (idMatch && method === 'PUT') {
    const body = await readBody(req);
    const contact = await ContactRepository.findById(idMatch[1]);
    if (!contact) throw ApiError.notFound('Cliente');
    const fields: any = {};
    for (const k of ['name', 'custom_name', 'email', 'company', 'document', 'address_line', 'address_city', 'address_state', 'address_zip']) {
      if (k in body) fields[k] = body[k] == null ? null : String(body[k]).trim() || null;
    }
    if ('phone' in body) {
      const digits = normalizePhone(body.phone);
      if (digits) {
        const dup = await ContactRepository.findByPhone(digits);
        if (dup && dup.id !== contact.id) throw ApiError.conflict('Já existe um cliente com este telefone');
        fields.phone = digits;
      }
    }
    await ContactRepository.update(contact.id, fields);
    logger.info('contact updated', { id: contact.id, user_id: user.id });
    return json(res, 200, { ok: true });
  }

  throw ApiError.notFound('Endpoint contacts');
});