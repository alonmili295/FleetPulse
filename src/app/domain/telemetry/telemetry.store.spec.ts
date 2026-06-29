import { TestBed } from '@angular/core/testing';
import { TelemetryStore } from './telemetry.store';
import type { TruckReading } from '../../shared/models/telemetry.model';

function makeReading(overrides: Partial<TruckReading> = {}): TruckReading {
  return {
    truckId: 'truck_1',
    location: { lat: 51.5, lng: -0.1 },
    speed: 60,
    heading: 90,
    fuel: 75,
    engineTemp: 85,
    status: 'active',
    timestamp: 1000,
    ...overrides,
  };
}

describe('TelemetryStore', () => {
  let store: TelemetryStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(TelemetryStore);
  });

  // ── applyReading ─────────────────────────────────────────────────────────────

  it('applyReading: sets latest for the truck', () => {
    const r = makeReading({ timestamp: 1001 });
    store.applyReading(r);
    expect(store.latestFor('truck_1')).toEqual(r);
  });

  it('applyReading: advances lastAcceptedTs', () => {
    store.applyReading(makeReading({ timestamp: 2000 }));
    expect(store.lastAcceptedTsFor('truck_1')).toBe(2000);
  });

  it('applyReading: appends to history in insertion order', () => {
    const r1 = makeReading({ timestamp: 1000 });
    const r2 = makeReading({ timestamp: 2000 });
    store.applyReading(r1);
    store.applyReading(r2);
    expect(store.historyFor('truck_1')).toEqual([r1, r2]);
  });

  it('historyFor: returns [] when truck has no telemetry yet', () => {
    expect(store.historyFor('truck_99')).toEqual([]);
  });

  it('history is bounded — oldest entries are evicted when capacity is reached', () => {
    for (let i = 1; i <= 105; i++) {
      store.applyReading(makeReading({ timestamp: i }));
    }
    const history = store.historyFor('truck_1');
    expect(history.length).toBe(100);
    expect(history[0].timestamp).toBe(6);   // first 5 evicted
    expect(history[99].timestamp).toBe(105);
  });

  // ── applyTrail ───────────────────────────────────────────────────────────────

  it('applyTrail: sets latest and advances lastAcceptedTs', () => {
    const r1 = makeReading({ timestamp: 1001 });
    const r2 = makeReading({ timestamp: 1002 });
    store.applyTrail('truck_1', [r1, r2], r2);
    expect(store.latestFor('truck_1')).toEqual(r2);
    expect(store.lastAcceptedTsFor('truck_1')).toBe(1002);
  });

  it('applyTrail: appends all trail readings to history oldest-first', () => {
    const trail = [makeReading({ timestamp: 1001 }), makeReading({ timestamp: 1002 })];
    store.applyTrail('truck_1', trail, trail[1]);
    expect(store.historyFor('truck_1')).toEqual(trail);
  });

  // ── per-truck isolation ───────────────────────────────────────────────────────

  it('lastAcceptedTsFor is per-truck — truck_2 timestamp does not affect truck_1', () => {
    store.applyReading(makeReading({ truckId: 'truck_1', timestamp: 1000 }));
    store.applyReading(makeReading({ truckId: 'truck_2', timestamp: 5000 }));

    expect(store.lastAcceptedTsFor('truck_1')).toBe(1000);
    expect(store.lastAcceptedTsFor('truck_2')).toBe(5000);
  });

  it('latestFor unknown truck returns null', () => {
    expect(store.latestFor('truck_99')).toBeNull();
  });

  it('lastAcceptedTsFor unknown truck returns 0', () => {
    expect(store.lastAcceptedTsFor('truck_99')).toBe(0);
  });
});
