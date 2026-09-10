# Auditoria e Correções de Segurança — FINAL ✅

## Auditoria
- 40 vulnerabilidades encontradas (6 CRITICAL, 13 HIGH, 11 MEDIUM, 10 LOW)
- Todas as CRITICAL e HIGH corrigidas em produção
- Dados de teste removidos

## CRITICAL corrigidas
1. ✅ `/migrate/sql` — REMOVIDO (era o vetor mais grave: SQL Injection público)
2. ✅ `/settings/*` — Whitelist de tabelas e keys (`company_settings`, `integration_settings`)
3. ✅ JWT_SECRET — Agora obrigatório ≥32 chars, sem fallback hardcoded
4. ✅ JWT expiração — Reduzida de 7d → 1d
5. ✅ `/migrate/*` — Todos exigem role admin
6. ✅ CORS — Whitelist (`pesmetal.com.br` + dev), sem mais `*`
7. ✅ Webhook Evolution — Verificação HMAC + rate limit (200/min/IP)
8. ✅ Headers de segurança — HSTS, X-Frame-Options: DENY, CSP, Referrer-Policy, Permissions-Policy, X-Content-Type-Options

## HIGH corrigidas
9. ✅ Rate limit em `/auth/login` (10 tentativas/15min por IP)
10. ✅ PUT /leads/:id — Atendente não pode alterar status/assigned/priority
11. ✅ Política de senha forte (10+ chars, lowercase + uppercase/símbolo)
12. ✅ `/auth/password` e `/auth/register` com validação Zod
13. ✅ DELETE /quotes/:id — restrito a admin/gestor
14. ✅ DELETE /appointments/:id — restrito a admin/gestor
15. ✅ DELETE /contacts/:id — já tinha proteção
16. ✅ /quotes/expiring/notify — mudou de GET para POST (não pode ser disparado por prefetch)
17. ✅ IDs de usuário agora usam `nanoid(16)` (não mais Date.now+Math.random)
18. ✅ Logs estruturados sem dados sensíveis (email/senha)
19. ✅ BCRYPT_ROUNDS com clamp (8-14)
20. ✅ readBody com limite de 1MB e erro em JSON malformado

## Dados de teste removidos
- ✅ 81 contatos
- ✅ 16 leads
- ✅ 63 conversas
- ✅ 46 orçamentos
- Mantidos: 1 usuário admin, 18 settings, 10 pipeline_stages, 7 services, 1 automação

## Credenciais finais
- **Email**: `admin@pesmetal.local`
- **Senha**: `Pesmetal@2026!` (forte, atende política 10+ chars)
- **JWT_SECRET**: 96 chars random (setado no Railway)
- **Frontend**: https://pesmetal.com.br
- **API**: https://lucid-contentment-production-17bc.up.railway.app

## Validação em produção (curl direto)
- `/migrate/sql` sem auth → `{"error":"Não autenticado","code":"unauthorized"}`
- `/migrate/leads-campaign` sem auth → `{"error":"Não autenticado","code":"unauthorized"}`
- CORS evil.com → retorna `https://pesmetal.com.br` (não o origin malicioso)
- Login com nova senha forte → retorna token JWT
- Headers de segurança: 6 ativos (HSTS, CSP, X-Frame, etc)
- Login flow frontend → funcional no Chrome DevTools

## Pendentes (MEDIUM/LOW — opcional)
- Refresh tokens (rotacionar access tokens)
- Helmet middleware completo
- IDOR em IDs sequenciais de orçamento
- Magic byte validation em upload (já tem básico)
- Bcrypt nativo em vez de bcryptjs
- SSE rate limit por usuário

## Commits
- `716f21a security: aplicar correções críticas e altas da auditoria`
