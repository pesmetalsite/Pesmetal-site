/**
 * WhatsApp Instances Router — CRUD para múltiplos WhatsApps conectados.
 */
import { json, readBody } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { q, q1, qe } from '../lib/db.js';
import { ApiError, asyncHandler } from '../lib/errors.js';

export const instancesRouter = asyncHandler(async (req, res, url) => {
  const user = await authenticate(req);
  if (!user) throw ApiError.unauthorized();
  const path = url.pathname;
  const method = req.method;

  // GET /instances — lista todas instâncias
  if (path === '/instances' && method === 'GET') {
    const rows = await q(`
      SELECT id, name, sender_name, description, phone, instance_name, webhook_url,
             webhook_events, is_default, status, connected_at, error,
             active, created_at, updated_at
      FROM whatsapp_instances WHERE active = 1 ORDER BY is_default DESC, created_at ASC
    `);
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
    const evolutionUrl = body.evolution_api_url || process.env.EVOLUTION_API_URL;
    const evolutionKey = body.evolution_api_key || process.env.EVOLUTION_API_KEY;
    if (!evolutionUrl || !evolutionKey) {
      return json(res, 502, { error: 'Evolution API não configurada' });
    }

    const remote = await fetch(`${evolutionUrl.replace(/\/+$/, '')}/instance/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
      body: JSON.stringify({ instanceName, integration: 'WHATSAPP-BAILEYS', qrcode: true }),
    });
    if (!remote.ok) {
      const detail = await remote.text();
      return json(res, 502, { error: `Evolution API ${remote.status}`, detail });
    }
    await qe(`
      INSERT INTO whatsapp_instances (id, name, sender_name, instance_name, description, phone,
        evolution_api_url, evolution_api_key, is_default, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'disconnected')
    `, [
      id, body.name.trim(), body.sender_name?.trim() || body.name.trim(), instanceName,
      body.description || null, body.phone || null,
      evolutionUrl, evolutionKey,
      body.is_default ? 1 : 0,
    ]);
    return json(res, 201, { id, instance_name: instanceName });
  }

  // GET /instances/:id
  const idMatch = path.match(/^\/instances\/([^\/]+)$/);

  // GET /instances/:id/status — sincroniza o status local com a Evolution
  const statusMatch = path.match(/^\/instances\/([^\/]+)\/status$/);
  if (statusMatch && method === 'GET') {
    const inst = (await q1(`SELECT * FROM whatsapp_instances WHERE id = $1 AND active = 1`, [statusMatch[1]])) as any;
    if (!inst) throw ApiError.notFound('Instancia');
    const baseUrl = inst.evolution_api_url || process.env.EVOLUTION_API_URL;
    const apiKey = inst.evolution_api_key || process.env.EVOLUTION_API_KEY;
    if (!baseUrl || !apiKey) return json(res, 502, { error: 'Evolution API não configurada' });
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/instance/connectionState/${inst.instance_name}`, { headers: { apikey: apiKey } });
    const data: any = await response.json().catch(() => ({}));
    const state = data?.instance?.state || data?.state || 'unknown';
    const status = state === 'open' ? 'connected' : ['connecting', 'qrcode', 'pairing'].includes(state) ? 'connecting' : state === 'close' || state === 'closed' ? 'disconnected' : 'error';
    await qe(`UPDATE whatsapp_instances SET status = $1, connected_at = CASE WHEN $1 = 'connected' THEN COALESCE(connected_at, now()) ELSE connected_at END, error = CASE WHEN $1 = 'error' THEN $2 ELSE NULL END, updated_at = now() WHERE id = $3`, [status, state, inst.id]);
    return json(res, 200, { instance: { ...inst, status, error: status === 'error' ? state : null }, state });
  }

  if (idMatch && method === 'GET') {
    const row = await q1(`
      SELECT id, name, sender_name, description, phone, instance_name, webhook_url,
             webhook_events, is_default, status, connected_at, error,
             active, created_at, updated_at
      FROM whatsapp_instances WHERE id = $1 AND active = 1
    `, [idMatch[1]]);
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
        sets.push(`${k} = $${params.length + 1}`);
        params.push(k === 'is_default' ? (body[k] ? 1 : 0) : body[k]);
      }
    }
    if (!sets.length) return json(res, 200, { ok: true });
    sets.push(`updated_at = now()`);
    params.push(idMatch[1]);
    await qe(`UPDATE whatsapp_instances SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    return json(res, 200, { ok: true });
  }

  // DELETE /instances/:id
  if (idMatch && method === 'DELETE') {
    if (user.role !== 'admin') throw ApiError.forbidden('Apenas admin');
    await qe(`UPDATE whatsapp_instances SET active = 0, updated_at = now() WHERE id = $1`, [idMatch[1]]);
    return json(res, 200, { ok: true });
  }

  // POST /instances/:id/qr — gera QR ou conecta com QR colado
  const qrMatch = path.match(/^\/instances\/([^\/]+)\/qr$/);
  if (qrMatch && method === 'POST') {
    const instId = qrMatch[1];
    const inst = (await q1(`SELECT * FROM whatsapp_instances WHERE id = $1 AND active = 1`, [instId])) as any;
    if (!inst) throw ApiError.notFound('Instancia');

const baseUrl = inst.evolution_api_url || process.env.EVOLUTION_API_URL;
    const apiKey = inst.evolution_api_key || process.env.EVOLUTION_API_KEY;
    if (!baseUrl || !apiKey) {
      return json(res, 502, { error: 'Evolution API nao configurada para esta instancia' });
    }

    {
      const body = await readBody(req);

      // Se QR foi colado, conecta diretamente
      if (body?.qr) {
        const resp = await fetch(`${baseUrl}/instance/connect/${inst.instance_name}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', apikey: apiKey },
        }).then(r => r.json()).catch(() => ({}));
        await qe(`UPDATE whatsapp_instances SET status = 'connecting', updated_at = now() WHERE id = $1`, [instId]);
        return json(res, 200, { ok: true, status: 'connecting', message: 'QR Code aplicado. Aguarde conexão.' });
      }

      // Gera novo QR via Evolution API
      const stateResponse: any = await fetch(`${baseUrl}/instance/connectionState/${inst.instance_name}`, {
        headers: { apikey: apiKey },
      }).then(r => r.json()).catch(() => ({}));
      const state = {
        state: stateResponse?.instance?.state ?? stateResponse?.state ?? 'unknown',
        instance: inst.instance_name,
      };
      if (state.state === 'open') {
        await qe(`UPDATE whatsapp_instances SET status = 'connected', connected_at = now(), updated_at = now() WHERE id = $1`, [instId]);
        return json(res, 200, { status: 'connected', state });
      }
      const resp = await fetch(`${baseUrl}/instance/connect/${inst.instance_name}`, {
        method: 'GET',
        headers: { apikey: apiKey },
      }).then(r => r.json()) as any;
      const rawQr = resp?.qrcode ?? resp?.qr ?? resp?.base64 ?? null;
      const qr = Array.isArray(rawQr)
        ? rawQr[0]
        : typeof rawQr === 'object'
          ? rawQr?.base64 ?? rawQr?.qr ?? rawQr?.code ?? null
          : rawQr;
      const expires = qr ? new Date(Date.now() + 60000).toISOString() : null;
      if (qr) {
        await qe(`UPDATE whatsapp_instances SET qr_code_base64 = $1, qr_expires_at = $2, status = 'connecting', updated_at = now() WHERE id = $3`,
          [qr, expires, instId]);
      }
      return json(res, 200, { qr, pairingCode: resp?.pairingCode || resp?.code || null, status: qr ? 'connecting' : 'waiting', state });
    }
  }

  // POST /instances/:id/webhook
  const webhookMatch = path.match(/^\/instances\/([^\/]+)\/webhook$/);
  if (webhookMatch && method === 'POST') {
    const instId = webhookMatch[1];
    const inst = (await q1(`SELECT * FROM whatsapp_instances WHERE id = $1 AND active = 1`, [instId])) as any;
    if (!inst) throw ApiError.notFound('Instancia');

const baseUrl = inst.evolution_api_url || process.env.EVOLUTION_API_URL;
    const apiKey = inst.evolution_api_key || process.env.EVOLUTION_API_KEY;
    if (!baseUrl || !apiKey) {
      return json(res, 502, { error: 'Evolution API nao configurada' });
    }

    const apiBase = process.env.API_BASE_URL || `https://lucid-contentment-production-17bc.up.railway.app`;
    const webhookUrl = `${apiBase}/webhook/evolution`;
    const resp = await fetch(`${baseUrl}/webhook/set/${inst.instance_name}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, webhook_by_events: false, events: ['messages.upsert', 'connection.update'], enabled: true }),
    });
    if (!resp.ok) {
      return json(res, 502, { error: `Evolution API ${resp.status}`, detail: (await resp.text()).slice(0, 300) });
    }
    await qe(`UPDATE whatsapp_instances SET webhook_url = $1, updated_at = now() WHERE id = $2`, [webhookUrl, instId]);
    return json(res, 200, { ok: true, webhookUrl });
  }

  throw ApiError.notFound('Endpoint instances');
});
