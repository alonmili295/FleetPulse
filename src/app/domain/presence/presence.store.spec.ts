import { TestBed } from '@angular/core/testing';
import { PresenceStore } from './presence.store';
import type { WsState } from '../../shared/models/ws.model';

describe('PresenceStore', () => {
  let store: PresenceStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [PresenceStore] });
    store = TestBed.inject(PresenceStore);
  });

  it('initial state — all signals at default values', () => {
    expect(store.selfId()).toBeNull();
    expect(store.dispatchers()).toEqual([]);
    expect(store.activeCount()).toBe(0);
    expect(store.wsState()).toBe<WsState>('disconnected');
    expect(store.viewingByDispatcher()).toEqual([]);
  });

  it('setSelf updates selfId signal', () => {
    store.setSelf('dispatcher_web');
    expect(store.selfId()).toBe('dispatcher_web');
  });

  it('addDispatcher appends to dispatchers list', () => {
    store.addDispatcher({ id: 'd1', name: 'Alice', joinedAt: 1000 });
    expect(store.dispatchers()).toEqual([{ id: 'd1', name: 'Alice', joinedAt: 1000 }]);
  });

  it('addDispatcher is idempotent — duplicate ids are not added', () => {
    store.addDispatcher({ id: 'd1', name: 'Alice', joinedAt: 1000 });
    store.addDispatcher({ id: 'd1', name: 'Alice', joinedAt: 2000 });
    expect(store.dispatchers()).toHaveLength(1);
  });

  it('removeDispatcher removes the entry with the given id', () => {
    store.addDispatcher({ id: 'd1', name: 'Alice', joinedAt: 1000 });
    store.addDispatcher({ id: 'd2', name: 'Bob', joinedAt: 1001 });
    store.removeDispatcher('d1');
    expect(store.dispatchers()).toEqual([{ id: 'd2', name: 'Bob', joinedAt: 1001 }]);
  });

  it('removeDispatcher is a no-op when the id is not present', () => {
    store.addDispatcher({ id: 'd1', name: 'Alice', joinedAt: 1000 });
    store.removeDispatcher('d_unknown');
    expect(store.dispatchers()).toHaveLength(1);
  });

  it('setActiveCount updates the activeCount signal', () => {
    store.setActiveCount(3);
    expect(store.activeCount()).toBe(3);
  });

  it('setWsState updates the wsState signal', () => {
    store.setWsState('connected');
    expect(store.wsState()).toBe<WsState>('connected');
  });

  it('resetPresence clears selfId, dispatchers, activeCount, and viewingByDispatcher', () => {
    store.setSelf('dispatcher_web');
    store.addDispatcher({ id: 'd1', name: 'Alice', joinedAt: 1000 });
    store.setActiveCount(2);
    store.setDispatcherViewing({ dispatcherId: 'd1', truckId: 'truck_1', timestamp: 5000 });
    store.resetPresence();
    expect(store.selfId()).toBeNull();
    expect(store.dispatchers()).toEqual([]);
    expect(store.activeCount()).toBe(0);
    expect(store.viewingByDispatcher()).toEqual([]);
  });

  it('resetPresence does not affect wsState', () => {
    store.setWsState('connected');
    store.resetPresence();
    expect(store.wsState()).toBe<WsState>('connected');
  });

  // ── DispatcherViewing ─────────────────────────────────────────────────────

  it('setDispatcherViewing adds a new viewing entry', () => {
    store.setDispatcherViewing({ dispatcherId: 'd1', truckId: 'truck_1', timestamp: 5000 });
    expect(store.viewingByDispatcher()).toHaveLength(1);
    expect(store.viewingByDispatcher()[0]).toEqual({ dispatcherId: 'd1', truckId: 'truck_1', timestamp: 5000 });
  });

  it('setDispatcherViewing replaces the existing entry for the same dispatcher (upsert)', () => {
    store.setDispatcherViewing({ dispatcherId: 'd1', truckId: 'truck_1', timestamp: 5000 });
    store.setDispatcherViewing({ dispatcherId: 'd1', truckId: 'truck_2', timestamp: 6000 });
    expect(store.viewingByDispatcher()).toHaveLength(1);
    expect(store.viewingByDispatcher()[0].truckId).toBe('truck_2');
  });

  it('viewersForTruck returns name as label when dispatcher is known', () => {
    store.addDispatcher({ id: 'd1', name: 'Alice', joinedAt: 1000 });
    store.setDispatcherViewing({ dispatcherId: 'd1', truckId: 'truck_1', timestamp: 5000 });
    const viewers = store.viewersForTruck('truck_1');
    expect(viewers).toHaveLength(1);
    expect(viewers[0].label).toBe('Alice');
  });

  it('viewersForTruck falls back to dispatcherId as label when name is unknown', () => {
    store.setDispatcherViewing({ dispatcherId: 'd_unknown', truckId: 'truck_1', timestamp: 5000 });
    const viewers = store.viewersForTruck('truck_1');
    expect(viewers).toHaveLength(1);
    expect(viewers[0].label).toBe('d_unknown');
  });

  it('viewersForTruck returns only viewers for the requested truck', () => {
    store.setDispatcherViewing({ dispatcherId: 'd1', truckId: 'truck_1', timestamp: 5000 });
    store.setDispatcherViewing({ dispatcherId: 'd2', truckId: 'truck_2', timestamp: 5000 });
    const viewers = store.viewersForTruck('truck_1');
    expect(viewers).toHaveLength(1);
    expect(viewers[0].dispatcherId).toBe('d1');
  });

  it('pruneStaleViewers removes entries older than the TTL', () => {
    // now=5000, ttl=2000ms → threshold is 3000; entries with timestamp < 3000 are stale
    store.setDispatcherViewing({ dispatcherId: 'd1', truckId: 'truck_1', timestamp: 1000 }); // stale: 5000-1000=4000 > 2000
    store.setDispatcherViewing({ dispatcherId: 'd2', truckId: 'truck_1', timestamp: 4000 }); // fresh: 5000-4000=1000 <= 2000
    store.pruneStaleViewers(5000, 2000);
    expect(store.viewingByDispatcher()).toHaveLength(1);
    expect(store.viewingByDispatcher()[0].dispatcherId).toBe('d2');
  });

  it('pruneStaleViewers keeps fresh entries', () => {
    store.setDispatcherViewing({ dispatcherId: 'd1', truckId: 'truck_1', timestamp: 4000 });
    store.pruneStaleViewers(5000, 2000);
    expect(store.viewingByDispatcher()).toHaveLength(1);
  });

  it('removeDispatcher also removes that dispatcher viewing entry', () => {
    store.addDispatcher({ id: 'd1', name: 'Alice', joinedAt: 1000 });
    store.setDispatcherViewing({ dispatcherId: 'd1', truckId: 'truck_1', timestamp: 5000 });
    store.removeDispatcher('d1');
    expect(store.dispatchers()).toHaveLength(0);
    expect(store.viewingByDispatcher()).toHaveLength(0);
  });
});
