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

- **334 tests passing** across 34 test files
- **Production build successful** — no errors, no warnings (main bundle 470 kB / 121 kB gzipped)
- **`mock-server/server.js` unchanged** — verified via `git diff -- mock-server/server.js` (empty diff)

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
