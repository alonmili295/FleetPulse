import { TestBed } from '@angular/core/testing';
import { SelectedVehicleStore } from './selected-vehicle.store';

describe('SelectedVehicleStore', () => {
  let store: SelectedVehicleStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [SelectedVehicleStore] });
    store = TestBed.inject(SelectedVehicleStore);
  });

  it('initial selectedTruckId is null', () => {
    expect(store.selectedTruckId()).toBeNull();
  });

  it('selectTruck sets the signal to the given id', () => {
    store.selectTruck('truck_1');
    expect(store.selectedTruckId()).toBe('truck_1');
  });

  it('selectTruck with the same id leaves signal at the same value', () => {
    store.selectTruck('truck_1');
    store.selectTruck('truck_1');
    expect(store.selectedTruckId()).toBe('truck_1');
  });

  it('clearSelection resets selectedTruckId to null', () => {
    store.selectTruck('truck_1');
    store.clearSelection();
    expect(store.selectedTruckId()).toBeNull();
  });
});
