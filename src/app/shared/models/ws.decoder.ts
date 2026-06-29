// shared/models — pure decoder for WebSocket server→client text frames; used by P6 (WebSocketClient → PresenceStore / RoutesStore). No socket lifecycle, send queue, or state here.

import { safeJsonParse } from '../utils/json.utils';
import type { WsMessage, UnknownWsMessage } from './ws.model';

const UNKNOWN: (raw: string) => UnknownWsMessage = (raw) => ({ type: 'unknown', raw });

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Decode a raw WebSocket text frame (server → client) into a typed WsMessage.
 * Performs minimal per-type shape validation on fields that downstream consumers
 * will dereference; returns UnknownWsMessage for malformed JSON, unrecognised types,
 * or known types missing required fields. Never throws.
 * Client→server types (register_dispatcher, ping, viewing_truck) are intentionally
 * excluded from the recognised set.
 */
export function decodeWsMessage(raw: string): WsMessage | UnknownWsMessage {
  const parsed = safeJsonParse(raw);
  if (!isObj(parsed)) return UNKNOWN(raw);

  const obj = parsed as Record<string, unknown>;
  if (typeof obj['type'] !== 'string') return UNKNOWN(raw);

  switch (obj['type']) {
    case 'registered':
      if (typeof obj['dispatcherId'] !== 'string') return UNKNOWN(raw);
      return obj as unknown as WsMessage;

    case 'pong':
      if (typeof obj['timestamp'] !== 'number') return UNKNOWN(raw);
      return obj as unknown as WsMessage;

    case 'dispatcher_joined':
      if (typeof obj['dispatcherId'] !== 'string') return UNKNOWN(raw);
      if (typeof obj['name'] !== 'string') return UNKNOWN(raw);
      return obj as unknown as WsMessage;

    case 'dispatcher_left':
      // dispatcherId is critical for the idempotent removal guard (Q6 / FR-16).
      if (typeof obj['dispatcherId'] !== 'string') return UNKNOWN(raw);
      return obj as unknown as WsMessage;

    case 'dispatcher_viewing':
      if (typeof obj['dispatcherId'] !== 'string') return UNKNOWN(raw);
      if (typeof obj['truckId'] !== 'string') return UNKNOWN(raw);
      return obj as unknown as WsMessage;

    case 'route_assigned':
    case 'route_updated':
    case 'route_reassigned':
      // route object is required; version is read from route._version (SERVER_ANALYSIS §9).
      if (!isObj(obj['route'])) return UNKNOWN(raw);
      return obj as unknown as WsMessage;

    case 'truck_alert':
      if (!isObj(obj['alert'])) return UNKNOWN(raw);
      return obj as unknown as WsMessage;

    case 'fleet_reset':
      // Only the type discriminant is required; timestamp is informational.
      return obj as unknown as WsMessage;

    case 'error':
      if (typeof obj['message'] !== 'string') return UNKNOWN(raw);
      return obj as unknown as WsMessage;

    default:
      return UNKNOWN(raw);
  }
}
