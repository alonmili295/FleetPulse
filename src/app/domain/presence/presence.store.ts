import { Injectable, signal } from '@angular/core';
import type { WsState } from '../../shared/models/ws.model';

export interface DispatcherInfo {
  readonly id: string;
  readonly name: string;
  readonly joinedAt: number;
}

export interface DispatcherViewing {
  readonly dispatcherId: string;
  readonly truckId: string;
  readonly timestamp: number;
}

export interface DispatcherViewer {
  readonly dispatcherId: string;
  readonly label: string;  // name if known, otherwise dispatcherId
  readonly truckId: string;
  readonly timestamp: number;
}

/** Pure domain state for WebSocket dispatcher presence. No transport logic. */
@Injectable({ providedIn: 'root' })
export class PresenceStore {
  private readonly _selfId = signal<string | null>(null);
  private readonly _dispatchers = signal<readonly DispatcherInfo[]>([]);
  private readonly _activeCount = signal<number>(0);
  private readonly _wsState = signal<WsState>('disconnected');
  private readonly _viewingByDispatcher = signal<readonly DispatcherViewing[]>([]);

  readonly selfId = this._selfId.asReadonly();
  readonly dispatchers = this._dispatchers.asReadonly();
  readonly activeCount = this._activeCount.asReadonly();
  readonly wsState = this._wsState.asReadonly();
  readonly viewingByDispatcher = this._viewingByDispatcher.asReadonly();

  setSelf(id: string): void {
    this._selfId.set(id);
  }

  addDispatcher(info: DispatcherInfo): void {
    this._dispatchers.update(list => {
      if (list.some(d => d.id === info.id)) return list;
      return [...list, info];
    });
  }

  removeDispatcher(id: string): void {
    this._dispatchers.update(list => list.filter(d => d.id !== id));
    this._viewingByDispatcher.update(list => list.filter(v => v.dispatcherId !== id));
  }

  setActiveCount(count: number): void {
    this._activeCount.set(count);
  }

  setWsState(state: WsState): void {
    this._wsState.set(state);
  }

  setDispatcherViewing(entry: DispatcherViewing): void {
    this._viewingByDispatcher.update(list => {
      const without = list.filter(v => v.dispatcherId !== entry.dispatcherId);
      return [...without, entry];
    });
  }

  viewersForTruck(truckId: string): readonly DispatcherViewer[] {
    const dispatchers = this._dispatchers();
    return this._viewingByDispatcher()
      .filter(v => v.truckId === truckId)
      .map(v => {
        const info = dispatchers.find(d => d.id === v.dispatcherId);
        return {
          dispatcherId: v.dispatcherId,
          label: info?.name ?? v.dispatcherId,
          truckId: v.truckId,
          timestamp: v.timestamp,
        };
      });
  }

  pruneStaleViewers(now: number, ttlMs: number): void {
    this._viewingByDispatcher.update(list => list.filter(v => now - v.timestamp <= ttlMs));
  }

  resetPresence(): void {
    this._selfId.set(null);
    this._dispatchers.set([]);
    this._activeCount.set(0);
    this._viewingByDispatcher.set([]);
  }
}
