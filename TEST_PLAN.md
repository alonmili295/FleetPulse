# FleetPulse — Test Plan

**Status:** QA design for implementation (no test code yet)
**Role:** BMAD QA / Test Architect
**Companion to:** `SPEC.md` (requirements + IDs), `ARCHITECTURE.md` (layers + pure processors), `docs/bmad/SERVER_ANALYSIS.md` (API truth), `mock-server/server.js` (ground truth)

### Source-of-truth hierarchy

| Source | Authoritative for |
|--------|-------------------|
| `mock-server/server.js` | Final tie-breaker for any observable behaviour and quirk timing |
| `SPEC.md` | Requirement IDs (FR/NFR/FO/RM/DP/VD/OB/SQ/PF/T/AC) and acceptance |
| `ARCHITECTURE.md` | Layer boundaries, pure-processor design, which unit owns which logic |
| `docs/bmad/SERVER_ANALYSIS.md` | Endpoint/payload/error shapes, the 8 quirks |
| `docs/assignment/senior-test-4-assignment.html` | Min 8 tests, evaluation weights |

Where this plan and `server.js` disagree, the server wins and this plan is corrected.

---

## 1. Testing Strategy Overview

The architecture deliberately pushes all quirk-handling and concurrency logic into **pure domain processors and services** (`ARCHITECTURE.md` §7/§14–§27). The test strategy exploits that: the highest-value, most numerous tests are **fast pure unit tests over deterministic fixtures**, with a thin layer of Angular service/component tests where DI or rendering genuinely matters, topped by a **manual/integration pass** against the live mock server for the probabilistic, multi-tab behaviours that can't be asserted deterministically.

Guiding principles:

1. **Test the logic, not the framework.** Anomaly classification, batch collapse, order guarding, conflict resolution, circuit-breaker transitions, and presence reconciliation are pure → unit-tested without TestBed.
2. **Determinism over probability.** Every server quirk is probabilistic (`Math.random()` gated). Tests **never** observe the live server for pass/fail; they feed hand-built fixtures that reproduce the quirk's *payload* and *timing* exactly (assignment + SPEC §18, §14).
3. **Fake time, never sleep.** All retry/backoff/TTL/heartbeat logic uses injectable clocks / fake timers; no real `setTimeout` waits in unit tests.
4. **Behaviour at the seam.** Service tests assert what the service does with a mocked transport (HttpClient/EventSource/WebSocket), not the transport's internals.
5. **Truthful-UI assertions.** The defining quality bar (SPEC §19, AC-4/5/6): the system must never surface 999 km/h, a glitch-0% low-fuel alert, or a backwards GPS jump. These get explicit negative assertions.
6. **Traceability.** Every test maps to a SPEC requirement and (where relevant) a quirk Q1–Q8, so coverage gaps are visible (§7/§8).

---

## 2. Scope of Testing

In scope:

- **Domain processors (pure):** `BatchProcessor`, `orderGuard`, `SpeedAnomalyDetector`, `FuelAnomalyDetector`, `ConflictResolver` (`ARCHITECTURE.md` §7).
- **Domain services (DI):** `RouteService` (version cache + If-Match), `PresenceService` (ghost/idempotent), `FleetService` (re-baseline), `AlertService`.
- **Core resilience:** `CircuitBreaker` (3-state), `RetryPolicy`/Retry-After parsing.
- **Decoders & type guards:** `decodeSseMessage`, `decodeWsMessage` over valid + malformed frames.
- **Signal stores:** reducer correctness (`TelemetryStore`, `RoutesStore`, `PresenceStore`, `ConnectionStore`) — state transitions, bounded buffers.
- **Selected components:** conflict dialog, sensor badge / gauge sanitization binding, connection/degraded banner — only where rendering logic carries risk.
- **Manual/integration:** multi-dispatcher presence, live conflicts, degraded mode, telemetry render — validated against the running mock server.

---

## 3. Out of Scope for Tests

- **The mock server itself** — never modified, not unit-tested by us (SERVER_INTEGRATION_PLAN §9).
- **Exact probabilities** (15% 503, 10% batch, 8%/3s speed-stuck, etc.) — we test the *handling*, not that the server rolls dice at the stated rate.
- **Map cartography / Leaflet rendering quality** — not graded (FO-1); we test the data feeding the map, not tiles/pixels.
- **CSS/visual styling**, animation timing aesthetics.
- **Backend persistence / NgRx / Redis** — none exist in this design (SPEC §17, NFR-7).
- **Cross-browser matrix** — latest Chrome is sufficient (assignment Technical Requirements).
- **Load/perf benchmarking as automated tests** — multi-hour stability (AC-14) is validated by a manual soak + memory observation, not a CI gate.
- **E2E browser automation** (Cypress/Playwright) — optional bonus, not required for the minimum bar; manual checklist (§12) covers the integration surface.

---

## 4. Test Levels

### 4.1 Pure unit tests (primary, highest volume)
Plain TypeScript over fixtures; no Angular, no TestBed, no DOM. Cover every domain processor and pure helper. Fast, deterministic, the bulk of coverage. (`ARCHITECTURE.md` §33 maps T-1..T-8 here.)

Targets: `BatchProcessor`, `orderGuard`, `SpeedAnomalyDetector`, `FuelAnomalyDetector`, `ConflictResolver`, `RingBuffer`, geo/time utils, decoders + type guards.

### 4.2 Angular service tests (DI-aware)
Use Angular's `TestBed` only where injection is real value: services that depend on `HttpClient`, `AppConfig`, clocks, or stores.

Targets: `RouteService` (+ `HttpTestingController`), `FleetService`, `CircuitBreaker` wired into `FleetApi`, `AlertService`, store reducers driven by service calls. Assert headers (`If-Match`, `X-Dispatcher-Id`), request URLs, response-to-store mapping, error mapping.

### 4.3 Component tests (where useful only)
Thin, targeted, not smoke tests. Render a component with stubbed signal inputs and assert **logic-bearing** output.

Targets:
- `conflict-dialog`: given a `RouteConflict` with/without `lastModifiedBy`, renders the right actor text and Retry/Cancel actions (RM-5/6).
- `sensor-badge` / gauge binding: given a reading flagged `speedSensorError`/`fuelGlitch`, shows badge and **does not** render 999 / 0%-as-low (AC-4/5).
- `connection-banner`: given `ConnectionStore.isDegraded`, shows the "stale as of …" banner (FO-7, AC-10).
- `dispatcher-cursor`/roster: renders viewers from `PresenceStore` (DP-3).

Explicitly **avoid** "it should create" smoke tests as coverage padding (assignment: meaningful tests > "renders").

### 4.4 Manual / integration validation with the mock server
Run `npm run server` + `npm start`, two browser tabs, exercise the probabilistic and multi-user flows that can't be asserted deterministically (§12). This is where ghost presence, real 503 cadence, and live conflicts are observed.

---

## 5. Test Tooling Recommendation

- **Use the Angular project default test runner** (whatever `ng new`/the repo configures — Karma+Jasmine on classic CLI, or the project's configured runner). Do **not** introduce Jest or Vitest *solely* for this assignment; the default is sufficient for pure-logic and service tests (`ARCHITECTURE.md` §33 reworded — runner not locked in).
- **Pure unit tests** need no Angular harness; they run under whatever runner the project uses by importing plain functions/classes.
- **Fake timers:** use the runner's built-in fake-clock (Jasmine `clock()`, or `fakeAsync`/`tick` from `@angular/core/testing`) for retry/backoff/TTL/heartbeat. Prefer an **injectable clock abstraction** in the code so tests can drive time without runner-specific tricks where possible.
- **HTTP:** `HttpClientTestingModule` + `HttpTestingController` (first-party Angular) — no third-party HTTP mock.
- **Rationale:** minimizing tooling churn keeps `npm test` aligned with the build contract (NFR-9, AC-1) and avoids config risk in a time-boxed task. If the team later standardizes on Jest/Vitest, the pure tests port with near-zero change because they avoid framework coupling.

---

## 6. Required Minimum Test Coverage for the Assignment

The assignment mandates **≥ 8 meaningful test cases** (SPEC §5/§14). SPEC defines T-1..T-10; **T-1..T-8 are the required core**, T-9/T-10 strengthen. This plan delivers all ten plus supporting cases.

Mandatory coverage areas (assignment §5):

| Area | Test(s) |
|------|---------|
| GPS batch processing | TC-BATCH-* (T-1) |
| Out-of-order timestamp handling | TC-ORDER-* (T-2) |
| Fuel anomaly (real 0% vs glitch) | TC-FUEL-* (T-3) |
| Speed anomaly (999 filtering) | TC-SPEED-* (T-4) |
| Optimistic locking / conflict flow | TC-LOCK-*, TC-CONFLICT-* (T-5/T-6/T-7) |
| Dispatcher presence w/ ghost handling | TC-GHOST-* (T-8) |

Coverage intent: **not** a line-coverage percentage target (which rewards smoke tests), but **100% of the 8 quirks and the truthful-UI acceptance criteria (AC-3..AC-10) exercised by at least one deterministic test.** Line coverage is a secondary signal; meaningful edge-case coverage is the goal.

---

## 7. SPEC Requirement → Test Mapping

| SPEC req | Covered by |
|----------|------------|
| FR-1 (live trucks) | TC-STORE-TELEMETRY, manual M-TELEMETRY |
| FR-3 (batch as trail) | TC-BATCH-1/2/3 |
| FR-4 (timestamp ordering) | TC-ORDER-1/2/3 |
| FR-5 (speed 999) | TC-SPEED-1/2/3 |
| FR-6 (fuel glitch) | TC-FUEL-1/2/3 |
| FR-7 (503 Retry-After) | TC-503-1/2 |
| FR-8 (create route) | TC-ROUTE-CREATE-1/2 |
| FR-9 (status lifecycle) | TC-ROUTE-LIFECYCLE-1 |
| FR-10 (If-Match) | TC-LOCK-1/2 |
| FR-11 (409 shows who) | TC-CONFLICT-1 |
| FR-12 (reassign) | TC-REASSIGN-1/2 |
| FR-13 (audit log) | TC-AUDIT-1 |
| FR-14/15 (presence/viewing) | TC-PRESENCE-1, TC-VIEWING-1/2 |
| FR-16 (ghost) | TC-GHOST-1/2/3 |
| FR-19 (alerts) | TC-ALERT-1/2 |
| FR-21 (WS route events) | TC-WS-ROUTE-1/2/3 |
| FR-22 (fleet reset) | TC-RESET-1/2 |
| NFR-2 (lifecycle/cleanup) | TC-SSE-LIFECYCLE, TC-WS-LIFECYCLE |
| NFR-3 (bounded buffers) | TC-RINGBUFFER-1, TC-STORE-BOUND |
| NFR-5 (circuit breaker) | TC-CB-1/2/3 |
| NFR-6 (typed decode) | TC-DECODE-SSE, TC-DECODE-WS |
| RM-5/6 (conflict shapes) | TC-CONFLICT-1/2 |
| RM-10 (audit) | TC-AUDIT-1 |
| RM-11 (version cache) | TC-LOCK-2 |
| DP-4 (idempotent left) | TC-GHOST-1/2 |
| DP-5 (viewing TTL) | TC-VIEWING-2 |
| SQ-2 (input validation) | TC-VALIDATE-1 |
| SQ-4 (error boundaries) | TC-DECODE-MALFORMED, TC-ERR-BOUNDARY |
| SQ-6 (no injection) | TC-ESCAPE-1 (component) |

(Selected mapping; full per-test detail in §9. AC mapping in §13.)

---

## 8. Server Quirk → Test Mapping

| Quirk (SERVER_ANALYSIS §12) | Server fact | Test(s) |
|------------------------------|-------------|---------|
| **Q1 GPS batch** | `gps_batch`, 10–30 readings, 2s apart, oldest-first | TC-BATCH-1/2/3 (T-1) |
| **Q2 Fuel glitch** | active >40km/h, 5%/2s, `fuel:0` for 2–4s, real fuel keeps dropping | TC-FUEL-1/2/3 (T-3) |
| **Q3 Speed stuck** | truck_7, 8%/3s, `speed:999` for 5–10s, sim clamps real ≤80 | TC-SPEED-1/2/3 (T-4) |
| **Q4 Optimistic lock** | PATCH immediate If-Match check → 409 `{currentVersion,yourVersion,lastModifiedBy}` | TC-LOCK-1/2, TC-CONFLICT-1 (T-5/T-6) |
| **Q5 Out-of-order** | ~10% telemetry, one reading backdated 3–8s, `_reordered:true` | TC-ORDER-1/2/3 (T-2) |
| **Q6 Ghost presence** | 20% disconnects delay `dispatcher_left` 10s | TC-GHOST-1/2/3 (T-8) |
| **Q7 503 load** | `GET /fleet` 15%, `Retry-After: 3` | TC-503-1/2, TC-CB-1/2/3 (T-9) |
| **Q8 PATCH race** | post-delay (200–1000ms) re-check → 409 `{currentVersion}` only | TC-CONFLICT-2, TC-REASSIGN-RACE (T-7) |

---

## 9. Detailed Test Cases

Notation: each case lists **Given / When / Then**. All inputs are fixtures (§10). All timing uses fake clocks (§11).

### 9.1 GPS batch handling — `BatchProcessor.collapse` (Q1, FR-3, T-1)

- **TC-BATCH-1 (collapse to trail + latest):**
  Given a `gps_batch` fixture of 20 readings for `truck_3`, timestamps `now-40000 … now-2000` (2s apart, ascending after sort), all plausible.
  When `collapse(readings)` runs.
  Then result has a `trail` of 20 points **and** `latest` is the single reading with the maximum timestamp; **no** per-reading marker list is produced (asserts one trail + one current position, AC-3).

- **TC-BATCH-2 (order-guard inside batch):**
  Given `lastAcceptedTs[truck_3] = now-10000` and a batch spanning `now-40000 … now-2000`.
  When collapsed.
  Then readings older than `now-10000` are filtered out of both trail and `latest` (reuses Q5 guard, §15).

- **TC-BATCH-3 (no alerts from historical points + sanitize latest):**
  Given a batch where one historical reading has `speed:999` and the latest reading has plausible values.
  When collapsed and applied.
  Then no speed/fuel alert is emitted for historical points, and `latest` still passes speed/fuel sanitize (a 999 in `latest` would be flagged, not rendered).

### 9.2 Out-of-order timestamps — `orderGuard` (Q5, FR-4, T-2)

- **TC-ORDER-1 (drop stale):** Given `lastAcceptedTs[truck_1]=1000`. When a reading with `timestamp=500` arrives. Then verdict = DROP_STALE; store position unchanged; drop counter increments (OB-3).
- **TC-ORDER-2 (accept newer):** Given `lastAcceptedTs=1000`. When `timestamp=1500`. Then ACCEPT; `lastAcceptedTs` advances to 1500.
- **TC-ORDER-3 (flag is not the trigger):** Given a reading `{timestamp:2000, _reordered:true}` that is **newer** than last-accepted. Then it is ACCEPTED (the `_reordered` flag is informational; the timestamp comparison is authoritative). And given an **older** reading **without** the flag → still dropped. (Proves robustness to flag absence.)

### 9.3 truck_7 speed 999 anomaly — `SpeedAnomalyDetector` (Q3, FR-5, T-4)

- **TC-SPEED-1 (flag + suppress):** Given reading `truck_7 speed:999`. When `speedSanitize` runs. Then `speedSensorError=true`, `displaySpeed = lastValidSpeed (or null)`; raw 999 never assigned to display.
- **TC-SPEED-2 (normal passes):** Given `speed:62`. Then `speedSensorError=false`, `displaySpeed=62`, `lastValidSpeed=62`.
- **TC-SPEED-3 (auto-clear + excluded from compute):** Given sequence `62 → 999 → 58`. Then after `999` the flag is set; after `58` the flag clears and `displaySpeed=58`; assert any speed-derived computation (e.g., a max/avg helper) ignores the 999 sample entirely.

### 9.4 Fuel 0% glitch — `FuelAnomalyDetector` (Q2, FR-6, T-3)

- **TC-FUEL-1 (glitch detected):** Given recent fuel history `[71,70,70]` (all >5%) then a reading `fuel:0`. Then `fuelGlitch=true`, `displayFuel=70` (last valid held), **no** low-fuel alert.
- **TC-FUEL-2 (genuine low NOT suppressed):** Given a gradual decline `[12,9,7,6]` reaching a low but non-zero value. Then `fuelGlitch=false` and a low-fuel alert **is** allowed to fire (distinguishes real low from glitch, AC-5).
- **TC-FUEL-3 (auto-clear):** Given `[68,0(glitch),67]`. Then after the non-zero reading resumes, glitch clears, `displayFuel=67`, history resumes tracking.

### 9.5 Retry-After 503 handling — `RetryPolicy` / `FleetService` (Q7, FR-7, T-9)

- **TC-503-1 (honour Retry-After):** Given `FleetApi.getFleet` returns 503 with header `Retry-After: 3`, then 200. When `FleetService.load()` runs under a fake clock. Then no retry fires before t=3s; exactly one retry fires at/after 3s; success maps to `FleetStore`. Assert **no tight-loop** (only one retry scheduled per 503).
- **TC-503-2 (counter resets on success):** Given 503 → 200 → 503. Then the consecutive-503 counter is 1 → 0 → 1 (a 200 resets it), so the breaker does not open prematurely.

### 9.6 Circuit breaker after 3 consecutive 503s — `CircuitBreaker` (Q7, NFR-5, AC-10, T-9)

- **TC-CB-1 (open after 3):** Given 3 consecutive 503s from the `getFleet` operation. Then breaker → OPEN; `ConnectionStore.isDegraded=true`; `GET /fleet` is no longer called while OPEN; last-good `FleetStore` data retained; banner shows "stale as of …".
- **TC-CB-2 (half-open probe → close):** Given OPEN, advance fake clock past probe delay → HALF_OPEN; one probe allowed; probe returns 200. Then breaker → CLOSED, degraded cleared, counter reset.
- **TC-CB-3 (half-open probe → reopen):** Given HALF_OPEN, probe returns 503. Then breaker → OPEN again; another probe delay scheduled (no hammering).
- **TC-CB-4 (cold-start safety):** Given breaker opens before any successful fleet load. Then UI handles empty fleet gracefully (no crash); probing continues (SPEC §18/§27 cold-start risk).

### 9.7 Optimistic locking If-Match — `RouteService` + `RoutesApi` (Q4, FR-10, RM-4/11, T-5)

- **TC-LOCK-1 (sends bare-integer If-Match):** Given cached version 4 for `route_1`. When `updateStatus('route_1','in-progress')`. Then the PATCH request carries header `If-Match: "4"` (bare integer string, **not** quoted ETag) and `X-Dispatcher-Id`; assert via `HttpTestingController`.
- **TC-LOCK-2 (version cache advances + WS convergence):** Given 200 response with `_version:5`. Then `RoutesStore.versions['route_1']=5`. And given a WS `route_updated` with `_version:6` arrives. Then cache advances to 6 so the next PATCH uses `If-Match: 6` (RM-11).

### 9.8 409 conflict with lastModifiedBy — `ConflictResolver` (Q4, FR-11, RM-5, T-6)

- **TC-CONFLICT-1 (Scenario B parse):** Given a 409 body `{error, currentVersion:7, yourVersion:5, lastModifiedBy:"dispatcher_bob"}`. When `ConflictResolver.handle(err)`. Then `RouteConflict` exposes `currentVersion:7`, `yourVersion:5`, `lastModifiedBy:"dispatcher_bob"`; a re-fetch is requested; conflict signal set; retry path uses the refreshed version (AC-7).

### 9.9 PATCH race 409 with only currentVersion — `ConflictResolver` (Q8, RM-6, T-7)

- **TC-CONFLICT-2 (Scenario C lean shape, no throw):** Given a 409 body `{error, currentVersion:9}` with **no** `yourVersion`/`lastModifiedBy`. When `ConflictResolver.handle(err)`. Then it does **not** throw; `yourVersion` falls back to cached version, `lastModifiedBy` falls back to `'unknown'`; same recovery path (re-fetch + dialog). This is the key robustness test for Q8.

### 9.10 Route reassignment conflict — `RouteService` (Q8 context, FR-12, RM-8, T-10)

- **TC-REASSIGN-1 (target busy 409):** Given `reassign('route_1','truck_5')` and server returns 409 `{error:'Target truck already has an assigned route'}`. Then a clear message surfaces; no store corruption; user can pick another truck.
- **TC-REASSIGN-2 (maintenance 400):** Given target truck in maintenance → 400. Then mapped to a clear "cannot assign to maintenance truck" message (not a crash).
- **TC-WS-ROUTE / TC-REASSIGN-RACE (apply reassign reducer):** Given a WS `route_reassigned {route, oldTruckId, newTruckId, _version}`. Then `RoutesStore` moves the route, both trucks' assignment updates, version cache advances (T-10, FR-21).

### 9.11 Ghost dispatcher presence — `PresenceService`/`PresenceStore` (Q6, FR-16, DP-4, T-8)

- **TC-GHOST-1 (idempotent left on unknown id):** Given roster `{alice, bob}`. When `dispatcher_left {dispatcherId:'carol'}` (never present). Then no-op: roster unchanged, no throw, count not decremented below truth.
- **TC-GHOST-2 (double left):** Given roster `{alice, bob}`. When `dispatcher_left bob` twice. Then bob removed once; second is a no-op; count consistent.
- **TC-GHOST-3 (late ghost after reconnect):** Given bob removed, then a delayed `dispatcher_left bob` arrives 10s later. Then it remains a harmless no-op (simulates the 20% ghost delay).

### 9.12 Dispatcher viewing updates — `PresenceStore` (FR-15, DP-3/5, T-supporting)

- **TC-VIEWING-1 (set viewing):** Given `dispatcher_viewing {dispatcherId:'alice', truckId:'truck_2'}`. Then `viewersOf('truck_2')` includes alice with a timestamp.
- **TC-VIEWING-2 (TTL prune):** Given alice viewing `truck_2` at t0 and TTL=30s. When the clock advances past 30s with no refresh. Then alice's viewing entry is pruned (since the server has no "stopped viewing" event, DP-5), even if no `dispatcher_left` arrived.

### 9.13 Fleet reset broadcast — reset coordinator (FR-22, §26)

- **TC-RESET-1 (clear + re-baseline):** Given populated routes/presence/alerts/trails. When WS `fleet_reset` arrives. Then `RoutesStore`, `AlertStore`, telemetry trails, and presence (except `selfId`) are cleared, and a `GET /fleet` re-baseline is triggered (asserted via `HttpTestingController`).
- **TC-RESET-2 (no crash mid-stream):** Given a reset arrives between telemetry batches. Then subsequent telemetry applies cleanly onto the re-baselined state (no stale-key errors).

### 9.14 Alert send + truck_alert broadcast — `AlertService`/`AlertStore` (FR-19, VD-6, T-supporting)

- **TC-ALERT-1 (send with header + validation):** Given a valid `{message:'Return to depot', severity:'warning'}`. When `AlertService.send('truck_1', …)`. Then `POST /fleet/truck_1/alert` is issued with `X-Dispatcher-Id`; empty message is rejected client-side before any request (SQ-2).
- **TC-ALERT-2 (ingest broadcast):** Given WS `truck_alert {alert:{truckId:'truck_1', severity:'warning', message:'…'}}`. Then `AlertStore` pushes it (bounded), per-truck badge derivable; message rendered as text only (no HTML injection, SQ-6 — asserted in TC-ESCAPE-1 component test).

### 9.15 Decoder safety (NFR-6, SQ-4)

- **TC-DECODE-SSE / TC-DECODE-WS:** valid frames of each `type` decode to the correct discriminated-union variant via type guards.
- **TC-DECODE-MALFORMED:** non-JSON / unknown `type` / missing fields → decoder returns an "unknown/invalid" result, increments a counter, and **does not throw**; the stream is not torn down.

### 9.16 Supporting unit tests

- **TC-RINGBUFFER-1:** fixed-capacity buffer evicts oldest at capacity; never exceeds bound (NFR-3, PF-2).
- **TC-STORE-BOUND:** `AlertStore`/log buffer stay bounded after N pushes.
- **TC-VALIDATE-1:** route-create form model rejects empty truck/destination; blocks maintenance-truck selection (RM-1/2, SQ-2).
- **TC-SSE-LIFECYCLE / TC-WS-LIFECYCLE:** on teardown, EventSource/WebSocket closed and timers cleared (no leaks, NFR-2); on SSE re-`connected`, a `GET /fleet` re-baseline is triggered.

---

## 10. Test Data / Fixtures Strategy

- **Central fixtures module** (e.g. `shared/models/__fixtures__/` or a test-only `testing/fixtures` folder): hand-authored, deterministic JSON mirroring real server payloads from `SERVER_ANALYSIS.md` §5–§8.
- **Fixture catalog (minimum):**
  - SSE: `connected`, `heartbeat`, `telemetry` (12 readings), `telemetry` with one `_reordered`, `gps_batch` (20 readings, 2s apart, oldest-first).
  - WS server→client: `registered`, `dispatcher_joined`, `dispatcher_left`, `dispatcher_viewing`, `route_assigned`, `route_updated`, `route_reassigned`, `truck_alert`, `fleet_reset`, `error`.
  - REST responses: fleet list (12 trucks), single truck (with `mileage`/`lastUpdate`), routes list, created route (201), 409 **Scenario B** body, 409 **Scenario C** body, 503 with `Retry-After`.
- **Builders over literals:** small factory helpers (`makeReading({overrides})`, `makeRoute({version})`) so a test states only the field under test; reduces brittle duplication.
- **Quirk-faithful, not random:** fixtures reproduce the quirk's *shape and timing* (e.g., batch timestamps exactly 2000ms apart descending in age; backdated reading exactly `now-5000`). No `Math.random()` in tests.
- **Single source for IDs:** truck IDs `truck_1..truck_12`, truck_7 reserved for speed-stuck cases, statuses per `initFleet()` (truck_4/truck_10 idle, truck_7 maintenance) so fixtures match server reality.
- **No network in fixtures:** fixtures are pure data; transport behaviour comes from mocks (§11).

---

## 11. Mocking Strategy

### 11.1 HttpClient
- Use `HttpClientTestingModule` + `HttpTestingController`. Flush typed fixtures; assert request **method, URL, headers** (`If-Match` bare integer, `X-Dispatcher-Id`), and that error statuses (400/404/409/503) map to the correct `AppError` variants. For 503, attach a real `Retry-After` header on the mocked response so parsing is exercised.

### 11.2 EventSource
- The app wraps `EventSource` behind `SseClient` (`ARCHITECTURE.md` §12). Provide a **fake EventSource** (an injectable factory or a test double implementing `onmessage`/`onerror`/`onopen`/`close`). Tests push fixture frames by invoking `onmessage({data})` directly — no real network. Assert pipeline effects on stores and lifecycle (re-baseline on re-`connected`, watchdog reconnect on missing heartbeat).

### 11.3 WebSocket
- Wrap native `WebSocket` behind `WebSocketClient`. Provide a **fake WebSocket** double exposing `send` (spy), and methods to simulate `open`/`message`/`close`/`error`. Tests:
  - assert `register_dispatcher` is sent on open and `viewing_truck` on selection;
  - feed server→client fixtures via simulated `message`;
  - simulate `close` then `open` to assert reconnect + re-register + presence rebuild.

### 11.4 Timers
- **Inject a `Clock`/scheduler abstraction** where feasible (preferred), so retry/backoff/TTL/heartbeat are driven by advancing a fake clock deterministically. Where direct timer use remains, use the runner's fake timers (`fakeAsync`+`tick`, or Jasmine `clock()`), e.g. advancing 3s for Retry-After, 10s for ghost, 30s for viewing TTL, probe delay for the breaker. **No real waits.**

### 11.5 Retry-After
- Tested at two seams: (a) `ErrorMappingInterceptor`/parser converts the `Retry-After: 3` header into `ServiceUnavailableError{retryAfterMs:3000}`; (b) `RetryPolicy`/`FleetService` schedules exactly one retry at that delay under the fake clock (TC-503-1). Edge fixtures: missing header (fallback delay), non-numeric header (safe default).

---

## 12. Manual QA Checklist (mock server running)

Prerequisite: `npm run server:install` once, then `npm run server` (port 3000) and `npm start` (port 4200). Use **two browser tabs** as two dispatchers (assignment Tips).

**Run / connectivity**
- [ ] Server boots; console lists the 8 active quirks.
- [ ] App connects: SSE `connected` received; WS `registered` received; connection indicator green (FO-7).

**Presence (FR-14/15/16, DP-*)**
- [ ] Tab A and Tab B register with distinct names; each sees the other in the roster; active count = 2.
- [ ] Tab A opens `truck_2`; Tab B shows A's collaborative cursor/"viewing" indicator on `truck_2` (DP-3).
- [ ] Close Tab B; Tab A removes B from roster. Repeat several times to observe the **ghost case** (~20%): a delayed (~10s) removal — Tab A must not error or double-count when the late leave arrives (Q6, AC-9).

**Telemetry (FR-1/3/4/5/6)**
- [ ] All 12 trucks visible with status styling (active/idle/maintenance) (FO-2).
- [ ] Positions update ~every 2s; a `gps_batch` shows a trail, not 10–30 markers (Q1, AC-3).
- [ ] Watch `truck_7`: when it reports 999, UI shows a sensor-error badge, **not** 999 km/h (Q3, AC-4).
- [ ] Observe a fuel reading drop to 0 transiently on a fast truck: **no** false low-fuel alarm; glitch indicator shown; value recovers (Q2, AC-5).
- [ ] No truck visibly jumps backwards on the map (out-of-order guard) (Q5, AC-6).

**Route conflicts (FR-8..12, RM-*)**
- [ ] Tab A creates a route for an idle truck; both tabs see it (WS `route_assigned`).
- [ ] Tab A and Tab B both attempt to PATCH the **same** route near-simultaneously: one succeeds; the other gets a clear conflict dialog naming the other dispatcher, with working Retry/Cancel (Q4/Q8, AC-7).
- [ ] Attempt to assign/reassign to an already-assigned truck → clear 409 message; to a maintenance truck → clear 400 message (RM-8, AC-8).
- [ ] Audit log shows assign/modify/reassign with actor + time (RM-10, AC-12).

**Degraded mode (FR-7, NFR-5)**
- [ ] Refresh/poll `GET /fleet` repeatedly (15% 503). On a 503, observe "retrying in Xs" honoring Retry-After (Q7).
- [ ] Force/observe 3 consecutive 503s → degraded mode banner ("stale as of …"), last-good data retained, SSE telemetry still flowing; recovery probe restores normal mode (AC-10).

**Detail + alerts (FR-17..20, VD-*)**
- [ ] Click a truck → detail panel with live sanitized gauges, mileage, assigned route (VD-2/3/5).
- [ ] Send an alert from Tab A → Tab B receives `truck_alert` toast/badge (FR-19, AC-11).

**Reset (FR-22)**
- [ ] Trigger dev `POST /reset` (behind confirmation) → both tabs clear and re-baseline cleanly (§26).

---

## 13. Acceptance Test Checklist (maps to SPEC §16)

| AC | Criterion | Verified by |
|----|-----------|-------------|
| AC-1 | Setup: server install/run, app start, `npm test` green | CI run + §12 prereq |
| AC-2 | 12 trucks, live, timestamp-ordered, status styling | TC-STORE-TELEMETRY, TC-ORDER-*, M-Telemetry |
| AC-3 | Batch → trail + single position, no spurious alerts | TC-BATCH-1/3, manual |
| AC-4 | truck_7 never shows 999; flagged + excluded | TC-SPEED-1/3, manual |
| AC-5 | Glitch 0% no false alert; real low does alert | TC-FUEL-1/2, manual |
| AC-6 | Backdated reading doesn't move truck backwards | TC-ORDER-1, manual |
| AC-7 | Two-dispatcher conflict: one wins, other gets clear retry naming actor | TC-CONFLICT-1/2, manual |
| AC-8 | Reassign to busy/maintenance handled, no crash | TC-REASSIGN-1/2, manual |
| AC-9 | Presence across tabs incl. 10s ghost, clean removal | TC-GHOST-1/2/3, manual |
| AC-10 | 503 retries honor Retry-After; 3→degraded; recovers | TC-503-*, TC-CB-1/2/3, manual |
| AC-11 | Detail: live sanitized gauges, route, alert cross-tab | TC-ALERT-1/2, manual |
| AC-12 | Audit log: assign/modify/reassign w/ actor+time | TC-AUDIT-1, manual |
| AC-13 | ≥8 meaningful tests (batch, order, fuel, speed, lock/conflict, ghost) | T-1..T-8 (§9) |
| AC-14 | Multi-hour stability, no memory/CD runaway | Manual soak + memory profile |

---

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Quirks are probabilistic | Flaky/impossible to assert against live server | Deterministic fixtures reproduce payload+timing; live server only for manual pass (§1, §10). |
| Real timers cause flaky/slow tests | CI instability | Injectable clock + fake timers everywhere (§11.4); no real sleeps. |
| Two 409 shapes (B vs C) | Crash on missing fields (Q8) | TC-CONFLICT-2 explicitly tests the lean shape with fallbacks; never throws (SQ-4). |
| `If-Match` format regression | Locking silently disabled (server `parseInt`) | TC-LOCK-1 asserts bare-integer header, not quoted ETag. |
| SSE has no replay | Lost events after reconnect | TC-SSE-LIFECYCLE asserts `GET /fleet` re-baseline on re-`connected`. |
| Breaker opens before first load | Empty UI / crash | TC-CB-4 cold-start safety + graceful empty-state. |
| Over-mocking hides integration bugs | Green units, broken app | Mandatory manual two-tab pass (§12) covers real SSE/WS/REST wiring. |
| Component smoke tests inflate coverage | False confidence | Plan forbids "it creates" padding; component tests assert logic-bearing output only (§4.3). |
| Test runner churn | Build contract breakage | Use Angular default runner; avoid introducing Jest/Vitest unnecessarily (§5). |
| Maintenance-truck assignment unguarded on POST | Invalid state | TC-VALIDATE-1 blocks it client-side (RM-2). |

---

## 15. Implementation Order for Tests

Sequenced to mirror `ARCHITECTURE.md` §38 phases and to deliver the assignment's required-8 earliest.

1. **Fixtures + builders** (§10) and the **fake EventSource/WebSocket/Clock** doubles (§11) — foundation everything else uses.
2. **Pure pipeline units (the required core):** TC-ORDER-* (T-2), TC-SPEED-* (T-4), TC-FUEL-* (T-3), TC-BATCH-* (T-1). → satisfies 4 of the 8 immediately.
3. **Decoders + RingBuffer:** TC-DECODE-*, TC-RINGBUFFER-1 (NFR-6/3).
4. **Resilience:** TC-503-* and TC-CB-1/2/3/4 (T-9, Q7).
5. **Routes/locking/conflict:** TC-LOCK-1/2 (T-5), TC-CONFLICT-1 (T-6), TC-CONFLICT-2 (T-7), TC-REASSIGN-* / TC-WS-ROUTE (T-10). → completes T-5/6/7 + reassign.
6. **Presence:** TC-GHOST-1/2/3 (T-8), TC-VIEWING-1/2. → completes the required 8 (T-1..T-8).
7. **Stores/services glue:** TC-STORE-*, TC-RESET-*, TC-ALERT-*, TC-SSE/WS-LIFECYCLE, TC-VALIDATE-1.
8. **Targeted component tests:** conflict-dialog, sensor-badge/gauge, connection-banner, TC-ESCAPE-1.
9. **Manual/integration pass** (§12) once features are wired.
10. **Acceptance sweep** (§13) before submission; soak test for AC-14.

Each step ends with `npm test` green and leaves the suite runnable.

---

### Traceability summary

Every quirk Q1–Q8 has at least one deterministic test (§8). Every required assignment area (batch, ordering, fuel, speed, locking/conflict, ghost) has explicit cases (§6, §9), satisfying the ≥8-meaningful-tests bar (AC-13). Every acceptance criterion AC-1..AC-14 has a verification path (§13). The plan adds no product requirements, invents no endpoints, and introduces no NgRx or Redis; the mock server is never modified.
