import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ConnectionStore } from './connection.store';

describe('ConnectionStore', () => {
  let store: ConnectionStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(ConnectionStore);
  });

  it('initial state is connecting', () => {
    expect(store.sse()).toBe('connecting');
  });

  it('isDegraded is true initially', () => {
    expect(store.isDegraded()).toBe(true);
  });

  it('markConnected: sets state to connected and clears isDegraded', () => {
    store.markConnected();
    expect(store.sse()).toBe('connected');
    expect(store.isDegraded()).toBe(false);
  });

  it('markDisconnected: sets state to disconnected and isDegraded is true', () => {
    store.markConnected();
    store.markDisconnected();
    expect(store.sse()).toBe('disconnected');
    expect(store.isDegraded()).toBe(true);
  });

  it('markConnecting: resets state to connecting and isDegraded is true', () => {
    store.markConnected();
    store.markConnecting();
    expect(store.sse()).toBe('connecting');
    expect(store.isDegraded()).toBe(true);
  });

  it('markHeartbeat: updates lastHeartbeatAt to approximately now', () => {
    const before = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(before + 100);
    store.markHeartbeat();
    expect(store.lastHeartbeatAt()).toBe(before + 100);
    vi.restoreAllMocks();
  });

  it('lastHeartbeatAt is 0 before any heartbeat', () => {
    expect(store.lastHeartbeatAt()).toBe(0);
  });
});
