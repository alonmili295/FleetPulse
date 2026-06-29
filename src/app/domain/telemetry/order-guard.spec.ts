import { orderGuard } from './order-guard';
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

describe('orderGuard', () => {
  // TC-ORDER-1
  it('TC-ORDER-1: accepts reading with timestamp strictly newer than lastAcceptedTs', () => {
    expect(orderGuard(makeReading({ timestamp: 1001 }), 1000)).toBe('ACCEPT');
  });

  // TC-ORDER-2
  it('TC-ORDER-2: drops reading with timestamp older than lastAcceptedTs', () => {
    expect(orderGuard(makeReading({ timestamp: 999 }), 1000)).toBe('DROP_STALE');
  });

  it('drops reading with timestamp equal to lastAcceptedTs (duplicate)', () => {
    expect(orderGuard(makeReading({ timestamp: 1000 }), 1000)).toBe('DROP_STALE');
  });

  // TC-ORDER-3
  it('TC-ORDER-3: accepts _reordered reading when its timestamp is still newer', () => {
    expect(orderGuard(makeReading({ timestamp: 1001, _reordered: true }), 1000)).toBe('ACCEPT');
  });

  it('drops _reordered reading whose timestamp is stale', () => {
    expect(orderGuard(makeReading({ timestamp: 500, _reordered: true }), 1000)).toBe('DROP_STALE');
  });

  it('accepts first reading when lastAcceptedTs is 0', () => {
    expect(orderGuard(makeReading({ timestamp: 1 }), 0)).toBe('ACCEPT');
  });
});
