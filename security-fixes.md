# Security Fixes Tracker — pesmetal

## CRITICAL (6)
- [x] #1 /migrate/sql — REMOVIDO ✅
- [ ] #2 /settings SQL injection em tabela dinâmica
- [ ] #3 JWT_SECRET fallback hardcoded fraco
- [ ] #4 /migrate/leads-campaign sem auth ✅
- [ ] #5 Webhook sem verificação de origem
- [ ] #6 CORS permissivo (*)

## HIGH (13)
- [ ] #7 Sem rate limiting em login/public/webhook
- [ ] #8 Sem headers de segurança (Helmet)
- [ ] #9 SQL injection via coluna em /migrate (já mitigado com whitelist)
- [ ] #10 /migrate/contacts sem auth ✅
- [ ] #11 PUT /leads/:id mass assignment
- [ ] #12 Política de senha fraca
- [ ] #13 Senha admin em logs
- [ ] #14 /quotes/expiring/notify DoS
- [ ] #15 DELETE /quotes/:id sem role check
- [ ] #16 DELETE /appointments/:id sem role check
- [ ] #17 DELETE /contacts/:id com cascade perigoso
- [ ] #18 /auth/register sem validação Zod
- [ ] #19 ID generation previsível

## MEDIUM (11) — depois
## LOW (10) — depois
