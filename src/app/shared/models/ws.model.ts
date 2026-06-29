// shared/models — WebSocket message discriminated unions from SERVER_ANALYSIS §8; used by P6 (WebSocketClient, PresenceStore), P5 (RoutesStore). No socket lifecycle or send queue here.

import type { Route } from './route.model';
import type { Alert } from './alert.model';

// ── Client → Server ─────────────────────────────────────────────────────────────

export type WsClientMsg =
  | { readonly type: 'register_dispatcher'; readonly dispatcherId?: string; readonly name?: string }
  | { readonly type: 'ping' }
  | { readonly type: 'viewing_truck'; readonly truckId: string };

// ── Server → Client ─────────────────────────────────────────────────────────────

export type WsServerMsg =
  | { readonly type: 'registered'; readonly dispatcherId: string }
  | { readonly type: 'pong'; readonly timestamp: number }
  | { readonly type: 'dispatcher_joined'; readonly dispatcherId: string; readonly name: string; readonly activeDispatchers: number; readonly timestamp: number }
  | { readonly type: 'dispatcher_left'; readonly dispatcherId: string; readonly activeDispatchers: number; readonly timestamp: number }
  | { readonly type: 'dispatcher_viewing'; readonly dispatcherId: string; readonly truckId: string; readonly timestamp: number }
  | { readonly type: 'route_assigned'; readonly route: Route; readonly truckId: string; readonly assignedBy: string; readonly truckVersion: number; readonly timestamp: number }
  | { readonly type: 'route_updated'; readonly route: Route; readonly updatedBy: string; readonly timestamp: number }
  | { readonly type: 'route_reassigned'; readonly route: Route; readonly oldTruckId: string; readonly newTruckId: string; readonly reassignedBy: string; readonly timestamp: number }
  | { readonly type: 'truck_alert'; readonly alert: Alert }
  | { readonly type: 'fleet_reset'; readonly timestamp: number }
  | { readonly type: 'error'; readonly message: string };

/** The decoder produces this type on a successful server→client decode. */
export type WsMessage = WsServerMsg;

/** Produced by the decoder when the frame is malformed JSON or the type is not in the server→client set. */
export interface UnknownWsMessage {
  readonly type: 'unknown';
  readonly raw: string;
}
