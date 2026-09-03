# Deploy PESMETAL API — Render.com (Grátis)

Render oferece Free Tier com sleep após 15min de inatividade, mas é perfeito para development/staging.

## Opção 1: Deploy via GitHub (Recomendado)

### 1. Preparar o repositório

```bash
cd C:/Users/junin/OneDrive/Desktop/PESMETAL

# Se ainda não tem remote:
git init
git add .
git commit -m "PESMETAL API + Site"
git remote add origin https://github.com/SEU_USUARIO/pesmetal-platform.git
git push -u origin main
```

### 2. Deploy no Render

1. Acesse [dashboard.render.com](https://dashboard.render.com)
2. Clique em **"New +"** → **"Web Service"**
3. Conecte sua conta **GitHub**
4. Selecione o repositório `pesmetal-platform`
5. Configure:

| Campo | Valor |
|-------|-------|
| **Name** | `pesmetal-api` |
| **Region** | São Paulo ou Oregon |
| **Branch** | `main` |
| **Root Directory** | `apps/api` |
| **Runtime** | `Node` |
| **Build Command** | `npm install && npx tsc` |
| **Start Command** | `node dist/index.js` |
| **Instance Type** | `Free` |

6. Clique em **"Create Web Service"**

### 3. Variáveis de Ambiente

Adicione em Render Dashboard → Environment:

```
PORT=4000
JWT_SECRET=pesmetal-super-secret-key-change-in-production-2026
ADMIN_EMAIL=admin@pesmetal.com.br
ADMIN_PASSWORD=SuaSenhaForte123!
```

### 4. Obter a URL

Após o deploy, a URL será algo como:
`https://pesmetal-api.onrender.com`

Teste:
```bash
curl https://pesmetal-api.onrender.com/health
```

### 5. Atualizar Site

```bash
cd C:/Users/junin/OneDrive/Desktop/PESMETAL/site

vercel env add NEXT_PUBLIC_API_URL production --value "https://pesmetal-api.onrender.com" --yes
vercel --prod
```

---

## Opção 2: Deploy via CLI

```bash
# Instalar Render CLI
npm install -g @render/cli

# Login
render login

# Deploy
cd C:/Users/junin/OneDrive/Desktop/PESMETAL/platform/apps/api
render deploy --slug pesmetal-api
```

---

## Configuração do Site

Após obter a URL da API:

```bash
cd C:/Users/junin/OneDrive/Desktop/PESMETAL/site

# Adicionar variável de produção
vercel env add NEXT_PUBLIC_API_URL production --value "https://SEU_DOMINIO.onrender.com" --yes

# Deploy
vercel --prod
```

---

## Nota sobre Free Tier

O Render free tier:
- ✓ 750 horas/mês (contínuo)
- ✓ Sleep após 15 min inatividade (primeira requisição tem ~30s cold start)
- ✓ SSL automático
- ✓ CI/CD automático com GitHub

**Para produção real**, considere Railway ou VPS.
