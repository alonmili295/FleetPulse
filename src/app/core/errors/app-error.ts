// core/errors — typed AppError discriminated union; used by P4 (CircuitBreaker, RetryPolicy), P5 (ErrorMappingInterceptor, ConflictResolver), and GlobalErrorHandler. No retry logic, HTTP implementation, or UI display here.

interface BaseAppError {
  readonly message: string;
  readonly cause?: unknown;
}

/** Generic HTTP failure (non-409, non-503). */
export interface HttpAppError extends BaseAppError {
  readonly kind: 'http';
  readonly statusCode: number;
  readonly body?: unknown;
}

/** SSE or WS frame failed structural validation (malformed JSON or unexpected shape). */
export interface DecodeAppError extends BaseAppError {
  readonly kind: 'decode';
  readonly raw: string;
}

/** Transport layer failure (EventSource or WebSocket open / close error). */
export interface TransportAppError extends BaseAppError {
  readonly kind: 'transport';
}

/**
 * 409 conflict on PATCH /routes — handles both shapes from server.js:
 *   Scenario B (immediate check):   currentVersion + yourVersion + lastModifiedBy
 *   Scenario C (Q8 post-delay race): currentVersion only
 */
export interface ConflictAppError extends BaseAppError {
  readonly kind: 'conflict';
  readonly currentVersion: number;
  readonly yourVersion?: number;    // absent in Scenario C (Q8)
  readonly lastModifiedBy?: string; // absent in Scenario C (Q8)
}

/** 503 from GET /api/fleet (Q7). retryAfterSeconds is parsed from the Retry-After header. */
export interface ServiceUnavailableAppError extends BaseAppError {
  readonly kind: 'service_unavailable';
  readonly retryAfterSeconds?: number;
}

/** Discriminated union of all application-level error variants. */
export type AppError =
  | HttpAppError
  | DecodeAppError
  | TransportAppError
  | ConflictAppError
  | ServiceUnavailableAppError;

// ── Factory helpers ────────────────────────────────────────────────────────────
// Thin constructors; keep callers from spelling out `kind` manually.

export const AppError = {
  http(statusCode: number, message: string, body?: unknown, cause?: unknown): HttpAppError {
    return {
      kind: 'http', statusCode, message,
      ...(body !== undefined && { body }),
      ...(cause !== undefined && { cause }),
    };
  },

  decode(raw: string, message: string, cause?: unknown): DecodeAppError {
    return { kind: 'decode', raw, message, ...(cause !== undefined && { cause }) };
  },

  transport(message: string, cause?: unknown): TransportAppError {
    return { kind: 'transport', message, ...(cause !== undefined && { cause }) };
  },

  /** Pass yourVersion / lastModifiedBy when the 409 body includes them (Scenario B). */
  conflict(
    currentVersion: number,
    message: string,
    yourVersion?: number,
    lastModifiedBy?: string,
  ): ConflictAppError {
    return {
      kind: 'conflict', currentVersion, message,
      ...(yourVersion !== undefined && { yourVersion }),
      ...(lastModifiedBy !== undefined && { lastModifiedBy }),
    };
  },

  serviceUnavailable(message: string, retryAfterSeconds?: number, cause?: unknown): ServiceUnavailableAppError {
    return {
      kind: 'service_unavailable', message,
      ...(retryAfterSeconds !== undefined && { retryAfterSeconds }),
      ...(cause !== undefined && { cause }),
    };
  },
};
