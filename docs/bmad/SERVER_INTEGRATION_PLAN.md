# FleetPulse Mock Server — Integration Plan

**Role:** BMAD Architect  
**Input:** `docs/bmad/SERVER_ANALYSIS.md`  
**Scope:** How to integrate the provided mock server into the existing Angular repository without modifying the server or inventing backend infrastructure.

---

## 1. Recommended Folder Structure

The mock server lives as a self-contained sub-project at `mock-server/`. It is a sibling to the Angular source, not nested inside it.

```
FleetPulse/                                   ← repository root
│
├── mock-server/                              ← mock server sub-project (NEW)
│   ├── package.json                          ← server-only dependencies (express, ws)
│   └── server.js                            ← provided mock server — NEVER MODIFIED
│
├── src/                                      ← Angular application source
│   ├── app/
│   │   ├── core/
│   │   │   └── services/                     ← API, SSE, WebSocket services live here
│   │   ├── features/
│   │   └── ...
│   └── environments/
│       ├── environment.ts                    ← dev config (server URLs → localhost:3000)
│       └── environment.prod.ts
│
├── docs/
│   └── bmad/
│       ├── SERVER_ANALYSIS.md
│       └── SERVER_INTEGRATION_PLAN.md        ← this file
│
├── angular.json
├── package.json                              ← root Angular package.json (scripts added)
├── tsconfig.json
├── PROMPTS.md                                ← AI usage journal (required by assignment)
└── README.md                                 ← updated per Section 7
```

**Design rationale:**

- `mock-server/` has its own `package.json` so its CommonJS dependencies (`express`, `ws`) do not pollute the Angular project's `node_modules` or conflict with Angular's ESM build pipeline.
- `server.js` sits directly in `mock-server/` — no subdirectory — so the start path is unambiguous.
- Angular `src/environments/` files hold all server URLs (see Section 5), keeping connection configuration out of component and service code.

---

## 2. Required `mock-server/package.json`

This file must be created alongside `server.js`. It is the only file added to `mock-server/` besides `server.js` itself.

```json
{
  "name": "fleetpulse-mock-server",
  "private": true,
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.14.2"
  }
}
```

| Field | Value | Reason |
|-------|-------|--------|
| `name` | `fleetpulse-mock-server` | Scoped name prevents accidental npm publish |
| `private` | `true` | Blocks publishing to npm |
| `start` | `node server.js` | Matches assignment instruction `node server.js` |
| `express` | `^4.18.2` | Minimum compatible version; `^4` allows patch/minor updates |
| `ws` | `^8.14.2` | Current stable line; `^8` allows patch/minor updates |

The `mock-server/package-lock.json` generated on first install must be committed to the repository so server dependency versions are reproducible across machines.

---

## 3. Required Root `package.json` Scripts

The following scripts are added to the Angular project's root `package.json`. They are purely additive — no existing Angular scripts are modified or removed.

### New scripts

```json
{
  "scripts": {
    "server:install": "npm --prefix mock-server install",
    "server":         "npm --prefix mock-server start",
    "dev":            "concurrently \"npm run server\" \"npm start\""
  }
}
```

### Full merged `scripts` block

Existing entries are marked `(existing)`.

```json
{
  "scripts": {
    "ng":             "ng",                                            // (existing)
    "start":          "ng serve",                                      // (existing)
    "build":          "ng build",                                      // (existing)
    "watch":          "ng build --watch --configuration development",  // (existing)
    "test":           "ng test",                                       // (existing)

    "server:install": "npm --prefix mock-server install",               // NEW
    "server":         "npm --prefix mock-server start",               // NEW
    "dev":            "concurrently \"npm run server\" \"npm start\""  // NEW (optional)
  }
}
```

### `dev` script dependency

The `dev` script requires `concurrently` to run both processes in one terminal:

```bash
npm install --save-dev concurrently
```

`concurrently` is a devDependency of the Angular project only — it does not affect the mock server. If the team prefers not to add it, drop the `dev` script and run `npm run server` and `npm start` in two separate terminals.

### Script responsibilities

| Script | What it does | When to use |
|--------|-------------|-------------|
| `npm run server:install` | Installs `express` and `ws` into `mock-server/node_modules` | Once after cloning, or after updating `mock-server/package.json` |
| `npm run server` | Starts the mock server on port 3000 | Every development session |
| `npm start` | Starts the Angular dev server (`ng serve`) — unchanged | Every development session |
| `npm run dev` | Starts both concurrently | Convenience shortcut (requires `concurrently`) |
| `npm test` | Runs Angular unit tests (`ng test`) — unchanged | CI and local test runs |
| `npm run build` | Production Angular build — unchanged | CI and deployment |

---

## 4. Local Development Flow

### First-time setup (after cloning)

```bash
# 1. Install Angular project dependencies
npm install

# 2. Install mock server dependencies
npm run server:install
```

Both steps are required once per machine. Neither affects the other's `node_modules`.

### Daily development

**Option A — two terminals (no additional dependency):**

```bash
# Terminal 1 — mock server
npm run server

# Terminal 2 — Angular app
npm start
```

- Mock server: `http://localhost:3000`
- Angular dev server: `http://localhost:4200`

**Option B — single terminal (requires `concurrently`):**

```bash
npm run dev
```

Both processes run in one terminal with colour-coded output prefixes. `Ctrl+C` stops both.

### Running tests

```bash
npm test
```

- The mock server does **not** need to be running for unit tests.
- Unit tests must mock all HTTP, SSE, and WebSocket calls.
- If integration or E2E tests are added in the future, they will require the mock server to be running.

### Resetting fleet state during development

The server exposes a reset endpoint. Any of the following work:

```bash
# curl
curl -X POST http://localhost:3000/api/reset

# browser console
fetch('http://localhost:3000/api/reset', { method: 'POST' })
```

This clears all routes, dispatcher registrations, and truck state and re-initialises the fleet. Useful when routes accumulate during long sessions.

### Process summary

```
Clone repo
    │
    ├── npm install              → Angular deps in ./node_modules
    └── npm run server:install  → Server deps in ./mock-server/node_modules
                │
                ▼
    npm run server   →  http://localhost:3000  (mock server, required first)
    npm start        →  http://localhost:4200  (Angular app)
    npm test         →  Karma runner           (no server required)
```

---

## 5. Angular Configuration Values

All server URLs must be defined in Angular environment files and referenced by injection. They must never be hardcoded in service or component files.

### `src/environments/environment.ts` (development)

```typescript
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000/api',
  sseUrl:     'http://localhost:3000/api/telemetry/stream',
  wsUrl:      'ws://localhost:3000/ws',
};
```

### `src/environments/environment.prod.ts` (production placeholder)

```typescript
export const environment = {
  production: true,
  apiBaseUrl: '',  // no production server exists for this assignment
  sseUrl:     '',
  wsUrl:      '',
};
```

### Resolved URL reference table

Angular services construct endpoint URLs by appending a path suffix to `environment.apiBaseUrl`.

| Purpose | Resolved URL |
|---------|-------------|
| All trucks | `http://localhost:3000/api/fleet` |
| Single truck | `http://localhost:3000/api/fleet/:truckId` |
| All routes | `http://localhost:3000/api/routes` |
| Create route | `http://localhost:3000/api/routes` |
| Update route | `http://localhost:3000/api/routes/:routeId` |
| Reassign route | `http://localhost:3000/api/routes/:routeId/reassign` |
| Send alert | `http://localhost:3000/api/fleet/:truckId/alert` |
| Telemetry history | `http://localhost:3000/api/telemetry/history/:truckId` |
| Reset fleet | `http://localhost:3000/api/reset` |
| SSE stream | `http://localhost:3000/api/telemetry/stream` |
| WebSocket | `ws://localhost:3000/ws` |

---

## 6. Server Validation Checklist

Run these checks after `npm run server` to confirm the server is operating correctly before starting Angular development.

### GET /api/fleet

```bash
curl -s http://localhost:3000/api/fleet
```

**Pass:** `200` response with body `{ "fleet": [...], "timestamp": <number> }` containing exactly 12 truck objects.  
**Note:** 15% of calls return `503 { "error": "Service under heavy load" }` with header `Retry-After: 3`. This is intentional — retry once if it occurs.

Verify fleet length:
```bash
curl -s http://localhost:3000/api/fleet | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); console.log(JSON.parse(d).fleet?.length)"
# Expected output: 12
```

### GET /api/routes

```bash
curl -s http://localhost:3000/api/routes
```

**Pass:** `200` response with body `{ "routes": [], "timestamp": <number> }`. Routes array is empty on a fresh server start.

### GET /api/telemetry/stream (SSE)

```bash
curl -N http://localhost:3000/api/telemetry/stream
```

**Pass:** First line is `data: {"type":"connected","truckCount":12,...}`, followed by `data: {"type":"telemetry","readings":[...],...}` lines arriving approximately every 2 seconds.  
**Also check:** A `data: {"type":"heartbeat",...}` event appears after 15 seconds.  
**Also check:** A `data: {"type":"gps_batch",...}` event appears within ~20–30 seconds (10% of 2-second ticks).  
Press `Ctrl+C` to disconnect.

### WebSocket /ws

Install `wscat` once if not already available:
```bash
npm install -g wscat
```

Connect and register:
```bash
wscat -c ws://localhost:3000/ws
```

Send (type and press Enter):
```json
{"type":"register_dispatcher","name":"TestDispatcher"}
```

**Pass:** Immediate response `{"type":"registered","dispatcherId":"dispatcher_<id>"}`.

Send:
```json
{"type":"ping"}
```

**Pass:** Response `{"type":"pong","timestamp":<number>}`.

Send:
```json
{"type":"viewing_truck","truckId":"truck_1"}
```

**Pass:** Message is broadcast to all other connected WS clients (open a second `wscat` session to verify).

### Validation summary

| Check | Command | Pass condition |
|-------|---------|----------------|
| Server starts | `npm run server` | Console shows `🚛 FleetPulse Server running on port 3000` |
| Fleet endpoint | `curl http://localhost:3000/api/fleet` | 200 with 12 trucks (retry once on 503) |
| Routes endpoint | `curl http://localhost:3000/api/routes` | 200 with `{ routes: [] }` |
| SSE stream | `curl -N .../telemetry/stream` | `connected` event, then `telemetry` every ~2s |
| SSE heartbeat | Wait 15s on open SSE connection | `heartbeat` event arrives |
| SSE batch | Wait ~20–30s on open SSE connection | `gps_batch` event appears at least once |
| WebSocket register | `wscat` + `register_dispatcher` message | `registered` response |
| WebSocket ping | `ping` message | `pong` response |

---

## 7. README Update Plan

The root `README.md` currently contains only the project title. The following sections must be added in a later implementation step.

### Prerequisites

- Node.js 18 LTS or later
- npm 9 or later
- Angular CLI (version matching `angular.json`)

### Mock Server Setup

```
The mock server is provided as-is and must not be modified.

Install server dependencies:
  npm run server:install

Start the mock server:
  npm run server

The server runs on http://localhost:3000.
It simulates eight intentional real-world quirks (GPS batching, fuel sensor
glitches, stuck speed sensor, optimistic locking conflicts, out-of-order
timestamps, ghost dispatcher presence, 503 load responses, PATCH race
conditions). These quirks are handled by the frontend — they are not defects
to be fixed in the server.
```

### Application Setup

```
Install Angular dependencies:
  npm install

Start the Angular dev server:
  npm start

The app runs on http://localhost:4200.
The mock server must be running before starting the app.
```

### Running Both Together

```
Option A (two terminals):
  Terminal 1: npm run server
  Terminal 2: npm start

Option B (single terminal, requires concurrently):
  npm run dev
```

### Test Setup

```
Run unit tests:
  npm test

The mock server does not need to be running for unit tests.
All server interactions are mocked in the test suite.
```

### Architecture Overview

Describe (at implementation time):
- How SSE telemetry flows from `EventSource` → Angular service → component state.
- How WebSocket messages flow from `WebSocket` → Angular service → dispatcher presence store.
- How optimistic locking is implemented: client sends `If-Match`, handles 409 by re-fetching the route and presenting conflict resolution UI.
- How each of the 8 server quirks is handled in the frontend.

### Key Technical Decisions

Describe (at implementation time):
- Why the mock server is a separate sub-project with its own `package.json`.
- Why environment files hold all server URLs.
- Circuit breaker strategy for `GET /api/fleet` 503 responses.

### Known Limitations

- Mock server state is in-memory. All routes and dispatcher registrations are lost on server restart.
- Telemetry history (`GET /api/telemetry/history/:truckId`) is simulated per-request with random noise, not real historical data.
- No production backend exists. `environment.prod.ts` URLs are placeholders.

---

## 8. Git Strategy

### Commit message

```
chore: integrate mock server
```

### Files to stage for this commit

```
mock-server/server.js                      ← provided file, copied verbatim, never edited
mock-server/package.json                   ← NEW — server sub-project manifest
mock-server/package-lock.json             ← generated by npm run server:install
docs/bmad/SERVER_ANALYSIS.md              ← analyst document
docs/bmad/SERVER_INTEGRATION_PLAN.md      ← this file
.gitignore                                 ← updated with mock-server/node_modules/
```

If `concurrently` is added:
```
package.json                               ← new scripts + concurrently devDependency
package-lock.json                          ← updated lockfile
```

### Files NOT included in this commit

- Any Angular source files under `src/` — those belong to feature commits.
- `src/environments/environment.ts` — belongs to the Angular scaffold commit.
- `README.md` content additions — belong to the final polish commit.

### `.gitignore` addition required

```gitignore
# Mock server dependencies
mock-server/node_modules/
```

The Angular `.gitignore` already excludes root `node_modules/`. The `mock-server/node_modules/` directory is separate and must be explicitly ignored.

### Branch note

The repository currently has a single commit on `main`. This commit may go directly to `main`. If a feature-branch workflow is adopted, use `chore/integrate-mock-server` as the branch name and merge via pull request.

---

## 9. Do-Not-Change List

This list is the authoritative constraint boundary for all future implementation work. It applies to every developer, AI agent, and code generation tool working on this repository.

| Constraint | Explanation |
|-----------|-------------|
| **Do not modify `mock-server/server.js`** | The file is provided by the assignment. It is the test substrate. Any modification invalidates the exercise. |
| **Do not change any REST endpoint path** | `/api/fleet`, `/api/routes`, `/api/routes/:routeId`, `/api/routes/:routeId/reassign`, `/api/fleet/:truckId/alert`, `/api/telemetry/stream`, `/api/telemetry/history/:truckId`, `/api/reset` are fixed. The frontend calls these exact paths. |
| **Do not change any response shape** | Field names, nesting, and data types in server responses are fixed. Angular TypeScript models must match the server output, not the other way around. |
| **Do not remove or suppress any of the 8 quirks** | GPS batching, fuel glitch, stuck speed sensor, optimistic locking 409, out-of-order timestamps, ghost dispatcher, 503 Retry-After, and PATCH race conditions are intentional. The frontend handles each; the server does not change. |
| **Do not add a real backend** | No Express, NestJS, Fastify, or any other server-side application is to be created. The mock server is the only server. |
| **Do not add Redis or any data store** | No caching layer, message queue, or database is to be introduced. State lives exclusively in the mock server's in-memory `trucks`, `routes`, and `dispatchers` objects. |
| **Do not transform server responses in a proxy** | Angular's `proxy.conf.json` may forward requests to `localhost:3000` for CORS convenience — transparent pass-through only. It must not transform, cache, retry, or modify responses. |
| **Do not change WebSocket message type strings** | `register_dispatcher`, `ping`, `viewing_truck`, `registered`, `pong`, `dispatcher_joined`, `dispatcher_left`, `dispatcher_viewing`, `route_assigned`, `route_updated`, `route_reassigned`, `truck_alert`, `fleet_reset`, `error` are fixed protocol contracts. |
| **Do not change the `If-Match` header format** | The value must be a plain integer string (e.g., `"3"`). The server uses `parseInt(ifMatch)` — a quoted ETag format such as `"\"3\""` would parse to `NaN` and never match any version. |
| **Do not rename the `X-Dispatcher-Id` header** | The exact casing `X-Dispatcher-Id` is declared in the server's `Access-Control-Allow-Headers`. Any variation will be rejected by the browser's CORS preflight or cause a 401 from the server. |
