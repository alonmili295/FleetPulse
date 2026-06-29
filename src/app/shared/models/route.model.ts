// shared/models — Route contract from SERVER_ANALYSIS §6; used by P5 (RoutesStore, RouteService, ConflictResolver), P6 (WS broadcasts). No version cache or conflict logic here.

import type { TruckId } from './truck.model';

export type RouteStatus = 'assigned' | 'in-progress' | 'completed' | 'cancelled';

/** Full route object — shape shared by POST 201, PATCH 200, PUT 200, and GET /api/routes entries. */
export interface Route {
  readonly id: string;
  readonly truckId: TruckId;
  readonly destination: string;
  readonly priority: string;
  readonly notes: string;
  readonly status: RouteStatus;
  readonly assignedBy: string;
  readonly assignedAt: number;
  readonly _version: number;
  readonly lastModifiedBy?: string;
  readonly lastModifiedAt?: number;
  readonly reassignedBy?: string;
  readonly reassignedAt?: number;
}

/** POST /api/routes request body (SERVER_ANALYSIS §5). */
export interface CreateRouteBody {
  readonly truckId: TruckId;
  readonly destination: string;
  readonly priority?: string;
  readonly notes?: string;
}

/** PATCH /api/routes/:routeId request body — all fields optional per server. */
export interface PatchRouteBody {
  readonly status?: RouteStatus;
  readonly notes?: string;
  readonly priority?: string;
}

/** PUT /api/routes/:routeId/reassign request body. */
export interface ReassignRouteBody {
  readonly newTruckId: TruckId;
}
