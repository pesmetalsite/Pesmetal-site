/**
 * Webhook da Evolution API — refatorado com idempotência + anti-loop.
 */
import { json, readBody } from '../lib/http.js';
import { q1, qe } from '../lib/db.js';
import { findOrCreateContactId, createLead, recordEvent } from '../services/crm.js';
import { ConversationRepository, MessageRepository } from '../repositories/conversationRepo.js';
import { startAutomation, processIncomingMessage } from '../services/automation.js';
import { createNotification } from '../services/notifications.js';
import { logger } from '../lib/logger.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import crypto from 'node:crypto';

/** Verifica assinatura HMAC do webhook da Evolution API. */
function verifyWebhookSignature(req: any, rawBody: string): boolean {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!secret) {
    // Em produção, secret é obrigatório. Em dev, aceita sem verificação.
    return process.env.NODE_ENV !== 'production';
  }
  const signature = req.headers['x-evolution-signature'] || req.headers['x-webhook-signature'];
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

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

/** Resolve o nome da instância Evolution para envios (multi-instância). */
async function resolveInstanceName(instanceId?: string): Promise<string | undefined> {
  if (instanceId) {
    const inst = (await q1(`SELECT instance_name FROM whatsapp_instances WHERE id = $1 AND active = 1`, [instanceId])) as any;
    if (inst?.instance_name) return inst.instance_name;
  }
  const def = (await q1(`SELECT instance_name FROM whatsapp_instances WHERE active = 1 AND is_default = 1 ORDER BY created_at ASC LIMIT 1`)) as any;
  if (def?.instance_name) return def.instance_name;
  return process.env.EVOLUTION_INSTANCE || undefined;
}

async function resolveInstanceId(value?: string): Promise<string | undefined> {
  if (!value) return undefined;
  const inst = (await q1(`SELECT id FROM whatsapp_instances WHERE active = 1 AND (id = $1 OR instance_name = $1) LIMIT 1`, [value])) as any;
  return inst?.id;
}

export async function webhookHandler(req: any, res: any, url: URL) {
  const path = url.pathname;

  if (path === '/webhook/evolution' && req.method === 'POST') {
    // Rate limit: 200 webhooks/min por IP
    const rl = checkRateLimit(req, { windowMs: 60_000, max: 200 });
    if (!rl.allowed) {
      return json(res, 429, { error: 'Too many requests' });
    }

    // Lê raw body para verificação de assinatura
    let rawBody = '';
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    rawBody = Buffer.concat(chunks).toString('utf8');

    if (!verifyWebhookSignature(req, rawBody)) {
      logger.warn('webhook signature invalid', { ip: req.socket?.remoteAddress });
      return json(res, 401, { error: 'Invalid signature' });
    }

    let body: any;
    try { body = rawBody ? JSON.parse(rawBody) : {}; } catch {
      return json(res, 400, { error: 'Invalid JSON' });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));

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

  // Ignora grupos
  if (remoteJid.endsWith('@g.us')) {
    logger.debug('group message ignored', { remoteJid });
    return;
  }

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
  const instanceHint = event?._instanceId || event?.instance || event?.instanceName || data?.instance;
  const instanceId = await resolveInstanceId(instanceHint);
  const instanceName = await resolveInstanceName(instanceId || instanceHint);

  let conv = await ConversationRepository.findByContactId(contactId, instanceId);

  // Determina se é uma conversa NOVA (primeira mensagem)
  const isNewConversation = !conv;

  if (!conv) {
    const id = await ConversationRepository.insert({ contact_id: contactId, instance_id: instanceId, status: 'active', automation_status: 'idle' });
    conv = (await ConversationRepository.findById(id))!;
  }

  // Salva a mensagem primeiro
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

  // Cria lead se não existir
  let leadId = conv.lead_id;
  if (!leadId) {
    const { lead_id } = await createLead({
      name: pushName || phone, phone, source: 'whatsapp', notes: 'Lead criado via WhatsApp',
    });
    leadId = lead_id;
    await ConversationRepository.update(conv.id, { lead_id });
    await recordEvent({ lead_id: leadId, type: 'whatsapp_started', description: 'Conversa WhatsApp iniciada' });
  }

  // Atualiza última atividade do lead
  if (leadId) {
    await qe(`UPDATE leads SET last_activity_at = now(), updated_at = now() WHERE id = $1`, [leadId]);
  }

  // Obtém dados do contato para notificações
  const contact = (await q1(`SELECT * FROM contacts WHERE id = $1`, [contactId])) as any;
  const displayName = contact?.custom_name || contact?.name || pushName || phone;

  // Notificação popup para NOVA mensagem (sempre mostra, exceto se for lead novo)
  if (!isNewConversation && leadId) {
    // Truncar preview para 80 caracteres
    let preview = text;
    if (preview.length > 80) {
      preview = preview.slice(0, 80) + '...';
    } else if (!preview) {
      preview = mediaType === 'image' ? '📷 Enviou uma imagem'
               : mediaType === 'video' ? '🎥 Enviou um vídeo'
               : mediaType === 'audio' ? '🎤 Enviou um áudio'
               : mediaType === 'document' ? '📎 Enviou um documento'
               : 'Enviou uma mensagem';
    }

    await createNotification({
      type: 'new_message_popup',
      title: `Nova mensagem de ${displayName}`,
      body: preview,
      data: { conversation_id: conv.id, lead_id: leadId, message_id: messageId, phone, contact_id: contactId },
      leadId,
    });
  }

  // Só inicia automação para NOVAS conversas e se não tiver no_automation
  if (isNewConversation) {
    // Verifica se contato tem automação desabilitada
    if (contact?.no_automation) {
      logger.info('automation skipped: contact has no_automation flag', { phone, contactId });
    } else if (conv.automation_status !== 'paused' && conv.status !== 'human') {
      if (conv.automation_status === 'idle') {
        const offHoursMsg = !isBusinessHour() ? await getSetting('automation_off_hours_message') : null;
        if (offHoursMsg) {
          const { Evolution } = await import('../services/evolution.js');
          try {
            const number = phone.length <= 11 ? `55${phone}` : phone;
            await Evolution.sendText({ number, text: offHoursMsg, instanceName });
          } catch (e: any) {
            logger.error('failed to send off-hours message', { error: String(e?.message || e) });
          }
        }
        await startAutomation(conv.id, undefined, instanceName);
      } else {
        await processIncomingMessage(conv.id, text, instanceName);
      }
    }
  }
}
