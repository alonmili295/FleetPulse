import { Injectable, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SseClient } from '../../core/realtime/sse-client';
import { FleetService } from '../fleet/fleet.service';
import { FleetStore } from '../fleet/fleet.store';
import { ConnectionStore } from '../fleet/connection.store';
import { TelemetryStore } from './telemetry.store';
import { LogService } from '../../core/logging/log.service';
import { normalize } from './normalize';
import { orderGuard } from './order-guard';
import { BatchProcessor } from './batch-processor';
import type { SseMessage, UnknownSseMessage } from '../../shared/models/sse.model';
import type { TruckReading } from '../../shared/models/telemetry.model';

const SCOPE = 'TelemetryPipeline';

@Injectable({ providedIn: 'root' })
export class TelemetryPipeline {
  private readonly sseClient = inject(SseClient);
  private readonly fleetService = inject(FleetService);
  private readonly fleetStore = inject(FleetStore);
  private readonly connectionStore = inject(ConnectionStore);
  private readonly telemetryStore = inject(TelemetryStore);
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
          const reading = normalize(raw);
          if (orderGuard(reading, this.telemetryStore.lastAcceptedTsFor(reading.truckId)) === 'ACCEPT') {
            this.telemetryStore.applyReading(reading);
            this.fleetStore.patchTruck(reading.truckId, livePatch(reading));
          }
        }
        break;

      case 'gps_batch': {
        const lastAcceptedTs = this.telemetryStore.lastAcceptedTsFor(msg.truckId);
        const { trail, latest } = BatchProcessor.collapse(msg.readings, lastAcceptedTs);
        if (latest !== null) {
          this.telemetryStore.applyTrail(msg.truckId, trail, latest);
          this.fleetStore.patchTruck(msg.truckId, livePatch(latest));
        }
        break;
      }

      case 'unknown':
        this.log.warn(SCOPE, `Unknown SSE frame: ${msg.raw.substring(0, 100)}`);
        break;
    }
  }
}

function livePatch(r: TruckReading) {
  return {
    location: r.location,
    speed: r.speed,
    heading: r.heading,
    fuel: r.fuel,
    engineTemp: r.engineTemp,
    status: r.status,
  };
}
