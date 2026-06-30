import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ConnectionStore } from '../../domain/fleet/connection.store';
import { PresenceStore } from '../../domain/presence/presence.store';
import { FleetStore } from '../../domain/fleet/fleet.store';
import { TelemetryStore } from '../../domain/telemetry/telemetry.store';
import { AuditLog } from '../../domain/routes/audit-log';
import { TelemetryHealthStore } from '../../domain/observability/telemetry-health.store';

@Component({
  selector: 'app-observability-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  templateUrl: './observability-panel.html',
  styleUrl: './observability-panel.css',
})
export class ObservabilityPanelComponent {
  protected readonly connectionStore      = inject(ConnectionStore);
  protected readonly presenceStore        = inject(PresenceStore);
  protected readonly telemetryHealthStore = inject(TelemetryHealthStore);
  protected readonly auditLog             = inject(AuditLog);

  private readonly fleetStore     = inject(FleetStore);
  private readonly telemetryStore = inject(TelemetryStore);

  protected readonly anomalyCount = computed(() =>
    this.fleetStore.truckList().filter(t => {
      const r = this.telemetryStore.latestFor(t.id);
      return r?.speedSensorError || r?.fuelGlitch;
    }).length,
  );

  // AuditLog.append prepends, so entries()[0] is newest. slice(0,5) = 5 most recent.
  protected readonly recentAuditEntries = computed(() =>
    this.auditLog.entries().slice(0, 5),
  );
}
