import { decodeSseMessage } from './sse.decoder';
import type { SseConnected, SseTelemetry, SseGpsBatch } from './sse.model';

describe('decodeSseMessage', () => {
  // ── Happy paths ───────────────────────────────────────────────────────────────

  it('returns a typed connected message for a valid connected frame', () => {
    const raw = JSON.stringify({ type: 'connected', truckCount: 12, timestamp: 1700000000000 });
    const result = decodeSseMessage(raw);
    expect(result.type).toBe('connected');
    expect((result as SseConnected).truckCount).toBe(12);
  });

  it('returns a typed heartbeat message for a heartbeat frame', () => {
    const raw = JSON.stringify({ type: 'heartbeat', timestamp: 1700000000000 });
    const result = decodeSseMessage(raw);
    expect(result.type).toBe('heartbeat');
  });

  it('returns a typed telemetry message when readings is an array', () => {
    const raw = JSON.stringify({ type: 'telemetry', readings: [], timestamp: 1700000000000 });
    const result = decodeSseMessage(raw);
    expect(result.type).toBe('telemetry');
    expect((result as SseTelemetry).readings).toEqual([]);
  });

  it('returns a typed gps_batch message when truckId and readings are present', () => {
    const raw = JSON.stringify({ type: 'gps_batch', truckId: 'truck_3', readings: [] });
    const result = decodeSseMessage(raw);
    expect(result.type).toBe('gps_batch');
    expect((result as SseGpsBatch).truckId).toBe('truck_3');
  });

  // ── Malformed / unknown ───────────────────────────────────────────────────────

  it('returns unknown for malformed JSON', () => {
    const result = decodeSseMessage('not-json{{');
    expect(result.type).toBe('unknown');
    if (result.type === 'unknown') expect(result.raw).toBe('not-json{{');
  });

  it('returns unknown for a JSON object with no type field', () => {
    const result = decodeSseMessage(JSON.stringify({ readings: [] }));
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for an unrecognised type string', () => {
    const result = decodeSseMessage(JSON.stringify({ type: 'future_event', data: 1 }));
    expect(result.type).toBe('unknown');
  });

  // ── Shape validation per known type ──────────────────────────────────────────

  it('returns unknown for connected without truckCount', () => {
    const result = decodeSseMessage(JSON.stringify({ type: 'connected', timestamp: 1700000000000 }));
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for connected with non-numeric truckCount', () => {
    const result = decodeSseMessage(JSON.stringify({ type: 'connected', truckCount: '12' }));
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for telemetry without a readings field', () => {
    const result = decodeSseMessage(JSON.stringify({ type: 'telemetry', timestamp: 1700000000000 }));
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for telemetry with readings as a non-array', () => {
    const result = decodeSseMessage(JSON.stringify({ type: 'telemetry', readings: 'bad', timestamp: 1700000000000 }));
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for gps_batch without truckId', () => {
    const result = decodeSseMessage(JSON.stringify({ type: 'gps_batch', readings: [] }));
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for gps_batch without readings', () => {
    const result = decodeSseMessage(JSON.stringify({ type: 'gps_batch', truckId: 'truck_3' }));
    expect(result.type).toBe('unknown');
  });
});
