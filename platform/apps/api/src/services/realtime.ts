/**
 * Realtime Service — SSE pub/sub leve para o painel.
 *
 * Arquitetura: emissão em memória (single instance Railway). Cada conexão SSE
 * registra um subscriber; mutações no backend chamam `publish` para broadcast.
 *
 * Segurança: o endpoint valida o Bearer token antes de abrir o stream. Nunca
 * expõe o token na URL.
 */
import type { ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';

type Payload = Record<string, unknown>;

const bus = new EventEmitter();
bus.setMaxListeners(500);

/** Publica um evento para todos os subscribers (apenas admin/gestor). */
export function publish(entity: string, action: 'created' | 'updated' | 'deleted', data: Payload) {
  bus.emit('event', JSON.stringify({ entity, action, data, ts: new Date().toISOString() }));
}

/** Abre uma conexão SSE. Retorna função de cleanup. */
export function openStream(res: ServerResponse): () => void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write('retry: 5000\n\n');

  const send = (payload: string) => {
    if (res.writable) res.write(`data: ${payload}\n\n`);
  };
  const onEvent = (payload: string) => send(payload);
  bus.on('event', onEvent);

  // keep-alive para não derrubar por idle
  const heartbeat = setInterval(() => {
    if (res.writable) res.write(': ping\n\n');
  }, 25000);

  const cleanup = () => {
    clearInterval(heartbeat);
    bus.off('event', onEvent);
    try { res.end(); } catch { /* já fechado */ }
  };
  res.on('close', cleanup);
  res.on('error', cleanup);
  return cleanup;
}