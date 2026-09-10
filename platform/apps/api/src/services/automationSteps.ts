/**
 * Engine de Steps Multimídia + Fluxos Ramificados.
 *
 * Modelo de dados:
 *   steps:       [{ id, type: 'message'|'image'|'audio'|'video'|'document'|'menu'|'end',
 *                   content, media_url, media_mime, file_name, caption, delay_seconds,
 *                   parent_step_id, position }]
 *   step_options:[{ id, step_id, option_key, label, next_step_id }]
 *
 * Execução:
 *   - Estado persistido em whatsapp_conversations (current_step_id, automation_steps_state).
 *   - Delays não bloqueiam o servidor: usa setTimeout em memória (single-instance).
 *   - Quando cliente responde, processIncomingStep() interpreta e encontra próximo step.
 *   - Fallback: se automation não tem `steps`, usa o engine legado (graph/options).
 */
import { AutomationRepository } from '../repositories/automationRepo.js';
import { ConversationRepository, MessageRepository } from '../repositories/conversationRepo.js';
import { ContactRepository } from '../repositories/contactRepo.js';
import { LeadRepository } from '../repositories/leadRepo.js';
import { StageRepository } from '../repositories/stageRepo.js';
import { LeadEventRepository } from '../repositories/miscRepos.js';
import { Evolution } from './evolution.js';
import { createNotification } from './notifications.js';
import { logger } from '../lib/logger.js';

// === Tipos públicos ===
export type StepType = 'message' | 'image' | 'audio' | 'video' | 'document' | 'menu' | 'end';

export interface AutomationStep {
  id: string;
  type: StepType;
  content?: string;        // texto da mensagem
  media_url?: string;      // URL/path do arquivo
  media_mime?: string;
  file_name?: string;
  caption?: string;        // legenda para image/video/document
  delay_seconds?: number;  // sempre em segundos; frontend converte minutos→segundos
  parent_step_id?: string | null;
  position?: number;
}

export interface StepOption {
  id: string;
  step_id: string;
  option_key: string;       // '1', '2', '0' (voltar)
  label: string;
  next_step_id: string | null;  // null = end (encerra fluxo)
  transfer_human?: boolean;
  stage_id?: string;
}

// === Parsers ===
function parseSteps(raw: string | null | undefined): AutomationStep[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((s): s is AutomationStep => !!s && typeof s === 'object' && typeof s.id === 'string');
  } catch {}
  return [];
}

function parseStepOptions(raw: string | null | undefined): StepOption[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((o): o is StepOption => !!o && typeof o === 'object' && typeof o.id === 'string');
  } catch {}
  return [];
}

export function hasStepModel(automation: any): boolean {
  const steps = parseSteps(automation?.steps);
  return steps.length > 0;
}

// === Helpers ===
function formatNumber(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return phone;
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

function getStoredInstance(conv: any): string | undefined {
  if (!conv?.context) return undefined;
  try {
    const c = JSON.parse(conv.context);
    return typeof c.instance === 'string' && c.instance ? c.instance : undefined;
  } catch { return undefined; }
}

async function persistInstance(conversationId: string, instanceName?: string): Promise<string | undefined> {
  if (!instanceName) return undefined;
  const conv = await ConversationRepository.findById(conversationId);
  const ctx = conv?.context ? (() => { try { return JSON.parse(conv.context); } catch { return {}; } })() : {};
  if (ctx.instance === instanceName) return instanceName;
  await ConversationRepository.update(conversationId, { context: JSON.stringify({ ...ctx, instance: instanceName }) });
  return instanceName;
}

// === Envio por tipo ===
async function sendStepContent(
  conv: any,
  step: AutomationStep,
  instanceName?: string
): Promise<{ ok: boolean; error?: string }> {
  const contact = await ContactRepository.findById(conv.contact_id);
  if (!contact) return { ok: false, error: 'no contact' };
  const number = formatNumber(contact.phone);

  switch (step.type) {
    case 'message': {
      const text = step.content || '';
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
        return { ok: true };
      } catch (e: any) {
        await MessageRepository.updateStatus(msgId, 'failed');
        return { ok: false, error: String(e?.message || e) };
      }
    }
    case 'image':
    case 'video':
    case 'document': {
      const mediaUrl = step.media_url;
      if (!mediaUrl) return { ok: false, error: 'no media_url' };
      const mediaType: 'image' | 'video' | 'document' = step.type === 'image' ? 'image' : step.type === 'video' ? 'video' : 'document';
      const msgId = await MessageRepository.insert({
        conversation_id: conv.id,
        direction: 'outgoing',
        type: mediaType,
        content: step.caption || '',
        media_url: mediaUrl,
        media_mime: step.media_mime || null,
        status: 'pending',
      });
      try {
        await Evolution.sendMedia({
          number,
          mediaType,
          media: mediaUrl,
          caption: step.caption,
          fileName: step.file_name,
          instanceName,
        });
        await MessageRepository.updateStatus(msgId, 'sent');
        return { ok: true };
      } catch (e: any) {
        await MessageRepository.updateStatus(msgId, 'failed');
        return { ok: false, error: String(e?.message || e) };
      }
    }
    case 'audio': {
      const mediaUrl = step.media_url;
      if (!mediaUrl) return { ok: false, error: 'no media_url' };
      const msgId = await MessageRepository.insert({
        conversation_id: conv.id,
        direction: 'outgoing',
        type: 'audio',
        content: '',
        media_url: mediaUrl,
        media_mime: step.media_mime || 'audio/ogg',
        status: 'pending',
      });
      try {
        // Evolution aceita 'audio' no sendMedia — usa PTT/OGG como WhatsApp audio.
        await Evolution.sendMedia({
          number,
          mediaType: 'audio',
          media: mediaUrl,
          instanceName,
        });
        await MessageRepository.updateStatus(msgId, 'sent');
        return { ok: true };
      } catch (e: any) {
        await MessageRepository.updateStatus(msgId, 'failed');
        return { ok: false, error: String(e?.message || e) };
      }
    }
    case 'menu': {
      // Menu envia texto com lista de opções
      const options = await loadStepOptions(conv.automation_id, step.id);
      const optLines = options.map(o => `${o.option_key} — ${o.label}`).join('\n');
      const full = `${step.content || ''}\n\n${optLines}`.trim();
      const msgId = await MessageRepository.insert({
        conversation_id: conv.id,
        direction: 'outgoing',
        type: 'text',
        content: full,
        status: 'pending',
      });
      try {
        await Evolution.sendText({ number, text: full, instanceName });
        await MessageRepository.updateStatus(msgId, 'sent');
        return { ok: true };
      } catch (e: any) {
        await MessageRepository.updateStatus(msgId, 'failed');
        return { ok: false, error: String(e?.message || e) };
      }
    }
    case 'end': {
      // Mensagem final (se houver) + encerra fluxo
      const text = step.content || 'Fluxo encerrado.';
      if (text) {
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
        } catch {}
      }
      return { ok: true };
    }
    default:
      return { ok: false, error: `unknown step type: ${step.type}` };
  }
}

// === Carregar opções (precisa buscar automação + parsear step_options) ===
async function loadStepOptions(automationId: string | null, stepId: string): Promise<StepOption[]> {
  if (!automationId) return [];
  const automation = await AutomationRepository.findById(automationId);
  if (!automation) return [];
  const all = parseStepOptions(automation.step_options);
  return all.filter(o => o.step_id === stepId);
}

// === Engines públicos ===

/**
 * Inicia o fluxo de steps de uma automação para uma conversa.
 * Encontra o step raiz (parent_step_id null, position 0).
 */
export async function startStepAutomation(
  conversationId: string,
  automationId: string,
  instanceName?: string
): Promise<boolean> {
  const automation = await AutomationRepository.findById(automationId);
  if (!automation) return false;
  const steps = parseSteps(automation.steps);
  if (!steps.length) return false;

  const root = steps.find(s => !s.parent_step_id) || steps.sort((a, b) => (a.position || 0) - (b.position || 0))[0];
  if (!root) return false;

  await ConversationRepository.update(conversationId, {
    automation_id: automationId,
    automation_status: 'running',
    current_node: root.id, // reutiliza coluna current_node para guardar step_id
    status: 'active',
  });
  await persistInstance(conversationId, instanceName);

  const leadId = await getLeadIdByConversation(conversationId);
  if (leadId) {
    await LeadEventRepository.insert({
      lead_id: leadId,
      type: 'automation_started',
      payload: { automation_id: automationId, automation_name: automation.name, model: 'steps' },
      description: `Automação "${automation.name}" iniciada (steps)`,
    });
  }

  // Envia o primeiro step com delay
  await executeStep(conversationId, automation, root, instanceName, false);
  return true;
}

/**
 * Processa uma mensagem recebida do cliente no modelo de steps.
 * Interpreta resposta como opção ou avança.
 */
export async function processIncomingStep(
  conversationId: string,
  message: string,
  instanceName?: string
): Promise<void> {
  const conv = await ConversationRepository.findById(conversationId);
  if (!conv) return;
  if (conv.automation_status === 'paused' || conv.status === 'human') return;
  if (conv.automation_status === 'completed' || conv.status === 'closed') return;
  if (!conv.automation_id) return;

  const automation = await AutomationRepository.findById(conv.automation_id);
  if (!automation) return;
  const steps = parseSteps(automation.steps);
  if (!steps.length) return;

  const currentStep = steps.find(s => s.id === conv.current_node);
  if (!currentStep) return;

  const trimmed = (message || '').trim();

  // Step tipo menu: processa opção
  if (currentStep.type === 'menu') {
    const options = await loadStepOptions(automation.id, currentStep.id);
    const lc = trimmed.toLowerCase();
    const option = options.find(o => o.option_key === trimmed)
      || options.find(o => String(o.option_key).toLowerCase() === lc)
      || options.find(o => o.label && o.label.toLowerCase() === lc);

    if (!option) {
      // Mensagem inválida: reenvia menu
      const instance = instanceName ?? getStoredInstance(conv);
      await sendStepContent(conv, currentStep, instance);
      return;
    }

    // Voltar (option_key '0')
    if (option.option_key === '0' || option.option_key.toLowerCase() === 'voltar') {
      const parent = currentStep.parent_step_id
        ? steps.find(s => s.id === currentStep.parent_step_id)
        : null;
      if (parent) {
        await executeStep(conversationId, automation, parent, instanceName, true);
        return;
      }
    }

    // Transferência humana
    if (option.transfer_human) {
      await ConversationRepository.update(conv.id, {
        automation_status: 'transferred',
        status: 'human',
        current_node: null,
      });
      const leadId = await getLeadIdByConversation(conv.id);
      if (leadId) {
        const targetStage = option.stage_id || 'stage_atend';
        const lead = await LeadRepository.findById(leadId);
        if (lead && lead.stage_id !== targetStage) {
          await LeadRepository.updateFields(leadId, { stage_id: targetStage });
        }
        await createNotification({
          type: 'human_takeover',
          title: 'Atendimento humano',
          body: `Cliente solicitou atendimento humano`,
          data: { lead_id: leadId, automation_id: automation.id, option_id: option.id, label: option.label },
          leadId,
          eventType: 'human_takeover',
          eventDescription: 'Cliente solicitou atendente humano',
        });
      }
      // Mensagem de transferência
      if (option.label) {
        const instance = instanceName ?? getStoredInstance(conv);
        const number = formatNumber((await ContactRepository.findById(conv.contact_id))?.phone || '');
        if (number) {
          await Evolution.sendText({ number, text: 'Vou transferir você para um atendente humano.', instanceName: instance });
        }
      }
      return;
    }

    // Próximo step
    if (option.next_step_id) {
      const nextStep = steps.find(s => s.id === option.next_step_id);
      if (nextStep) {
        await executeStep(conversationId, automation, nextStep, instanceName, true);
        return;
      }
    }

    // Sem next_step_id = fim
    await ConversationRepository.update(conv.id, {
      automation_status: 'completed',
      current_node: null,
    });
    return;
  }

  // Step tipo message: avança para o próximo (next implícito por position)
  // Se houver options para este step, trata como menu também
  const options = await loadStepOptions(automation.id, currentStep.id);
  if (options.length > 0) {
    // É um step de mensagem com opções (similar a menu)
    const lc = trimmed.toLowerCase();
    const option = options.find(o => o.option_key === trimmed)
      || options.find(o => String(o.option_key).toLowerCase() === lc)
      || options.find(o => o.label && o.label.toLowerCase() === lc);

    if (option && option.next_step_id) {
      const nextStep = steps.find(s => s.id === option.next_step_id);
      if (nextStep) {
        await executeStep(conversationId, automation, nextStep, instanceName, true);
        return;
      }
    }
    // Sem opção válida: reenvia o step
    const instance = instanceName ?? getStoredInstance(conv);
    await sendStepContent(conv, currentStep, instance);
    return;
  }

  // Step genérico: avança para próximo na posição
  const currentPos = currentStep.position || 0;
  const next = steps.filter(s => (s.position || 0) > currentPos).sort((a, b) => (a.position || 0) - (b.position || 0))[0];
  if (next) {
    await executeStep(conversationId, automation, next, instanceName, true);
  } else {
    await ConversationRepository.update(conv.id, {
      automation_status: 'completed',
      current_node: null,
    });
  }
}

/**
 * Executa um step: envia conteúdo, aguarda delay, atualiza estado.
 * Delay não bloqueia: usa setTimeout. Se for step final, marca como completed.
 */
async function executeStep(
  conversationId: string,
  automation: any,
  step: AutomationStep,
  instanceName: string | undefined,
  fromUserInput: boolean
): Promise<void> {
  const conv = await ConversationRepository.findById(conversationId);
  if (!conv) return;
  const instance = instanceName ?? getStoredInstance(conv);

  // Step final: encerra
  if (step.type === 'end') {
    await sendStepContent(conv, step, instance);
    await ConversationRepository.update(conversationId, {
      automation_status: 'completed',
      current_node: null,
    });
    return;
  }

  // Envia conteúdo do step atual
  await sendStepContent(conv, step, instance);
  await ConversationRepository.update(conversationId, { last_message_at: new Date().toISOString() });

  // Step tipo menu: aguarda input (não avança automaticamente)
  if (step.type === 'menu') {
    await ConversationRepository.update(conversationId, {
      current_node: step.id,
      automation_status: 'waiting_input',
    });
    return;
  }

  // Step com opções anexadas (message+options)
  const options = await loadStepOptions(automation.id, step.id);
  if (options.length > 0) {
    await ConversationRepository.update(conversationId, {
      current_node: step.id,
      automation_status: 'waiting_input',
    });
    return;
  }

  // Step sequencial: aplica delay e avança para próximo
  const delaySec = Math.max(0, Math.min(step.delay_seconds || 0, 600)); // cap 10min
  await ConversationRepository.update(conversationId, {
    current_node: step.id,
    automation_status: 'running',
  });

  if (delaySec > 0) {
    setTimeout(async () => {
      try {
        const fresh = await ConversationRepository.findById(conversationId);
        if (!fresh || fresh.automation_status === 'paused' || fresh.status === 'human') return;
        // Encontra próximo step sequencial
        const steps = parseSteps(automation.steps);
        const currentPos = step.position || 0;
        const next = steps.filter(s => (s.position || 0) > currentPos).sort((a, b) => (a.position || 0) - (b.position || 0))[0];
        if (next) await executeStep(conversationId, automation, next, instance, false);
        else await ConversationRepository.update(conversationId, { automation_status: 'completed', current_node: null });
      } catch (e: any) {
        logger.error('step delay continuation failed', { conversationId, error: String(e?.message || e) });
      }
    }, delaySec * 1000);
  } else {
    // Sem delay: avança imediatamente
    const steps = parseSteps(automation.steps);
    const currentPos = step.position || 0;
    const next = steps.filter(s => (s.position || 0) > currentPos).sort((a, b) => (a.position || 0) - (b.position || 0))[0];
    if (next) await executeStep(conversationId, automation, next, instance, false);
    else await ConversationRepository.update(conversationId, { automation_status: 'completed', current_node: null });
  }
}

async function getLeadIdByConversation(conversationId: string): Promise<string | null> {
  const conv = await ConversationRepository.findById(conversationId);
  return conv?.lead_id ?? null;
}
