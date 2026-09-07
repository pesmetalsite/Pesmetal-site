/**
 * PESMETAL — Database Adapter
 * Usa node:sqlite (built-in Node 22+).
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = process.env.DATABASE_PATH || './data/pesmetal.db';
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec("PRAGMA encoding = 'UTF-8'");
db.exec('PRAGMA foreign_keys = ON');

export function migrate() {
  db.exec(SCHEMA);
}

/**
 * Seed de dados padrão (idempotente) — roda na inicialização para que o
 * banco de produção nunca fique vazio. Só insere quando a tabela está vazia.
 */
export function seedDefaults() {
  const stagesCount = (db.prepare('SELECT COUNT(*) as c FROM pipeline_stages').get() as any).c;
  if (stagesCount === 0) {
    const insert = db.prepare(
      `INSERT INTO pipeline_stages (id, name, color, position, is_initial, is_won, is_lost) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const defaults = [
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
    for (const s of defaults) insert.run(...s);
  }

  const servicesCount = (db.prepare('SELECT COUNT(*) as c FROM services').get() as any).c;
  if (servicesCount === 0) {
    const insert = db.prepare(
      `INSERT INTO services (id, name, slug, description, category, position, active) VALUES (?, ?, ?, ?, ?, ?, 1)`,
    );
    const svcs = [
      ['srv_cald_leve', 'Caldeiraria Leve', 'caldeiraria-leve', 'Fabricação de estruturas metálicas leves, suportes, gabaritos e componentes sob medida.', 'Caldeiraria', 1],
      ['srv_cald_media', 'Caldeiraria Média', 'caldeiraria-media', 'Estruturas metálicas de médio porte, bases para equipamentos, mezaninos, escadas e plataformas.', 'Caldeiraria', 2],
      ['srv_cald_pesada', 'Caldeiraria Pesada', 'caldeiraria-pesada', 'Caldeiraria pesada para indústria, mineração e construção civil. Estruturas robustas de grande porte.', 'Caldeiraria', 3],
      ['srv_sold', 'Soldagem', 'soldagem', 'Serviços de soldagem MIG, TIG, eletrodo revestido e arame tubular. Soldadores qualificados.', 'Soldagem', 4],
      ['srv_usin', 'Usinagem', 'usinagem', 'Usinagem de precisão em tornos, fresas e centros de usinagem. Peças sob desenho técnico.', 'Usinagem', 5],
      ['srv_ferr', 'Ferramentaria', 'ferramentaria', 'Fabricação de ferramentas, dispositivos, gabaritos e fixtures para linha de produção.', 'Ferramentaria', 6],
      ['srv_proj', 'Fabricação e Projetos', 'fabricacao-projetos', 'Engenharia e fabricação de projetos customizados, do desenho técnico à entrega final.', 'Projetos', 7],
    ];
    for (const s of svcs) insert.run(...s);
  }

  const settingsCount = (db.prepare('SELECT COUNT(*) as c FROM company_settings').get() as any).c;
  if (settingsCount === 0) {
    const insert = db.prepare(`INSERT INTO company_settings (key, value) VALUES (?, ?)`);
    const defaults: Record<string, string> = {
      company_name: 'Pes Metal',
      company_phone: '(15) 99834-5539',
      company_whatsapp: '5515998345539',
      company_email: 'contato@pesmetal.com.br',
      company_address: 'Av. Jaziel de Azeredo Ribeiro, 365 · Jardim Antônio Cassillo · Votorantim-SP · CEP 18112-180',
      company_city: 'Votorantim',
      company_state: 'SP',
      company_website: '',
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
    for (const [k, v] of Object.entries(defaults)) insert.run(k, v);
  }
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'atendente',
    avatar TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#ff6b1a',
    position INTEGER NOT NULL DEFAULT 0,
    is_initial INTEGER NOT NULL DEFAULT 0,
    is_won INTEGER NOT NULL DEFAULT 0,
    is_lost INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    image TEXT,
    category TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    category TEXT,
    client TEXT,
    images TEXT,
    featured INTEGER NOT NULL DEFAULT 0,
    date TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT,
    phone TEXT UNIQUE,
    email TEXT,
    company TEXT,
    whatsapp_id TEXT,
    tags TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    stage_id TEXT REFERENCES pipeline_stages(id),
    service_id TEXT REFERENCES services(id),
    assigned_user_id TEXT REFERENCES users(id),
    name TEXT NOT NULL,
    company TEXT,
    email TEXT,
    phone TEXT,
    interest TEXT,
    priority TEXT DEFAULT 'medium',
    estimated_value REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    source TEXT,
    origin TEXT,
    campaign TEXT,
    adset TEXT,
    ad_name TEXT,
    landing_page TEXT,
    referrer TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    fbclid TEXT,
    gclid TEXT,
    tracking_session_id TEXT,
    description TEXT,
    quantity TEXT,
    deadline TEXT,
    last_contact_at TEXT,
    next_contact_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lead_notes (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id),
    content TEXT NOT NULL,
    type TEXT DEFAULT 'note',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lead_events (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id),
    type TEXT NOT NULL,
    payload TEXT,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lead_files (
    id TEXT PRIMARY KEY,
    lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
    user_id TEXT REFERENCES users(id),
    filename TEXT NOT NULL,
    mime TEXT,
    size INTEGER,
    path TEXT NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    lead_id TEXT REFERENCES leads(id),
    assigned_user_id TEXT REFERENCES users(id),
    automation_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    automation_status TEXT DEFAULT 'idle',
    current_node TEXT,
    context TEXT,
    last_message_at TEXT,
    unread_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
    external_id TEXT UNIQUE,
    direction TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    content TEXT,
    media_url TEXT,
    status TEXT DEFAULT 'pending',
    sent_by_user_id TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    trigger TEXT NOT NULL,
    keyword TEXT,
    status TEXT DEFAULT 'draft',
    graph TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id),
    title TEXT NOT NULL,
    type TEXT DEFAULT 'meeting',
    date TEXT NOT NULL,
    time TEXT,
    duration_minutes INTEGER DEFAULT 60,
    notes TEXT,
    status TEXT DEFAULT 'scheduled',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    number TEXT UNIQUE,
    lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    amount REAL DEFAULT 0,
    currency TEXT DEFAULT 'BRL',
    valid_until TEXT,
    status TEXT DEFAULT 'draft',
    notes TEXT,
    items TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tracking_sessions (
    id TEXT PRIMARY KEY,
    session_token TEXT UNIQUE NOT NULL,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    fbclid TEXT,
    gclid TEXT,
    referrer TEXT,
    landing_page TEXT,
    user_agent TEXT,
    ip TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS marketing_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    lead_id TEXT REFERENCES leads(id),
    contact_id TEXT REFERENCES contacts(id),
    tracking_session_id TEXT REFERENCES tracking_sessions(id),
    source TEXT,
    payload TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS company_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS integration_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS whatsapp_instances (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sender_name TEXT,
    description TEXT,
    phone TEXT,
    instance_name TEXT NOT NULL,
    evolution_api_url TEXT,
    evolution_api_key TEXT,
    webhook_url TEXT,
    webhook_events TEXT DEFAULT '["messages.upsert","connection.update"]',
    is_default INTEGER DEFAULT 0,
    status TEXT DEFAULT 'disconnected',
    qr_code_base64 TEXT,
    qr_expires_at TEXT,
    connected_at TEXT,
    error TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

`;