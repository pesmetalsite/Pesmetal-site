/**
 * Quotes Router — orçamentos com PDF (modelo real), envio WhatsApp, retenção e backup.
 *
 * Correções críticas aplicadas:
 * - PDF e envio exigem autenticação (nenhum endpoint público).
 * - Validação/normalização de telefone antes de chamar a Evolution (não envia lixo).
 * - Erros estruturados com código (sem vazar detalhes internos da Evolution no client).
 * - Log estruturado do envio (quote_id, customer, conversation, instance, resultado).
 * - Proteção anti-duplo-clique no envio (lock em memória por quote).
 * - PDF usa dados reais do cliente + dados da empresa (modelo real de orçamento).
 */
import PDFDocument from 'pdfkit';
import { json, readBody, getQuery } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { QuoteRepository, LeadEventRepository } from '../repositories/miscRepos.js';
import { ContactRepository } from '../repositories/contactRepo.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { q, q1 } from '../lib/db.js';
import { Evolution } from '../services/evolution.js';
import { createNotification } from '../services/notifications.js';
import { logger } from '../lib/logger.js';
import { publish } from '../services/realtime.js';

/** Lock em memória contra duplo-clique no envio de um mesmo orçamento. */
const sendingLocks = new Set<string>();

function deserialize(q: any) {
  return { ...q, items: q.items ? (typeof q.items === 'string' ? JSON.parse(q.items) : q.items) : [] };
}

function formatCurrency(v: number, currency: string = 'R$') {
  const val = Number(v || 0);
  return `${currency} ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null | undefined, fallback = '—'): string {
  if (!d) return fallback;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('pt-BR');
}

/**
 * Normaliza e valida telefone brasileiro.
 * Aceita 10-11 dígitos (sem DDI) ou 12-13 iniciando em 55.
 * Retorna string normalizada ou null se inválido.
 */
function normalizeBrPhone(raw: string | null | undefined): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
  if (digits.length === 12 || digits.length === 13) return `55${digits}`;
  return null;
}

async function loadCompanySettings(): Promise<Record<string, string>> {
  const rows = (await q(`SELECT key, value FROM company_settings`)) as any[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

function safeName(name: string | null | undefined): string {
  return String(name || 'cliente')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

function generatePdfBuffer(quote: any, company: Record<string, string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 45 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const items: any[] = typeof quote.items === 'string' ? JSON.parse(quote.items || '[]') : (quote.items || []);

      const companyName = company.company_name || 'PES METAL';
      const companyPhone = company.company_phone || '(15) 99834-5539';
      const companyEmail = company.company_email || 'caldeirariapes@gmail.com';
      const companyWebsite = company.company_website || 'pesmetalcaldeiraria.com.br';
      const companyAddress = company.company_address || '';
      const companyCnpj = company.company_cnpj || '39.350.593.0001/51';

      const pageBottom = doc.page.height - doc.page.margins.bottom;
      const line = (y: number) => { doc.moveTo(45, y).lineTo(555, y).strokeColor('#e5e8eb').lineWidth(1).stroke(); };
      const lineGreen = (y: number) => { doc.moveTo(45, y).lineTo(555, y).strokeColor('#1a9e5a').lineWidth(1).stroke(); };

      // ===== HEADER: empresa (esquerda) + nº/data (direita) =====
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#1a9e5a').text(companyName.toUpperCase(), 45, 40);
      doc.font('Helvetica').fontSize(8).fillColor('#5c6670')
        .text(`CNPJ: ${companyCnpj}`, 45, 70, { width: 260 })
        .text(`Contato: ${companyPhone}`, 45, 81, { width: 260 })
        .text(companyAddress, 45, 92, { width: 260 })
        .text(`E-mail: ${companyEmail}`, 45, 103, { width: 260 })
        .text(`Web: ${companyWebsite}`, 45, 114, { width: 260 });

      doc.fontSize(20).fillColor('#1f2328').text('ORÇAMENTO', 315, 40, { align: 'right', width: 240 });
      doc.fontSize(10).fillColor('#5c6670')
        .text(`Nº ${quote.number || ''}`, 315, 72, { align: 'right', width: 240 })
        .text(`Emitido em: ${fmtDate(quote.created_at)}`, 315, 86, { align: 'right', width: 240 })
        .text(`Válido até: ${quote.valid_until ? fmtDate(quote.valid_until) : fmtDate(new Date(Date.now() + 15 * 86400000).toISOString())}`, 315, 100, { align: 'right', width: 240 });

      line(132);

      // ===== CLIENTE (layout adaptativo, sem campos vazios feios) =====
      const customerName = quote.contact_custom_name || quote.contact_name || quote.lead_name || '';
      const customerPhone = quote.contact_phone || '';
      const customerEmail = quote.contact_email || '';
      const customerDoc = quote.contact_document || '';
      const customerStateReg = quote.state_registration || '';
      const customerLine = quote.address_line || '';
      const customerNeighborhood = quote.address_neighborhood || '';
      const customerCity = quote.address_city || '';
      const customerState = quote.address_state || '';
      const customerZip = quote.address_zip || '';

      const clientFields: Array<[string, string]> = ([
        ['Nome/Razão Social', customerName],
        ['Telefone', customerPhone],
        ['E-mail', customerEmail],
        ['CPF/CNPJ', customerDoc],
        ['RG/IE', customerStateReg],
        ['Endereço', [customerLine, customerNeighborhood, [customerCity, customerState].filter(Boolean).join(' - '), customerZip].filter(Boolean).join(', ')],
      ] as Array<[string, string]>).filter(([, v]) => v && v.trim());

      doc.moveDown(1.6);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#1f2328').text('CLIENTE');
      doc.moveDown(0.3);

      clientFields.forEach(([label, value]) => {
        const rowY = doc.y;
        // mede altura real do valor (wrap) e da label para a linha crescer
        const labelH = doc.font('Helvetica-Bold').fontSize(8.5).heightOfString(label, { width: 85 });
        const valueH = doc.font('Helvetica').fontSize(9).heightOfString(value, { width: 380 });
        const rowH = Math.max(labelH, valueH) + 6;
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#5c6670').text(label, 45, rowY, { width: 85 });
        doc.font('Helvetica').fontSize(9).fillColor('#1f2328').text(value, 160, rowY, { width: 380 });
        doc.y = rowY + rowH;
      });

      line(doc.y);

      // ===== ORÇAMENTO: tabela de itens com altura dinâmica + paginação =====
      doc.x = 45;
      doc.moveDown(1.1);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#1f2328').text('ORÇAMENTO', 45, doc.y, { width: 510 });
      doc.moveDown(0.4);

      let computedTotal = 0;

      const drawTableHeader = () => {
        if (doc.y + 24 > pageBottom) doc.addPage();
        doc.fontSize(9).fillColor('#5c6670').font('Helvetica-Bold');
        doc.text('ITEM', 45, doc.y, { width: 30 });
        doc.text('PRODUTO/SERVIÇO', 80, doc.y, { width: 220 });
        doc.text('QTD', 305, doc.y, { width: 40, align: 'center' });
        doc.text('UN', 350, doc.y, { width: 35, align: 'center' });
        doc.text('VLR UNIT.', 390, doc.y, { width: 75, align: 'right' });
        doc.text('SUBTOTAL', 470, doc.y, { width: 85, align: 'right' });
        doc.y += 14;
        lineGreen(doc.y);
        doc.y += 4;
      };

      if (items.length === 0) {
        drawTableHeader();
        doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text('Nenhum item cadastrado.', 80, doc.y, { width: 400 });
        doc.y += 16;
      } else {
        items.forEach((item: any, idx: number) => {
          const qty = Number(item.quantity ?? item.qty ?? 1);
          const unit = Number(item.unit_price ?? item.price ?? 0);
          const subtotal = qty * unit;
          computedTotal += subtotal;

          // altura da descrição (wrap) define a altura da linha
          const descH = doc.font('Helvetica').fontSize(9).heightOfString(String(item.description ?? '-'), { width: 220 });
          const rowH = Math.max(descH, 12) + 5;

          if (doc.y + rowH + 20 > pageBottom) {
            doc.addPage();
            doc.font('Helvetica-Bold').fontSize(12).fillColor('#1f2328').text(`ORÇAMENTO (continuação)`, 45, doc.y, { width: 510 });
            doc.moveDown(0.4);
            drawTableHeader();
          }

          const rowY = doc.y;
          doc.font('Helvetica').fontSize(9).fillColor('#1f2328');
          doc.text(String(idx + 1), 45, rowY, { width: 30 });
          doc.text(String(item.description ?? '-'), 80, rowY, { width: 220 });
          doc.text(String(qty), 305, rowY, { width: 40, align: 'center' });
          doc.text(String(item.unit ?? ''), 350, rowY, { width: 35, align: 'center' });
          doc.text(`R$ ${unit.toFixed(2)}`, 390, rowY, { width: 75, align: 'right' });
          doc.text(`R$ ${subtotal.toFixed(2)}`, 470, rowY, { width: 85, align: 'right' });
          doc.y = rowY + rowH;
        });

        // linhas vazias até completar visualmente (sem estourar)
        const maxEmpty = Math.max(0, Math.floor((pageBottom - 180 - doc.y) / 14));
        const emptyRows = Math.max(0, Math.min(8 - items.length, maxEmpty));
        for (let i = 0; i < emptyRows; i++) {
          const rowY = doc.y;
          doc.font('Helvetica').fontSize(9).fillColor('#b9c2cc');
          doc.text(String(items.length + i + 1), 45, rowY, { width: 30 });
          doc.y = rowY + 14;
        }
      }

      lineGreen(doc.y);

      // ===== TOTAIS =====
      const total = Number(quote.amount) || computedTotal;
      const subtotal = computedTotal;
      const acrescimo = Math.max(0, total - subtotal);

      if (doc.y + 90 > pageBottom) doc.addPage();
      doc.moveDown(0.7);
      doc.font('Helvetica').fontSize(9.5).fillColor('#1f2328');
      doc.text('SUBTOTAL:', 385, doc.y, { width: 95, align: 'right' });
      doc.font('Helvetica-Bold').text(`R$ ${subtotal.toFixed(2)}`, 485, doc.y - 12, { width: 70, align: 'right' });
      doc.moveDown(0.5);
      doc.text('ACRÉSCIMO:', 385, doc.y, { width: 95, align: 'right' });
      doc.font('Helvetica-Bold').text(`R$ ${acrescimo.toFixed(2)}`, 485, doc.y - 12, { width: 70, align: 'right' });
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(9.5).fillColor('#1a9e5a');
      doc.text('TOTAL:', 385, doc.y, { width: 95, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#1a9e5a').text(`R$ ${total.toFixed(2)}`, 485, doc.y - 13, { width: 70, align: 'right' });

      // ===== CONDIÇÕES: prazo de entrega + forma de pg + obs + prazo =====
      doc.x = 45;
      if (doc.y + 120 > pageBottom) doc.addPage();
      doc.moveDown(1.5);

      const deliveryLine =
        (quote.delivery_date && quote.delivery_text)
          ? `Prazo de entrega: ${quote.delivery_text} · Entrega prevista: ${fmtDate(quote.delivery_date)}`
          : quote.delivery_date
            ? `Entrega prevista: ${fmtDate(quote.delivery_date)}`
            : quote.delivery_text
              ? `Prazo de entrega: ${quote.delivery_text}`
              : '';

      if (deliveryLine) {
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1f2328').text(deliveryLine, 45, doc.y, { width: 510 });
        doc.moveDown(0.4);
      }

      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1f2328').text('FORMA DE PG: A VISTA / NF / BOLETO (A COMBINAR)', 45, doc.y, { width: 510 });
      doc.font('Helvetica').fontSize(9.5).fillColor('#3d434a');
      const obsText = (quote.notes || quote.description || '').replace(/\s+/g, ' ').trim();
      const obsShown = obsText.length > 360 ? `${obsText.slice(0, 360)}...` : obsText;
      doc.text(`OBS: ${obsShown}`, 45, doc.y, { width: 510 });
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1f2328').text('PRAZO: 7 DIAS . FRETE:', 45, doc.y, { width: 510 });

      // ===== RODAPÉ (sempre no fim) =====
      if (doc.y + 70 > pageBottom) doc.addPage();
      doc.x = 45;
      doc.moveDown(1.5);
      line(doc.y);
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1a9e5a').text('PES METAL', 45, doc.y, { width: 510, align: 'center' });
      doc.font('Helvetica').fontSize(8).fillColor('#9aa3a1')
        .text('Caldeiraria · Soldagem · Usinagem', 45, doc.y, { width: 510, align: 'center' })
        .text(`CNPJ: ${companyCnpj} · ${companyPhone}`, 45, doc.y, { width: 510, align: 'center' })
        .text(`E-mail: ${companyEmail} · ${companyWebsite}`, 45, doc.y, { width: 510, align: 'center' });

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
    const items = Array.isArray(body.items) ? body.items.filter((i: any) => i?.description) : [];
    const amount = Number(body.amount) || items.reduce((s: number, i: any) => s + (Number(i.quantity ?? i.qty ?? 1) * Number(i.unit_price ?? i.price ?? 0)), 0);
    const { id, number } = await QuoteRepository.insert({
      ...body,
      user_id: user.id,
      amount,
      items: items.length ? items : null,
      status: ['draft', 'sent', 'accepted', 'expired'].includes(body.status) ? body.status : 'draft',
    });
    if (body.lead_id) await LeadEventRepository.insert({ lead_id: body.lead_id, user_id: user.id, type: 'quote_created', description: `Orçamento ${number} criado` });
    await createNotification({ type: 'quote_created', title: 'Novo orçamento', body: `${body.title} (${number})`, data: { quote_id: id }, userId: user.id });
    publish('quotes', 'created', { id, number });
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
    const existing = await QuoteRepository.findById(idMatch[1]);
    if (!existing) throw ApiError.notFound('Orçamento não encontrado');
    const items = Array.isArray(body.items) ? body.items.filter((i: any) => i?.description) : undefined;
    await QuoteRepository.update(idMatch[1], {
      ...body,
      amount: Number(body.amount) || (items ? items.reduce((s: number, i: any) => s + (Number(i.quantity ?? i.qty ?? 1) * Number(i.unit_price ?? i.price ?? 0)), 0) : existing.amount),
      items,
      status: body.status && ['draft', 'sent', 'accepted', 'expired'].includes(body.status) ? body.status : undefined,
    });
    publish('quotes', 'updated', { id: idMatch[1] });
    return json(res, 200, { ok: true });
  }
  if (idMatch && method === 'DELETE') {
    await QuoteRepository.update(idMatch[1], { status: 'deleted' });
    publish('quotes', 'deleted', { id: idMatch[1] });
    return json(res, 200, { ok: true });
  }

  // GET /quotes/:id/pdf — protegido; frontend baixa via fetch autenticado (nunca navega direto)
  const pdfMatch = path.match(/^\/quotes\/([^\/]+)\/pdf$/);
  if (pdfMatch && method === 'GET') {
    const quote = await QuoteRepository.findById(pdfMatch[1]);
    if (!quote) throw ApiError.notFound('Orçamento não encontrado');
    const company = await loadCompanySettings();
    const buffer = await generatePdfBuffer(quote, company);
    const fileName = `PES-METAL-Orcamento-${quote.number}-${safeName(quote.contact_name || quote.lead_name)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.writeHead(200);
    res.end(buffer);
    return;
  }

  // POST /quotes/:id/send — envia PDF via WhatsApp (Evolution sendMedia)
  const sendMatch = path.match(/^\/quotes\/([^\/]+)\/send$/);
  if (sendMatch && method === 'POST') {
    if (sendingLocks.has(sendMatch[1])) {
      return json(res, 409, { error: 'Este orçamento já está sendo enviado. Aguarde o envio terminar.', code: 'SEND_IN_PROGRESS' });
    }
    sendingLocks.add(sendMatch[1]);

    try {
      const quote = await QuoteRepository.findById(sendMatch[1]);
      if (!quote) throw ApiError.notFound('Orçamento não encontrado');
      const body = await readBody(req).catch(() => ({}));

      // 1) Resolve telefone: body.phone (explicito) →’ contact.phone →’ telefone da conversa
      let phone: string | null = null;

      if (body?.phone) {
        phone = normalizeBrPhone(String(body.phone));
        if (!phone) {
          logger.warn('quote send: phone inválido enviado pelo usuário', { quote_id: quote.id });
          return json(res, 422, { error: 'O número de WhatsApp informado é inválido. Informe um número brasileiro válido.', code: 'WHATSAPP_PHONE_INVALID' });
        }
      }

      if (!phone && quote.contact_phone) {
        phone = normalizeBrPhone(quote.contact_phone);
        if (!phone) {
          logger.warn('quote send: telefone do contato é inválido/corrompido', { quote_id: quote.id, contact_id: quote.contact_id, raw: quote.contact_phone });
        }
      }

      // 2) Conversa →’ contato (fonte da verdade do número)
      if (!phone && quote.conversation_id) {
        const conv = (await q1(`SELECT contact_id, instance_id FROM whatsapp_conversations WHERE id = $1`, [quote.conversation_id])) as any;
        if (conv?.contact_id) {
          const contact = await ContactRepository.findById(conv.contact_id);
          if (contact?.phone) phone = normalizeBrPhone(contact.phone);
        }
      }

      if (!phone) {
        return json(res, 422, {
          error: 'Não foi possível identificar o telefone do cliente. Edite o orçamento e vincule um cliente com WhatsApp válido, ou informe o número.',
          code: 'WHATSAPP_PHONE_MISSING',
        });
      }

      // 3) Resolve instância: body.instance_name →’ conversa →’ default
      let instanceName = body?.instance_name;
      if (!instanceName && quote.conversation_id) {
        const conv = (await q1(`SELECT instance_id FROM whatsapp_conversations WHERE id = $1`, [quote.conversation_id])) as any;
        if (conv?.instance_id) {
          const inst = (await q1(`SELECT instance_name FROM whatsapp_instances WHERE id = $1`, [conv.instance_id])) as any;
          instanceName = inst?.instance_name;
        }
      }

      // 4) Gera o PDF
      const company = await loadCompanySettings();
      const buffer = await generatePdfBuffer(quote, company);
      const base64 = buffer.toString('base64');
      const fileName = `PES-METAL-Orcamento-${quote.number}-${safeName(quote.contact_name || quote.lead_name)}.pdf`;

      // 5) Envia via Evolution (document)
      logger.info('quote send: iniciando envio', {
        quote_id: quote.id, number: quote.number, customer: quote.contact_id,
        conversation: quote.conversation_id, user: user.id, instance: instanceName || 'default', phoneLen: phone.length,
      });

      let sendResult: any;
      try {
        sendResult = await Evolution.sendMedia({ number: phone, mediaType: 'document', media: base64, fileName, caption: `Orçamento ${quote.number} — ${quote.title || 'PES METAL'}`, instanceName });
      } catch (err: any) {
        const rawMsg = String(err?.message || err || 'erro desconhecido');
        logger.error('quote send: Evolution recusou o envio', {
          quote_id: quote.id, number: quote.number, customer: quote.contact_id,
          conversation: quote.conversation_id, user: user.id, instance: instanceName || 'default',
          error: rawMsg.slice(0, 500),
        });
        const isInvalidNumber = /400|exists|jid|Bad Request/i.test(rawMsg);
        const isDisconnected = /connection|disconnected|401|403|instance.*not/i.test(rawMsg);
        if (isInvalidNumber) {
          await createNotification({ type: 'quote_send_error', title: 'Número de WhatsApp inválido', body: `Não foi possível enviar o orçamento ${quote.number}: o número do cliente parece incorreto.`, data: { quote_id: quote.id }, userId: user.id });
          return json(res, 422, { error: 'Não foi possível enviar porque o número de WhatsApp do cliente parece estar incorreto. Verifique o número vinculado ao cliente.', code: 'WHATSAPP_PHONE_INVALID' });
        }
        if (isDisconnected) {
          await createNotification({ type: 'quote_send_error', title: 'WhatsApp desconectado', body: `Não foi possível enviar o orçamento ${quote.number}: o WhatsApp selecionado está desconectado.`, data: { quote_id: quote.id }, userId: user.id });
          return json(res, 502, { error: 'Não foi possível enviar porque o WhatsApp selecionado está desconectado.', code: 'WHATSAPP_INSTANCE_OFFLINE' });
        }
        await createNotification({ type: 'quote_send_error', title: 'Erro ao enviar orçamento', body: `Não foi possível enviar o orçamento ${quote.number}. Tente novamente em instantes.`, data: { quote_id: quote.id }, userId: user.id });
        return json(res, 502, { error: 'Não foi possível enviar o orçamento pelo WhatsApp. Verifique a conexão e tente novamente.', code: 'WHATSAPP_SEND_FAILED' });
      }

      // 6) Sucesso: marca como enviado, registra mensagem e notificação
      await QuoteRepository.markSent(quote.id, user.id);
      await MessageRepository_insertOutgoing(quote.conversation_id, user.id, `📄 Orçamento ${quote.number} enviado (${fileName})`);
      await createNotification({ type: 'quote_sent', title: 'Orçamento enviado', body: `${quote.title || quote.number} enviado por WhatsApp`, data: { quote_id: quote.id }, userId: user.id });

      logger.info('quote send: sucesso', {
        quote_id: quote.id, number: quote.number, customer: quote.contact_id,
        conversation: quote.conversation_id, user: user.id, instance: instanceName || 'default',
        evolutionKey: sendResult?.key?.id || null,
      });
      publish('quotes', 'updated', { id: quote.id, status: 'sent' });
      return json(res, 200, { ok: true, status: 'sent', fileName, key: sendResult?.key?.id || null });
    } finally {
      sendingLocks.delete(sendMatch[1]);
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
    publish('quotes', 'created', { id, number });
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
