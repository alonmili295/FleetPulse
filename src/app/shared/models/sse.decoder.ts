// shared/models — pure decoder for SSE `data:` payloads; used by P2 (SseClient → TelemetryPipeline). No EventSource, retry, service injection, or state here.

import { safeJsonParse } from '../utils/json.utils';
import type { SseMessage, UnknownSseMessage } from './sse.model';

const UNKNOWN: (raw: string) => UnknownSseMessage = (raw) => ({ type: 'unknown', raw });

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

/**
 * Decode a raw SSE data-frame string into a typed SseMessage.
 * Performs minimal per-type shape validation; returns UnknownSseMessage on malformed
 * JSON, an unrecognised type, or a known type with a missing required field.
 * Never throws.
 */
export function decodeSseMessage(raw: string): SseMessage | UnknownSseMessage {
  const parsed = safeJsonParse(raw);
  if (parsed === undefined || typeof parsed !== 'object' || parsed === null) {
    return UNKNOWN(raw);
  }

  const obj = parsed as Record<string, unknown>;
  const type = obj['type'];
  if (typeof type !== 'string') return UNKNOWN(raw);

  switch (type) {
    case 'connected':
      if (typeof obj['truckCount'] !== 'number') return UNKNOWN(raw);
      return obj as unknown as SseMessage;

    case 'heartbeat':
      // Only the type discriminant is required; timestamp is informational.
      return obj as unknown as SseMessage;

    case 'telemetry':
      if (!isArray(obj['readings'])) return UNKNOWN(raw);
      return obj as unknown as SseMessage;

    case 'gps_batch':
      if (typeof obj['truckId'] !== 'string') return UNKNOWN(raw);
      if (!isArray(obj['readings'])) return UNKNOWN(raw);
      return obj as unknown as SseMessage;

    default:
      return UNKNOWN(raw);
  }
}
