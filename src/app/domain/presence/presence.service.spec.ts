import { TestBed } from '@angular/core/testing';
import { signal, type WritableSignal } from '@angular/core';
import { vi } from 'vitest';
import { Subject } from 'rxjs';
import { PresenceService } from './presence.service';
import { APP_CONFIG } from '../../core/config/app-config';
import { WsClient } from '../../core/realtime/ws-client.service';
import { PresenceStore, type DispatcherInfo, type DispatcherViewing } from './presence.store';
import { RoutesStore } from '../routes/routes.store';
import { FleetStore } from '../fleet/fleet.store';
import { SelectedVehicleStore } from '../vehicle-selection/selected-vehicle.store';
import { AlertsStore } from '../alerts/alerts.store';
import type { WsMessage, WsState } from '../../shared/models/ws.model';
import type { Route } from '../../shared/models/route.model';
import type { Alert } from '../../shared/models/alert.model';

const WS_URL = 'ws://test:3000/ws';

const mockRoute: Route = {
  id: 'route_1', truckId: 'truck_1', destination: 'Tel Aviv',
  priority: 'normal', notes: '', status: 'assigned',
  assignedBy: 'dispatcher_web', assignedAt: 1000, _version: 1,
};

const mockAlert: Alert = {
  id: 'alert_1', truckId: 'truck_1', message: 'Check engine', severity: 'warning',
  sentBy: 'dispatcher_web', timestamp: 2000, acknowledged: false,
};

describe('PresenceService', () => {
  let service: PresenceService;
  let wsStateMock: WritableSignal<WsState>;
  let selfIdSignal: WritableSignal<string | null>;
  let selectedTruckIdMock: WritableSignal<string | null>;
  let openSubject: Subject<void>;
  let messagesSubject: Subject<WsMessage>;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let mockWsClient: any;
  let mockPresenceStore: any;
  let mockRoutesStore: any;
  let mockFleetStore: any;
  let mockSelectedVehicleStore: any;
  let mockAlertsStore: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  beforeEach(async () => {
    vi.clearAllMocks();

    wsStateMock         = signal<WsState>('disconnected');
    selfIdSignal        = signal<string | null>(null);
    selectedTruckIdMock = signal<string | null>(null);
    openSubject         = new Subject<void>();
    messagesSubject     = new Subject<WsMessage>();

    mockWsClient = {
      state:     wsStateMock.asReadonly(),
      open$:     openSubject.asObservable(),
      messages$: messagesSubject.asObservable(),
      connect:   vi.fn(),
      send:      vi.fn(),
      close:     vi.fn(),
    };

    mockPresenceStore = {
      selfId:               selfIdSignal.asReadonly(),
      dispatchers:          signal<readonly DispatcherInfo[]>([]),
      activeCount:          signal(0),
      wsState:              signal<WsState>('disconnected'),
      viewingByDispatcher:  signal<readonly DispatcherViewing[]>([]),
      setSelf:              vi.fn((id: string) => selfIdSignal.set(id)),
      addDispatcher:        vi.fn(),
      removeDispatcher:     vi.fn(),
      setActiveCount:       vi.fn(),
      setWsState:           vi.fn(),
      setDispatcherViewing: vi.fn(),
      viewersForTruck:      vi.fn().mockReturnValue([]),
      pruneStaleViewers:    vi.fn(),
      resetPresence:        vi.fn(() => selfIdSignal.set(null)),
    };

    mockRoutesStore          = { upsertRoute: vi.fn() };
    mockFleetStore           = { patchTruck: vi.fn() };
    mockSelectedVehicleStore = { selectedTruckId: selectedTruckIdMock.asReadonly(), selectTruck: vi.fn(), clearSelection: vi.fn() };
    mockAlertsStore          = { addAlert: vi.fn() };

    await TestBed.configureTestingModule({
      providers: [
        PresenceService,
        {
          provide: APP_CONFIG,
          useValue: { wsUrl: WS_URL, apiBaseUrl: '/api', sseUrl: '/api/telemetry', production: false },
        },
        { provide: WsClient,             useValue: mockWsClient },
        { provide: PresenceStore,        useValue: mockPresenceStore },
        { provide: RoutesStore,          useValue: mockRoutesStore },
        { provide: FleetStore,           useValue: mockFleetStore },
        { provide: SelectedVehicleStore, useValue: mockSelectedVehicleStore },
        { provide: AlertsStore,          useValue: mockAlertsStore },
      ],
    }).compileComponents();

    service = TestBed.inject(PresenceService);
    TestBed.flushEffects(); // flush initial effects (state='disconnected' → resetPresence, viewing no-op)
    vi.clearAllMocks();
    selfIdSignal.set(null); // ensure selfId starts clean after initial resetPresence call
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
    service.connect();

    messagesSubject.next({ type: 'registered', dispatcherId: 'dispatcher_web' });
    expect(mockPresenceStore.setSelf).toHaveBeenCalledTimes(1);

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

  // ── Ping and pruning ──────────────────────────────────────────────────────

  it('registered sets selfId and starts the ping interval', () => {
    vi.useFakeTimers();
    service.connect();
    messagesSubject.next({ type: 'registered', dispatcherId: 'dispatcher_web' });
    expect(mockPresenceStore.setSelf).toHaveBeenCalledWith('dispatcher_web');
    vi.advanceTimersByTime(30_001);
    expect(mockWsClient.send).toHaveBeenCalledWith({ type: 'ping' });
  });

  it('registered starts stale-viewer pruning interval', () => {
    vi.useFakeTimers();
    service.connect();
    messagesSubject.next({ type: 'registered', dispatcherId: 'dispatcher_web' });
    vi.advanceTimersByTime(10_001);
    expect(mockPresenceStore.pruneStaleViewers).toHaveBeenCalled();
  });

  // ── Disconnect cleanup ────────────────────────────────────────────────────

  it('when socket disconnects, resetPresence is called and lifecycle state is reset', () => {
    vi.useFakeTimers();
    service.connect();
    messagesSubject.next({ type: 'registered', dispatcherId: 'dispatcher_web' });

    wsStateMock.set('connecting');
    TestBed.flushEffects();
    wsStateMock.set('disconnected');
    TestBed.flushEffects();

    expect(mockPresenceStore.resetPresence).toHaveBeenCalled();

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

  it('close() closes wsClient, clears ping and prune intervals, and unsubscribes', () => {
    vi.useFakeTimers();
    service.connect();
    messagesSubject.next({ type: 'registered', dispatcherId: 'dispatcher_web' });
    service.close();
    expect(mockWsClient.close).toHaveBeenCalled();
    vi.clearAllMocks();
    vi.advanceTimersByTime(30_001);
    expect(mockWsClient.send).not.toHaveBeenCalled();
  });

  it('prune interval is cleared on close()', () => {
    vi.useFakeTimers();
    service.connect();
    messagesSubject.next({ type: 'registered', dispatcherId: 'dispatcher_web' });
    service.close();
    vi.clearAllMocks();
    vi.advanceTimersByTime(10_001);
    expect(mockPresenceStore.pruneStaleViewers).not.toHaveBeenCalled();
  });

  // ── Viewing truck ─────────────────────────────────────────────────────────

  it('viewing_truck is not sent when connected but selfId is null (pre-registration state)', () => {
    selectedTruckIdMock.set('truck_1');
    wsStateMock.set('connected');
    TestBed.flushEffects();
    const viewingCalls = (mockWsClient.send.mock.calls as Array<[{ type: string }]>)
      .filter(c => c[0].type === 'viewing_truck');
    expect(viewingCalls).toHaveLength(0);
  });

  it('viewing_truck is sent once registered sets selfId with truck already selected', () => {
    selectedTruckIdMock.set('truck_1');
    wsStateMock.set('connected');
    TestBed.flushEffects(); // no send — selfId null

    service.connect();
    messagesSubject.next({ type: 'registered', dispatcherId: 'dispatcher_web' });
    TestBed.flushEffects(); // setSelf → selfId changes → effect sends

    expect(mockWsClient.send).toHaveBeenCalledWith({ type: 'viewing_truck', truckId: 'truck_1' });
  });

  it('same truck is not sent twice in the same connection', () => {
    selectedTruckIdMock.set('truck_1');
    wsStateMock.set('connected');
    selfIdSignal.set('dispatcher_web');
    TestBed.flushEffects(); // first send

    vi.clearAllMocks();

    // Trigger the effect again by changing selfId while keeping truck the same
    selfIdSignal.set('dispatcher_web_alt');
    TestBed.flushEffects(); // guard: truck_1 === lastSentViewingTruckId → no send
    expect(mockWsClient.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'viewing_truck' }));
  });

  it('does not send viewing_truck after reconnect connected state until registered clears stale selfId', () => {
    selectedTruckIdMock.set('truck_1');

    wsStateMock.set('connected');
    selfIdSignal.set('dispatcher_web');
    TestBed.flushEffects();

    expect(mockWsClient.send).toHaveBeenCalledWith({ type: 'viewing_truck', truckId: 'truck_1' });

    vi.clearAllMocks();

    wsStateMock.set('disconnected');
    TestBed.flushEffects();

    expect(mockPresenceStore.resetPresence).toHaveBeenCalled();
    expect(selfIdSignal()).toBeNull();

    vi.clearAllMocks();

    // Socket reconnects — but selfId is null because resetPresence cleared it
    wsStateMock.set('connected');
    TestBed.flushEffects();

    expect(mockWsClient.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'viewing_truck' }),
    );
  });

  it('viewing_truck is re-sent after registered confirms the new session', () => {
    selectedTruckIdMock.set('truck_1');
    wsStateMock.set('connected');
    selfIdSignal.set('dispatcher_web');
    TestBed.flushEffects(); // sends truck_1

    wsStateMock.set('disconnected');
    TestBed.flushEffects(); // resets selfId and lastSentViewingTruckId
    vi.clearAllMocks();

    wsStateMock.set('connected');
    TestBed.flushEffects(); // no send — selfId still null

    service.connect();
    messagesSubject.next({ type: 'registered', dispatcherId: 'dispatcher_web' });
    TestBed.flushEffects(); // selfId changes → effect sends truck_1 again

    expect(mockWsClient.send).toHaveBeenCalledWith({ type: 'viewing_truck', truckId: 'truck_1' });
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

  it('dispatcher_viewing calls presenceStore.setDispatcherViewing with the correct entry', () => {
    service.connect();
    messagesSubject.next({
      type: 'dispatcher_viewing',
      dispatcherId: 'd2',
      truckId: 'truck_1',
      timestamp: 7000,
    });
    expect(mockPresenceStore.setDispatcherViewing).toHaveBeenCalledWith({
      dispatcherId: 'd2',
      truckId: 'truck_1',
      timestamp: 7000,
    });
    expect(mockPresenceStore.addDispatcher).not.toHaveBeenCalled();
    expect(mockPresenceStore.removeDispatcher).not.toHaveBeenCalled();
  });

  it('truck_alert calls alertsStore.addAlert', () => {
    service.connect();
    messagesSubject.next({ type: 'truck_alert', alert: mockAlert });
    expect(mockAlertsStore.addAlert).toHaveBeenCalledWith(mockAlert);
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

  it('fleet_reset is ignored and does not clear presence due to the message itself', () => {
    service.connect();
    vi.clearAllMocks();

    messagesSubject.next({ type: 'fleet_reset', timestamp: Date.now() });

    expect(mockPresenceStore.resetPresence).not.toHaveBeenCalled();
    expect(mockRoutesStore.upsertRoute).not.toHaveBeenCalled();
    expect(mockFleetStore.patchTruck).not.toHaveBeenCalled();
    expect(mockAlertsStore.addAlert).not.toHaveBeenCalled();
  });
});
