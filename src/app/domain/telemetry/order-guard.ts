import type { TruckReading } from '../../shared/models/telemetry.model';

export type OrderGuardResult = 'ACCEPT' | 'DROP_STALE';

/**
 * Returns ACCEPT when the reading's timestamp is strictly newer than the last
 * accepted timestamp for the same truck; DROP_STALE otherwise (Q5 / FR-4).
 * The _reordered flag is informational only — the timestamp comparison is authoritative.
 */
export function orderGuard(reading: TruckReading, lastAcceptedTs: number): OrderGuardResult {
  return reading.timestamp > lastAcceptedTs ? 'ACCEPT' : 'DROP_STALE';
}
