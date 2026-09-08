/**
 * Lead Repository — única camada que toca a tabela `leads`.
 * Recebe parâmetros, retorna objetos tipados. Zero regras de negócio aqui.
 */
import { q, q1, qe } from '../lib/db.js';

export type LeadStatus = 'active' | 'won' | 'lost' | 'archived';
export type LeadPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface LeadRow {
  id: string;
  contact_id: string;
  stage_id: string | null;
  service_id: string | null;
  assigned_user_id: string | null;
  name: string;
  company: string | null;
  email: string | null;
  phone: string;
  interest: string | null;
  priority: LeadPriority;
  estimated_value: number;
  status: LeadStatus;
  source: string | null;
  origin: string | null;
  campaign: string | null;
  adset: string | null;
  ad_name: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  landing_page: string | null;
  referrer: string | null;
  tracking_session_id: string | null;
  description: string | null;
  quantity: string | null;
  deadline: string | null;
  notes: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadWithRelations extends LeadRow {
  stage_name?: string;
  stage_color?: string;
  service_name?: string;
  assigned_name?: string;
}

export const LeadRepository = {
  async insert(data: Partial<LeadRow> & Pick<LeadRow, 'name' | 'phone' | 'contact_id'>): Promise<string> {
    const id = data.id || crypto.randomUUID().replace(/-/g, '').slice(0, 21);
    await qe(`
      INSERT INTO leads (
        id, contact_id, stage_id, service_id, assigned_user_id,
        name, company, email, phone, interest, priority, estimated_value, status,
        source, origin, campaign, adset, ad_name,
        landing_page, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        fbclid, gclid, tracking_session_id,
        description, quantity, deadline, notes
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25,
        $26, $27, $28,
        $29, $30, $31, $32
      )
    `, [
      id, data.contact_id, data.stage_id ?? null, data.service_id ?? null, data.assigned_user_id ?? null,
      data.name, data.company ?? null, data.email ?? null, data.phone, data.interest ?? null,
      data.priority ?? 'medium', data.estimated_value ?? 0, data.status ?? 'active',
      data.source ?? null, data.origin ?? null, data.campaign ?? null, data.adset ?? null, data.ad_name ?? null,
      data.landing_page ?? null, data.referrer ?? null,
      data.utm_source ?? null, data.utm_medium ?? null, data.utm_campaign ?? null,
      data.utm_content ?? null, data.utm_term ?? null,
      data.fbclid ?? null, data.gclid ?? null, data.tracking_session_id ?? null,
      data.description ?? null, data.quantity ?? null, data.deadline ?? null, data.notes ?? null,
    ]);
    return id;
  },

  async findActiveByContactId(contactId: string): Promise<LeadRow | undefined> {
    return (await q1(`SELECT * FROM leads WHERE contact_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`, [contactId])) as LeadRow | undefined;
  },

  async findById(id: string): Promise<LeadRow | undefined> {
    return (await q1(`SELECT * FROM leads WHERE id = $1`, [id])) as LeadRow | undefined;
  },

  async findFull(id: string): Promise<any> {
    return (await q1(`
      SELECT l.*, c.phone as contact_phone, c.whatsapp_id, c.tags
      FROM leads l JOIN contacts c ON c.id = l.contact_id
      WHERE l.id = $1
    `, [id]));
  },

  async list(filter: {
    stage_id?: string;
    service_id?: string;
    source?: string;
    assigned_user_id?: string;
    status?: LeadStatus;
    search?: string;
    date_from?: string;
    date_to?: string;
  } = {}): Promise<LeadWithRelations[]> {
    const where: string[] = ['1=1'];
    const params: any[] = [];
    if (filter.stage_id) { where.push(`l.stage_id = $${params.length + 1}`); params.push(filter.stage_id); }
    if (filter.service_id) { where.push(`l.service_id = $${params.length + 1}`); params.push(filter.service_id); }
    if (filter.source) { where.push(`l.source = $${params.length + 1}`); params.push(filter.source); }
    if (filter.assigned_user_id) { where.push(`l.assigned_user_id = $${params.length + 1}`); params.push(filter.assigned_user_id); }
    if (filter.status) { where.push(`l.status = $${params.length + 1}`); params.push(filter.status); }
    if (filter.search) {
      where.push(`(l.name LIKE $${params.length + 1} OR l.phone LIKE $${params.length + 2} OR l.company LIKE $${params.length + 3} OR l.email LIKE $${params.length + 4})`);
      const s = `%${filter.search}%`;
      params.push(s, s, s, s);
    }
    if (filter.date_from) { where.push(`l.created_at >= $${params.length + 1}`); params.push(filter.date_from); }
    if (filter.date_to) { where.push(`l.created_at <= $${params.length + 1}`); params.push(filter.date_to); }
    return (await q(`
      SELECT l.*, ps.name as stage_name, ps.color as stage_color,
             s.name as service_name, u.name as assigned_name
      FROM leads l
      LEFT JOIN pipeline_stages ps ON ps.id = l.stage_id
      LEFT JOIN services s ON s.id = l.service_id
      LEFT JOIN users u ON u.id = l.assigned_user_id
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(l.last_activity_at, l.created_at) DESC, l.created_at DESC
    `, params)) as LeadWithRelations[];
  },

  async updateFields(id: string, fields: Partial<LeadRow>): Promise<void> {
    const allowed: (keyof LeadRow)[] = [
      'name', 'company', 'email', 'phone', 'interest', 'priority',
      'estimated_value', 'status', 'notes', 'description', 'quantity',
      'deadline', 'assigned_user_id', 'service_id', 'stage_id', 'last_activity_at',
    ];
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (k in fields) { sets.push(`${k} = $${params.length + 1}`); params.push((fields as any)[k]); }
    }
    if (!sets.length) return;
    sets.push(`updated_at = now()`);
    params.push(id);
    await qe(`UPDATE leads SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  },

  async delete(id: string): Promise<void> {
    await qe(`DELETE FROM leads WHERE id = $1`, [id]);
  },
};
