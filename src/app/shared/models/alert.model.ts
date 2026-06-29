// shared/models — Alert contract from SERVER_ANALYSIS §6; used by P7 (AlertStore, AlertService). Bounded buffer and ingest logic live in P7, not here.

import type { TruckId } from './truck.model';

export type AlertSeverity = 'info' | 'warning' | 'critical';

/** Alert object from POST /api/fleet/:truckId/alert (201) and the `truck_alert` WS broadcast. */
export interface Alert {
  readonly id: string;
  readonly truckId: TruckId;
  readonly message: string;
  readonly severity: AlertSeverity | string; // server accepts any string; only defaults to 'info'
  readonly sentBy: string | undefined;       // optional — server may receive it as undefined
  readonly timestamp: number;
  readonly acknowledged: boolean;
}

/** POST /api/fleet/:truckId/alert request body. */
export interface SendAlertBody {
  readonly message?: string;
  readonly severity?: AlertSeverity | string;
}
