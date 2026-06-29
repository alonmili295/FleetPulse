// shared/models — Dispatcher presence contract from SERVER_ANALYSIS §8; used by P6 (PresenceStore, PresenceService). Ghost-handling and TTL logic live in P6, not here.

export interface Dispatcher {
  readonly id: string;
  readonly name: string;
  readonly connectedAt?: number;
}

/** Per-dispatcher viewing state stored in PresenceStore (P6). Drives the viewing-TTL pruning (DP-5). */
export interface ViewingState {
  readonly truckId: string;
  readonly ts: number;
}
