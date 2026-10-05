/**
 * PESMETAL — Database Adapter
 * Suporta Postgres (pg) e SQLite (node:sqlite) como fallback
 */

import { Pool } from 'pg';
import { DatabaseSync } from 'node:sqlite';

// Detect database type
const DATABASE_URL = process.env.DATABASE_URL || '';
const USE_SQLITE = !DATABASE_URL || DATABASE_URL.trim() === '';

let pgPool: Pool | null = null;
let sqlite: DatabaseSync | null = null;

if (!USE_SQLITE) {
  // Postgres mode
  const isSupabase = /supabase\.co|supabase\.com/i.test(DATABASE_URL);
  const connectionString = isSupabase
    ? DATABASE_URL.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, '')
    : DATABASE_URL;

  pgPool = new Pool({
    connectionString,
    ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
  });
  console.log('[db] Using PostgreSQL');
} else {
  // SQLite fallback
  const dbPath = process.env.DATABASE_PATH || './data/pesmetal.db';
  sqlite = new DatabaseSync(dbPath);
  // O schema e os repositories usam now() (função do Postgres).
  // SQLite não a tem nativamente — registramos para manter o SQL compartilhado.
  sqlite.function('now', () => new Date().toISOString());
  console.log('[db] Using SQLite at', dbPath);
}

/**
 * Compat export: `pool` é referenciado por migrateContacts.ts e routes/migrate.ts,
 * que só rodam em modo Postgres. Em modo SQLite, o proxy lança um erro claro.
 */
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    if (!pgPool) {
      throw new Error('Postgres indisponível: defina DATABASE_URL para usar pool.query()');
    }
    return (pgPool as any)[prop];
  },
});

// Convert Postgres placeholders (? → $N) for compatibility
function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Normalize params: undefined → null, boolean → 1/0
function normParams(params: any[]): any[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

/** Returns all rows */
export async function q(sql: string, params: any[] = []): Promise<any[]> {
  if (pgPool) {
    const res = await pgPool.query(toPg(sql), normParams(params));
    return res.rows;
  } else if (sqlite) {
    const stmt = sqlite.prepare(sql);
    const rows = stmt.all(...normParams(params));
    return rows as any[];
  }
  throw new Error('No database connection');
}

/** Returns first row or undefined */
export async function q1(sql: string, params: any[] = []): Promise<any> {
  const rows = await q(sql, params);
  return rows[0];
}

/** Execute and return rowCount */
export async function qe(sql: string, params: any[] = []): Promise<{ rowCount: number }> {
  if (pgPool) {
    const res = await pgPool.query(toPg(sql), normParams(params));
    return { rowCount: res.rowCount ?? 0 };
  } else if (sqlite) {
    const stmt = sqlite.prepare(sql);
    const result = stmt.run(...normParams(params));
    return { rowCount: result.changes };
  }
  throw new Error('No database connection');
}

/** Idempotent migration: creates tables if they don't exist */
export async function migrate(): Promise<void> {
  if (pgPool) {
    await pgPool.query(SCHEMA_PG);
    // Run ALTER statements for Postgres
    for (const sql of ALTERS_PG) {
      try { await pgPool.query(sql); } catch {}
    }
  } else if (sqlite) {
    sqlite.exec(SCHEMA_SQLITE);
  }
}

/**
 * INSERT idempotente, com sintaxe correta para cada dialeto.
 * Postgres não aceita `INSERT OR IGNORE`; SQLite não aceita `ON CONFLICT DO NOTHING`.
 */
const INSERT_IGNORE = pgPool
  ? `ON CONFLICT DO NOTHING`
  : `OR IGNORE`;

/** Seed default data (idempotent) */
export async function seedDefaults(): Promise<void> {
  const stages = [
    ['stage_new', 'Novo Lead', '#3b82f6', 0, 1, 0, 0],
    ['stage_cald', 'Caldeiraria', '#f59e0b', 1, 0, 0, 0],
    ['stage_usin', 'Usinagem', '#8b5cf6', 2, 0, 0, 0],
    ['stage_sold', 'Soldagem', '#ef4444', 3, 0, 0, 0],
    ['stage_proj', 'Projetos', '#06b6d4', 4, 0, 0, 0],
    ['stage_atend', 'Em Atendimento', '#ff6b1a', 5, 0, 0, 0],
    ['stage_orc', 'Orçamento', '#eab308', 6, 0, 0, 0],
    ['stage_neg', 'Negociação', '#ec4899', 7, 0, 0, 0],
    ['stage_won', 'Fechado', '#10b981', 8, 0, 1, 0],
    ['stage_lost', 'Perdido', '#6b7280', 9, 0, 0, 1],
  ];

  for (const s of stages) {
    await qe(
      `INSERT INTO pipeline_stages (id, name, color, position, is_initial, is_won, is_lost) VALUES (?, ?, ?, ?, ?, ?, ?) ${INSERT_IGNORE}`,
      s
    );
  }

  const services = [
    ['srv_cald_leve', 'Caldeiraria Leve', 'caldeiraria-leve', 'Fabricação de estruturas metálicas leves, suportes, gabaritos e componentes sob medida.', 'Caldeiraria', 1],
    ['srv_cald_media', 'Caldeiraria Média', 'caldeiraria-media', 'Estruturas metálicas de médio porte, bases para equipamentos, mezaninos, escadas e plataformas.', 'Caldeiraria', 2],
    ['srv_cald_pesada', 'Caldeiraria Pesada', 'caldeiraria-pesada', 'Caldeiraria pesada para indústria, mineração e construção civil. Estruturas robustas de grande porte.', 'Caldeiraria', 3],
    ['srv_sold', 'Soldagem', 'soldagem', 'Serviços de soldagem MIG, TIG, eletrodo revestido e arame tubular. Soldadores qualificados.', 'Soldagem', 4],
    ['srv_usin', 'Usinagem', 'usinagem', 'Usinagem de precisão em tornos, fresas e centros de usinagem. Peças sob desenho técnico.', 'Usinagem', 5],
    ['srv_ferr', 'Ferramentaria', 'ferramentaria', 'Fabricação de ferramentas, dispositivos, gabaritos e fixtures para linha de produção.', 'Ferramentaria', 6],
    ['srv_proj', 'Fabricação e Projetos', 'fabricacao-projetos', 'Engenharia e fabricação de projetos customizados, do desenho técnico à entrega final.', 'Projetos', 7],
  ];

  for (const s of services) {
    await qe(
      `INSERT INTO services (id, name, slug, description, category, position) VALUES (?, ?, ?, ?, ?, ?) ${INSERT_IGNORE}`,
      s
    );
  }

  const settings: Record<string, string> = {
    company_name: 'Pes Metal',
    company_cnpj: '39.350.593.0001/51',
    company_phone: '(15) 99834-5539',
    company_whatsapp: '5515998345539',
    company_email: 'caldeirariapes@gmail.com',
    company_address: 'R. Jaziel Azeredo Ribeiro, 365 B3 - Votorantim/SP - 18112180',
    company_website: 'pesmetalcaldeiraria.com.br',
    company_logo: '',
    company_business_hours: 'Segunda a Sexta, 08:00 às 18:00',
    company_experience_years: '30',
    company_about: 'Há mais de 30 anos no mercado, a Pes Metal é referência em caldeiraria leve, média e pesada, soldagem, usinagem e fabricação de projetos industriais. Atendemos indústria, mineração, terraplenagem e construção civil com qualidade, prazo e seriedade.',
    company_mission: '',
    company_vision: '',
    company_values: '',
    whatsapp_default_message: 'Olá! Vim pelo site da Pes Metal e gostaria de um orçamento.',
    automation_off_hours_message: 'Olá! Recebemos sua mensagem fora do nosso horário de atendimento. Retornaremos assim que possível. Nosso horário é de segunda a sexta, das 08h às 18h.',
  };

  for (const [k, v] of Object.entries(settings)) {
    await qe(`INSERT INTO company_settings (key, value) VALUES (?, ?) ${INSERT_IGNORE}`, [k, v]);
  }
}

// Postgres schema
const SCHEMA_PG = `
CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL, password_hash text NOT NULL, role text NOT NULL DEFAULT 'atendente', avatar text, active integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS pipeline_stages (id text PRIMARY KEY, name text NOT NULL, color text NOT NULL DEFAULT '#ff6b1a', position integer NOT NULL DEFAULT 0, is_initial integer NOT NULL DEFAULT 0, is_won integer NOT NULL DEFAULT 0, is_lost integer NOT NULL DEFAULT 0, active integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS services (id text PRIMARY KEY, name text NOT NULL, slug text UNIQUE NOT NULL, description text, image text, category text, position integer NOT NULL DEFAULT 0, active integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS contacts (id text PRIMARY KEY, name text, phone text UNIQUE, email text, company text, whatsapp_id text, tags text, notes text, avatar text, custom_name text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS leads (id text PRIMARY KEY, contact_id text REFERENCES contacts(id) ON DELETE SET NULL, stage_id text REFERENCES pipeline_stages(id), service_id text REFERENCES services(id), assigned_user_id text REFERENCES users(id), name text NOT NULL, company text, email text, phone text, interest text, priority text DEFAULT 'medium', estimated_value double precision DEFAULT 0, status text NOT NULL DEFAULT 'active', source text, origin text, campaign text, adset text, ad_name text, landing_page text, referrer text, utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text, fbclid text, gclid text, tracking_session_id text, description text, quantity text, deadline text, notes text, last_contact_at timestamptz, next_contact_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS lead_notes (id text PRIMARY KEY, lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE, user_id text REFERENCES users(id), content text NOT NULL, type text DEFAULT 'note', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS lead_events (id text PRIMARY KEY, lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE, user_id text REFERENCES users(id), type text NOT NULL, payload text, description text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS lead_files (id text PRIMARY KEY, lead_id text REFERENCES leads(id) ON DELETE SET NULL, user_id text REFERENCES users(id), uploaded_by text, filename text NOT NULL, mime text, size integer, path text NOT NULL, uploaded_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS whatsapp_conversations (id text PRIMARY KEY, contact_id text NOT NULL REFERENCES contacts(id) ON DELETE CASCADE, lead_id text REFERENCES leads(id), assigned_user_id text REFERENCES users(id), automation_id text, status text NOT NULL DEFAULT 'active', automation_status text DEFAULT 'idle', current_node text, context text, instance_id text, last_message_at timestamptz, human_started_at timestamptz, human_started_by text, closed_at timestamptz, closed_by text, unread_count integer DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS whatsapp_messages (id text PRIMARY KEY, conversation_id text NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE, external_id text UNIQUE, direction text NOT NULL, type text DEFAULT 'text', content text, media_url text, media_mime text, status text DEFAULT 'pending', sent_by_user_id text REFERENCES users(id), error text, metadata text, client_id text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS automations (id text PRIMARY KEY, name text NOT NULL, description text, trigger text NOT NULL, keyword text, status text DEFAULT 'draft', graph text, initial_message text, options text, invalid_message text, instance_ids text NOT NULL DEFAULT '[]', closing_message text, steps text, step_options text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS appointments (id text PRIMARY KEY, lead_id text REFERENCES leads(id) ON DELETE CASCADE, user_id text REFERENCES users(id), contact_id text, quote_id text, title text NOT NULL, type text DEFAULT 'meeting', date text NOT NULL, time text, duration_min integer DEFAULT 60, notes text, status text DEFAULT 'scheduled', location text, category text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS quotes (id text PRIMARY KEY, number text UNIQUE, lead_id text, contact_id text, user_id text REFERENCES users(id), title text NOT NULL, description text, amount double precision DEFAULT 0, currency text DEFAULT 'BRL', valid_until text, status text DEFAULT 'draft', notes text, items text, delivery_text text, delivery_date text, retention_expires_at timestamptz DEFAULT (now() + '15 days'), sent_at timestamptz, sent_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS projects (id text PRIMARY KEY, name text NOT NULL, slug text UNIQUE NOT NULL, description text, category text, client text, images text, featured integer NOT NULL DEFAULT 0, date text, active integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tracking_sessions (id text PRIMARY KEY, session_token text UNIQUE NOT NULL, utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text, fbclid text, gclid text, referrer text, landing_page text, user_agent text, ip text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS marketing_events (id text PRIMARY KEY, type text NOT NULL, lead_id text REFERENCES leads(id), contact_id text REFERENCES contacts(id), tracking_session_id text REFERENCES tracking_sessions(id), source text, payload text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS company_settings (key text PRIMARY KEY, value text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS integration_settings (key text PRIMARY KEY, value text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS whatsapp_instances (id text PRIMARY KEY, name text NOT NULL, sender_name text, description text, phone text, instance_name text NOT NULL, evolution_api_url text, evolution_api_key text, webhook_url text, webhook_events text DEFAULT '["messages.upsert","connection.update"]', is_default integer DEFAULT 0, status text DEFAULT 'disconnected', qr_code_base64 text, qr_expires_at timestamptz, connected_at timestamptz, error text, active integer DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS notifications (id text PRIMARY KEY, user_id text, type text, title text NOT NULL, body text, data text, read integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
`;

// SQLite schema
const SCHEMA_SQLITE = `
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'atendente', avatar TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS pipeline_stages (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#ff6b1a', position INTEGER NOT NULL DEFAULT 0, is_initial INTEGER NOT NULL DEFAULT 0, is_won INTEGER NOT NULL DEFAULT 0, is_lost INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS services (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, description TEXT, image TEXT, category TEXT, position INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, name TEXT, phone TEXT UNIQUE, email TEXT, company TEXT, whatsapp_id TEXT, tags TEXT, notes TEXT, avatar TEXT, custom_name TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, contact_id TEXT, stage_id TEXT, service_id TEXT, assigned_user_id TEXT, name TEXT NOT NULL, company TEXT, email TEXT, phone TEXT, interest TEXT, priority TEXT DEFAULT 'medium', estimated_value REAL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', source TEXT, origin TEXT, campaign TEXT, adset TEXT, ad_name TEXT, landing_page TEXT, referrer TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT, fbclid TEXT, gclid TEXT, tracking_session_id TEXT, description TEXT, quantity TEXT, deadline TEXT, notes TEXT, last_contact_at TEXT, next_contact_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS lead_notes (id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, user_id TEXT, content TEXT NOT NULL, type TEXT DEFAULT 'note', created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS lead_events (id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, user_id TEXT, type TEXT NOT NULL, payload TEXT, description TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS lead_files (id TEXT PRIMARY KEY, lead_id TEXT, user_id TEXT, uploaded_by TEXT, filename TEXT NOT NULL, mime TEXT, size INTEGER, path TEXT NOT NULL, uploaded_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS whatsapp_conversations (id TEXT PRIMARY KEY, contact_id TEXT NOT NULL, lead_id TEXT, assigned_user_id TEXT, automation_id TEXT, status TEXT NOT NULL DEFAULT 'active', automation_status TEXT DEFAULT 'idle', current_node TEXT, context TEXT, instance_id TEXT, last_message_at TEXT, human_started_at TEXT, human_started_by TEXT, closed_at TEXT, closed_by TEXT, unread_count INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS whatsapp_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, external_id TEXT UNIQUE, direction TEXT NOT NULL, type TEXT DEFAULT 'text', content TEXT, media_url TEXT, media_mime TEXT, status TEXT DEFAULT 'pending', sent_by_user_id TEXT, error TEXT, metadata TEXT, client_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS automations (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, trigger TEXT NOT NULL, keyword TEXT, status TEXT DEFAULT 'draft', graph TEXT, initial_message TEXT, options TEXT, invalid_message TEXT, instance_ids TEXT NOT NULL DEFAULT '[]', closing_message TEXT, steps TEXT, step_options TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS appointments (id TEXT PRIMARY KEY, lead_id TEXT, user_id TEXT, contact_id TEXT, quote_id TEXT, title TEXT NOT NULL, type TEXT DEFAULT 'meeting', date TEXT NOT NULL, time TEXT, duration_min INTEGER DEFAULT 60, notes TEXT, status TEXT DEFAULT 'scheduled', location TEXT, category TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, number TEXT UNIQUE, lead_id TEXT, contact_id TEXT, user_id TEXT, title TEXT NOT NULL, description TEXT, amount REAL DEFAULT 0, currency TEXT DEFAULT 'BRL', valid_until TEXT, status TEXT DEFAULT 'draft', notes TEXT, items TEXT, delivery_text TEXT, delivery_date TEXT, retention_expires_at TEXT DEFAULT (datetime('now', '+15 days')), sent_at TEXT, sent_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, description TEXT, category TEXT, client TEXT, images TEXT, featured INTEGER NOT NULL DEFAULT 0, date TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS tracking_sessions (id TEXT PRIMARY KEY, session_token TEXT UNIQUE NOT NULL, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT, fbclid TEXT, gclid TEXT, referrer TEXT, landing_page TEXT, user_agent TEXT, ip TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS marketing_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, lead_id TEXT, contact_id TEXT, tracking_session_id TEXT, source TEXT, payload TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS company_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS integration_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS whatsapp_instances (id TEXT PRIMARY KEY, name TEXT NOT NULL, sender_name TEXT, description TEXT, phone TEXT, instance_name TEXT NOT NULL, evolution_api_url TEXT, evolution_api_key TEXT, webhook_url TEXT, webhook_events TEXT DEFAULT '["messages.upsert","connection.update"]', is_default INTEGER DEFAULT 0, status TEXT DEFAULT 'disconnected', qr_code_base64 TEXT, qr_expires_at TEXT, connected_at TEXT, error TEXT, active INTEGER DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT, type TEXT, title TEXT NOT NULL, body TEXT, data TEXT, read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON notifications (user_id, read, created_at DESC);
`;

// Postgres ALTER statements
const ALTERS_PG = [
  `ALTER TABLE automations ADD COLUMN IF NOT EXISTS steps text`,
  `ALTER TABLE automations ADD COLUMN IF NOT EXISTS step_options text`,
  `ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS client_id text`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_client_id ON whatsapp_messages(client_id) WHERE client_id IS NOT NULL`,
];
