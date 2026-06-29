import type { RawReading, TruckReading } from '../../shared/models/telemetry.model';

/** Promotes a raw SSE reading to a pipeline-annotated TruckReading.
 *  Anomaly fields (speedSensorError, fuelGlitch, etc.) are populated by
 *  anomaly detectors in P4 — intentionally absent here. */
export function normalize(raw: RawReading): TruckReading {
  return { ...raw };
}
