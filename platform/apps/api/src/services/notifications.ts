/**
 * Notifications Service — tabela `notifications`.
 * Criação com dedupe (evita notificação idêntica para o mesmo lead/evento
 * no último minuto) e leitura/marcação de leitura por usuário.
 */
import { q, q1, qe } from '../lib/db.js';
import { LeadEventRepository } from '../repositories/miscRepos.js';

export interface CreateNotificationInput {
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown> | null;
  userId?: string | null;
  leadId?: string | null;
  /** Se informado e não duplicado, registra também um lead_event do mesmo tipo. */
  eventType?: string | null;
  eventDescription?: string | null;
}

export interface NotificationRow {
  id: string;
  user_id: string | null;
  type: string | null;
  title: string;
  body: string | null;
  data: string | null;
  read: number;
  created_at: string;
}

/** Cria uma notificação (dedupe em 60s por lead/type/title). Retorna o id. */
export async function createNotification(input: CreateNotificationInput): Promise<string> {
  const type = input.type || 'info';
  const data: Record<string, unknown> = input.data && typeof input.data === 'object' ? { ...input.data } : {};
  if (input.leadId) data.lead_id = input.leadId;
  const dataStr = Object.keys(data).length ? JSON.stringify(data) : null;

  if (input.leadId) {
    const dup = await q1(`
      SELECT id FROM notifications
      WHERE type = $1 AND title = $2 AND read = 0
        AND data IS NOT NULL AND data::jsonb->>'lead_id' = $3
        AND created_at > now() - interval '1 minute'
      LIMIT 1
    `, [type, input.title, input.leadId]);
    if (dup) return dup.id;
  }

  const id = `notif_${crypto.randomUUID().slice(0, 16)}`;
  await qe(`INSERT INTO notifications (id, user_id, type, title, body, data, read)
              VALUES ($1, $2, $3, $4, $5, $6, 0)`,
    [id, input.userId ?? null, type, input.title, input.body ?? null, dataStr]);

  if (input.leadId && input.eventType) {
    const already = await q1(`
      SELECT id FROM lead_events
      WHERE lead_id = $1 AND type = $2
        AND created_at > now() - interval '1 minute'
      LIMIT 1
    `, [input.leadId, input.eventType]);
    if (!already) {
      await LeadEventRepository.insert({
        lead_id: input.leadId,
        type: input.eventType,
        description: input.eventDescription ?? input.title,
      });
    }
  }

  return id;
}

/** Lista notificações do usuário (não lidas primeiro). */
export async function listNotifications(userId: string, opts: { all?: boolean; limit?: number } = {}): Promise<NotificationRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  if (opts.all) {
    return (await q(`
      SELECT * FROM notifications
      WHERE user_id = $1 OR user_id IS NULL
      ORDER BY read ASC, created_at DESC
      LIMIT $2
    `, [userId, limit])) as NotificationRow[];
  }
  return (await q(`
    SELECT * FROM notifications
    WHERE (user_id = $1 OR user_id IS NULL) AND read = 0
    ORDER BY created_at DESC
    LIMIT $2
  `, [userId, limit])) as NotificationRow[];
}

/** Marca uma notificação como lida (apenas do usuário ou global). */
export async function markNotificationRead(id: string, userId: string): Promise<boolean> {
  const res = await qe(`
    UPDATE notifications SET read = 1
    WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)
  `, [id, userId]);
  return (res.rowCount ?? 0) > 0;
}

/** Marca todas do usuário como lidas (admin: todas). */
export async function markAllNotificationsRead(userId: string, isAdmin: boolean): Promise<number> {
  if (isAdmin) {
    const res = await qe(`UPDATE notifications SET read = 1 WHERE read = 0`);
    return res.rowCount ?? 0;
  }
  const res = await qe(`
    UPDATE notifications SET read = 1
    WHERE read = 0 AND (user_id = $1 OR user_id IS NULL)
  `, [userId]);
  return res.rowCount ?? 0;
}