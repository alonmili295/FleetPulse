import { Injectable, OnDestroy, signal } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { decodeWsMessage } from '../../shared/models/ws.decoder';
import type { WsClientMsg, WsMessage, WsState } from '../../shared/models/ws.model';

/**
 * Transport-only WebSocket wrapper.
 * No domain logic, no config injection — caller provides the URL via connect(url).
 * PresenceService owns all orchestration (registration, ping, message handling).
 */
@Injectable({ providedIn: 'root' })
export class WsClient implements OnDestroy {
  private readonly _state = signal<WsState>('disconnected');
  readonly state = this._state.asReadonly();

  private readonly _open = new Subject<void>();
  readonly open$: Observable<void> = this._open.asObservable();

  private readonly _messages = new Subject<WsMessage>();
  readonly messages$: Observable<WsMessage> = this._messages.asObservable();

  private ws: WebSocket | null = null;

  connect(url: string): void {
    if (this.ws) return;
    this._state.set('connecting');
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this._state.set('connected');
      this._open.next();
    };

    ws.onmessage = (event: MessageEvent) => {
      const decoded = decodeWsMessage(event.data as string);
      if (decoded.type !== 'unknown') {
        this._messages.next(decoded);
      }
    };

    ws.onclose = () => {
      if (this.ws === ws) {
        this._state.set('disconnected');
        this.ws = null;
      }
    };

    ws.onerror = () => {
      if (this.ws === ws) {
        this._state.set('disconnected');
        this.ws = null;
      }
    };
  }

  send(msg: WsClientMsg): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    if (!this.ws) return;
    const ws = this.ws;
    this.ws = null;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.close();
    this._state.set('disconnected');
  }

  ngOnDestroy(): void {
    this.close();
  }
}
