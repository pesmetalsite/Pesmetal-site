/**
 * Evolution API — wrapper isolado.
 * Toda comunicação com a Evolution API passa por aqui.
 * O resto do sistema NÃO deve fazer fetch direto para a Evolution API.
 */
import { nanoid } from 'nanoid';

const DEFAULT_INSTANCE = process.env.EVOLUTION_INSTANCE || 'pesmetal-main';

// Lê env vars em cada chamada (lazy read) para refletir mudanças de configuração
// sem depender do momento do import do módulo. Railway reinicia o container ao
// alterar env vars, mas a leitura tardia também cobre cenários de hot-reload.
function getBaseUrl(): string {
  return (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
}

function getApiKey(): string {
  return process.env.EVOLUTION_API_KEY || '';
}

interface SendTextInput { number: string; text: string; delay?: number; }
interface SendMediaInput { number: string; mediaType: 'image' | 'document' | 'video' | 'audio'; media: string; fileName?: string; caption?: string; }

async function call(path: string, method: string, body?: any) {
  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();
  if (!baseUrl || !apiKey) {
    throw new Error('Evolution API não configurada (EVOLUTION_API_URL ou EVOLUTION_API_KEY ausente).');
  }
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Evolution API ${res.status}: ${text}`);
  }
  return res.json();
}

// Resolve o nome de instância: parâmetro explícito > env default
function resolveInstance(name?: string): string {
  return name || DEFAULT_INSTANCE;
}

export const Evolution = {
  instance: DEFAULT_INSTANCE,

  async getConnectionState(instanceName?: string) {
    if (!getBaseUrl() || !getApiKey()) return { state: 'unconfigured', instance: resolveInstance(instanceName) };
    try {
      const r = await call(`/instance/connectionState/${resolveInstance(instanceName)}`, 'GET');
      return { state: r?.instance?.state ?? 'unknown', instance: resolveInstance(instanceName) };
    } catch (e: any) {
      return { state: 'error', instance: resolveInstance(instanceName), error: String(e?.message || e) };
    }
  },

  async sendText({ number, text, delay }: SendTextInput) {
    return call(`/message/sendText/${DEFAULT_INSTANCE}`, 'POST', {
      number,
      text,
      delay: delay ?? 0,
    });
  },

  async sendMedia({ number, mediaType, media, fileName, caption }: SendMediaInput) {
    return call(`/message/sendMedia/${DEFAULT_INSTANCE}`, 'POST', {
      number,
      mediatype: mediaType,
      media,
      fileName,
      caption,
    });
  },

  async sendPresence(number: string, presence: 'composing' | 'recording' | 'paused') {
    try {
      return call(`/message/sendPresence/${DEFAULT_INSTANCE}`, 'POST', { number, presence });
    } catch {
      return null;
    }
  },

  async setWebhook({ url, events, enabled = true, instanceName }: { url: string; events: string[]; enabled?: boolean; instanceName?: string }) {
    return call(`/webhook/set/${resolveInstance(instanceName)}`, 'POST', {
      url,
      webhook_by_events: false,
      events,
      enabled,
    });
  },

  async findMessages({ number, limit = 20 }: { number: string; limit?: number }) {
    return call(`/chat/findMessages/${DEFAULT_INSTANCE}`, 'POST', { where: { key: { remoteJid: number } }, limit });
  },
};

export type { SendTextInput, SendMediaInput };
