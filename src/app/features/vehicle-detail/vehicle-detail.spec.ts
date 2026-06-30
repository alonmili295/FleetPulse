import { TestBed } from '@angular/core/testing';
import { signal, type WritableSignal } from '@angular/core';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { VehicleDetailComponent } from './vehicle-detail';
import { FleetStore } from '../../domain/fleet/fleet.store';
import { TelemetryStore } from '../../domain/telemetry/telemetry.store';
import { RoutesStore } from '../../domain/routes/routes.store';
import { PresenceStore } from '../../domain/presence/presence.store';
import { AlertsStore } from '../../domain/alerts/alerts.store';
import { VehicleDetailService } from '../../domain/vehicle-detail/vehicle-detail.service';
import { SelectedVehicleStore } from '../../domain/vehicle-selection/selected-vehicle.store';
import type { TruckListItem } from '../../shared/models/truck.model';
import type { Route } from '../../shared/models/route.model';
import type { Alert } from '../../shared/models/alert.model';
import type { AppError } from '../../core/errors/app-error';

const mockTruck: TruckListItem = {
  id: 'truck_1', name: 'Truck Alpha', status: 'active',
  location: { lat: 51.5, lng: -0.1 }, speed: 60, heading: 90,
  fuel: 75, engineTemp: 85, currentRouteId: null, _version: 1,
};

const mockRoute: Route = {
  id: 'route_1', truckId: 'truck_1', destination: 'Tel Aviv',
  priority: 'high', notes: '', status: 'assigned',
  assignedBy: 'dispatcher_web', assignedAt: 1000, _version: 1,
};

const mockAlert: Alert = {
  id: 'alert_1', truckId: 'truck_1', message: 'Check engine now', severity: 'warning',
  sentBy: 'dispatcher_web', timestamp: 1_700_000_000_000, acknowledged: false,
};

describe('VehicleDetailComponent', () => {
  let selectedTruckIdSignal: WritableSignal<string | null>;
  let loadingTruckIdSignal: WritableSignal<string | null>;
  let detailErrorSignal: WritableSignal<AppError | null>;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let mockSelectedVehicleStore: any;
  let mockVehicleDetailService: any;
  let mockFleetStore: any;
  let mockTelemetryStore: any;
  let mockRoutesStore: any;
  let mockPresenceStore: any;
  let mockAlertsStore: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  function render(): ReturnType<typeof TestBed.createComponent<VehicleDetailComponent>> {
    const fixture = TestBed.createComponent(VehicleDetailComponent);
    fixture.detectChanges();
    TestBed.flushEffects();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(async () => {
    selectedTruckIdSignal = signal<string | null>(null);
    loadingTruckIdSignal  = signal<string | null>(null);
    detailErrorSignal     = signal<AppError | null>(null);

    mockSelectedVehicleStore = {
      selectedTruckId: selectedTruckIdSignal.asReadonly(),
      selectTruck:    vi.fn((id: string) => selectedTruckIdSignal.set(id)),
      clearSelection: vi.fn(() => selectedTruckIdSignal.set(null)),
    };

    mockVehicleDetailService = {
      loadDetail:     vi.fn(),
      sendAlert:      vi.fn().mockReturnValue(of({ kind: 'success', alert: mockAlert })),
      mileageFor:     vi.fn().mockReturnValue(null),
      loadingTruckId: loadingTruckIdSignal.asReadonly(),
      detailError:    detailErrorSignal.asReadonly(),
    };

    mockFleetStore = {
      truckById:   vi.fn().mockReturnValue(null),
      truckList:   signal([]),
      patchTruck:  vi.fn(),
      upsertTruck: vi.fn(),
      setFleet:    vi.fn(),
    };

    mockTelemetryStore = {
      latestFor: vi.fn().mockReturnValue(null),
    };

    mockRoutesStore = {
      routeById:   vi.fn().mockReturnValue(undefined),
      routeList:   signal<Route[]>([]),
      isLoaded:    signal(false),
      versionFor:  vi.fn(),
      setRoutes:   vi.fn(),
      upsertRoute: vi.fn(),
      removeRoute: vi.fn(),
    };

    mockPresenceStore = {
      selfId:               signal(null),
      dispatchers:          signal([]),
      activeCount:          signal(0),
      wsState:              signal('disconnected'),
      viewingByDispatcher:  signal([]),
      viewersForTruck:      vi.fn().mockReturnValue([]),
      setSelf:              vi.fn(),
      addDispatcher:        vi.fn(),
      removeDispatcher:     vi.fn(),
      setActiveCount:       vi.fn(),
      setWsState:           vi.fn(),
      setDispatcherViewing: vi.fn(),
      pruneStaleViewers:    vi.fn(),
      resetPresence:        vi.fn(),
    };

    mockAlertsStore = {
      alerts:         signal([]),
      addAlert:       vi.fn(),
      alertsForTruck: vi.fn().mockReturnValue([]),
    };

    await TestBed.configureTestingModule({
      imports: [VehicleDetailComponent],
      providers: [
        { provide: SelectedVehicleStore, useValue: mockSelectedVehicleStore },
        { provide: VehicleDetailService, useValue: mockVehicleDetailService },
        { provide: FleetStore,           useValue: mockFleetStore },
        { provide: TelemetryStore,       useValue: mockTelemetryStore },
        { provide: RoutesStore,          useValue: mockRoutesStore },
        { provide: PresenceStore,        useValue: mockPresenceStore },
        { provide: AlertsStore,          useValue: mockAlertsStore },
      ],
    }).compileComponents();
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  it('renders empty state when no truck is selected', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.vehicle-detail__empty')).not.toBeNull();
    expect(el.textContent).toContain('Select a truck to view details');
  });

  // ── Selected truck ────────────────────────────────────────────────────────

  it('renders truck name and status badge when a truck is selected', () => {
    mockFleetStore.truckById.mockReturnValue(mockTruck);
    selectedTruckIdSignal.set('truck_1');
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.vehicle-detail__name')?.textContent).toContain('Truck Alpha');
    expect(el.querySelector('.vehicle-detail__status')?.textContent?.trim()).toBe('active');
  });

  it('prefers live displaySpeed/displayFuel over fleet base values', () => {
    mockFleetStore.truckById.mockReturnValue(mockTruck);
    mockTelemetryStore.latestFor.mockReturnValue({
      truckId: 'truck_1', speed: 999, displaySpeed: 88, speedSensorError: false,
      fuel: 0, displayFuel: 55, fuelGlitch: false,
      engineTemp: 90, heading: 90, status: 'active', timestamp: 2000,
      location: { lat: 51.5, lng: -0.1 },
    });
    selectedTruckIdSignal.set('truck_1');
    const el = render().nativeElement as HTMLElement;
    expect(el.textContent).toContain('88');
    expect(el.textContent).toContain('55');
    expect(el.textContent).not.toContain('999');
  });

  it('shows Sensor error label when speedSensorError is true', () => {
    mockFleetStore.truckById.mockReturnValue(mockTruck);
    mockTelemetryStore.latestFor.mockReturnValue({
      truckId: 'truck_1', speed: 999, displaySpeed: null, speedSensorError: true,
      fuel: 75, displayFuel: 75, fuelGlitch: false,
      engineTemp: 85, heading: 90, status: 'active', timestamp: 2000,
      location: { lat: 51.5, lng: -0.1 },
    });
    selectedTruckIdSignal.set('truck_1');
    const el = render().nativeElement as HTMLElement;
    expect(el.textContent).toContain('Sensor error');
    expect(el.textContent).not.toContain('999');
  });

  it('shows est. tag when fuelGlitch is true', () => {
    mockFleetStore.truckById.mockReturnValue(mockTruck);
    mockTelemetryStore.latestFor.mockReturnValue({
      truckId: 'truck_1', speed: 60, displaySpeed: 60, speedSensorError: false,
      fuel: 0, displayFuel: 75, fuelGlitch: true,
      engineTemp: 85, heading: 90, status: 'active', timestamp: 2000,
      location: { lat: 51.5, lng: -0.1 },
    });
    selectedTruckIdSignal.set('truck_1');
    expect(render().nativeElement.querySelector('.gauge__unit--est')).not.toBeNull();
  });

  // ── Mileage ───────────────────────────────────────────────────────────────

  it('shows — when mileage is not yet loaded', () => {
    mockFleetStore.truckById.mockReturnValue(mockTruck);
    mockVehicleDetailService.mileageFor.mockReturnValue(null);
    selectedTruckIdSignal.set('truck_1');
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('.vehicle-detail__stat-row')?.textContent).toContain('—');
  });

  it('shows mileage value after it is loaded', () => {
    mockFleetStore.truckById.mockReturnValue(mockTruck);
    mockVehicleDetailService.mileageFor.mockReturnValue(12345);
    selectedTruckIdSignal.set('truck_1');
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('.vehicle-detail__stat-row')?.textContent).toContain('12,345 km');
  });

  it('shows error message when detail load fails', () => {
    mockFleetStore.truckById.mockReturnValue(mockTruck);
    detailErrorSignal.set({ kind: 'http', statusCode: 500, message: 'Server error' });
    selectedTruckIdSignal.set('truck_1');
    expect(render().nativeElement.querySelector('.vehicle-detail__stat-error')).not.toBeNull();
  });

  // ── Route ─────────────────────────────────────────────────────────────────

  it('shows route destination and status when route exists', () => {
    const truckWithRoute: TruckListItem = { ...mockTruck, currentRouteId: 'route_1' };
    mockFleetStore.truckById.mockReturnValue(truckWithRoute);
    mockRoutesStore.routeById.mockReturnValue(mockRoute);
    selectedTruckIdSignal.set('truck_1');
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('.route-card__destination')?.textContent).toContain('Tel Aviv');
    expect(el.querySelector('.route-card__status')?.textContent).toContain('assigned');
  });

  it('shows No active route when route lookup returns null', () => {
    mockFleetStore.truckById.mockReturnValue(mockTruck);
    mockRoutesStore.routeById.mockReturnValue(undefined);
    selectedTruckIdSignal.set('truck_1');
    expect(render().nativeElement.querySelector('.vehicle-detail__no-route')).not.toBeNull();
  });

  // ── Peer viewers ──────────────────────────────────────────────────────────

  it('shows peer viewer labels when other dispatchers are viewing the truck', () => {
    mockFleetStore.truckById.mockReturnValue(mockTruck);
    mockPresenceStore.viewersForTruck.mockReturnValue([
      { dispatcherId: 'd2', label: 'Alice', truckId: 'truck_1', timestamp: 5000 },
    ]);
    selectedTruckIdSignal.set('truck_1');
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('.vehicle-detail__viewers')).not.toBeNull();
    expect(el.textContent).toContain('Alice');
  });

  // ── Close button ──────────────────────────────────────────────────────────

  it('close button calls selectedVehicleStore.clearSelection()', () => {
    mockFleetStore.truckById.mockReturnValue(mockTruck);
    selectedTruckIdSignal.set('truck_1');
    const el = render().nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('.vehicle-detail__close')?.click();
    expect(mockSelectedVehicleStore.clearSelection).toHaveBeenCalled();
  });

  // ── Alert form ────────────────────────────────────────────────────────────

  it('disables alert submit when message is empty', () => {
    mockFleetStore.truckById.mockReturnValue(mockTruck);
    selectedTruckIdSignal.set('truck_1');
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector<HTMLButtonElement>('.alert-form__submit');
    expect(button?.disabled).toBe(true);
  });

  it('enables alert submit when message has non-whitespace text', () => {
    mockFleetStore.truckById.mockReturnValue(mockTruck);
    selectedTruckIdSignal.set('truck_1');
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    const textarea = el.querySelector<HTMLTextAreaElement>('.alert-form__message')!;
    const button   = el.querySelector<HTMLButtonElement>('.alert-form__submit')!;
    textarea.value = 'Test alert';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(button.disabled).toBe(false);
  });

  it('alert form submit calls vehicleDetailService.sendAlert()', () => {
    mockFleetStore.truckById.mockReturnValue(mockTruck);
    selectedTruckIdSignal.set('truck_1');
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;

    const textarea = el.querySelector<HTMLTextAreaElement>('.alert-form__message')!;
    textarea.value = 'Test alert';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    el.querySelector<HTMLFormElement>('.alert-form')?.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );

    expect(mockVehicleDetailService.sendAlert).toHaveBeenCalledWith(
      'truck_1',
      expect.objectContaining({ message: 'Test alert' }),
    );
  });

  // ── loadDetail effect ─────────────────────────────────────────────────────

  it('calls vehicleDetailService.loadDetail when a truck is selected', () => {
    mockFleetStore.truckById.mockReturnValue(mockTruck);
    selectedTruckIdSignal.set('truck_1');
    render();
    expect(mockVehicleDetailService.loadDetail).toHaveBeenCalledWith('truck_1');
  });
});
