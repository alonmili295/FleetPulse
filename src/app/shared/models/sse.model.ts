// shared/models — SSE message discriminated union from SERVER_ANALYSIS §7; used by P1 (sse.decoder), P2 (TelemetryPipeline ingestion). No EventSource, reconnect, or stream state here.

import type { RawReading } from './telemetry.model';

export interface SseConnected {
  readonly type: 'connected';
  readonly truckCount: number;
  readonly timestamp: number;
}

export interface SseHeartbeat {
  readonly type: 'heartbeat';
  readonly timestamp: number;
}

export interface SseTelemetry {
  readonly type: 'telemetry';
  readonly readings: RawReading[];
  readonly timestamp: number;
}

export interface SseGpsBatch {
  readonly type: 'gps_batch';
  readonly truckId: string;
  readonly readings: RawReading[];
}

/** All well-formed SSE message variants. */
export type SseMessage = SseConnected | SseHeartbeat | SseTelemetry | SseGpsBatch;

/** Produced by the decoder when the frame is malformed JSON or carries an unrecognised type. */
export interface UnknownSseMessage {
  readonly type: 'unknown';
  readonly raw: string;
}
