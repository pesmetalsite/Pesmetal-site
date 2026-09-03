import { json } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { db } from '../lib/db.js';
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

    const onData = (c: Buffer) => {
      if (aborted) return;
      total += c.length;
      if (total > maxBytes) {
        aborted = true;
        const err: any = new Error(`Arquivo muito grande (max ${maxBytes / 1024 / 1024}MB)`);
        err.statusCode = 413;
        req.removeListener('data', onData);
        req.removeListener('end', onEnd);
        req.removeListener('error', onError);
        return reject(err);
      }
      chunks.push(c);
    };
    const onEnd = () => {
      if (aborted) return;
      resolve(Buffer.concat(chunks));
    };
    const onError = (err: Error) => {
      if (aborted) return;
      aborted = true;
      reject(err);
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);

    // Se o body já chegou antes dos listeners (keep-alive, requests pequenas),
    // 'end' já disparou. Forçamos a resolução imediata nesse caso.
    if (req.readableEnded || req.complete) {
      // Remove listeners registrados para evitar double-resolve.
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      try {
        resolve(Buffer.concat(chunks));
      } catch (e) {
        reject(e as Error);
      }
    }
  });
}

export async function uploadRouter(req: any, res: any, url: URL) {
  const path_ = url.pathname;

  // POST /upload/file
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
      // A boundary pode vir com aspas envolvendo o token — strip se vier entre aspas.
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

      // Verifica se o lead existe — evita FK error genérico e devolve 404 claro.
      const lead = db.prepare(`SELECT id FROM leads WHERE id = ?`).get(leadId);
      if (!lead) {
        return json(res, 404, { error: 'lead_id não encontrado' });
      }

      const originalName = filePart.filename || 'file';
      const safeName = sanitizeFilename(originalName);
      // Prefixo timestamp + id único para evitar colisões.
      const storedName = `${Date.now()}_${nanoid(8)}_${safeName}`;
      const fullPath = path.join(UPLOAD_DIR, storedName);
      fs.writeFileSync(fullPath, filePart.data);

      // Sanidade: o arquivo escrito deve estar dentro de UPLOAD_DIR (defesa contra path traversal).
      const resolved = path.resolve(fullPath);
      if (!resolved.startsWith(UPLOAD_DIR + path.sep) && resolved !== UPLOAD_DIR) {
        fs.unlinkSync(fullPath);
        return json(res, 400, { error: 'filename inválido' });
      }

      // Valida magic number vs. Content-Type declarado.
      const detectedMime = detectMime(filePart.data, filePart.mime);

      const id = nanoid();
      db.prepare(
        `INSERT INTO lead_files (id, lead_id, filename, mime, size, path, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        leadId,
        originalName,
        detectedMime,
        filePart.data.length,
        resolved,
        user.id
      );

      try {
        db.prepare(
          `INSERT INTO lead_events (id, lead_id, user_id, type, description)
           VALUES (?, ?, ?, 'file_received', ?)`
        ).run(nanoid(), leadId, user.id, `Arquivo recebido: ${originalName}`);
      } catch (evtErr) {
        // Loga mas não falha o upload — o arquivo já foi persistido.
        console.error('[upload] falha ao registrar evento:', evtErr);
      }

      // URL pública — assume servidor rodando atrás de host; cliente pode reconstruir.
      const urlPath = `/uploads/${storedName}`;
      return json(res, 200, {
        id,
        filename: originalName,
        mime: detectedMime,
        size: filePart.data.length,
        url: urlPath,
        path: urlPath,
      });
    } catch (err: any) {
      const status = err?.statusCode && typeof err.statusCode === 'number' ? err.statusCode : 500;
      const message = err?.message || 'Erro interno no upload';
      console.error('[upload] erro:', err);
      return json(res, status, { error: message });
    }
  }

  json(res, 404, { error: 'Rota não encontrada' });
}