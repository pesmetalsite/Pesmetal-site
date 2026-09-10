/**
 * WhatsApp Router refatorado — usa ConversationRepository + MessageRepository.
 */
import { json, readBody, getQuery } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { q, q1, qe } from '../lib/db.js';
import { ConversationRepository, MessageRepository } from '../repositories/conversationRepo.js';
import { ContactRepository } from '../repositories/contactRepo.js';
import { findOrCreateContactId } from '../services/crm.js';
import { Evolution } from '../services/evolution.js';
import { pauseAutomation, resumeAutomation } from '../services/automation.js';
import { logger } from '../lib/logger.js';
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

  // POST /whatsapp/conversations — inicia uma conversa manual sem duplicar contato/conversa
  if (path === '/whatsapp/conversations' && method === 'POST') {
    const body = await readBody(req);
    const phone = String(body?.phone || '').replace(/\D/g, '');
    if (phone.length < 8) throw ApiError.validation('Número do WhatsApp inválido');
    const instances = (await q(`SELECT id, instance_name, name, status FROM whatsapp_instances WHERE active = 1 AND status = 'connected' ORDER BY is_default DESC, created_at ASC`)) as any[];
    const requested = body?.instance_name ? instances.find((i) => i.instance_name === body.instance_name) : null;
    const instance = requested || (instances.length === 1 ? instances[0] : null);
    if (!instance) throw ApiError.validation(instances.length ? 'Selecione o WhatsApp de envio' : 'Nenhum WhatsApp conectado');

    let contact = await ContactRepository.findByPhone(phone);
    if (!contact) {
      const contactId = await ContactRepository.insert({ phone, name: body?.name?.trim() || phone, custom_name: body?.custom_name?.trim() || body?.name?.trim() || null });
      contact = await ContactRepository.findById(contactId);
    } else if (body?.custom_name !== undefined || body?.name !== undefined) {
      await ContactRepository.update(contact.id, { custom_name: body.custom_name?.trim() || null, name: body.name?.trim() || contact.name });
      contact = await ContactRepository.findById(contact.id);
    }
    if (!contact) throw ApiError.internal('Não foi possível criar contato');

    const { createLead } = await import('../services/crm.js');
    const lead = await createLead({ name: body?.name?.trim() || contact.custom_name || contact.name || phone, phone, source: 'manual' });
    let conversation = await ConversationRepository.findByContactId(contact.id, instance.id);
    if (!conversation) {
      const id = await ConversationRepository.insert({ contact_id: contact.id, lead_id: lead.lead_id, instance_id: instance.id, status: 'active', automation_status: 'paused' });
      conversation = (await ConversationRepository.findById(id))!;
    } else if (!conversation.lead_id) {
      await ConversationRepository.update(conversation.id, { lead_id: lead.lead_id });
    }
    return json(res, 201, { conversation: { ...conversation, contact_name: contact.custom_name || contact.name || phone, contact_phone: contact.phone, instance_name: instance.instance_name }, instance_name: instance.instance_name });
  }

  // GET /whatsapp/conversations
  if (path === '/whatsapp/conversations' && method === 'GET') {
    const q = getQuery(url);
    const { conversations, total } = await ConversationRepository.list({
      status: q.status, assigned_user_id: q.assigned_user_id, search: q.search, stage_id: q.stage_id,
      lead_id: q.lead_id, unread: q.unread === '1' || q.unread === 'true',
      limit: q.limit ? parseInt(q.limit, 10) : 50,
      offset: q.offset ? parseInt(q.offset, 10) : 0,
    });
    return json(res, 200, { conversations, total, has_more: total > (q.offset ? parseInt(q.offset, 10) : 0) + conversations.length });
  }

// POST /whatsapp/conversations/sync — importa histórico em background (retorna 202 imediato)
  if (path === '/whatsapp/conversations/sync' && method === 'POST') {
    let body: any = {};
    try { body = await readBody(req); } catch { body = {}; }
    const instanceName = body?.instance_name || body?.instanceName || undefined;
    // Processa em segundo plano (o gateway do Railway corta requests > ~30s)
    void syncConversations(instanceName).catch((err) => {
      logger.error('sync background failed', { error: String(err?.message || err) });
    });
    return json(res, 202, { ok: true, status: 'started', message: 'Sincronização iniciada em segundo plano. As conversas aparecerão em instantes.' });
  }

  // GET /whatsapp/conversations/:id
  const convMatch = path.match(/^\/whatsapp\/conversations\/([^\/]+)$/);
  if (convMatch && method === 'GET') {
    const row = await q1(`
      SELECT wc.*, c.name as contact_name, c.custom_name, c.phone as contact_phone, c.company as contact_company,
             c.is_favorite, c.no_automation, c.tags as contact_tags,
             l.name as lead_name, l.stage_id, ps.name as stage_name, ps.color as stage_color,
             l.source as lead_source, l.campaign, l.utm_campaign, l.utm_source, l.utm_medium, l.adset, l.ad_name, l.fbclid, l.utm_content,
             (SELECT content FROM whatsapp_messages WHERE conversation_id = wc.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message
      FROM whatsapp_conversations wc
      JOIN contacts c ON c.id = wc.contact_id
      LEFT JOIN leads l ON l.id = wc.lead_id
      LEFT JOIN pipeline_stages ps ON ps.id = l.stage_id
      WHERE wc.id = $1
    `, [convMatch[1]]);
    if (!row) throw ApiError.notFound('Conversa');
    return json(res, 200, { conversation: row });
  }

  // PATCH /whatsapp/conversations/:id — atualizar conversa ou favorito/automação
  if (convMatch && method === 'PATCH') {
    const body = await readBody(req);
    const conv = await ConversationRepository.findById(convMatch[1]);
    if (!conv) throw ApiError.notFound('Conversa');
    const contact = await ContactRepository.findById(conv.contact_id);
    if (!contact) throw ApiError.notFound('Contato');

    // Toggle favorito
    if (body?.favorite !== undefined) {
      await ContactRepository.update(contact.id, { is_favorite: Boolean(body.favorite) });
      return json(res, 200, { ok: true, is_favorite: Boolean(body.favorite) });
    }

    // Toggle automação
    if (body?.no_automation !== undefined) {
      await ContactRepository.update(contact.id, { no_automation: Boolean(body.no_automation) });
      return json(res, 200, { ok: true, no_automation: Boolean(body.no_automation) });
    }

    // Nome customizado
    if (body?.custom_name !== undefined) {
      const customName = body.custom_name == null ? null : String(body.custom_name).trim() || null;
      await ContactRepository.update(contact.id, { custom_name: customName });
      return json(res, 200, { ok: true, custom_name: customName, display_name: customName || contact.name || contact.phone });
    }

    return json(res, 200, { ok: true });
  }

  // POST /whatsapp/conversations/:id/close — finaliza atendimento humano e arma novo ciclo
  const closeMatch = path.match(/^\/whatsapp\/conversations\/([^\/]+)\/close$/);
  if (closeMatch && method === 'POST') {
    const conv = await ConversationRepository.findById(closeMatch[1]);
    if (!conv) throw ApiError.notFound('Conversa');
    if (conv.status === 'closed') return json(res, 200, { ok: true, already_closed: true });
    const body = await readBody(req).catch(() => ({}));
    const automation = conv.automation_id ? await q1(`SELECT closing_message FROM automations WHERE id = $1`, [conv.automation_id]) as any : null;
    const text = body?.message || automation?.closing_message || 'Obrigado pelo contato! Se precisar de mais alguma coisa, é só nos chamar novamente.';
    const contact = await ContactRepository.findById(conv.contact_id);
    if (contact) {
      const instanceName = (conv as any).instance_id
        ? (await q1(`SELECT instance_name FROM whatsapp_instances WHERE id = $1`, [(conv as any).instance_id]) as any)?.instance_name
        : undefined;
      try {
        await Evolution.sendText({ number: formatNumber(contact.phone), text, instanceName });
        await MessageRepository.insert({ conversation_id: conv.id, direction: 'outgoing', type: 'text', content: text, status: 'sent', sent_by_user_id: user.id });
      } catch (sendErr: any) {
        logger.warn('close: failed to send closing message', { error: String(sendErr?.message || sendErr) });
      }
    }
    await ConversationRepository.update(conv.id, { status: 'active', automation_status: 'idle', current_node: null, closed_at: new Date().toISOString(), closed_by: user.id, last_message_at: new Date().toISOString() } as any);
    if (conv.lead_id) await qe(`UPDATE leads SET last_activity_at = now(), updated_at = now() WHERE id = $1`, [conv.lead_id]);
    return json(res, 200, { ok: true, status: 'automation_ready' });
  }

  // /whatsapp/conversations/:id/messages
  const msgsMatch = path.match(/^\/whatsapp\/conversations\/([^\/]+)\/messages$/);
  if (msgsMatch && method === 'GET') {
    const q = getQuery(url);
    const limit = q.limit ? parseInt(q.limit, 10) : 50;
    const offset = q.offset ? parseInt(q.offset, 10) : 0;
    const oldestFirst = q.oldest_first === '1' || q.oldest_first === 'true';
    // Mensagens mais recentes primeiro; frontend inverte para exibir (com paginação de histórico).
    const messages = await MessageRepository.listByConversation(msgsMatch[1], { limit, offset, oldestFirst });
    const total = await MessageRepository.countByConversation(msgsMatch[1]);
    if (offset === 0) await ConversationRepository.update(msgsMatch[1], { unread_count: 0 });
    return json(res, 200, { messages, total, has_more: offset + messages.length < total });
  }

  if (msgsMatch && method === 'POST') {
    const body = await readBody(req);
    if (!body.text && !body.media_url) throw ApiError.validation('text ou media_url obrigatório');
    const conv = await ConversationRepository.findById(msgsMatch[1]);
    if (!conv) throw ApiError.notFound('Conversa');
    const contact = await ContactRepository.findById(conv.contact_id);
    if (!contact) throw ApiError.notFound('Contato');
    const number = formatNumber(contact.phone);
    const senderName = await getSenderNameForConversation(msgsMatch[1]);
    const prefixedText = body.text && senderName ? `*${senderName}*\n${body.text}` : (body.text || '');
    const instanceName = (conv as any).instance_id
      ? (await q1(`SELECT instance_name FROM whatsapp_instances WHERE id = $1`, [(conv as any).instance_id]) as any)?.instance_name
      : undefined;
    const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost';

    // Idempotência por client_id (envio otimista): se já existe mensagem com este client_id, retorna ela
    if (body.client_id) {
      const existing = await q1(`SELECT id, status FROM whatsapp_messages WHERE client_id = $1`, [body.client_id]);
      if (existing) return json(res, 200, { id: existing.id, status: existing.status, deduplicated: true });
    }

    try {
      let msgId: string;
      const mediaType = body.media_type as ('image' | 'audio' | 'video' | 'document' | undefined) | undefined;
      const isMedia = !!body.media_url && !!mediaType;
      if (isMedia) {
        // Evolution precisa de URL absoluta para fetch. Converte se vier relativa.
        const absoluteMedia = /^https?:\/\//i.test(body.media_url)
          ? body.media_url
          : `${proto}://${host}${body.media_url.startsWith('/') ? body.media_url : '/' + body.media_url}`;
        msgId = await MessageRepository.insert({
          conversation_id: msgsMatch[1], direction: 'outgoing', type: mediaType!,
          content: body.text || '',
          media_url: body.media_url, // mantém original (pode ser relativo)
          media_mime: body.media_mime || null,
          status: 'pending', sent_by_user_id: user.id,
        });
        await Evolution.sendMedia({
          number, mediaType: mediaType!,
          media: absoluteMedia,
          fileName: body.file_name,
          caption: body.text,
          instanceName,
        });
        await MessageRepository.updateStatus(msgId, 'sent');
      } else {
        msgId = await MessageRepository.insert({
          conversation_id: msgsMatch[1], direction: 'outgoing', type: 'text',
          content: body.text, status: 'pending', sent_by_user_id: user.id,
        });
        await Evolution.sendText({ number, text: prefixedText, instanceName });
        await MessageRepository.updateStatus(msgId, 'sent');
      }
      // Seta client_id para reconciliação otimista
      if (body.client_id) {
        await qe(`UPDATE whatsapp_messages SET client_id = $1 WHERE id = $2`, [body.client_id, msgId]);
      }
      await ConversationRepository.update(msgsMatch[1], { last_message_at: new Date().toISOString(), status: 'human', automation_status: 'paused', human_started_at: new Date().toISOString(), human_started_by: user.id });
      return json(res, 201, { id: msgId, status: 'sent', client_id: body.client_id || null });
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
