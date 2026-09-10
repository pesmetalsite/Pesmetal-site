/**
 * Automation Repository
 */
import { q, q1, qe } from '../lib/db.js';

export interface AutomationRow {
  id: string;
  name: string;
  description: string | null;
  trigger: 'new_contact' | 'message_received' | 'keyword' | 'lead_created';
  keyword: string | null;
  status: 'draft' | 'active' | 'inactive' | 'archived';
  graph: string | null;
  initial_message: string | null;
  options: string | null;
  invalid_message: string | null;
  instance_ids: string | null;
  closing_message: string | null;
  steps: string | null;          // JSON array de etapas multimídia
  step_options: string | null;   // JSON array de opções por etapa
  created_at: string;
  updated_at: string;
}

export const AutomationRepository = {
  async list(): Promise<AutomationRow[]> {
    return (await q(`SELECT * FROM automations ORDER BY updated_at DESC`)) as AutomationRow[];
  },
  async listActive(): Promise<AutomationRow[]> {
    return (await q(`SELECT * FROM automations WHERE status = 'active' ORDER BY created_at ASC, id ASC`)) as AutomationRow[];
  },
  async findById(id: string): Promise<AutomationRow | undefined> {
    return (await q1(`SELECT * FROM automations WHERE id = $1`, [id])) as AutomationRow | undefined;
  },
  async insert(data: Partial<AutomationRow> & Pick<AutomationRow, 'name' | 'trigger'>): Promise<string> {
    const id = data.id || `auto_${crypto.randomUUID().slice(0, 16)}`;
    await qe(`INSERT INTO automations (id, name, description, trigger, keyword, status, graph, initial_message, options, invalid_message, instance_ids, closing_message, steps, step_options)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [id, data.name, data.description ?? null, data.trigger, data.keyword ?? null,
        data.status ?? 'draft', data.graph ?? null, data.initial_message ?? null,
        data.options ?? null, data.invalid_message ?? null, (data as any).instance_ids ?? '[]', (data as any).closing_message ?? null,
        (data as any).steps ?? null, (data as any).step_options ?? null]);
    return id;
  },
  async update(id: string, fields: Partial<AutomationRow>): Promise<void> {
    const allowed: (keyof AutomationRow)[] = ['name', 'description', 'trigger', 'keyword', 'status', 'graph', 'initial_message', 'options', 'invalid_message', 'instance_ids', 'closing_message', 'steps', 'step_options'];
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (k in fields) { sets.push(`${k} = $${params.length + 1}`); params.push((fields as any)[k]); }
    }
    if (!sets.length) return;
    sets.push(`updated_at = now()`);
    params.push(id);
    await qe(`UPDATE automations SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  },
  async delete(id: string): Promise<void> {
    await qe(`DELETE FROM automations WHERE id = $1`, [id]);
  },
};
