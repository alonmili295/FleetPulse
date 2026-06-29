import type { TruckReading } from '../../shared/models/telemetry.model';

export function detectFuelGlitch(
  reading: TruckReading,
  lastValidFuel: number | undefined,
): TruckReading {
  if (reading.fuel === 0) {
    return { ...reading, fuelGlitch: true, displayFuel: lastValidFuel };
  }
  return { ...reading, fuelGlitch: false, displayFuel: reading.fuel };
}
