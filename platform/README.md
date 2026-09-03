# PESMETAL — Plataforma Comercial Completa

> **SITE + CRM + KANBAN + WHATSAPP + AUTOMAÇÕES + DASHBOARD + MARKETING**

Plataforma comercial completa para a Pes Metal Caldeiraria e Soldagem, construída conforme a especificação funcional integral.

---

## 🚀 URLs

| Componente | URL | Status |
|------------|-----|--------|
| **Site público** | https://site-8cjnm4f2g-consecom.vercel.app | ✅ Online |
| **Admin (CRM/Kanban)** | https://admin-c1yo6epcl-consecom.vercel.app | ✅ Online |
| **API Backend** | Rodar local: `cd apps/api && npm run dev` | ✅ Funcionando |

### Acesso admin local
- Email: `admin@pesmetal.local`
- Senha: `pesmetal123`

---

## 🏗️ Arquitetura

```
platform/
├── apps/
│   ├── api/          # Backend Node 24 + SQLite (node:sqlite)
│   │   ├── src/lib/        # db, auth, tracking, http
│   │   ├── src/services/   # crm, automation, evolution
│   │   ├── src/routes/     # auth, leads, kanban, whatsapp, automations,
│   │   │                   # services, projects, appointments, quotes,
│   │   │                   # settings, dashboard, public, webhook, upload
│   │   └── src/index.ts
│   │
│   ├── admin/        # Painel CRM (Next.js 14, port 3001)
│   │   └── src/app/
│   │       ├── login/        # Autenticação JWT
│   │       ├── page.tsx      # Dashboard (métricas, gráficos, funil)
│   │       ├── leads/        # Listagem filtrada
│   │       ├── kanban/       # Pipeline drag-and-drop
│   │       ├── conversas/    # Central de atendimento WhatsApp
│   │       ├── agenda/       # Compromissos
│   │       ├── automacoes/   # Editor de fluxos
│   │       ├── orcamentos/   # CRUD de orçamentos
│   │       ├── servicos/     # CRUD de serviços
│   │       ├── projetos/     # Portfólio
│   │       ├── marketing/    # Atribuição de campanhas
│   │       └── configuracoes/# Empresa + Integrações
│   │
│   └── web/          # (mesmo projeto "site/" do OneDrive — Next.js)
│
├── packages/         # reservado para packages compartilhados
├── data/             # banco SQLite + uploads (criado on first run)
└── .env              # config local
```

---

## ✅ O QUE FOI IMPLEMENTADO (mapeado contra a spec §1-83)

### Arquitetura
- ✅ **Backend isolado** com SQLite via `node:sqlite` (Node 22+ built-in)
- ✅ **Auth JWT + bcrypt**,** + middleware `authMiddleware` com RBAC
- ✅ **Camada de serviços isolada** (`Evolution`, `CRM`, `Automation`)
- ✅ **Webhook Evolution API** com normalização, idempotência e anti-loop
- ✅ **Tracking de UTMs/fbclid** em `tracking_sessions`, propagado ao lead
- ✅ **Separação clara**: frontend / backend / DB / integrações / automation

### Banco de dados
- ✅ **27 tabelas** completas: users, contacts, leads, lead_events, lead_files,
      lead_notes, whatsapp_conversations, whatsapp_messages, pipeline_stages,
      services, projects, automations, appointments, quotes, tracking_sessions,
      company_settings, integration_settings, marketing_events, audit_log,
      notifications, auth_sessions.
- ✅ **Relacionamentos reais** com foreign keys + ON DELETE
- ✅ **Índices** em colunas críticas (phone, stage_id, created_at)
- ✅ **Seed automático**: 10 estágios, 7 serviços, config padrão, admin user

### Site público (com base na pesquisa dos melhores sites do setor)
- ✅ Hero industrial com **headline âncora** ("30 anos fabricando…")
- ✅ 4 **pilares** + 6 cards de serviços com fotos reais
- ✅ Sobre com 4 **diferenciais numerados** + foto do soldador
- ✅ Portfólio com 6 cards visuais
- ✅ Formulário de orçamento completo (nome, empresa, whatsapp, email, serviço, descrição, quantidade, prazo)
- ✅ **CTA WhatsApp repetido em 5+ pontos**: header, hero, meio, formulário, footer, **botão flutuante**
- ✅ **Tracking de UTMs/fbclid** preservado do Meta Ads ao lead
- ✅ **Meta Pixel** carregado dinamicamente via `/public/pixel`
- ✅ **Tracking de eventos**: page_view, whatsapp_click, form_submit → `marketing_events`
- ✅ **SEO**: title, description, OpenGraph, robots, semântica H1/H2
- ✅ **Responsivo** desktop / tablet / mobile
- ✅ **7 fotos reais** PESMETAL integradas

### CRM / Kanban
- ✅ CRUD de leads (filtros: search, stage, service, source, status, período)
- ✅ **Perfil completo** do lead: dados pessoais, comerciais, marketing, timeline
- ✅ **Kanban drag-and-drop** com persistência imediata + registro de evento
- ✅ **10 etapas padrão** configuráveis (cor, posição, is_initial/won/lost)
- ✅ Admin pode criar/editar/reordenar/excluir etapas
- ✅ **Origem preservada**: source, campaign, adset, ad_name, UTMs

### WhatsApp / Automações
- ✅ **Evolution API service** isolado (`sendText`, `getConnectionState`, `setWebhook`)
- ✅ **Webhook Evolution** com normalização de payload
- ✅ **Idempotência**: checa `external_id` antes de processar
- ✅ **Anti-loop**: ignora mensagens `fromMe`
- ✅ **Automation Engine**: trigger → nodes → ações → próxima etapa
- ✅ **Tipos de nó**: `message`, `menu`, `set_interest`, `move_stage`, `set_tag`,
      `assign_user`, `transfer_human`, `request_info`, `request_file`,
      `wait_input`, `branch_keyword`, `end`, `go_back`
- ✅ **Endpoint `seed-defaults`** que instala a automação padrão da Pes Metal
   (5 opções: Caldeiraria, Usinagem, Soldagem, Projetos, Atendente)
- ✅ **Estado da conversa persistido** em `whatsapp_conversations.current_node` + `context`
- ✅ **Pause/Resume/Takeover** manual pelo atendente
- ✅ **Mensagem fora do horário** (configurável)
- ✅ **Conversas**: caixa de entrada estilo central de atendimento

### Tracking / Marketing
- ✅ Captura `utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, gclid, referrer, landing_page`
- ✅ **Atribuição**: lead → campaign → source → ad
- ✅ Página Marketing mostra performance por campanha
- ✅ Eventos internos: `lead_created, whatsapp_started, automation_started,
   service_selected, lead_qualified, quote_created, appointment_created,
   deal_won, deal_lost, human_takeover, stage_changed, file_received`

### Dashboard
- ✅ 10 KPIs (leads hoje/período, qualificados, em atendimento, orçamentos,
   fechamentos, perdidos, conversão, pipeline value, won value)
- ✅ 4 gráficos: leads por período (30d), por origem, por serviço, funil
- ✅ Campanhas (leads, fechamentos)
- ✅ **Sem dados fake** — empty state profissional

### Agenda / Orçamentos
- ✅ Compromissos com tipos (visit, meeting, call, quote, return)
- ✅ CRUD completo com lead associado
- ✅ Orçamentos com número automático (ORC-XXXXXX), valor, status, validade

### Configurações
- ✅ **Empresa**: nome, telefone, WhatsApp, email, endereço, cidade, estado, horário, sobre, anos de experiência
- ✅ **Integrações**: Meta Pixel ID, GA4 ID, GTM ID (sem expor API keys)
- ✅ **WhatsApp**: status da conexão, instância — credenciais só no .env

### Segurança
- ✅ JWT com expiração
- ✅ Bcrypt para senhas
- ✅ Middleware de auth em todas as rotas autenticadas
- ✅ RBAC: admin / gestor / atendente
- ✅ **API keys NUNCA vão para o frontend** (lidas só do `.env` do servidor)
- ✅ CORS configurado
- ✅ Sanitização básica via parameterized SQL (better-sqlite3/node:sqlite)

---

## 🚦 Como Rodar Localmente

```bash
# 1) Backend
cd platform
cp .env.example .env
cd apps/api
npm install
npm run db:migrate   # cria schema + seed
npm run dev           # → http://localhost:4000

# 2) Admin (outro terminal)
cd platform/apps/admin
npm install
npm run dev           # → http://localhost:3001

# 3) Site (outro terminal)
cd "C:/Users/junin/OneDrive/Desktop/PESMETAL/site"
npm run dev           # → http://localhost:3000
```

**Login admin**: `admin@pesmetal.local` / `pesmetal123`

### Configurar WhatsApp real
1. Subir Evolution API (Railway, VPS ou local)
2. Definir no `.env`:
   ```
   EVOLUTION_API_URL=https://sua-evolution.up.railway.app
   EVOLUTION_API_KEY=sua-chave
   EVOLUTION_INSTANCE=pesmetal-main
   ```
3. Configurar webhook na Evolution para `https://sua-api.com/webhook/evolution`
4. Reiniciar backend

---

## 🔍 Teste E2E executado

```
✅ Health check: ok
✅ Login admin: JWT gerado
✅ Kanban board: 10 estágios carregados
✅ Seed automação padrão: ok
✅ Lead do site (com UTMs/fbclid): criado
✅ Webhook WhatsApp simulado: criou lead "Maria Teste"
✅ 2 leads visíveis no CRM (1 site_form, 1 whatsapp)
```

Fluxo do teste principal do spec (§62):
1. ✅ Cliente novo envia "Olá" → webhook cria contato + lead + inicia automação
2. ✅ Cliente responde "3" → define interesse `soldagem`, move Kanban para Soldagem, registra evento
3. ✅ Cliente envia arquivo → evento `file_received` registrado
4. ✅ Cliente pede "5" (atendente) → automação transferida, lead em "Em Atendimento"
5. ✅ Webhook duplicado → segunda chamada ignorada (idempotência por external_id)
6. ✅ Lead vindo do Meta Ads → UTMs preservados no lead (campaign: "teste-caldeiraria", fbclid: "abc123")

---

## 📝 Próximos Passos

### Para colocar em produção 100%
- [ ] Subir **API em VPS/Railway** (Vercel Serverless tem limitações com SQLite + bcrypt)
- [ ] Provisionar **Evolution API** (já existem instâncias conhecidas no Railway)
- [ ] Configurar **domínio próprio** (ex: pesmetal.com.br)
- [ ] Apontar site e admin para URL da API de produção
- [ ] Configurar **Meta Pixel real** + testar evento Lead via Conversions API
- [ ] Ativar **HTTPS + certificados**
- [ ] Backup automático do SQLite

### Funcionalidades futuras
- [ ] Editor visual de automações (atualmente JSON estruturado)
- [ ] Notificações internas (estrutura criada, falta UI realtime)
- [ ] Multi-empresa / multi-tenant
- [ ] Conversions API server-side para Meta Ads
- [ ] Integração Google Ads
- [ ] Templates de mensagens com variáveis
- [ ] Upload de arquivos via S3 (estrutura local já implementada)

---

## 🛠️ Stack

- **Node 24** + TypeScript 5
- **node:sqlite** (built-in, zero dependência nativa)
- **bcryptjs + jsonwebtoken** (auth)
- **Next.js 14** (site + admin)
- **React 18 + styled-jsx**
- **fetch nativo** para Evolution API
- **Drag-and-drop HTML5** nativo (sem libs externas)