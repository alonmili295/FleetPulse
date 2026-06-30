import { TestBed } from '@angular/core/testing';
import { signal, type WritableSignal } from '@angular/core';
import { vi } from 'vitest';
import { Subject } from 'rxjs';
import { PresenceService } from './presence.service';
import { APP_CONFIG } from '../../core/config/app-config';
import { WsClient } from '../../core/realtime/ws-client.service';
import { PresenceStore, type DispatcherInfo } from './presence.store';
import { RoutesStore } from '../routes/routes.store';
import { FleetStore } from '../fleet/fleet.store';
import type { WsMessage, WsState } from '../../shared/models/ws.model';
import type { Route } from '../../shared/models/route.model';

const WS_URL = 'ws://test:3000/ws';

const mockRoute: Route = {
  id: 'route_1', truckId: 'truck_1', destination: 'Tel Aviv',
  priority: 'normal', notes: '', status: 'assigned',
  assignedBy: 'dispatcher_web', assignedAt: 1000, _version: 1,
};

describe('PresenceService', () => {
  let service: PresenceService;
  let wsStateMock: WritableSignal<WsState>;
  let openSubject: Subject<void>;
  let messagesSubject: Subject<WsMessage>;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let mockWsClient: any;
  let mockPresenceStore: any;
  let mockRoutesStore: any;
  let mockFleetStore: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  beforeEach(async () => {
    vi.clearAllMocks();

    wsStateMock    = signal<WsState>('disconnected');
    openSubject    = new Subject<void>();
    messagesSubject = new Subject<WsMessage>();

    mockWsClient = {
      state:     wsStateMock.asReadonly(),
      open$:     openSubject.asObservable(),
      messages$: messagesSubject.asObservable(),
      connect:   vi.fn(),
      send:      vi.fn(),
      close:     vi.fn(),
    };

    mockPresenceStore = {
      selfId:      signal<string | null>(null),
      dispatchers: signal<readonly DispatcherInfo[]>([]),
      activeCount: signal(0),
      wsState:     signal<WsState>('disconnected'),
      setSelf:        vi.fn(),
      addDispatcher:  vi.fn(),
      removeDispatcher: vi.fn(),
      setActiveCount: vi.fn(),
      setWsState:     vi.fn(),
      resetPresence:  vi.fn(),
    };

    mockRoutesStore = { upsertRoute: vi.fn() };
    mockFleetStore  = { patchTruck:  vi.fn() };

    await TestBed.configureTestingModule({
      providers: [
        PresenceService,
        {
          provide: APP_CONFIG,
          useValue: { wsUrl: WS_URL, apiBaseUrl: '/api', sseUrl: '/api/telemetry', production: false },
        },
        { provide: WsClient,       useValue: mockWsClient },
        { provide: PresenceStore,  useValue: mockPresenceStore },
        { provide: RoutesStore,    useValue: mockRoutesStore },
        { provide: FleetStore,     useValue: mockFleetStore },
      ],
    }).compileComponents();

    service = TestBed.inject(PresenceService);
    TestBed.flushEffects(); // flush initial effect: state='disconnected' → setWsState
    vi.clearAllMocks();     // clean slate — remove noise from the initial effect call
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Connection ────────────────────────────────────────────────────────────

  it('connect() calls wsClient.connect with the configured wsUrl', () => {
    service.connect();
    expect(mockWsClient.connect).toHaveBeenCalledWith(WS_URL);
  });

  it('connect() called twice does not create duplicate subscriptions or ping intervals', () => {
    vi.useFakeTimers();
    service.connect();
    service.connect(); // guarded — no-op

    messagesSubject.next({ type: 'registered', dispatcherId: 'dispatcher_web' });

    // One subscription → setSelf called once
    expect(mockPresenceStore.setSelf).toHaveBeenCalledTimes(1);

    // One ping interval → exactly one ping per 30 s window
    vi.advanceTimersByTime(30_001);
    const pings = (mockWsClient.send.mock.calls as Array<[{ type: string }]>)
      .filter(c => c[0].type === 'ping');
    expect(pings).toHaveLength(1);
  });

  it('on socket open, sends register_dispatcher with correct identifiers', () => {
    service.connect();
    openSubject.next();
    expect(mockWsClient.send).toHaveBeenCalledWith({
      type: 'register_dispatcher',
      dispatcherId: 'dispatcher_web',
      name: 'Web Dispatcher',
    });
  });

  // ── State mirroring ───────────────────────────────────────────────────────

  it('WsClient state changes are mirrored to presenceStore.setWsState', () => {
    wsStateMock.set('connected');
    TestBed.flushEffects();
    expect(mockPresenceStore.setWsState).toHaveBeenLastCalledWith('connected');
  });

  // ── Ping ──────────────────────────────────────────────────────────────────

  it('registered message sets selfId and starts the ping interval', () => {
    vi.useFakeTimers();
    service.connect();
    messagesSubject.next({ type: 'registered', dispatcherId: 'dispatcher_web' });
    expect(mockPresenceStore.setSelf).toHaveBeenCalledWith('dispatcher_web');
    vi.advanceTimersByTime(30_001);
    expect(mockWsClient.send).toHaveBeenCalledWith({ type: 'ping' });
  });

  // ── Disconnect cleanup ────────────────────────────────────────────────────

  it('when socket disconnects naturally, ping is cleared and subscriptions are cleaned up', () => {
    vi.useFakeTimers();
    service.connect();
    messagesSubject.next({ type: 'registered', dispatcherId: 'dispatcher_web' });

    // Drive the signal through a transition so the 'disconnected' change actually fires the effect.
    // (Signal must change value — setting 'disconnected'→'disconnected' would be a no-op.)
    wsStateMock.set('connecting');
    TestBed.flushEffects();
    wsStateMock.set('disconnected');
    TestBed.flushEffects(); // fires: started=false, clearPing, cleanupConnectionSubscriptions

    vi.clearAllMocks();

    // Ping must have stopped
    vi.advanceTimersByTime(30_001);
    expect(mockWsClient.send).not.toHaveBeenCalled();

    // started was reset — reconnect works
    service.connect();
    expect(mockWsClient.connect).toHaveBeenCalledTimes(1);

    // Old subscription was torn down — message handled once, not doubled
    vi.clearAllMocks();
    messagesSubject.next({ type: 'registered', dispatcherId: 'dispatcher_web' });
    expect(mockPresenceStore.setSelf).toHaveBeenCalledTimes(1);
  });

  it('close() closes wsClient, clears ping, and unsubscribes', () => {
    vi.useFakeTimers();
    service.connect();
    messagesSubject.next({ type: 'registered', dispatcherId: 'dispatcher_web' });
    service.close();
    expect(mockWsClient.close).toHaveBeenCalled();
    vi.clearAllMocks();
    vi.advanceTimersByTime(30_001);
    expect(mockWsClient.send).not.toHaveBeenCalled(); // ping stopped
  });

  // ── Presence messages ─────────────────────────────────────────────────────

  it('dispatcher_joined adds dispatcher and sets active count', () => {
    service.connect();
    messagesSubject.next({
      type: 'dispatcher_joined',
      dispatcherId: 'd2',
      name: 'Alice',
      activeDispatchers: 2,
      timestamp: 5000,
    });
    expect(mockPresenceStore.addDispatcher).toHaveBeenCalledWith({ id: 'd2', name: 'Alice', joinedAt: 5000 });
    expect(mockPresenceStore.setActiveCount).toHaveBeenCalledWith(2);
  });

  it('dispatcher_left removes dispatcher and sets active count', () => {
    service.connect();
    messagesSubject.next({
      type: 'dispatcher_left',
      dispatcherId: 'd2',
      activeDispatchers: 1,
      timestamp: 6000,
    });
    expect(mockPresenceStore.removeDispatcher).toHaveBeenCalledWith('d2');
    expect(mockPresenceStore.setActiveCount).toHaveBeenCalledWith(1);
  });

  // ── Route broadcast messages ──────────────────────────────────────────────

  it('route_assigned upserts route and patches FleetStore with currentRouteId and _version', () => {
    service.connect();
    messagesSubject.next({
      type: 'route_assigned',
      route: mockRoute,
      truckId: 'truck_1',
      assignedBy: 'dispatcher_web',
      truckVersion: 3,
      timestamp: 7000,
    });
    expect(mockRoutesStore.upsertRoute).toHaveBeenCalledWith(mockRoute);
    expect(mockFleetStore.patchTruck).toHaveBeenCalledWith('truck_1', {
      currentRouteId: 'route_1',
      _version: 3,
    });
  });

  it('route_updated upserts route and does not patch FleetStore', () => {
    service.connect();
    messagesSubject.next({
      type: 'route_updated',
      route: mockRoute,
      updatedBy: 'dispatcher_web',
      timestamp: 8000,
    });
    expect(mockRoutesStore.upsertRoute).toHaveBeenCalledWith(mockRoute);
    expect(mockFleetStore.patchTruck).not.toHaveBeenCalled();
  });

  it('route_reassigned upserts route and patches old/new truck currentRouteId without _version', () => {
    service.connect();
    const reassignedRoute: Route = { ...mockRoute, truckId: 'truck_2' };
    messagesSubject.next({
      type: 'route_reassigned',
      route: reassignedRoute,
      oldTruckId: 'truck_1',
      newTruckId: 'truck_2',
      reassignedBy: 'dispatcher_web',
      timestamp: 9000,
    });
    expect(mockRoutesStore.upsertRoute).toHaveBeenCalledWith(reassignedRoute);
    expect(mockFleetStore.patchTruck).toHaveBeenCalledWith('truck_1', { currentRouteId: null });
    expect(mockFleetStore.patchTruck).toHaveBeenCalledWith('truck_2', { currentRouteId: reassignedRoute.id });
    expect(mockFleetStore.patchTruck).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ _version: expect.anything() }),
    );
  });

  // ── Ignored messages ──────────────────────────────────────────────────────

  it('fleet_reset does not reset presence state', () => {
    service.connect();
    messagesSubject.next({ type: 'fleet_reset', timestamp: Date.now() });
    expect(mockPresenceStore.resetPresence).not.toHaveBeenCalled();
  });

  it('dispatcher_viewing is silently ignored', () => {
    service.connect();
    messagesSubject.next({
      type: 'dispatcher_viewing',
      dispatcherId: 'dispatcher_web',
      truckId: 'truck_1',
      timestamp: Date.now(),
    });
    expect(mockPresenceStore.addDispatcher).not.toHaveBeenCalled();
    expect(mockPresenceStore.removeDispatcher).not.toHaveBeenCalled();
    expect(mockRoutesStore.upsertRoute).not.toHaveBeenCalled();
    expect(mockFleetStore.patchTruck).not.toHaveBeenCalled();
  });
});
