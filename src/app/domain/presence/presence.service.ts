import { Injectable, OnDestroy, effect, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { APP_CONFIG } from '../../core/config/app-config';
import { WsClient } from '../../core/realtime/ws-client.service';
import { PresenceStore } from './presence.store';
import { RoutesStore } from '../routes/routes.store';
import { FleetStore } from '../fleet/fleet.store';
import type { WsMessage } from '../../shared/models/ws.model';

const DISPATCHER_ID = 'dispatcher_web';
const DISPATCHER_NAME = 'Web Dispatcher';
const PING_INTERVAL_MS = 30_000;

/**
 * Orchestrates the WebSocket connection for dispatcher presence and route broadcasts.
 * Owns registration, ping scheduling, and message routing.
 * WsClient stays transport-only; PresenceStore stays pure state.
 */
@Injectable({ providedIn: 'root' })
export class PresenceService implements OnDestroy {
  private readonly config = inject(APP_CONFIG);
  private readonly wsClient = inject(WsClient);
  private readonly presenceStore = inject(PresenceStore);
  private readonly routesStore = inject(RoutesStore);
  private readonly fleetStore = inject(FleetStore);

  private started = false;
  private connSub: Subscription | undefined;
  private pingHandle: ReturnType<typeof setInterval> | undefined;

  constructor() {
    // Mirror WsClient transport state into PresenceStore so the UI can read WS state without
    // depending on the transport layer. Also handles unexpected disconnects: resets started
    // and cleans up subscriptions so connect() can be called again safely.
    effect(() => {
      const state = this.wsClient.state();
      this.presenceStore.setWsState(state);

      if (state === 'disconnected') {
        this.started = false;
        this.clearPing();
        this.cleanupConnectionSubscriptions();
      }
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
    this.clearPing();
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

  private handleMessage(msg: WsMessage): void {
    switch (msg.type) {
      case 'registered':
        this.presenceStore.setSelf(msg.dispatcherId);
        this.startPing();
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

      // Intentionally ignored: pong, fleet_reset, truck_alert, error, dispatcher_viewing
    }
  }
}
