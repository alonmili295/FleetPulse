// shared/utils — non-throwing JSON parse; used by P1 (sse.decoder, ws.decoder), any future untrusted-input parsing. No logging, services, or state.

/**
 * Parse a JSON string without throwing.
 * Returns `undefined` for malformed input instead of raising a SyntaxError.
 */
export function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}
