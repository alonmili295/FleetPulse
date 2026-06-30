import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FleetStore } from '../../domain/fleet/fleet.store';
import { ConnectionStore } from '../../domain/fleet/connection.store';
import { TelemetryStore } from '../../domain/telemetry/telemetry.store';
import { TelemetryPipeline } from '../../domain/telemetry/telemetry-pipeline';
import { FleetMapComponent } from '../fleet-map/fleet-map';
import { RouteManagementComponent } from '../route-management/route-management';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, FleetMapComponent, RouteManagementComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardComponent {
  protected readonly title = 'FleetPulse';
  protected readonly subtitle = 'Real-Time Fleet Management Dashboard';

  protected readonly fleetStore = inject(FleetStore);
  protected readonly connectionStore = inject(ConnectionStore);
  protected readonly telemetryStore = inject(TelemetryStore);

  private readonly pipeline = inject(TelemetryPipeline);

  constructor() {
    this.pipeline.start();
  }
}
