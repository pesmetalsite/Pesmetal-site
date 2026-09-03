/**
 * Contact Repository
 */
import { db } from '../lib/db.js';

export interface ContactRow {
  id: string;
  phone: string;
  whatsapp_id: string | null;
  name: string | null;
  email: string | null;
  company: string | null;
  avatar: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

export const ContactRepository = {
  findByPhone(phone: string): ContactRow | undefined {
    const digits = phone.replace(/\D/g, '');
    return db.prepare(`SELECT * FROM contacts WHERE phone = ? OR phone = ?`).get(phone, digits) as ContactRow | undefined;
  },
  findById(id: string): ContactRow | undefined {
    return db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(id) as ContactRow | undefined;
  },
  insert(data: Partial<ContactRow> & Pick<ContactRow, 'phone'>): string {
    const id = data.id || `ct_${crypto.randomUUID().slice(0, 16)}`;
    db.prepare(`INSERT INTO contacts (id, phone, whatsapp_id, name, email, company, avatar, tags)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, data.phone, data.whatsapp_id ?? null, data.name ?? null, data.email ?? null,
        data.company ?? null, data.avatar ?? null, data.tags ?? null);
    return id;
  },
  update(id: string, fields: Partial<ContactRow>): void {
    const allowed: (keyof ContactRow)[] = ['name', 'email', 'company', 'avatar', 'tags', 'whatsapp_id'];
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (k in fields) { sets.push(`${k} = ?`); params.push((fields as any)[k]); }
    }
    if (!sets.length) return;
    sets.push(`updated_at = datetime('now')`);
    params.push(id);
    db.prepare(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  },
};
