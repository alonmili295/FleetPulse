# FleetPulse — Product & Engineering Specification

**Status:** Draft for implementation  
**Stack:** Angular (TypeScript), RxJS/Signals for reactive state, native `EventSource` + `WebSocket`  
**Backend:** Provided mock server only — `mock-server/server.js`, unchanged  

### Source-of-truth hierarchy

| Source | Authoritative for |
|--------|-------------------|
| `docs/assignment/senior-test-4-assignment.html` | Business requirements, evaluation criteria, scope |
| `docs/bmad/SERVER_ANALYSIS.md` | Actual API behaviour, payload shapes, quirks |
| `docs/bmad/SERVER_INTEGRATION_PLAN.md` | Server setup, scripts, URLs, do-not-change list |
| `mock-server/server.js` | Ground truth where any document disagrees |

Where this spec and the server code conflict, **the server code wins** and this spec must be corrected — the frontend adapts to the server, never the reverse.

---

## 1. Product Goal

FleetPulse is a real-time fleet management dashboard for dispatchers managing 12 delivery trucks around Tel Aviv. Dispatchers must be able to **trust** what the dashboard shows, despite a telemetry backend that batches GPS, glitches sensors, delivers events out of order, and serves stale presence data.

The product solves three concrete failures called out in the assignment story:

1. **Double-dispatch** — two dispatchers assigning the same job → solved by optimistic locking + conflict UX.
2. **Wrong fuel reading** — dashboard showed 80% when truck was at 15% → solved by sensor-anomaly filtering that distinguishes real low fuel from glitch readings.
3. **Silent reassignment clobbering** — a dispatcher overwrites another's change with no audit → solved by version-aware conflict resolution and an audit log.

The senior-level objective is not "make it work" but to demonstrate **a decoupled telemetry pipeline, resilient event handling, and defensible concurrency design**. A correct-but-naive dashboard that ignores the quirks scores lower than an incomplete one that handles them thoughtfully (assignment Tips).

---

## 2. Functional Requirements

Requirements are ID'd `FR-n` for traceability into acceptance criteria (§16) and tests (§14).

| ID | Requirement |
|----|-------------|
| **FR-1** | Display all 12 trucks with live position, updated from the SSE telemetry stream. |
| **FR-2** | Visually distinguish truck status: `active`, `idle`, `maintenance`. |
| **FR-3** | Render GPS batch readings as a path/trail or latest position — never 10–30 discrete markers for one truck. |
| **FR-4** | Order telemetry by `timestamp`, not arrival order; discard readings older than the last accepted reading for that truck. |
| **FR-5** | Detect and suppress the stuck speed sensor (truck_7 reporting 999 km/h) — flag/clamp/annotate, never show 999 as truth. |
| **FR-6** | Detect the fuel-sensor glitch (transient 0%) and suppress false low-fuel alerts. |
| **FR-7** | Retry `GET /api/fleet` on 503 honouring the `Retry-After` header. |
| **FR-8** | Create routes with truck assignment (`POST /api/routes`). |
| **FR-9** | Update route status through the lifecycle `assigned → in-progress → completed / cancelled` (`PATCH`). |
| **FR-10** | Send the route `_version` in the `If-Match` header on every PATCH (optimistic locking). |
| **FR-11** | Handle 409 conflicts gracefully and show **who** caused the conflicting change. |
| **FR-12** | Reassign a route to a different truck (`PUT …/reassign`). |
| **FR-13** | Show a route history / audit log (who assigned, modified, reassigned, when). |
| **FR-14** | Register as a dispatcher over WebSocket and show all other active dispatchers. |
| **FR-15** | Show which truck each dispatcher is currently viewing (collaborative cursor). |
| **FR-16** | Tolerate ghost presence — a delayed `dispatcher_left` must not break the UI or double-remove. |
| **FR-17** | Open a vehicle detail panel on truck click showing speed, fuel, engine temp, mileage. |
| **FR-18** | Render live-updating gauges/charts for speed, fuel, and temperature in the detail panel. |
| **FR-19** | Send alerts to a specific truck (`POST …/alert`) and surface incoming `truck_alert` broadcasts. |
| **FR-20** | Show the assigned route details within the vehicle detail panel. |
| **FR-21** | Reflect WebSocket route events (`route_assigned`, `route_updated`, `route_reassigned`) in the UI in real time across all dispatchers. |
| **FR-22** | Handle `fleet_reset` broadcasts by re-syncing state. |

---

## 3. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| **NFR-1** | **Decoupling** — the telemetry ingestion pipeline (SSE/WS parse → normalize → anomaly-filter → state) must be independent of UI components. A new vehicle type or widget should not require touching ingestion. (Architectural Design, 20% weight.) |
| **NFR-2** | **Event-driven lifecycle** — SSE and WS connections must have explicit connect/disconnect/reconnect/cleanup handling; no leaked subscriptions or timers. |
| **NFR-3** | **Run for hours** — 12 trucks × updates every 2 s must not leak memory or degrade. Telemetry history must be windowed/bounded. |
| **NFR-4** | **Throttled rendering** — high-frequency updates must not cause unbounded change-detection or map re-renders. |
| **NFR-5** | **Resilience** — graceful degradation on 503, SSE drop, WS drop; circuit-breaker behaviour for repeated 503 (see §11/§15-Q7). |
| **NFR-6** | **Type safety** — TypeScript models mirror server payloads exactly (§4–§6); discriminated unions for SSE/WS message types. |
| **NFR-7** | **No NgRx, no Redis, no real backend, no DB.** State management uses Angular services with RxJS and/or Signals. The mock server is the only backend. |
| **NFR-8** | **Configurability** — all server URLs come from `src/environments/*` per the integration plan; nothing hardcoded in services. |
| **NFR-9** | **Build/run contract** — `npm install && npm start` runs the app; `npm test` runs tests; `npm run server` runs the mock server (per integration plan §3). |

---

## 4. REST Responsibilities

The frontend consumes the following endpoints exactly as the server exposes them (`SERVER_ANALYSIS.md` §3). Base URL: `http://localhost:3000/api`.

| Method / Path | Frontend responsibility |
|---------------|------------------------|
| `GET /api/fleet` | Initial fleet load + polling baseline. **Must** handle 15% 503 with `Retry-After` retry and circuit breaker. Strips no fields client-side; note response omits `mileage`/`lastUpdate`. |
| `GET /api/fleet/:truckId` | Fetch full truck detail (includes `mileage`, `lastUpdate`) for the detail panel and for re-sync after conflicts. |
| `GET /api/routes` | Load all routes for the route list/audit log. |
| `POST /api/routes` | Create route. Must send `X-Dispatcher-Id`. Handle 400 (missing fields), 404 (unknown truck), 409 (truck already assigned → show `assignedBy`). |
| `PATCH /api/routes/:routeId` | Update status/notes/priority. Must send `X-Dispatcher-Id` **and** `If-Match: <_version>` as a plain integer string. Handle both 409 shapes (immediate + post-delay). Expect 200–1000 ms latency. |
| `PUT /api/routes/:routeId/reassign` | Reassign to `newTruckId`. Handle 400 (target in maintenance), 404, 409 (target already assigned). |
| `POST /api/fleet/:truckId/alert` | Send alert; always include `X-Dispatcher-Id` for consistency even though server does not enforce it here. |
| `GET /api/telemetry/history/:truckId` | Optional historical seed for detail charts. Treat as **simulated, non-persistent** noise — not authoritative history. |
| `POST /api/reset` | Dev-only. Guard behind a confirmation in a debug surface; expect a `fleet_reset` WS broadcast to follow. |

**Headers the frontend must send (`SERVER_ANALYSIS.md` §4):**
- `X-Dispatcher-Id` — on POST/PATCH/PUT routes and alerts. Exact casing required (CORS allow-list).
- `If-Match` — plain integer (`"3"`), not a quoted ETag. The server uses `parseInt`; a quoted value becomes `NaN` and never matches.
- `Content-Type: application/json` on all bodies.

---

## 5. SSE Responsibilities

Endpoint: `GET /api/telemetry/stream`. All messages are default-type `data:` frames; the discriminator is the JSON `type` field (`SERVER_ANALYSIS.md` §7).

| Event `type` | Frontend responsibility |
|--------------|------------------------|
| `connected` | One-shot on connect (`truckCount: 12`). Mark stream healthy; reset reconnect/backoff counters. |
| `heartbeat` | Every 15 s. Use as a liveness signal; if absent beyond a threshold, treat the stream as stalled and reconnect. |
| `telemetry` | Every ~2 s, 12 readings. Normalize → apply timestamp ordering (FR-4) → anomaly-filter (FR-5, FR-6) → update truck state. One reading per event may carry `_reordered` (Q5). |
| `gps_batch` | 10–30 historical readings for one truck. Sort by `timestamp`, collapse to a trail + latest position; do not spam markers or fire alerts from historical points (FR-3). |

**Connection management (NFR-2):**
- Reconnect with backoff on error/close. `EventSource` auto-reconnects, but the app must still surface connection state and reset internal counters on re-`connected`.
- The server provides **no** `Last-Event-ID` / replay — accept and signal a data gap after reconnection (`SERVER_ANALYSIS.md` §14 risk). Re-fetch `GET /api/fleet` to re-baseline after a gap.
- Clean up the `EventSource` and any timers on destroy.

**Reading model (per truck reading):**
`{ truckId, location:{lat,lng}, speed, heading, fuel, engineTemp, status, timestamp, _reordered?, _batch?, _batchIndex?, _batchTotal? }`

---

## 6. WebSocket Responsibilities

Endpoint: `ws://localhost:3000/ws` (`SERVER_ANALYSIS.md` §8). No auth to open; identity established via `register_dispatcher`.

**Client → Server (must implement):**

| Message | When |
|---------|------|
| `register_dispatcher` `{ dispatcherId?, name? }` | On connect, before any `viewing_truck`. Store returned `dispatcherId`. |
| `ping` | Keepalive on an interval; expect `pong`. |
| `viewing_truck` `{ truckId }` | When the dispatcher opens/focuses a truck. |

**Server → Client (must handle all):**

| Message | Responsibility |
|---------|----------------|
| `registered` | Capture own `dispatcherId`. |
| `pong` | Liveness/latency measurement (feeds observability §11). |
| `dispatcher_joined` | Add to presence roster; update active count. |
| `dispatcher_left` | Remove from roster — **idempotently** (may be delayed/ghost, Q6). Ignore if unknown. |
| `dispatcher_viewing` | Update collaborative-cursor indicator for that dispatcher. |
| `route_assigned` | Apply new route; mark truck assigned; update version cache. |
| `route_updated` | Apply route changes; update `_version` from payload; refresh audit log. |
| `route_reassigned` | Move route between trucks; update both trucks + version. |
| `truck_alert` | Surface alert (toast/badge) for the target truck. |
| `fleet_reset` | Clear local route/presence/telemetry state and re-baseline via REST. |
| `error` | Log; indicates malformed client message. |

**Lifecycle:** reconnect with backoff; on reconnect, re-`register_dispatcher` and reconcile presence; clear stale viewing indicators; clean up ping interval and socket on destroy.

---

## 7. Fleet Overview Requirements

| ID | Requirement |
|----|-------------|
| **FO-1** | Map or coordinate grid showing 12 trucks at live positions (map quality is not graded — Leaflet, Canvas, or grid all acceptable). |
| **FO-2** | Status-coded markers: active / idle / maintenance distinct at a glance. |
| **FO-3** | Each marker reflects the **latest non-stale** reading (timestamp-ordered). |
| **FO-4** | Batch readings render as a path/trail, latest point becomes current position. |
| **FO-5** | Per-truck summary (name, status, speed*, fuel*, route) where `*` shows sanitized values (no 999, no glitch-0). |
| **FO-6** | Bonus-eligible: filterable view (status, fuel level, region, route assignment). |
| **FO-7** | Connection-state indicator (SSE/WS up/down, degraded/stale) visible to the dispatcher. |

---

## 8. Route-Management Requirements

| ID | Requirement |
|----|-------------|
| **RM-1** | Create-route form: select truck + destination (required), priority + notes (optional). Client-side validation before submit (FR-8, §12). |
| **RM-2** | Prevent assigning to a `maintenance` truck in the UI (server does **not** guard this on `POST /api/routes` — frontend must, per `SERVER_ANALYSIS.md` assumptions). |
| **RM-3** | Status transitions UI enforces valid lifecycle (`assigned → in-progress → completed/cancelled`); server does not validate transitions. |
| **RM-4** | Every PATCH sends `If-Match` with the cached route `_version`. |
| **RM-5** | On **409 (Scenario B)** — `{ currentVersion, yourVersion, lastModifiedBy }`: show who changed it, re-fetch latest, offer retry-with-new-version or cancel. |
| **RM-6** | On **409 (Scenario C, post-delay race)** — `{ currentVersion }` only (no `yourVersion`/`lastModifiedBy`): handle the **different shape** without crashing; same recovery path. |
| **RM-7** | On **409 (Scenario A, POST)** — truck already assigned: show `assignedBy` + existing `currentRouteId`; offer to view/edit that route. |
| **RM-8** | On **409 (Scenario D, reassign)** — target truck busy: explain and let dispatcher pick another truck. |
| **RM-9** | Confirmation prompt on destructive/critical actions: cancel route, reassign, reset (§12). |
| **RM-10** | Audit log: chronological list of assign/modify/reassign events with actor (`assignedBy`/`lastModifiedBy`/`reassignedBy`) and timestamps (FR-13). |
| **RM-11** | Version cache updated from every mutation **response** and every relevant **WS broadcast**, so the next PATCH carries a fresh `If-Match`. |
| **RM-12** | Bonus-eligible: side-by-side version diff on conflict, letting the dispatcher choose. |

---

## 9. Dispatcher-Presence Requirements

| ID | Requirement |
|----|-------------|
| **DP-1** | Register on connect with a dispatcher name; persist own `dispatcherId`. |
| **DP-2** | Roster of active dispatchers with live count (`activeDispatchers` from joined/left). |
| **DP-3** | Collaborative cursor: show which truck each other dispatcher is viewing (`dispatcher_viewing`). |
| **DP-4** | Ghost-safe removal: `dispatcher_left` is idempotent; unknown IDs ignored; no flicker/crash when a delayed leave (up to 10 s) arrives (Q6). |
| **DP-5** | Stale-viewing cleanup: a viewing indicator should expire if not refreshed (defensive, since the server has no "stopped viewing" event). |
| **DP-6** | On WS reconnect, rebuild presence from scratch (re-register; old roster may be stale). |

---

## 10. Vehicle-Detail Requirements

| ID | Requirement |
|----|-------------|
| **VD-1** | Open on truck click/selection; emit `viewing_truck` over WS. |
| **VD-2** | Show speed, fuel, engine temp, mileage (mileage from `GET /api/fleet/:truckId`). |
| **VD-3** | Live gauges/charts for speed, fuel, temp, fed by the sanitized telemetry stream. |
| **VD-4** | Sanitized display: speed clamped/flagged when sensor-error (999); fuel shows last-valid + glitch indicator during a glitch window. |
| **VD-5** | Show assigned route details (destination, status, priority, notes, actors). |
| **VD-6** | Alert composer: message + severity (`info`/`warning`/…); send via `POST …/alert`. |
| **VD-7** | History seed optional via `GET …/history/:truckId`, clearly treated as illustrative not authoritative. |

---

## 11. Observability Requirements

Developer-facing, not for dispatchers (assignment Bonus + Performance/Observability 15%).

| ID | Requirement |
|----|-------------|
| **OB-1** | SSE events/second and last-event age. |
| **OB-2** | WebSocket round-trip latency (from `ping`/`pong`). |
| **OB-3** | Dropped/stale/reordered reading counts (telemetry discarded by FR-4). |
| **OB-4** | Reconnection counts for SSE and WS. |
| **OB-5** | Anomaly counters: fuel-glitch events, speed-stuck events, 503s, 409s — with timestamps (feeds the bonus Anomaly Detection Dashboard). |
| **OB-6** | Circuit-breaker state surface (closed / open / probing) for `GET /api/fleet`. |

These are **bonus** for scope but the spec defines them so the architecture leaves room (counters emitted from the pipeline, not bolted onto UI).

---

## 12. Security & Quality Requirements

| ID | Requirement |
|----|-------------|
| **SQ-1** | Always send `X-Dispatcher-Id`; treat its absence as an app bug (the server 401s for routes). |
| **SQ-2** | Input validation on all forms (route create, reassign target, alert message) before hitting the API; reject empty/invalid. |
| **SQ-3** | Confirmation dialogs on critical/destructive actions: cancel route, reassign, send alert (optional), reset fleet (required). |
| **SQ-4** | Error boundaries: a failed request, malformed event, or thrown handler must not crash the dashboard. |
| **SQ-5** | Conflict UX is explicit and actionable (not a silent failure or a raw 409 toast). |
| **SQ-6** | No secrets, no eval of server data; render server strings as text (no HTML injection from `notes`/`message`/`name`). |
| **SQ-7** | `POST /api/reset` exposed only in a clearly-marked dev surface, never on a primary dispatcher path. |

---

## 13. Performance Requirements

| ID | Requirement |
|----|-------------|
| **PF-1** | Sustain 12 trucks × ~2 s telemetry (plus batches) for hours without memory growth. |
| **PF-2** | Bounded telemetry history per truck (ring buffer / windowed array); old points evicted. |
| **PF-3** | Render throttling/coalescing: batch state→view updates (e.g., animation-frame or interval coalescing) so change detection is not driven per-event for all 12 trucks. |
| **PF-4** | Map updates use marker mutation, not full re-creation, per tick. |
| **PF-5** | Use `OnPush` change detection (or Signals) and `trackBy` for truck/route lists. |
| **PF-6** | Batch processing (10–30 readings) is O(n) and does not block the main thread or trigger 30 renders. |

---

## 14. Testing Requirements

Minimum **8 meaningful** test cases (assignment §5). Tests target **pure logic**, not "renders" smoke tests. Runner: Jest, Vitest, or Karma/Jasmine — runs via `npm test`. The mock server is **not** required for unit tests (integration plan §4.3); all I/O is mocked.

| ID | Test (maps to FR/Quirk) |
|----|--------------------------|
| **T-1** | GPS batch processing: 10–30 readings collapse to one trail + correct latest position (FR-3 / Q1). |
| **T-2** | Out-of-order handling: a reading with an older `timestamp` than last-accepted is discarded; newer is applied (FR-4 / Q5). |
| **T-3** | Fuel anomaly: transient 0% after high prior readings is classified as glitch (suppressed); a genuine declining-to-low sequence is **not** suppressed (FR-6 / Q2). |
| **T-4** | Speed anomaly: 999 km/h on truck_7 is flagged/clamped and excluded from computations; normal speeds pass (FR-5 / Q3). |
| **T-5** | Optimistic locking happy path: PATCH sends correct `If-Match`; version cache advances on 200 (FR-10 / Q4). |
| **T-6** | Conflict resolution: 409 Scenario B parsed → exposes `lastModifiedBy` + `currentVersion`; retry uses refreshed version (FR-11 / Q4). |
| **T-7** | Conflict shape robustness: 409 Scenario C (only `currentVersion`) handled without error (RM-6 / Q8). |
| **T-8** | Ghost presence: duplicate/late `dispatcher_left` for an already-removed ID is a no-op; roster stays consistent (FR-16 / Q6). |
| **T-9** | 503 retry honours `Retry-After`; 3 consecutive 503s open the circuit breaker (FR-7 / Q7). |
| **T-10** | WS event reducers: `route_reassigned` moves the route and updates both trucks' assignment + version (FR-21). |

T-1…T-8 are the required core; T-9/T-10 strengthen coverage.

---

## 15. The 8 Server Quirks — Expected Frontend Behaviour

Quirk facts are fixed by `mock-server/server.js` and `SERVER_ANALYSIS.md` §12. The server is **never** changed (integration plan §9); the frontend absorbs each.

### Q1 — GPS Batch (signal recovery)
**Server:** ~10% of 2 s ticks, a random active truck emits `gps_batch` with 10–30 readings, timestamps 2 s apart going back in time, ordered oldest-first (`_batchIndex` 0..n).  
**Frontend:** Sort by `timestamp`; render as a single trail/polyline; set current position to the **max-timestamp** reading; do **not** create per-reading markers; do **not** fire fuel/speed alerts from historical batch points. (FR-3, FO-4, T-1.)

### Q2 — Fuel Sensor Glitch (hard braking)
**Server:** Active trucks >40 km/h, 5%/2 s, report `fuel: 0` for 2–4 s while real fuel keeps decrementing internally.  
**Frontend:** Keep a short rolling fuel history per truck. A sudden 0 after recent plausible (>5%) readings = glitch → retain last-valid value, show transient "sensor glitch" indicator, **suppress** low-fuel alert, auto-clear when valid readings resume. A genuine gradual decline to low fuel must still alert. (FR-6, VD-4, T-3.)

### Q3 — Speed Sensor Stuck (truck_7)
**Server:** truck_7, 8%/3 s, reports `speed: 999` for 5–10 s; real movement continues.  
**Frontend:** Treat speeds above a realistic threshold (e.g. ≥200 km/h) as sensor error → flag `SENSOR ERR` / clamp, exclude from any computation (ETA, alerts), never show 999 as truth, auto-clear on valid readings. (FR-5, VD-4, T-4.)

### Q4 — Optimistic Locking 409 (version mismatch)
**Server:** `PATCH` checks `If-Match` vs `route._version` immediately; mismatch → 409 `{ currentVersion, yourVersion, lastModifiedBy }`.  
**Frontend:** Always send `If-Match` (plain int string). On 409, show who changed it, re-fetch route, update version cache, offer retry/cancel (optionally a diff). (FR-10, FR-11, RM-4/RM-5, T-5/T-6.)

### Q5 — Out-of-Order GPS Timestamps
**Server:** ~10% of telemetry events, one reading is backdated 3–8 s and flagged `_reordered: true`.  
**Frontend:** Authoritative guard is **timestamp comparison vs last-accepted per truck** — discard if older. `_reordered` is informational only. Same staleness guard also applies inside batch processing. (FR-4, T-2; feeds OB-3.)

### Q6 — Ghost Dispatcher Presence
**Server:** 20% of disconnects delay the `dispatcher_left` broadcast by 10 s; the dispatcher record lingers server-side meanwhile.  
**Frontend:** Presence keyed by `dispatcherId`; `dispatcher_left` idempotent (unknown id → ignore); no flicker/crash when the late leave arrives; do not infer offline purely from a timeout. (FR-16, DP-4, T-8.)

### Q7 — 503 Under Load (`GET /api/fleet`)
**Server:** 15% of calls return 503 + `Retry-After: 3`; purely random, no server state.  
**Frontend:** Read `Retry-After`, wait that many seconds, single retry (no tight loop), show "retrying in Xs". After **3 consecutive 503s**, open a circuit breaker → degraded mode showing last-good fleet data with a "stale as of HH:MM:SS" banner; low-cadence recovery probe; on 200 close circuit and reset counter. (FR-7, NFR-5, OB-6, T-9.)

### Q8 — PATCH Race with Reassignment
**Server:** After a valid initial check, PATCH waits 200–1000 ms then re-checks `_version`; if a concurrent reassign bumped it, 409 `{ currentVersion }` (no `yourVersion`/`lastModifiedBy`).  
**Frontend:** Handle this **second** 409 shape identically to Q4 but tolerant of the leaner payload; re-fetch, refresh version, present resolution. Note the race can be self-inflicted by rapid clicks. (RM-6, T-7.)

---

## 16. Acceptance Criteria

The build is acceptable when **all** hold:

1. **AC-1 (Setup)** — `npm run server:install` then `npm run server` boots the unchanged mock server; `npm install && npm start` serves the app; `npm test` runs green. (Integration plan §3–§4.)
2. **AC-2 (Live fleet)** — All 12 trucks appear with live, timestamp-ordered positions and correct status styling. (FR-1/2/4, FO-1/2/3.)
3. **AC-3 (Batch)** — A `gps_batch` produces a trail + single current position, never 10–30 markers, no spurious alerts. (Q1, FR-3.)
4. **AC-4 (Speed sanity)** — truck_7 never displays 999 km/h; it is flagged and excluded from computation. (Q3, FR-5.)
5. **AC-5 (Fuel sanity)** — A glitch 0% does not raise a low-fuel alert; a real low-fuel does. (Q2, FR-6.)
6. **AC-6 (Ordering)** — A backdated reading does not move a truck backwards in the UI. (Q5, FR-4.)
7. **AC-7 (Locking)** — Two dispatchers editing the same route: one succeeds, the other gets a clear conflict showing the other's identity and a working retry. (Q4/Q8, FR-10/11, RM-5/6.)
8. **AC-8 (Reassign)** — Reassigning to a busy or maintenance truck is handled with a clear message, not a crash. (RM-8, Q4 D / 400.)
9. **AC-9 (Presence)** — Two tabs show each other in the roster and viewing indicators; closing one (incl. the 10 s ghost case) cleanly removes it with no error. (Q6, FR-14/15/16.)
10. **AC-10 (503 resilience)** — Forced/observed 503s trigger Retry-After-respecting retries; 3 in a row show degraded/stale mode and recover. (Q7, FR-7.)
11. **AC-11 (Detail)** — Clicking a truck shows live gauges (sanitized), route details, mileage, and can send an alert that other tabs receive. (FR-17/18/19/20.)
12. **AC-12 (Audit)** — The route audit log shows assign/modify/reassign with actor + time. (FR-13, RM-10.)
13. **AC-13 (Tests)** — ≥8 meaningful tests covering batch, ordering, fuel anomaly, speed anomaly, locking/conflict, ghost presence (T-1…T-8 minimum). (§14.)
14. **AC-14 (Stability)** — Runs for an extended session without memory growth or runaway rendering. (PF-1…PF-6.)

---

## 17. Out of Scope

- Modifying `mock-server/server.js` or any server behaviour, endpoint, payload, header, SSE event, or WS message.
- Building a real backend, controllers, services-layer-on-a-server, database, or auth system.
- Redis or any external datastore / cache / queue.
- **NgRx** or any mandated global-store library (use Angular services + RxJS/Signals).
- True persistence — server state is in-memory and resets on restart; treat history as illustrative.
- Production deployment, SSO, real GPS providers, multi-tenant fleets.
- Map cartographic quality / styling polish (explicitly not graded).
- Mobile/responsive perfection beyond reasonable layout.

---

## 18. Risks & Assumptions

Carried from `SERVER_ANALYSIS.md` §14, with frontend implications.

**Risks**

| Risk | Implication |
|------|-------------|
| No SSE replay (`Last-Event-ID`) | Missed events during a drop are lost → must re-baseline via `GET /api/fleet` on reconnect; signal a gap. |
| `GET /api/fleet` is the only 503 source and the initial loader | Circuit breaker could open before first success → handle empty initial state gracefully; keep probing. |
| `POST /api/routes` does **not** block maintenance trucks | Frontend must prevent it (RM-2); otherwise truck_7 (initially maintenance) could be activated unexpectedly. |
| Alert endpoint doesn't enforce `X-Dispatcher-Id` | Still always send it; don't rely on server validation. |
| History endpoint is randomized per call | Never present as authoritative history; label as illustrative. |
| `reset` is unauthenticated + destructive | Hide behind dev surface + confirmation (SQ-7). |
| Reordered/ghost/race quirks are probabilistic | Tests must drive logic with **deterministic fixtures**, not rely on observing the live server. |

**Assumptions**

| Assumption | Basis |
|------------|-------|
| Truck IDs are stable `truck_1`…`truck_12` across resets. | `initFleet()` deterministic ordering. |
| `If-Match` is a bare integer string; quoted ETags break it. | Server uses `parseInt(ifMatch)`. |
| Server status transitions are unvalidated; UI enforces the lifecycle. | PATCH sets status unconditionally. |
| `telemetry` and `gps_batch` may interleave within a 2 s window. | Both emitted from `sendTelemetrySSE()`. |
| Initial statuses: truck_4 & truck_10 idle, truck_7 maintenance, rest active. | `initFleet()` status array. |
| Realistic speed ceiling ~80 km/h (sim clamps to 80); 999 is unambiguously a sensor error. | `simulateTrucks()` clamps speed ≤80. |

---

## 19. Senior-Level Success Criteria

Beyond passing acceptance, the defense interview (assignment warning) expects the candidate to demonstrate:

| Dimension (assignment weight) | What "senior" looks like here |
|-------------------------------|------------------------------|
| **Architecture (20%)** | Telemetry pipeline cleanly separated from UI; quirk-handling lives in a normalization/anomaly layer, not in components; adding a new vehicle type or widget requires no edits to existing ingestion. (NFR-1.) |
| **Event-driven (15%)** | Typed, discriminated SSE/WS message handling; explicit connect/reconnect/cleanup; no leaked timers/subscriptions; reconnection re-baselining. (NFR-2, §5/§6.) |
| **Race & async (20%)** | Demonstrable, deterministic handling of ordering, batching, both 409 shapes, ghost presence, and 503 backoff — proven by tests, not luck. (§15, §14.) |
| **Performance & resilience (15%)** | Windowed history, throttled rendering, circuit breaker; argues why it survives a multi-hour session. (§13, Q7.) |
| **Security & quality (10%)** | Auth header discipline, validation, confirmations on critical actions, error boundaries, conflict UX that names the other actor. (§12.) |
| **Testing (10%)** | Edge-case logic tests (anomaly classification, conflict, batch, ordering, ghost) — not render smoke tests. (§14.) |
| **AI usage (10%)** | `PROMPTS.md` shows strategic, iterative, critically-evaluated AI use. (Tracked separately; not code.) |

**Defining test of seniority:** when two dispatchers clash, each sees a coherent, truthful, actionable state — nobody silently loses work, and the dashboard never shows a number (999 km/h, glitch 0% fuel, a backwards GPS jump) that a dispatcher would be wrong to trust.
