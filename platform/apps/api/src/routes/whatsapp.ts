/**
 * WhatsApp Router refatorado — usa ConversationRepository + MessageRepository.
 */
import { json, readBody, getQuery } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { q1 } from '../lib/db.js';
import { ConversationRepository, MessageRepository } from '../repositories/conversationRepo.js';
import { ContactRepository } from '../repositories/contactRepo.js';
import { findOrCreateContactId } from '../services/crm.js';
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
    const conversations = await ConversationRepository.list({
      status: q.status, assigned_user_id: q.assigned_user_id, search: q.search, stage_id: q.stage_id,
    });
    return json(res, 200, { conversations });
  }

  // POST /whatsapp/conversations/sync — importa histórico da Evolution sem duplicar
  if (path === '/whatsapp/conversations/sync' && method === 'POST') {
    const raw = await Evolution.findMessages({ limit: 10000 });
    const records = Array.isArray(raw) ? raw : raw?.messages?.records || raw?.messages || raw?.records || [];
    let imported = 0;
    let skipped = 0;
    let groups = 0;
    const errors: string[] = [];

    for (const item of records) {
      const key = item?.key || {};
      const remoteJid = String(key.remoteJid || '');
      if (!remoteJid || remoteJid.endsWith('@g.us')) { groups += 1; continue; }
      const phone = (key.participantAlt || remoteJid.split('@')[0] || '').replace(/\D/g, '');
      if (!phone) { skipped += 1; continue; }
      const externalId = String(key.id || item.id || '');
      if (externalId && await MessageRepository.findByExternalId(externalId)) { skipped += 1; continue; }

      try {
        const message = item.message || {};
        const content = message.conversation || message.extendedTextMessage?.text ||
          message.imageMessage?.caption || message.documentMessage?.caption || message.videoMessage?.caption || '';
        const type = message.imageMessage ? 'image' : message.videoMessage ? 'video' :
          message.audioMessage ? 'audio' : message.documentMessage ? 'document' : 'text';
        const mediaUrl = message.imageMessage?.url || message.documentMessage?.url || message.videoMessage?.url || message.audioMessage?.url || null;
        const mime = message.imageMessage?.mimetype || message.documentMessage?.mimetype || message.videoMessage?.mimetype || message.audioMessage?.mimetype || null;
        const contactId = await findOrCreateContactId(phone, { name: item.pushName || phone });
        let conversation = await ConversationRepository.findByContactId(contactId);
        if (!conversation) {
          const id = await ConversationRepository.insert({ contact_id: contactId, status: 'active', automation_status: 'idle' });
          conversation = (await ConversationRepository.findById(id))!;
        }
        const ts = Number(item.messageTimestamp || item.timestamp || 0);
        const createdAt = ts > 0 ? new Date(ts < 1e12 ? ts * 1000 : ts).toISOString() : undefined;
        await MessageRepository.insert({
          external_id: externalId || null,
          conversation_id: conversation.id,
          direction: key.fromMe ? 'outgoing' : 'incoming',
          type: type as any,
          content,
          media_url: mediaUrl,
          media_mime: mime,
          status: key.fromMe ? 'sent' : 'received',
          metadata: JSON.stringify({ imported: true, remoteJid }),
          created_at: createdAt,
        });
        if (createdAt) await ConversationRepository.update(conversation.id, { last_message_at: createdAt });
        imported += 1;
      } catch (error: any) {
        errors.push(`${externalId || phone}: ${String(error?.message || error)}`);
      }
    }

    return json(res, 200, { ok: true, chats: new Set(records.map((r: any) => r?.key?.remoteJid).filter(Boolean)).size, messages_found: records.length, messages_imported: imported, messages_skipped: skipped, groups_skipped: groups, errors: errors.slice(0, 20) });
  }

  // /whatsapp/conversations/:id/messages
  const msgsMatch = path.match(/^\/whatsapp\/conversations\/([^\/]+)\/messages$/);
  if (msgsMatch && method === 'GET') {
    const messages = await MessageRepository.listByConversation(msgsMatch[1]);
    await ConversationRepository.update(msgsMatch[1], { unread_count: 0 });
    return json(res, 200, { messages });
  }

  if (msgsMatch && method === 'POST') {
    const body = await readBody(req);
    if (!body.text) throw ApiError.validation('text obrigatório');
    const conv = await ConversationRepository.findById(msgsMatch[1]);
    if (!conv) throw ApiError.notFound('Conversa');
    const contact = await ContactRepository.findById(conv.contact_id);
    if (!contact) throw ApiError.notFound('Contato');
    const number = formatNumber(contact.phone);
    const senderName = await getSenderNameForConversation(msgsMatch[1]);
    const prefixedText = senderName ? `*${senderName}*\n${body.text}` : body.text;
    try {
      await Evolution.sendText({ number, text: prefixedText });
      const id = await MessageRepository.insert({
        conversation_id: msgsMatch[1], direction: 'outgoing', type: 'text',
        content: body.text, status: 'sent', sent_by_user_id: user.id,
      });
      await ConversationRepository.update(msgsMatch[1], { last_message_at: new Date().toISOString() });
      return json(res, 201, { id, status: 'sent' });
    } catch (err: any) {
      return json(res, 502, { error: 'Falha ao enviar', code: 'integration_error', detail: String(err?.message || err) });
    }
  }

  // /whatsapp/conversations/:id/{pause|resume|takeover}
  const actionMatch = path.match(/^\/whatsapp\/conversations\/([^\/]+)\/(pause|resume|takeover)$/);
  if (actionMatch && method === 'POST') {
    if (actionMatch[2] === 'pause' || actionMatch[2] === 'takeover') await pauseAutomation(actionMatch[1]);
    else await resumeAutomation(actionMatch[1]);
    return json(res, 200, { ok: true });
  }

  throw ApiError.notFound('Endpoint WhatsApp');
});

async function getSenderNameForConversation(convId: string): Promise<string | null> {
  const conv = await ConversationRepository.findById(convId);
  if (!conv?.lead_id) return null;
  const lead = (await q1(`SELECT name, phone FROM leads WHERE id = $1`, [conv.lead_id])) as any;
  return lead?.name || null;
}

function formatNumber(phone: string) {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}
