/**
 * WhatsApp Instances Router — CRUD para múltiplos WhatsApps conectados.
 */
import { json, readBody } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { ApiError, asyncHandler } from '../lib/errors.js';

export const instancesRouter = asyncHandler(async (req, res, url) => {
  const user = await authenticate(req);
  if (!user) throw ApiError.unauthorized();
  const path = url.pathname;
  const method = req.method;

  // GET /instances — lista todas instâncias
  if (path === '/instances' && method === 'GET') {
    const rows = db.prepare(`
      SELECT id, name, sender_name, description, phone, instance_name, webhook_url,
             webhook_events, is_default, status, connected_at, error,
             active, created_at, updated_at
      FROM whatsapp_instances WHERE active = 1 ORDER BY is_default DESC, created_at ASC
    `).all();
    return json(res, 200, { instances: rows });
  }

  // POST /instances — cria instância
  if (path === '/instances' && method === 'POST') {
    if (user.role === 'atendente') throw ApiError.forbidden();
    const body = await readBody(req);
    if (!body.name?.trim()) {
      throw ApiError.validation('name e obrigatorio');
    }
    const instanceName = body.instance_name?.trim() || body.name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + crypto.randomUUID().slice(0, 8);
    const id = `inst_${crypto.randomUUID().slice(0, 16)}`;
    db.prepare(`
      INSERT INTO whatsapp_instances (id, name, sender_name, instance_name, description, phone,
        evolution_api_url, evolution_api_key, is_default, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'disconnected')
    `).run(
      id, body.name.trim(), body.sender_name?.trim() || body.name.trim(), instanceName,
      body.description || null, body.phone || null,
      body.evolution_api_url || process.env.EVOLUTION_API_URL || null,
      body.evolution_api_key || process.env.EVOLUTION_API_KEY || null,
      body.is_default ? 1 : 0,
    );
    return json(res, 201, { id, instance_name: instanceName });
  }

  // GET /instances/:id
  const idMatch = path.match(/^\/instances\/([^\/]+)$/);
  if (idMatch && method === 'GET') {
    const row = db.prepare(`
      SELECT id, name, sender_name, description, phone, instance_name, webhook_url,
             webhook_events, is_default, status, connected_at, error,
             active, created_at, updated_at
      FROM whatsapp_instances WHERE id = ? AND active = 1
    `).get(idMatch[1]);
    if (!row) throw ApiError.notFound('Instancia');
    return json(res, 200, { instance: row });
  }

  // PUT /instances/:id
  if (idMatch && method === 'PUT') {
    if (user.role === 'atendente') throw ApiError.forbidden();
    const body = await readBody(req);
    const allowed = ['name', 'sender_name', 'description', 'phone', 'is_default', 'status',
                     'qr_code_base64', 'qr_expires_at', 'connected_at', 'error'];
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (k in body) {
        sets.push(`${k} = ?`);
        params.push(k === 'is_default' ? (body[k] ? 1 : 0) : body[k]);
      }
    }
    if (!sets.length) return json(res, 200, { ok: true });
    sets.push(`updated_at = datetime('now')`);
    params.push(idMatch[1]);
    db.prepare(`UPDATE whatsapp_instances SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return json(res, 200, { ok: true });
  }

  // DELETE /instances/:id
  if (idMatch && method === 'DELETE') {
    if (user.role !== 'admin') throw ApiError.forbidden('Apenas admin');
    db.prepare(`UPDATE whatsapp_instances SET active = 0, updated_at = datetime('now') WHERE id = ?`).run(idMatch[1]);
    return json(res, 200, { ok: true });
  }

  // POST /instances/:id/qr — gera QR ou conecta com QR colado
  const qrMatch = path.match(/^\/instances\/([^\/]+)\/qr$/);
  if (qrMatch && method === 'POST') {
    const instId = qrMatch[1];
    const inst = db.prepare(`SELECT * FROM whatsapp_instances WHERE id = ? AND active = 1`).get(instId) as any;
    if (!inst) throw ApiError.notFound('Instancia');

    const baseUrl = inst.evolution_api_url || process.env.EVOLUTION_API_URL;
    const apiKey = inst.evolution_api_key || process.env.EVOLUTION_API_KEY;
    if (!baseUrl || !apiKey) {
      return json(res, 502, { error: 'Evolution API nao configurada para esta instancia' });
    }

    const origUrl = process.env.EVOLUTION_API_URL;
    const origKey = process.env.EVOLUTION_API_KEY;
    process.env.EVOLUTION_API_URL = baseUrl;
    process.env.EVOLUTION_API_KEY = apiKey;
    try {
      const body = await readBody(req);

      // Se QR foi colado, conecta diretamente
      if (body?.qr) {
        const resp = await fetch(`${baseUrl}/instance/connect/${inst.instance_name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: apiKey },
          body: JSON.stringify({ qrcode: body.qr }),
        }).then(r => r.json()).catch(() => ({}));
        db.prepare(`UPDATE whatsapp_instances SET status = 'connecting', updated_at = datetime('now') WHERE id = ?`).run(instId);
        return json(res, 200, { ok: true, status: 'connecting', message: 'QR Code aplicado. Aguarde conexão.' });
      }

      // Gera novo QR via Evolution API
      const { Evolution } = await import('../services/evolution.js');
      const state = await Evolution.getConnectionState();
      if (state.state === 'open') {
        db.prepare(`UPDATE whatsapp_instances SET status = 'connected', connected_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(instId);
        return json(res, 200, { status: 'connected', state });
      }
      const resp = await fetch(`${baseUrl}/instance/connect/${inst.instance_name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ webhookUrl: inst.webhook_url || '' }),
      }).then(r => r.json());
      const qr = resp?.qrcode?.[0] || resp?.base64 || null;
      const expires = qr ? new Date(Date.now() + 60000).toISOString() : null;
      if (qr) {
        db.prepare(`UPDATE whatsapp_instances SET qr_code_base64 = ?, qr_expires_at = ?, status = 'connecting', updated_at = datetime('now') WHERE id = ?`)
          .run(qr, expires, instId);
      }
      return json(res, 200, { qr, pairingCode: resp?.pairingCode || null, status: 'connecting' });
    } finally {
      process.env.EVOLUTION_API_URL = origUrl;
      process.env.EVOLUTION_API_KEY = origKey;
    }
  }

  // POST /instances/:id/webhook
  const webhookMatch = path.match(/^\/instances\/([^\/]+)\/webhook$/);
  if (webhookMatch && method === 'POST') {
    const instId = webhookMatch[1];
    const inst = db.prepare(`SELECT * FROM whatsapp_instances WHERE id = ? AND active = 1`).get(instId) as any;
    if (!inst) throw ApiError.notFound('Instancia');

    const baseUrl = inst.evolution_api_url || process.env.EVOLUTION_API_URL;
    const apiKey = inst.evolution_api_key || process.env.EVOLUTION_API_KEY;
    if (!baseUrl || !apiKey) {
      return json(res, 502, { error: 'Evolution API nao configurada' });
    }

    const origUrl = process.env.EVOLUTION_API_URL;
    const origKey = process.env.EVOLUTION_API_KEY;
    process.env.EVOLUTION_API_URL = baseUrl;
    process.env.EVOLUTION_API_KEY = apiKey;
    try {
      const { Evolution } = await import('../services/evolution.js');
      const apiBase = process.env.API_BASE_URL || `https://lucid-contentment-production-17bc.up.railway.app`;
      const webhookUrl = `${apiBase}/webhook/evolution/${instId}`;
      await Evolution.setWebhook({ url: webhookUrl, events: ['messages.upsert', 'connection.update'] });
      db.prepare(`UPDATE whatsapp_instances SET webhook_url = ?, updated_at = datetime('now') WHERE id = ?`).run(webhookUrl, instId);
      return json(res, 200, { ok: true, webhookUrl });
    } finally {
      process.env.EVOLUTION_API_URL = origUrl;
      process.env.EVOLUTION_API_KEY = origKey;
    }
  }

  throw ApiError.notFound('Endpoint instances');
});
