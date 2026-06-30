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

  it('resetPresence clears selfId, dispatchers, and activeCount', () => {
    store.setSelf('dispatcher_web');
    store.addDispatcher({ id: 'd1', name: 'Alice', joinedAt: 1000 });
    store.setActiveCount(2);
    store.resetPresence();
    expect(store.selfId()).toBeNull();
    expect(store.dispatchers()).toEqual([]);
    expect(store.activeCount()).toBe(0);
  });

  it('resetPresence does not affect wsState', () => {
    store.setWsState('connected');
    store.resetPresence();
    expect(store.wsState()).toBe<WsState>('connected');
  });
});
