/**
 * Repositories auxiliares (services, projects, appointments, quotes, lead events).
 */
import { q, q1, qe } from '../lib/db.js';

// === Services ===
export interface ServiceRow {
  id: string; name: string; slug: string; description: string | null;
  image: string | null; category: string | null; position: number; active: number;
  created_at: string; updated_at: string;
}
export const ServiceRepository = {
  async list(activeOnly = true): Promise<ServiceRow[]> {
    const where = activeOnly ? `WHERE active = 1` : '';
    return (await q(`SELECT * FROM services ${where} ORDER BY position ASC`)) as ServiceRow[];
  },
  async findById(id: string): Promise<ServiceRow | undefined> { return (await q1(`SELECT * FROM services WHERE id = $1`, [id])) as ServiceRow | undefined; },
  async findBySlug(slug: string): Promise<ServiceRow | undefined> { return (await q1(`SELECT * FROM services WHERE slug = $1`, [slug])) as ServiceRow | undefined; },
  async findByName(name: string): Promise<ServiceRow | undefined> { return (await q1(`SELECT * FROM services WHERE LOWER(name) = LOWER($1) LIMIT 1`, [name])) as ServiceRow | undefined; },
  async insert(d: Partial<ServiceRow> & Pick<ServiceRow, 'name' | 'slug'>): Promise<string> {
    const id = d.id || `srv_${crypto.randomUUID().slice(0, 8)}`;
    await qe(`INSERT INTO services (id, name, slug, description, image, category, position) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, d.name, d.slug, d.description ?? null, d.image ?? null, d.category ?? null, d.position ?? 0]);
    return id;
  },
  async update(id: string, f: Partial<ServiceRow>): Promise<void> {
    const allowed: (keyof ServiceRow)[] = ['name','slug','description','image','category','position','active'];
    const sets: string[] = []; const params: any[] = [];
    for (const k of allowed) { if (k in f) { sets.push(`${k} = $${params.length + 1}`); params.push((f as any)[k]); } }
    if (!sets.length) return;
    sets.push(`updated_at = now()`); params.push(id);
    await qe(`UPDATE services SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  },
  async delete(id: string): Promise<void> { await qe(`DELETE FROM services WHERE id = $1`, [id]); },
};

// === Projects ===
export interface ProjectRow {
  id: string; name: string; slug: string; description: string | null;
  category: string | null; client: string | null; images: string | null;
  featured: number; date: string | null; active: number;
  created_at: string; updated_at: string;
}
export const ProjectRepository = {
  async list(activeOnly = true): Promise<ProjectRow[]> {
    const where = activeOnly ? `WHERE active = 1` : '';
    return (await q(`SELECT * FROM projects ${where} ORDER BY featured DESC, date DESC`)) as ProjectRow[];
  },
  async findById(id: string): Promise<ProjectRow | undefined> { return (await q1(`SELECT * FROM projects WHERE id = $1`, [id])) as ProjectRow | undefined; },
  async insert(d: Omit<Partial<ProjectRow>, 'images' | 'featured'> & Pick<ProjectRow, 'name' | 'slug'> & { images?: string[]; featured?: boolean | number }): Promise<string> {
    const id = d.id || `proj_${crypto.randomUUID().slice(0, 8)}`;
    await qe(`INSERT INTO projects (id, name, slug, description, category, client, images, featured, date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, d.name, d.slug, d.description ?? null, d.category ?? null, d.client ?? null, d.images ? JSON.stringify(d.images) : null, d.featured ? 1 : 0, d.date ?? null]);
    return id;
  },
  async update(id: string, f: Partial<ProjectRow> & { images?: string[] }): Promise<void> {
    const sets: string[] = []; const params: any[] = [];
    for (const k of ['name','slug','description','category','client','featured','date','active'] as const) {
      if (k in f) { sets.push(`${k} = $${params.length + 1}`); params.push((f as any)[k]); }
    }
    if ('images' in (f as any)) { sets.push(`images = $${params.length + 1}`); params.push(JSON.stringify((f as any).images || [])); }
    if (!sets.length) return;
    sets.push(`updated_at = now()`); params.push(id);
    await qe(`UPDATE projects SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  },
  async delete(id: string): Promise<void> { await qe(`DELETE FROM projects WHERE id = $1`, [id]); },
};

// === Appointments ===
export interface AppointmentRow {
  id: string; lead_id: string | null; user_id: string | null;
  title: string; type: string; date: string; duration_min: number;
  notes: string | null; status: string;
  created_at: string; updated_at: string;
}
export const AppointmentRepository = {
  async list(filter: { user_id?: string; lead_id?: string; from?: string; to?: string } = {}): Promise<AppointmentRow[]> {
    const where: string[] = ['1=1']; const params: any[] = [];
    if (filter.user_id) { where.push(`a.user_id = $${params.length + 1}`); params.push(filter.user_id); }
    if (filter.lead_id) { where.push(`a.lead_id = $${params.length + 1}`); params.push(filter.lead_id); }
    if (filter.from) { where.push(`a.date >= $${params.length + 1}`); params.push(filter.from); }
    if (filter.to) { where.push(`a.date <= $${params.length + 1}`); params.push(filter.to); }
    return (await q(`SELECT a.* FROM appointments a WHERE ${where.join(' AND ')} ORDER BY a.date ASC`, params)) as AppointmentRow[];
  },
  async insert(d: Partial<AppointmentRow> & Pick<AppointmentRow, 'title' | 'type' | 'date'>): Promise<string> {
    const id = d.id || `apt_${crypto.randomUUID().slice(0, 16)}`;
    await qe(`INSERT INTO appointments (id, lead_id, user_id, title, type, date, duration_min, notes, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, d.lead_id ?? null, d.user_id ?? null, d.title, d.type, d.date, d.duration_min ?? 60, d.notes ?? null, d.status ?? 'scheduled']);
    return id;
  },
  async update(id: string, f: Partial<AppointmentRow>): Promise<void> {
    const sets: string[] = []; const params: any[] = [];
    for (const k of ['title','type','date','duration_min','notes','status','user_id','lead_id'] as const) {
      if (k in f) { sets.push(`${k} = $${params.length + 1}`); params.push((f as any)[k]); }
    }
    if (!sets.length) return;
    sets.push(`updated_at = now()`); params.push(id);
    await qe(`UPDATE appointments SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  },
  async delete(id: string): Promise<void> { await qe(`DELETE FROM appointments WHERE id = $1`, [id]); },
};

// === Quotes ===
export interface QuoteRow {
  id: string; number: string; lead_id: string | null; user_id: string | null;
  title: string; description: string | null; amount: number; currency: string;
  valid_until: string | null; status: string; notes: string | null; items: string | null;
  contact_id: string | null; conversation_id: string | null;
  retention_expires_at: string; sent_at: string | null; sent_by: string | null;
  created_at: string; updated_at: string;
}
export const QuoteRepository = {
  async list(filter?: { contact_id?: string; conversation_id?: string; status?: string }): Promise<any[]> {
    let sql = `SELECT q.*, c.name as contact_name, c.phone as contact_phone, c.custom_name,
               l.name as lead_name, u.name as user_name
               FROM quotes q
               LEFT JOIN contacts c ON c.id = q.contact_id
               LEFT JOIN leads l ON l.id = q.lead_id
               LEFT JOIN users u ON u.id = q.user_id WHERE 1=1`;
    const params: any[] = [];
    if (filter?.contact_id) { sql += ` AND q.contact_id = $${params.length + 1}`; params.push(filter.contact_id); }
    if (filter?.conversation_id) { sql += ` AND q.conversation_id = $${params.length + 1}`; params.push(filter.conversation_id); }
    if (filter?.status) { sql += ` AND q.status = $${params.length + 1}`; params.push(filter.status); }
    sql += ` ORDER BY q.created_at DESC`;
    return (await q(sql, params)) as any[];
  },
  async findById(id: string): Promise<any> {
    return (await q1(`SELECT q.*, c.name as contact_name, c.phone as contact_phone, c.custom_name, c.document as contact_document,
               c.address_line, c.address_city, c.address_state, c.address_zip,
               l.name as lead_name, u.name as user_name
               FROM quotes q
               LEFT JOIN contacts c ON c.id = q.contact_id
               LEFT JOIN leads l ON l.id = q.lead_id
               LEFT JOIN users u ON u.id = q.user_id
               WHERE q.id = $1`, [id])) as any;
  },
  async insert(d: any): Promise<{ id: string; number: string }> {
    const id = d.id || `q_${crypto.randomUUID().slice(0, 16)}`;
    const number = d.number || `ORC-${Date.now().toString().slice(-6)}`;
    await qe(`INSERT INTO quotes (id, number, lead_id, user_id, title, description, amount, valid_until, status, notes, items, contact_id, conversation_id)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [id, number, d.lead_id ?? null, d.user_id ?? null, d.title, d.description ?? null, d.amount ?? 0,
       d.valid_until ?? null, d.status ?? 'draft', d.notes ?? null, d.items ? JSON.stringify(d.items) : null,
       d.contact_id ?? null, d.conversation_id ?? null]);
    return { id, number };
  },
  async update(id: string, f: any): Promise<void> {
    const sets: string[] = []; const params: any[] = [];
    for (const k of ['title','description','amount','valid_until','status','notes','contact_id','conversation_id']) {
      if (k in f) { sets.push(`${k} = $${params.length + 1}`); params.push(f[k]); }
    }
    if ('items' in f) { sets.push(`items = $${params.length + 1}`); params.push(JSON.stringify(f.items || [])); }
    if (!sets.length) return;
    sets.push(`updated_at = now()`); params.push(id);
    await qe(`UPDATE quotes SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  },
  async delete(id: string): Promise<void> { await qe(`DELETE FROM quotes WHERE id = $1`, [id]); },
  async markSent(id: string, userId: string): Promise<void> {
    await qe(`UPDATE quotes SET sent_at = now(), sent_by = $2, status = 'sent', updated_at = now() WHERE id = $1`, [id, userId]);
  },
  async findExpiringSoon(days: number = 3): Promise<any[]> {
    return (await q(`SELECT * FROM quotes WHERE retention_expires_at <= now() + interval '${days} days' AND status NOT IN ('deleted') AND sent_at IS NOT NULL`)) as any[];
  },
  async findExpired(): Promise<any[]> {
    return (await q(`SELECT * FROM quotes WHERE retention_expires_at < now() AND status != 'deleted'`)) as any[];
  },
};

// === Lead Events ===
export const LeadEventRepository = {
  async insert(d: { lead_id: string | null; user_id?: string | null; type: string; payload?: any; description?: string }): Promise<string> {
    const id = `ev_${crypto.randomUUID().slice(0, 16)}`;
    await qe(`INSERT INTO lead_events (id, lead_id, user_id, type, payload, description) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, d.lead_id, d.user_id ?? null, d.type, d.payload ? JSON.stringify(d.payload) : null, d.description ?? null]);
    return id;
  },
  async listByLead(leadId: string, limit = 100): Promise<any[]> {
    return (await q(`SELECT * FROM lead_events WHERE lead_id = $1 ORDER BY created_at DESC LIMIT $2`, [leadId, limit]));
  },
};

// === Lead Notes ===
export const LeadNoteRepository = {
  async insert(d: { lead_id: string; user_id: string; content: string }): Promise<string> {
    const id = `note_${crypto.randomUUID().slice(0, 16)}`;
    await qe(`INSERT INTO lead_notes (id, lead_id, user_id, content) VALUES ($1, $2, $3, $4)`,
      [id, d.lead_id, d.user_id, d.content]);
    return id;
  },
  async listByLead(leadId: string): Promise<any[]> {
    return (await q(`SELECT * FROM lead_notes WHERE lead_id = $1 ORDER BY created_at DESC`, [leadId]));
  },
};

// === Lead Files ===
export const LeadFileRepository = {
  async insert(d: { lead_id: string | null; filename: string; mime: string | null; size: number; path: string; uploaded_by?: string | null }): Promise<string> {
    const id = `file_${crypto.randomUUID().slice(0, 16)}`;
    await qe(`INSERT INTO lead_files (id, lead_id, filename, mime, size, path, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, d.lead_id, d.filename, d.mime, d.size, d.path, d.uploaded_by ?? null]);
    return id;
  },
  async listByLead(leadId: string): Promise<any[]> {
    return (await q(`SELECT * FROM lead_files WHERE lead_id = $1 ORDER BY created_at DESC`, [leadId]));
  },
};
