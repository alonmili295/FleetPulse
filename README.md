# FleetPulse

Real-Time Fleet Management Dashboard built with Angular 21.

The application connects to the provided read-only mock server to display live vehicle positions, telemetry, route assignments, dispatcher presence, and truck alerts — all in a single-page dashboard with no UI library dependencies.

## Requirements Implemented

| Phase | Feature |
|---|---|
| P0 | Project scaffold — Angular 21 standalone, strict TypeScript, custom CSS |
| P1 | Shared models, SSE/WS decoders, logging, error handling |
| P2 | REST fleet loading, 503 Retry-After handling, circuit breaker |
| P3 | SSE telemetry pipeline, live fleet list, connection banner |
| P4 | Speed/fuel anomaly detection and suppression |
| P5 | Leaflet fleet map with live positions and trail polylines |
| P6 | Route management — create, edit, reassign, conflict resolution |
| P7 | UI polish — CSS design system, responsive layout |
| P8 | WebSocket dispatcher presence and route broadcast handling |
| P9/P10 | Vehicle detail panel, dispatcher viewing indicators, `viewing_truck`, truck alert sending and `truck_alert` delivery |
| Bonus | Observability panel — SSE/WS health, heartbeat age, dropped-reading count, audit feed |
| Bonus | Anomaly dashboard — aggregated speed-sensor and fuel-glitch anomalies |
| Bonus | Critical route action confirmations — inline confirmation for reassign, complete, cancel |
| Bonus | Filterable fleet view — text/status/assignment/low-fuel filters, reset, result count, no-match state |

## Architecture

```
src/app/
  shared/       Pure TypeScript — models, decoders, utilities. No Angular imports.
  core/         Infrastructure — HTTP clients, SSE/WS transports, resilience, config.
  domain/       Angular signal stores and business rules. No UI.
  features/     Standalone UI components. Reads stores only — no transport logic.
```

Dependency direction is strict: `features → domain → core → shared`. No layer imports upward.

## Real-Time Design

### SSE Telemetry

`SseClient` (core) emits a discriminated-union stream (`open | error | message`). `TelemetryPipeline` routes SSE events into `TelemetryStore` and `FleetStore` after running them through `orderGuard`, `BatchProcessor`, and anomaly detectors.

### WebSocket Dispatcher Presence

`WsClient` (core) is transport-only — it sends and receives raw frames with no domain logic. `PresenceService` (domain) owns registration, ping scheduling, reconnect cleanup, dispatcher join/leave, viewing updates, route broadcasts, and truck alert routing. `fleet_reset`, `pong`, and server error frames are intentionally ignored in the current UI flow.

### `viewing_truck` Collaborative Cursor

When a dispatcher selects a truck, `PresenceService` sends `{ type: 'viewing_truck', truckId }` over the WebSocket. The server broadcasts the selection to all other dispatchers. `PresenceStore` tracks current viewers per truck via `setDispatcherViewing()`; `viewersForTruck(id)` returns the derived view model with label fallback. Stale viewer entries are pruned every 10 seconds (30-second TTL).

A critical lifecycle invariant: `selfId` is cleared on disconnect (`resetPresence()`), so a reconnect cannot send `viewing_truck` with a stale identity before the new `registered` message arrives.

### `truck_alert` Handling

`VehicleAlertApiService` sends alerts via `POST /api/fleet/:id/alert`. The server echoes the created alert back over WebSocket as a `truck_alert` broadcast. `AlertsStore` deduplicates by `alert.id` so the REST 201 response and the WS broadcast converge idempotently. The ring buffer is capped at 50 alerts.

## Resilience

| Mechanism | Where |
|---|---|
| 503 Retry-After | `FleetService` reads the `Retry-After` header and performs one scheduled retry for service-unavailable responses. |
| Circuit breaker | `CircuitBreaker` applies to fleet list loading and counts only service-unavailable failures; non-503 HTTP errors are mapped but do not open the circuit. `getTruck` bypasses the breaker. |
| Stale telemetry ordering guard | `orderGuard` drops readings with timestamps ≤ last accepted for that truck. |
| Speed 999 anomaly | `detectSpeedAnomaly` — sets `speedSensorError: true` and carries forward the last valid `displaySpeed`. |
| Fuel 0 glitch | `detectFuelGlitch` — sets `fuelGlitch: true` and carries forward the last valid `displayFuel`. |

Raw anomalous sensor values are never written to `FleetStore` or displayed in the UI.

## Features

**Fleet overview** — live list of all trucks with status badges, real-time speed/fuel/location. Speed anomaly shown as `—`, fuel glitch shown as carried-forward estimate with an `est.` indicator. Clicking a row opens the vehicle detail panel.

**Fleet map** — Leaflet map centred on Tel Aviv. Each truck is a `circleMarker`; historical GPS trail rendered as a polyline (≥ 2 points required). Popups built via DOM API — no innerHTML with server data.

**Route management** — create and assign routes with priority and destination. Edit assigned routes, reassign to a different truck, or cancel. Optimistic locking via `If-Match` header; 409 conflicts resolved by fetching the latest version and retrying. Maintenance trucks blocked from new assignments.

**Vehicle detail panel** — opens when a fleet item is selected. Displays speed/fuel/temperature gauges (CSS conic-gradient donuts), mileage (loaded on demand, in-flight request cancelled on truck change), active route card, and a 10-item recent alert list. Route lookup prefers `currentRouteId`; falls back to a scan for `assigned` or `in-progress` routes.

**Alert sending** — form in the vehicle detail panel. Sends `POST /api/fleet/:id/alert`. Submit button disabled when message is empty or whitespace. `AlertsStore` deduplicates so the WS broadcast does not create a duplicate entry.

**Dispatcher presence and viewing** — WebSocket presence indicator in the header (dot colour reflects connection state, active dispatcher count). When viewing a truck, other dispatchers who are also viewing the same truck appear as labelled chips in the detail panel. Viewer list pruned every 10 seconds.

**Observability panel** — runtime health panel showing SSE/WS connection state, heartbeat age, active dispatcher count, dropped stale telemetry count, anomaly count, fleet size, and recent audit events.

**Anomaly dashboard** — fleet-wide view of active speed-sensor errors and fuel glitches. Rows are clickable and keyboard-accessible, and selecting an anomaly focuses the matching truck in the vehicle detail panel.

**Critical route action confirmations** — inline confirmation step before critical route changes: reassignment, completion, and cancellation. Non-critical status changes remain direct.

**Filterable fleet view** — client-side filters for truck name/ID search, status, assignment state, and low-fuel trucks below 25%. The view shows a live “showing X of Y” count, a no-match empty state, and clears the selected truck whenever filters change so the Vehicle Detail panel resets instead of showing a hidden or irrelevant truck.

## Key Technical Decisions and Trade-offs

- **Angular standalone components with `OnPush` and signals** for stable, fine-grained UI and domain state — synchronous reads in templates, no NgModule ceremony.
- **RxJS at the transport boundaries** for HTTP/SSE/WS streams (retry, backoff, reconnect, `takeUntilDestroyed`); results are pushed into signals at the store edge.
- **Strict layering: `shared / core / domain / features`** with a one-directional dependency rule (`features → domain → core → shared`).
- **Clear layer ownership** — core owns infrastructure only (transports, HTTP, resilience), domain owns business orchestration (stores, anomaly classification, locking, presence), and features render UI only.
- **Custom CSS instead of Angular Material** to keep dependencies small and predictable, with a design-system variable set in `styles.css`.
- **FleetMap stays full-fleet based even when the fleet list is filtered** — filtering is a list-view concern; hiding map markers would obscure operational awareness.
- **Filter state is dashboard-local** and clears `SelectedVehicleStore` on every change, so the Vehicle Detail panel resets rather than showing a hidden or irrelevant truck.
- **Circuit breaker scoped to fleet loading only** — `getTruck` bypasses it so a single detail lookup is never blocked by a degraded fleet-list endpoint.
- **Alert deduplication by `alert.id`** so the REST 201 response and the WebSocket `truck_alert` broadcast merge into a single entry safely.

## Multi-dispatcher Conflict Handling

- **Route update conflicts use optimistic locking** via the `If-Match` header and explicit 409 conflict recovery.
- **On 409, the latest server state is fetched** and the route action can retry against the latest version, with the conflict surfaced to the dispatcher (who changed it, version delta).
- **Reassign, complete, and cancel are guarded by an inline confirmation** step before any mutation is dispatched.
- **WebSocket route broadcasts** (`route_assigned` / `route_updated` / `route_reassigned`) update local route and fleet state so all dispatchers converge on the same view.
- **Dispatcher presence/viewing state is tracked separately from route state**, so collaborative-viewing churn never interferes with route mutations.
- **Stale viewer cleanup** prunes viewers on a TTL, preventing ghost viewers after delayed or dropped disconnects.

## How to Run

Install dependencies:

```bash
npm install            # Angular client
npm run server:install # mock server (express, ws)
```

Start the mock server (port 3000):

```bash
npm run server
```

Start the Angular dev server (port 4200):

```bash
npm start
```

Or run both together:

```bash
npm run dev
```

Server endpoints:
- REST API: `http://localhost:3000/api`
- Telemetry SSE: `http://localhost:3000/api/telemetry/stream`
- WebSocket: `ws://localhost:3000/ws`

## Tests and Build

```bash
npm test       # Vitest + jsdom via Angular test runner
npm run build  # Production build to dist/fleetpulse
```

The mock server does not need to be running for tests.

## Validation

- **403 tests passing** across 37 test files
- **Production build succeeds** — existing size-budget warnings only
- **`mock-server/server.js` unchanged** — verified via `git diff -- mock-server/server.js` (empty diff)

## Known Issues and Limitations

- Fleet filtering is **client-side only** — it filters the already-loaded fleet, not a server query.
- Filtering the list **does not filter the map**; the map intentionally remains full-fleet.
- **No geofencing** implementation.
- **No command palette / keyboard shortcut** system.
- **Existing Angular size-budget warnings** remain in the production build.
- **Observability is in-app/runtime only**, not exported to an external monitoring backend.

## Improvements With More Time

- Map focus on a double-clicked fleet row.
- Geofencing zones and alerts.
- External observability / exported metrics.
- More advanced route table sorting and filtering.
- E2E tests for real multi-dispatcher sessions.
- Persisted dispatcher identity / session support.
- More detailed latency and events-per-second metrics.

## Notes

- **No UI libraries** — custom CSS only (design system variables in `styles.css`). No Angular Material, no component libraries.
- **Mock server read-only** — `mock-server/server.js` was never modified. Only a sibling `package.json` was added to install its dependencies.
- **Strict Angular standalone architecture** — all components are standalone with `ChangeDetectionStrategy.OnPush`. Signals for stable state; RxJS for transport streams. The boundary between them is at the store edge.
- **No innerHTML with server data** — all server-originated strings rendered via Angular template text binding or DOM `textContent`.

## Documentation

- `SPEC.md` — product and engineering specification with traceable requirement IDs
- `ARCHITECTURE.md` — layered architecture design and phased implementation plan
- `TEST_PLAN.md` — QA strategy and test mapping
- `PROMPTS.md` — AI usage journal and prompt history
