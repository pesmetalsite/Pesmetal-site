/**
 * Migração inicial + seed.
 */
import { migrate, db, SCHEMA } from './db.js';

migrate();

// Seed: Estágios do pipeline
const stagesCount = (db.prepare('SELECT COUNT(*) as c FROM pipeline_stages').get() as any).c;
if (stagesCount === 0) {
  const insert = db.prepare(`
    INSERT INTO pipeline_stages (id, name, color, position, is_initial, is_won, is_lost)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
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
  console.log('✓ Estágios do pipeline criados');
}

const servicesCount = (db.prepare('SELECT COUNT(*) as c FROM services').get() as any).c;
if (servicesCount === 0) {
  const insert = db.prepare(`
    INSERT INTO services (id, name, slug, description, category, position, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
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
  console.log('✓ Serviços cadastrados');
}

const settingsCount = (db.prepare('SELECT COUNT(*) as c FROM company_settings').get() as any).c;
if (settingsCount === 0) {
  const insert = db.prepare(`INSERT INTO company_settings (key, value) VALUES (?, ?)`);
  const defaults: Record<string, string> = {
    company_name: 'Pes Metal',
    company_phone: '',
    company_whatsapp: '',
    company_email: '',
    company_address: '',
    company_city: 'Sorocaba',
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
  console.log('✓ Configurações da empresa inicializadas');
}

console.log('✓ Migração concluída');
process.exit(0);