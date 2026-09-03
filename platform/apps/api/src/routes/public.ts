/**
 * Public Router — endpoints consumidos pelo site institucional (sem auth).
 */
import { json, readBody } from '../lib/http.js';
import { db } from '../lib/db.js';
import { createLead } from '../services/crm.js';
import { ServiceRepository, ProjectRepository } from '../repositories/miscRepos.js';
import { upsertTrackingSession, recordMarketingEvent, type TrackingPayload } from '../lib/tracking.js';
import { PublicLeadSchema, PublicTrackSchema, parseBody } from '../lib/validators.js';
import { asyncHandler } from '../lib/errors.js';

function getSetting(key: string): string | null {
  return (db.prepare(`SELECT value FROM company_settings WHERE key = ?`).get(key) as any)?.value ?? null;
}

function getCompany() {
  const rows = db.prepare(`SELECT key, value FROM company_settings`).all() as any[];
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function getPixel() {
  const row = (key: string) => (db.prepare(`SELECT value FROM integration_settings WHERE key = ?`).get(key) as any)?.value ?? '';
  return {
    pixelId: row('meta_pixel_id'),
    gaId: row('google_analytics_id'),
    gtmId: row('gtm_id'),
  };
}

function deserialize(p: any) {
  return { ...p, images: p.images ? JSON.parse(p.images) : [] };
}

export const publicRouter = asyncHandler(async (req, res, url) => {
  const path = url.pathname;
  const method = req.method;

  if (path === '/public/services' && method === 'GET') return json(res, 200, { services: ServiceRepository.list(true) });
  if (path === '/public/projects' && method === 'GET') return json(res, 200, { projects: ProjectRepository.list(true).map(deserialize) });
  if (path === '/public/company' && method === 'GET') return json(res, 200, { company: getCompany() });
  if (path === '/public/pixel' && method === 'GET') return json(res, 200, getPixel());

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
    const sessionId = upsertTrackingSession(sessionToken, tracking);

    let service_id = body.service_id;
    if (!service_id && body.service_slug) {
      const svc = ServiceRepository.findBySlug(body.service_slug);
      service_id = svc?.id;
    }

    const { lead_id, contact_id, is_new } = createLead({
      ...body, source: 'site_form',
      tracking: { ...tracking, id: sessionId } as any,
    });

    recordMarketingEvent({
      type: 'lead',
      lead_id, contact_id,
      tracking_session_id: sessionId,
      source: 'site_form',
      payload: { service: body.service_slug },
    });

    return json(res, is_new ? 201 : 200, { ok: true, lead_id, message: getSetting('whatsapp_default_message') || 'Solicitação recebida. Nossa equipe entrará em contato em breve.' });
  }

  if (path === '/public/track' && method === 'POST') {
    const body = parseBody(PublicTrackSchema, await readBody(req));
    const sessionToken = body.session_token || (req.headers['x-session-token'] as string);
    let sessionId: string | undefined;
    if (sessionToken) {
      sessionId = upsertTrackingSession(sessionToken, {
        utm_source: body.utm_source, utm_medium: body.utm_medium, utm_campaign: body.utm_campaign,
        utm_content: body.utm_content, utm_term: body.utm_term, fbclid: body.fbclid, gclid: body.gclid,
        referrer: body.referrer, landing_page: body.landing_page,
        user_agent: req.headers['user-agent'] as string,
      });
    }
    recordMarketingEvent({
      type: body.event, tracking_session_id: sessionId, source: body.source || 'site', payload: body.payload,
    });
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: 'Endpoint público não encontrado' });
});
