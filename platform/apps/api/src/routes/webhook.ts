/**
 * Webhook da Evolution API — refatorado com idempotência + anti-loop.
 */
import { json, readBody } from '../lib/http.js';
import { q1, qe } from '../lib/db.js';
import { findOrCreateContactId, createLead, recordEvent } from '../services/crm.js';
import { ConversationRepository, MessageRepository } from '../repositories/conversationRepo.js';
import { startAutomation, processIncomingMessage } from '../services/automation.js';
import { logger } from '../lib/logger.js';

function isBusinessHour(): boolean {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  if (day === 0 || day === 6) return false;
  return hour >= 8 && hour < 18;
}

async function getSetting(key: string): Promise<string | null> {
  return ((await q1(`SELECT value FROM company_settings WHERE key = $1`, [key])) as any)?.value ?? null;
}

export async function webhookHandler(req: any, res: any, url: URL) {
  const path = url.pathname;

  if (path === '/webhook/evolution' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));

    let body: any;
    try { body = await readBody(req); } catch { return; }
    try {
      await handleEvolutionEvent(body);
    } catch (e: any) {
      logger.error('webhook processing failed', { error: String(e?.message || e) });
    }
    return;
  }

  if (path === '/webhook/evolution' && req.method === 'GET') {
    return json(res, 200, { ok: true, endpoint: 'evolution', method: 'POST expected' });
  }

  // GET/POST /webhook/evolution/:instanceId — webhook de instância específica
  const instMatch = path.match(/^\/webhook\/evolution\/([a-zA-Z0-9_]+)$/);
  if (instMatch) {
    if (req.method === 'GET') {
      return json(res, 200, { ok: true, endpoint: 'evolution-instance', instanceId: instMatch[1], method: 'POST expected' });
    }
    if (req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      let body: any;
      try { body = await readBody(req); } catch { return; }
      try {
        body._instanceId = instMatch[1];
        await handleEvolutionEvent(body);
      } catch (e: any) {
        logger.error('webhook multi-instance failed', { instanceId: instMatch[1], error: String(e?.message || e) });
      }
      return;
    }
  }

  return json(res, 404, { error: 'Webhook não encontrado' });
}

async function handleEvolutionEvent(event: any) {
  const eventType = event?.event;
  if (eventType !== 'messages.upsert' && eventType !== 'MESSAGES_UPSERT') return;

  const data = event?.data;
  if (!data) return;
  const msg = data?.message;
  const key = data?.key;
  if (!msg || !key) return;

  // Anti-loop: ignora mensagens enviadas por nós
  if (key?.fromMe) {
    if (key?.id) {
      await qe(`UPDATE whatsapp_messages SET status = COALESCE($1, status) WHERE external_id = $2`, [data?.status || 'sent', key.id]);
    }
    return;
  }

  const remoteJid = key?.remoteJid || '';
  const messageId = key?.id || '';
  const phone = remoteJid.split('@')[0].replace(/\D/g, '');
  const pushName = data?.pushName || '';

  if (!phone) return;

  // Idempotência
  if (messageId && await MessageRepository.findByExternalId(messageId)) {
    logger.debug('duplicate webhook ignored', { messageId });
    return;
  }

  const text = msg?.conversation || msg?.extendedTextMessage?.text || msg?.imageMessage?.caption || msg?.documentMessage?.caption || msg?.videoMessage?.caption || '';
  const mediaType: any = msg?.imageMessage ? 'image' : msg?.videoMessage ? 'video' : msg?.audioMessage ? 'audio' : msg?.documentMessage ? 'document' : 'text';
  const mediaUrl = msg?.imageMessage?.url || msg?.documentMessage?.url || msg?.videoMessage?.url || msg?.audioMessage?.url || null;
  const mime = msg?.imageMessage?.mimetype || msg?.documentMessage?.mimetype || msg?.videoMessage?.mimetype || msg?.audioMessage?.mimetype || null;

  const contactId = await findOrCreateContactId(phone, { name: pushName });

  let conv = await ConversationRepository.findByContactId(contactId);
  if (!conv) {
    const id = await ConversationRepository.insert({ contact_id: contactId, status: 'active', automation_status: 'idle' });
    conv = (await ConversationRepository.findById(id))!;
  }

  let leadId = conv.lead_id;
  if (!leadId) {
    const { lead_id } = await createLead({
      name: pushName || phone, phone, source: 'whatsapp', notes: 'Lead criado via WhatsApp',
    });
    leadId = lead_id;
    await ConversationRepository.update(conv.id, { lead_id });
    await recordEvent({ lead_id: leadId, type: 'whatsapp_started', description: 'Conversa WhatsApp iniciada' });
  }

  await MessageRepository.insert({
    external_id: messageId || null,
    conversation_id: conv.id,
    direction: 'incoming',
    type: mediaType,
    content: text,
    media_url: mediaUrl,
    media_mime: mime,
    status: 'received',
  });

  await ConversationRepository.update(conv.id, {
    last_message_at: new Date().toISOString(),
    unread_count: (conv.unread_count || 0) + 1,
  });

  if (conv.automation_status !== 'paused' && conv.status !== 'human') {
    if (conv.automation_status === 'idle') {
      const offHoursMsg = !isBusinessHour() ? await getSetting('automation_off_hours_message') : null;
      if (offHoursMsg) {
        const { Evolution } = await import('../services/evolution.js');
        try {
          const number = phone.length <= 11 ? `55${phone}` : phone;
          await Evolution.sendText({ number, text: offHoursMsg });
        } catch (e: any) {
          logger.error('failed to send off-hours message', { error: String(e?.message || e) });
        }
      }
      await startAutomation(conv.id);
    } else {
      await processIncomingMessage(conv.id, text);
    }
  }
}
