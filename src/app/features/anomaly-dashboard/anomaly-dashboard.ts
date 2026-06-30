import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FleetStore } from '../../domain/fleet/fleet.store';
import { TelemetryStore } from '../../domain/telemetry/telemetry.store';
import { SelectedVehicleStore } from '../../domain/vehicle-selection/selected-vehicle.store';
import type { TruckListItem } from '../../shared/models/truck.model';
import type { TruckReading } from '../../shared/models/telemetry.model';

export type AnomalyType = 'speed' | 'fuel' | 'both';

export interface AnomalyRow {
  readonly truck: TruckListItem;
  readonly reading: TruckReading;
  readonly anomalyType: AnomalyType;
}

@Component({
  selector: 'app-anomaly-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe],
  templateUrl: './anomaly-dashboard.html',
  styleUrl: './anomaly-dashboard.css',
})
export class AnomalyDashboardComponent {
  private readonly fleetStore           = inject(FleetStore);
  private readonly telemetryStore       = inject(TelemetryStore);
  private readonly selectedVehicleStore = inject(SelectedVehicleStore);

  protected readonly anomalyRows = computed<AnomalyRow[]>(() => {
    const trucksMap = this.telemetryStore.trucks();
    return this.fleetStore.truckList().flatMap(truck => {
      const reading = trucksMap.get(truck.id)?.latest;
      if (!reading?.speedSensorError && !reading?.fuelGlitch) return [];
      const anomalyType: AnomalyType =
        reading.speedSensorError && reading.fuelGlitch ? 'both'
        : reading.speedSensorError ? 'speed'
        : 'fuel';
      return [{ truck, reading, anomalyType }];
    });
  });

  protected readonly totalCount      = computed(() => this.anomalyRows().length);
  protected readonly speedErrCount   = computed(() => this.anomalyRows().filter(r => r.anomalyType !== 'fuel').length);
  protected readonly fuelGlitchCount = computed(() => this.anomalyRows().filter(r => r.anomalyType !== 'speed').length);

  protected selectTruck(id: string): void {
    this.selectedVehicleStore.selectTruck(id);
  }

  protected onRowKey(event: KeyboardEvent, id: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectedVehicleStore.selectTruck(id);
    }
  }
}
