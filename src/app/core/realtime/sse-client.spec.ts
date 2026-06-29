import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SseClient } from './sse-client';
import type { SseClientEvent } from './sse-client';
import { APP_CONFIG } from '../config/app-config';
import { LogService } from '../logging/log.service';

const SSE_URL = 'http://localhost:3000/api/telemetry/stream';

/** Minimal EventSource mock — stores handlers so tests can trigger them. */
class MockEventSource {
  static readonly instances: MockEventSource[] = [];

  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  readonly close = vi.fn();

  constructor(public readonly url: string) {
    MockEventSource.instances.push(this);
  }

  static reset(): void {
    MockEventSource.instances.length = 0;
  }
}

describe('SseClient', () => {
  let client: SseClient;
  let logSpy: { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    MockEventSource.reset();
    vi.stubGlobal('EventSource', MockEventSource);

    logSpy = { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        SseClient,
        { provide: APP_CONFIG, useValue: { production: false, apiBaseUrl: 'http://localhost:3000/api', sseUrl: SSE_URL, wsUrl: 'ws://localhost:3000/ws' } },
        { provide: LogService, useValue: logSpy },
      ],
    });
    client = TestBed.inject(SseClient);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates EventSource with APP_CONFIG.sseUrl on first subscription', () => {
    const sub = client.events$.subscribe();
    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0].url).toBe(SSE_URL);
    sub.unsubscribe();
  });

  it('emits open event when EventSource onopen fires', () => {
    const events: SseClientEvent[] = [];
    const sub = client.events$.subscribe(e => events.push(e));
    MockEventSource.instances[0].onopen?.(new Event('open'));
    expect(events).toEqual([{ kind: 'open' }]);
    sub.unsubscribe();
  });

  it('decodes and emits message event on onmessage', () => {
    const events: SseClientEvent[] = [];
    const sub = client.events$.subscribe(e => events.push(e));
    const payload = JSON.stringify({ type: 'heartbeat', timestamp: 9000 });
    MockEventSource.instances[0].onmessage?.(new MessageEvent('message', { data: payload }));
    expect(events.length).toBe(1);
    expect(events[0]).toEqual({ kind: 'message', message: { type: 'heartbeat', timestamp: 9000 } });
    sub.unsubscribe();
  });

  it('emits error event and logs warning on onerror', () => {
    const events: SseClientEvent[] = [];
    const sub = client.events$.subscribe(e => events.push(e));
    MockEventSource.instances[0].onerror?.(new Event('error'));
    expect(events).toEqual([{ kind: 'error' }]);
    expect(logSpy.warn).toHaveBeenCalledWith('SseClient', expect.stringContaining('SSE connection error'));
    sub.unsubscribe();
  });

  it('closes EventSource when all subscribers unsubscribe', () => {
    const sub = client.events$.subscribe();
    const es = MockEventSource.instances[0];
    sub.unsubscribe();
    expect(es.close).toHaveBeenCalled();
  });

  it('shares one EventSource instance across multiple subscribers', () => {
    const sub1 = client.events$.subscribe();
    const sub2 = client.events$.subscribe();

    expect(MockEventSource.instances.length).toBe(1);

    const es = MockEventSource.instances[0];

    sub1.unsubscribe();
    expect(es.close).not.toHaveBeenCalled();

    sub2.unsubscribe();
    expect(es.close).toHaveBeenCalled();
  });
});
