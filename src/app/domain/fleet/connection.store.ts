import { Injectable, signal, computed } from '@angular/core';

export type SseConnectionState = 'connecting' | 'connected' | 'disconnected';

@Injectable({ providedIn: 'root' })
export class ConnectionStore {
  private readonly _sse = signal<SseConnectionState>('connecting');
  private readonly _lastHeartbeatAt = signal(0);

  readonly sse = this._sse.asReadonly();
  readonly lastHeartbeatAt = this._lastHeartbeatAt.asReadonly();

  /** True whenever SSE is not connected (connecting or disconnected). */
  readonly isDegraded = computed(() => this._sse() !== 'connected');

  markConnecting(): void {
    this._sse.set('connecting');
  }

  markConnected(): void {
    this._sse.set('connected');
  }

  markDisconnected(): void {
    this._sse.set('disconnected');
  }

  markHeartbeat(): void {
    this._lastHeartbeatAt.set(Date.now());
  }
}
