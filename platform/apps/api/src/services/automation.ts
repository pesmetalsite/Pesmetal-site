/**
 * Automation Engine — FSM com dispatch table + modo numérico simples.
 *
 * Modo numérico (novo, prioritário):
 *   A automação tem as colunas `initial_message`, `options` (JSON array) e
 *   `invalid_message`. O usuário digita o número (1..N) ou o label da opção.
 *   Cada opção: { id, label, message, stage_id, transfer_human }.
 *
 * Modo grafo (legado, compatível):
 *   FSM com nodes tipados. Estado persistido em whatsapp_conversations.
 */
import { AutomationRepository } from '../repositories/automationRepo.js';
import { ConversationRepository, MessageRepository } from '../repositories/conversationRepo.js';
import { LeadRepository } from '../repositories/leadRepo.js';
import { ContactRepository } from '../repositories/contactRepo.js';
import { StageRepository } from '../repositories/stageRepo.js';
import { LeadEventRepository } from '../repositories/miscRepos.js';
import { Evolution } from './evolution.js';
import { createNotification } from './notifications.js';
import { logger } from '../lib/logger.js';

// === Tipos do modo grafo (legado) ===
type NodeConfig = Record<string, any>;
export interface Node {
  id: string;
  type: string;
  config: NodeConfig;
  next?: string | null;
  options?: { key: string; label?: string; next: string }[];
}
export interface Graph {
  entry: string;
  nodes: Node[];
}
type HandlerContext = {
  conversationId: string;
  automationId: string;
  graph: Graph;
};
type Handler = (ctx: HandlerContext, node: Node, input?: string) => Promise<string | null | undefined>;

// === Modo numérico: tipos ===
export interface NumericOption {
  id?: string;
  label?: string;
  message?: string;
  stage_id?: string;
  transfer_human?: boolean;
  [key: string]: any;
}

const handlers: Record<string, Handler> = {
  message: async (ctx, node) => {
    await sendMessage(ctx, node);
    return node.next ?? null;
  },
  menu: async (ctx, node, input) => {
    if (!input) {
      await sendMenu(ctx, node);
      return undefined;
    }
    const option = node.options?.find(o => o.key.trim() === input.trim());
    if (!option) {
      await sendMenu(ctx, node);
      return undefined;
    }
    return option.next;
  },
  set_interest: async (ctx, node) => {
    const leadId = await getLeadId(ctx);
    if (leadId) {
      await LeadRepository.updateFields(leadId, { interest: node.config.value });
      await LeadEventRepository.insert({ lead_id: leadId, type: 'service_selected', description: `Interesse definido: ${node.config.value}` });
    }
    return node.next ?? null;
  },
  move_stage: async (ctx, node) => {
    const leadId = await getLeadId(ctx);
    if (leadId && node.config.stage_id) {
      const current = await LeadRepository.findById(leadId);
      if (current && current.stage_id !== node.config.stage_id) {
        const newStage = await StageRepository.findById(node.config.stage_id);
        if (newStage) {
          await LeadRepository.updateFields(leadId, { stage_id: node.config.stage_id });
          await LeadEventRepository.insert({ lead_id: leadId, type: 'stage_changed', payload: { from: current.stage_id, to: node.config.stage_id }, description: `Movido para ${newStage.name}` });
        }
      }
    }
    return node.next ?? null;
  },
  set_tag: async (ctx, node) => {
    const leadId = await getLeadId(ctx);
    if (leadId && node.config.tag) {
      const lead = await LeadRepository.findById(leadId);
      if (lead) {
        const c = await ContactRepository.findById(lead.contact_id);
        if (c) {
          const tags = c.tags ? JSON.parse(c.tags) : [];
          if (!tags.includes(node.config.tag)) tags.push(node.config.tag);
          await ContactRepository.update(c.id, { tags: JSON.stringify(tags) });
        }
      }
    }
    return node.next ?? null;
  },
  assign_user: async (ctx, node) => {
    const leadId = await getLeadId(ctx);
    if (leadId && node.config.user_id) {
      await LeadRepository.updateFields(leadId, { assigned_user_id: node.config.user_id });
      await ConversationRepository.update(ctx.conversationId, { assigned_user_id: node.config.user_id });
    }
    return node.next ?? null;
  },
  request_info: async (ctx, node, input) => {
    if (input) await saveInput(ctx, node, input);
    await sendMessage(ctx, node);
    return undefined;
  },
  request_file: async (ctx, node, input) => {
    if (input) await saveInput(ctx, node, input);
    await sendMessage(ctx, node);
    return undefined;
  },
  wait_input: async (ctx, node, input) => {
    if (input) await saveInput(ctx, node, input);
    return node.next ?? null;
  },
  transfer_human: async (ctx) => {
    await ConversationRepository.update(ctx.conversationId, {
      automation_status: 'transferred', status: 'human', current_node: null,
    });
    const leadId = await getLeadId(ctx);
    if (leadId) {
      await LeadRepository.updateFields(leadId, { stage_id: 'stage_atend' });
      await LeadEventRepository.insert({ lead_id: leadId, type: 'human_takeover', description: 'Cliente solicitou atendente humano' });
    }
    return null;
  },
  end: async (ctx) => {
    await ConversationRepository.update(ctx.conversationId, { automation_status: 'completed', current_node: null });
    return null;
  },
  go_back: async (ctx) => {
    return ctx.graph.entry;
  },
  branch_keyword: async (ctx, node, input) => {
    const keywords: string[] = node.config.keywords || [];
    if (input) {
      const match = keywords.find(k => input.toLowerCase().includes(k.toLowerCase()));
      if (match) return node.next ?? null;
    }
    return node.config.fallback ?? null;
  },
};

// === Helpers (grafo legado) ===
async function getLeadId(ctx: HandlerContext): Promise<string | null> {
  const conv = await ConversationRepository.findById(ctx.conversationId);
  return conv?.lead_id ?? null;
}

async function saveInput(ctx: HandlerContext, node: Node, input: string) {
  const conv = await ConversationRepository.findById(ctx.conversationId);
  const ctxJson = conv?.context ? JSON.parse(conv.context) : {};
  ctxJson.last_input = input;
  if (node.config?.capture_as) ctxJson[node.config.capture_as] = input;
  await ConversationRepository.update(ctx.conversationId, { context: JSON.stringify(ctxJson) });
}

async function sendMessage(ctx: HandlerContext, node: Node) {
  const conv = await ConversationRepository.findById(ctx.conversationId);
  if (!conv) return;
  const contact = await ContactRepository.findById(conv.contact_id);
  if (!contact) return;
  const number = formatNumber(contact.phone);
  const text = node.config?.text ?? '';
  const msgId = await MessageRepository.insert({
    conversation_id: ctx.conversationId,
    direction: 'outgoing',
    type: 'text',
    content: text,
    status: 'pending',
  });
  try {
    await Evolution.sendText({ number, text, instanceName: getStoredInstance(conv) });
    await MessageRepository.updateStatus(msgId, 'sent');
    await ConversationRepository.update(ctx.conversationId, { last_message_at: new Date().toISOString() });
  } catch (err: any) {
    await MessageRepository.updateStatus(msgId, 'failed');
    logger.error('evolution send failed', { conversation_id: ctx.conversationId, error: String(err?.message || err) });
    throw err;
  }
}

async function sendMenu(ctx: HandlerContext, node: Node) {
  const text = node.config?.text ?? '';
  const options = node.options ?? [];
  const optsText = options.map(o => `${o.key} — ${o.label ?? o.key}`).join('\n');
  const full = `${text}\n\n${optsText}`;
  await sendMessage(ctx, { ...node, config: { ...node.config, text: full } });
}

function formatNumber(phone: string) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return phone;
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

function parseGraph(raw: string | null | undefined): Graph {
  if (!raw) return { entry: '', nodes: [] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.nodes)) return parsed as Graph;
    return { entry: '', nodes: [] };
  } catch { return { entry: '', nodes: [] }; }
}

// === Helpers do modo numérico ===
function parseOptions(raw: string | null | undefined): NumericOption[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((o): o is NumericOption => !!o && typeof o === 'object');
  } catch {
    return [];
  }
}

function hasNumericMode(automation: any): boolean {
  return !!automation && typeof automation.options === 'string' && automation.options.trim() !== '';
}

function buildMenuText(options: NumericOption[], header?: string): string {
  const lines = options.map((o, i) => `${i + 1} — ${o.label || o.id || `Opção ${i + 1}`}`);
  return `${header || 'Escolha uma opção:'}\n\n${lines.join('\n')}`;
}

function getStoredInstance(conv: any): string | undefined {
  if (!conv?.context) return undefined;
  try {
    const c = JSON.parse(conv.context);
    return typeof c.instance === 'string' && c.instance ? c.instance : undefined;
  } catch {
    return undefined;
  }
}

async function persistInstance(conversationId: string, instanceName?: string): Promise<string | undefined> {
  if (!instanceName) return undefined;
  const conv = await ConversationRepository.findById(conversationId);
  const ctx = conv?.context ? (() => { try { return JSON.parse(conv.context); } catch { return {}; } })() : {};
  if (ctx.instance === instanceName) return instanceName;
  await ConversationRepository.update(conversationId, { context: JSON.stringify({ ...ctx, instance: instanceName }) });
  return instanceName;
}

async function sendOutboundText(conv: any, text: string, instanceName?: string) {
  const contact = await ContactRepository.findById(conv.contact_id);
  if (!contact) return;
  const number = formatNumber(contact.phone);
  const msgId = await MessageRepository.insert({
    conversation_id: conv.id,
    direction: 'outgoing',
    type: 'text',
    content: text,
    status: 'pending',
  });
  try {
    await Evolution.sendText({ number, text, instanceName });
    await MessageRepository.updateStatus(msgId, 'sent');
    await ConversationRepository.update(conv.id, { last_message_at: new Date().toISOString() });
  } catch (err: any) {
    await MessageRepository.updateStatus(msgId, 'failed');
    logger.error('evolution send failed', { conversation_id: conv.id, instanceName, error: String(err?.message || err) });
  }
}

async function startNumeric(conversationId: string, automation: any, instanceName?: string) {
  const options = parseOptions(automation.options);
  const conv = await ConversationRepository.findById(conversationId);
  const leadId = conv?.lead_id ?? null;
  if (leadId) {
    await LeadEventRepository.insert({
      lead_id: leadId,
      type: 'automation_started',
      payload: { automation_id: automation.id, automation_name: automation.name },
      description: `Automação "${automation.name}" iniciada`,
    });
  }
  const first = automation.initial_message?.trim();
  const header = first || (options.length ? 'Escolha uma opção:' : undefined);
  const menuText = options.length ? buildMenuText(options, header) : (first || undefined);
  if (menuText && conv) {
    await sendOutboundText(conv, menuText, instanceName);
  }
  await ConversationRepository.update(conversationId, {
    current_node: options.length ? 'menu' : 'end',
    automation_status: options.length ? 'running' : 'waiting_input',
  });
}

async function handleNumericInput(conv: any, automation: any, message: string, instanceName?: string) {
  if (conv.current_node === 'end') return;

  const options = parseOptions(automation.options);
  const trimmed = (message || '').trim();
  let option: NumericOption | undefined;

  const num = Number(trimmed);
  if (trimmed && Number.isInteger(num) && String(num) === trimmed && num >= 1 && num <= options.length) {
    option = options[num - 1];
  }
  if (!option) {
    const lc = trimmed.toLowerCase();
    option = options.find(o => String(o.id || '').trim().toLowerCase() === lc)
      || options.find(o => String(o.label || '').trim().toLowerCase() === lc);
  }

  if (!option) {
    const invalid = String(automation.invalid_message || '').trim()
      || 'Opção inválida. Digite o número correspondente a uma das opções.';
    await sendOutboundText(conv, invalid, instanceName);
    await ConversationRepository.update(conv.id, { current_node: 'menu', automation_status: 'waiting_input' });
    return;
  }

  const contact = await ContactRepository.findById(conv.contact_id);
  const number = contact ? formatNumber(contact.phone) : null;
  const label = String(option.label || `Opção ${options.indexOf(option) + 1}`);
  const leadId: string | null = conv.lead_id ?? null;

  // Opção com transferência humana
  if (option.transfer_human) {
    const reply = option.message || 'Vou transferir você para um atendente humano.';
    if (number) await sendOutboundText(conv, reply, instanceName);
    const targetStage = option.stage_id || 'stage_atend';
    await ConversationRepository.update(conv.id, { status: 'human', automation_status: 'transferred', current_node: null });

    if (leadId) {
      const lead = await LeadRepository.findById(leadId);
      if (lead) {
        if (targetStage && lead.stage_id !== targetStage) {
          const stage = await StageRepository.findById(targetStage);
          if (stage) {
            await LeadRepository.updateFields(leadId, { stage_id: targetStage });
            await LeadEventRepository.insert({
              lead_id: leadId, type: 'stage_changed',
              payload: { from: lead.stage_id, to: targetStage },
              description: `Movido para ${stage.name}`,
            });
          }
        }
        await createNotification({
          type: 'human_takeover',
          title: 'Atendimento humano',
          body: `${lead.name} solicitou atendimento humano`,
          data: { lead_id: leadId, automation_id: conv.automation_id, option_id: option.id ?? null, label },
          leadId,
          eventType: 'human_takeover',
          eventDescription: 'Cliente solicitou atendente humano',
        });
      }
    }
    return;
  }

  // Opção comum: define interesse, move etapa e cria notificação
  const reply = option.message || (label ? `Você escolheu ${label}.` : 'Opção registrada.');
  if (number) await sendOutboundText(conv, reply, instanceName);

  if (leadId) {
    const lead = await LeadRepository.findById(leadId);
    if (lead) {
      if (option.stage_id && lead.stage_id !== option.stage_id) {
        const stage = await StageRepository.findById(option.stage_id);
        if (stage) {
          await LeadRepository.updateFields(leadId, { interest: label, stage_id: option.stage_id });
          await LeadEventRepository.insert({
            lead_id: leadId, type: 'stage_changed',
            payload: { from: lead.stage_id, to: option.stage_id },
            description: `Movido para ${stage.name}`,
          });
        } else {
          await LeadRepository.updateFields(leadId, { interest: label });
        }
      } else {
        await LeadRepository.updateFields(leadId, { interest: label });
      }
      await LeadEventRepository.insert({
        lead_id: leadId, type: 'service_selected',
        payload: { label, option_id: option.id ?? null },
        description: `Interesse: ${label}`,
      });
      await createNotification({
        type: 'service_selected',
        title: `Novo lead — ${label}`,
        body: `${lead.name}${lead.company ? ` (${lead.company})` : ''} escolheu ${label}`,
        data: { lead_id: leadId, automation_id: conv.automation_id, option_id: option.id ?? null, label, stage_id: option.stage_id ?? null },
        leadId,
        eventType: 'service_selected',
        eventDescription: `Interesse: ${label}`,
      });
    }
  }

  await ConversationRepository.update(conv.id, { current_node: 'menu', automation_status: 'waiting_input' });
}

// === Engine público ===
function automationAllowsInstance(automation: any, instanceName?: string): boolean {
  if (!instanceName) return true;
  try {
    const ids = JSON.parse(automation.instance_ids || '[]');
    return !Array.isArray(ids) || ids.length === 0 || ids.includes(instanceName);
  } catch {
    return true;
  }
}

export async function startAutomation(conversationId: string, automationId?: string, instanceName?: string): Promise<boolean> {
  const candidates = automationId
    ? [await AutomationRepository.findById(automationId)]
    : await AutomationRepository.listActive();
  const automation = candidates.find((item) => item && automationAllowsInstance(item, instanceName));
  if (!automation) {
    logger.warn('no active automation available', { conversationId });
    return false;
  }

  if (hasNumericMode(automation)) {
    await ConversationRepository.update(conversationId, {
      automation_id: automation.id,
      automation_status: 'running',
      current_node: 'menu',
      status: 'active',
    });
    const persisted = await persistInstance(conversationId, instanceName);
    await startNumeric(conversationId, automation, persisted);
    return true;
  }

  const graph = parseGraph(automation.graph);
  if (!graph.entry) {
    logger.error('automation has no entry node', { automation_id: automation.id });
    return false;
  }

  await ConversationRepository.update(conversationId, {
    automation_id: automation.id,
    automation_status: 'running',
    current_node: graph.entry,
    status: 'active',
  });

  await persistInstance(conversationId, instanceName);

  const leadId = await getLeadId({ conversationId, automationId: automation.id, graph });
  await LeadEventRepository.insert({
    lead_id: leadId,
    type: 'automation_started',
    payload: { automation_id: automation.id, automation_name: automation.name },
    description: `Automação "${automation.name}" iniciada`,
  });

  await runNode({ conversationId, automationId: automation.id, graph }, graph.entry);
  return true;
}

export async function processIncomingMessage(conversationId: string, message: string, instanceName?: string): Promise<void> {
  const conv = await ConversationRepository.findById(conversationId);
  if (!conv) return;
  if (conv.automation_status === 'paused' || conv.status === 'human') return;
  if (conv.automation_status === 'completed' || conv.status === 'closed') return;

  const automation = conv.automation_id ? await AutomationRepository.findById(conv.automation_id) : null;
  if (!automation) {
    await startAutomation(conversationId, undefined, instanceName);
    return;
  }

  if (hasNumericMode(automation)) {
    await handleNumericInput(conv, automation, message, instanceName ?? getStoredInstance(conv));
    return;
  }

  const graph = parseGraph(automation.graph);
  if (!conv.current_node) {
    await startAutomation(conversationId, undefined, instanceName);
    return;
  }

  await runNode({ conversationId, automationId: automation.id, graph }, conv.current_node, message);
}

async function runNode(ctx: HandlerContext, nodeId: string, input?: string): Promise<void> {
  const node = ctx.graph.nodes.find(n => n.id === nodeId);
  if (!node) {
    logger.warn('node not found', { nodeId, automation_id: ctx.automationId });
    return;
  }
  const handler = handlers[node.type];
  if (!handler) {
    logger.error('unknown node type', { type: node.type, automation_id: ctx.automationId });
    return;
  }

  await ConversationRepository.update(ctx.conversationId, { current_node: nodeId });

  try {
    const next = await handler(ctx, node, input);
    if (next === undefined) {
      await ConversationRepository.update(ctx.conversationId, { automation_status: 'waiting_input' });
      return;
    }
    if (next === null) {
      await ConversationRepository.update(ctx.conversationId, { automation_status: 'completed', current_node: null });
      return;
    }
    await runNode(ctx, next);
  } catch (err: any) {
    logger.error('automation node failed', { nodeId, type: node.type, error: String(err?.message || err) });
    await ConversationRepository.update(ctx.conversationId, { automation_status: 'paused', current_node: null });
  }
}

export async function pauseAutomation(conversationId: string) {
  await ConversationRepository.update(conversationId, { automation_status: 'paused', status: 'human', current_node: null });
}

export async function resumeAutomation(conversationId: string) {
  await ConversationRepository.update(conversationId, { automation_status: 'running', status: 'active' });
}

export async function getAutomationById(id: string) {
  return AutomationRepository.findById(id);
}

export async function listActiveAutomations() {
  return AutomationRepository.listActive();
}

export function parseAutomationGraph(raw: string): Graph {
  return parseGraph(raw);
}
