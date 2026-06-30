import { TestBed } from '@angular/core/testing';
import { AlertsStore } from './alerts.store';
import type { Alert } from '../../shared/models/alert.model';

const makeAlert = (id: string, truckId = 'truck_1'): Alert => ({
  id, truckId, message: `Alert ${id}`, severity: 'info',
  sentBy: 'dispatcher_web', timestamp: 1000, acknowledged: false,
});

describe('AlertsStore', () => {
  let store: AlertsStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [AlertsStore] });
    store = TestBed.inject(AlertsStore);
  });

  it('initial alerts list is empty', () => {
    expect(store.alerts()).toEqual([]);
  });

  it('addAlert prepends to front (newest-first)', () => {
    store.addAlert(makeAlert('a1'));
    store.addAlert(makeAlert('a2'));
    expect(store.alerts()[0].id).toBe('a2');
    expect(store.alerts()[1].id).toBe('a1');
  });

  it('addAlert is idempotent by alert.id', () => {
    const alert = makeAlert('a1');
    store.addAlert(alert);
    store.addAlert(alert);
    expect(store.alerts()).toHaveLength(1);
  });

  it('buffer is capped at 50 items', () => {
    for (let i = 0; i < 55; i++) store.addAlert(makeAlert(`a${i}`));
    expect(store.alerts()).toHaveLength(50);
  });

  it('alertsForTruck filters alerts by truckId', () => {
    store.addAlert(makeAlert('a1', 'truck_1'));
    store.addAlert(makeAlert('a2', 'truck_2'));
    store.addAlert(makeAlert('a3', 'truck_1'));
    const result = store.alertsForTruck('truck_1');
    expect(result).toHaveLength(2);
    expect(result.every(a => a.truckId === 'truck_1')).toBe(true);
  });
});
