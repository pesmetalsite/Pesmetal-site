/**
 * Contact Repository
 */
import { q, q1, qe } from '../lib/db.js';

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
  async findByPhone(phone: string): Promise<ContactRow | undefined> {
    const digits = phone.replace(/\D/g, '');
    return (await q1(`SELECT * FROM contacts WHERE phone = $1 OR phone = $2`, [phone, digits])) as ContactRow | undefined;
  },
  async findById(id: string): Promise<ContactRow | undefined> {
    return (await q1(`SELECT * FROM contacts WHERE id = $1`, [id])) as ContactRow | undefined;
  },
  async insert(data: Partial<ContactRow> & Pick<ContactRow, 'phone'>): Promise<string> {
    const id = data.id || `ct_${crypto.randomUUID().slice(0, 16)}`;
    await qe(`INSERT INTO contacts (id, phone, whatsapp_id, name, email, company, avatar, tags)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, data.phone, data.whatsapp_id ?? null, data.name ?? null, data.email ?? null,
        data.company ?? null, data.avatar ?? null, data.tags ?? null]);
    return id;
  },
  async update(id: string, fields: Partial<ContactRow>): Promise<void> {
    const allowed: (keyof ContactRow)[] = ['name', 'email', 'company', 'avatar', 'tags', 'whatsapp_id'];
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (k in fields) { sets.push(`${k} = $${params.length + 1}`); params.push((fields as any)[k]); }
    }
    if (!sets.length) return;
    sets.push(`updated_at = now()`);
    params.push(id);
    await qe(`UPDATE contacts SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  },
};
