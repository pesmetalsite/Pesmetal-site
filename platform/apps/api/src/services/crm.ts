/**
 * CRM Service — regras de negócio de leads.
 * Usa LeadRepository e ContactRepository.
 */
import { LeadRepository, type LeadRow, type LeadStatus } from '../repositories/leadRepo.js';
import { ContactRepository } from '../repositories/contactRepo.js';
import { StageRepository } from '../repositories/stageRepo.js';
import { LeadEventRepository } from '../repositories/miscRepos.js';
import { upsertTrackingSession, recordMarketingEvent, deriveSourceLabel, type TrackingPayload } from '../lib/tracking.js';
import { logger } from '../lib/logger.js';

export interface CreateLeadInput {
  name: string;
  phone: string;
  email?: string;
  company?: string;
  service_id?: string;
  description?: string;
  quantity?: string;
  deadline?: string;
  notes?: string;
  source?: string;
  tracking?: TrackingPayload;
  initial_message?: string;
}

export function findOrCreateContactId(phone: string, data?: Partial<{ name: string; email: string; company: string }>): string {
  let contact = ContactRepository.findByPhone(phone);
  if (contact) {
    if (data && Object.values(data).some(Boolean)) {
      ContactRepository.update(contact.id, {
        name: data.name ?? contact.name ?? undefined,
        email: data.email ?? contact.email ?? undefined,
        company: data.company ?? contact.company ?? undefined,
      });
    }
    return contact.id;
  }
  return ContactRepository.insert({ phone: phone.replace(/\D/g, ''), ...data });
}

export function recordEvent(input: { lead_id?: string | null; user_id?: string | null; type: string; payload?: any; description?: string }) {
  if (!input.lead_id) return;
  LeadEventRepository.insert({
    lead_id: input.lead_id,
    user_id: input.user_id ?? undefined,
    type: input.type,
    payload: input.payload,
    description: input.description,
  });
}

export function createLead(input: CreateLeadInput): { lead_id: string; contact_id: string; is_new: boolean } {
  const contactId = findOrCreateContactId(input.phone, { name: input.name, email: input.email, company: input.company });

  // Não duplica lead ativo para o mesmo contato
  const existing = LeadRepository.findActiveByContactId(contactId);
  if (existing) {
    logger.info('lead already exists, returning', { lead_id: existing.id, contact_id: contactId });
    return { lead_id: existing.id, contact_id: contactId, is_new: false };
  }

  const tracking = input.tracking ?? {};
  const src = deriveSourceLabel(tracking);
  const initialStage = StageRepository.findInitial();

  const leadId = LeadRepository.insert({
    contact_id: contactId,
    stage_id: initialStage?.id ?? null,
    service_id: input.service_id ?? null,
    name: input.name,
    company: input.company ?? null,
    email: input.email ?? null,
    phone: input.phone,
    description: input.description ?? null,
    quantity: input.quantity ?? null,
    deadline: input.deadline ?? null,
    notes: input.notes ?? null,
    source: input.source ?? src.source,
    origin: input.source ?? src.source,
    campaign: src.campaign ?? tracking.utm_campaign ?? null,
    adset: src.adset ?? tracking.utm_content ?? null,
    ad_name: src.ad_name ?? tracking.utm_term ?? null,
    landing_page: tracking.landing_page ?? null,
    referrer: tracking.referrer ?? null,
    utm_source: tracking.utm_source ?? null,
    utm_medium: tracking.utm_medium ?? null,
    utm_campaign: tracking.utm_campaign ?? null,
    utm_content: tracking.utm_content ?? null,
    utm_term: tracking.utm_term ?? null,
    fbclid: tracking.fbclid ?? null,
    gclid: tracking.gclid ?? null,
    tracking_session_id: (tracking as any).id ?? null,
  });

  recordEvent({
    lead_id: leadId,
    type: 'lead_created',
    payload: { source: input.source ?? src.source, campaign: src.campaign },
    description: `Lead criado${input.source ? ` via ${input.source}` : ''}`,
  });

  logger.info('lead created', { lead_id: leadId, source: input.source ?? src.source });
  return { lead_id: leadId, contact_id: contactId, is_new: true };
}

export function moveLead(leadId: string, stageId: string, userId?: string | null): boolean {
  const lead = LeadRepository.findById(leadId);
  if (!lead) return false;
  if (lead.stage_id === stageId) return true;

  const newStage = StageRepository.findById(stageId);
  if (!newStage) return false;

  LeadRepository.updateFields(leadId, { stage_id: stageId });

  // Atualiza status baseado na etapa
  let newStatus: LeadStatus = lead.status;
  if (newStage.is_won) newStatus = 'won';
  else if (newStage.is_lost) newStatus = 'lost';
  if (newStatus !== lead.status) {
    LeadRepository.updateFields(leadId, { status: newStatus });
    recordEvent({
      lead_id: leadId,
      user_id: userId,
      type: newStatus === 'won' ? 'deal_won' : 'deal_lost',
      description: newStatus === 'won' ? 'Negócio fechado' : 'Negócio perdido',
    });
  }

  recordEvent({
    lead_id: leadId,
    user_id: userId,
    type: 'stage_changed',
    payload: { from: lead.stage_id, to: stageId },
    description: `Movido para ${newStage.name}`,
  });

  return true;
}

export function getLeadFull(leadId: string) {
  const lead = LeadRepository.findFull(leadId);
  if (!lead) return null;
  const events = LeadEventRepository.listByLead(leadId);
  const stage = lead.stage_id ? StageRepository.findById(lead.stage_id) : null;
  return { ...lead, stage, events };
}

export function listLeads(filter: Parameters<typeof LeadRepository.list>[0] = {}) {
  return LeadRepository.list(filter);
}

export function deleteLead(leadId: string) {
  LeadRepository.delete(leadId);
}
