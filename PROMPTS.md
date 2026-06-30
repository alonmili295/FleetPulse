# PROMPTS.md

## Overview

This document records how [Claude Code](https://claude.ai/code) was used as an AI coding assistant throughout the FleetPulse implementation. It is intentionally honest: the AI accelerated analysis, planning, code generation, and test writing, but every output was reviewed and corrected by hand before being accepted. The AI did not produce flawless output on the first try, and this document records where generated output was steered, rejected, or refined.

A hard rule was repeated in every prompt: **do not modify `mock-server/server.js`** — the server is read-only and is the source of truth.

---

## BMAD-Inspired Workflow

The project followed a **BMAD-inspired** process — a structured AI-assisted workflow that separates roles to prevent the AI from blending analysis, design, and implementation into a single undifferentiated output.

The four roles used:

| Role | What it does |
|---|---|
| **BMAD Analyst** | Reads sources, extracts facts, identifies risks — does not invent |
| **BMAD Architect** | Designs structure, layering, data flow, and trade-offs given the analysis |
| **BMAD Developer** | Implements incrementally within the agreed architecture |
| **Review / Refinement** | Human approval gate between every generated output |

**The loop for every implementation phase:**

```
Prompt → Design proposal → Manual review → Code generation → Review / refinement → Tests + build → Approval
```

Generated code was never accepted in bulk. Phases were regularly rejected and sent back with corrections before implementation was approved. Specific examples of outputs that were rejected or refined:

- **`SseClient`** was refined to remove a `core → domain` dependency; the discriminated-union event stream was the accepted design.
- **`TelemetryPipeline.start()`** was changed from a constructor side-effect to an explicit method with an idempotency guard after the constructor approach was rejected.
- **P4 `livePatch`** was refined after an initial version that would have written raw `speed: 999` and `fuel: 0` into `FleetStore`; the accepted version uses conditional spread to omit those keys entirely.
- **P5 popup** was rejected when it used raw HTML string interpolation; replaced with DOM/`textContent`-based construction to prevent XSS.

---

## BMAD Planning — Analyst and Architect Phases

Before any Angular code was written, four planning steps were completed. No implementation phase began until `ARCHITECTURE.md` was approved.

### Step 1 — BMAD Analyst: Mock Server Analysis

**Intent:** Understand the *actual* behaviour of `server.js` before writing anything — REST endpoints, SSE event types, payload shapes, required headers, error shapes (401/404/409/503), optimistic locking, and the 8 intentional server quirks.

**Artifact:** `docs/bmad/SERVER_ANALYSIS.md`

**How AI was used:** Claude read `server.js` and the assignment and produced a structured analysis: endpoint table, payload models, quirk-by-quirk breakdown, and a risks/assumptions section.

**Review & corrections:**
- Every endpoint, header, and payload field was verified against `server.js` directly.
- Subtle server details were confirmed that are easy to miss — the two different 409 response shapes (immediate version check vs. post-delay race check), that `If-Match` is compared via `parseInt` (bare integer string, not a quoted ETag), and that `POST /api/routes` does not block maintenance trucks while `reassign` does.
- These details were kept as explicit risks/assumptions so they would carry forward into the spec.

---

### Step 2 — BMAD Analyst: Server Integration Plan

**Intent:** Decide how to bring the provided server into the repository and run it locally without changing its behaviour.

**Artifact:** `docs/bmad/SERVER_INTEGRATION_PLAN.md`

**How AI was used:** Claude drafted the `mock-server/` folder layout, server `package.json`, root npm scripts, local dev flow, environment URLs, a validation checklist, and an explicit do-not-change list.

**Review & corrections:**
- npm scripts were corrected from `cd mock-server && npm start` to the cross-platform `npm --prefix mock-server start` form for consistent Windows behaviour.
- Confirmed the integration keeps `server.js` byte-for-byte unchanged, adding only a sibling `package.json` and lockfile.

---

### Step 3 — BMAD Analyst: Requirements and SPEC Extraction

**Intent:** Convert the assignment into an implementation-ready specification with stable requirement IDs traceable to server behaviour.

**Artifact:** `SPEC.md`

**How AI was used:** Claude generated a structured spec with requirement IDs (`FR`, `NFR`, `FO`, `RM`, `DP`, `VD`, `OB`, `SQ`, `PF`, `T`, `AC`) so quirks, requirements, tests, and acceptance criteria could be cross-referenced.

**Review & corrections:**
- A source-of-truth hierarchy was established: the server code wins over any planning document.
- Every requirement was traced back to a real server behaviour — no invented endpoints or fields.
- An encoding display issue was investigated: the spec appeared to contain mojibake (`â`, `Â§`) in some Windows editors, but byte-level inspection confirmed the file was already valid UTF-8. The fix was adding a UTF-8 BOM so Windows tooling detects the encoding correctly rather than blindly replacing characters that were already correct.
- A file path reference was corrected from `docs/bmad/assignment/...` to the actual location `docs/assignment/...`.

---

### Step 4 — BMAD Architect: Architecture Design

**Intent:** Design the Angular client architecture before implementation, fully traceable to `SPEC.md`.

**Artifact:** `ARCHITECTURE.md`

**How AI was used:** Claude produced a layered architecture document covering folder structure, layer responsibilities, data-flow design, per-quirk handling, resilience design, observability, testing architecture, trade-offs, and a phased implementation plan.

**Key decisions captured:**
- `shared / core / domain / features` layering with strict dependency direction
- Angular Signals for stable UI state; RxJS for transport streams — the boundary at the store edge
- Signal-based stores as the single source of trusted UI state
- Feature components render state only — no transport or business logic
- Leaflet for the map
- NgRx intentionally not selected for this time-boxed assignment — domain services plus Signal stores were the better trade-off
- Redis not implemented — the mock server is read-only and there is no real backend to cache for

**Review & corrections:**
- Early draft wording was refined: some decisions were initially framed as spec prohibitions (e.g. "SPEC NFR-7 explicitly forbids NgRx"). This was corrected to state them as deliberate engineering trade-offs — more accurate and professional.
- Framework wording was loosened from "no NgModules" to "Angular standalone components as the default structure".

---

## P0 — Scaffold

Each implementation phase followed the BMAD-style loop: **Prompt → Design proposal → Manual review → Code generation → Review/refinement → Tests + build → Approval.**

**Goal:** Create the Angular project scaffold and a baseline dashboard shell.

**How Claude was used:**
- Project setup and workspace configuration
- Initial file structure following `shared / core / domain / features` layers
- Dashboard placeholder shell with title, subtitle, and phase note

**Constraints:**
- Angular standalone components, strict TypeScript, `ChangeDetectionStrategy.OnPush`
- No business logic
- No server changes

**Validation:**
- App serves and renders
- Initial build and tests pass

---

## P1 — Shared Models and Core Basics

**Goal:** Define shared models, SSE message contracts, utility types, decoders, logging, and error handling basics.

**How Claude was used:**
- Generate typed models (`TruckListItem`, `TruckDetail`, `LatLng`, `RawReading`, `TruckReading`)
- Design and implement SSE message decoders with unknown-frame handling
- Suggest and enforce `shared` / `core` architectural boundaries
- Add tests for type guards, decoders, and utilities

**Constraints:**
- `shared` must stay framework-agnostic — no Angular imports
- `core` handles infrastructure only — no domain or business logic
- `TruckReading` extended `RawReading` with optional anomaly annotation fields (`speedSensorError`, `displaySpeed`, `fuelGlitch`, `displayFuel`) reserved for a later phase

**Review notes:**
- Decoder safety and unknown-frame handling were explicitly kept
- Architecture layer boundaries were reviewed and enforced

**Validation:**
- Tests passing
- Build clean

---

## P2 — REST Fleet Loading and Resilience

**Goal:** Implement REST fleet loading with 503 handling, Retry-After parsing, and circuit breaker behaviour.

**How Claude was used:**
- Implement `FleetApiService` and `FleetService` with observable-based data flow
- Implement `CircuitBreaker` and Retry-After header parsing
- Generate tests covering service-unavailable, retry, and breaker-open scenarios

**Constraints:**
- `FleetService` returns data — it does not directly mutate stores
- Circuit breaker applies only to fleet list loading; `getTruck` bypasses it
- No route management or 409 conflict logic in this phase
- No mock-server changes

**Review notes:**
- Circuit breaker scope was refined — an initial draft applied it too broadly
- The data-returning service design was preserved to keep domain stores separate from transport concerns

**Validation:**
- Tests passing
- Build clean

---

## P3 — Realtime Telemetry Pipeline and Live Dashboard

**Goal:** Connect SSE telemetry into domain stores and render a minimal live fleet dashboard.

**How Claude was used:**
- Design and implement `SseClient` with a discriminated-union event stream (`open`, `error`, `message`)
- Implement `FleetStore`, `ConnectionStore`, `TelemetryStore` as Angular signal stores
- Implement pure domain processors: `normalize`, `orderGuard`, `BatchProcessor`
- Implement `TelemetryPipeline` routing SSE events into stores
- Replace the P0 placeholder UI with a live fleet list with formatted speed, fuel, and coordinates
- Generate unit tests for pipeline, stores, processors, and dashboard

**Constraints:**
- `SseClient` stays in `core/realtime` — no knowledge of domain stores
- `TelemetryPipeline` owns all routing from SSE events into stores
- `orderGuard` uses timestamp as the sole authority for drop/accept decisions
- `gps_batch` collapsed by `BatchProcessor` into an ordered trail and a single latest position
- Per-truck `lastAcceptedTs` must be passed by the caller — never a global timestamp
- No anomaly detection, WebSocket, routes, map, or mock-server changes in this phase

**Review notes:**
- Rejected a proposed `core → domain` dependency in `SseClient`; the discriminated-union event API resolved this cleanly
- Pipeline `start()` was moved from a constructor side-effect to an explicit method with an idempotency guard after the constructor approach was rejected; `DashboardComponent` calls it explicitly
- Live telemetry location and values must override REST fallback values in the UI
- Speed formatted to 1 decimal, fuel to whole percent, coordinates to 4 decimal places

**Validation:**
- Live SSE connection reaches `Live` state in the connection banner
- All trucks render in the fleet list with live telemetry values
- All tests passing at the end of the phase
- Build clean

---

## P4 — Telemetry Anomaly Detection

**Goal:** Detect impossible sensor values and suppress them so the dashboard never displays bad data as trusted live readings.

**How Claude was used:**
- Implement pure `detectSpeedAnomaly`: `speed >= 999` → `speedSensorError: true`, carry forward last valid `displaySpeed`
- Implement pure `detectFuelGlitch`: `fuel === 0` → `fuelGlitch: true`, carry forward last valid `displayFuel`
- Integrate detectors into `TelemetryPipeline` after `orderGuard`, before store updates
- Annotate all accepted readings in `gps_batch` trails in timestamp order with carry-forward within the batch
- Update dashboard to display `displaySpeed`/`displayFuel` with `—` fallback and subtle anomaly CSS indicator classes
- Generate detector unit tests and pipeline integration tests

**Constraints:**
- Detectors must be pure functions — no Angular dependencies
- `speed >= 999` must never appear as a trusted speed value
- `fuel === 0` glitch must not overwrite the last safe fuel display value
- Detection happens after `orderGuard` so stale readings are already dropped
- `livePatch` must not write raw `speed: 999` or `fuel: 0` to `FleetStore`
- No map, WebSocket, routes, alerts, or mock-server changes

**Review notes:**
- An initial `livePatch` that would have written raw sensor values to `FleetStore` was rejected; the accepted version uses conditional spread — `speed` and `fuel` keys are omitted entirely when `displaySpeed`/`displayFuel` are not valid numbers
- Carry-forward within `gps_batch` required mutable cursor variables in the `trail.map()` loop so each reading inherits from the previous one in the batch
- Dashboard uses Angular's nullish coalescing: `(reading.displaySpeed | number:'1.0-1') ?? '—'`

**Validation:**
- `truck_7` speed 999 not shown in the UI; carried-forward speed or `—` shown instead
- Transient `fuel: 0` glitch shown as the carried-forward safe value or `—`
- All tests passing at the end of the phase
- Build clean

---

## P5 — Fleet Map Visualization

**Goal:** Add a Leaflet-based fleet map displaying live truck positions and historical trail polylines.

**How Claude was used:**
- Design `FleetMapComponent` as a standalone `OnPush` component
- Integrate Leaflet directly without an Angular wrapper library
- Derive `{ truck, live, history }[]` via `computed()` from both stores; sync to Leaflet via `effect()` and `ngAfterViewInit`
- Add the map section to `DashboardComponent`
- Generate tests with a mocked Leaflet module

**Constraints:**
- Feature belongs under `features/fleet-map`; component reads `FleetStore` and `TelemetryStore` only
- One `L.circleMarker` per truck — `gps_batch` history must not produce multiple separate markers
- One polyline trail per truck from `TelemetryStore.historyFor()`; only rendered when history has ≥ 2 points
- Location priority: `TelemetryStore.latestFor()?.location ?? truck.location`
- Popups must use sanitized `displaySpeed`/`displayFuel` with REST baseline fallback when no live telemetry exists yet
- No WebSocket, routes, dispatcher presence, alerts, or mock-server changes

**Review notes:**
- `L.circleMarker` selected over `L.marker` to avoid Leaflet default icon asset resolution issues
- Leaflet CSS imported globally in `styles.css`; `allowedCommonJsDependencies` added to `angular.json` to silence the CJS build warning
- Map centred on Tel Aviv `[32.0853, 34.7818]`
- Raw HTML string interpolation in popups was rejected and replaced with DOM/`textContent`-based `buildPopup()` to prevent XSS
- `ngOnDestroy` clears the `circleMarkers` and `trails` maps in addition to calling `map.remove()`
- Leaflet mock in `fleet-map.spec.ts` uses an explicit `mapMock` variable captured by closure; `mapMock.setView.mockReturnValue(mapMock)` makes the Leaflet chain explicit without relying on `mockReturnThis()`

**Validation:**
- Map renders in the dashboard below the fleet list
- Leaflet map initialises and centres on Tel Aviv
- Live truck positions shown as circle markers; trails render as polylines
- All tests passing at the end of the phase
- Production build clean, no warnings

---

## P6 — Route Management

**Goal:** Let dispatchers create, edit, reassign, and cancel routes from the dashboard. Handle optimistic locking (409) and maintenance-truck blocking.

**How Claude was used:**
- Design `RouteManagementComponent` and `RouteService` with full CRUD flow
- Implement `AuditLog` signal store for client-side operation history
- Generate optimistic-lock conflict resolution: fetch latest version, merge, retry
- Implement `ConflictResolver` as a pure function; route status badge CSS

**Constraints:**
- `RouteManagementComponent` is UI composition only — no direct HTTP calls
- Route status strings use hyphens: `'in-progress'`, not `'in_progress'`
- Maintenance trucks may not receive new route assignments (server enforces; client validates)
- No WebSocket, alerts, vehicle detail, or mock-server changes

**Review notes:**
- An early draft used `'in_progress'` (underscore); corrected to `'in-progress'` to match the server contract exactly
- `ConflictResolver` was kept as a pure function to keep it testable without Angular

**Validation:**
- Tests passing, build clean

---

## P7 — UI Polish

**Goal:** Apply a cohesive design system across all existing components.

**How Claude was used:**
- Define CSS custom properties (`--color-*`, `--space-*`, `--font-size-*`, `--radius-*`, `--shadow-*`) in `styles.css`
- Apply consistent status badges, card layouts, connection banners, and responsive breakpoints
- Improve dashboard layout and fleet-list column grid

**Constraints:**
- No Angular Material or any UI library — custom CSS only
- No new features, no application logic changes, no mock-server changes

**Validation:**
- Visual review of all sections; tests passing, build clean

---

## P8 — WebSocket Dispatcher Presence and Route Broadcasts

**Goal:** Connect the WebSocket and handle the full dispatcher presence lifecycle and route-change broadcasts from the server.

**How Claude was used:**
- Design `WsClient` as a pure transport (`send` / `messages$` / `state` signal)
- Design `PresenceService` lifecycle handling for registration, ping, reconnect cleanup, dispatcher join/leave, and route broadcasts
- Implement `PresenceStore` with `selfId`, dispatcher list, active count, WS state
- Handle `registered`, `dispatcher_joined`, `dispatcher_left`, `route_assigned`, `route_updated`, `route_reassigned` messages
- Add WebSocket presence indicator to the dashboard header
- Generate comprehensive lifecycle tests

**Constraints:**
- `WsClient` is transport-only — no domain logic
- `PresenceService` owns all message dispatch; no feature component sends WS messages
- `fleet_reset`, `pong`, and server error frames intentionally ignored
- No vehicle detail, dispatcher viewing, truck alerts, or mock-server changes

**Validation:**
- Tests passing, build clean

---

## P9/P10 — Vehicle Detail Panel, Dispatcher Viewing, and Truck Alerts

**Goal:** Add a vehicle detail panel that opens when a fleet item is clicked, shows live gauges and route info, displays other dispatchers currently viewing the same truck, and allows sending truck alerts.

**How Claude was used:**
- Design `SelectedVehicleStore`, `AlertsStore`, `VehicleDetailService`, `VehicleAlertApiService` as new domain/core units
- Extend `PresenceStore` with `DispatcherViewing`, `viewersForTruck()`, `pruneStaleViewers()` (10 s interval, 30 s TTL)
- Extend `PresenceService` with `viewing_truck` effect, stale-selfId lifecycle fix, `truck_alert` routing
- Implement `VehicleDetailComponent` with CSS conic-gradient gauges, mileage loading, route card, alert history, and alert form
- Wire `DashboardComponent` to inject `SelectedVehicleStore`, render `app-vehicle-detail`, handle click and keyboard selection on fleet items

**Critical design decisions:**
- `selfId` must be cleared on WS disconnect (`resetPresence()`) so a reconnect cannot send `viewing_truck` before the new `registered` arrives — the stale-selfId bug
- `lastSentViewingTruckId` reset *before* `setSelf()` in the `registered` handler to avoid an Angular effect scheduling race
- `detailSub?.unsubscribe()` at the start of `loadDetail()` cancels in-flight HTTP requests on truck change
- `AlertsStore` deduplicates by `alert.id` — REST 201 and WS broadcast both arrive; the second is dropped
- `canSendAlert` computed: `alertMsg().trim().length > 0 && !alertSending()` — submit button disabled when empty or whitespace

**Constraints:**
- `WsClient` stays transport-only; no `viewing_truck` logic inside it
- All alert HTTP logic stays in `VehicleAlertApiService`; `VehicleDetailComponent` never calls `HttpClient` directly
- `Dashboard` calls `selectedVehicleStore.selectTruck(id)` only; it does not send WS messages or load vehicle detail
- Route status string: `'in-progress'` (hyphen)
- No innerHTML with server data
- No mock-server changes

**Review notes and refinements (multi-round):**
- `PresenceStore` pruneStaleViewers test had both d1 and d2 stale; d2 timestamp corrected to 4000 (fresh) to make the test meaningful
- `VehicleDetailService` spec was refined so the second detail fixture used the correct `id: 'truck_2'` shape
- An initial alert button that was disabled only during sending was rejected; `canSendAlert` computed was added to also gate on non-empty message
- `vehicle-detail.spec.ts` was rejected for missing `render()` helper and `canSendAlert` tests; rewritten with `TestBed.flushEffects()` pattern
- `dashboard.spec.ts` was similarly upgraded to use a `render()` helper replacing all `whenStable()` patterns

**Validation:**
- 334 tests passing across 34 test files
- Production build successful — no errors, no warnings
- `git diff -- mock-server/server.js` empty

---

## Common Prompting Pattern

Every implementation phase followed the same BMAD-style structure:

1. **Context** — summarise completed phases and current architecture layer boundaries
2. **Goal** — one focused deliverable for this phase
3. **Explicit constraints** — what must not change (mock server, other phases, architecture rules)
4. **Design proposal first** — for non-trivial changes, a text-only design is proposed and approved before any code is written
5. **Review in small chunks** — code is inspected incrementally; phases were rejected and refined before approval, not accepted wholesale
6. **Architecture enforcement** — cross-layer dependency violations and scope creep were called out explicitly and corrected
7. **Tests required** — meaningful unit tests were part of the approval criteria for every phase
8. **Validation gate** — `npm test` and `npm run build` must pass before moving on

---

## Example Prompt Pattern

```
Start P{N} — {phase name}.

Context:
P0–P{N-1} are complete.
Current architecture:
- shared  = pure types and utilities, no Angular
- core    = infrastructure and transports, no domain logic
- domain  = signal stores and business rules
- features = UI composition only

Goal:
{concise phase goal}

Constraints:
- Do not modify mock-server/server.js
- Do not implement P{N+1} or later phases
- Respect architecture layer boundaries
- Detectors/processors must be pure where applicable
- Add meaningful tests for the new behaviour
- Run npm test and npm run build before reporting complete

Before coding, propose:
- files to add or change with layer ownership
- key design decisions
- test cases to cover
```

---

## Final Notes

The implementation was delivered incrementally from P0 through P9/P10, with each phase reviewed before proceeding to the next. Claude Code was used throughout — for planning, code generation, refactoring, and test writing — following a BMAD-inspired workflow that kept analysis, architecture, and implementation as distinct, sequential steps with a human approval gate between each.

Generated output was not accepted uncritically. Several outputs were rejected and corrected: an `SseClient` with an illegal cross-layer dependency, a pipeline that initialised as a constructor side-effect, a `livePatch` that would have written sensor-error values into the fleet store, a popup built from raw HTML string interpolation, a stale WebSocket `selfId` reconnect bug, and unstable Angular specs that used `whenStable()` without a reliable render helper.

The final result delivers realtime SSE telemetry, anomaly-safe fleet display, a Leaflet fleet map, route management, WebSocket dispatcher presence, collaborative truck viewing, a vehicle detail panel, and truck alert sending — all without modifying the mock server.
