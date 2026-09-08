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
    let body: any = {};
    try { body = await readBody(req); } catch { body = {}; }
    const instanceName = body?.instance_name || body?.instanceName || undefined;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Sync excedeu o tempo limite (60s)')), SYNC_TIMEOUT_MS));
    try {
      const result = await Promise.race([syncConversations(instanceName), timeoutPromise]);
      return json(res, 200, { ok: true, ...result });
    } catch (err: any) {
      return json(res, 504, { error: 'Falha ao sincronizar', code: 'sync_timeout', detail: String(err?.message || err) });
    }
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

// === Sync de conversas (mínimo 50 chats) ===
const SYNC_TARGET = 50;
const SYNC_MSGS_PER_CHAT = 200;
const SYNC_TIMEOUT_MS = 60000;

function extractMessageRecords(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  return raw?.messages?.records || raw?.messages || raw?.records || [];
}

function chatUpdatedAt(chat: any): number {
  const v = Number(chat?.t || chat?.updatedAt || chat?.lastMessageTimestamp || chat?.lastMessageAt || 0);
  return v || 0;
}

async function syncConversations(instanceName?: string) {
  let imported = 0;
  let skipped = 0;
  let messagesFound = 0;
  const errors: string[] = [];
  const seenJids = new Set<string>();
  const groupJids = new Set<string>();
  let processed = 0;

  const importMessage = async (item: any): Promise<void> => {
    const key = item?.key || {};
    const remoteJid = String(key.remoteJid || '');
    if (!remoteJid || remoteJid.endsWith('@g.us')) {
      if (remoteJid) groupJids.add(remoteJid);
      return;
    }
    const phone = (key.participantAlt || remoteJid.split('@')[0] || '').replace(/\D/g, '');
    if (!phone) { skipped += 1; return; }
    const externalId = String(key.id || item.id || '');
    if (externalId && await MessageRepository.findByExternalId(externalId)) { skipped += 1; return; }

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
  };

  const importChat = async (remoteJid: string): Promise<boolean> => {
    if (seenJids.has(remoteJid)) return false;
    seenJids.add(remoteJid);
    if (remoteJid.endsWith('@g.us')) { groupJids.add(remoteJid); return false; }
    try {
      const raw = await Evolution.findMessages({ number: remoteJid, limit: SYNC_MSGS_PER_CHAT, instanceName });
      const records = extractMessageRecords(raw).slice(0, SYNC_MSGS_PER_CHAT);
      messagesFound += records.length;
      for (const item of records) {
        try { await importMessage(item); } catch (e: any) { errors.push(`${remoteJid}: ${String(e?.message || e)}`); }
      }
      return true;
    } catch (e: any) {
      errors.push(`findMessages ${remoteJid}: ${String(e?.message || e)}`);
      return false;
    }
  };

  // 1) Chats recentes via findChats (top 50 por updatedAt)
  try {
    const chatsRaw = await Evolution.findChats({ instanceName });
    const chats = Array.isArray(chatsRaw) ? chatsRaw : chatsRaw?.chats || chatsRaw?.records || [];
    const ordered = chats
      .map((c: any) => ({ remoteJid: String(c?.key?.remoteJid || c?.remoteJid || ''), ts: chatUpdatedAt(c) }))
      .filter((c: any) => c.remoteJid)
      .sort((a: any, b: any) => b.ts - a.ts);
    for (const c of ordered) {
      if (processed >= SYNC_TARGET) break;
      if (await importChat(c.remoteJid)) processed += 1;
    }
  } catch (e: any) {
    errors.push(`findChats: ${String(e?.message || e)}`);
  }

  // 2) Fallback: findMessages global agrupado por chat quando findChats não rendeu 50
  if (processed < SYNC_TARGET) {
    try {
      const rawAll = await Evolution.findMessages({ limit: 5000, instanceName });
      const records = extractMessageRecords(rawAll).slice(0, 5000);
      messagesFound += records.length;
      const byJid = new Map<string, any[]>();
      for (const r of records) {
        const remoteJid = String(r?.key?.remoteJid || '');
        if (!remoteJid) continue;
        if (remoteJid.endsWith('@g.us')) { groupJids.add(remoteJid); continue; }
        const arr = byJid.get(remoteJid) || [];
        arr.push(r);
        byJid.set(remoteJid, arr);
      }
      const groups = [...byJid.entries()]
        .map(([jid, msgs]) => ({
          jid,
          ts: Math.max(0, ...msgs.map(m => Number(m.messageTimestamp || m.timestamp || 0))),
        }))
        .sort((a, b) => b.ts - a.ts);
      for (const g of groups) {
        if (processed >= SYNC_TARGET) break;
        if (seenJids.has(g.jid)) continue;
        seenJids.add(g.jid);
        const chatRecords = byJid.get(g.jid) || [];
        for (const item of chatRecords) {
          try { await importMessage(item); } catch (e: any) { errors.push(`${g.jid}: ${String(e?.message || e)}`); }
        }
        processed += 1;
      }
    } catch (e: any) {
      errors.push(`findMessages global: ${String(e?.message || e)}`);
    }
  }

  return {
    chats: processed,
    messages_found: messagesFound,
    messages_imported: imported,
    messages_skipped: skipped,
    groups_skipped: groupJids.size,
    errors: errors.slice(0, 20),
  };
}
