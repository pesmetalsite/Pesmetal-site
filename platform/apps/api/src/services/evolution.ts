/**
 * Evolution API — wrapper isolado.
 * Toda comunicação com a Evolution API passa por aqui.
 * O resto do sistema NÃO deve fazer fetch direto para a Evolution API.
 */
import { nanoid } from 'nanoid';

const INSTANCE = process.env.EVOLUTION_INSTANCE || 'pesmetal-main';

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

export const Evolution = {
  instance: INSTANCE,

  async getConnectionState() {
    if (!getBaseUrl() || !getApiKey()) return { state: 'unconfigured', instance: INSTANCE };
    try {
      const r = await call(`/instance/connectionState/${INSTANCE}`, 'GET');
      return { state: r?.instance?.state ?? 'unknown', instance: INSTANCE };
    } catch (e: any) {
      return { state: 'error', instance: INSTANCE, error: String(e?.message || e) };
    }
  },

  async sendText({ number, text, delay }: SendTextInput) {
    return call(`/message/sendText/${INSTANCE}`, 'POST', {
      number,
      text,
      delay: delay ?? 0,
    });
  },

  async sendMedia({ number, mediaType, media, fileName, caption }: SendMediaInput) {
    return call(`/message/sendMedia/${INSTANCE}`, 'POST', {
      number,
      mediatype: mediaType,
      media,
      fileName,
      caption,
    });
  },

  async sendPresence(number: string, presence: 'composing' | 'recording' | 'paused') {
    try {
      return call(`/message/sendPresence/${INSTANCE}`, 'POST', { number, presence });
    } catch {
      return null;
    }
  },

  async setWebhook({ url, events, enabled = true }: { url: string; events: string[]; enabled?: boolean }) {
    return call(`/webhook/set/${INSTANCE}`, 'POST', {
      url,
      webhook_by_events: false,
      events,
      enabled,
    });
  },

  async findMessages({ number, limit = 20 }: { number: string; limit?: number }) {
    return call(`/chat/findMessages/${INSTANCE}`, 'POST', { where: { key: { remoteJid: number } }, limit });
  },
};

export type { SendTextInput, SendMediaInput };
