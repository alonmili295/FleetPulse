import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FleetStore } from '../../domain/fleet/fleet.store';
import { ConnectionStore } from '../../domain/fleet/connection.store';
import { TelemetryStore } from '../../domain/telemetry/telemetry.store';
import { TelemetryPipeline } from '../../domain/telemetry/telemetry-pipeline';
import { PresenceService } from '../../domain/presence/presence.service';
import { PresenceStore } from '../../domain/presence/presence.store';
import { SelectedVehicleStore } from '../../domain/vehicle-selection/selected-vehicle.store';
import { FleetMapComponent } from '../fleet-map/fleet-map';
import { RouteManagementComponent } from '../route-management/route-management';
import { VehicleDetailComponent } from '../vehicle-detail/vehicle-detail';
import { ObservabilityPanelComponent } from '../observability/observability-panel';
import { AnomalyDashboardComponent } from '../anomaly-dashboard/anomaly-dashboard';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, FleetMapComponent, RouteManagementComponent, VehicleDetailComponent, ObservabilityPanelComponent, AnomalyDashboardComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardComponent {
  protected readonly title = 'FleetPulse';
  protected readonly subtitle = 'Real-Time Fleet Management Dashboard';

  protected readonly fleetStore = inject(FleetStore);
  protected readonly connectionStore = inject(ConnectionStore);
  protected readonly telemetryStore = inject(TelemetryStore);
  protected readonly presenceStore = inject(PresenceStore);
  protected readonly selectedVehicleStore = inject(SelectedVehicleStore);

  private readonly pipeline = inject(TelemetryPipeline);
  private readonly presenceService = inject(PresenceService);

  readonly filterText       = signal('');
  readonly filterStatus     = signal<'all' | 'active' | 'idle' | 'maintenance'>('all');
  readonly filterAssignment = signal<'all' | 'assigned' | 'unassigned'>('all');
  readonly lowFuelOnly      = signal(false);

  readonly filteredTruckList = computed(() => {
    const text       = this.filterText().trim().toLowerCase();
    const status     = this.filterStatus();
    const assignment = this.filterAssignment();
    const lowFuel    = this.lowFuelOnly();

    return this.fleetStore.truckList().filter(truck => {
      if (text && !truck.name.toLowerCase().includes(text) && !truck.id.toLowerCase().includes(text)) return false;
      if (status !== 'all' && truck.status !== status) return false;
      if (assignment === 'assigned'   && truck.currentRouteId === null) return false;
      if (assignment === 'unassigned' && truck.currentRouteId !== null) return false;
      if (lowFuel && truck.fuel >= 25) return false;
      return true;
    });
  });

  setFilterText(value: string): void {
    this.filterText.set(value);
    this.selectedVehicleStore.clearSelection();
  }

  setFilterStatus(value: 'all' | 'active' | 'idle' | 'maintenance'): void {
    this.filterStatus.set(value);
    this.selectedVehicleStore.clearSelection();
  }

  setFilterAssignment(value: 'all' | 'assigned' | 'unassigned'): void {
    this.filterAssignment.set(value);
    this.selectedVehicleStore.clearSelection();
  }

  setLowFuelOnly(value: boolean): void {
    this.lowFuelOnly.set(value);
    this.selectedVehicleStore.clearSelection();
  }

  resetFilters(): void {
    this.filterText.set('');
    this.filterStatus.set('all');
    this.filterAssignment.set('all');
    this.lowFuelOnly.set(false);
    this.selectedVehicleStore.clearSelection();
  }

  constructor() {
    this.pipeline.start();
    this.presenceService.connect();
  }

  protected selectTruck(id: string): void {
    this.selectedVehicleStore.selectTruck(id);
  }

  protected onFleetItemKey(event: KeyboardEvent, id: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectedVehicleStore.selectTruck(id);
    }
  }
}
