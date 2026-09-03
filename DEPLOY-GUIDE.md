# 🚀 PESMETAL — Guia Consolidado de Deploy

Sistema completo de captação de leads, CRM e automação WhatsApp para Pes Metal.

## 📐 Arquitetura

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   SITE       │────▶│   API        │────▶│   EVOLUTION API  │
│  (Vercel)    │     │  (Railway)   │     │   (Railway)      │
│  Next.js     │     │  Node 20     │     │   WhatsApp       │
└──────────────┘     └──────────────┘     └──────────────────┘
       │                    │
       │                    ├────▶ SQLite / Postgres
       │                    │
       └──────┐     ┌──────┘
              ▼     ▼
         ┌─────────────────┐
         │   ADMIN         │
         │  (Vercel)       │
         │  Next.js + CRM  │
         └─────────────────┘
```

## 🌐 URLs em Produção

| Serviço | URL |
|---------|-----|
| **Site público** | https://site-5nl4g81ip-consecom.vercel.app |
| **Painel Admin** | https://admin-aa3i2dqz9-consecom.vercel.app |
| **API Backend** | https://lucid-contentment-production-17bc.up.railway.app |
| **Evolution API** | https://evolution-api-production-dc3b5.up.railway.app |

## 🔑 Credenciais Padrão

| Sistema | Usuário | Senha |
|---------|---------|-------|
| Admin | `admin@pesmetal.local` | `pesmetal123` |
| Evolution API | (configurado via env) | `d024ea7...fa75` |

⚠️ **IMPORTANTE:** Troque a senha padrão antes de usar em produção.

## 📦 Componentes

### 1. Site Público (`/site`)
- **Stack:** Next.js 14, React 18, TypeScript, Tailwind
- **Deploy:** Vercel
- **Env:** `NEXT_PUBLIC_API_URL` (aponta para Railway)

### 2. Painel Admin (`/platform/apps/admin`)
- **Stack:** Next.js 14, dnd-kit, Zod
- **Deploy:** Vercel
- **Env:** `NEXT_PUBLIC_API_URL`
- **Funcionalidades:** Dashboard, Kanban, Leads, Conversas, Automações, Orçamentos, Agendamentos

### 3. API Backend (`/platform/apps/api`)
- **Stack:** Node.js 20, TypeScript, SQLite/Postgres, JWT
- **Deploy:** Railway (container Node)
- **Porta:** 4000
- **Endpoints:** Ver `apps/api/README.md`

### 4. Evolution API (`/platform/apps/whatsapp-agent-wppconnect`)
- **Stack:** Node.js, Baileys (WhatsApp)
- **Deploy:** Railway
- **Instância:** `pesmetal-main`
- **Status:** Aguardando QR scan para conectar

## 🚦 Como conectar WhatsApp

1. Acesse o painel admin: https://admin-aa3i2dqz9-consecom.vercel.app
2. Vá em **Conversas** → deve aparecer QR Code
3. No celular: WhatsApp → Configurações → Aparelhos conectados → Conectar
4. Escaneie o QR
5. Status muda para `open` em segundos

## 🔧 Variáveis de Ambiente (Railway)

Já configuradas no serviço `lucid-contentment`:

```
EVOLUTION_API_URL=https://evolution-api-production-dc3b5.up.railway.app
EVOLUTION_API_KEY=d024ea7bb4eecab457678225503d1b9cef60373d741c10afaeed4ffc59a5fa75
EVOLUTION_INSTANCE=pesmetal-main
JWT_SECRET=<gerado>
ADMIN_EMAIL=admin@pesmetal.local
ADMIN_PASSWORD=pesmetal123
```

Para adicionar pelo CLI:
```bash
railway variables --set "KEY=value" --service lucid-contentment
```

## 📊 Banco de Dados

- **Tipo:** SQLite (arquivo local) ou Postgres (recomendado para produção)
- **Migrations:** Rodam automaticamente no `npm start`
- **Backup:** `cp data/pesmetal.db backup.db`

## 🧪 Testes Rápidos

```bash
# Health check
curl https://lucid-contentment-production-17bc.up.railway.app/health

# Login
curl -X POST https://lucid-contentment-production-17bc.up.railway.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pesmetal.local","password":"pesmetal123"}'

# Status WhatsApp
curl https://lucid-contentment-production-17bc.up.railway.app/whatsapp/status \
  -H "Authorization: Bearer <TOKEN>"
```

## 🛠️ Manutenção

### Corrigir Encoding UTF-8

```bash
railway run --service lucid-contentment -- npm run fix:encoding
```

### Reiniciar serviço

```bash
railway restart --service lucid-contentment
```

### Ver logs

```bash
railway logs --service lucid-contentment --lines 100
```

## 📈 Roadmap

- [ ] Migrar SQLite → Postgres (volume)
- [ ] CI/CD com GitHub Actions
- [ ] Testes E2E automatizados (Playwright)
- [ ] Migração para domínio próprio (pesmetal.com.br)
- [ ] SSL customizado

## 📞 Contato / Suporte

Sistema mantido por: **Wm Agência / Consecom**
- Email: suporte@consecom.com.br
