import { TestBed } from '@angular/core/testing';
import { TelemetryHealthStore } from './telemetry-health.store';

describe('TelemetryHealthStore', () => {
  let store: TelemetryHealthStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(TelemetryHealthStore);
    store.reset();
  });

  it('starts at 0', () => {
    expect(store.droppedCount()).toBe(0);
  });

  it('incrementDropped() increments by 1', () => {
    store.incrementDropped();
    expect(store.droppedCount()).toBe(1);
  });

  it('multiple incrementDropped() calls accumulate', () => {
    store.incrementDropped();
    store.incrementDropped();
    store.incrementDropped();
    expect(store.droppedCount()).toBe(3);
  });

  it('incrementDropped(n) increments by n in one call', () => {
    store.incrementDropped(5);
    expect(store.droppedCount()).toBe(5);
  });

  it('reset() returns count to 0', () => {
    store.incrementDropped();
    store.incrementDropped();
    store.reset();
    expect(store.droppedCount()).toBe(0);
  });
});
