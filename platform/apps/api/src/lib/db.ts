/**
 * PESMETAL — Database Adapter (Supabase Postgres via `pg`).
 * Camada de acesso a dados assíncrona com helpers q/q1/qe.
 */

import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || '';
const isSupabase = /supabase\.co|supabase\.com/i.test(DATABASE_URL);

// Remove `sslmode` da connection string: pg-connection-string trata `sslmode=require`
// como verify-full (rejectUnauthorized: true) e rejeita o certificado self-signed do
// Supabase. O ssl é controlado explicitamente abaixo.
const connectionString = isSupabase
  ? DATABASE_URL.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, '')
  : DATABASE_URL;

export const pool = new Pool({
  connectionString,
  ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
});

/**
 * Converte placeholders `?` (SQLite) para `$N` (Postgres).
 */
function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/**
 * Normaliza parâmetros: undefined → null (pg rejeita undefined),
 * boolean → 1/0 (colunas integer).
 */
function normParams(params: any[]): any[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

/** Retorna todas as linhas (equivalente a `all()`). */
export async function q(sql: string, params: any[] = []): Promise<any[]> {
  const res = await pool.query(toPg(sql), normParams(params));
  return res.rows;
}

/** Retorna a primeira linha ou undefined (equivalente a `get()`). */
export async function q1(sql: string, params: any[] = []): Promise<any> {
  const rows = await q(sql, params);
  return rows[0];
}

/** Executa e retorna rowCount (equivalente a `run()`). */
export async function qe(sql: string, params: any[] = []): Promise<{ rowCount: number }> {
  const res = await pool.query(toPg(sql), normParams(params));
  return { rowCount: res.rowCount ?? 0 };
}

/** Migração idempotente: cria as tabelas se não existirem. */
export async function migrate(): Promise<void> {
  await pool.query(SCHEMA);

  // Colunas novas em `automations` (numérico simples) — idempotente via IF NOT EXISTS.
  // Não destroem o `graph` existente; automações antigas continuam funcionando.
  const alters = [
    `ALTER TABLE automations ADD COLUMN IF NOT EXISTS initial_message text`,
    `ALTER TABLE automations ADD COLUMN IF NOT EXISTS options text`,
    `ALTER TABLE automations ADD COLUMN IF NOT EXISTS invalid_message text`,
    `ALTER TABLE automations ADD COLUMN IF NOT EXISTS instance_ids text NOT NULL DEFAULT '[]'`,
    `ALTER TABLE automations ADD COLUMN IF NOT EXISTS closing_message text`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_activity_at timestamptz`,
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS custom_name text`,
    `ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS instance_id text`,
    `ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS human_started_at timestamptz`,
    `ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS human_started_by text`,
    `ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS closed_at timestamptz`,
    `ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS closed_by text`,
    `ALTER TABLE quotes ADD COLUMN IF NOT EXISTS contact_id text REFERENCES contacts(id) ON DELETE SET NULL`,
    `ALTER TABLE quotes ALTER COLUMN lead_id DROP NOT NULL`,
    `ALTER TABLE quotes ADD COLUMN IF NOT EXISTS conversation_id text`,
    `ALTER TABLE quotes ADD COLUMN IF NOT EXISTS retention_expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 days')`,
    `ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sent_at timestamptz`,
    `ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sent_by text REFERENCES users(id)`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS document text`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS address_line text`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS address_city text`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS address_state text`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS address_zip text`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS address_neighborhood text`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS state_registration text`,
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS document text`,
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_line text`,
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_city text`,
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_state text`,
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_zip text`,
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_neighborhood text`,
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS state_registration text`,
  ];
  for (const sql of alters) {
    try {
      await pool.query(sql);
    } catch (err: any) {
      console.warn('[migrate] alter ignorado', { sql, error: String(err?.message || err) });
    }
  }
}

/** Seed de dados padrão (idempotente) — roda na inicialização. */
export async function seedDefaults(): Promise<void> {
  const insertStage = `
    INSERT INTO pipeline_stages (id, name, color, position, is_initial, is_won, is_lost)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (id) DO NOTHING
  `;
  const stageDefaults: any[][] = [
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
  for (const s of stageDefaults) await pool.query(insertStage, s);

  const insertService = `
    INSERT INTO services (id, name, slug, description, category, position, active)
    VALUES ($1, $2, $3, $4, $5, $6, 1)
    ON CONFLICT (id) DO NOTHING
  `;
  const serviceDefaults: any[][] = [
    ['srv_cald_leve', 'Caldeiraria Leve', 'caldeiraria-leve', 'Fabricação de estruturas metálicas leves, suportes, gabaritos e componentes sob medida.', 'Caldeiraria', 1],
    ['srv_cald_media', 'Caldeiraria Média', 'caldeiraria-media', 'Estruturas metálicas de médio porte, bases para equipamentos, mezaninos, escadas e plataformas.', 'Caldeiraria', 2],
    ['srv_cald_pesada', 'Caldeiraria Pesada', 'caldeiraria-pesada', 'Caldeiraria pesada para indústria, mineração e construção civil. Estruturas robustas de grande porte.', 'Caldeiraria', 3],
    ['srv_sold', 'Soldagem', 'soldagem', 'Serviços de soldagem MIG, TIG, eletrodo revestido e arame tubular. Soldadores qualificados.', 'Soldagem', 4],
    ['srv_usin', 'Usinagem', 'usinagem', 'Usinagem de precisão em tornos, fresas e centros de usinagem. Peças sob desenho técnico.', 'Usinagem', 5],
    ['srv_ferr', 'Ferramentaria', 'ferramentaria', 'Fabricação de ferramentas, dispositivos, gabaritos e fixtures para linha de produção.', 'Ferramentaria', 6],
    ['srv_proj', 'Fabricação e Projetos', 'fabricacao-projetos', 'Engenharia e fabricação de projetos customizados, do desenho técnico à entrega final.', 'Projetos', 7],
  ];
  for (const s of serviceDefaults) await pool.query(insertService, s);

  const insertSetting = `
    INSERT INTO company_settings (key, value)
    VALUES ($1, $2)
    ON CONFLICT (key) DO NOTHING
  `;
  const settingDefaults: Record<string, string> = {
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
  for (const [k, v] of Object.entries(settingDefaults)) await pool.query(insertSetting, [k, v]);
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY,
    email text UNIQUE NOT NULL,
    name text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL DEFAULT 'atendente',
    avatar text,
    active integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
    id text PRIMARY KEY,
    name text NOT NULL,
    color text NOT NULL DEFAULT '#ff6b1a',
    position integer NOT NULL DEFAULT 0,
    is_initial integer NOT NULL DEFAULT 0,
    is_won integer NOT NULL DEFAULT 0,
    is_lost integer NOT NULL DEFAULT 0,
    active integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services (
    id text PRIMARY KEY,
    name text NOT NULL,
    slug text UNIQUE NOT NULL,
    description text,
    image text,
    category text,
    position integer NOT NULL DEFAULT 0,
    active integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
    id text PRIMARY KEY,
    name text NOT NULL,
    slug text UNIQUE NOT NULL,
    description text,
    category text,
    client text,
    images text,
    featured integer NOT NULL DEFAULT 0,
    date text,
    active integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
    id text PRIMARY KEY,
    name text,
    phone text UNIQUE,
    email text,
    company text,
    whatsapp_id text,
    tags text,
    notes text,
    avatar text,
    custom_name text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
    id text PRIMARY KEY,
    contact_id text REFERENCES contacts(id) ON DELETE SET NULL,
    stage_id text REFERENCES pipeline_stages(id),
    service_id text REFERENCES services(id),
    assigned_user_id text REFERENCES users(id),
    name text NOT NULL,
    company text,
    email text,
    phone text,
    interest text,
    priority text DEFAULT 'medium',
    estimated_value double precision DEFAULT 0,
    status text NOT NULL DEFAULT 'active',
    source text,
    origin text,
    campaign text,
    adset text,
    ad_name text,
    landing_page text,
    referrer text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    utm_term text,
    fbclid text,
    gclid text,
    tracking_session_id text,
    description text,
    quantity text,
    deadline text,
    notes text,
    last_contact_at timestamptz,
    next_contact_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_notes (
    id text PRIMARY KEY,
    lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id text REFERENCES users(id),
    content text NOT NULL,
    type text DEFAULT 'note',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_events (
    id text PRIMARY KEY,
    lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id text REFERENCES users(id),
    type text NOT NULL,
    payload text,
    description text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_files (
    id text PRIMARY KEY,
    lead_id text REFERENCES leads(id) ON DELETE SET NULL,
    user_id text REFERENCES users(id),
    uploaded_by text,
    filename text NOT NULL,
    mime text,
    size integer,
    path text NOT NULL,
    uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
    id text PRIMARY KEY,
    contact_id text NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    lead_id text REFERENCES leads(id),
    assigned_user_id text REFERENCES users(id),
    automation_id text,
    status text NOT NULL DEFAULT 'active',
    automation_status text DEFAULT 'idle',
    current_node text,
    context text,
    instance_id text,
    last_message_at timestamptz,
    human_started_at timestamptz,
    human_started_by text,
    closed_at timestamptz,
    closed_by text,
    unread_count integer DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id text PRIMARY KEY,
    conversation_id text NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
    external_id text UNIQUE,
    direction text NOT NULL,
    type text DEFAULT 'text',
    content text,
    media_url text,
    media_mime text,
    status text DEFAULT 'pending',
    sent_by_user_id text REFERENCES users(id),
    error text,
    metadata text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automations (
    id text PRIMARY KEY,
    name text NOT NULL,
    description text,
    trigger text NOT NULL,
    keyword text,
    status text DEFAULT 'draft',
    graph text,
    initial_message text,
    options text,
    invalid_message text,
    instance_ids text NOT NULL DEFAULT '[]',
    closing_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointments (
    id text PRIMARY KEY,
    lead_id text REFERENCES leads(id) ON DELETE CASCADE,
    user_id text REFERENCES users(id),
    title text NOT NULL,
    type text DEFAULT 'meeting',
    date text NOT NULL,
    time text,
    duration_min integer DEFAULT 60,
    notes text,
    status text DEFAULT 'scheduled',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotes (
    id text PRIMARY KEY,
    number text UNIQUE,
    lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id text REFERENCES users(id),
    title text NOT NULL,
    description text,
    amount double precision DEFAULT 0,
    currency text DEFAULT 'BRL',
    valid_until text,
    status text DEFAULT 'draft',
    notes text,
    items text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracking_sessions (
    id text PRIMARY KEY,
    session_token text UNIQUE NOT NULL,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    utm_term text,
    fbclid text,
    gclid text,
    referrer text,
    landing_page text,
    user_agent text,
    ip text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_events (
    id text PRIMARY KEY,
    type text NOT NULL,
    lead_id text REFERENCES leads(id),
    contact_id text REFERENCES contacts(id),
    tracking_session_id text REFERENCES tracking_sessions(id),
    source text,
    payload text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_settings (
    key text PRIMARY KEY,
    value text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_settings (
    key text PRIMARY KEY,
    value text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_instances (
    id text PRIMARY KEY,
    name text NOT NULL,
    sender_name text,
    description text,
    phone text,
    instance_name text NOT NULL,
    evolution_api_url text,
    evolution_api_key text,
    webhook_url text,
    webhook_events text DEFAULT '["messages.upsert","connection.update"]',
    is_default integer DEFAULT 0,
    status text DEFAULT 'disconnected',
    qr_code_base64 text,
    qr_expires_at timestamptz,
    connected_at timestamptz,
    error text,
    active integer DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
    id text PRIMARY KEY,
    user_id text,
    type text,
    title text NOT NULL,
    body text,
    data text,
    read integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
    ON notifications (user_id, read, created_at DESC);

`;
