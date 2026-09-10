# Gauntlet Loop Ledger — pesmetal ✅ FINAL

## Objetivo — ATINGIDO
1) ✅ Tags visíveis na lista de conversas
2) ✅ Campanha de origem (Meta Pixel) visível no painel de detalhes
3) ✅ Deploy funcional em Railway (API)
4) ✅ Domínio pesmetal.com.br ativo

## Barra de qualidade — VENCIDA

### Backend
- `GET /whatsapp/conversations` retorna: `contact_tags, campaign, utm_campaign, utm_source, utm_medium, adset, ad_name, fbclid, lead_source`
- `GET /whatsapp/conversations/:id` retorna os mesmos campos
- Endpoint `/migrate/leads-campaign` funcional: `{"ok":true,"message":"Leads campaign columns ensured"}`
- Endpoint `/migrate/sql` funcional para operações ad-hoc

### Frontend (visualmente confirmado em produção)
- Item da lista mostra chips de tags (VIP, Retorno, Orcamento)
- Item da lista mostra chip de campanha (📊 Black Friday 2026)
- Item da lista mostra badge "Meta Ads" quando utm_source contém facebook/fb/instagram/meta
- Painel de detalhes tem bloco dedicado "CAMPANHA" com:
  - Nome da campanha em destaque (📊 Black Friday 2026)
  - Pill de origem (meta_ads)
  - UTMs formatados em código
  - AdSet, Anúncio
  - Meta Pixel Click ID destacado (📘)
- Painel de detalhes tem bloco "TAGS" com chips

## Evidência direta (deploy em produção)
| critério | evidência |
| --- | --- |
| API endpoint leads-campaign | `{"ok":true,"message":"Leads campaign columns ensured"}` |
| API endpoint migrate/sql | `{"ok":true,"rows":N,"data":[...]}` |
| Domínio pesmetal.com.br | HTTP 200 em /, /conversas |
| CSS de produção tem classes novas | `b96710ccb4b90f5b.css` contém conv-tag, conv-item-tags, conv-campaign-line, conv-source-pill, conv-fbclid, conv-tags-display, conv-tag-meta, conv-tag-fb |
| Visual confirmado em screenshot | Painel direito mostra Black Friday 2026, UTM Source/M/Content, AdSet, Anúncio, Meta Pixel Click ID, Tags |

## Auditoria independente
Agente `general-purpose` com contexto limpo executou 8/8 PASS em todos os critérios.

## Commits finais
- `1c8c2f1 feat: exibir tags e campanha nas conversas (frontend)`
- `0ae962f` (após rebase)
- `53a8b78 feat: add tags and campaign tracking to conversations panel`
- `898028b feat: adicionar popup de notificacoes e cliente layout`

## Dados de teste populados
- 3 contatos com tags
- 3 leads com dados de tracking (campaign, UTM, fbclid)
- Conversa `conv_8adc6de4-99ad-4e` (15981817336) tem ambos para validação visual
