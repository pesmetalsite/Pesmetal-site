/**
 * Conversation Repository — whatsapp_conversations + whatsapp_messages
 */
import { db } from '../lib/db.js';

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
  last_message_at: string | null;
  unread_count: number;
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
  findByContactId(contactId: string): ConversationRow | undefined {
    return db.prepare(`SELECT * FROM whatsapp_conversations WHERE contact_id = ? ORDER BY created_at DESC LIMIT 1`).get(contactId) as ConversationRow | undefined;
  },
  findById(id: string): ConversationRow | undefined {
    return db.prepare(`SELECT * FROM whatsapp_conversations WHERE id = ?`).get(id) as ConversationRow | undefined;
  },
  insert(data: Partial<ConversationRow> & Pick<ConversationRow, 'contact_id'>): string {
    const id = data.id || `conv_${crypto.randomUUID().slice(0, 16)}`;
    db.prepare(`INSERT INTO whatsapp_conversations
                (id, contact_id, lead_id, assigned_user_id, automation_id, status, automation_status, current_node, context, last_message_at, unread_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 0)`)
      .run(id, data.contact_id, data.lead_id ?? null, data.assigned_user_id ?? null, data.automation_id ?? null,
        data.status ?? 'active', data.automation_status ?? 'idle', data.current_node ?? null, data.context ?? null);
    return id;
  },
  update(id: string, fields: Partial<ConversationRow>): void {
    const allowed: (keyof ConversationRow)[] = [
      'lead_id', 'assigned_user_id', 'automation_id', 'status',
      'automation_status', 'current_node', 'context', 'last_message_at', 'unread_count',
    ];
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (k in fields) { sets.push(`${k} = ?`); params.push((fields as any)[k]); }
    }
    if (!sets.length) return;
    sets.push(`updated_at = datetime('now')`);
    params.push(id);
    db.prepare(`UPDATE whatsapp_conversations SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  },
  list(filter: { status?: string; assigned_user_id?: string; search?: string; stage_id?: string } = {}): any[] {
    const where: string[] = ['1=1'];
    const params: any[] = [];
    if (filter.status) { where.push('wc.status = ?'); params.push(filter.status); }
    if (filter.assigned_user_id) { where.push('wc.assigned_user_id = ?'); params.push(filter.assigned_user_id); }
    if (filter.search) {
      where.push('(c.name LIKE ? OR c.phone LIKE ?)');
      params.push(`%${filter.search}%`, `%${filter.search}%`);
    }
    if (filter.stage_id) { where.push('l.stage_id = ?'); params.push(filter.stage_id); }
    return db.prepare(`
      SELECT wc.*, c.name as contact_name, c.phone as contact_phone,
             l.name as lead_name, l.stage_id, ps.name as stage_name, ps.color as stage_color
      FROM whatsapp_conversations wc
      JOIN contacts c ON c.id = wc.contact_id
      LEFT JOIN leads l ON l.id = wc.lead_id
      LEFT JOIN pipeline_stages ps ON ps.id = l.stage_id
      WHERE ${where.join(' AND ')}
      ORDER BY wc.last_message_at DESC NULLS LAST
    `).all(...params);
  },
};

export const MessageRepository = {
  findByExternalId(externalId: string): MessageRow | undefined {
    return db.prepare(`SELECT * FROM whatsapp_messages WHERE external_id = ?`).get(externalId) as MessageRow | undefined;
  },
  insert(data: Partial<MessageRow> & Pick<MessageRow, 'conversation_id' | 'direction' | 'type'>): string {
    const id = data.id || `msg_${crypto.randomUUID().slice(0, 16)}`;
    db.prepare(`INSERT INTO whatsapp_messages
                (id, external_id, conversation_id, direction, type, content, media_url, media_mime, status, sent_by_user_id, error, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, data.external_id ?? null, data.conversation_id, data.direction, data.type,
        data.content ?? null, data.media_url ?? null, data.media_mime ?? null,
        data.status ?? 'pending', data.sent_by_user_id ?? null, data.error ?? null, data.metadata ?? null);
    return id;
  },
  listByConversation(conversationId: string): MessageRow[] {
    return db.prepare(`SELECT * FROM whatsapp_messages WHERE conversation_id = ? ORDER BY created_at ASC`).all(conversationId) as MessageRow[];
  },
  updateStatus(id: string, status: MessageRow['status']): void {
    db.prepare(`UPDATE whatsapp_messages SET status = ? WHERE id = ?`).run(status, id);
  },
};
