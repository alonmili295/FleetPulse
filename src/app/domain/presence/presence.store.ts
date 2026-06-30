import { Injectable, signal } from '@angular/core';
import type { WsState } from '../../shared/models/ws.model';

export interface DispatcherInfo {
  readonly id: string;
  readonly name: string;
  readonly joinedAt: number;
}

/** Pure domain state for WebSocket dispatcher presence. No transport logic. */
@Injectable({ providedIn: 'root' })
export class PresenceStore {
  private readonly _selfId = signal<string | null>(null);
  private readonly _dispatchers = signal<readonly DispatcherInfo[]>([]);
  private readonly _activeCount = signal<number>(0);
  private readonly _wsState = signal<WsState>('disconnected');

  readonly selfId = this._selfId.asReadonly();
  readonly dispatchers = this._dispatchers.asReadonly();
  readonly activeCount = this._activeCount.asReadonly();
  readonly wsState = this._wsState.asReadonly();

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
  }

  setActiveCount(count: number): void {
    this._activeCount.set(count);
  }

  setWsState(state: WsState): void {
    this._wsState.set(state);
  }

  resetPresence(): void {
    this._selfId.set(null);
    this._dispatchers.set([]);
    this._activeCount.set(0);
  }
}
