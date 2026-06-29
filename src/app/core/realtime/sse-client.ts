import { Injectable, inject } from '@angular/core';
import { Observable, share } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { LogService } from '../logging/log.service';
import { decodeSseMessage } from '../../shared/models/sse.decoder';
import type { SseMessage, UnknownSseMessage } from '../../shared/models/sse.model';

const SCOPE = 'SseClient';

export type SseClientEvent =
  | { readonly kind: 'open' }
  | { readonly kind: 'error' }
  | { readonly kind: 'message'; readonly message: SseMessage | UnknownSseMessage };

/**
 * Wraps a native EventSource as a shared Observable of typed lifecycle + message events.
 * Domain stores are not touched here; TelemetryPipeline routes events to ConnectionStore.
 */
@Injectable({ providedIn: 'root' })
export class SseClient {
  private readonly config = inject(APP_CONFIG);
  private readonly log = inject(LogService);

  readonly events$: Observable<SseClientEvent> =
    new Observable<SseClientEvent>(subscriber => {
      const es = new EventSource(this.config.sseUrl);

      es.onopen = () => {
        subscriber.next({ kind: 'open' });
      };

      es.onmessage = (event: MessageEvent<string>) => {
        subscriber.next({ kind: 'message', message: decodeSseMessage(event.data) });
      };

      es.onerror = () => {
        this.log.warn(SCOPE, 'SSE connection error — EventSource will retry');
        subscriber.next({ kind: 'error' });
      };

      return () => {
        es.close();
      };
    }).pipe(share());
}
