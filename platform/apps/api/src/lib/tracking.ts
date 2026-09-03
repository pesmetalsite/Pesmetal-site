/**
 * Tracking Service — captura UTMs, fbclid, gclid e associa a leads.
 */
import { db } from './db.js';
import { nanoid } from 'nanoid';

export interface TrackingPayload {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  gclid?: string;
  referrer?: string;
  landing_page?: string;
  user_agent?: string;
  ip?: string;
}

export function upsertTrackingSession(token: string, data: TrackingPayload) {
  const existing = db.prepare('SELECT id FROM tracking_sessions WHERE session_token = ?').get(token) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = nanoid();
  db.prepare(`
    INSERT INTO tracking_sessions (
      id, session_token, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      fbclid, gclid, referrer, landing_page, user_agent, ip
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, token,
    data.utm_source ?? null, data.utm_medium ?? null, data.utm_campaign ?? null,
    data.utm_content ?? null, data.utm_term ?? null, data.fbclid ?? null,
    data.gclid ?? null, data.referrer ?? null, data.landing_page ?? null,
    data.user_agent ?? null, data.ip ?? null
  );
  return id;
}

export function getTrackingSession(id: string) {
  return db.prepare('SELECT * FROM tracking_sessions WHERE id = ?').get(id);
}

export function recordMarketingEvent(payload: {
  type: string;
  lead_id?: string;
  contact_id?: string;
  tracking_session_id?: string;
  source?: string;
  payload?: any;
}) {
  const id = nanoid();
  db.prepare(`
    INSERT INTO marketing_events (id, type, lead_id, contact_id, tracking_session_id, payload, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    payload.type,
    payload.lead_id ?? null,
    payload.contact_id ?? null,
    payload.tracking_session_id ?? null,
    payload.payload ? JSON.stringify(payload.payload) : null,
    payload.source ?? null
  );
  return id;
}

export function deriveSourceLabel(t: TrackingPayload | any): { source: string; campaign?: string; adset?: string; ad_name?: string } {
  const utm = (t.utm_source || '').toLowerCase();
  if (utm.includes('facebook') || utm.includes('fb') || t.fbclid) {
    return {
      source: 'meta_ads',
      campaign: t.utm_campaign,
      adset: t.utm_content,
      ad_name: t.utm_term,
    };
  }
  if (utm.includes('google') || t.gclid) {
    return {
      source: 'google_ads',
      campaign: t.utm_campaign,
      adset: t.utm_content,
      ad_name: t.utm_term,
    };
  }
  if (utm.includes('instagram')) return { source: 'instagram', campaign: t.utm_campaign };
  if (utm.includes('whatsapp')) return { source: 'whatsapp' };
  if (utm) return { source: utm, campaign: t.utm_campaign };
  return { source: 'site' };
}
