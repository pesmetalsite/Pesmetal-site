# PESMETAL API

Backend do sistema PESMETAL — caldeiraria, soldagem, usinagem e CRM integrado com WhatsApp via Evolution API.

## Stack

- **Runtime:** Node.js 20+
- **Database:** SQLite (built-in `node:sqlite`) ou PostgreSQL
- **Auth:** JWT + bcrypt
- **Validação:** Zod
- **WhatsApp:** Evolution API v2
- **PDF:** pdfkit
- **Deploy:** Railway / Render / VPS

## Quick Start

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com seus valores

# 3. Iniciar em dev
npm run dev

# 4. (Opcional) Corrigir encoding UTF-8 do DB
npm run fix:encoding

# 5. Build para produção
npm run build
npm start
```

## Endpoints Principais

### Públicos (sem auth)
- `GET /health` — Health check
- `GET /public/company` — Dados da empresa
- `GET /public/services` — Lista serviços
- `GET /public/projects` — Lista projetos
- `GET /public/pixel` — Pixels Meta/GA/GTM
- `POST /public/leads` — Captura lead do site
- `POST /public/track` — Tracking de eventos

### Admin (requer JWT)
- `POST /auth/login` — Login
- `GET /auth/me` — Usuário atual
- `GET /leads` — Lista leads
- `POST /leads` — Criar lead
- `GET /leads/:id` — Detalhes do lead
- `PUT /leads/:id` — Atualizar
- `DELETE /leads/:id` — Deletar
- `POST /leads/:id/notes` — Adicionar nota
- `GET /kanban/board` — Board completo
- `POST /kanban/move` — Mover lead
- `GET /dashboard/metrics` — Métricas
- `GET /dashboard/funnel` — Funil
- `GET /whatsapp/status` — Status da conexão
- `GET /whatsapp/conversations` — Lista conversas
- `GET /whatsapp/conversations/:id/messages` — Mensagens
- `GET /quotes` — Lista orçamentos
- `POST /quotes` — Criar orçamento
- `GET /quotes/:id` — Detalhes
- `GET /quotes/:id/pdf` — Gerar PDF
- `GET /appointments` — Lista agendamentos
- `POST /appointments` — Criar
- `GET /services` / `GET /projects` / `GET /automations` etc.

### Webhook (Evolution API)
- `POST /webhook/evolution` — Recebe eventos da Evolution
- `GET /webhook/evolution` — Health check

## Deploy no Railway

```bash
# 1. Login
railway login

# 2. Criar projeto
railway init

# 3. Configurar env vars (via dashboard ou CLI)
railway variables --set JWT_SECRET="$(openssl rand -base64 32)"
railway variables --set EVOLUTION_API_URL="https://your-evolution.up.railway.app"
railway variables --set EVOLUTION_API_KEY="your-api-key"

# 4. Deploy
railway up
```

## Credenciais Padrão (criar no primeiro start)

- Email: `admin@pesmetal.local` (configurável via ADMIN_EMAIL)
- Senha: `pesmetal123` (configurável via ADMIN_PASSWORD)

⚠️ **Troque a senha padrão antes de ir para produção!**

## Estrutura

```
src/
├── index.ts            # Entry point
├── lib/
│   ├── db.ts          # SQLite + migrations
│   ├── auth.ts        # JWT + bcrypt
│   ├── http.ts        # Helpers HTTP
│   ├── validators.ts  # Zod schemas
│   ├── tracking.ts    # UTM + sessions
│   └── errors.ts      # ApiError class
├── routes/
│   ├── public.ts      # Site
│   ├── auth.ts        # Login
│   ├── leads.ts       # CRUD
│   ├── kanban.ts      # Pipeline
│   ├── automations.ts # Bot WhatsApp
│   ├── whatsapp.ts    # Integração Evolution
│   ├── quotes.ts      # Orçamentos + PDF
│   ├── appointments.ts
│   ├── services.ts
│   ├── projects.ts
│   ├── settings.ts
│   ├── dashboard.ts   # Métricas
│   ├── upload.ts      # Multipart
│   └── webhook.ts     # Evolution
├── services/
│   ├── crm.ts         # Lógica de leads
│   ├── automation.ts  # Bot engine
│   └── evolution.ts   # Cliente Evolution
├── repositories/
│   └── *.ts           # Data access
└── scripts/
    └── fix-encoding.ts # Migration UTF-8
```

## Manutenção

### Corrigir encoding UTF-8 do banco

```bash
# Dry run (apenas visualiza)
npm run fix:encoding:dry

# Aplica as correções
npm run fix:encoding
```

### Backup do banco

```bash
# SQLite
cp data/pesmetal.db backup-$(date +%Y%m%d).db
```

### Logs

```bash
tail -f logs/api.log  # se rodando local
railway logs -f         # Railway
```

## Variáveis de Ambiente

| Var | Descrição | Obrigatório |
|-----|-----------|-------------|
| `PORT` | Porta do servidor | Sim |
| `DATABASE_PATH` | Caminho SQLite | Não (default: ./data/pesmetal.db) |
| `JWT_SECRET` | Secret do JWT | Sim |
| `ADMIN_EMAIL` | Email admin seed | Não |
| `ADMIN_PASSWORD` | Senha admin seed | Não |
| `EVOLUTION_API_URL` | URL da Evolution | Para WhatsApp |
| `EVOLUTION_API_KEY` | API Key | Para WhatsApp |
| `EVOLUTION_INSTANCE` | Nome da instância | Não (default: pesmetal-main) |
| `UPLOAD_DIR` | Pasta de uploads | Não |
| `CORS_ORIGIN` | Origem permitida | Não (default: *) |

## Licença

Privado — Pes Metal © 2026
