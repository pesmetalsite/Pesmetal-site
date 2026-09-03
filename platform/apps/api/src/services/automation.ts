/**
 * Automation Engine v2 — FSM com dispatch table.
 *
 * Cada tipo de nó tem um handler tipado. Estado persistido em whatsapp_conversations.
 * Sem IA — regras puras configuráveis pelo painel.
 *
 * Fluxo:
 *   trigger (new_contact/keyword/lead_created)
 *     → resolve automação
 *     → set current_node = entry
 *     → executa handler[entry.type]()
 *     → se handler.next existe → executa próximo
 *     → senão espera input
 */
import { AutomationRepository } from '../repositories/automationRepo.js';
import { ConversationRepository, MessageRepository } from '../repositories/conversationRepo.js';
import { LeadRepository } from '../repositories/leadRepo.js';
import { ContactRepository } from '../repositories/contactRepo.js';
import { StageRepository } from '../repositories/stageRepo.js';
import { LeadEventRepository } from '../repositories/miscRepos.js';
import { Evolution } from './evolution.js';
import { logger } from '../lib/logger.js';
import type { AutomationGraphSchema } from '../lib/validators.js';
import { z } from 'zod';

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

const handlers: Record<string, Handler> = {
  message: async (ctx, node) => {
    await sendMessage(ctx, node);
    return node.next ?? null;
  },
  menu: async (ctx, node, input) => {
    if (!input) {
      // primeira vez: envia menu, espera input
      await sendMenu(ctx, node);
      return undefined; // fica aguardando
    }
    const option = node.options?.find(o => o.key.trim() === input.trim());
    if (!option) {
      // input inválido: reenvia menu
      await sendMenu(ctx, node);
      return undefined;
    }
    return option.next;
  },
  set_interest: async (ctx, node) => {
    const leadId = getLeadId(ctx);
    if (leadId) {
      LeadRepository.updateFields(leadId, { interest: node.config.value });
      LeadEventRepository.insert({ lead_id: leadId, type: 'service_selected', description: `Interesse definido: ${node.config.value}` });
    }
    return node.next ?? null;
  },
  move_stage: async (ctx, node) => {
    const leadId = getLeadId(ctx);
    if (leadId && node.config.stage_id) {
      const current = LeadRepository.findById(leadId);
      if (current && current.stage_id !== node.config.stage_id) {
        const newStage = StageRepository.findById(node.config.stage_id);
        if (newStage) {
          LeadRepository.updateFields(leadId, { stage_id: node.config.stage_id });
          LeadEventRepository.insert({ lead_id: leadId, type: 'stage_changed', payload: { from: current.stage_id, to: node.config.stage_id }, description: `Movido para ${newStage.name}` });
        }
      }
    }
    return node.next ?? null;
  },
  set_tag: async (ctx, node) => {
    const leadId = getLeadId(ctx);
    if (leadId && node.config.tag) {
      const lead = LeadRepository.findById(leadId);
      if (lead) {
        const c = ContactRepository.findById(lead.contact_id);
        if (c) {
          const tags = c.tags ? JSON.parse(c.tags) : [];
          if (!tags.includes(node.config.tag)) tags.push(node.config.tag);
          ContactRepository.update(c.id, { tags: JSON.stringify(tags) });
        }
      }
    }
    return node.next ?? null;
  },
  assign_user: async (ctx, node) => {
    const leadId = getLeadId(ctx);
    if (leadId && node.config.user_id) {
      LeadRepository.updateFields(leadId, { assigned_user_id: node.config.user_id });
      ConversationRepository.update(ctx.conversationId, { assigned_user_id: node.config.user_id });
    }
    return node.next ?? null;
  },
  request_info: async (ctx, node, input) => {
    if (input) saveInput(ctx, node, input);
    await sendMessage(ctx, node);
    return undefined;
  },
  request_file: async (ctx, node, input) => {
    if (input) saveInput(ctx, node, input);
    await sendMessage(ctx, node);
    return undefined;
  },
  wait_input: async (ctx, node, input) => {
    if (input) saveInput(ctx, node, input);
    return node.next ?? null;
  },
  transfer_human: async (ctx) => {
    ConversationRepository.update(ctx.conversationId, {
      automation_status: 'transferred', status: 'human', current_node: null,
    });
    const leadId = getLeadId(ctx);
    if (leadId) {
      LeadRepository.updateFields(leadId, { stage_id: 'stage_atend' });
      LeadEventRepository.insert({ lead_id: leadId, type: 'human_takeover', description: 'Cliente solicitou atendente humano' });
    }
    return null;
  },
  end: async (ctx) => {
    ConversationRepository.update(ctx.conversationId, { automation_status: 'completed', current_node: null });
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

// === Helpers ===
function getLeadId(ctx: HandlerContext): string | null {
  const conv = ConversationRepository.findById(ctx.conversationId);
  return conv?.lead_id ?? null;
}

function saveInput(ctx: HandlerContext, node: Node, input: string) {
  const conv = ConversationRepository.findById(ctx.conversationId);
  const ctxJson = conv?.context ? JSON.parse(conv.context) : {};
  ctxJson.last_input = input;
  if (node.config?.capture_as) ctxJson[node.config.capture_as] = input;
  ConversationRepository.update(ctx.conversationId, { context: JSON.stringify(ctxJson) });
}

async function sendMessage(ctx: HandlerContext, node: Node) {
  const conv = ConversationRepository.findById(ctx.conversationId);
  if (!conv) return;
  const contact = ContactRepository.findById(conv.contact_id);
  if (!contact) return;
  const number = formatNumber(contact.phone);
  const text = node.config?.text ?? '';
  const msgId = MessageRepository.insert({
    conversation_id: ctx.conversationId,
    direction: 'outgoing',
    type: 'text',
    content: text,
    status: 'pending',
    sent_by: 'automation',
  });
  try {
    await Evolution.sendText({ number, text });
    MessageRepository.updateStatus(msgId, 'sent');
    ConversationRepository.update(ctx.conversationId, { last_message_at: new Date().toISOString() });
  } catch (err: any) {
    MessageRepository.updateStatus(msgId, 'failed');
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

function parseGraph(raw: string): Graph {
  try { return JSON.parse(raw) as Graph; } catch { return { entry: '', nodes: [] }; }
}

// === Engine público ===
export async function startAutomation(conversationId: string, automationId?: string): Promise<boolean> {
  const automation = automationId
    ? AutomationRepository.findById(automationId)
    : AutomationRepository.listActive()[0];
  if (!automation) {
    logger.warn('no active automation available', { conversationId });
    return false;
  }

  const graph = parseGraph(automation.graph);
  if (!graph.entry) {
    logger.error('automation has no entry node', { automation_id: automation.id });
    return false;
  }

  ConversationRepository.update(conversationId, {
    automation_id: automation.id,
    automation_status: 'running',
    current_node: graph.entry,
    status: 'active',
  });

  const leadId = getLeadId({ conversationId, automationId: automation.id, graph });
  LeadEventRepository.insert({
    lead_id: leadId,
    type: 'automation_started',
    payload: { automation_id: automation.id, automation_name: automation.name },
    description: `Automação "${automation.name}" iniciada`,
  });

  await runNode({ conversationId, automationId: automation.id, graph }, graph.entry);
  return true;
}

export async function processIncomingMessage(conversationId: string, message: string): Promise<void> {
  const conv = ConversationRepository.findById(conversationId);
  if (!conv) return;
  if (conv.automation_status === 'paused' || conv.status === 'human') return;

  const automation = conv.automation_id ? AutomationRepository.findById(conv.automation_id) : null;
  if (!automation) {
    await startAutomation(conversationId);
    return;
  }

  const graph = parseGraph(automation.graph);
  if (!conv.current_node) {
    await startAutomation(conversationId);
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

  ConversationRepository.update(ctx.conversationId, { current_node: nodeId });

  try {
    const next = await handler(ctx, node, input);
    if (next === undefined) {
      // fica aguardando input
      ConversationRepository.update(ctx.conversationId, { automation_status: 'waiting_input' });
      return;
    }
    if (next === null) {
      ConversationRepository.update(ctx.conversationId, { automation_status: 'completed', current_node: null });
      return;
    }
    await runNode(ctx, next);
  } catch (err: any) {
    logger.error('automation node failed', { nodeId, type: node.type, error: String(err?.message || err) });
    ConversationRepository.update(ctx.conversationId, { automation_status: 'paused', current_node: null });
  }
}

export function pauseAutomation(conversationId: string) {
  ConversationRepository.update(conversationId, { automation_status: 'paused', status: 'human', current_node: null });
}

export function resumeAutomation(conversationId: string) {
  ConversationRepository.update(conversationId, { automation_status: 'running', status: 'active' });
}

export function getAutomationById(id: string) {
  return AutomationRepository.findById(id);
}

export function listActiveAutomations() {
  return AutomationRepository.listActive();
}

export function parseAutomationGraph(raw: string): Graph {
  return parseGraph(raw);
}
