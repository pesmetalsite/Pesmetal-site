/**
 * Logger estruturado PESMETAL.
 * Substitui console.log com timestamps, níveis e contexto JSON.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const CURRENT_LEVEL = LEVELS[(process.env.LOG_LEVEL as Level) || 'info'] || LEVELS.info;

function shouldLog(level: Level) {
  return LEVELS[level] >= CURRENT_LEVEL;
}

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (!shouldLog(level)) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...meta,
  };
  // Em produção: JSON puro. Em dev: colorido.
  if (process.env.NODE_ENV === 'development') {
    const color = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' }[level];
    const reset = '\x1b[0m';
    console.log(`${color}[${level.toUpperCase()}]${reset} ${line.ts} ${msg}`, meta ? meta : '');
  } else {
    console.log(JSON.stringify(line));
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
  child: (bindings: Record<string, unknown>) => ({
    debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, { ...bindings, ...meta }),
    info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, { ...bindings, ...meta }),
    warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, { ...bindings, ...meta }),
    error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, { ...bindings, ...meta }),
  }),
};
