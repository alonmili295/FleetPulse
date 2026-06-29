import { TestBed } from '@angular/core/testing';
import { FleetStore } from './fleet.store';
import type { TruckListItem } from '../../shared/models/truck.model';

function makeTruck(overrides: Partial<TruckListItem> = {}): TruckListItem {
  return {
    id: 'truck_1',
    name: 'Truck 1',
    status: 'active',
    location: { lat: 51.5, lng: -0.1 },
    speed: 60,
    heading: 90,
    fuel: 75,
    engineTemp: 85,
    currentRouteId: null,
    _version: 1,
    ...overrides,
  };
}

describe('FleetStore', () => {
  let store: FleetStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(FleetStore);
  });

  // ── setFleet ─────────────────────────────────────────────────────────────────

  it('setFleet: truckList reflects the loaded fleet', () => {
    store.setFleet([makeTruck({ id: 'truck_1' }), makeTruck({ id: 'truck_2' })]);
    expect(store.truckList().length).toBe(2);
  });

  it('setFleet: replaces the fleet on re-baseline — does not append', () => {
    store.setFleet([makeTruck({ id: 'truck_1' }), makeTruck({ id: 'truck_2' })]);
    store.setFleet([makeTruck({ id: 'truck_3' })]);
    expect(store.truckList().length).toBe(1);
    expect(store.truckList()[0].id).toBe('truck_3');
  });

  // ── truckById ────────────────────────────────────────────────────────────────

  it('truckById: returns the truck when present', () => {
    const t = makeTruck({ id: 'truck_1' });
    store.setFleet([t]);
    expect(store.truckById('truck_1')).toEqual(t);
  });

  it('truckById: returns null for an unknown id', () => {
    store.setFleet([makeTruck({ id: 'truck_1' })]);
    expect(store.truckById('truck_99')).toBeNull();
  });

  // ── upsertTruck ──────────────────────────────────────────────────────────────

  it('upsertTruck: inserts a new truck not in the fleet', () => {
    store.upsertTruck(makeTruck({ id: 'truck_5' }));
    expect(store.truckById('truck_5')).not.toBeNull();
    expect(store.truckList().length).toBe(1);
  });

  it('upsertTruck: replaces an existing truck', () => {
    store.setFleet([makeTruck({ id: 'truck_1', speed: 50 })]);
    store.upsertTruck(makeTruck({ id: 'truck_1', speed: 80 }));
    expect(store.truckById('truck_1')?.speed).toBe(80);
    expect(store.truckList().length).toBe(1);
  });

  // ── patchTruck ───────────────────────────────────────────────────────────────

  it('patchTruck: merges a partial update into an existing truck', () => {
    store.setFleet([makeTruck({ id: 'truck_1', speed: 50, fuel: 80 })]);
    store.patchTruck('truck_1', { speed: 90 });
    const truck = store.truckById('truck_1');
    expect(truck?.speed).toBe(90);
    expect(truck?.fuel).toBe(80); // unchanged
    expect(truck?.id).toBe('truck_1'); // id preserved
  });

  it('patchTruck: does nothing when truck is not in the fleet', () => {
    store.setFleet([makeTruck({ id: 'truck_1' })]);
    store.patchTruck('truck_99', { speed: 999 });
    expect(store.truckList().length).toBe(1);
    expect(store.truckById('truck_99')).toBeNull();
  });
});
