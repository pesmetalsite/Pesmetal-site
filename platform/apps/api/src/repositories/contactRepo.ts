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
  custom_name: string | null;
  tags: string | null;
  document: string | null;
  address_line: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  address_neighborhood: string | null;
  state_registration: string | null;
  no_automation: boolean;
  is_favorite: boolean;
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
  async list(filter: { search?: string; limit?: number } = {}): Promise<any[]> {
    const params: any[] = [];
    let sql = `SELECT c.*,
               (SELECT COUNT(*) FROM whatsapp_conversations wc WHERE wc.contact_id = c.id) AS conversation_count,
               (SELECT COUNT(*) FROM quotes qt WHERE qt.contact_id = c.id AND qt.status != 'deleted') AS quote_count,
               (SELECT wc.id FROM whatsapp_conversations wc WHERE wc.contact_id = c.id ORDER BY wc.last_message_at DESC NULLS LAST LIMIT 1) AS conversation_id
               FROM contacts c WHERE 1=1`;
    if (filter.search) {
      const s = `%${filter.search}%`;
      params.push(s, s, s);
      sql += ` AND (c.name ILIKE $${params.length - 2} OR c.phone ILIKE $${params.length - 1} OR c.custom_name ILIKE $${params.length})`;
    }
    sql += ` ORDER BY c.custom_name ASC NULLS LAST, c.name ASC NULLS LAST`;
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
    return (await q(sql, params)) as any[];
  },
  async insert(data: Partial<ContactRow> & Pick<ContactRow, 'phone'>): Promise<string> {
    const id = data.id || `ct_${crypto.randomUUID().slice(0, 16)}`;
    await qe(`INSERT INTO contacts (id, phone, whatsapp_id, name, email, company, avatar, tags, document, address_line, address_city, address_state, address_zip, address_neighborhood, state_registration, no_automation, is_favorite)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [id, data.phone, data.whatsapp_id ?? null, data.name ?? null, data.email ?? null,
        data.company ?? null, data.avatar ?? null, data.tags ?? null, data.document ?? null,
        data.address_line ?? null, data.address_city ?? null, data.address_state ?? null, data.address_zip ?? null,
        data.address_neighborhood ?? null, data.state_registration ?? null,
        data.no_automation ?? false, data.is_favorite ?? false]);
    return id;
  },
  async update(id: string, fields: Partial<ContactRow>): Promise<void> {
    const allowed: (keyof ContactRow)[] = ['name', 'custom_name', 'email', 'company', 'avatar', 'tags', 'whatsapp_id', 'phone', 'document', 'address_line', 'address_city', 'address_state', 'address_zip', 'address_neighborhood', 'state_registration', 'no_automation', 'is_favorite'];
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
