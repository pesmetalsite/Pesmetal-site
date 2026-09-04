/**
 * WhatsApp Router refatorado — usa ConversationRepository + MessageRepository.
 */
import { json, readBody, getQuery } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { ConversationRepository, MessageRepository } from '../repositories/conversationRepo.js';
import { ContactRepository } from '../repositories/contactRepo.js';
import { Evolution } from '../services/evolution.js';
import { pauseAutomation, resumeAutomation } from '../services/automation.js';
import { ApiError, asyncHandler } from '../lib/errors.js';

export const whatsappRouter = asyncHandler(async (req, res, url) => {
  const user = await authenticate(req);
  if (!user) throw ApiError.unauthorized();
  const path = url.pathname;
  const method = req.method;

  // GET /whatsapp/webhook-url — retorna a URL do webhook esperado
  if (path === '/whatsapp/webhook-url' && method === 'GET') {
    const baseUrl = process.env.API_BASE_URL || `https://lucid-contentment-production-17bc.up.railway.app`;
    return json(res, 200, { url: `${baseUrl}/webhook/evolution` });
  }

  // POST /whatsapp/webhook-url — configura o webhook na Evolution API
  if (path === '/whatsapp/webhook-url' && method === 'POST') {
    const baseUrl = process.env.API_BASE_URL || `https://lucid-contentment-production-17bc.up.railway.app`;
    const webhookUrl = `${baseUrl}/webhook/evolution`;
    try {
      await Evolution.setWebhook({
        url: webhookUrl,
        events: ['messages.upsert', 'connection.update'],
      });
      return json(res, 200, { ok: true, url: webhookUrl });
    } catch (err: any) {
      return json(res, 502, { error: 'Falha ao configurar webhook na Evolution API', detail: String(err?.message || err) });
    }
  }

  // GET /whatsapp/status
  if (path === '/whatsapp/status' && method === 'GET') {
    const state = await Evolution.getConnectionState();
    return json(res, 200, { ...state, configured: !!process.env.EVOLUTION_API_URL });
  }

  // GET /whatsapp/conversations
  if (path === '/whatsapp/conversations' && method === 'GET') {
    const q = getQuery(url);
    const conversations = ConversationRepository.list({
      status: q.status, assigned_user_id: q.assigned_user_id, search: q.search, stage_id: q.stage_id,
    });
    return json(res, 200, { conversations });
  }

  // /whatsapp/conversations/:id/messages
  const msgsMatch = path.match(/^\/whatsapp\/conversations\/([^\/]+)\/messages$/);
  if (msgsMatch && method === 'GET') {
    const messages = MessageRepository.listByConversation(msgsMatch[1]);
    ConversationRepository.update(msgsMatch[1], { unread_count: 0 });
    return json(res, 200, { messages });
  }

  if (msgsMatch && method === 'POST') {
    const body = await readBody(req);
    if (!body.text) throw ApiError.validation('text obrigatório');
    const conv = ConversationRepository.findById(msgsMatch[1]);
    if (!conv) throw ApiError.notFound('Conversa');
    const contact = ContactRepository.findById(conv.contact_id);
    if (!contact) throw ApiError.notFound('Contato');
    const number = formatNumber(contact.phone);
    const senderName = getSenderNameForConversation(msgsMatch[1]);
    const prefixedText = senderName ? `*${senderName}*\n${body.text}` : body.text;
    try {
      await Evolution.sendText({ number, text: prefixedText });
      const id = MessageRepository.insert({
        conversation_id: msgsMatch[1], direction: 'outgoing', type: 'text',
        content: body.text, status: 'sent', sent_by_user_id: user.id,
      });
      ConversationRepository.update(msgsMatch[1], { last_message_at: new Date().toISOString() });
      return json(res, 201, { id, status: 'sent' });
    } catch (err: any) {
      return json(res, 502, { error: 'Falha ao enviar', code: 'integration_error', detail: String(err?.message || err) });
    }
  }

  // /whatsapp/conversations/:id/{pause|resume|takeover}
  const actionMatch = path.match(/^\/whatsapp\/conversations\/([^\/]+)\/(pause|resume|takeover)$/);
  if (actionMatch && method === 'POST') {
    if (actionMatch[2] === 'pause' || actionMatch[2] === 'takeover') pauseAutomation(actionMatch[1]);
    else resumeAutomation(actionMatch[1]);
    return json(res, 200, { ok: true });
  }

  throw ApiError.notFound('Endpoint WhatsApp');
});

function getSenderNameForConversation(convId: string): string | null {
  const conv = ConversationRepository.findById(convId);
  if (!conv?.lead_id) return null;
  const lead = (db as any).prepare(`SELECT name, phone FROM leads WHERE id = ?`).get(conv.lead_id) as any;
  return lead?.name || null;
}

function formatNumber(phone: string) {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}
