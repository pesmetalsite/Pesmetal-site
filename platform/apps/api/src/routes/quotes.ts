/**
 * Quotes Router refatorado.
 */
import PDFDocument from 'pdfkit';
import { json, readBody } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { QuoteRepository } from '../repositories/miscRepos.js';
import { LeadEventRepository } from '../repositories/miscRepos.js';
import { CreateQuoteSchema, parseBody } from '../lib/validators.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { db } from '../lib/db.js';

function deserialize(q: any) {
  return { ...q, items: q.items ? JSON.parse(q.items) : [] };
}

export const quotesRouter = asyncHandler(async (req, res, url) => {
  const user = await authenticate(req);
  if (!user) throw ApiError.unauthorized();
  const path = url.pathname;
  const method = req.method;

  if (path === '/quotes' && method === 'GET') {
    return json(res, 200, { quotes: QuoteRepository.list().map(deserialize) });
  }
  if (path === '/quotes' && method === 'POST') {
    const body = parseBody(CreateQuoteSchema, await readBody(req));
    const { id, number } = QuoteRepository.insert({ ...body, user_id: user.id });
    LeadEventRepository.insert({ lead_id: body.lead_id, user_id: user.id, type: 'quote_created', description: `Orçamento criado: ${body.title}` });
    return json(res, 201, { id, number });
  }

  const idMatch = path.match(/^\/quotes\/([^\/]+)$/);
  if (idMatch && method === 'GET') {
    const quote = QuoteRepository.findById(idMatch[1]);
    if (!quote) throw ApiError.notFound('Orçamento não encontrado');
    return json(res, 200, deserialize(quote));
  }
  if (idMatch && method === 'PUT') {
    const body = await readBody(req);
    QuoteRepository.update(idMatch[1], body);
    return json(res, 200, { ok: true });
  }
  if (idMatch && method === 'DELETE') {
    QuoteRepository.delete(idMatch[1]);
    return json(res, 200, { ok: true });
  }

  // /quotes/:id/pdf must be matched BEFORE the 2-segment idMatch, but the 2-segment
  // regex above already requires an exact match, so /quotes/x/pdf falls through here.
  const pdfMatch = path.match(/^\/quotes\/([^\/]+)\/pdf$/);
  if (pdfMatch && method === 'GET') {
    const quote = QuoteRepository.findById(pdfMatch[1]);
    if (!quote) throw ApiError.notFound('Orcamento nao encontrado');

    const lead = db.prepare(`SELECT id, name, email, phone, company FROM leads WHERE id = ?`).get(quote.lead_id) as any;
    const items: any[] = quote.items ? JSON.parse(quote.items) : [];

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const pdfDone: Promise<Buffer> = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    doc.font('Helvetica');
    doc.fontSize(20).text('Orcamento', { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#666')
      .text(`Numero: ${quote.number}`)
      .text(`Titulo: ${quote.title}`)
      .text(`Validade: ${quote.valid_until || 'N/A'}`)
      .text(`Status: ${quote.status}`)
      .text(`Data de emissao: ${new Date(quote.created_at).toLocaleDateString('pt-BR')}`);
    doc.moveDown(0.8);

    doc.fillColor('#000').fontSize(12).text('Cliente', { underline: true });
    doc.fontSize(10).fillColor('#333')
      .text(`Nome: ${lead?.name || 'N/A'}`)
      .text(`Email: ${lead?.email || 'N/A'}`)
      .text(`Telefone: ${lead?.phone || 'N/A'}`)
      .text(`Empresa: ${lead?.company || 'N/A'}`);
    doc.moveDown(0.8);

    doc.fillColor('#000').fontSize(12).text('Itens', { underline: true });
    doc.moveDown(0.3);

    if (items.length === 0) {
      doc.fontSize(10).fillColor('#666').text('Nenhum item cadastrado.');
    } else {
      const startY = doc.y;
      const cols = [
        { label: '#', x: 50, w: 25 },
        { label: 'Descricao', x: 75, w: 260 },
        { label: 'Qtd', x: 335, w: 50 },
        { label: 'Vlr Unit.', x: 385, w: 80 },
        { label: 'Subtotal', x: 465, w: 80 },
      ];
      doc.fontSize(10).fillColor('#000');
      cols.forEach(c => doc.text(c.label, c.x, startY, { width: c.w, align: 'left' }));
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#999').stroke();
      doc.moveDown(0.3);

      let computedTotal = 0;
      items.forEach((item: any, idx: number) => {
        const qty = Number(item.quantity ?? item.qty ?? 1);
        const unit = Number(item.unit_price ?? item.price ?? 0);
        const subtotal = qty * unit;
        computedTotal += subtotal;
        const rowY = doc.y;
        doc.fontSize(9).fillColor('#000')
          .text(String(idx + 1), 50, rowY, { width: 25 })
          .text(String(item.description ?? item.name ?? '-'), 75, rowY, { width: 260 })
          .text(String(qty), 335, rowY, { width: 50 })
          .text(unit.toFixed(2), 385, rowY, { width: 80 })
          .text(subtotal.toFixed(2), 465, rowY, { width: 80 });
        doc.moveDown(0.4);
      });

      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#999').stroke();
      doc.moveDown(0.3);
      doc.fontSize(12).fillColor('#000')
        .text(`Total: ${quote.currency || 'BRL'} ${(quote.amount || computedTotal).toFixed(2)}`, { align: 'right' });
    }

    if (quote.notes) {
      doc.moveDown(1);
      doc.fontSize(12).fillColor('#000').text('Observacoes', { underline: true });
      doc.fontSize(10).fillColor('#333').text(quote.notes);
    }

    doc.end();
    const buffer = await pdfDone;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="orcamento-${quote.number}.pdf"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.writeHead(200);
    res.end(buffer);
    return;
  }

  throw ApiError.notFound('Endpoint quotes');
});
