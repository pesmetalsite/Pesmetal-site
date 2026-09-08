-- PESMETAL — Postgres (Supabase) schema
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
    last_message_at timestamptz,
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
