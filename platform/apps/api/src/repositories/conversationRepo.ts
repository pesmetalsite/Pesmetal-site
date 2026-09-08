/**
 * Conversation Repository — whatsapp_conversations + whatsapp_messages
 */
import { q, q1, qe } from '../lib/db.js';

export interface ConversationRow {
  id: string;
  contact_id: string;
  lead_id: string | null;
  assigned_user_id: string | null;
  automation_id: string | null;
  status: 'active' | 'paused' | 'closed' | 'human';
  automation_status: 'idle' | 'running' | 'waiting_input' | 'paused' | 'completed' | 'transferred';
  current_node: string | null;
  context: string | null;
  instance_id: string | null;
  last_message_at: string | null;
  unread_count: number;
  human_started_at: string | null;
  human_started_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  external_id: string | null;
  conversation_id: string;
  direction: 'incoming' | 'outgoing';
  type: 'text' | 'image' | 'document' | 'audio' | 'video';
  content: string | null;
  media_url: string | null;
  media_mime: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
  sent_by_user_id: string | null;
  error: string | null;
  metadata: string | null;
  created_at: string;
}

export const ConversationRepository = {
  async findByContactId(contactId: string, instanceId?: string | null): Promise<ConversationRow | undefined> {
    if (instanceId) return (await q1(`SELECT * FROM whatsapp_conversations WHERE contact_id = $1 AND instance_id = $2 ORDER BY created_at DESC LIMIT 1`, [contactId, instanceId])) as ConversationRow | undefined;
    return (await q1(`SELECT * FROM whatsapp_conversations WHERE contact_id = $1 ORDER BY created_at DESC LIMIT 1`, [contactId])) as ConversationRow | undefined;
  },
  async findById(id: string): Promise<ConversationRow | undefined> {
    return (await q1(`SELECT * FROM whatsapp_conversations WHERE id = $1`, [id])) as ConversationRow | undefined;
  },
  async insert(data: Partial<ConversationRow> & Pick<ConversationRow, 'contact_id'>): Promise<string> {
    const id = data.id || `conv_${crypto.randomUUID().slice(0, 16)}`;
    await qe(`INSERT INTO whatsapp_conversations
                (id, contact_id, lead_id, assigned_user_id, automation_id, status, automation_status, current_node, context, instance_id, last_message_at, unread_count)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), 0)`,
      [id, data.contact_id, data.lead_id ?? null, data.assigned_user_id ?? null, data.automation_id ?? null,
        data.status ?? 'active', data.automation_status ?? 'idle', data.current_node ?? null, data.context ?? null, (data as any).instance_id ?? null]);
    return id;
  },
  async update(id: string, fields: Partial<ConversationRow>): Promise<void> {
    const allowed: (keyof ConversationRow)[] = [
      'lead_id', 'assigned_user_id', 'automation_id', 'status',
      'automation_status', 'current_node', 'context', 'instance_id', 'last_message_at', 'unread_count',
      'human_started_at', 'human_started_by', 'closed_at', 'closed_by',
    ];
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (k in fields) { sets.push(`${k} = $${params.length + 1}`); params.push((fields as any)[k]); }
    }
    if (!sets.length) return;
    sets.push(`updated_at = now()`);
    params.push(id);
    await qe(`UPDATE whatsapp_conversations SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  },
  async list(filter: { status?: string; assigned_user_id?: string; search?: string; stage_id?: string; lead_id?: string; unread?: boolean; limit?: number; offset?: number } = {}): Promise<{ conversations: any[]; total: number }> {
    const where: string[] = ['1=1'];
    const params: any[] = [];
    if (filter.status) { where.push(`wc.status = $${params.length + 1}`); params.push(filter.status); }
    if (filter.assigned_user_id) { where.push(`wc.assigned_user_id = $${params.length + 1}`); params.push(filter.assigned_user_id); }
    if (filter.unread) { where.push(`wc.unread_count > 0`); }
    if (filter.search) {
      where.push(`(c.name LIKE $${params.length + 1} OR c.phone LIKE $${params.length + 2} OR c.company LIKE $${params.length + 3})`);
      const s = `%${filter.search}%`;
      params.push(s, s, s);
    }
    if (filter.stage_id) { where.push(`l.stage_id = $${params.length + 1}`); params.push(filter.stage_id); }
    if (filter.lead_id) { where.push(`wc.lead_id = $${params.length + 1}`); params.push(filter.lead_id); }
    const base = `
      FROM whatsapp_conversations wc
      JOIN contacts c ON c.id = wc.contact_id
      LEFT JOIN leads l ON l.id = wc.lead_id
      LEFT JOIN pipeline_stages ps ON ps.id = l.stage_id
      WHERE ${where.join(' AND ')}
    `;
    const totalRow = (await q1(`SELECT COUNT(*)::int AS total ${base}`, params)) as any;
    const total = totalRow?.total ?? 0;
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
    const offset = Math.max(filter.offset ?? 0, 0);
    const rows = await q(`
      SELECT wc.*, c.name as contact_name, c.custom_name, c.phone as contact_phone, c.company as contact_company,
             l.name as lead_name, l.stage_id, ps.name as stage_name, ps.color as stage_color,
             (SELECT content FROM whatsapp_messages WHERE conversation_id = wc.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message
      ${base}
      ORDER BY COALESCE(wc.last_message_at, wc.created_at) DESC NULLS LAST
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);
    return { conversations: rows, total };
  },
};

export const MessageRepository = {
  async findByExternalId(externalId: string): Promise<MessageRow | undefined> {
    return (await q1(`SELECT * FROM whatsapp_messages WHERE external_id = $1`, [externalId])) as MessageRow | undefined;
  },
  async insert(data: Partial<MessageRow> & Pick<MessageRow, 'conversation_id' | 'direction' | 'type'>): Promise<string> {
    const id = data.id || `msg_${crypto.randomUUID().slice(0, 16)}`;
await qe(`INSERT INTO whatsapp_messages
                (id, external_id, conversation_id, direction, type, content, media_url, media_mime, status, sent_by_user_id, error, metadata, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13, now()))`,
      [id, data.external_id ?? null, data.conversation_id, data.direction, data.type,
        data.content ?? null, data.media_url ?? null, data.media_mime ?? null,
        data.status ?? 'pending', data.sent_by_user_id ?? null, data.error ?? null, data.metadata ?? null,
        data.created_at ?? null]);
    return id;
  },
  async listByConversation(conversationId: string, opts: { limit?: number; offset?: number; oldestFirst?: boolean } = {}): Promise<MessageRow[]> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
    const offset = Math.max(opts.offset ?? 0, 0);
    const order = opts.oldestFirst ? 'created_at ASC, id ASC' : 'created_at DESC, id DESC';
    return (await q(`SELECT * FROM whatsapp_messages WHERE conversation_id = $1 ORDER BY ${order} LIMIT $2 OFFSET $3`, [conversationId, limit, offset])) as MessageRow[];
  },
  async countByConversation(conversationId: string): Promise<number> {
    const row = (await q1(`SELECT COUNT(*)::int AS total FROM whatsapp_messages WHERE conversation_id = $1`, [conversationId])) as any;
    return row?.total ?? 0;
  },
  async updateStatus(id: string, status: MessageRow['status']): Promise<void> {
    await qe(`UPDATE whatsapp_messages SET status = $1 WHERE id = $2`, [status, id]);
  },
};
