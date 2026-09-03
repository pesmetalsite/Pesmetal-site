/**
 * Pipeline / Stage Repository
 */
import { db } from '../lib/db.js';

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
  list(activeOnly = true): StageRow[] {
    const q = activeOnly ? `WHERE active = 1` : '';
    return db.prepare(`SELECT * FROM pipeline_stages ${q} ORDER BY position ASC`).all() as StageRow[];
  },
  findById(id: string): StageRow | undefined {
    return db.prepare(`SELECT * FROM pipeline_stages WHERE id = ?`).get(id) as StageRow | undefined;
  },
  insert(data: Partial<StageRow> & Pick<StageRow, 'name'>): string {
    const id = data.id || `stage_${crypto.randomUUID().slice(0, 8)}`;
    const max = (db.prepare(`SELECT MAX(position) as m FROM pipeline_stages`).get() as any)?.m ?? 0;
    db.prepare(`INSERT INTO pipeline_stages (id, name, color, position, is_initial, is_won, is_lost, active)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)`)
      .run(id, data.name, data.color ?? '#ff6b1a', data.position ?? (max + 1), data.is_initial ?? 0, data.is_won ?? 0, data.is_lost ?? 0);
    return id;
  },
  update(id: string, fields: Partial<StageRow>): void {
    const allowed: (keyof StageRow)[] = ['name', 'color', 'position', 'active', 'is_initial', 'is_won', 'is_lost'];
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (k in fields) { sets.push(`${k} = ?`); params.push((fields as any)[k]); }
    }
    if (!sets.length) return;
    params.push(id);
    db.prepare(`UPDATE pipeline_stages SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  },
  delete(id: string): void {
    db.prepare(`DELETE FROM pipeline_stages WHERE id = ?`).run(id);
  },
  findInitial(): StageRow | undefined {
    return db.prepare(`SELECT * FROM pipeline_stages WHERE is_initial = 1 LIMIT 1`).get() as StageRow | undefined;
  },
};
