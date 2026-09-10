import { json } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { q1, qe } from '../lib/db.js';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Upload simples de arquivos (multipart/form-data manual).
 * Parser próprio, mas robusto: lida com boundary dentro do conteúdo binário,
 * CRLF/LF, multipart aninhado, filenames UTF-8 e tamanhos limitados.
 * Em produção, considere usar S3/Supabase Storage.
 */
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads'));
const MAX_BYTES = parseInt(process.env.UPLOAD_MAX_MB || '15') * 1024 * 1024;

/** Retorna URL absoluta do arquivo, baseada no host da request. */
function buildPublicUrl(req: any, urlPath: string): string {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  if (!host) return urlPath;
  return `${proto}://${host}${urlPath}`;
}

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Magic numbers (primeiros bytes) por tipo comum. Validação básica de integridade.
const MAGIC_SIGNATURES: Record<string, number[][]> = {
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // "RIFF" — verificação adicional de "WEBP" nos bytes 8-11
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
};

function detectMime(data: Buffer, declared?: string | null): string | null {
  if (!data || data.length < 4) return null;
  for (const [mime, sigs] of Object.entries(MAGIC_SIGNATURES)) {
    for (const sig of sigs) {
      if (sig.every((b, i) => data[i] === b)) {
        // WEBP exige "WEBP" em offset 8
        if (mime === 'image/webp') {
          if (data.slice(8, 12).toString('ascii') !== 'WEBP') continue;
        }
        return mime;
      }
    }
  }
  return declared ?? null;
}

function sanitizeFilename(name: string): string {
  // Remove separadores de path, NUL bytes e caracteres de controle.
  // Aceita Unicode (acentos, emojis), mas neutraliza '..' e separadores.
  const base = path.basename(name).replace(/[\x00-\x1f]/g, '_');
  if (base === '' || base === '.' || base === '..') return 'file';
  return base;
}

interface MultipartPart {
  name: string;
  filename?: string;
  mime?: string;
  value?: string;
  data?: Buffer;
}

/**
 * Parser multipart/form-data streaming-friendly.
 * Estratégia: localizar TODOS os índices de boundary no buffer, depois fatiar entre eles.
 * Isso evita falsos positivos quando o boundary aparece dentro do conteúdo binário,
 * porque usamos os índices reais encontrados por indexOf em sequência.
 */
function parseMultipart(buf: Buffer, boundary: string): MultipartPart[] {
  const boundaryBuf = Buffer.from(boundary);
  // Encontra todas as ocorrências do boundary (incluindo o prefixo "--").
  const indices: number[] = [];
  let searchFrom = 0;
  while (searchFrom < buf.length) {
    const idx = buf.indexOf(boundaryBuf, searchFrom);
    if (idx === -1) break;
    indices.push(idx);
    searchFrom = idx + boundaryBuf.length;
  }
  if (indices.length < 2) return [];

  const parts: MultipartPart[] = [];
  // Itera pares (início de uma part, fim antes do próximo boundary).
  for (let i = 0; i < indices.length - 1; i++) {
    const sectionStart = indices[i] + boundaryBuf.length;
    // Verifica se é o terminador "--".
    if (buf.slice(sectionStart, sectionStart + 2).toString() === '--') break;
    // Pula o CRLF (ou LF) logo após o boundary.
    let headerStart = sectionStart;
    if (buf[headerStart] === 0x0d && buf[headerStart + 1] === 0x0a) headerStart += 2;
    else if (buf[headerStart] === 0x0a) headerStart += 1;

    const sectionEnd = indices[i + 1];
    // O conteúdo entre o final dos headers e o próximo boundary tem um CRLF/LF
    // logo antes do próximo "--<boundary>". Removemos esse terminador.
    let bodyEnd = sectionEnd;
    if (bodyEnd > 0 && buf[bodyEnd - 1] === 0x0a) bodyEnd -= 1;
    if (bodyEnd > 0 && buf[bodyEnd - 1] === 0x0d) bodyEnd -= 1;

    const section = buf.slice(headerStart, bodyEnd);
    const headerEnd = section.indexOf('\r\n\r\n');
    let headersStr: string;
    let body: Buffer;
    if (headerEnd !== -1) {
      headersStr = section.slice(0, headerEnd).toString('utf8');
      body = section.slice(headerEnd + 4);
    } else {
      // Tolerância: alguns clientes mandam só \n.
      const lfHeaderEnd = section.indexOf('\n\n');
      if (lfHeaderEnd === -1) continue;
      headersStr = section.slice(0, lfHeaderEnd).toString('utf8');
      body = section.slice(lfHeaderEnd + 2);
    }

    const nameMatch = headersStr.match(/name="([^"]*)"/i);
    const filenameMatch = headersStr.match(/filename="([^"]*)"/i);
    const mimeMatch = headersStr.match(/Content-Type:\s*([^\r\n]+)/i);
    if (!nameMatch) continue;

    const isFile = !!filenameMatch;
    parts.push({
      name: nameMatch[1],
      filename: filenameMatch?.[1],
      mime: mimeMatch?.[1]?.trim(),
      data: isFile ? body : undefined,
      value: isFile ? undefined : body.toString('utf8'),
    });
  }
  return parts;
}

/** Lê o body da request tolerando race entre registro de listeners e body já-buferizado. */
function readRawBody(req: any, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let aborted = false;
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      fn();
    };

    const onData = (c: Buffer) => {
      if (aborted) return;
      total += c.length;
      if (total > maxBytes) {
        aborted = true;
        const err: any = new Error(`Arquivo muito grande (max ${maxBytes / 1024 / 1024}MB)`);
        err.statusCode = 413;
        settle(() => reject(err));
        return;
      }
      chunks.push(c);
    };
    const onEnd = () => {
      if (aborted) return;
      settle(() => resolve(Buffer.concat(chunks)));
    };
    const onError = (err: Error) => {
      if (aborted) return;
      aborted = true;
      settle(() => reject(err));
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);

    // Edge case: Node >=18 pode emitir 'end' antes do listener se body for vazio.
    // Mas se req.readableEnded E há dados pendentes (req.readable), lemos sincronamente.
    if (req.readableEnded && chunks.length === 0) {
      // Tenta consumir dados que possam ter ficado no buffer interno
      let remaining: Buffer | null = null;
      while ((remaining = req.read()) !== null) {
        if (aborted) return;
        const chunk = Buffer.isBuffer(remaining) ? remaining : Buffer.from(remaining);
        total += chunk.length;
        if (total > maxBytes) {
          aborted = true;
          const err: any = new Error(`Arquivo muito grande (max ${maxBytes / 1024 / 1024}MB)`);
          err.statusCode = 413;
          return settle(() => reject(err));
        }
        chunks.push(chunk);
      }
      settle(() => resolve(Buffer.concat(chunks)));
    }
  });
}

/** Mime types permitidos para mídia em geral (não apenas PDF/documento). */
const ALLOWED_MEDIA_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/webm',
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/pdf',
  'application/octet-stream', // alguns browsers mandam esse para áudio/vídeo
]);

export async function uploadRouter(req: any, res: any, url: URL) {
  const path_ = url.pathname;

  // POST /upload/file — upload de mídia para lead (lead_id obrigatório)
  if (path_ === '/upload/file' && req.method === 'POST') {
    try {
      const user = await authenticate(req);
      if (!user) return json(res, 401, { error: 'Não autenticado' });

      const ctype = req.headers['content-type'] || '';
      if (!ctype.startsWith('multipart/form-data')) {
        return json(res, 400, { error: 'multipart/form-data esperado' });
      }
      const boundaryMatch = ctype.match(/boundary=(.+)$/);
      if (!boundaryMatch) return json(res, 400, { error: 'boundary ausente' });
      const boundaryRaw = boundaryMatch[1].replace(/^"|"$/g, '').trim();
      const boundary = `--${boundaryRaw}`;

      const raw = await readRawBody(req, MAX_BYTES);

      const parts = parseMultipart(raw, boundary);
      const filePart = parts.find(p => p.name === 'file');
      const leadId = parts.find(p => p.name === 'lead_id')?.value;

      if (!filePart || !filePart.data || filePart.data.length === 0) {
        return json(res, 400, { error: 'Arquivo ausente' });
      }
      if (!leadId || typeof leadId !== 'string' || leadId.trim() === '') {
        return json(res, 400, { error: 'lead_id obrigatório' });
      }

      const lead = await q1(`SELECT id FROM leads WHERE id = $1`, [leadId]);
      if (!lead) {
        return json(res, 404, { error: 'lead_id não encontrado' });
      }

      const originalName = filePart.filename || 'file';
      const safeName = sanitizeFilename(originalName);
      const storedName = `${Date.now()}_${nanoid(8)}_${safeName}`;
      const fullPath = path.join(UPLOAD_DIR, storedName);
      fs.writeFileSync(fullPath, filePart.data);

      const resolved = path.resolve(fullPath);
      if (!resolved.startsWith(UPLOAD_DIR + path.sep) && resolved !== UPLOAD_DIR) {
        fs.unlinkSync(fullPath);
        return json(res, 400, { error: 'filename inválido' });
      }

      const detectedMime = detectMime(filePart.data, filePart.mime);
      if (detectedMime && !ALLOWED_MEDIA_MIMES.has(detectedMime)) {
        fs.unlinkSync(fullPath);
        return json(res, 400, { error: `Tipo de arquivo não permitido: ${detectedMime}` });
      }

      const id = nanoid();
      await qe(
        `INSERT INTO lead_files (id, lead_id, filename, mime, size, path, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, leadId, originalName, detectedMime, filePart.data.length, resolved, user.id]
      );

      try {
        await qe(
          `INSERT INTO lead_events (id, lead_id, user_id, type, description)
           VALUES ($1, $2, $3, 'file_received', $4)`,
          [nanoid(), leadId, user.id, `Arquivo recebido: ${originalName}`]
        );
      } catch (evtErr) {
        console.error('[upload] falha ao registrar evento:', evtErr);
      }

      const urlPath = `/uploads/${storedName}`;
      const publicUrl = buildPublicUrl(req, urlPath);
      return json(res, 200, {
        id,
        filename: originalName,
        mime: detectedMime,
        size: filePart.data.length,
        url: publicUrl,
        path: urlPath,
      });
    } catch (err: any) {
      const status = err?.statusCode && typeof err.statusCode === 'number' ? err.statusCode : 500;
      const message = err?.message || 'Erro interno no upload';
      console.error('[upload] erro:', err);
      return json(res, status, { error: message });
    }
  }

  // POST /upload/media — upload genérico de mídia (sem lead_id) para automações/composer
  if (path_ === '/upload/media' && req.method === 'POST') {
    try {
      const user = await authenticate(req);
      if (!user) return json(res, 401, { error: 'Não autenticado' });

      const ctype = req.headers['content-type'] || '';
      if (!ctype.startsWith('multipart/form-data')) {
        return json(res, 400, { error: 'multipart/form-data esperado' });
      }
      const boundaryMatch = ctype.match(/boundary=(.+)$/);
      if (!boundaryMatch) return json(res, 400, { error: 'boundary ausente' });
      const boundaryRaw = boundaryMatch[1].replace(/^"|"$/g, '').trim();
      // RFC 2046: o boundary no body é sempre precedido por `--`.
      // O Content-Type pode vir com ou sem esse prefixo dependendo do cliente.
      // Strip qualquer quantidade de hífens iniciais e re-adiciona exatamente 2.
      const cleaned = boundaryRaw.replace(/^-+/, '');
      const boundary = `--${cleaned}`;

      const raw = await readRawBody(req, MAX_BYTES);
      const parts = parseMultipart(raw, boundary);
      const filePart = parts.find(p => p.name === 'file');
      if (!filePart || !filePart.data || filePart.data.length === 0) {
        return json(res, 400, { error: 'Arquivo ausente' });
      }

      const originalName = filePart.filename || 'file';
      const safeName = sanitizeFilename(originalName);
      const storedName = `${Date.now()}_${nanoid(8)}_${safeName}`;
      const fullPath = path.join(UPLOAD_DIR, storedName);
      fs.writeFileSync(fullPath, filePart.data);

      const resolved = path.resolve(fullPath);
      if (!resolved.startsWith(UPLOAD_DIR + path.sep) && resolved !== UPLOAD_DIR) {
        fs.unlinkSync(fullPath);
        return json(res, 400, { error: 'filename inválido' });
      }

      const detectedMime = detectMime(filePart.data, filePart.mime);
      if (!detectedMime) {
        fs.unlinkSync(fullPath);
        return json(res, 400, { error: 'Tipo de arquivo não detectado' });
      }
      if (!ALLOWED_MEDIA_MIMES.has(detectedMime)) {
        fs.unlinkSync(fullPath);
        return json(res, 400, { error: `Tipo de arquivo não permitido: ${detectedMime}` });
      }

      const urlPath = `/uploads/${storedName}`;
      const publicUrl = buildPublicUrl(req, urlPath);
      return json(res, 200, {
        filename: originalName,
        mime: detectedMime,
        size: filePart.data.length,
        url: publicUrl,
        path: urlPath,
      });
    } catch (err: any) {
      const status = err?.statusCode && typeof err.statusCode === 'number' ? err.statusCode : 500;
      const message = err?.message || 'Erro interno no upload';
      console.error('[upload/media] erro:', err);
      return json(res, status, { error: message });
    }
  }

  // GET /uploads/:filename — serve arquivos estáticos
  const serveMatch = path_.match(/^\/uploads\/([a-zA-Z0-9_\-.%]+)$/);
  if (serveMatch && req.method === 'GET') {
    const filename = decodeURIComponent(serveMatch[1]);
    // Whitelist rigorosa — só permite filename sanitizado
    if (!/^[0-9_]+[a-zA-Z0-9_\-.]+$/.test(filename)) {
      return json(res, 400, { error: 'filename inválido' });
    }
    const fullPath = path.resolve(path.join(UPLOAD_DIR, filename));
    if (!fullPath.startsWith(UPLOAD_DIR + path.sep)) {
      return json(res, 403, { error: 'acesso negado' });
    }
    if (!fs.existsSync(fullPath)) {
      return json(res, 404, { error: 'arquivo não encontrado' });
    }
    const data = fs.readFileSync(fullPath);
    // Detecta MIME
    const detected = detectMime(data);
    res.setHeader('Content-Type', detected || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.writeHead(200);
    return res.end(data);
  }

  json(res, 404, { error: 'Rota não encontrada' });
}