import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Dashboard shell (Phase P0 — scaffold only).
 *
 * Owns the top-level layout and, in later phases, will orchestrate the feature
 * regions and host the connection banner (ARCHITECTURE §9). For P0 it renders a
 * static shell with placeholder sections only — no services, no transports, no data.
 */
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardComponent {
  protected readonly title = 'FleetPulse';
  protected readonly subtitle = 'Real-Time Fleet Management Dashboard';

  /** Placeholder regions only; each is wired up in a later implementation phase. */
  protected readonly sections: ReadonlyArray<{ id: string; title: string; note: string }> = [
    { id: 'fleet-overview', title: 'Fleet Overview', note: 'Live map & truck list (Phase P3)' },
    { id: 'vehicle-detail', title: 'Vehicle Detail', note: 'Gauges, route & alerts (Phase P7)' },
    { id: 'routes', title: 'Routes', note: 'Assignment, locking & conflicts (Phase P5)' },
    { id: 'dispatchers', title: 'Dispatchers', note: 'Presence & collaboration (Phase P6)' },
    { id: 'observability', title: 'Observability', note: 'Metrics & anomalies (Phase P8)' },
  ];
}
