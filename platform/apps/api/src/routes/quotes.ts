/**
 * Quotes Router — orçamentos com PDF, envio WhatsApp, retenção e backup.
 */
import PDFDocument from 'pdfkit';
import { json, readBody, getQuery } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { QuoteRepository, LeadEventRepository } from '../repositories/miscRepos.js';
import { parseBody } from '../lib/validators.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { q, q1, qe } from '../lib/db.js';
import { Evolution } from '../services/evolution.js';
import { createNotification } from '../services/notifications.js';
import { logger } from '../lib/logger.js';
import { createGzip, createDeflate } from 'node:zlib';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function deserialize(q: any) {
  return { ...q, items: q.items ? (typeof q.items === 'string' ? JSON.parse(q.items) : q.items) : [] };
}

function formatCurrency(v: number, currency: string = 'BRL') {
  return `${currency} ${(v || 0).toFixed(2)}`;
}

function generatePdfBuffer(quote: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const items: any[] = typeof quote.items === 'string' ? JSON.parse(quote.items || '[]') : (quote.items || []);

      // Header
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#1a9e5a').text('PES METAL', 50, 50);
      doc.font('Helvetica').fontSize(9).fillColor('#5c6670')
        .text('Caldeiraria · Soldagem · Usinagem', 50, 78, { width: 250 })
        .text('Votorantim-SP · (15) 99834-5539', 50, 90, { width: 250 });

      doc.fontSize(20).fillColor('#1f2328').text('ORÇAMENTO', 350, 50, { align: 'right', width: 195 });
      doc.fontSize(10).fillColor('#5c6670')
        .text(`Nº ${quote.number}`, 350, 80, { align: 'right', width: 195 })
        .text(`${new Date(quote.created_at).toLocaleDateString('pt-BR')}`, 350, 92, { align: 'right', width: 195 })
        .text(`Validade: ${quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('pt-BR') : '15 dias'}`, 350, 104, { align: 'right', width: 195 });

      doc.moveTo(50, 125).lineTo(545, 125).strokeColor('#e5e8eb').lineWidth(1).stroke();

      // Cliente
      const customerName = quote.contact_custom_name || quote.contact_name || quote.lead_name || 'Cliente não informado';
      const customerPhone = quote.contact_phone || '';
      const customerDoc = quote.contact_document || '';
      doc.moveDown(2);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#1f2328').text('CLIENTE');
      doc.font('Helvetica').fontSize(10).fillColor('#3d434a')
        .text(`Nome: ${customerName}`)
        .text(`Telefone: ${customerPhone || '—'}`)
        .text(`Documento: ${customerDoc || '—'}`);
      if (quote.address_line) {
        doc.text(`Endereço: ${quote.address_line}${quote.address_city ? `, ${quote.address_city}` : ''}${quote.address_state ? ` - ${quote.address_state}` : ''}`);
      }

      // Itens
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#1f2328').text('ITENS DO ORÇAMENTO');
      doc.moveDown(0.5);

      if (items.length === 0) {
        doc.fontSize(10).fillColor('#6b7280').text('Nenhum item cadastrado.');
      } else {
        const tableTop = doc.y;
        doc.fontSize(9).fillColor('#5c6670').font('Helvetica-Bold');
        doc.text('#', 50, tableTop, { width: 25 });
        doc.text('Descrição', 80, tableTop, { width: 230 });
        doc.text('Qtd', 315, tableTop, { width: 40 });
        doc.text('Vlr Unit.', 360, tableTop, { width: 75 });
        doc.text('Subtotal', 440, tableTop, { width: 80 });
        doc.moveTo(50, tableTop + 14).lineTo(545, tableTop + 14).strokeColor('#e5e8eb').stroke();

        let computedTotal = 0;
        doc.font('Helvetica').fontSize(9).fillColor('#1f2328');
        items.forEach((item: any, idx: number) => {
          const qty = Number(item.quantity ?? 1);
          const unit = Number(item.unit_price ?? item.price ?? 0);
          const subtotal = qty * unit;
          computedTotal += subtotal;
          const rowY = doc.y + 6;
          doc.text(String(idx + 1), 50, rowY, { width: 25 })
            .text(String(item.description ?? '-'), 80, rowY, { width: 230 })
            .text(String(qty), 315, rowY, { width: 40, align: 'center' })
            .text(`R$ ${unit.toFixed(2)}`, 360, rowY, { width: 75, align: 'right' })
            .text(`R$ ${subtotal.toFixed(2)}`, 440, rowY, { width: 80, align: 'right' });
          doc.y = rowY + 16;
        });

        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e8eb').stroke();
        doc.moveDown(0.5);
        const total = Number(quote.amount) || computedTotal;
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#1a9e5a')
          .text(`TOTAL: R$ ${total.toFixed(2)}`, 440, doc.y, { width: 105, align: 'right' });
      }

      // Observações
      if (quote.notes) {
        doc.moveDown(2);
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#1f2328').text('OBSERVAÇÕES');
        doc.font('Helvetica').fontSize(10).fillColor('#3d434a').text(quote.notes);
      }

      // Condições
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#6b7280').text('Condições de pagamento e prazos conforme acordado verbalmente.');
      doc.moveDown(0.5);
      doc.fontSize(8).fillColor('#9aa3a1')
        .text('PES METAL · Caldeiraria, Soldagem e Usinagem · Votorantim-SP')
        .text('Este orçamento é válido por 15 dias a partir da data de emissão.');

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export const quotesRouter = asyncHandler(async (req, res, url) => {
  const user = await authenticate(req);
  if (!user) throw ApiError.unauthorized();
  const path = url.pathname;
  const method = req.method;

  // GET /quotes
  if (path === '/quotes' && method === 'GET') {
    const query = getQuery(url);
    const quotes = await QuoteRepository.list({
      contact_id: query.contact_id, conversation_id: query.conversation_id, status: query.status,
    });
    return json(res, 200, { quotes: quotes.map(deserialize) });
  }

  // POST /quotes
  if (path === '/quotes' && method === 'POST') {
    const body = await readBody(req);
    if (!body?.title) throw ApiError.validation('title é obrigatório');
    const { id, number } = await QuoteRepository.insert({ ...body, user_id: user.id });
    if (body.lead_id) await LeadEventRepository.insert({ lead_id: body.lead_id, user_id: user.id, type: 'quote_created', description: `Orçamento ${number} criado` });
    await createNotification({ type: 'quote_created', title: 'Novo orçamento', body: `${body.title} (${number})`, data: { quote_id: id }, userId: user.id });
    return json(res, 201, { id, number });
  }

  // GET /quotes/:id
  const idMatch = path.match(/^\/quotes\/([^\/]+)$/);
  if (idMatch && method === 'GET') {
    const quote = await QuoteRepository.findById(idMatch[1]);
    if (!quote) throw ApiError.notFound('Orçamento não encontrado');
    return json(res, 200, { quote: deserialize(quote) });
  }
  if (idMatch && method === 'PUT') {
    const body = await readBody(req);
    await QuoteRepository.update(idMatch[1], body);
    return json(res, 200, { ok: true });
  }
  if (idMatch && method === 'DELETE') {
    await QuoteRepository.update(idMatch[1], { status: 'deleted' });
    return json(res, 200, { ok: true });
  }

  // GET /quotes/:id/pdf
  const pdfMatch = path.match(/^\/quotes\/([^\/]+)\/pdf$/);
  if (pdfMatch && method === 'GET') {
    const quote = await QuoteRepository.findById(pdfMatch[1]);
    if (!quote) throw ApiError.notFound('Orçamento não encontrado');
    const buffer = await generatePdfBuffer(quote);
    const safeName = (quote.contact_name || quote.lead_name || 'cliente').replace(/[^a-zA-Z0-9-]/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PES-METAL-Orcamento-${quote.number}-${safeName}.pdf"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.writeHead(200);
    res.end(buffer);
    return;
  }

  // POST /quotes/:id/send — envia PDF via WhatsApp (Evolution sendMedia)
  const sendMatch = path.match(/^\/quotes\/([^\/]+)\/send$/);
  if (sendMatch && method === 'POST') {
    const quote = await QuoteRepository.findById(sendMatch[1]);
    if (!quote) throw ApiError.notFound('Orçamento não encontrado');
    const body = await readBody(req).catch(() => ({}));

    let phone = body?.phone || quote.contact_phone || '';
    let instanceName = body?.instance_name;

    if (!phone) throw ApiError.validation('Telefone do cliente não encontrado');
    phone = phone.replace(/\D/g, '');
    if (phone.length <= 11) phone = `55${phone}`;

    if (!instanceName && quote.conversation_id) {
      const conv = (await q1(`SELECT instance_id FROM whatsapp_conversations WHERE id = $1`, [quote.conversation_id])) as any;
      if (conv?.instance_id) {
        const inst = (await q1(`SELECT instance_name FROM whatsapp_instances WHERE id = $1`, [conv.instance_id])) as any;
        instanceName = inst?.instance_name;
      }
    }

    const buffer = await generatePdfBuffer(quote);
    const base64 = buffer.toString('base64');
    const safeName = (quote.contact_name || 'cliente').replace(/[^a-zA-Z0-9-]/g, '');
    const fileName = `PES-METAL-Orcamento-${quote.number}-${safeName}.pdf`;

    try {
      await Evolution.sendMedia({ number: phone, mediaType: 'document', media: base64, fileName, caption: `Orçamento ${quote.number} - PES METAL`, instanceName });
      await QuoteRepository.markSent(quote.id, user.id);
      await MessageRepository_insertOutgoing(quote.conversation_id, user.id, `📄 ${fileName}`);
      await createNotification({ type: 'quote_sent', title: 'Orçamento enviado', body: `${quote.title} (${quote.number}) enviado por WhatsApp`, data: { quote_id: quote.id }, userId: user.id });
      return json(res, 200, { ok: true, status: 'sent', fileName });
    } catch (err: any) {
      logger.error('quote send failed', { error: String(err?.message || err) });
      await createNotification({ type: 'quote_send_error', title: 'Erro ao enviar orçamento', body: String(err?.message || err), data: { quote_id: quote.id }, userId: user.id });
      return json(res, 502, { error: 'Falha ao enviar PDF pelo WhatsApp', detail: String(err?.message || err) });
    }
  }

  // POST /quotes/:id/duplicate
  const dupMatch = path.match(/^\/quotes\/([^\/]+)\/duplicate$/);
  if (dupMatch && method === 'POST') {
    const original = await QuoteRepository.findById(dupMatch[1]);
    if (!original) throw ApiError.notFound('Orçamento não encontrado');
    const { id, number } = await QuoteRepository.insert({
      lead_id: original.lead_id, contact_id: original.contact_id, conversation_id: original.conversation_id,
      user_id: user.id, title: `${original.title} (cópia)`, description: original.description,
      amount: original.amount, valid_until: original.valid_until, status: 'draft', notes: original.notes,
      items: typeof original.items === 'string' ? JSON.parse(original.items || '[]') : (original.items || []),
    });
    return json(res, 201, { id, number });
  }

  // GET /quotes/expiring/notify — verifica orçamentos próximos da expiração
  const expMatch = path.match(/^\/quotes\/expiring\/notify$/);
  if (expMatch && method === 'GET') {
    const expiring = await QuoteRepository.findExpiringSoon(3);
    for (const q of expiring) {
      await createNotification({
        type: 'quote_expiring',
        title: 'Orçamentos prestes a expirar',
        body: `${q.title} (${q.number}) expira em breve. Faça backup.`,
        data: { quote_id: q.id },
        userId: user.id,
      });
    }
    // Auto-delete expired
    const expired = await QuoteRepository.findExpired();
    for (const q of expired) {
      await QuoteRepository.update(q.id, { status: 'deleted' });
      logger.info('retention: quote auto-deleted', { id: q.id, number: q.number });
    }
    return json(res, 200, { expiring: expiring.length, expired: expired.length, deleted: expired.length });
  }

  throw ApiError.notFound('Endpoint quotes');
});

async function MessageRepository_insertOutgoing(conversationId: string | null, userId: string, content: string) {
  if (!conversationId) return;
  const { MessageRepository } = await import('../repositories/conversationRepo.js');
  await MessageRepository.insert({ conversation_id: conversationId, direction: 'outgoing', type: 'text', content, status: 'sent', sent_by_user_id: userId });
}