import type { RawReading, TruckReading } from '../../shared/models/telemetry.model';
import { normalize } from './normalize';
import { orderGuard } from './order-guard';

export interface BatchResult {
  readonly trail: TruckReading[];
  readonly latest: TruckReading | null;
}

/**
 * Collapses a gps_batch payload into an ordered trail and the most recent position.
 * Sorts by timestamp, applies orderGuard per entry, advances the cursor within the
 * batch only. The caller is responsible for supplying the correct per-truck
 * lastAcceptedTs (Q1 / FR-3).
 * Anomaly filtering (Q2, Q3) is deferred to P4.
 */
export class BatchProcessor {
  static collapse(readings: RawReading[], lastAcceptedTs: number): BatchResult {
    if (readings.length === 0) return { trail: [], latest: null };

    const sorted = [...readings].sort((a, b) => a.timestamp - b.timestamp);
    const accepted: TruckReading[] = [];
    let cursorTs = lastAcceptedTs;

    for (const raw of sorted) {
      const reading = normalize(raw);
      if (orderGuard(reading, cursorTs) === 'ACCEPT') {
        accepted.push(reading);
        cursorTs = reading.timestamp;
      }
    }

    if (accepted.length === 0) return { trail: [], latest: null };
    return { trail: accepted, latest: accepted[accepted.length - 1] };
  }
}
