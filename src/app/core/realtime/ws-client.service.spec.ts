import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { WsClient } from './ws-client.service';

const WS_URL = 'ws://localhost:3000/ws';

/** Minimal WebSocket mock — instances tracked statically so tests can trigger handlers. */
class MockWebSocket {
  static readonly OPEN = 1;
  static readonly instances: MockWebSocket[] = [];

  readonly url: string;
  readonly send  = vi.fn();
  readonly close = vi.fn();
  readyState = 0;

  onopen:    (() => void) | null                          = null;
  onmessage: ((e: { data: string }) => void) | null      = null;
  onclose:   (() => void) | null                          = null;
  onerror:   (() => void) | null                          = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  static reset(): void {
    MockWebSocket.instances.length = 0;
  }
}

describe('WsClient', () => {
  let client: WsClient;

  beforeEach(() => {
    MockWebSocket.reset();
    vi.clearAllMocks();
    vi.stubGlobal('WebSocket', MockWebSocket);

    TestBed.configureTestingModule({ providers: [WsClient] });
    client = TestBed.inject(WsClient);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('initial state is disconnected', () => {
    expect(client.state()).toBe('disconnected');
  });

  it('connect(url) creates a WebSocket with the given URL', () => {
    client.connect(WS_URL);
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe(WS_URL);
  });

  it('state becomes connecting immediately after connect()', () => {
    client.connect(WS_URL);
    expect(client.state()).toBe('connecting');
  });

  it('state becomes connected when socket fires onopen', () => {
    client.connect(WS_URL);
    MockWebSocket.instances[0].onopen?.();
    expect(client.state()).toBe('connected');
  });

  it('open$ emits once when socket opens', () => {
    const spy = vi.fn();
    client.open$.subscribe(spy);
    client.connect(WS_URL);
    MockWebSocket.instances[0].onopen?.();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('messages$ emits a decoded known server message', () => {
    const spy = vi.fn();
    client.messages$.subscribe(spy);
    client.connect(WS_URL);
    MockWebSocket.instances[0].onmessage?.({
      data: JSON.stringify({ type: 'registered', dispatcherId: 'dispatcher_web' }),
    });
    expect(spy).toHaveBeenCalledWith({ type: 'registered', dispatcherId: 'dispatcher_web' });
  });

  it('messages$ does not emit unknown or malformed frames', () => {
    const spy = vi.fn();
    client.messages$.subscribe(spy);
    client.connect(WS_URL);
    MockWebSocket.instances[0].onmessage?.({ data: 'not-json' });
    MockWebSocket.instances[0].onmessage?.({ data: JSON.stringify({ type: 'totally_unknown' }) });
    expect(spy).not.toHaveBeenCalled();
  });

  it('send() JSON-stringifies and transmits when socket is OPEN', () => {
    client.connect(WS_URL);
    MockWebSocket.instances[0].readyState = MockWebSocket.OPEN;
    client.send({ type: 'ping' });
    expect(MockWebSocket.instances[0].send).toHaveBeenCalledWith('{"type":"ping"}');
  });

  it('send() is a no-op when socket readyState is not OPEN', () => {
    client.connect(WS_URL);
    // readyState is 0 (CONNECTING) — not open yet
    client.send({ type: 'ping' });
    expect(MockWebSocket.instances[0].send).not.toHaveBeenCalled();
  });

  it('close() closes the underlying socket and sets state to disconnected', () => {
    client.connect(WS_URL);
    MockWebSocket.instances[0].onopen?.();
    client.close();
    expect(client.state()).toBe('disconnected');
    expect(MockWebSocket.instances[0].close).toHaveBeenCalled();
  });

  it('close() nulls all socket handlers to prevent stale callbacks', () => {
    client.connect(WS_URL);
    client.close();
    expect(MockWebSocket.instances[0].onopen).toBeNull();
    expect(MockWebSocket.instances[0].onmessage).toBeNull();
    expect(MockWebSocket.instances[0].onclose).toBeNull();
    expect(MockWebSocket.instances[0].onerror).toBeNull();
  });

  it('onerror sets state to disconnected and clears socket so reconnect works', () => {
    client.connect(WS_URL);
    MockWebSocket.instances[0].onerror?.();
    expect(client.state()).toBe('disconnected');
    // Guard cleared — a second connect() must open a new socket, not be silently dropped
    client.connect(WS_URL);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('onclose sets state to disconnected and clears socket so reconnect works', () => {
    client.connect(WS_URL);
    MockWebSocket.instances[0].onopen?.();
    MockWebSocket.instances[0].onclose?.();
    expect(client.state()).toBe('disconnected');
    client.connect(WS_URL);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('connect() is a no-op when a socket is already active', () => {
    client.connect(WS_URL);
    client.connect(WS_URL);
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
