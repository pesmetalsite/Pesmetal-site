# Fixes do Console — Pesmetal

## Problemas reportados

1. **`/upload/media` retorna 401 no console** — fetch usava URL relativa `/upload/media`, que resolvia para o domínio do Vercel em vez do backend Railway
2. **`/uploads/test-photo.jpg` 404** — imagem inexistente na automação de teste (placeholders)
3. **`Cannot read properties of undefined (reading 'startTime')` em `reportAllChanges`** — bug interno do React DevTools, sem impacto funcional

## Correções aplicadas

### 1. URL absoluta no upload (backend)
- `upload.ts`: função `buildPublicUrl(req, path)` constrói URL absoluta baseada em `host` + `x-forwarded-proto`
- `/upload/file` e `/upload/media` retornam `url` absoluta E `path` relativo (compatibilidade com frontend)
- `/uploads/:filename` é público (sem auth) — serve arquivos estáticos com whitelist de filename

### 2. URL absoluta na Evolution API (backend)
- `whatsapp.ts` (composer): converte `body.media_url` em absoluto antes de chamar `Evolution.sendMedia`
- `automationSteps.ts`: helper `absolutize(url)` converte `/uploads/...` em URL absoluta antes do envio Evolution

### 3. URL absoluta no frontend
- `StepsEditor.tsx`: importou `API_URL`, usa `${API_URL}${path}` para previews de imagem
- `conversas/page.tsx`: helper `mediaUrl(url)` converte `/uploads/...` em `${API_URL}${path}`
- Substituído `/upload/media` por `${API_URL}/upload/media` em chamadas fetch

### 4. Edge runtime race no body upload
- Bug crítico: `readRawBody` resolvia Promise com `chunks=[]` quando body já tinha chegado antes dos listeners
- Fix: usa `req.read()` síncrono para consumir dados pendentes no buffer interno do Node 18+

### 5. Boundary multipart
- Curl/clientes podem enviar boundary com `--` ou sem
- Strip hífens iniciais + adiciona exatamente `--${cleaned}` (RFC 2046)

## Validação end-to-end (curl)

```
1. Upload:        HTTP 200, url absoluta retornada
2. GET URL:       HTTP 200, 95 bytes image/png servido
3. Path relativo: preservado para conversão no frontend
4. Composer:      mensagem criada com media_url, status pending
5. Evolution:     chamada com URL absoluta (sujeita a número WhatsApp válido)
```

## Commits principais
- `f2ef658` fix: leitura correta do body em readRawBody (Edge runtime race)
- `d928ebb` fix: strip hífens do boundary antes de adicionar prefixo
- `5c04b69` fix: URLs absolutas para mídia (upload + Evolution + frontend)

## Observações
- A foto `test-photo.jpg` da automação de teste (criada via API curl) usa URL inexistente.
  Substitua por uma foto real via upload para validar a renderização completa.
- O warning React `startTime` é interno do React DevTools (não afeta funcionalidade).
