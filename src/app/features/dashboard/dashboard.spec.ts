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

  beforeEach(async () => {
    truckList.set([]);
    sse.set('connecting');
    isDegraded.set(true);

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: FleetStore, useValue: { truckList, truckById: vi.fn(), patchTruck: vi.fn(), upsertTruck: vi.fn(), setFleet: vi.fn() } },
        { provide: ConnectionStore, useValue: { isDegraded, sse, lastHeartbeatAt, markConnected: vi.fn(), markConnecting: vi.fn(), markDisconnected: vi.fn(), markHeartbeat: vi.fn() } },
        { provide: TelemetryStore, useValue: { latestFor: vi.fn().mockReturnValue(null), lastAcceptedTsFor: vi.fn().mockReturnValue(0), applyReading: vi.fn(), applyTrail: vi.fn(), historyFor: vi.fn().mockReturnValue([]) } },
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
            setSelf: vi.fn(), addDispatcher: vi.fn(), removeDispatcher: vi.fn(),
            setActiveCount: vi.fn(), setWsState: vi.fn(), resetPresence: vi.fn(),
          },
        },
      ],
    }).compileComponents();
  });

  it('renders the FleetPulse title and subtitle', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.dashboard__title')?.textContent).toContain('FleetPulse');
    expect(el.querySelector('.dashboard__subtitle')?.textContent).toContain('Real-Time Fleet Management Dashboard');
  });

  it('shows degraded banner while connecting', async () => {
    isDegraded.set(true);
    sse.set('connecting');
    const fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.banner--degraded')).not.toBeNull();
  });

  it('shows disconnected text in banner when SSE is disconnected', async () => {
    isDegraded.set(true);
    sse.set('disconnected');
    const fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    const banner = (fixture.nativeElement as HTMLElement).querySelector('.banner--degraded');
    expect(banner?.textContent).toContain('reconnecting');
  });

  it('shows connected banner when SSE is live', async () => {
    isDegraded.set(false);
    sse.set('connected');
    const fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.banner--connected')).not.toBeNull();
  });

  it('renders a fleet-item for each loaded truck', async () => {
    truckList.set([mockTruck]);
    const fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.fleet-item:not(.fleet-item--empty)');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Truck 1');
  });

  it('shows empty placeholder when fleet is not yet loaded', async () => {
    truckList.set([]);
    const fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.fleet-item--empty')).not.toBeNull();
  });

  it('live telemetry from TelemetryStore is shown instead of REST fallback values', async () => {
    truckList.set([mockTruck]); // REST values: speed 60, fuel 75

    // Override latestFor before rendering so the template picks up live values
    const telemetryMock = TestBed.inject(TelemetryStore) as unknown as { latestFor: ReturnType<typeof vi.fn> };
    telemetryMock.latestFor.mockReturnValue({
      truckId: 'truck_1',
      location: { lat: 51.5, lng: -0.1 },
      speed: 88,
      heading: 90,
      fuel: 42,
      engineTemp: 90,
      status: 'active',
      timestamp: 2000,
      displaySpeed: 88,
      displayFuel: 42,
      speedSensorError: false,
      fuelGlitch: false,
    });

    const fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('88 km/h');
    expect(el.textContent).toContain('42%');
    expect(el.textContent).not.toContain('60 km/h');
    expect(el.textContent).not.toContain('75%');
  });

  it('shows — km/h when speedSensorError is true and does not display 999', async () => {
    truckList.set([mockTruck]);
    const telemetryMock = TestBed.inject(TelemetryStore) as unknown as { latestFor: ReturnType<typeof vi.fn> };
    telemetryMock.latestFor.mockReturnValue({
      truckId: 'truck_1',
      location: { lat: 51.5, lng: -0.1 },
      speed: 999, displaySpeed: null, speedSensorError: true,
      heading: 90,
      fuel: 75, displayFuel: 75, fuelGlitch: false,
      engineTemp: 85, status: 'active', timestamp: 2000,
    });

    const fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('— km/h');
    expect(el.textContent).not.toContain('999');
  });

  it('shows carried-forward fuel when fuelGlitch is true and does not display 0%', async () => {
    truckList.set([mockTruck]);
    const telemetryMock = TestBed.inject(TelemetryStore) as unknown as { latestFor: ReturnType<typeof vi.fn> };
    telemetryMock.latestFor.mockReturnValue({
      truckId: 'truck_1',
      location: { lat: 51.5, lng: -0.1 },
      speed: 60, displaySpeed: 60, speedSensorError: false,
      heading: 90,
      fuel: 0, displayFuel: 75, fuelGlitch: true,
      engineTemp: 85, status: 'active', timestamp: 2000,
    });

    const fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('75%');
    expect(el.textContent).not.toContain('0%');
  });

  it('calls pipeline.start() on construction', async () => {
    const pipelineMock = TestBed.inject(TelemetryPipeline) as unknown as { start: ReturnType<typeof vi.fn> };
    TestBed.createComponent(DashboardComponent);
    expect(pipelineMock.start).toHaveBeenCalled();
  });

  it('calls presenceService.connect() on construction', () => {
    const presenceMock = TestBed.inject(PresenceService) as unknown as { connect: ReturnType<typeof vi.fn> };
    TestBed.createComponent(DashboardComponent);
    expect(presenceMock.connect).toHaveBeenCalled();
  });

  it('renders the presence indicator in the header', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.presence-indicator')).not.toBeNull();
  });

  it('renders the fleet map component', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-fleet-map')).not.toBeNull();
  });

  it('renders the route management component', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-route-management')).not.toBeNull();
  });
});
