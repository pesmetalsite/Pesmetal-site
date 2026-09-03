/**
 * Erro padronizado da PESMETAL API.
 * Cada erro carrega um código semântico, HTTP status e mensagem amigável.
 *
 * Uso:
 *   throw new ApiError(404, 'lead_not_found', 'Lead não encontrado');
 *   throw new ApiError(422, 'validation_error', 'Email inválido', { field: 'email' });
 */

export type ErrorCode =
  | 'not_found'
  | 'validation_error'
  | 'unauthorized'
  | 'forbidden'
  | 'conflict'
  | 'rate_limited'
  | 'integration_error'
  | 'automation_error'
  | 'internal_error';

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static notFound(resource: string) {
    return new ApiError(404, 'not_found', `${resource} não encontrado`);
  }
  static unauthorized(msg = 'Não autenticado') {
    return new ApiError(401, 'unauthorized', msg);
  }
  static forbidden(msg = 'Sem permissão') {
    return new ApiError(403, 'forbidden', msg);
  }
  static validation(message: string, details?: unknown) {
    return new ApiError(422, 'validation_error', message, details);
  }
  static conflict(message: string) {
    return new ApiError(409, 'conflict', message);
  }
  static integration(message: string, details?: unknown) {
    return new ApiError(502, 'integration_error', message, details);
  }
  static internal(message = 'Erro interno do servidor') {
    return new ApiError(500, 'internal_error', message);
  }
}

/** Serializa qualquer erro em resposta JSON. */
export function serializeError(err: unknown) {
  if (err instanceof ApiError) {
    return {
      error: err.message,
      code: err.code,
      details: err.details,
    };
  }
  if (err instanceof Error) {
    return {
      error: process.env.NODE_ENV === 'development' ? err.message : 'Erro interno',
      code: 'internal_error' as const,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    };
  }
  return { error: 'Erro desconhecido', code: 'internal_error' as const };
}

/** Wrapper para async handlers — captura erros e passa pro error middleware. */
export function asyncHandler(fn: (req: any, res: any, url: URL) => Promise<unknown>) {
  return async (req: any, res: any, url: URL) => {
    try {
      await fn(req, res, url);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 500;
      const body = serializeError(err);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    }
  };
}
