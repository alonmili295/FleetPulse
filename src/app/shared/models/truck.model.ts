// shared/models — pure TS types; used by P2 (FleetStore), P3 (fleet-map, fleet-list). No services, I/O, or state.

export type TruckId = string;
export type TruckStatus = 'active' | 'idle' | 'maintenance';

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/** Truck shape returned by GET /api/fleet (strips mileage and lastUpdate). */
export interface TruckListItem {
  readonly id: TruckId;
  readonly name: string;
  readonly status: TruckStatus;
  readonly location: LatLng;
  readonly speed: number;
  readonly heading: number;
  readonly fuel: number;
  readonly engineTemp: number;
  readonly currentRouteId: string | null;
  readonly _version: number;
}

/** Full detail from GET /api/fleet/:truckId — adds mileage and lastUpdate. */
export interface TruckDetail extends TruckListItem {
  readonly mileage: number;
  readonly lastUpdate: number;
}
