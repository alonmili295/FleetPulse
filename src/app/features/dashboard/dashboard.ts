import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, FleetMapComponent, RouteManagementComponent, VehicleDetailComponent],
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
