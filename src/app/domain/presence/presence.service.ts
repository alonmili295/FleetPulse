import { Injectable, OnDestroy, effect, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { APP_CONFIG } from '../../core/config/app-config';
import { WsClient } from '../../core/realtime/ws-client.service';
import { PresenceStore } from './presence.store';
import { RoutesStore } from '../routes/routes.store';
import { FleetStore } from '../fleet/fleet.store';
import { SelectedVehicleStore } from '../vehicle-selection/selected-vehicle.store';
import { AlertsStore } from '../alerts/alerts.store';
import type { WsMessage } from '../../shared/models/ws.model';

const DISPATCHER_ID = 'dispatcher_web';
const DISPATCHER_NAME = 'Web Dispatcher';
const PING_INTERVAL_MS = 30_000;
const PRUNE_INTERVAL_MS = 10_000;
const VIEWING_TTL_MS = 30_000;

/**
 * Orchestrates the WebSocket connection for dispatcher presence and route broadcasts.
 * Owns registration, ping scheduling, stale-viewer pruning, and message routing.
 * WsClient stays transport-only; PresenceStore stays pure state.
 */
@Injectable({ providedIn: 'root' })
export class PresenceService implements OnDestroy {
  private readonly config = inject(APP_CONFIG);
  private readonly wsClient = inject(WsClient);
  private readonly presenceStore = inject(PresenceStore);
  private readonly routesStore = inject(RoutesStore);
  private readonly fleetStore = inject(FleetStore);
  private readonly selectedVehicleStore = inject(SelectedVehicleStore);
  private readonly alertsStore = inject(AlertsStore);

  private started = false;
  private connSub: Subscription | undefined;
  private pingHandle: ReturnType<typeof setInterval> | undefined;
  private pruneHandle: ReturnType<typeof setInterval> | undefined;
  private lastSentViewingTruckId: string | null = null;

  constructor() {
    // Mirror WsClient transport state into PresenceStore. On disconnect, reset all
    // per-session state (selfId, dispatchers, lastSentViewingTruckId) so that a
    // reconnect cannot send viewing_truck with a stale selfId from a prior session.
    effect(() => {
      const state = this.wsClient.state();
      this.presenceStore.setWsState(state);

      if (state === 'disconnected') {
        this.started = false;
        this.lastSentViewingTruckId = null;
        this.clearPing();
        this.clearPruning();
        this.cleanupConnectionSubscriptions();
        this.presenceStore.resetPresence();
      }
    });

    // Send viewing_truck when all three conditions are met: a truck is selected,
    // the socket is connected, and registration is confirmed (selfId is non-null).
    // Resetting lastSentViewingTruckId on disconnect/registered ensures the truck
    // is re-sent after reconnect even if the signal value did not change.
    effect(() => {
      this.maybeSendViewingTruck();
    });
  }

  connect(): void {
    if (this.started) return;
    this.started = true;

    this.wsClient.connect(this.config.wsUrl);

    this.connSub = new Subscription();

    this.connSub.add(
      this.wsClient.open$.subscribe(() => {
        this.wsClient.send({
          type: 'register_dispatcher',
          dispatcherId: DISPATCHER_ID,
          name: DISPATCHER_NAME,
        });
      })
    );

    this.connSub.add(
      this.wsClient.messages$.subscribe(msg => this.handleMessage(msg))
    );
  }

  close(): void {
    this.started = false;
    this.lastSentViewingTruckId = null;
    this.clearPing();
    this.clearPruning();
    this.cleanupConnectionSubscriptions();
    this.wsClient.close();
  }

  ngOnDestroy(): void {
    this.close();
  }

  private cleanupConnectionSubscriptions(): void {
    this.connSub?.unsubscribe();
    this.connSub = undefined;
  }

  private startPing(): void {
    this.clearPing();
    this.pingHandle = setInterval(() => {
      this.wsClient.send({ type: 'ping' });
    }, PING_INTERVAL_MS);
  }

  private clearPing(): void {
    if (this.pingHandle !== undefined) {
      clearInterval(this.pingHandle);
      this.pingHandle = undefined;
    }
  }

  private startPruning(): void {
    this.clearPruning();
    this.pruneHandle = setInterval(() => {
      this.presenceStore.pruneStaleViewers(Date.now(), VIEWING_TTL_MS);
    }, PRUNE_INTERVAL_MS);
  }

  private clearPruning(): void {
    if (this.pruneHandle !== undefined) {
      clearInterval(this.pruneHandle);
      this.pruneHandle = undefined;
    }
  }

  private maybeSendViewingTruck(): void {
    const truckId = this.selectedVehicleStore.selectedTruckId();
    const state = this.wsClient.state();
    const selfId = this.presenceStore.selfId();

    if (!truckId || state !== 'connected' || !selfId) return;
    if (truckId === this.lastSentViewingTruckId) return;

    this.wsClient.send({ type: 'viewing_truck', truckId });
    this.lastSentViewingTruckId = truckId;
  }

  private handleMessage(msg: WsMessage): void {
    switch (msg.type) {
      case 'registered':
        // Reset before setSelf so the effect never sees a stale lastSentViewingTruckId
        // when it reacts to the selfId signal changing.
        this.lastSentViewingTruckId = null;
        this.presenceStore.setSelf(msg.dispatcherId);
        this.startPing();
        this.startPruning();
        break;

      case 'dispatcher_joined':
        this.presenceStore.addDispatcher({
          id: msg.dispatcherId,
          name: msg.name,
          joinedAt: msg.timestamp,
        });
        this.presenceStore.setActiveCount(msg.activeDispatchers);
        break;

      case 'dispatcher_left':
        this.presenceStore.removeDispatcher(msg.dispatcherId);
        this.presenceStore.setActiveCount(msg.activeDispatchers);
        break;

      case 'dispatcher_viewing':
        this.presenceStore.setDispatcherViewing({
          dispatcherId: msg.dispatcherId,
          truckId: msg.truckId,
          timestamp: msg.timestamp,
        });
        break;

      case 'truck_alert':
        this.alertsStore.addAlert(msg.alert);
        break;

      case 'route_assigned':
        this.routesStore.upsertRoute(msg.route);
        this.fleetStore.patchTruck(msg.truckId, {
          currentRouteId: msg.route.id,
          _version: msg.truckVersion,
        });
        break;

      case 'route_updated':
        this.routesStore.upsertRoute(msg.route);
        break;

      case 'route_reassigned':
        this.routesStore.upsertRoute(msg.route);
        this.fleetStore.patchTruck(msg.oldTruckId, { currentRouteId: null });
        this.fleetStore.patchTruck(msg.newTruckId, { currentRouteId: msg.route.id });
        break;

      // Intentionally ignored: pong, fleet_reset, error
    }
  }
}
