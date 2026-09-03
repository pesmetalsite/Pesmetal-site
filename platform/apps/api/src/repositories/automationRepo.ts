/**
 * Automation Repository
 */
import { db } from '../lib/db.js';

export interface AutomationRow {
  id: string;
  name: string;
  description: string | null;
  trigger: 'new_contact' | 'message_received' | 'keyword' | 'lead_created';
  keyword: string | null;
  status: 'draft' | 'active' | 'inactive' | 'archived';
  graph: string;
  created_at: string;
  updated_at: string;
}

export const AutomationRepository = {
  list(): AutomationRow[] {
    return db.prepare(`SELECT * FROM automations ORDER BY updated_at DESC`).all() as AutomationRow[];
  },
  listActive(): AutomationRow[] {
    return db.prepare(`SELECT * FROM automations WHERE status = 'active'`).all() as AutomationRow[];
  },
  findById(id: string): AutomationRow | undefined {
    return db.prepare(`SELECT * FROM automations WHERE id = ?`).get(id) as AutomationRow | undefined;
  },
  insert(data: Partial<AutomationRow> & Pick<AutomationRow, 'name' | 'trigger' | 'graph'>): string {
    const id = data.id || `auto_${crypto.randomUUID().slice(0, 16)}`;
    db.prepare(`INSERT INTO automations (id, name, description, trigger, keyword, status, graph)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, data.name, data.description ?? null, data.trigger, data.keyword ?? null,
        data.status ?? 'draft', data.graph);
    return id;
  },
  update(id: string, fields: Partial<AutomationRow>): void {
    const allowed: (keyof AutomationRow)[] = ['name', 'description', 'trigger', 'keyword', 'status', 'graph'];
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (k in fields) { sets.push(`${k} = ?`); params.push((fields as any)[k]); }
    }
    if (!sets.length) return;
    sets.push(`updated_at = datetime('now')`);
    params.push(id);
    db.prepare(`UPDATE automations SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  },
  delete(id: string): void {
    db.prepare(`DELETE FROM automations WHERE id = ?`).run(id);
  },
};
