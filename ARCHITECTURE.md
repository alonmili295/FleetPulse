# FleetPulse — Architecture

**Status:** As-built — implemented and validated. §1–§38 are the original BMAD design record; **§39 (As-Built Architecture) documents what was actually implemented and is authoritative wherever it diverges from the design.**
**Role:** BMAD Architect (design) → Documentation Architect (as-built reconciliation)
**Companion to:** `SPEC.md` (requirements), `docs/bmad/SERVER_ANALYSIS.md` (API truth), `docs/bmad/SERVER_INTEGRATION_PLAN.md` (setup), `mock-server/server.js` (ground truth), `README.md` (as-built feature summary)

### Source-of-truth hierarchy

| Source | Authoritative for |
|--------|-------------------|
| `mock-server/server.js` | Final tie-breaker for any observable behaviour |
| `SPEC.md` | Requirements, IDs (FR/NFR/RM/DP/VD/OB/SQ/PF/T/AC), acceptance |
| `docs/bmad/SERVER_ANALYSIS.md` | API behaviour, payload shapes, the 8 quirks |
| `docs/bmad/SERVER_INTEGRATION_PLAN.md` | Scripts, URLs, do-not-change list |
| `docs/assignment/senior-test-4-assignment.html` | Business intent, evaluation weights |

Where this document and `server.js` disagree, **the server wins** and this document is corrected. The frontend adapts to the server; the server is never modified.

### Technology decisions (fixed)

| Concern | Choice |
|---------|--------|
| Framework | Angular with standalone components as the default structure |
| Language | TypeScript, `strict` mode + `strictTemplates` |
| UI/client state | Angular Signals (stable, synchronous, fine-grained) |
| Event streams | RxJS (SSE, WebSocket, debounce, retry, backoff) |
| REST | Angular `HttpClient` + typed interceptors |
| Telemetry transport | Native `EventSource` wrapped in an RxJS `Observable` |
| Dispatcher transport | Native `WebSocket` wrapped in an RxJS `Observable` |
| UI primitives | Custom CSS design system — **no Angular Material / CDK** (as-built; see §39) |
| Map | Leaflet |
| Global store | **None** — no NgRx, no Redux (see §34) |
| Backend / cache / DB | **None** — mock server only; no Redis (see §35) |

> **As-built note:** This table reflects the final implementation. The design phase initially considered Angular Material + CDK; the shipped client uses a custom CSS design system only. Where any §1–§38 reference assumes Material/CDK, dialog components, or a dedicated `MetricsStore`, see **§39** for what was actually built.

---

## 1. Architecture Overview

FleetPulse is a **single-page Angular dashboard** layered into four concentric rings:

```
┌──────────────────────────────────────────────────────────────────┐
│ FEATURES (smart components)  dashboard, fleet-map, vehicle-detail… │
│   - subscribe to stores (signals), render, dispatch user intents   │
├──────────────────────────────────────────────────────────────────┤
│ DOMAIN (stores + domain services)  fleet, telemetry, routes, disp. │
│   - signal-based stores hold canonical client state                │
│   - domain services own business rules (anomaly, locking, presence)│
├──────────────────────────────────────────────────────────────────┤
│ CORE INFRASTRUCTURE  api, realtime, resilience, observability, log │
│   - transport adapters (HttpClient, EventSource, WebSocket)        │
│   - cross-cutting: circuit breaker, retry, metrics, logging, errors│
├──────────────────────────────────────────────────────────────────┤
│ MOCK SERVER (unchanged)  REST + SSE + WS on :3000                  │
└──────────────────────────────────────────────────────────────────┘
```

**The central architectural idea (NFR-1):** a unidirectional pipeline.

```
transport (raw bytes)
   → decode (typed messages, discriminated unions)
      → normalize (canonical TruckReading)
         → anomaly filter (speed/fuel/order quirks)
            → store reducers (signals)
               → derived signals (computed)
                  → components (OnPush / signal reads)
```

Components never touch transports. Quirk-handling lives entirely in the pipeline (domain layer), so a new vehicle type or a new widget requires zero changes to ingestion — satisfying the assignment's extensibility test (20% weight) and **NFR-1**.

---

## 2. Design Goals

| Goal | Driver | Spec link |
|------|--------|-----------|
| **Decoupled pipeline** | New widget/vehicle without touching ingestion | NFR-1, §19 Architecture |
| **Typed event handling** | Discriminated unions for every SSE/WS message | NFR-6, §5/§6 |
| **Deterministic quirk handling** | Pure functions, fixture-tested, not luck | §14, §15, §18 |
| **Resilience by default** | 503 circuit breaker, SSE/WS reconnect, re-baseline | NFR-5, Q7 |
| **Bounded resource use** | Ring buffers, throttled render, OnPush | NFR-3, PF-1..6 |
| **Truthful UI** | Never show 999 km/h, glitch-0% fuel, backward GPS | AC-4/5/6, §19 |
| **Explainable concurrency** | Conflict UX names the other actor; audit log | RM-5/6/10, §19 |
| **Signals for state, RxJS for streams** | Synchronous reads in templates; reactive transport | §34 |

---

## 3. Folder Structure

```
src/app/
  core/                         # cross-cutting infrastructure (no domain rules)
    config/                     # AppConfig token, env adapter (URLs from environments)
    logging/                    # LogService, log levels, ring-buffer sink
    api/                        # FleetApi, RoutesApi, AlertApi, HttpClient interceptors
    realtime/                   # SseClient, WebSocketClient (transport wrappers)
    resilience/                 # CircuitBreaker, RetryPolicy, BackoffScheduler
    observability/              # MetricsService (counters/timers), MetricsRegistry
    errors/                     # GlobalErrorHandler, AppError types, error bus
  domain/                       # business rules + canonical client state
    fleet/                      # FleetStore (signals), FleetService
    telemetry/                  # TelemetryStore, TelemetryPipeline, anomaly detectors
    routes/                     # RoutesStore, RouteService, version cache, conflict model
    dispatchers/                # PresenceStore, PresenceService, ghost handling
  features/                     # smart components (one folder per screen/region)
    dashboard/                  # shell layout, orchestration, connection banner
    fleet-map/                  # Leaflet map, markers, trails
    fleet-list/                 # filterable list/grid of trucks
    vehicle-detail/             # detail panel: gauges, route, alert composer
    route-management/           # create/update/reassign, conflict dialog, audit log
    dispatcher-presence/        # roster, collaborative cursors
    observability-panel/        # dev-facing metrics (SSE/s, WS latency, drops)
    anomaly-dashboard/          # aggregated sensor anomalies (bonus)
  shared/                       # framework-agnostic, dependency-free
    ui/                         # presentational components (gauge, badge, status-chip)
    models/                     # TS interfaces, discriminated unions, type guards
    utils/                      # pure helpers (ringBuffer, clamp, geo, time)
```

**Dependency rule (enforced by convention + lint boundaries):**
`shared` ← `core` ← `domain` ← `features`. Arrows point to allowed imports. `shared` imports nothing app-specific. `features` never import `core/realtime` or `core/api` directly — only through `domain`.

---

## 4. Layer Responsibilities

| Layer | Owns | Must NOT |
|-------|------|----------|
| **shared** | Pure types, type guards, pure utils, dumb UI | Inject services, hold state, call I/O |
| **core** | Transports, HTTP, interceptors, circuit breaker, retry, metrics, logging, global error handling | Contain domain rules (what a "glitch" is, lifecycle validity) |
| **domain** | Canonical state (signal stores), business rules (anomaly classification, optimistic locking, presence reconciliation), pipeline wiring | Render UI, know about Leaflet/Material |
| **features** | Composition, layout, user-intent dispatch, presentation | Parse raw transport frames, hold canonical state, embed business rules |

This separation is what lets §15 quirk logic be unit-tested as pure functions (T-1..T-10) without Angular's TestBed.

---

## 5. Data Flow (REST / SSE / WebSocket → UI)

### Read path (telemetry)
```
EventSource ──raw MessageEvent──▶ SseClient (RxJS Observable<string>)
   ──▶ decodeSseMessage() ──▶ SseEnvelope (discriminated union)
       ├─ 'telemetry' ─▶ TelemetryPipeline.ingest(readings)
       │                    ├─ normalize → TruckReading[]
       │                    ├─ orderGuard (drop stale by timestamp)   [Q5]
       │                    ├─ speedAnomaly.detect()                  [Q3]
       │                    ├─ fuelAnomaly.detect()                   [Q2]
       │                    └─ TelemetryStore.apply(reading)          (signal write)
       ├─ 'gps_batch' ─▶ BatchProcessor.collapse(readings)           [Q1]
       │                    └─ TelemetryStore.applyTrail(truckId, trail, latest)
       ├─ 'heartbeat' ─▶ MetricsService.markHeartbeat()
       └─ 'connected' ─▶ ConnectionStore.markSseHealthy(); reset counters
                                  │
TelemetryStore (signals) ──computed()──▶ FleetMap / VehicleDetail / FleetList
```

### Read path (presence + route events)
```
WebSocket ──raw──▶ WebSocketClient (Observable<string>)
   ──▶ decodeWsMessage() ──▶ WsEnvelope (discriminated union)
       ├─ registered/joined/left/viewing ─▶ PresenceStore (signals)  [Q6]
       ├─ route_assigned/updated/reassigned ─▶ RoutesStore.apply()   (version cache)
       ├─ truck_alert ─▶ AlertStore.push()
       └─ fleet_reset ─▶ orchestrator: clear stores + REST re-baseline [§26]
```

### Write path (commands)
```
Feature component ──intent──▶ Domain service (e.g. RouteService.updateStatus)
   ──▶ Core api (RoutesApi.patch with If-Match header)
       ──HttpClient──▶ server
          ├─ 200 ─▶ RoutesStore.apply(route) (advance version)
          ├─ 409 ─▶ ConflictResolver.handle(error) ─▶ conflict signal ─▶ dialog
          └─ 4xx/5xx ─▶ error bus ─▶ toast / degraded mode
```

**Single source of truth on the client:** the signal stores. Both the read path (SSE/WS) and the write path (REST responses) converge on the same store reducers, so the UI never diverges between "what I just did" and "what the server broadcast."

---

## 6. Core Infrastructure Services

| Service (core) | Responsibility | Key API (conceptual) |
|----------------|----------------|----------------------|
| `AppConfig` (InjectionToken) | Provide `apiBaseUrl`, `sseUrl`, `wsUrl` from `environment` (NFR-8) | readonly fields |
| `SseClient` | Wrap `EventSource` as `Observable<MessageEvent>`; expose connect/close; emit lifecycle | `stream$`, `state$`, `close()` |
| `WebSocketClient` | Wrap `WebSocket` as duplex; send queue; reconnect; ping loop | `messages$`, `send()`, `state$` |
| `CircuitBreaker` | Generic 3-state breaker (closed/open/half-open) keyed by operation | `exec(fn)`, `state$` |
| `RetryPolicy` / `BackoffScheduler` | Retry-After-aware delays; exponential backoff for transports | `nextDelay()` |
| `MetricsService` | Counters/timers (SSE/s, WS RTT, drops, reconnects, 409/503) | `inc()`, `time()`, `snapshot()` |
| `LogService` | Structured logging with levels + ring-buffer sink (§29) | `debug/info/warn/error` |
| `GlobalErrorHandler` | Angular `ErrorHandler` impl; routes to error bus + LogService | — |
| HTTP interceptors | `DispatcherHeaderInterceptor` (X-Dispatcher-Id), `ErrorMappingInterceptor`, `MetricsInterceptor` | — |

**Why transports are RxJS wrappers, not Signals:** SSE/WS are asynchronous, error-prone, and need operators (`retryWhen`, `bufferTime`, `debounceTime`, `takeUntil`). RxJS is the right tool at the edge; results are pushed into Signals at the store boundary (§34).

---

## 7. Domain Services

| Service (domain) | Responsibility | Spec |
|------------------|----------------|------|
| `FleetService` | Initial + re-baseline fleet load via `FleetApi` through the breaker; reconcile with telemetry | FR-1, FR-7, §26 |
| `TelemetryPipeline` | Orchestrate normalize → order guard → anomaly detectors → store | FR-4/5/6, §14 |
| `SpeedAnomalyDetector` | Pure: classify implausible speed (≥ threshold) as sensor error | Q3, FR-5, T-4 |
| `FuelAnomalyDetector` | Pure: classify transient 0% vs genuine low fuel using rolling history | Q2, FR-6, T-3 |
| `BatchProcessor` | Pure: sort batch, collapse to trail + latest, apply order guard | Q1, FR-3, T-1 |
| `RouteService` | Create/update/reassign; own version cache; build `If-Match`; map conflicts | FR-8..12, RM-*, §20/§21 |
| `ConflictResolver` | Pure: parse both 409 shapes into a uniform `RouteConflict` model | RM-5/6, Q4/Q8, T-6/T-7 |
| `PresenceService` | Apply join/left/viewing idempotently; ghost-safe; viewing TTL | FR-14..16, DP-*, Q6, T-8 |
| `AlertService` | Send alerts; ingest `truck_alert` broadcasts | FR-19, VD-6 |

Detectors and processors are **pure functions/classes with no Angular deps** → directly unit-testable (T-1..T-8).

---

## 8. Signal-Based Stores

Stores are injectable singletons exposing **readonly signals** + **computed** derivations. Writes happen only through reducer methods called by domain services. No component writes a store directly.

| Store | State (signals) | Derived (computed) |
|-------|-----------------|--------------------|
| `FleetStore` | `trucks: Map<TruckId, Truck>` | `truckList`, `byStatus`, `assignedCount` |
| `TelemetryStore` | per-truck `latest: TruckReading`, `lastAcceptedTs`, `history: RingBuffer`, `trail` | `liveSpeed`, `liveFuel`, `sanitizedReading` |
| `RoutesStore` | `routes: Map<RouteId, Route>`, `versions: Map<RouteId, number>`, `auditLog: AuditEntry[]` | `routesByTruck`, `activeRoutes`, `sortedAudit` |
| `PresenceStore` | `dispatchers: Map<Id, Dispatcher>`, `viewing: Map<Id, {truckId, ts}>`, `selfId` | `roster`, `viewersOf(truckId)`, `activeCount` |
| `AlertStore` | `alerts: Alert[]` (bounded) | `unacknowledged`, `byTruck` |
| `ConnectionStore` | `sse: ConnState`, `ws: ConnState`, `breaker: BreakerState`, `staleSince` | `isDegraded`, `bannerText` |
| `MetricsStore` | counters/timers snapshot (mirrors `MetricsService`) | `sseRate`, `wsLatencyMs`, `dropRate` |

**Why a `Map` in a signal:** O(1) per-truck update; we write a new `Map` reference (or use a signal-per-entry strategy) so `computed` recomputes only what changed. For 12 trucks the cost is negligible; the pattern still scales (NFR-3/PF).

---

## 9. Feature Components

| Feature | Type | Reads | Intents emitted |
|---------|------|-------|-----------------|
| `dashboard` | shell | ConnectionStore, all | layout, route nav, dev toggles |
| `fleet-map` | smart | TelemetryStore, FleetStore, PresenceStore | selectTruck, viewingTruck |
| `fleet-list` | smart | FleetStore, TelemetryStore | filter, selectTruck (FO-6) |
| `vehicle-detail` | smart | FleetStore, TelemetryStore, RoutesStore, PresenceStore | sendAlert, updateRoute, viewingTruck |
| `route-management` | smart | RoutesStore | create/update/reassign, resolveConflict |
| `dispatcher-presence` | smart | PresenceStore | register (on init) |
| `observability-panel` | smart | MetricsStore, ConnectionStore | (read-only) |
| `anomaly-dashboard` | smart | TelemetryStore (anomaly log), MetricsStore | (read-only) |

All feature components are `ChangeDetectionStrategy.OnPush` and read state through signals, so change detection runs only when a consumed signal changes (PF-5).

---

## 10. Shared UI / Components

`shared/ui` holds **presentational, stateless** components (inputs in, events out — no injected services):

- `status-chip` (active/idle/maintenance styling — FO-2)
- `gauge` (speed/fuel/temp radial or bar — VD-3)
- `sensor-badge` (`SENSOR ERR`, `GLITCH` annotations — Q2/Q3)
- `connection-banner` (SSE/WS/degraded — FO-7)
- `conflict-dialog` (side-by-side versions — RM-12)
- `confirm-dialog` (critical actions — SQ-3)
- `dispatcher-cursor` (collaborative viewing marker — DP-3)
- `audit-list` (RM-10)

`shared/models` holds the TS contracts (§11–§13) and **type guards** used by decoders. `shared/utils` holds `RingBuffer`, `clamp`, `haversine`/grid mapping, `nowMs`, `isFiniteSpeed`.

---

## 11. REST Integration Design

Base URL: `environment.apiBaseUrl` = `http://localhost:3000/api` (NFR-8). One thin API service per resource in `core/api`, returning typed observables. **No business logic in API services** — they map HTTP to typed results/errors only.

| API service | Methods → endpoint (SERVER_ANALYSIS §3) |
|-------------|------------------------------------------|
| `FleetApi` | `getFleet()` → `GET /fleet`; `getTruck(id)` → `GET /fleet/:id` |
| `RoutesApi` | `list()` → `GET /routes`; `create(body)` → `POST /routes`; `patch(id, body, ifMatch)` → `PATCH /routes/:id`; `reassign(id, newTruckId)` → `PUT /routes/:id/reassign` |
| `AlertApi` | `send(truckId, body)` → `POST /fleet/:id/alert` |
| `TelemetryHistoryApi` | `history(id, limit)` → `GET /telemetry/history/:id` (illustrative only, VD-7) |
| `DevApi` | `reset()` → `POST /reset` (dev surface only, SQ-7) |

**Interceptors:**
1. `DispatcherHeaderInterceptor` — attaches `X-Dispatcher-Id` to POST/PATCH/PUT routes + alerts (exact casing; SQ-1). Skips GETs.
2. `IfMatch` handling — passed explicitly per-call (not an interceptor) because only PATCH uses it and the value is route-specific; sent as **bare integer string** (`"3"`), never quoted (server uses `parseInt`; quoted → `NaN`).
3. `ErrorMappingInterceptor` — maps HTTP errors to `AppError` discriminated types; extracts `Retry-After` for 503; preserves 409 bodies (both shapes).
4. `MetricsInterceptor` — counts 503/409/timing for observability (OB-5).

`GET /fleet` calls are routed **through the CircuitBreaker** (§27); all other endpoints call directly.

---

## 12. SSE Telemetry Design

`SseClient` wraps `EventSource(environment.sseUrl)` into an `Observable`. All server frames are default-type `data:` JSON; the discriminator is the `type` field (SERVER_ANALYSIS §7).

```ts
type SseEnvelope =
  | { type: 'connected'; truckCount: number; timestamp: number }
  | { type: 'heartbeat'; timestamp: number }
  | { type: 'telemetry'; readings: RawReading[]; timestamp: number }
  | { type: 'gps_batch'; truckId: string; readings: RawReading[] };
```

**Decoding:** `decodeSseMessage(raw): SseEnvelope | UnknownFrame` with a type guard; unknown/malformed frames are logged + counted, never thrown (SQ-4).

**Lifecycle (NFR-2):**
- `EventSource` auto-reconnects; we still observe `error`/`open` to drive `ConnectionStore` and `MetricsService.reconnects`.
- On re-`connected`, reset backoff/rate counters and **trigger a `GET /fleet` re-baseline** because the server has **no `Last-Event-ID` replay** (SERVER_ANALYSIS §14 risk) — a gap is assumed and reconciled.
- Heartbeat watchdog: if no `heartbeat`/`telemetry` within ~2× heartbeat interval (>30 s), mark stream stalled, force reconnect.
- Teardown closes `EventSource` and clears watchdog timers on destroy.

**Render coalescing (PF-3):** telemetry signal writes are applied immediately to the store, but map/marker repaint is coalesced via `requestAnimationFrame`/`bufferTime` so 12 readings every 2 s (+ batches) don't thrash change detection.

---

## 13. WebSocket Dispatcher Design

`WebSocketClient` wraps `WebSocket(environment.wsUrl)` as duplex.

```ts
// Client → Server
type WsClientMsg =
  | { type: 'register_dispatcher'; dispatcherId?: string; name?: string }
  | { type: 'ping' }
  | { type: 'viewing_truck'; truckId: string };

// Server → Client
type WsServerMsg =
  | { type: 'registered'; dispatcherId: string }
  | { type: 'pong'; timestamp: number }
  | { type: 'dispatcher_joined'; dispatcherId: string; name: string; activeDispatchers: number; timestamp: number }
  | { type: 'dispatcher_left'; dispatcherId: string; activeDispatchers: number; timestamp: number }
  | { type: 'dispatcher_viewing'; dispatcherId: string; truckId: string; timestamp: number }
  | { type: 'route_assigned'; route: Route; truckId: string; assignedBy: string; truckVersion: number; timestamp: number }
  | { type: 'route_updated'; route: Route; updatedBy: string; timestamp: number }
  | { type: 'route_reassigned'; route: Route; oldTruckId: string; newTruckId: string; reassignedBy: string; timestamp: number }
  | { type: 'truck_alert'; alert: Alert }
  | { type: 'fleet_reset'; timestamp: number }
  | { type: 'error'; message: string };
```

**Lifecycle (NFR-2, DP-6):**
- On `open` → send `register_dispatcher` (persist returned `dispatcherId` from `registered`).
- Ping loop on an interval; measure RTT from `pong` (OB-2).
- Reconnect with exponential backoff on close/error; on reconnect **re-register** and **rebuild presence from scratch** (old roster is stale), clear viewing indicators.
- Outbound `send()` queues messages while socket is connecting; flushes on open.
- Teardown clears ping timer and closes socket on destroy.

---

## 14. Telemetry Processing Pipeline

The pipeline is a pure, ordered sequence operating per reading; only the final step touches a signal store.

```
ingest(readings: RawReading[]):
  for each raw in readings:
    1. normalize(raw)            -> TruckReading (coerce types, default flags)
    2. orderGuard(reading)       -> ACCEPT | DROP_STALE        [Q5 / FR-4]
       (compare reading.timestamp vs TelemetryStore.lastAcceptedTs[truckId])
    3. speedSanitize(reading)    -> annotate {speedSensorError} [Q3 / FR-5]
    4. fuelSanitize(reading)     -> annotate {fuelGlitch}       [Q2 / FR-6]
    5. store.apply(reading)      -> update latest, history(ring), lastAcceptedTs
    6. metrics + anomaly log (drops, glitches, sensor errors)  [OB-3/5]
```

Key properties:
- **Idempotent & order-independent at the boundary:** step 2 makes late/old readings harmless.
- **Sanitize ≠ mutate truth destructively:** we annotate readings; the store keeps `lastValidFuel`/`lastValidSpeed` so the UI shows last-good values during a glitch window, with a badge (VD-4).
- **History is bounded** (RingBuffer, PF-2) — fixed capacity per truck, oldest evicted.
- Batches go through a parallel `BatchProcessor` (§15) that re-uses steps 2–4 per point before producing a trail.

---

## 15. GPS Batch Handling (Q1)

Server emits `gps_batch` for one truck, 10–30 readings, timestamps 2 s apart **going back in time**, array ordered oldest-first (`_batchIndex` 0..n). (FR-3, FO-4, T-1.)

```
collapse(batch: RawReading[]):
  sorted   = batch.sort((a,b) => a.timestamp - b.timestamp)   // defensive, by time
  filtered = sorted.filter(r => r.timestamp > lastAcceptedTs[truckId])  // reuse Q5 guard
  trail    = filtered.map(toLatLng)                            // polyline points
  latest   = filtered.length ? filtered[filtered.length-1] : none
  return { trail, latest }
```

Then `TelemetryStore.applyTrail(truckId, trail, latest)`:
- Renders **one polyline** + **one current marker** at `latest` — never 10–30 markers (AC-3).
- **Suppresses alerts** for historical points (they are past; only `latest` may feed live alert checks, and only if it isn't itself an anomaly).
- `latest` still passes speed/fuel sanitize so a stale 999/0 in a batch can't poison the marker.

---

## 16. Out-of-Order Timestamp Handling (Q5)

Server backdates one reading per ~10% of telemetry events by 3–8 s, flagged `_reordered: true`. (FR-4, T-2, OB-3.)

- **Authoritative guard is timestamp comparison**, not the flag: `if (reading.timestamp <= lastAcceptedTs[truckId]) drop`.
- `_reordered` is informational only → increments an observability counter (OB-3) and may show in the anomaly dashboard, but is **never** the basis for the decision (the server could reorder without the flag in principle; the comparison is robust either way).
- Same guard is applied inside batch collapse (§15) so historical points never rewind the live position.
- `lastAcceptedTs` is stored per truck in `TelemetryStore`.

---

## 17. Speed Sensor Anomaly Handling (Q3)

Server: truck_7 reports `speed: 999` for 5–10 s; real movement continues. Sim clamps genuine speed ≤ 80 km/h (SERVER_ANALYSIS assumptions), so 999 is unambiguous. (FR-5, VD-4, T-4.)

```
speedSanitize(reading):
  if (reading.speed >= SPEED_SENSOR_ERROR_THRESHOLD)   // e.g. 200 km/h
     reading.speedSensorError = true
     reading.displaySpeed = lastValidSpeed[truckId] ?? null
  else
     reading.displaySpeed = reading.speed
     lastValidSpeed[truckId] = reading.speed
```

- UI shows `SENSOR ERR` badge (sensor-badge component); **never renders 999**.
- Erroneous speed is **excluded** from any computation (ETA, speeding alerts) and from gauges (gauge shows last-valid or a clearly-flagged state).
- Auto-clears when valid readings resume (next in-range reading overwrites the flag).
- Threshold is a named constant in `domain/telemetry` config, not magic-numbered in components.

---

## 18. Fuel Sensor Glitch Handling (Q2)

Server: active trucks > 40 km/h, 5%/2 s, report `fuel: 0` for 2–4 s while real fuel keeps decrementing. The challenge is **distinguishing a glitch-0 from genuine empty**. (FR-6, VD-4, T-3.)

```
fuelSanitize(reading):
  history = fuelHistory[truckId]      // small RingBuffer of recent accepted fuels
  if (reading.fuel === 0 && recentMin(history) > GLITCH_FLOOR /*e.g. 5%*/)
     reading.fuelGlitch = true
     reading.displayFuel = lastValidFuel[truckId]   // hold last good
  else
     reading.displayFuel = reading.fuel
     lastValidFuel[truckId] = reading.fuel
     history.push(reading.fuel)
```

- A **sudden** drop to 0 from a plausible (>5%) recent level → glitch → hold last value, show `GLITCH` badge, **suppress** low-fuel alert.
- A **gradual genuine decline** to a low value (the server floors real fuel at 5, never 0 organically) → not classified as glitch → low-fuel alert fires normally (AC-5).
- Glitch auto-clears when non-zero readings resume.
- Distinction is a pure function → directly tested with two fixture sequences (T-3).

---

## 19. Route-Management Flow

Create / update / reassign, all through `RouteService` → `RoutesApi` → store. (FR-8..13, RM-*.)

**Create (POST /routes):**
- Form validates truck + destination required (RM-1, SQ-2).
- UI blocks selecting a `maintenance` truck — server does **not** guard this on create (RM-2, §18 risk).
- 201 → `RoutesStore.apply(route)` (seed version = `route._version`).
- 409 Scenario A (truck already assigned) → show `assignedBy` + `currentRouteId`, offer to open that route (RM-7).

**Update (PATCH /routes/:id):**
- UI enforces lifecycle `assigned → in-progress → completed/cancelled` (server doesn't — RM-3).
- Sends `If-Match: <versions.get(routeId)>` (RM-4).
- Confirmation on cancel (SQ-3).
- 200 → apply route, advance version cache (RM-11).
- 409 → ConflictResolver (§20/§21).

**Reassign (PUT /routes/:id/reassign):**
- Confirmation dialog (SQ-3, RM-9).
- 400 (target in maintenance), 404, 409 (target busy → RM-8) mapped to clear messages.

**Audit log (RM-10):** every applied `route_assigned/updated/reassigned` (from REST response **or** WS broadcast) appends an `AuditEntry { action, actor, routeId, version, ts }` to `RoutesStore.auditLog`. Actor read from `assignedBy`/`lastModifiedBy`/`reassignedBy`.

**Version cache convergence (RM-11):** the cache is updated from both the mutation response and WS broadcasts, so a route changed by another dispatcher updates *my* `If-Match` before I PATCH — reducing avoidable 409s while still handling the race when it happens.

---

## 20. Optimistic Locking & 409 Conflict Handling (Q4)

Server checks `If-Match` vs `route._version` immediately; mismatch → **409 Scenario B** `{ error, currentVersion, yourVersion, lastModifiedBy }`. (FR-10/11, RM-5, T-5/T-6.)

```
ConflictResolver.handle(httpError) -> RouteConflict:
  RouteConflict = {
    routeId,
    currentVersion: body.currentVersion,
    yourVersion:    body.yourVersion ?? cachedVersion,      // tolerate absence (Q8)
    lastModifiedBy: body.lastModifiedBy ?? 'unknown',       // tolerate absence (Q8)
    serverRoute:    null    // filled after re-fetch
  }
```

Flow:
1. PATCH 409 → `RouteService` calls `ConflictResolver`, sets a `conflict` signal.
2. Re-fetch latest via `GET /fleet/:truckId`’s route or `GET /routes` to get the authoritative route + version → fill `serverRoute`, update version cache.
3. UI opens `conflict-dialog`: shows **who** changed it (`lastModifiedBy`), what differs (side-by-side, RM-12), and offers **Retry-with-new-version** or **Cancel** (RM-5, AC-7).
4. Retry re-issues PATCH with the refreshed `If-Match`.

`ConflictResolver` is pure → tested against both 409 JSON shapes (T-6, T-7).

---

## 21. PATCH Race / Reassignment Conflict Handling (Q8)

Server: after a valid initial check, PATCH waits 200–1000 ms then re-checks `_version`; a concurrent reassign bumps it → **409 Scenario C** `{ error, currentVersion }` only (no `yourVersion`/`lastModifiedBy`). (RM-6, T-7.)

- Handled by the **same** `ConflictResolver`; the `?? cachedVersion` / `?? 'unknown'` fallbacks (§20) mean the leaner payload **never throws** (SQ-4).
- Same recovery path: re-fetch, refresh version, present resolution dialog.
- UX note surfaced to user: the conflict may be **self-inflicted** by rapid clicks (a prior reassign of the same route) — the dialog copy stays generic ("route changed during your update") to cover both inter-dispatcher and self-races.
- The 200–1000 ms server delay means the PATCH call shows a pending state; the UI disables the submit control while in-flight to reduce accidental double-submits.

---

## 22. Dispatcher Presence Flow

(FR-14/15, DP-1/2/3, §13.)

- On WS open → `register_dispatcher { name }`; store `selfId` from `registered`.
- `dispatcher_joined` → `PresenceStore.add(dispatcher)`; `activeDispatchers` count synced.
- `viewing_truck` sent when a truck is opened/focused (vehicle-detail, fleet-map selection).
- `dispatcher_viewing` (others) → `PresenceStore.setViewing(dispatcherId, truckId, ts)`; rendered as `dispatcher-cursor` near that truck (DP-3).
- `viewersOf(truckId)` computed signal drives "X is viewing this truck" badges.

---

## 23. Ghost Presence Handling (Q6)

Server: 20% of disconnects delay `dispatcher_left` by 10 s. (FR-16, DP-4/5, T-8.)

- `PresenceStore` keyed by `dispatcherId` (a `Map`).
- `dispatcher_left` is **idempotent**: unknown id → no-op (don't throw, don't double-decrement) — this is the core of T-8.
- No flicker: removal animates out (CDK animation / fade) so a late leave isn't jarring; we **do not** infer offline from a timeout — we wait for the explicit event.
- **Viewing TTL (DP-5):** since the server has no "stopped viewing" event, each `viewing` entry carries a timestamp; a `computed`/interval prunes entries older than a TTL (e.g. 30 s) so stale cursors fade even if the leave is ghosted.
- On WS reconnect, the roster is rebuilt from scratch (no replay) — stale ghosts are naturally discarded (DP-6).

---

## 24. Vehicle Detail Flow

(FR-17..20, VD-*, §10.)

- Truck selection → open `vehicle-detail`; emit `viewing_truck`.
- Load full truck via `GET /fleet/:id` for `mileage`/`lastUpdate` (not in the fleet-list payload).
- Live gauges (speed/fuel/temp) bind to **sanitized** signals from `TelemetryStore` (displaySpeed/displayFuel, badges for Q2/Q3) — VD-3/VD-4.
- Assigned route details from `RoutesStore.routesByTruck` (VD-5).
- Optional history seed via `TelemetryHistoryApi` — clearly labelled **illustrative**, not authoritative (VD-7, §18 risk).
- Alert composer (message + severity) → `AlertService.send` (VD-6, §25).

---

## 25. Alert Flow

(FR-19, VD-6.)

- Outbound: `AlertService.send(truckId, {message, severity})` → `POST /fleet/:id/alert` with `X-Dispatcher-Id` (always sent even though server doesn't enforce it here — §18 risk, SQ-1). Input validated (non-empty message, allowed severity) — SQ-2.
- Inbound: WS `truck_alert` → `AlertStore.push(alert)` → toast + per-truck badge across all dispatchers (AC-11).
- `notes`/`message`/dispatcher `name` rendered as **text only** — no HTML injection (SQ-6).
- `AlertStore` is bounded (recent N) to respect NFR-3.

---

## 26. Fleet Reset Flow

(FR-22, §15 indirectly via state coherence.)

- `POST /reset` is exposed only in a **dev surface** behind a confirm dialog (SQ-3/SQ-7).
- Whether triggered by us or another client, the server broadcasts WS `fleet_reset`.
- Handler (orchestrator in `dashboard` or a `ResetCoordinator` domain helper):
  1. Clear `RoutesStore`, `PresenceStore` (except `selfId`), `AlertStore`, telemetry trails.
  2. Re-baseline via `FleetService.load()` (`GET /fleet` through breaker).
  3. Presence is naturally rebuilt as join/viewing events resume.
- This keeps every connected dispatcher consistent after a reset.

---

## 27. Circuit Breaker & Degraded Mode (Q7)

Server: `GET /fleet` returns 503 + `Retry-After: 3` on ~15% of calls, randomly. (FR-7, NFR-5, OB-6, T-9, AC-10.)

**Generic `CircuitBreaker` (core/resilience), keyed to the `getFleet` operation:**

```
States: CLOSED ──(3 consecutive 503)──▶ OPEN ──(after probe delay)──▶ HALF_OPEN
        HALF_OPEN ──(200)──▶ CLOSED         HALF_OPEN ──(503)──▶ OPEN
```

- **CLOSED:** normal. On 503, read `Retry-After` (seconds), schedule a single retry after that delay (no tight loop), show "retrying in Xs". Count consecutive 503s; any 200 resets the counter.
- **OPEN (after 3 consecutive 503s):** stop hammering `GET /fleet`. Enter **degraded mode** — `ConnectionStore.isDegraded = true`; UI shows last-good fleet data with a **"stale as of HH:MM:SS"** banner (FO-7). SSE/WS keep running (they're unaffected), so live telemetry still flows over the cached fleet baseline.
- **HALF_OPEN:** after a low-cadence probe delay (e.g. 10–15 s), allow **one** probe request. 200 → CLOSED + clear degraded + reset counter; 503 → back to OPEN.
- **Cold-start risk (§18):** if the breaker opens before the first successful fleet load, the app handles an empty fleet gracefully and keeps probing; telemetry SSE can still populate trucks it learns about, but route/version data waits for a successful `GET /fleet`/`GET /routes`.

Breaker state is observable for the observability panel (OB-6).

---

## 28. Observability Design

Developer-facing, fed by `MetricsService` + interceptors + pipeline counters. (OB-1..6, §11 assignment Observability bonus.)

| Metric | Source |
|--------|--------|
| SSE events/sec, last-event age (OB-1) | `SseClient` + pipeline tick |
| WS RTT (OB-2) | ping→pong delta in `WebSocketClient` |
| Dropped/stale/reordered counts (OB-3) | order guard + `_reordered` counter |
| Reconnect counts (OB-4) | SSE/WS lifecycle handlers |
| Anomaly counters (OB-5) | fuel-glitch, speed-stuck, 503, 409 (with timestamps) |
| Breaker state (OB-6) | `CircuitBreaker.state$` |

`observability-panel` and `anomaly-dashboard` render `MetricsStore` snapshots. Metrics are emitted **from the pipeline/core**, not bolted onto UI — so removing the panels removes zero pipeline logic (NFR-1).

---

## 29. LogService Design

`core/logging/LogService`:
- Levels: `debug | info | warn | error`, gated by `environment.production` (debug off in prod).
- **Ring-buffer sink** (bounded in-memory, e.g. last 500 entries) so logs are inspectable in the observability panel without unbounded growth (NFR-3).
- Console sink in dev; structured entries `{ ts, level, scope, message, data? }`.
- Used by `GlobalErrorHandler`, decoders (malformed frames), transports (reconnects), and conflict handling.
- No PII beyond dispatcher names already in the protocol; never logs full payloads at info level (SQ-6).

---

## 30. Error-Handling Strategy

(SQ-4/SQ-5, NFR-2.)

- **Typed errors:** `core/errors/AppError` discriminated union — `HttpError`, `ConflictError(409)`, `ServiceUnavailableError(503, retryAfter)`, `DecodeError`, `TransportError`. `ErrorMappingInterceptor` produces these.
- **Boundaries:** `GlobalErrorHandler` catches uncaught errors → LogService + non-fatal toast; the dashboard never white-screens (SQ-4).
- **Decoder safety:** malformed SSE/WS frames are caught in the decoder, logged + counted, and dropped — a bad frame never tears down the stream.
- **Per-feature resilience:** a failed REST call surfaces a contextual message (toast or inline) and leaves the rest of the dashboard live.
- **Conflict is not an error toast:** 409 routes to the structured conflict dialog (SQ-5), not a generic failure.
- **Transport errors** drive reconnect/backoff, not user-facing crashes.

---

## 31. Performance Strategy

(NFR-3/4, PF-1..6, AC-14.)

| Technique | Where |
|-----------|-------|
| `OnPush` + signal reads | all feature components (PF-5) |
| `trackBy` / signal keyed lists | fleet-list, roster, audit (PF-5) |
| Render coalescing (rAF/`bufferTime`) | map/marker repaint from telemetry (PF-3) |
| Marker mutation, not recreation | Leaflet layer updates per tick (PF-4) |
| RingBuffer per-truck history | TelemetryStore (PF-2, NFR-3) |
| Bounded alert/log buffers | AlertStore, LogService |
| O(n) batch collapse | BatchProcessor — single pass, one polyline (PF-6) |
| `Map`-based stores, targeted recompute | all stores (NFR-3) |
| Unsubscribe via `takeUntilDestroyed` | every stream subscription (NFR-2) |

Target: stable memory + CD over a multi-hour session with 12 trucks × 2 s (+ batches).

---

## 32. Security & Quality Considerations

(SQ-1..7, §12 of SPEC.)

- `X-Dispatcher-Id` always attached on mutating calls (interceptor); absence treated as app bug (SQ-1).
- Input validation on all forms before API calls (SQ-2).
- Confirmation dialogs on cancel/reassign/reset (SQ-3); reset only in dev surface (SQ-7).
- Error boundaries prevent dashboard crashes (SQ-4).
- Conflict UX explicit and actionable, names the other actor (SQ-5).
- All server-provided strings rendered as text; Angular's default interpolation escaping relied on; no `innerHTML` with server data (SQ-6).
- No secrets in client; URLs from environment only; no eval of server data.
- `If-Match` correctness (bare integer) is a security-relevant correctness detail — a wrong format silently disables locking.

---

## 33. Testing Architecture

(NFR-6, §14, T-1..T-10, AC-13.) Runner: the **Angular project default** (e.g. the configured test runner) unless explicitly changed later; the choice of runner is not locked in by this architecture. The important point is that tests focus on **pure domain logic with mocked I/O** — Angular TestBed is used only where DI is genuinely needed. Mock server **not** required (integration plan §4.3) — all transports faked.

| Test target | Type | Maps to |
|-------------|------|---------|
| `BatchProcessor.collapse` | pure unit | T-1 / Q1 |
| `orderGuard` | pure unit | T-2 / Q5 |
| `FuelAnomalyDetector` (glitch vs real) | pure unit, two fixtures | T-3 / Q2 |
| `SpeedAnomalyDetector` (999 filter) | pure unit | T-4 / Q3 |
| `RouteService` PATCH + version cache | unit w/ HttpClient mock | T-5 / Q4 |
| `ConflictResolver` Scenario B | pure unit | T-6 / Q4 |
| `ConflictResolver` Scenario C (lean shape) | pure unit | T-7 / Q8 |
| `PresenceService` ghost/idempotent left | pure unit | T-8 / Q6 |
| `CircuitBreaker` 503 + Retry-After | unit w/ fake timers | T-9 / Q7 |
| WS reducers (`route_reassigned`) | unit | T-10 / FR-21 |

**Fixtures:** deterministic JSON fixtures for each SSE/WS message and each 409 shape live in `shared/models/__fixtures__` (or test folders). Probabilistic quirks are tested by **feeding fixtures**, never by observing the live server (§18 risk). ≥8 meaningful tests guaranteed (T-1..T-8 core).

---

## 34. Why Signals + RxJS (not NgRx)

| Need | Tool | Reason |
|------|------|--------|
| Synchronous, fine-grained UI state read in templates | **Signals** | No async glue, no selectors boilerplate; `computed` derivations recompute precisely; ideal for 12-truck stores |
| Asynchronous event streams (SSE/WS), backpressure, retry, debounce, reconnect | **RxJS** | Operators (`retryWhen`, `bufferTime`, `takeUntilDestroyed`) are exactly the transport/resilience toolkit |
| Boundary | **RxJS → Signals at the store edge** | Streams are reactive plumbing; stores expose stable signals to the view |

**Why not NgRx:**
- The domain is **modest in size** (12 trucks, a handful of routes/dispatchers); NgRx's action/reducer/effect/selector ceremony adds boilerplate without payoff here.
- Our stores already provide a single source of truth, unidirectional updates (reducer methods), and pure transition logic — the valuable parts of Redux — **without** a global dispatcher or serialized action log we don't need.
- Signals give better ergonomics and change-detection performance in modern Angular than the NgRx + RxJS selector stack for this scale.
- **NgRx was intentionally not selected for this implementation:** focused domain services plus Signal stores are a better trade-off for this time-boxed assignment, keeping state transitions testable and decoupled without the added ceremony.
- Trade-off acknowledged: we forgo NgRx devtools/time-travel. Mitigation: structured `LogService` + observability panel give comparable insight for this scope (§28/§29).

---

## 35. Why Redis Is Not Implemented

- **There is no backend to cache for.** The only server is the provided mock (`server.js`); the assignment and integration plan §9 forbid adding a real backend, datastore, queue, or Redis.
- All "state" the client needs is either **served on demand** (`GET /fleet`, `GET /routes`) or **streamed** (SSE/WS). Client-side caching is handled by **signal stores + RingBuffers**, which is the correct layer for a frontend.
- The resilience problem Redis might superficially seem to address (503 under load) is actually solved by the **client circuit breaker + last-good cache in `FleetStore`** (§27) — no server-side infrastructure required.
- **SPEC NFR-7 and §17 explicitly exclude Redis.** Adding it would be scope creep and an unowned operational dependency.

---

## 36. Production Considerations

These are **out of scope to build** (§17) but documented for the defense interview (§19, assignment warning):

- **Real auth:** `X-Dispatcher-Id` is an unverified string (SERVER_ANALYSIS §14). Production needs real identity (OAuth/OIDC), signed tokens, and per-dispatcher authorization on mutations.
- **SSE durability:** the mock has no `Last-Event-ID`/replay. Production should support event IDs + replay or a snapshot+delta protocol so reconnects don't lose data; today we re-baseline via REST.
- **Backpressure & scale:** 12 trucks is trivial; at thousands, move to viewport-bounded subscriptions, server-side filtering/aggregation, and possibly WebTransport/binary framing.
- **Persistence & audit:** server state is in-memory and resets on restart; a real audit log needs durable storage and tamper-evidence.
- **Observability:** ship metrics/logs to a real backend (OpenTelemetry), alerting on SSE gap rate, 503 rate, conflict rate.
- **Conflict policy:** production may want server-enforced lifecycle transitions and richer merge/CRDT strategies rather than last-writer-with-confirm.
- **Map tiles/geofencing:** real tile provider + geofence engine for the bonus geofencing feature.

---

## 37. Trade-offs & Known Limitations

| Decision | Trade-off / limitation |
|----------|------------------------|
| Signals + services instead of NgRx | No time-travel devtools; mitigated by LogService + observability (§34) |
| Client circuit breaker only | Can't fix server-side load; only protects the client and UX (§27) |
| REST re-baseline after SSE gap | Brief inconsistency window after reconnect; bounded by breaker availability (§12/§27) |
| Speed threshold heuristic (≥200) | A genuine >200 km/h would be flagged — impossible here (sim ≤80), acceptable (§17) |
| Fuel glitch heuristic (sudden 0 vs gradual) | Pathological "real instantaneous empty" can't occur (server floors at 5); heuristic is safe for this server (§18) |
| Leaflet optional | If Leaflet is impractical in the environment, fall back to a CDK coordinate grid; map quality not graded (FO-1) |
| Viewing TTL for cursors (DP-5) | A dispatcher genuinely staring >TTL without re-emitting could fade; mitigated by re-emitting `viewing_truck` on focus |
| In-memory bounded buffers | History/logs/alerts are session-only; acceptable (no persistence in scope, §17) |
| `Map`-in-signal updates | Requires disciplined immutable-ish writes; isolated to store reducers |

---

## 38. Implementation Phases

Sequenced to match the assignment's recommended order and to land testable slices early.

| Phase | Deliverable | Spec gates |
|-------|-------------|-----------|
| **P0 — Scaffold** | Angular app (standalone, strict), `environment.*` URLs, Material/CDK, lint boundaries, `npm start`/`npm test` wired | NFR-8/9, AC-1 |
| **P1 — Core transport + models** | `shared/models` (discriminated unions, type guards), `SseClient`, `WebSocketClient`, `AppConfig`, `LogService` | §5/§6/§11, NFR-2/6 |
| **P2 — Telemetry pipeline + stores** | `TelemetryPipeline`, order guard, anomaly detectors, `TelemetryStore`/`FleetStore`; **tests T-1..T-4** | FR-1/4/5/6, §14..§18 |
| **P3 — Fleet overview UI** | `fleet-map` (Leaflet/grid), `fleet-list`, status chips, connection banner, render coalescing | FR-1/2/3, FO-*, PF-3/4 |
| **P4 — Resilience** | `CircuitBreaker`, `RetryPolicy`, degraded mode, re-baseline; **test T-9** | FR-7, §27, NFR-5 |
| **P5 — Routes + locking** | `RoutesApi`, `RouteService`, version cache, `ConflictResolver`, conflict dialog, audit log; **tests T-5/T-6/T-7/T-10** | FR-8..13, RM-*, §19..§21 |
| **P6 — Presence** | `WebSocketClient` register/ping, `PresenceStore`, roster, cursors, ghost handling; **test T-8** | FR-14..16, DP-*, §22/§23 |
| **P7 — Vehicle detail + alerts** | detail panel, gauges, route details, alert composer/ingest, reset flow | FR-17..20/22, VD-*, §24..§26 |
| **P8 — Observability + anomaly dashboard** | `MetricsService`, panels (bonus) | OB-*, §28 |
| **P9 — Polish + docs** | filters, keyboard shortcuts (bonus), `README.md`, `PROMPTS.md`, perf pass | FO-6, §17 bonus, AC-14 |

Each phase ends green (`npm test`) and leaves the app runnable.

---

## 39. As-Built Architecture (Implementation Status)

This section documents the architecture **as actually implemented and validated**. It is authoritative wherever it diverges from the design-phase sections above. It introduces no new design — it records what shipped.

### 39.1 Layered structure (as-built)

The four-layer model (`shared ← core ← domain ← features`, dependencies pointing down only) was implemented as designed. The real tree:

```
src/app/
  shared/
    models/        truck, telemetry, route, alert, dispatcher, sse + ws models & decoders
    utils/         ring-buffer, json utils
  core/
    config/        AppConfig token + provider
    logging/       LogService
    errors/        AppError types
    api/           FleetApiService, RoutesApiService, VehicleAlertApiService
    realtime/      SseClient, WsClient (ws-client.service)
    resilience/    CircuitBreaker, RetryPolicy
  domain/
    fleet/         FleetStore, ConnectionStore, FleetService
    telemetry/     TelemetryStore, TelemetryPipeline, normalize, order-guard,
                   batch-processor, speed-anomaly-detector, fuel-glitch-detector
    routes/        RoutesStore, RouteService, ConflictResolver, AuditLog
    presence/      PresenceStore, PresenceService
    alerts/        AlertsStore
    vehicle-detail/    VehicleDetailService
    vehicle-selection/ SelectedVehicleStore
    observability/     TelemetryHealthStore
  features/
    dashboard/         shell + fleet overview + filterable fleet view
    fleet-map/         FleetMapComponent (Leaflet)
    route-management/  RouteManagementComponent
    vehicle-detail/    VehicleDetailComponent
    observability/     ObservabilityPanelComponent
    anomaly-dashboard/ AnomalyDashboardComponent
```

All feature components are standalone with `ChangeDetectionStrategy.OnPush` and read domain state through signals only. No feature imports `core/api` or `core/realtime` directly — transport access is always mediated by a domain service.

**Divergences from the design tree (§3):** there is no separate `fleet-list` or `dispatcher-presence` feature folder (the fleet overview and presence indicator live inside `DashboardComponent`); there is no `shared/ui` component library (gauges/badges are implemented inline within their feature components); the design's `MetricsService`/`MetricsStore` is realized as `TelemetryHealthStore` plus display-only derivations; and `vehicle-selection/SelectedVehicleStore` was added as the selection source of truth.

### 39.2 Data flow (REST / SSE / WS → stores → UI)

**REST (read + commands):**
`FleetApiService` → `FleetService` loads the fleet **through `CircuitBreaker`** into `FleetStore`. `RoutesApiService` → `RouteService` performs route CRUD and writes `RoutesStore` (+ `AuditLog`). `VehicleAlertApiService` sends alerts; `VehicleDetailService` loads on-demand detail/mileage. API services map HTTP to typed results only — no business logic.

**SSE (telemetry):**
`SseClient` (core/realtime) exposes a discriminated-union stream (`open | error | message`). `TelemetryPipeline` (domain) is the sole router: `normalize → orderGuard → speed/fuel detectors → TelemetryStore` (and a sanitized live-patch into `FleetStore`). Stale readings dropped by `orderGuard` increment `TelemetryHealthStore` (dropped count); connection lifecycle and heartbeat drive `ConnectionStore`.

**WebSocket (presence + route/alert broadcasts):**
`WsClient` is transport-only. `PresenceService` (domain) owns the full lifecycle and routes frames into `PresenceStore` (dispatchers, per-truck viewers), `RoutesStore`/`FleetStore` (route broadcasts), and `AlertsStore` (`truck_alert`). `fleet_reset`, `pong`, and server `error` frames are intentionally ignored.

**UI:**
`DashboardComponent` composes the fleet overview (with the filterable fleet view), `FleetMapComponent`, `RouteManagementComponent`, `VehicleDetailComponent`, `ObservabilityPanelComponent`, and `AnomalyDashboardComponent`. The signal stores are the single client source of truth; both the read path (SSE/WS) and the write path (REST responses) converge on the same store reducers.

### 39.3 Route conflict handling (as-built)

Optimistic locking is implemented with the `If-Match` header carrying the cached route `_version` (bare integer string). On **409**, `ConflictResolver` normalizes both server response shapes into a uniform conflict model (`currentVersion`, `yourVersion`, `lastModifiedBy`, tolerating absent fields); `RouteManagementComponent` renders this inline as a **conflict notice**, and the dispatcher can re-issue the action against the latest version. `AuditLog` records applied operations from both REST responses and WS broadcasts.

Critical mutations — **reassign, complete, cancel** — are gated by an **inline confirmation step** inside `RouteManagementComponent` (`pendingAction` signal → confirm/cancel). Non-destructive transitions (e.g. `assigned → in-progress`) dispatch directly. The design's separate `confirm-dialog`/`conflict-dialog` components were not built; both interactions are inline, dependency-free UI.

### 39.4 Multi-dispatcher coordination (as-built)

`PresenceService` handles registration, ping scheduling, and reconnect cleanup. A key lifecycle invariant holds: `selfId` is cleared on disconnect (`resetPresence()`), so a reconnect cannot emit `viewing_truck` with a stale identity before the new `registered` frame arrives. `dispatcher_joined`/`dispatcher_left` are idempotent. Selecting a truck (via `SelectedVehicleStore`) emits `viewing_truck`; other dispatchers' selections are tracked per truck in `PresenceStore` and pruned on a stale-viewer sweep (10-second interval, 30-second TTL) so ghost viewers fade even when a leave is delayed. Presence/viewing state is kept entirely separate from route state, so collaborative-viewing churn never interferes with route mutations; WS route broadcasts keep every dispatcher's route/fleet view converged.

### 39.5 Observability (as-built)

There is **no separate `MetricsService`/`MetricsStore`**. `ObservabilityPanelComponent` (features/observability) is a display-only panel deriving from existing stores: SSE state + heartbeat age from `ConnectionStore`, WS state + active dispatcher count + `selfId` from `PresenceStore`, dropped stale-telemetry count from `TelemetryHealthStore`, live anomaly count, fleet size from `FleetStore`, and recent entries from `AuditLog`. `TelemetryHealthStore.incrementDropped()` is the one counter, called by `TelemetryPipeline` when `orderGuard` drops a stale reading. Observability is in-app/runtime only — it is not exported to an external monitoring backend.

### 39.6 Anomaly handling (as-built)

`speed-anomaly-detector` and `fuel-glitch-detector` are pure functions in `domain/telemetry`. They annotate readings with `displaySpeed`/`displayFuel` and `speedSensorError`/`fuelGlitch` flags, carrying forward the last valid value during an anomaly window. Raw anomalous sensor values (`speed: 999`, glitch `fuel: 0`) are never written to `FleetStore` or displayed. `AnomalyDashboardComponent` derives its rows **live** from `FleetStore.truckList()` joined with `TelemetryStore.trucks()` — classifying each affected truck as `speed`, `fuel`, or `both`, showing totals and per-truck rows; rows are clickable/keyboard-accessible and select the truck via `SelectedVehicleStore`. No new domain store backs the dashboard.

### 39.7 Filterable fleet view — ownership (as-built)

The filterable fleet view is owned entirely by `DashboardComponent` as **local UI state**: `filterText`, `filterStatus`, `filterAssignment`, and `lowFuelOnly` signals feed a `filteredTruckList` computed. No domain store is involved and `FleetStore` data is never mutated or filtered at the source. The fleet **map intentionally remains full-fleet** — filtering is a list-view concern only. Any filter change clears `SelectedVehicleStore`, so the Vehicle Detail panel resets rather than showing a hidden or irrelevant truck.

### 39.8 Known trade-offs (as-built)

- **Inline confirmation instead of a modal dialog component** — simpler, dependency-free, contained to `RouteManagementComponent`.
- **Custom CSS instead of Angular Material/CDK** — smaller, more predictable dependency surface.
- **Observability is runtime/in-app only** — derived from existing stores, not a dedicated metrics pipeline or external backend.
- **Fleet filtering is client-side and list-only** — it filters the loaded fleet (not a server query) and does not filter the map.
- **`fleet_reset`, `pong`, and WS `error` frames are intentionally ignored** in the current UI flow.
- **Not implemented:** geofencing and a command-palette / keyboard-shortcut system are out of scope and were not built.

### 39.9 Validation summary

- **408 tests passing** across **37 test files**.
- **Production build succeeds** — existing size-budget warnings only.
- **`mock-server/server.js` unchanged** — verified via `git diff -- mock-server/server.js` (empty diff).

### 39.10 Design-to-as-built divergence map

| Design (§) | As-built |
|------------|----------|
| Angular Material + CDK (tech table, §10, §31) | Custom CSS design system; no Material/CDK |
| `fleet-list` feature (§3, §9) | Fleet overview + filterable fleet view inside `DashboardComponent` |
| `dispatcher-presence` feature (§3, §9) | Presence indicator in dashboard header; viewer chips in vehicle-detail |
| `MetricsService` / `MetricsStore` (§6, §8, §28) | `TelemetryHealthStore` (dropped count) + display-only `ObservabilityPanelComponent`; `AnomalyDashboardComponent` derives live |
| `confirm-dialog` / `conflict-dialog` components (§10, §20) | Inline confirmation + inline conflict notice in `RouteManagementComponent` |
| `shared/ui` presentational components (§10) | Gauges/badges implemented inline within feature components |
| `fleet_reset` / `ResetCoordinator` / Dev reset (§26) | Not implemented; `fleet_reset` intentionally ignored |
| Selection store (not in §8 table) | `vehicle-selection/SelectedVehicleStore` added as selection source of truth |

---

### Traceability summary

Every quirk Q1–Q8 has: a server fact (SERVER_ANALYSIS §12), a SPEC requirement (FR/RM/DP), a design section here (§15–§27), and a test (T-1..T-10). Every SPEC acceptance criterion AC-1..AC-14 maps to a phase (P0–P9) and the sections that realize it. The architecture changes nothing in `mock-server/server.js` and adds no backend, NgRx, or Redis. The shipped implementation is recorded in **§39 (As-Built Architecture)**, which is authoritative wherever it diverges from the design-phase sections.
