import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { RouteManagementComponent } from './route-management';
import { RouteService } from '../../domain/routes/route.service';
import { RoutesStore } from '../../domain/routes/routes.store';
import { AuditLog } from '../../domain/routes/audit-log';
import { FleetStore } from '../../domain/fleet/fleet.store';
import type { Route } from '../../shared/models/route.model';
import type { TruckListItem } from '../../shared/models/truck.model';

const mockRoute: Route = {
  id: 'route_1', truckId: 'truck_1', destination: 'Tel Aviv', priority: 'normal',
  notes: '', status: 'assigned', assignedBy: 'dispatcher_web', assignedAt: 1000, _version: 2,
};

function makeTruck(
  id: string,
  status: 'active' | 'idle' | 'maintenance' = 'active',
  currentRouteId: string | null = null,
): TruckListItem {
  return {
    id, name: `Truck ${id}`, status,
    location: { lat: 32, lng: 34 }, speed: 50, heading: 90,
    fuel: 75, engineTemp: 85, currentRouteId, _version: 1,
  };
}

describe('RouteManagementComponent', () => {
  const routeList = signal<Route[]>([]);
  const isLoaded = signal(false);
  const truckList = signal<TruckListItem[]>([]);
  const auditEntries = signal<readonly unknown[]>([]);

  let routeServiceSpy: {
    loadRoutes: ReturnType<typeof vi.fn>;
    createRoute: ReturnType<typeof vi.fn>;
    updateRoute: ReturnType<typeof vi.fn>;
    reassignRoute: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    routeList.set([]);
    isLoaded.set(false);
    truckList.set([]);

    routeServiceSpy = {
      loadRoutes: vi.fn().mockReturnValue(of(undefined)),
      createRoute: vi.fn().mockReturnValue(of({ kind: 'success', route: mockRoute })),
      updateRoute: vi.fn().mockReturnValue(of({ kind: 'success', route: mockRoute })),
      reassignRoute: vi.fn().mockReturnValue(of({ kind: 'success', route: mockRoute })),
    };

    await TestBed.configureTestingModule({
      imports: [RouteManagementComponent],
      providers: [
        { provide: RouteService, useValue: routeServiceSpy },
        {
          provide: RoutesStore,
          useValue: {
            routeList,
            isLoaded,
            routeById: vi.fn(),
            versionFor: vi.fn(),
            setRoutes: vi.fn(),
            upsertRoute: vi.fn(),
            removeRoute: vi.fn(),
          },
        },
        {
          provide: FleetStore,
          useValue: {
            truckList,
            truckById: vi.fn().mockReturnValue(undefined),
            patchTruck: vi.fn(),
            upsertTruck: vi.fn(),
            setFleet: vi.fn(),
          },
        },
        { provide: AuditLog, useValue: { entries: auditEntries, append: vi.fn() } },
      ],
    }).compileComponents();
  });

  it('renders the route-management section', async () => {
    const fixture = TestBed.createComponent(RouteManagementComponent);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.route-management')).not.toBeNull();
  });

  it('load routes button calls routeService.loadRoutes()', async () => {
    const fixture = TestBed.createComponent(RouteManagementComponent);
    await fixture.whenStable();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.route-management__load-btn')
      ?.click();
    expect(routeServiceSpy.loadRoutes).toHaveBeenCalled();
  });

  it('shows empty state when routes are not loaded', async () => {
    isLoaded.set(false);
    const fixture = TestBed.createComponent(RouteManagementComponent);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.route-management__empty')).not.toBeNull();
  });

  it('maintenance trucks are excluded from the create-form truck dropdown', async () => {
    isLoaded.set(true);
    truckList.set([makeTruck('truck_1', 'active'), makeTruck('truck_7', 'maintenance')]);
    const fixture = TestBed.createComponent(RouteManagementComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const options = Array.from(
      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLSelectElement>('.create-route__truck-select')
        ?.querySelectorAll('option') ?? [],
    ).map(o => o.value).filter(Boolean);
    expect(options).toContain('truck_1');
    expect(options).not.toContain('truck_7');
  });

  it('trucks with an active route are excluded from the create-form truck dropdown', async () => {
    isLoaded.set(true);
    truckList.set([makeTruck('truck_1', 'active', null), makeTruck('truck_2', 'active', 'route_1')]);
    const fixture = TestBed.createComponent(RouteManagementComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const options = Array.from(
      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLSelectElement>('.create-route__truck-select')
        ?.querySelectorAll('option') ?? [],
    ).map(o => o.value).filter(Boolean);
    expect(options).not.toContain('truck_2');
  });

  it('create button calls routeService.createRoute() with the selected truck and destination', async () => {
    isLoaded.set(true);
    truckList.set([makeTruck('truck_1', 'active')]);
    const fixture = TestBed.createComponent(RouteManagementComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.newTruckId.set('truck_1');
    fixture.componentInstance.newDestination.set('Tel Aviv');
    fixture.detectChanges(); // re-evaluate [disabled] before clicking
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.create-route__submit-btn')
      ?.click();

    expect(routeServiceSpy.createRoute).toHaveBeenCalledWith(
      expect.objectContaining({ truckId: 'truck_1', destination: 'Tel Aviv' }),
    );
  });

  it('renders a route-item for each route in the store', async () => {
    isLoaded.set(true);
    routeList.set([mockRoute]);
    const fixture = TestBed.createComponent(RouteManagementComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.route-item:not(.route-item--empty)');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Tel Aviv');
  });

  it('shows conflict notice when updateStatus returns a conflict', async () => {
    isLoaded.set(true);
    routeList.set([mockRoute]);
    routeServiceSpy.updateRoute.mockReturnValue(
      of({
        kind: 'conflict',
        conflict: { currentVersion: 5, yourVersion: 2, lastModifiedBy: 'other_dispatcher' },
      }),
    );

    const fixture = TestBed.createComponent(RouteManagementComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.updateStatus('route_1', 'in-progress');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.conflict-notice')).not.toBeNull();
    expect(el.querySelector('.conflict-notice')?.textContent).toContain('other_dispatcher');
  });

  it('reassign(): directly calls routeService.reassignRoute (internal fast-path)', async () => {
    isLoaded.set(true);
    routeList.set([mockRoute]);
    const fixture = TestBed.createComponent(RouteManagementComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.reassign('route_1', 'truck_2');
    expect(routeServiceSpy.reassignRoute).toHaveBeenCalledWith('route_1', { newTruckId: 'truck_2' });
  });

  it('requestReassign() sets pendingAction and does NOT call the service', async () => {
    const fixture = TestBed.createComponent(RouteManagementComponent);
    await fixture.whenStable();

    fixture.componentInstance.requestReassign('route_1', 'truck_2');

    const pending = fixture.componentInstance.pendingAction();
    expect(pending).toEqual({ kind: 'reassign', routeId: 'route_1', newTruckId: 'truck_2' });
    expect(routeServiceSpy.reassignRoute).not.toHaveBeenCalled();
  });

  it('confirmPending() after requestReassign calls reassignRoute and clears pendingAction', async () => {
    const fixture = TestBed.createComponent(RouteManagementComponent);
    await fixture.whenStable();

    fixture.componentInstance.requestReassign('route_1', 'truck_2');
    fixture.componentInstance.confirmPending();

    expect(routeServiceSpy.reassignRoute).toHaveBeenCalledWith('route_1', { newTruckId: 'truck_2' });
    expect(fixture.componentInstance.pendingAction()).toBeNull();
  });

  it('cancelPending() after requestReassign does not call the service and clears pendingAction', async () => {
    const fixture = TestBed.createComponent(RouteManagementComponent);
    await fixture.whenStable();

    fixture.componentInstance.requestReassign('route_1', 'truck_2');
    fixture.componentInstance.cancelPending();

    expect(routeServiceSpy.reassignRoute).not.toHaveBeenCalled();
    expect(fixture.componentInstance.pendingAction()).toBeNull();
  });

  it('requestStatus("completed") sets pendingAction and does NOT call the service', async () => {
    const fixture = TestBed.createComponent(RouteManagementComponent);
    await fixture.whenStable();

    fixture.componentInstance.requestStatus('route_1', 'completed');

    const pending = fixture.componentInstance.pendingAction();
    expect(pending).toEqual({ kind: 'status', routeId: 'route_1', status: 'completed' });
    expect(routeServiceSpy.updateRoute).not.toHaveBeenCalled();
  });

  it('requestStatus("cancelled") sets pendingAction and does NOT call the service', async () => {
    const fixture = TestBed.createComponent(RouteManagementComponent);
    await fixture.whenStable();

    fixture.componentInstance.requestStatus('route_1', 'cancelled');

    const pending = fixture.componentInstance.pendingAction();
    expect(pending).toEqual({ kind: 'status', routeId: 'route_1', status: 'cancelled' });
    expect(routeServiceSpy.updateRoute).not.toHaveBeenCalled();
  });

  it('confirmPending() after requestStatus calls updateRoute and clears pendingAction', async () => {
    const fixture = TestBed.createComponent(RouteManagementComponent);
    await fixture.whenStable();

    fixture.componentInstance.requestStatus('route_1', 'completed');
    fixture.componentInstance.confirmPending();

    expect(routeServiceSpy.updateRoute).toHaveBeenCalledWith('route_1', { status: 'completed' });
    expect(fixture.componentInstance.pendingAction()).toBeNull();
  });

  it('requestStatus("in-progress") calls updateRoute directly without setting pendingAction', async () => {
    const fixture = TestBed.createComponent(RouteManagementComponent);
    await fixture.whenStable();

    fixture.componentInstance.requestStatus('route_1', 'in-progress');

    expect(fixture.componentInstance.pendingAction()).toBeNull();
    expect(routeServiceSpy.updateRoute).toHaveBeenCalledWith('route_1', { status: 'in-progress' });
  });

  it('requestStatus("assigned") calls updateRoute directly without setting pendingAction', async () => {
    const fixture = TestBed.createComponent(RouteManagementComponent);
    await fixture.whenStable();

    fixture.componentInstance.requestStatus('route_1', 'assigned');

    expect(fixture.componentInstance.pendingAction()).toBeNull();
    expect(routeServiceSpy.updateRoute).toHaveBeenCalledWith('route_1', { status: 'assigned' });
  });

  it('shows confirm-bar and hides actions when pendingAction matches the route', async () => {
    isLoaded.set(true);
    routeList.set([mockRoute]);
    const fixture = TestBed.createComponent(RouteManagementComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.requestReassign('route_1', 'truck_2');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.confirm-bar')).not.toBeNull();
    expect(el.querySelector('.route-item__actions')).toBeNull();
  });

  it('clicking Cancel in confirm-bar hides the bar and restores action controls', async () => {
    isLoaded.set(true);
    routeList.set([mockRoute]);
    const fixture = TestBed.createComponent(RouteManagementComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.requestStatus('route_1', 'cancelled');
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.confirm-bar__cancel-btn')
      ?.click();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.confirm-bar')).toBeNull();
    expect(el.querySelector('.route-item__actions')).not.toBeNull();
    expect(routeServiceSpy.updateRoute).not.toHaveBeenCalled();
  });
});
