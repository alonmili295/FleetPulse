import { BatchProcessor } from './batch-processor';
import type { RawReading } from '../../shared/models/telemetry.model';

function makeRawReading(overrides: Partial<RawReading> = {}): RawReading {
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

describe('BatchProcessor.collapse', () => {
  // TC-BATCH-1
  it('TC-BATCH-1: collapses 20 readings into a full trail; latest is the newest', () => {
    const readings = Array.from({ length: 20 }, (_, i) =>
      makeRawReading({ timestamp: 1000 + i }),
    );
    const { trail, latest } = BatchProcessor.collapse(readings, 0);
    expect(trail).toHaveLength(20);
    expect(latest?.timestamp).toBe(1019);
  });

  // TC-BATCH-2
  it('TC-BATCH-2: filters readings below lastAcceptedTs from trail and latest', () => {
    const readings = [
      makeRawReading({ timestamp: 900 }),  // stale
      makeRawReading({ timestamp: 1001 }), // accepted
      makeRawReading({ timestamp: 1002 }), // accepted
    ];
    const { trail, latest } = BatchProcessor.collapse(readings, 1000);
    expect(trail).toHaveLength(2);
    expect(trail[0].timestamp).toBe(1001);
    expect(latest?.timestamp).toBe(1002);
  });

  // TC-BATCH-3
  it('TC-BATCH-3: accepts reading with speed 999 — anomaly detection deferred to P4', () => {
    const readings = [makeRawReading({ timestamp: 1001, speed: 999 })];
    const { trail, latest } = BatchProcessor.collapse(readings, 1000);
    expect(trail).toHaveLength(1);
    expect(latest?.speed).toBe(999);
  });

  it('returns empty trail and null latest when all readings are stale', () => {
    const readings = [makeRawReading({ timestamp: 500 })];
    const { trail, latest } = BatchProcessor.collapse(readings, 1000);
    expect(trail).toHaveLength(0);
    expect(latest).toBeNull();
  });

  it('returns empty trail and null latest for empty input', () => {
    const { trail, latest } = BatchProcessor.collapse([], 0);
    expect(trail).toHaveLength(0);
    expect(latest).toBeNull();
  });

  it('sorts an unsorted batch by timestamp before filtering', () => {
    const readings = [
      makeRawReading({ timestamp: 1003 }),
      makeRawReading({ timestamp: 1001 }),
      makeRawReading({ timestamp: 1002 }),
    ];
    const { trail } = BatchProcessor.collapse(readings, 1000);
    expect(trail.map(r => r.timestamp)).toEqual([1001, 1002, 1003]);
  });

  it('advances the cursor within the batch — a later reading is not dropped by an earlier one', () => {
    const readings = [
      makeRawReading({ timestamp: 1001 }),
      makeRawReading({ timestamp: 1002 }),
      makeRawReading({ timestamp: 1003 }),
    ];
    const { trail } = BatchProcessor.collapse(readings, 1000);
    expect(trail).toHaveLength(3);
  });
});
