import type { TruckReading } from '../../shared/models/telemetry.model';

export function detectSpeedAnomaly(
  reading: TruckReading,
  lastValidSpeed: number | null | undefined,
): TruckReading {
  if (reading.speed >= 999) {
    return { ...reading, speedSensorError: true, displaySpeed: lastValidSpeed ?? null };
  }
  return { ...reading, speedSensorError: false, displaySpeed: reading.speed };
}
