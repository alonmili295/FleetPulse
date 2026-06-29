import { describe, it, expect } from 'vitest';
import { detectSpeedAnomaly } from './speed-anomaly-detector';
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

describe('detectSpeedAnomaly', () => {
  it('normal speed sets speedSensorError false and displaySpeed to speed', () => {
    const result = detectSpeedAnomaly(makeReading({ speed: 60 }), undefined);
    expect(result.speedSensorError).toBe(false);
    expect(result.displaySpeed).toBe(60);
  });

  it('speed 999 with no prior valid speed sets speedSensorError true and displaySpeed null', () => {
    const result = detectSpeedAnomaly(makeReading({ speed: 999 }), undefined);
    expect(result.speedSensorError).toBe(true);
    expect(result.displaySpeed).toBeNull();
  });

  it('speed 999 with prior displaySpeed 60 carries forward 60', () => {
    const result = detectSpeedAnomaly(makeReading({ speed: 999 }), 60);
    expect(result.speedSensorError).toBe(true);
    expect(result.displaySpeed).toBe(60);
  });

  it('speed 999 with prior displaySpeed null stays null', () => {
    const result = detectSpeedAnomaly(makeReading({ speed: 999 }), null);
    expect(result.speedSensorError).toBe(true);
    expect(result.displaySpeed).toBeNull();
  });

  it('speed recovers after error — speedSensorError false, displaySpeed is new speed', () => {
    const result = detectSpeedAnomaly(makeReading({ speed: 75 }), null);
    expect(result.speedSensorError).toBe(false);
    expect(result.displaySpeed).toBe(75);
  });

  it('preserves all other reading fields unchanged', () => {
    const reading = makeReading({ speed: 60, fuel: 50, timestamp: 9999 });
    const result = detectSpeedAnomaly(reading, undefined);
    expect(result.fuel).toBe(50);
    expect(result.timestamp).toBe(9999);
    expect(result.truckId).toBe('truck_1');
  });
});
