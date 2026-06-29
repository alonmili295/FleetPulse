import { Injectable, signal } from '@angular/core';
import type { TruckId } from '../../shared/models/truck.model';
import type { TruckReading } from '../../shared/models/telemetry.model';
import { RingBuffer } from '../../shared/utils/ring-buffer';

const HISTORY_CAPACITY = 100;

export interface TruckTelemetryState {
  readonly latest: TruckReading | null;
  readonly lastAcceptedTs: number;
  readonly history: RingBuffer<TruckReading>;
}

@Injectable({ providedIn: 'root' })
export class TelemetryStore {
  private readonly _trucks = signal<Map<TruckId, TruckTelemetryState>>(new Map());

  readonly trucks = this._trucks.asReadonly();

  lastAcceptedTsFor(truckId: TruckId): number {
    return this._trucks().get(truckId)?.lastAcceptedTs ?? 0;
  }

  latestFor(truckId: TruckId): TruckReading | null {
    return this._trucks().get(truckId)?.latest ?? null;
  }

  historyFor(truckId: TruckId): TruckReading[] {
    return this._trucks().get(truckId)?.history.toArray() ?? [];
  }

  /** Called by TelemetryPipeline after orderGuard has accepted the reading. */
  applyReading(reading: TruckReading): void {
    this._trucks.update(map => {
      const newMap = new Map(map);
      const existing = newMap.get(reading.truckId);
      const history = existing?.history ?? new RingBuffer<TruckReading>(HISTORY_CAPACITY);
      history.push(reading);
      newMap.set(reading.truckId, {
        latest: reading,
        lastAcceptedTs: reading.timestamp,
        history,
      });
      return newMap;
    });
  }

  /** Called by TelemetryPipeline after BatchProcessor has collapsed a gps_batch.
   *  Caller must not invoke this when latest is null (empty/all-stale batch). */
  applyTrail(truckId: TruckId, trail: TruckReading[], latest: TruckReading): void {
    this._trucks.update(map => {
      const newMap = new Map(map);
      const existing = newMap.get(truckId);
      const history = existing?.history ?? new RingBuffer<TruckReading>(HISTORY_CAPACITY);
      for (const r of trail) history.push(r);
      newMap.set(truckId, { latest, lastAcceptedTs: latest.timestamp, history });
      return newMap;
    });
  }
}
