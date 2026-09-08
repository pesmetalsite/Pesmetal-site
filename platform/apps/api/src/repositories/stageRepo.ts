/**
 * Pipeline / Stage Repository
 */
import { q, q1, qe } from '../lib/db.js';

export interface StageRow {
  id: string;
  name: string;
  color: string;
  position: number;
  is_initial: number;
  is_won: number;
  is_lost: number;
  active: number;
  created_at: string;
}

export const StageRepository = {
  async list(activeOnly = true): Promise<StageRow[]> {
    const where = activeOnly ? `WHERE active = 1` : '';
    return (await q(`SELECT * FROM pipeline_stages ${where} ORDER BY position ASC`)) as StageRow[];
  },
  async findById(id: string): Promise<StageRow | undefined> {
    return (await q1(`SELECT * FROM pipeline_stages WHERE id = $1`, [id])) as StageRow | undefined;
  },
  async insert(data: Partial<StageRow> & Pick<StageRow, 'name'>): Promise<string> {
    const id = data.id || `stage_${crypto.randomUUID().slice(0, 8)}`;
    const row = (await q1(`SELECT MAX(position) as m FROM pipeline_stages`)) as any;
    const max = Number(row?.m ?? 0);
    await qe(`INSERT INTO pipeline_stages (id, name, color, position, is_initial, is_won, is_lost, active)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 1)`,
      [id, data.name, data.color ?? '#ff6b1a', data.position ?? (max + 1), data.is_initial ?? 0, data.is_won ?? 0, data.is_lost ?? 0]);
    return id;
  },
  async update(id: string, fields: Partial<StageRow>): Promise<void> {
    const allowed: (keyof StageRow)[] = ['name', 'color', 'position', 'active', 'is_initial', 'is_won', 'is_lost'];
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (k in fields) { sets.push(`${k} = $${params.length + 1}`); params.push((fields as any)[k]); }
    }
    if (!sets.length) return;
    params.push(id);
    await qe(`UPDATE pipeline_stages SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  },
  async delete(id: string): Promise<void> {
    await qe(`DELETE FROM pipeline_stages WHERE id = $1`, [id]);
  },
  async findInitial(): Promise<StageRow | undefined> {
    return (await q1(`SELECT * FROM pipeline_stages WHERE is_initial = 1 LIMIT 1`)) as StageRow | undefined;
  },
};
