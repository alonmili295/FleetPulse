import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FleetStore } from '../../domain/fleet/fleet.store';
import { TelemetryStore } from '../../domain/telemetry/telemetry.store';
import { RoutesStore } from '../../domain/routes/routes.store';
import { PresenceStore } from '../../domain/presence/presence.store';
import { AlertsStore } from '../../domain/alerts/alerts.store';
import { VehicleDetailService } from '../../domain/vehicle-detail/vehicle-detail.service';
import { SelectedVehicleStore } from '../../domain/vehicle-selection/selected-vehicle.store';
import type { AlertSeverity } from '../../shared/models/alert.model';

@Component({
  selector: 'app-vehicle-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, DatePipe],
  templateUrl: './vehicle-detail.html',
  styleUrl: './vehicle-detail.css',
})
export class VehicleDetailComponent {
  protected readonly selectedVehicleStore = inject(SelectedVehicleStore);
  protected readonly vehicleDetailService = inject(VehicleDetailService);

  private readonly fleetStore = inject(FleetStore);
  private readonly telemetryStore = inject(TelemetryStore);
  private readonly routesStore = inject(RoutesStore);
  private readonly presenceStore = inject(PresenceStore);
  private readonly alertsStore = inject(AlertsStore);

  protected readonly truck = computed(() => {
    const id = this.selectedVehicleStore.selectedTruckId();
    return id ? this.fleetStore.truckById(id) : null;
  });

  protected readonly reading = computed(() => {
    const id = this.selectedVehicleStore.selectedTruckId();
    return id ? this.telemetryStore.latestFor(id) : null;
  });

  protected readonly route = computed(() => {
    const t = this.truck();
    if (!t) return null;
    if (t.currentRouteId) {
      const r = this.routesStore.routeById(t.currentRouteId);
      if (r) return r;
    }
    return this.routesStore.routeList().find(
      r => r.truckId === t.id && (r.status === 'assigned' || r.status === 'in-progress'),
    ) ?? null;
  });

  protected readonly viewers = computed(() => {
    const id = this.selectedVehicleStore.selectedTruckId();
    return id ? this.presenceStore.viewersForTruck(id) : [];
  });

  protected readonly alerts = computed(() => {
    const id = this.selectedVehicleStore.selectedTruckId();
    return id ? this.alertsStore.alertsForTruck(id).slice(0, 10) : [];
  });

  protected readonly mileage = computed(() => {
    const id = this.selectedVehicleStore.selectedTruckId();
    return id ? this.vehicleDetailService.mileageFor(id) : null;
  });

  protected readonly speedPct = computed(() => {
    const r = this.reading();
    const t = this.truck();
    if (!t) return 0;
    const speed = r?.displaySpeed ?? t.speed;
    return Math.min(100, Math.round(((speed ?? 0) / 120) * 100));
  });

  protected readonly fuelPct = computed(() => {
    const r = this.reading();
    const t = this.truck();
    if (!t) return 0;
    return Math.round(r?.displayFuel ?? t.fuel);
  });

  protected readonly tempPct = computed(() => {
    const r = this.reading();
    const t = this.truck();
    if (!t) return 0;
    const temp = r?.engineTemp ?? t.engineTemp;
    return Math.min(100, Math.round((temp / 150) * 100));
  });

  protected readonly alertMsg = signal('');
  protected readonly alertSev = signal<AlertSeverity>('info');
  protected readonly alertSending = signal(false);
  protected readonly alertError = signal<string | null>(null);

  protected readonly canSendAlert = computed(() =>
    this.alertMsg().trim().length > 0 && !this.alertSending(),
  );

  constructor() {
    effect(() => {
      const id = this.selectedVehicleStore.selectedTruckId();
      if (id) {
        this.vehicleDetailService.loadDetail(id);
      }
    });
  }

  protected close(): void {
    this.selectedVehicleStore.clearSelection();
  }

  protected submitAlert(event: Event): void {
    event.preventDefault();
    const id = this.selectedVehicleStore.selectedTruckId();
    const msg = this.alertMsg().trim();
    if (!id || !msg) return;

    this.alertSending.set(true);
    this.alertError.set(null);

    this.vehicleDetailService.sendAlert(id, { message: msg, severity: this.alertSev() }).subscribe(result => {
      this.alertSending.set(false);
      if (result.kind === 'success') {
        this.alertMsg.set('');
        this.alertSev.set('info');
      } else {
        this.alertError.set(result.error.message);
      }
    });
  }
}
