// shared/models — SSE reading contract; used by P2 (TelemetryPipeline, TelemetryStore). Annotation fields populated in P2, not here.

import type { TruckId, TruckStatus, LatLng } from './truck.model';

/** Raw reading from the SSE `telemetry` and `gps_batch` events (mirrors server.js sendTelemetrySSE). */
export interface RawReading {
  readonly truckId: TruckId;
  readonly location: LatLng;
  readonly speed: number;
  readonly heading: number;
  readonly fuel: number;
  readonly engineTemp: number;
  readonly status: TruckStatus;
  readonly timestamp: number;
  readonly _reordered?: boolean;   // Q5: timestamp backdated 3–8 s
  readonly _batch?: boolean;       // Q1: part of a gps_batch event
  readonly _batchIndex?: number;   // Q1: 0-based index within the batch
  readonly _batchTotal?: number;   // Q1: total readings in this batch
}

/**
 * Pipeline-annotated reading produced by TelemetryPipeline (P2).
 * The optional annotation fields below are populated by anomaly detectors — not set in P1.
 */
export interface TruckReading extends RawReading {
  // Q3 (speed sensor stuck at 999 km/h) — annotated by SpeedAnomalyDetector in P2
  readonly speedSensorError?: boolean;
  readonly displaySpeed?: number | null;

  // Q2 (fuel sensor glitch: reports 0 during braking) — annotated by FuelAnomalyDetector in P2
  readonly fuelGlitch?: boolean;
  readonly displayFuel?: number;
}
