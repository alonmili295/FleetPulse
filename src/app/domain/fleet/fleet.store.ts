import { Injectable, signal, computed } from '@angular/core';
import type { TruckId, TruckListItem } from '../../shared/models/truck.model';

@Injectable({ providedIn: 'root' })
export class FleetStore {
  private readonly _fleet = signal<ReadonlyMap<TruckId, TruckListItem>>(new Map());

  /** Ordered list of all trucks in the current fleet snapshot. */
  readonly truckList = computed(() => [...this._fleet().values()]);

  truckById(id: TruckId): TruckListItem | null {
    return this._fleet().get(id) ?? null;
  }

  /** Full replacement — used for initial load and SSE re-baseline. */
  setFleet(trucks: TruckListItem[]): void {
    this._fleet.set(new Map(trucks.map(t => [t.id, t])));
  }

  /** Insert or fully replace a single truck entry. */
  upsertTruck(truck: TruckListItem): void {
    this._fleet.update(map => new Map(map).set(truck.id, truck));
  }

  /** Merge a partial update into an existing truck; no-op if truck is not present. */
  patchTruck(id: TruckId, patch: Partial<TruckListItem>): void {
    const existing = this._fleet().get(id);
    if (!existing) return;
    this._fleet.update(map => new Map(map).set(id, { ...existing, ...patch, id }));
  }
}
