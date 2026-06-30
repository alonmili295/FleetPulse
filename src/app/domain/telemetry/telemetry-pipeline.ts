import { Injectable, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SseClient } from '../../core/realtime/sse-client';
import { FleetService } from '../fleet/fleet.service';
import { FleetStore } from '../fleet/fleet.store';
import { ConnectionStore } from '../fleet/connection.store';
import { TelemetryStore } from './telemetry.store';
import { TelemetryHealthStore } from '../observability/telemetry-health.store';
import { LogService } from '../../core/logging/log.service';
import { normalize } from './normalize';
import { orderGuard } from './order-guard';
import { BatchProcessor } from './batch-processor';
import { detectSpeedAnomaly } from './speed-anomaly-detector';
import { detectFuelGlitch } from './fuel-glitch-detector';
import type { SseMessage, UnknownSseMessage } from '../../shared/models/sse.model';
import type { TruckReading } from '../../shared/models/telemetry.model';
import type { TruckListItem } from '../../shared/models/truck.model';

const SCOPE = 'TelemetryPipeline';

@Injectable({ providedIn: 'root' })
export class TelemetryPipeline {
  private readonly sseClient = inject(SseClient);
  private readonly fleetService = inject(FleetService);
  private readonly fleetStore = inject(FleetStore);
  private readonly connectionStore = inject(ConnectionStore);
  private readonly telemetryStore = inject(TelemetryStore);
  private readonly telemetryHealthStore = inject(TelemetryHealthStore);
  private readonly log = inject(LogService);
  // Captured at root-service construction so start() is safe to call from any context.
  private readonly destroyRef = inject(DestroyRef);

  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    this.sseClient.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        switch (event.kind) {
          case 'open':
            this.connectionStore.markConnecting();
            break;

          case 'error':
            this.connectionStore.markDisconnected();
            break;

          case 'message':
            this.handleMessage(event.message);
            break;
        }
      });
  }

  private handleMessage(msg: SseMessage | UnknownSseMessage): void {
    switch (msg.type) {
      case 'connected':
        this.connectionStore.markConnected();
        this.fleetService.load().subscribe({
          next: fleet => this.fleetStore.setFleet(fleet),
          error: err => this.log.error(SCOPE, 'Fleet re-baseline failed', err),
        });
        break;

      case 'heartbeat':
        this.connectionStore.markHeartbeat();
        break;

      case 'telemetry':
        for (const raw of msg.readings) {
          const normalized = normalize(raw);
          if (orderGuard(normalized, this.telemetryStore.lastAcceptedTsFor(normalized.truckId)) === 'ACCEPT') {
            const prev = this.telemetryStore.latestFor(normalized.truckId);
            const withSpeed = detectSpeedAnomaly(normalized, prev?.displaySpeed);
            const annotated = detectFuelGlitch(withSpeed, prev?.displayFuel);
            this.telemetryStore.applyReading(annotated);
            this.fleetStore.patchTruck(annotated.truckId, livePatch(annotated));
          } else {
            this.telemetryHealthStore.incrementDropped();
          }
        }
        break;

      case 'gps_batch': {
        const lastAcceptedTs = this.telemetryStore.lastAcceptedTsFor(msg.truckId);
        const droppedCount = msg.readings.filter(r => r.timestamp <= lastAcceptedTs).length;
        if (droppedCount > 0) {
          this.telemetryHealthStore.incrementDropped(droppedCount);
        }
        const { trail, latest } = BatchProcessor.collapse(msg.readings, lastAcceptedTs);
        if (latest !== null) {
          const prevReading = this.telemetryStore.latestFor(msg.truckId);
          let prevDisplaySpeed: number | null | undefined = prevReading?.displaySpeed;
          let prevDisplayFuel: number | undefined = prevReading?.displayFuel;

          const annotatedTrail = trail.map(r => {
            const withSpeed = detectSpeedAnomaly(r, prevDisplaySpeed);
            if (!withSpeed.speedSensorError && withSpeed.displaySpeed != null) {
              prevDisplaySpeed = withSpeed.displaySpeed;
            }
            const annotated = detectFuelGlitch(withSpeed, prevDisplayFuel);
            if (!annotated.fuelGlitch) prevDisplayFuel = annotated.displayFuel;
            return annotated;
          });

          const annotatedLatest = annotatedTrail[annotatedTrail.length - 1];
          this.telemetryStore.applyTrail(msg.truckId, annotatedTrail, annotatedLatest);
          this.fleetStore.patchTruck(msg.truckId, livePatch(annotatedLatest));
        }
        break;
      }

      case 'unknown':
        this.log.warn(SCOPE, `Unknown SSE frame: ${msg.raw.substring(0, 100)}`);
        break;
    }
  }
}

function livePatch(r: TruckReading): Partial<TruckListItem> {
  return {
    location: r.location,
    heading: r.heading,
    engineTemp: r.engineTemp,
    status: r.status,
    ...(typeof r.displaySpeed === 'number' ? { speed: r.displaySpeed } : {}),
    ...(typeof r.displayFuel === 'number' ? { fuel: r.displayFuel } : {}),
  };
}
