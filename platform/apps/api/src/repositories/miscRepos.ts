/**
 * Repositories auxiliares (services, projects, appointments, quotes, lead events).
 */
import { db } from '../lib/db.js';

// === Services ===
export interface ServiceRow {
  id: string; name: string; slug: string; description: string | null;
  image: string | null; category: string | null; position: number; active: number;
  created_at: string; updated_at: string;
}
export const ServiceRepository = {
  list(activeOnly = true): ServiceRow[] {
    const q = activeOnly ? `WHERE active = 1` : '';
    return db.prepare(`SELECT * FROM services ${q} ORDER BY position ASC`).all() as ServiceRow[];
  },
  findById(id: string): ServiceRow | undefined { return db.prepare(`SELECT * FROM services WHERE id = ?`).get(id) as ServiceRow | undefined; },
  findBySlug(slug: string): ServiceRow | undefined { return db.prepare(`SELECT * FROM services WHERE slug = ?`).get(slug) as ServiceRow | undefined; },
  insert(d: Partial<ServiceRow> & Pick<ServiceRow, 'name' | 'slug'>): string {
    const id = d.id || `srv_${crypto.randomUUID().slice(0, 8)}`;
    db.prepare(`INSERT INTO services (id, name, slug, description, image, category, position) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, d.name, d.slug, d.description ?? null, d.image ?? null, d.category ?? null, d.position ?? 0);
    return id;
  },
  update(id: string, f: Partial<ServiceRow>): void {
    const allowed: (keyof ServiceRow)[] = ['name','slug','description','image','category','position','active'];
    const sets: string[] = []; const params: any[] = [];
    for (const k of allowed) { if (k in f) { sets.push(`${k} = ?`); params.push((f as any)[k]); } }
    if (!sets.length) return;
    sets.push(`updated_at = datetime('now')`); params.push(id);
    db.prepare(`UPDATE services SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  },
  delete(id: string): void { db.prepare(`DELETE FROM services WHERE id = ?`).run(id); },
};

// === Projects ===
export interface ProjectRow {
  id: string; name: string; slug: string; description: string | null;
  category: string | null; client: string | null; images: string | null;
  featured: number; date: string | null; active: number;
  created_at: string; updated_at: string;
}
export const ProjectRepository = {
  list(activeOnly = true): ProjectRow[] {
    const q = activeOnly ? `WHERE active = 1` : '';
    return db.prepare(`SELECT * FROM projects ${q} ORDER BY featured DESC, date DESC`).all() as ProjectRow[];
  },
  findById(id: string): ProjectRow | undefined { return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as ProjectRow | undefined; },
  insert(d: Partial<ProjectRow> & Pick<ProjectRow, 'name' | 'slug'>): string {
    const id = d.id || `proj_${crypto.randomUUID().slice(0, 8)}`;
    db.prepare(`INSERT INTO projects (id, name, slug, description, category, client, images, featured, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, d.name, d.slug, d.description ?? null, d.category ?? null, d.client ?? null, d.images ? JSON.stringify(d.images) : null, d.featured ? 1 : 0, d.date ?? null);
    return id;
  },
  update(id: string, f: Partial<ProjectRow> & { images?: string[] }): void {
    const sets: string[] = []; const params: any[] = [];
    for (const k of ['name','slug','description','category','client','featured','date','active'] as const) {
      if (k in f) { sets.push(`${k} = ?`); params.push((f as any)[k]); }
    }
    if ('images' in (f as any)) { sets.push(`images = ?`); params.push(JSON.stringify((f as any).images || [])); }
    if (!sets.length) return;
    sets.push(`updated_at = datetime('now')`); params.push(id);
    db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  },
  delete(id: string): void { db.prepare(`DELETE FROM projects WHERE id = ?`).run(id); },
};

// === Appointments ===
export interface AppointmentRow {
  id: string; lead_id: string | null; user_id: string | null;
  title: string; type: string; date: string; duration_min: number;
  notes: string | null; status: string;
  created_at: string; updated_at: string;
}
export const AppointmentRepository = {
  list(filter: { user_id?: string; lead_id?: string; from?: string; to?: string } = {}): AppointmentRow[] {
    const where: string[] = ['1=1']; const params: any[] = [];
    if (filter.user_id) { where.push('a.user_id = ?'); params.push(filter.user_id); }
    if (filter.lead_id) { where.push('a.lead_id = ?'); params.push(filter.lead_id); }
    if (filter.from) { where.push('a.date >= ?'); params.push(filter.from); }
    if (filter.to) { where.push('a.date <= ?'); params.push(filter.to); }
    return db.prepare(`SELECT a.* FROM appointments a WHERE ${where.join(' AND ')} ORDER BY a.date ASC`).all(...params) as AppointmentRow[];
  },
  insert(d: Partial<AppointmentRow> & Pick<AppointmentRow, 'title' | 'type' | 'date'>): string {
    const id = d.id || `apt_${crypto.randomUUID().slice(0, 16)}`;
    db.prepare(`INSERT INTO appointments (id, lead_id, user_id, title, type, date, duration_min, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, d.lead_id ?? null, d.user_id ?? null, d.title, d.type, d.date, d.duration_min ?? 60, d.notes ?? null, d.status ?? 'scheduled');
    return id;
  },
  update(id: string, f: Partial<AppointmentRow>): void {
    const sets: string[] = []; const params: any[] = [];
    for (const k of ['title','type','date','duration_min','notes','status','user_id','lead_id'] as const) {
      if (k in f) { sets.push(`${k} = ?`); params.push((f as any)[k]); }
    }
    if (!sets.length) return;
    sets.push(`updated_at = datetime('now')`); params.push(id);
    db.prepare(`UPDATE appointments SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  },
  delete(id: string): void { db.prepare(`DELETE FROM appointments WHERE id = ?`).run(id); },
};

// === Quotes ===
export interface QuoteRow {
  id: string; number: string; lead_id: string; user_id: string | null;
  title: string; description: string | null; amount: number; currency: string;
  valid_until: string | null; status: string; notes: string | null; items: string | null;
  created_at: string; updated_at: string;
}
export const QuoteRepository = {
  list(): QuoteRow[] { return db.prepare(`SELECT * FROM quotes ORDER BY created_at DESC`).all() as QuoteRow[]; },
  findById(id: string): QuoteRow | undefined { return db.prepare(`SELECT * FROM quotes WHERE id = ?`).get(id) as QuoteRow | undefined; },
  insert(d: Partial<QuoteRow> & Pick<QuoteRow, 'lead_id' | 'title'>): { id: string; number: string } {
    const id = d.id || `q_${crypto.randomUUID().slice(0, 16)}`;
    const number = d.number || `ORC-${Date.now().toString().slice(-6)}`;
    db.prepare(`INSERT INTO quotes (id, number, lead_id, user_id, title, description, amount, valid_until, status, notes, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, number, d.lead_id, d.user_id ?? null, d.title, d.description ?? null, d.amount ?? 0, d.valid_until ?? null, d.status ?? 'draft', d.notes ?? null, d.items ? JSON.stringify(d.items) : null);
    return { id, number };
  },
  update(id: string, f: Partial<QuoteRow> & { items?: any[] }): void {
    const sets: string[] = []; const params: any[] = [];
    for (const k of ['title','description','amount','valid_until','status','notes'] as const) {
      if (k in f) { sets.push(`${k} = ?`); params.push((f as any)[k]); }
    }
    if ('items' in (f as any)) { sets.push(`items = ?`); params.push(JSON.stringify((f as any).items || [])); }
    if (!sets.length) return;
    sets.push(`updated_at = datetime('now')`); params.push(id);
    db.prepare(`UPDATE quotes SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  },
  delete(id: string): void { db.prepare(`DELETE FROM quotes WHERE id = ?`).run(id); },
};

// === Lead Events ===
export const LeadEventRepository = {
  insert(d: { lead_id: string; user_id?: string | null; type: string; payload?: any; description?: string }): string {
    const id = `ev_${crypto.randomUUID().slice(0, 16)}`;
    db.prepare(`INSERT INTO lead_events (id, lead_id, user_id, type, payload, description) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, d.lead_id, d.user_id ?? null, d.type, d.payload ? JSON.stringify(d.payload) : null, d.description ?? null);
    return id;
  },
  listByLead(leadId: string, limit = 100): any[] {
    return db.prepare(`SELECT * FROM lead_events WHERE lead_id = ? ORDER BY created_at DESC LIMIT ?`).all(leadId, limit);
  },
};

// === Lead Notes ===
export const LeadNoteRepository = {
  insert(d: { lead_id: string; user_id: string; content: string }): string {
    const id = `note_${crypto.randomUUID().slice(0, 16)}`;
    db.prepare(`INSERT INTO lead_notes (id, lead_id, user_id, content) VALUES (?, ?, ?, ?)`)
      .run(id, d.lead_id, d.user_id, d.content);
    return id;
  },
  listByLead(leadId: string): any[] {
    return db.prepare(`SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC`).all(leadId);
  },
};

// === Lead Files ===
export const LeadFileRepository = {
  insert(d: { lead_id: string | null; filename: string; mime: string | null; size: number; path: string; uploaded_by?: string | null }): string {
    const id = `file_${crypto.randomUUID().slice(0, 16)}`;
    db.prepare(`INSERT INTO lead_files (id, lead_id, filename, mime, size, path, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, d.lead_id, d.filename, d.mime, d.size, d.path, d.uploaded_by ?? null);
    return id;
  },
  listByLead(leadId: string): any[] {
    return db.prepare(`SELECT * FROM lead_files WHERE lead_id = ? ORDER BY created_at DESC`).all(leadId);
  },
};
