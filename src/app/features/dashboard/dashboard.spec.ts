import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { DashboardComponent } from './dashboard';

// Prevent FleetMapComponent from initialising a real Leaflet map in dashboard tests.
vi.mock('leaflet', () => ({
  map: vi.fn().mockReturnValue({ setView: vi.fn().mockReturnThis(), remove: vi.fn() }),
  tileLayer: vi.fn().mockReturnValue({ addTo: vi.fn() }),
  circleMarker: vi.fn().mockReturnValue({ addTo: vi.fn().mockReturnThis(), setLatLng: vi.fn().mockReturnThis(), bindPopup: vi.fn().mockReturnThis(), remove: vi.fn() }),
  polyline: vi.fn().mockReturnValue({ addTo: vi.fn().mockReturnThis(), setLatLngs: vi.fn().mockReturnThis(), remove: vi.fn() }),
}));
import { FleetStore } from '../../domain/fleet/fleet.store';
import { ConnectionStore } from '../../domain/fleet/connection.store';
import { TelemetryStore } from '../../domain/telemetry/telemetry.store';
import { TelemetryPipeline } from '../../domain/telemetry/telemetry-pipeline';
import { PresenceService } from '../../domain/presence/presence.service';
import { PresenceStore } from '../../domain/presence/presence.store';
import { RouteService } from '../../domain/routes/route.service';
import { RoutesStore } from '../../domain/routes/routes.store';
import { AuditLog } from '../../domain/routes/audit-log';
import { SelectedVehicleStore } from '../../domain/vehicle-selection/selected-vehicle.store';
import { AlertsStore } from '../../domain/alerts/alerts.store';
import { VehicleDetailService } from '../../domain/vehicle-detail/vehicle-detail.service';
import { TelemetryHealthStore } from '../../domain/observability/telemetry-health.store';
import { of } from 'rxjs';
import type { TruckListItem } from '../../shared/models/truck.model';
import type { SseConnectionState } from '../../domain/fleet/connection.store';
import type { WsState } from '../../shared/models/ws.model';

const mockTruck: TruckListItem = {
  id: 'truck_1', name: 'Truck 1', status: 'active',
  location: { lat: 51.5074, lng: -0.1278 }, speed: 60, heading: 90,
  fuel: 75, engineTemp: 85, currentRouteId: null, _version: 1,
};

describe('DashboardComponent', () => {
  const truckList = signal<TruckListItem[]>([]);
  const sse = signal<SseConnectionState>('connecting');
  const isDegraded = signal(true);
  const lastHeartbeatAt = signal(0);
  const selectedTruckId = signal<string | null>(null);

  function render(): ReturnType<typeof TestBed.createComponent<DashboardComponent>> {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    TestBed.flushEffects();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(async () => {
    truckList.set([]);
    sse.set('connecting');
    isDegraded.set(true);
    selectedTruckId.set(null);

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: FleetStore, useValue: { truckList, truckById: vi.fn(), patchTruck: vi.fn(), upsertTruck: vi.fn(), setFleet: vi.fn() } },
        { provide: ConnectionStore, useValue: { isDegraded, sse, lastHeartbeatAt, markConnected: vi.fn(), markConnecting: vi.fn(), markDisconnected: vi.fn(), markHeartbeat: vi.fn() } },
        { provide: TelemetryStore, useValue: { trucks: signal(new Map()), latestFor: vi.fn().mockReturnValue(null), lastAcceptedTsFor: vi.fn().mockReturnValue(0), applyReading: vi.fn(), applyTrail: vi.fn(), historyFor: vi.fn().mockReturnValue([]) } },
        { provide: TelemetryPipeline, useValue: { start: vi.fn() } },
        { provide: RouteService, useValue: { loadRoutes: vi.fn().mockReturnValue(of(undefined)), createRoute: vi.fn(), updateRoute: vi.fn(), reassignRoute: vi.fn() } },
        { provide: RoutesStore, useValue: { routeList: signal([]), isLoaded: signal(false), routeById: vi.fn(), versionFor: vi.fn(), setRoutes: vi.fn(), upsertRoute: vi.fn(), removeRoute: vi.fn() } },
        { provide: AuditLog, useValue: { entries: signal([]), append: vi.fn() } },
        { provide: PresenceService, useValue: { connect: vi.fn(), close: vi.fn() } },
        {
          provide: PresenceStore,
          useValue: {
            selfId: signal<string | null>(null),
            dispatchers: signal([]),
            activeCount: signal(0),
            wsState: signal<WsState>('disconnected'),
            viewingByDispatcher: signal([]),
            viewersForTruck: vi.fn().mockReturnValue([]),
            setSelf: vi.fn(), addDispatcher: vi.fn(), removeDispatcher: vi.fn(),
            setActiveCount: vi.fn(), setWsState: vi.fn(), resetPresence: vi.fn(),
            setDispatcherViewing: vi.fn(), pruneStaleViewers: vi.fn(),
          },
        },
        {
          provide: SelectedVehicleStore,
          useValue: {
            selectedTruckId: selectedTruckId.asReadonly(),
            selectTruck: vi.fn((id: string) => selectedTruckId.set(id)),
            clearSelection: vi.fn(() => selectedTruckId.set(null)),
          },
        },
        {
          provide: AlertsStore,
          useValue: {
            alerts: signal([]),
            addAlert: vi.fn(),
            alertsForTruck: vi.fn().mockReturnValue([]),
          },
        },
        {
          provide: VehicleDetailService,
          useValue: {
            loadDetail: vi.fn(),
            sendAlert: vi.fn().mockReturnValue(of({ kind: 'success' })),
            mileageFor: vi.fn().mockReturnValue(null),
            loadingTruckId: signal(null),
            detailError: signal(null),
          },
        },
        { provide: TelemetryHealthStore, useValue: { droppedCount: signal(0), incrementDropped: vi.fn(), reset: vi.fn() } },
      ],
    }).compileComponents();
  });

  it('renders the FleetPulse title and subtitle', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.dashboard__title')?.textContent).toContain('FleetPulse');
    expect(el.querySelector('.dashboard__subtitle')?.textContent).toContain('Real-Time Fleet Management Dashboard');
  });

  it('shows degraded banner while connecting', () => {
    isDegraded.set(true);
    sse.set('connecting');
    const fixture = render();
    expect((fixture.nativeElement as HTMLElement).querySelector('.banner--degraded')).not.toBeNull();
  });

  it('shows disconnected text in banner when SSE is disconnected', () => {
    isDegraded.set(true);
    sse.set('disconnected');
    const fixture = render();
    const banner = (fixture.nativeElement as HTMLElement).querySelector('.banner--degraded');
    expect(banner?.textContent).toContain('reconnecting');
  });

  it('shows connected banner when SSE is live', () => {
    isDegraded.set(false);
    sse.set('connected');
    const fixture = render();
    expect((fixture.nativeElement as HTMLElement).querySelector('.banner--connected')).not.toBeNull();
  });

  it('renders a fleet-item for each loaded truck', () => {
    truckList.set([mockTruck]);
    const fixture = render();
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.fleet-item:not(.fleet-item--empty)');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Truck 1');
  });

  it('shows empty placeholder when fleet is not yet loaded', () => {
    truckList.set([]);
    const fixture = render();
    expect((fixture.nativeElement as HTMLElement).querySelector('.fleet-item--empty')).not.toBeNull();
  });

  it('live telemetry from TelemetryStore is shown instead of REST fallback values', () => {
    truckList.set([mockTruck]); // REST values: speed 60, fuel 75

    const telemetryMock = TestBed.inject(TelemetryStore) as unknown as { latestFor: ReturnType<typeof vi.fn> };
    telemetryMock.latestFor.mockReturnValue({
      truckId: 'truck_1',
      location: { lat: 51.5, lng: -0.1 },
      speed: 88, heading: 90, fuel: 42, engineTemp: 90, status: 'active', timestamp: 2000,
      displaySpeed: 88, displayFuel: 42, speedSensorError: false, fuelGlitch: false,
    });

    const el = render().nativeElement as HTMLElement;
    expect(el.textContent).toContain('88 km/h');
    expect(el.textContent).toContain('42%');
    expect(el.textContent).not.toContain('60 km/h');
    expect(el.textContent).not.toContain('75%');
  });

  it('shows — km/h when speedSensorError is true and does not display 999', () => {
    truckList.set([mockTruck]);
    const telemetryMock = TestBed.inject(TelemetryStore) as unknown as { latestFor: ReturnType<typeof vi.fn> };
    telemetryMock.latestFor.mockReturnValue({
      truckId: 'truck_1',
      location: { lat: 51.5, lng: -0.1 },
      speed: 999, displaySpeed: null, speedSensorError: true,
      heading: 90, fuel: 75, displayFuel: 75, fuelGlitch: false,
      engineTemp: 85, status: 'active', timestamp: 2000,
    });

    const el = render().nativeElement as HTMLElement;
    expect(el.textContent).toContain('— km/h');
    expect(el.textContent).not.toContain('999');
  });

  it('shows carried-forward fuel when fuelGlitch is true and does not display 0%', () => {
    truckList.set([mockTruck]);
    const telemetryMock = TestBed.inject(TelemetryStore) as unknown as { latestFor: ReturnType<typeof vi.fn> };
    telemetryMock.latestFor.mockReturnValue({
      truckId: 'truck_1',
      location: { lat: 51.5, lng: -0.1 },
      speed: 60, displaySpeed: 60, speedSensorError: false,
      heading: 90, fuel: 0, displayFuel: 75, fuelGlitch: true,
      engineTemp: 85, status: 'active', timestamp: 2000,
    });

    const el = render().nativeElement as HTMLElement;
    expect(el.textContent).toContain('75%');
    expect(el.textContent).not.toContain('0%');
  });

  it('calls pipeline.start() on construction', () => {
    const pipelineMock = TestBed.inject(TelemetryPipeline) as unknown as { start: ReturnType<typeof vi.fn> };
    render();
    expect(pipelineMock.start).toHaveBeenCalled();
  });

  it('calls presenceService.connect() on construction', () => {
    const presenceMock = TestBed.inject(PresenceService) as unknown as { connect: ReturnType<typeof vi.fn> };
    render();
    expect(presenceMock.connect).toHaveBeenCalled();
  });

  it('renders the presence indicator in the header', () => {
    const fixture = render();
    expect((fixture.nativeElement as HTMLElement).querySelector('.presence-indicator')).not.toBeNull();
  });

  it('renders the fleet map component', () => {
    const fixture = render();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-fleet-map')).not.toBeNull();
  });

  it('renders the route management component', () => {
    const fixture = render();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-route-management')).not.toBeNull();
  });

  it('renders the vehicle detail component', () => {
    const fixture = render();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-vehicle-detail')).not.toBeNull();
  });

  it('renders the observability panel component', () => {
    const fixture = render();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-observability-panel')).not.toBeNull();
  });

  it('renders the anomaly dashboard component', () => {
    const fixture = render();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-anomaly-dashboard')).not.toBeNull();
  });

  it('calls selectedVehicleStore.selectTruck when a fleet item is clicked', () => {
    truckList.set([mockTruck]);
    const fixture = render();
    const selectedVehicleStoreMock = TestBed.inject(SelectedVehicleStore) as unknown as { selectTruck: ReturnType<typeof vi.fn> };
    const item = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.fleet-item:not(.fleet-item--empty)');
    item?.click();
    expect(selectedVehicleStoreMock.selectTruck).toHaveBeenCalledWith('truck_1');
  });

  it('applies fleet-item--selected class to the selected truck', () => {
    truckList.set([mockTruck]);
    selectedTruckId.set('truck_1');
    const fixture = render();
    const item = (fixture.nativeElement as HTMLElement).querySelector('.fleet-item:not(.fleet-item--empty)');
    expect(item?.classList.contains('fleet-item--selected')).toBe(true);
  });

  it('calls selectedVehicleStore.selectTruck on Enter key press on a fleet item', () => {
    truckList.set([mockTruck]);
    const fixture = render();
    const selectedVehicleStoreMock = TestBed.inject(SelectedVehicleStore) as unknown as { selectTruck: ReturnType<typeof vi.fn> };
    const item = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.fleet-item:not(.fleet-item--empty)');
    item?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(selectedVehicleStoreMock.selectTruck).toHaveBeenCalledWith('truck_1');
  });

  // ── Fleet filtering ──────────────────────────────────────────────

  it('text filter matches trucks by name (case-insensitive)', () => {
    truckList.set([
      { ...mockTruck, id: 'truck_1', name: 'Alpha One' },
      { ...mockTruck, id: 'truck_2', name: 'Beta Two' },
    ]);
    const fixture = render();
    fixture.componentInstance.filterText.set('alpha');
    fixture.detectChanges();
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.fleet-item:not(.fleet-item--empty)');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Alpha One');
  });

  it('text filter matches trucks by id (case-insensitive)', () => {
    truckList.set([
      { ...mockTruck, id: 'truck_abc', name: 'Truck ABC' },
      { ...mockTruck, id: 'truck_xyz', name: 'Truck XYZ' },
    ]);
    const fixture = render();
    fixture.componentInstance.filterText.set('ABC');
    fixture.detectChanges();
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.fleet-item:not(.fleet-item--empty)');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Truck ABC');
  });

  it('status filter keeps only matching trucks', () => {
    truckList.set([
      { ...mockTruck, id: 'truck_1', name: 'Active Truck', status: 'active' },
      { ...mockTruck, id: 'truck_2', name: 'Idle Truck', status: 'idle' },
    ]);
    const fixture = render();
    fixture.componentInstance.filterStatus.set('active');
    fixture.detectChanges();
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.fleet-item:not(.fleet-item--empty)');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Active Truck');
  });

  it('assignment filter "assigned" keeps only trucks with a currentRouteId', () => {
    truckList.set([
      { ...mockTruck, id: 'truck_1', name: 'Assigned', currentRouteId: 'route_1' },
      { ...mockTruck, id: 'truck_2', name: 'Free', currentRouteId: null },
    ]);
    const fixture = render();
    fixture.componentInstance.filterAssignment.set('assigned');
    fixture.detectChanges();
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.fleet-item:not(.fleet-item--empty)');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Assigned');
  });

  it('assignment filter "unassigned" keeps only trucks without a currentRouteId', () => {
    truckList.set([
      { ...mockTruck, id: 'truck_1', name: 'Assigned', currentRouteId: 'route_1' },
      { ...mockTruck, id: 'truck_2', name: 'Free', currentRouteId: null },
    ]);
    const fixture = render();
    fixture.componentInstance.filterAssignment.set('unassigned');
    fixture.detectChanges();
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.fleet-item:not(.fleet-item--empty)');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Free');
  });

  it('low-fuel filter keeps only trucks with fuel < 25 (boundary: fuel === 25 excluded)', () => {
    truckList.set([
      { ...mockTruck, id: 'truck_1', name: 'Low',    fuel: 24 },
      { ...mockTruck, id: 'truck_2', name: 'Border', fuel: 25 },
      { ...mockTruck, id: 'truck_3', name: 'Full',   fuel: 80 },
    ]);
    const fixture = render();
    fixture.componentInstance.lowFuelOnly.set(true);
    fixture.detectChanges();
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.fleet-item:not(.fleet-item--empty)');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Low');
  });

  it('combined filters AND together (text + status)', () => {
    truckList.set([
      { ...mockTruck, id: 'truck_1', name: 'Alpha Active', status: 'active' },
      { ...mockTruck, id: 'truck_2', name: 'Alpha Idle',   status: 'idle' },
      { ...mockTruck, id: 'truck_3', name: 'Beta Active',  status: 'active' },
    ]);
    const fixture = render();
    fixture.componentInstance.filterText.set('alpha');
    fixture.componentInstance.filterStatus.set('active');
    fixture.detectChanges();
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.fleet-item:not(.fleet-item--empty)');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Alpha Active');
  });

  it('resetFilters() restores defaults and shows the full list', () => {
    truckList.set([
      { ...mockTruck, id: 'truck_1', name: 'Truck One', status: 'active' },
      { ...mockTruck, id: 'truck_2', name: 'Truck Two', status: 'idle' },
    ]);
    const fixture = render();
    fixture.componentInstance.filterStatus.set('active');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.fleet-item:not(.fleet-item--empty)').length).toBe(1);

    fixture.componentInstance.resetFilters();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.fleet-item:not(.fleet-item--empty)').length).toBe(2);
    expect(fixture.componentInstance.filterText()).toBe('');
    expect(fixture.componentInstance.filterStatus()).toBe('all');
    expect(fixture.componentInstance.filterAssignment()).toBe('all');
    expect(fixture.componentInstance.lowFuelOnly()).toBe(false);
  });

  it('filtered count renders "showing X of Y" when fleet has trucks', () => {
    truckList.set([
      { ...mockTruck, id: 'truck_1', name: 'Active One', status: 'active' },
      { ...mockTruck, id: 'truck_2', name: 'Idle Two',   status: 'idle' },
    ]);
    const fixture = render();
    fixture.componentInstance.filterStatus.set('active');
    fixture.detectChanges();
    const count = (fixture.nativeElement as HTMLElement).querySelector('.fleet-overview__count');
    expect(count?.textContent).toContain('1');
    expect(count?.textContent).toContain('2');
  });

  it('shows no-match empty state when filters exclude all trucks but fleet has data', () => {
    truckList.set([{ ...mockTruck, id: 'truck_1', name: 'Truck One', status: 'active' }]);
    const fixture = render();
    fixture.componentInstance.filterStatus.set('maintenance');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.fleet-item--no-match')).not.toBeNull();
    expect(el.querySelector('.fleet-item--no-match')?.textContent).toContain('No trucks match');
    expect(el.textContent).not.toContain('No fleet data yet');
  });

  // ── Filter clears selection ───────────────────────────────────────

  it('changing text filter clears the selected truck', () => {
    truckList.set([mockTruck]);
    selectedTruckId.set('truck_1');
    const fixture = render();
    const store = TestBed.inject(SelectedVehicleStore) as unknown as { clearSelection: ReturnType<typeof vi.fn> };

    fixture.componentInstance.setFilterText('xyz');
    expect(store.clearSelection).toHaveBeenCalled();
    expect(selectedTruckId()).toBeNull();
  });

  it('changing status filter clears the selected truck', () => {
    truckList.set([mockTruck]);
    selectedTruckId.set('truck_1');
    const fixture = render();
    const store = TestBed.inject(SelectedVehicleStore) as unknown as { clearSelection: ReturnType<typeof vi.fn> };

    fixture.componentInstance.setFilterStatus('idle');
    expect(store.clearSelection).toHaveBeenCalled();
    expect(selectedTruckId()).toBeNull();
  });

  it('changing assignment filter clears the selected truck', () => {
    truckList.set([mockTruck]);
    selectedTruckId.set('truck_1');
    const fixture = render();
    const store = TestBed.inject(SelectedVehicleStore) as unknown as { clearSelection: ReturnType<typeof vi.fn> };

    fixture.componentInstance.setFilterAssignment('assigned');
    expect(store.clearSelection).toHaveBeenCalled();
    expect(selectedTruckId()).toBeNull();
  });

  it('changing low-fuel filter clears the selected truck', () => {
    truckList.set([mockTruck]);
    selectedTruckId.set('truck_1');
    const fixture = render();
    const store = TestBed.inject(SelectedVehicleStore) as unknown as { clearSelection: ReturnType<typeof vi.fn> };

    fixture.componentInstance.setLowFuelOnly(true);
    expect(store.clearSelection).toHaveBeenCalled();
    expect(selectedTruckId()).toBeNull();
  });

  it('resetFilters() clears the selected truck', () => {
    truckList.set([mockTruck]);
    selectedTruckId.set('truck_1');
    const fixture = render();
    const store = TestBed.inject(SelectedVehicleStore) as unknown as { clearSelection: ReturnType<typeof vi.fn> };

    fixture.componentInstance.resetFilters();
    expect(store.clearSelection).toHaveBeenCalled();
    expect(selectedTruckId()).toBeNull();
  });

  it('shows "No fleet data yet" when fleet list is genuinely empty', () => {
    truckList.set([]);
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.fleet-item--empty:not(.fleet-item--no-match)')).not.toBeNull();
    expect(el.textContent).toContain('No fleet data yet');
    expect(el.querySelector('.fleet-item--no-match')).toBeNull();
  });

  it('calls selectedVehicleStore.selectTruck and preventDefault on Space key press on a fleet item', () => {
    truckList.set([mockTruck]);
    const fixture = render();

    const selectedVehicleStoreMock = TestBed.inject(SelectedVehicleStore) as unknown as {
      selectTruck: ReturnType<typeof vi.fn>;
    };

    const item = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLElement>('.fleet-item:not(.fleet-item--empty)')!;

    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    item.dispatchEvent(event);

    expect(selectedVehicleStoreMock.selectTruck).toHaveBeenCalledWith('truck_1');
    expect(preventDefaultSpy).toHaveBeenCalled();
  });
});
