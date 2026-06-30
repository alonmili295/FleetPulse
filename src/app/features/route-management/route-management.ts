import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouteService, RouteOpResult } from '../../domain/routes/route.service';
import { RoutesStore } from '../../domain/routes/routes.store';
import { AuditLog } from '../../domain/routes/audit-log';
import { FleetStore } from '../../domain/fleet/fleet.store';
import type { RouteStatus } from '../../shared/models/route.model';

@Component({
  selector: 'app-route-management',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './route-management.html',
  styleUrl: './route-management.css',
})
export class RouteManagementComponent {
  protected readonly routesStore = inject(RoutesStore);
  protected readonly fleetStore = inject(FleetStore);
  protected readonly auditLog = inject(AuditLog);
  private readonly routeService = inject(RouteService);

  readonly statuses: RouteStatus[] = ['assigned', 'in-progress', 'completed', 'cancelled'];

  readonly newTruckId = signal('');
  readonly newDestination = signal('');
  readonly newPriority = signal('normal');
  readonly newNotes = signal('');
  readonly showAuditLog = signal(false);
  readonly createError = signal<string | null>(null);

  readonly #lastResults = signal(new Map<string, RouteOpResult>());

  readonly availableTrucks = computed(() =>
    this.fleetStore.truckList().filter(
      t => t.status !== 'maintenance' && t.currentRouteId === null,
    ),
  );

  availableTrucksForReassign(currentTruckId: string) {
    return this.fleetStore
      .truckList()
      .filter(
        t => t.status !== 'maintenance' && t.currentRouteId === null && t.id !== currentTruckId,
      );
  }

  truckName(truckId: string): string {
    return this.fleetStore.truckById(truckId)?.name ?? truckId;
  }

  getLastResult(routeId: string): RouteOpResult | undefined {
    return this.#lastResults().get(routeId);
  }

  loadRoutes(): void {
    this.routeService.loadRoutes().subscribe({ error: () => {} });
  }

  createRoute(): void {
    if (!this.newTruckId() || !this.newDestination()) return;
    this.createError.set(null);
    this.routeService
      .createRoute({
        truckId: this.newTruckId(),
        destination: this.newDestination(),
        priority: this.newPriority(),
        ...(this.newNotes() ? { notes: this.newNotes() } : {}),
      })
      .subscribe(result => {
        if (result.kind === 'success') {
          this.newTruckId.set('');
          this.newDestination.set('');
          this.newPriority.set('normal');
          this.newNotes.set('');
        } else if (result.kind === 'error') {
          this.createError.set(result.error.message);
        }
      });
  }

  updateStatus(routeId: string, statusValue: string): void {
    this.routeService
      .updateRoute(routeId, { status: statusValue as RouteStatus })
      .subscribe(result => {
        this.setLastResult(routeId, result);
      });
  }

  reassign(routeId: string, newTruckId: string): void {
    if (!newTruckId) return;
    this.routeService.reassignRoute(routeId, { newTruckId }).subscribe(result => {
      this.setLastResult(routeId, result);
    });
  }

  private setLastResult(routeId: string, result: RouteOpResult): void {
    this.#lastResults.update(map => {
      const next = new Map(map);
      next.set(routeId, result);
      return next;
    });
  }
}
