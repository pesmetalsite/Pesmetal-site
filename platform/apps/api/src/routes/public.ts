/**
 * Public Router — endpoints consumidos pelo site institucional (sem auth).
 */
import { json, readBody } from '../lib/http.js';
import { q, q1 } from '../lib/db.js';
import { createLead } from '../services/crm.js';
import { ServiceRepository, ProjectRepository } from '../repositories/miscRepos.js';
import { upsertTrackingSession, recordMarketingEvent, type TrackingPayload } from '../lib/tracking.js';
import { PublicLeadSchema, PublicTrackSchema, parseBody } from '../lib/validators.js';
import { asyncHandler } from '../lib/errors.js';

async function getSetting(key: string): Promise<string | null> {
  return ((await q1(`SELECT value FROM company_settings WHERE key = $1`, [key])) as any)?.value ?? null;
}

async function getCompany() {
  const rows = (await q(`SELECT key, value FROM company_settings`)) as any[];
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

async function getPixel() {
  const row = async (key: string) => (await q1(`SELECT value FROM integration_settings WHERE key = $1`, [key]))?.value ?? '';
  return {
    pixelId: await row('meta_pixel_id'),
    gaId: await row('google_analytics_id'),
    gtmId: await row('gtm_id'),
  };
}

function deserialize(p: any) {
  return { ...p, images: p.images ? JSON.parse(p.images) : [] };
}

export const publicRouter = asyncHandler(async (req, res, url) => {
  const path = url.pathname;
  const method = req.method;

  if (path === '/public/services' && method === 'GET') return json(res, 200, { services: await ServiceRepository.list(true) });
  if (path === '/public/projects' && method === 'GET') return json(res, 200, { projects: (await ProjectRepository.list(true)).map(deserialize) });
  if (path === '/public/company' && method === 'GET') return json(res, 200, { company: await getCompany() });
  if (path === '/public/pixel' && method === 'GET') return json(res, 200, await getPixel());

  if (path === '/public/leads' && method === 'POST') {
    const body = parseBody(PublicLeadSchema, await readBody(req));
    const sessionToken = body.session_token || (req.headers['x-session-token'] as string) || `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const tracking: TrackingPayload = {
      utm_source: body.utm_source, utm_medium: body.utm_medium, utm_campaign: body.utm_campaign,
      utm_content: body.utm_content, utm_term: body.utm_term, fbclid: body.fbclid, gclid: body.gclid,
      referrer: body.referrer, landing_page: body.landing_page,
      user_agent: req.headers['user-agent'] as string,
      ip: (req.headers['x-forwarded-for'] as string || req.socket?.remoteAddress || '').split(',')[0],
    };
    const sessionId = await upsertTrackingSession(sessionToken, tracking);

    let service_id = body.service_id;
    if (!service_id && body.service_slug) {
      const svc = await ServiceRepository.findBySlug(body.service_slug);
      service_id = svc?.id;
    }
    if (!service_id && body.service) {
      const svc = await ServiceRepository.findByName(body.service);
      service_id = svc?.id;
    }

    const { lead_id, contact_id, is_new } = await createLead({
      ...body, service_id, source: 'site_form',
      tracking: { ...tracking, id: sessionId } as any,
    });

    await recordMarketingEvent({
      type: 'lead',
      lead_id, contact_id,
      tracking_session_id: sessionId,
      source: 'site_form',
      payload: { service: body.service_slug },
    });

    return json(res, is_new ? 201 : 200, { ok: true, lead_id, message: (await getSetting('whatsapp_default_message')) || 'Solicitação recebida. Nossa equipe entrará em contato em breve.' });
  }

  if (path === '/public/track' && method === 'POST') {
    const body = parseBody(PublicTrackSchema, await readBody(req));
    const sessionToken = body.session_token || (req.headers['x-session-token'] as string);
    let sessionId: string | undefined;
    if (sessionToken) {
      sessionId = await upsertTrackingSession(sessionToken, {
        utm_source: body.utm_source, utm_medium: body.utm_medium, utm_campaign: body.utm_campaign,
        utm_content: body.utm_content, utm_term: body.utm_term, fbclid: body.fbclid, gclid: body.gclid,
        referrer: body.referrer, landing_page: body.landing_page,
        user_agent: req.headers['user-agent'] as string,
      });
    }
    await recordMarketingEvent({
      type: body.event, tracking_session_id: sessionId, source: body.source || 'site', payload: body.payload,
    });
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: 'Endpoint público não encontrado' });
});
