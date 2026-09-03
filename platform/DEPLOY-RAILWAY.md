# Deploy PESMETAL API no Railway

## Pré-requisitos
- Conta no [Railway](https://railway.app) (grátis)
- Railway CLI instalado (`npm i -g @railway/cli`)
- Login feito (`railway login`)

## Passo 1: Conectar ao projeto Railway

```bash
cd C:/Users/junin/OneDrive/Desktop/PESMETAL/platform/apps/api
railway link
```

Siga as instruções do CLI para selecionar o projeto.

## Passo 2: Deploy

```bash
railway up
```

O Railway vai detectar o `railway.json` e fazer o build via Docker.

## Passo 3: Configurar variáveis de ambiente

No dashboard do Railway, configure:

| Variável | Valor |
|----------|-------|
| `PORT` | `4000` |
| `JWT_SECRET` | Uma string secreta forte (ex: `openssl rand -base64 32`) |
| `ADMIN_EMAIL` | `admin@pesmetal.com.br` |
| `ADMIN_PASSWORD` | `SuaSenhaForte123!` |

## Passo 4: Obter a URL da API

Após o deploy, pegue a URL do serviço em:
Railway Dashboard → Projeto → API Service → Settings → Networking → Public Networking

A URL será algo como: `https://pesmetal-api.up.railway.app`

## Passo 5: Atualizar site no Vercel

```bash
cd C:/Users/junin/OneDrive/Desktop/PESMETAL/site
vercel env add NEXT_PUBLIC_API_URL production --value "https://pesmetal-api.up.railway.app" --yes
vercel --prod
```

## Alternativa: Deploy via GitHub

1. Faça push do código para um repositório GitHub
2. No Railway Dashboard, clique em "New Project" → "Deploy from GitHub repo"
3. Selecione o repositório e o diretório `apps/api`
4. Configure as variáveis de ambiente no dashboard
5. O Railway faz deploy automático a cada push

## Verificar se está funcionando

```bash
curl https://pesmetal-api.up.railway.app/health
```

Resposta esperada:
```json
{"ok":true,"ts":"2026-...","uptime":10,"version":"2.0.0"}
```
