# 🏭 PESMETAL — Plataforma Completa

Sistema completo de captação de leads, CRM, automação WhatsApp e painel administrativo para a **Pes Metal** — caldeiraria, soldagem e usinagem industrial em Sorocaba/SP.

## 🎯 Visão Geral

- **Site institucional** com captação de leads
- **CRM completo** com Kanban, funil de vendas e métricas
- **Bot WhatsApp** que responde automaticamente
- **Painel admin** para gestão comercial

## 📐 Arquitetura

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   SITE       │────▶│   API        │────▶│   EVOLUTION API  │
│  (Vercel)    │     │  (Railway)   │     │   (Railway)      │
│  Next.js 14  │     │  Node 20     │     │   WhatsApp       │
└──────────────┘     └──────────────┘     └──────────────────┘
       │                    │                      │
       │                    ├────▶ SQLite/Postgres  │
       │                    │                      │
       └──────┐     ┌──────┘                      │
              ▼     ▼                              │
         ┌─────────────────┐                       │
         │   ADMIN         │◀──────────────────────┘
         │  (Vercel)       │
         │  Next.js + CRM  │
         └─────────────────┘
```

## 🌐 URLs em Produção

| Serviço | URL |
|---------|-----|
| **Site público** | https://site-pesmetal.com.br (em migração) |
| **Painel Admin** | https://admin-pesmetal.com.br |
| **API Backend** | https://api-pesmetal.railway.app |
| **Evolution API** | (Railway) |

> As URLs exatas variam conforme deploy. Veja `DEPLOY-GUIDE.md`.

## 📂 Estrutura do Repositório

```
PESMETAL/
├── site/                          # Site institucional público (Next.js)
│   ├── src/app/page.tsx
│   ├── public/
│   ├── .env.example
│   └── package.json
│
├── platform/                      # Plataforma backend + admin
│   ├── apps/
│   │   ├── api/                  # API REST (Node.js + Express-like)
│   │   │   ├── src/
│   │   │   │   ├── routes/        # Endpoints
│   │   │   │   ├── lib/           # Helpers (db, auth, http, validators)
│   │   │   │   ├── services/      # Lógica de negócio
│   │   │   │   ├── repositories/  # Data access
│   │   │   │   └── scripts/       # Scripts de manutenção
│   │   │   └── package.json
│   │   │
│   │   └── admin/                # Painel administrativo (Next.js)
│   │       ├── src/app/
│   │       └── package.json
│   │
│   └── packages/                  # Bibliotecas compartilhadas (futuro)
│
├── DEPLOY-GUIDE.md                # 📖 Guia completo de deploy
└── README.md                      # Este arquivo
```

## 🚀 Quick Start (Desenvolvimento Local)

### 1. Pré-requisitos

- Node.js 20+
- npm 10+
- Git

### 2. Clonar e instalar

```bash
git clone https://github.com/pesmetalsite/Pesmetal-site.git
cd Pesmetal-site

# Instalar dependências de cada app
cd site && npm install
cd ../platform/apps/api && npm install
cd ../admin && npm install
```

### 3. Configurar variáveis de ambiente

```bash
# Site
cp site/.env.example site/.env.local
# Editar com suas URLs

# API
cp platform/apps/api/.env.example platform/apps/api/.env
# Editar com EVOLUTION_API_URL, JWT_SECRET, etc.

# Admin
cp platform/apps/admin/.env.example platform/apps/admin/.env.local
# Editar com NEXT_PUBLIC_API_URL
```

### 4. Rodar localmente

Em 3 terminais:

```bash
# Terminal 1: API (porta 4000)
cd platform/apps/api && npm run dev

# Terminal 2: Site (porta 3000)
cd site && npm run dev

# Terminal 3: Admin (porta 3001)
cd platform/apps/admin && npm run dev
```

Acessos:
- Site: http://localhost:3000
- Admin: http://localhost:3001/login
- API: http://localhost:4000/health

## 🔑 Credenciais Padrão

| Sistema | Usuário | Senha |
|---------|---------|-------|
| Admin | `admin@pesmetal.local` | `pesmetal123` |

⚠️ **IMPORTANTE:** Troque a senha padrão antes de usar em produção!

## ✨ Funcionalidades

### Site Público
- Hero section com chamada industrial
- Catálogo de serviços (caldeiraria, soldagem, usinagem)
- Formulário de contato com captura de leads
- Tracking de UTMs e pixels (Meta, GA, GTM)
- Botões WhatsApp diretos
- Link "Acesso restrito" no rodapé → Admin

### Painel Admin
- **Dashboard:** métricas em tempo real, funil de vendas, gráficos
- **Leads:** CRUD completo, filtros, notas, histórico
- **Kanban:** pipeline visual com drag-and-drop
- **Conversas:** histórico WhatsApp integrado
- **Automações:** editor visual de bot
- **Orçamentos:** criar + exportar PDF
- **Agendamentos:** calendário de visitas
- **Serviços/Projetos:** gerenciar catálogo
- **Configurações:** dados da empresa + integrações
- **WhatsApp Connect:** QR code para conexão

### Bot WhatsApp
- Welcome message + menu de 5 opções (Caldeiraria, Usinagem, Soldagem, Projetos, Atendente)
- Captura automática de leads via WhatsApp
- Move lead automaticamente para o stage escolhido
- Pede descrição do projeto
- Transfere para humano quando solicitado

## 🔧 Stack Tecnológica

### Frontend
- Next.js 14 (App Router)
- React 18
- TypeScript 5
- Tailwind CSS
- Lucide React (ícones)
- dnd-kit (drag-and-drop)

### Backend
- Node.js 20
- TypeScript 5
- node:sqlite (built-in) ou PostgreSQL
- JWT + bcrypt
- Zod (validação)
- pdfkit (geração de PDF)

### Integrações
- **WhatsApp:** Evolution API v2
- **Deploy:** Vercel (frontend) + Railway (backend)
- **Storage:** Railway volumes (uploads)

## 📊 Banco de Dados

SQLite local em desenvolvimento (arquivo `./data/pesmetal.db`). Em produção:
- Railway volume persistente (atual)
- PostgreSQL (recomendado para escala)

### Migrações

Rode automaticamente no `npm start`. Para corrigir encoding UTF-8 legado:

```bash
cd platform/apps/api
npm run fix:encoding        # Aplica correções
npm run fix:encoding:dry    # Apenas visualiza
```

## 🌐 Deploy

Veja o guia completo em [DEPLOY-GUIDE.md](./DEPLOY-GUIDE.md).

### Resumo Rápido

| Componente | Plataforma | Comando |
|-----------|-----------|---------|
| Site | Vercel | `vercel --prod` |
| Admin | Vercel | `cd platform/apps/admin && vercel --prod` |
| API | Railway | `cd platform/apps/api && railway up` |
| Evolution API | Railway | (já em produção) |

## 📞 Suporte

- **Email:** dev@pesmetal.com.br
- **Docs completas:** [DEPLOY-GUIDE.md](./DEPLOY-GUIDE.md)

## 📜 Licença

Privado — Pes Metal © 2026
