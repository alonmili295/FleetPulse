import { describe, it, expect } from 'vitest';
import { detectFuelGlitch } from './fuel-glitch-detector';
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

describe('detectFuelGlitch', () => {
  it('normal fuel sets fuelGlitch false and displayFuel to fuel', () => {
    const result = detectFuelGlitch(makeReading({ fuel: 75 }), undefined);
    expect(result.fuelGlitch).toBe(false);
    expect(result.displayFuel).toBe(75);
  });

  it('fuel 0 with no prior valid fuel sets fuelGlitch true and displayFuel undefined', () => {
    const result = detectFuelGlitch(makeReading({ fuel: 0 }), undefined);
    expect(result.fuelGlitch).toBe(true);
    expect(result.displayFuel).toBeUndefined();
  });

  it('fuel 0 with prior displayFuel 75 carries forward 75', () => {
    const result = detectFuelGlitch(makeReading({ fuel: 0 }), 75);
    expect(result.fuelGlitch).toBe(true);
    expect(result.displayFuel).toBe(75);
  });

  it('fuel recovers after glitch — fuelGlitch false, displayFuel is new fuel', () => {
    const result = detectFuelGlitch(makeReading({ fuel: 50 }), 75);
    expect(result.fuelGlitch).toBe(false);
    expect(result.displayFuel).toBe(50);
  });

  it('preserves all other reading fields unchanged', () => {
    const reading = makeReading({ fuel: 75, speed: 80, timestamp: 9999 });
    const result = detectFuelGlitch(reading, undefined);
    expect(result.speed).toBe(80);
    expect(result.timestamp).toBe(9999);
    expect(result.truckId).toBe('truck_1');
  });
});
