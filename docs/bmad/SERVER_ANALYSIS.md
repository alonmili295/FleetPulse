# FleetPulse Mock Server — BMAD Analyst Document

**Source files:** `server.js` (mock server), `senior-test-4-assignment.html` (assignment spec)  
**Analyst note:** All facts in this document are derived exclusively from the two source files above. Nothing has been invented or inferred beyond what the code explicitly shows.

---

## 1. Mock Server Purpose

The mock server simulates a real-time fleet tracking backend for 12 delivery trucks operating around Tel Aviv city center (lat 32.0853, lng 34.7818). It provides:

- A REST API for reading fleet state and managing route assignments.
- A Server-Sent Events (SSE) endpoint that pushes live GPS/telemetry data every 2 seconds.
- A WebSocket endpoint for multi-dispatcher presence and real-time event broadcasting.
- Eight intentional quirks that simulate real-world sensor and network failure modes. The frontend must handle all of them.

The server is **not to be modified**. Its quirks are the test.

---

## 2. How to Run the Server

```bash
npm install express ws
node server.js
```

- HTTP API base URL: `http://localhost:3000`
- SSE endpoint: `http://localhost:3000/api/telemetry/stream`
- WebSocket endpoint: `ws://localhost:3000/ws`
- Reset endpoint: `POST http://localhost:3000/api/reset`

The server starts with 12 trucks pre-initialised. CORS is open (`Access-Control-Allow-Origin: *`).

---

## 3. REST Endpoints

| Method | Path | Auth Required | Description |
|--------|------|---------------|-------------|
| `GET` | `/api/fleet` | No | Returns all 12 trucks. Has a 15% chance of returning 503 with `Retry-After: 3`. |
| `GET` | `/api/fleet/:truckId` | No | Returns a single truck's full detail. Returns 404 if the truck ID is unknown. |
| `GET` | `/api/routes` | No | Returns all routes currently in memory. |
| `POST` | `/api/routes` | Yes (`X-Dispatcher-Id`) | Creates a new route and assigns it to a truck. Returns 201 on success. Returns 400 if `truckId` or `destination` are missing. Returns 404 if the truck does not exist. Returns 409 if the truck already has an active route. |
| `PATCH` | `/api/routes/:routeId` | Yes (`X-Dispatcher-Id`) | Updates route `status`, `notes`, and/or `priority`. Supports optimistic locking via `If-Match` header. Returns 409 on version conflict. Has an artificial processing delay of 200–1000 ms. Returns 404 if route does not exist. |
| `PUT` | `/api/routes/:routeId/reassign` | Yes (`X-Dispatcher-Id`) | Reassigns a route to a different truck. Returns 400 if the target truck is in maintenance. Returns 404 if route or target truck is not found. Returns 409 if the target truck already has a route. |
| `POST` | `/api/fleet/:truckId/alert` | Optional (`X-Dispatcher-Id`) | Creates an alert for a specific truck and broadcasts it via WebSocket. Returns 201. Returns 404 if truck is not found. |
| `GET` | `/api/telemetry/stream` | No | SSE stream. See Section 7. |
| `GET` | `/api/telemetry/history/:truckId` | No | Returns a simulated history of up to 300 readings for a truck. Query parameter `?limit=` (default 60, max 300). Returns 404 if truck is not found. |
| `POST` | `/api/reset` | No | Resets all routes, dispatchers, and truck state to initial values. Broadcasts `fleet_reset` via WebSocket. Returns `{ success: true }`. |

---

## 4. Required Headers

| Header | Applies To | Behaviour When Missing |
|--------|-----------|------------------------|
| `X-Dispatcher-Id` | `POST /api/routes`, `PATCH /api/routes/:routeId`, `PUT /api/routes/:routeId/reassign`, `POST /api/fleet/:truckId/alert` | Returns `401 { error: 'X-Dispatcher-Id header required' }` for the first three. For the alert endpoint the check is present in code but no explicit 401 guard — the value is used as `sentBy` and may be `undefined` if omitted. |
| `If-Match` | `PATCH /api/routes/:routeId` | Optional. If provided, the value must equal the route's current `_version` integer (as a string). Mismatch returns `409`. If omitted, version checking is skipped entirely. |
| `Content-Type: application/json` | All `POST`, `PATCH`, `PUT` requests with a body | Required for `express.json()` middleware to parse the body. Not explicitly validated by the server, but the body will be `undefined` if the header is absent. |

---

## 5. Request Models

### POST `/api/routes` — Create Route

```json
{
  "truckId":     "truck_1",          // required — string, must match a known truck ID
  "destination": "123 Main St",      // required — string
  "priority":    "normal",           // optional — default "normal"; values not enforced by server
  "notes":       "Handle with care"  // optional — default ""
}
```

### PATCH `/api/routes/:routeId` — Update Route

```json
{
  "status":   "in-progress",  // optional — "assigned" | "in-progress" | "completed" | "cancelled"
  "notes":    "Updated note", // optional
  "priority": "high"          // optional
}
```

All fields are optional. Only provided fields are applied. The `If-Match` header (integer as string) should accompany this request.

### PUT `/api/routes/:routeId/reassign` — Reassign Route

```json
{
  "newTruckId": "truck_3"  // required — string, must match a known truck ID
}
```

### POST `/api/fleet/:truckId/alert` — Send Alert

```json
{
  "message":  "Fuel low, return to depot", // optional — default "Alert from dispatch"
  "severity": "warning"                    // optional — default "info"
}
```

---

## 6. Response Models

### Truck Object

Returned by `GET /api/fleet` (inside `fleet[]` array) and `GET /api/fleet/:truckId`.

```json
{
  "id":             "truck_1",
  "name":           "Truck Alpha",
  "status":         "active",       // "active" | "idle" | "maintenance"
  "location": {
    "lat":          32.0923,
    "lng":          34.7961
  },
  "speed":          42.3,           // km/h, float
  "heading":        127.5,          // degrees 0–360
  "fuel":           73.2,           // percent 0–100; subject to sensor glitches (see quirks)
  "engineTemp":     88.1,           // Celsius
  "mileage":        54230,          // integer, km (only on GET /api/fleet/:truckId)
  "lastUpdate":     1700000000000,  // unix ms (only on GET /api/fleet/:truckId)
  "currentRouteId": "route_3",      // string or null
  "_version":       14              // integer — increments on every server-side mutation
}
```

`GET /api/fleet` strips `mileage` and `lastUpdate` from the fleet list response. `GET /api/fleet/:truckId` returns the full object including those fields.

`GET /api/fleet` wraps the array:
```json
{ "fleet": [...], "timestamp": 1700000000000 }
```

### Route Object

Returned by `POST /api/routes` (status 201), `PATCH /api/routes/:routeId`, `PUT /api/routes/:routeId/reassign`, and inside `GET /api/routes`.

```json
{
  "id":               "route_1",
  "truckId":          "truck_1",
  "destination":      "123 Main St",
  "priority":         "normal",
  "notes":            "",
  "status":           "assigned",       // "assigned" | "in-progress" | "completed" | "cancelled"
  "assignedBy":       "dispatcher_abc",
  "assignedAt":       1700000000000,
  "_version":         1,
  "lastModifiedBy":   "dispatcher_xyz", // present after a PATCH
  "lastModifiedAt":   1700000001000,    // present after a PATCH
  "reassignedBy":     "dispatcher_xyz", // present after a PUT /reassign
  "reassignedAt":     1700000002000     // present after a PUT /reassign
}
```

`GET /api/routes` wraps the array:
```json
{ "routes": [...], "timestamp": 1700000000000 }
```

### Alert Object

Returned by `POST /api/fleet/:truckId/alert` (status 201) and broadcast via WebSocket.

```json
{
  "id":           "550e8400-e29b-41d4-a716-446655440000", // UUID
  "truckId":      "truck_1",
  "message":      "Fuel low, return to depot",
  "severity":     "warning",
  "sentBy":       "dispatcher_abc",
  "timestamp":    1700000000000,
  "acknowledged": false
}
```

### Telemetry History Entry

Each item in `GET /api/telemetry/history/:truckId` response:

```json
{
  "truckId":    "truck_1",
  "location":   { "lat": 32.0923, "lng": 34.7961 },
  "speed":      38.2,
  "fuel":       74.1,
  "engineTemp": 87.5,
  "timestamp":  1700000000000
}
```

Response wrapper:
```json
{ "history": [...], "count": 60 }
```

Note: history is **simulated** from current truck state with random noise. It is not persisted across requests.

### Error Responses

All errors follow:
```json
{ "error": "Human-readable description" }
```

409 conflict responses carry additional fields — see Section 10.

---

## 7. SSE Endpoint and Event Types

**Endpoint:** `GET /api/telemetry/stream`

Response headers:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

Each message is framed as:
```
data: <JSON string>\n\n
```

There are no `event:` lines — all messages are the default event type. Clients must parse the `type` field inside the JSON payload to distinguish them.

### Event: `connected`

Sent once immediately on connection.

```json
{
  "type":       "connected",
  "truckCount": 12,
  "timestamp":  1700000000000
}
```

### Event: `heartbeat`

Sent every 15 seconds while the connection is open.

```json
{
  "type":      "heartbeat",
  "timestamp": 1700000000000
}
```

### Event: `telemetry`

Sent every 2 seconds. Contains one reading per truck (12 readings per event).

```json
{
  "type":      "telemetry",
  "timestamp": 1700000000000,
  "readings": [
    {
      "truckId":    "truck_1",
      "location":   { "lat": 32.0923, "lng": 34.7961 },
      "speed":      42.3,
      "heading":    127.5,
      "fuel":       73.2,
      "engineTemp": 88.1,
      "status":     "active",
      "timestamp":  1700000000000,
      "_reordered": true   // present on ONE reading per event, 10% of events (quirk 5)
    }
  ]
}
```

The `_reordered` flag marks a reading whose `timestamp` has been backdated by 3–8 seconds. It appears on at most one reading per `telemetry` event and only 10% of the time.

### Event: `gps_batch`

Sent outside the normal `telemetry` event, approximately 10% of 2-second ticks. Represents buffered historical GPS readings from a single truck recovering signal.

```json
{
  "type":    "gps_batch",
  "truckId": "truck_3",
  "readings": [
    {
      "truckId":     "truck_3",
      "location":    { "lat": 32.091, "lng": 34.799 },
      "speed":       38.5,
      "heading":     127.5,
      "fuel":        73.2,
      "engineTemp":  88.1,
      "status":      "active",
      "timestamp":   1699999980000,  // oldest reading — 2s intervals, going back in time
      "_batch":      true,
      "_batchIndex": 0,
      "_batchTotal": 15
    }
    // ... up to 29 more readings, each 2s older than the previous
  ]
}
```

- Batch size: 10–30 readings.
- Timestamps are spaced 2 seconds apart, going backwards from `now - (batchSize * 2000)` to `now - 2000`.
- The readings are emitted in chronological order (oldest `_batchIndex: 0`).
- Only active trucks trigger a batch.

---

## 8. WebSocket Endpoint and Message Types

**Endpoint:** `ws://localhost:3000/ws`

The server does not require authentication to open a WebSocket connection. Identity is established by sending a `register_dispatcher` message.

### Client → Server Messages

#### `register_dispatcher`

Register as a named dispatcher. Must be sent before using `viewing_truck`.

```json
{
  "type":         "register_dispatcher",
  "dispatcherId": "my-dispatcher-id",  // optional — server generates one if omitted
  "name":         "Alice"              // optional — defaults to "Anonymous"
}
```

Server responds with `registered` directly to the sender, and broadcasts `dispatcher_joined` to all other connected clients.

#### `ping`

Keepalive. Server responds with `pong` directly to the sender.

```json
{ "type": "ping" }
```

#### `viewing_truck`

Notifies all other dispatchers which truck this dispatcher is currently looking at. Requires prior `register_dispatcher`.

```json
{
  "type":    "viewing_truck",
  "truckId": "truck_5"
}
```

### Server → Client Messages

#### `registered`

Sent only to the registering client.

```json
{
  "type":         "registered",
  "dispatcherId": "dispatcher_abc12345"
}
```

#### `pong`

Sent only to the pinging client.

```json
{
  "type":      "pong",
  "timestamp": 1700000000000
}
```

#### `dispatcher_joined`

Broadcast to all clients except the one who just joined.

```json
{
  "type":              "dispatcher_joined",
  "dispatcherId":      "dispatcher_abc12345",
  "name":              "Alice",
  "activeDispatchers": 3,
  "timestamp":         1700000000000
}
```

#### `dispatcher_left`

Broadcast to all clients when a dispatcher disconnects. May be delayed by up to 10 seconds (quirk 6).

```json
{
  "type":              "dispatcher_left",
  "dispatcherId":      "dispatcher_abc12345",
  "activeDispatchers": 2,
  "timestamp":         1700000000000
}
```

#### `dispatcher_viewing`

Broadcast to all clients except the sender when a dispatcher sends `viewing_truck`.

```json
{
  "type":         "dispatcher_viewing",
  "dispatcherId": "dispatcher_abc12345",
  "truckId":      "truck_5",
  "timestamp":    1700000000000
}
```

#### `route_assigned`

Broadcast to all clients when a new route is created via `POST /api/routes`.

```json
{
  "type":         "route_assigned",
  "route":        { /* full Route object */ },
  "truckId":      "truck_1",
  "assignedBy":   "dispatcher_abc12345",
  "truckVersion": 15,
  "timestamp":    1700000000000
}
```

#### `route_updated`

Broadcast to all clients after a successful `PATCH /api/routes/:routeId`.

```json
{
  "type":      "route_updated",
  "route":     { /* full Route object with incremented _version */ },
  "updatedBy": "dispatcher_abc12345",
  "timestamp": 1700000000000
}
```

#### `route_reassigned`

Broadcast to all clients after a successful `PUT /api/routes/:routeId/reassign`.

```json
{
  "type":          "route_reassigned",
  "route":         { /* full Route object */ },
  "oldTruckId":    "truck_1",
  "newTruckId":    "truck_3",
  "reassignedBy":  "dispatcher_abc12345",
  "timestamp":     1700000000000
}
```

#### `truck_alert`

Broadcast to all clients when `POST /api/fleet/:truckId/alert` is called.

```json
{
  "type":  "truck_alert",
  "alert": { /* full Alert object */ }
}
```

#### `fleet_reset`

Broadcast to all clients when `POST /api/reset` is called.

```json
{
  "type":      "fleet_reset",
  "timestamp": 1700000000000
}
```

#### `error`

Sent only to the client that sent unparseable JSON.

```json
{
  "type":    "error",
  "message": "Invalid JSON"
}
```

---

## 9. Optimistic Locking Behavior

Both trucks and routes carry an integer `_version` field initialised to `1`. The server increments it on every mutation.

**Truck `_version`** is incremented when:
- A route is assigned to the truck (`POST /api/routes`).
- The truck is freed when a route is completed or cancelled (`PATCH /api/routes/:routeId` with status `completed` or `cancelled`).
- A route is reassigned away from or onto the truck (`PUT /api/routes/:routeId/reassign`).
- Each simulation tick if the truck is active (every 2 seconds).

**Route `_version`** is incremented when:
- The route is created (starts at `1`).
- A successful `PATCH /api/routes/:routeId` completes.
- A `PUT /api/routes/:routeId/reassign` completes.

**How the lock works on `PATCH`:**

1. Client sends `If-Match: <integer>` header alongside the PATCH body.
2. Server reads the header immediately. If `parseInt(ifMatch) !== route._version`, returns **409** immediately (before the processing delay).
3. If the version matches, server waits 200–1000 ms (simulated processing delay).
4. After the delay, server checks the version **again**. If another request (e.g., a concurrent reassignment) incremented the version during the wait, returns **409** a second time.
5. Only if both checks pass does the server apply the update and increment `_version`.

**If `If-Match` is omitted**, neither version check runs and the update is applied unconditionally. The assignment expects the frontend to always send `If-Match`.

The frontend must store the latest known `_version` for every route and update it from:
- The response body of any successful mutation.
- `route_assigned`, `route_updated`, `route_reassigned` WebSocket broadcasts (which contain the updated route object).

---

## 10. 409 Conflict Behavior

There are three distinct 409 scenarios:

### Scenario A — Truck already assigned (`POST /api/routes`)

Triggered when the target truck's `currentRouteId` is non-null.

```json
HTTP 409
{
  "error":          "Truck already assigned",
  "currentRouteId": "route_2",
  "assignedBy":     "dispatcher_xyz"
}
```

### Scenario B — Route version mismatch, immediate check (`PATCH /api/routes/:routeId`)

Triggered when the `If-Match` header value does not match `route._version` at the time the request arrives.

```json
HTTP 409
{
  "error":          "Route was modified by another dispatcher",
  "currentVersion": 5,
  "yourVersion":    3,
  "lastModifiedBy": "dispatcher_xyz"
}
```

`lastModifiedBy` falls back to `route.assignedBy` if the route has never been patched.

### Scenario C — Route version mismatch, post-delay check (`PATCH /api/routes/:routeId`, quirk 8)

Triggered when the version was valid on arrival but changed during the 200–1000 ms processing window (i.e., a concurrent reassignment completed during that time).

```json
HTTP 409
{
  "error":          "Route was modified during processing",
  "currentVersion": 5
}
```

Note: this response does **not** include `yourVersion` or `lastModifiedBy`.

### Scenario D — Target truck already has a route (`PUT /api/routes/:routeId/reassign`)

```json
HTTP 409
{
  "error": "Target truck already has an assigned route"
}
```

---

## 11. 503 Retry-After Behavior

`GET /api/fleet` returns a 503 response with probability 0.15 (15%) on every call.

```
HTTP 503
Retry-After: 3
Content-Type: application/json

{ "error": "Service under heavy load" }
```

- The `Retry-After` value is always the integer `3` (seconds).
- There is no circuit breaker on the server side — it is purely random per request.
- All other endpoints are unaffected; only `GET /api/fleet` has this behaviour.

**Frontend requirements:**
1. After receiving a 503, read the `Retry-After` response header.
2. Wait at least that many seconds before retrying.
3. Do not retry immediately or in a tight loop.
4. The assignment bonus requirement specifies: after **3 consecutive 503s**, enter a circuit-breaker degraded mode — display the last successfully fetched data with a "stale data" indicator and stop hammering the endpoint until recovery is confirmed.

---

## 12. The 8 Intentional Server Quirks

### Quirk 1 — GPS Batch (signal recovery)

**What the server does:**  
On approximately 10% of 2-second simulation ticks, the server selects a random active truck and emits a `gps_batch` SSE event containing 10–30 historical location readings. These readings have timestamps spaced 2 seconds apart, going backwards from the current time. They are sent all at once, out of chronological band with the normal `telemetry` event stream.

**Relevant code:**
```js
if (Math.random() < 0.1) {
  // ... generates batchSize (10–30) readings
  // timestamp: timestamp - (i * 2000)  // 2 seconds apart, going back in time
  res.write(`data: ${batchPayload}\n\n`);
}
```

### Quirk 2 — Fuel Sensor Glitch (hard braking)

**What the server does:**  
For any active truck travelling above 40 km/h, there is a 5% chance per 2-second tick of triggering a fuel sensor glitch. During the glitch (which lasts 2–4 seconds), the server reports `fuel: 0` for that truck in all `telemetry` events, regardless of the truck's actual fuel level (which is tracked separately as `truck.fuel`).

**Relevant code:**
```js
fuel: fuelGlitchTrucks.has(truck.id) ? 0 : truck.fuel
```

The actual `truck.fuel` continues to decrement normally during a glitch; only the reported value is `0`.

### Quirk 3 — Speed Sensor Stuck (Truck 7)

**What the server does:**  
Every 3 seconds there is an 8% chance that `truck_7`'s speed sensor enters a "stuck" state. While stuck (5–10 seconds), all `telemetry` events report `speed: 999` for `truck_7`. The truck continues to move normally on the server; only the reported speed value is wrong.

**Relevant code:**
```js
speed: truck7SensorStuck && truck.id === 'truck_7' ? 999 : truck.speed
```

### Quirk 4 — Optimistic Locking 409 (route version mismatch)

**What the server does:**  
`PATCH /api/routes/:routeId` checks the `If-Match` header against the route's `_version` immediately upon receiving the request. If the versions differ, it returns 409 without applying any changes. This is the primary enforcement mechanism for optimistic locking. (See also Quirk 8 for the secondary check.)

### Quirk 5 — Out-of-Order GPS Timestamps

**What the server does:**  
On approximately 10% of `telemetry` events, one randomly selected reading has its `timestamp` field replaced with a value 3–8 seconds in the past. The reading is also flagged with `_reordered: true`. The reading arrives in the normal event stream but carries a timestamp older than previously received readings for the same truck.

**Relevant code:**
```js
if (Math.random() < 0.1 && readings.length > 0) {
  readings[idx].timestamp = timestamp - 3000 - Math.random() * 5000;
  readings[idx]._reordered = true;
}
```

### Quirk 6 — Ghost Dispatcher Presence

**What the server does:**  
When a dispatcher's WebSocket connection closes, there is a 20% chance the server delays sending the `dispatcher_left` broadcast by 10 seconds. During this window, the dispatcher's record remains in the `dispatchers` map on the server. Other clients will continue to see this dispatcher as online until the delayed event arrives.

**Relevant code:**
```js
if (Math.random() < 0.2) {
  setTimeout(() => {
    delete dispatchers[dispatcherId];
    broadcastWS({ type: 'dispatcher_left', ... });
  }, 10000);
}
```

### Quirk 7 — 503 Under Load (GET /api/fleet)

**What the server does:**  
`GET /api/fleet` returns `HTTP 503` with `Retry-After: 3` on 15% of requests. All other endpoints are unaffected. There is no state machine — each request is independently random. (Described in full in Section 11.)

### Quirk 8 — PATCH Race Condition (reassignment mid-update)

**What the server does:**  
After the initial version check passes on a `PATCH`, the server deliberately waits 200–1000 ms before applying the update. It then re-checks the route version. If a `PUT /reassign` (or any other mutation) arrived and completed during that delay, the route version will have incremented, and the PATCH returns a second 409 with the message `"Route was modified during processing"`. This simulates a real race condition between concurrent dispatchers.

---

## 13. What the Frontend Must Do for Each Quirk

### Quirk 1 — GPS Batch

- Listen for `gps_batch` SSE events separately from `telemetry`.
- Sort the batch readings by `timestamp` ascending before processing.
- Apply all readings as a historical path on the map (e.g., a polyline trail).
- Set the truck's current display position to the reading with the **highest timestamp** in the batch — not the last array element, since the server description says they go back in time but the array is ordered chronologically.
- Do not create separate map markers for each reading.
- Do not trigger alerts (fuel, speed) from batch readings that are historical.

### Quirk 2 — Fuel Sensor Glitch

- Maintain a short rolling history of fuel readings per truck (e.g., the last 3–5 readings).
- If the incoming fuel value is `0` but the prior readings were above a plausible threshold (e.g., > 5%), treat the `0` as a sensor glitch rather than a real empty-tank condition.
- Suppress low-fuel alerts during a detected glitch.
- Display a transient "sensor glitch" indicator on the truck (not a permanent alert).
- Do not update the stored fuel level to `0` during a detected glitch; retain the last valid value.
- After 2–4 seconds the server will resume reporting the real fuel value; the indicator should auto-clear when valid readings resume.

### Quirk 3 — Speed Sensor Stuck (Truck 7)

- Any speed reading ≥ a defined maximum realistic threshold (the assignment suggests clamping; a value like 200 km/h or simply > 300 km/h is clearly invalid) should be flagged as a sensor error.
- Do not display `999 km/h` to the dispatcher; show a `SENSOR ERR` badge or similar on Truck 7.
- Do not use the erroneous speed value in any calculation (route ETA, alert thresholds, etc.).
- Do not trigger a speeding alert based on a flagged sensor-error reading.
- When the server resumes sending valid speed values, clear the error flag automatically.

### Quirk 4 — Optimistic Locking 409

- Always include the `If-Match: <_version>` header on every `PATCH /api/routes/:routeId` request.
- On a 409 response from scenario B (Section 10), extract `currentVersion` and `lastModifiedBy` from the response body.
- Display a conflict notification to the dispatcher that includes who made the conflicting change.
- Re-fetch the route's current state (`GET /api/fleet/:truckId` or from a WebSocket broadcast).
- Present the dispatcher with a clear path: retry with the new version or cancel.
- Update the locally stored `_version` before any retry attempt.

### Quirk 5 — Out-of-Order GPS Timestamps

- Store the last accepted `timestamp` per truck.
- Before applying any incoming telemetry reading, compare its `timestamp` to the stored last-accepted value.
- If `incoming.timestamp < lastAcceptedTimestamp`, discard the reading — do not update the truck's displayed position or sensor values.
- The `_reordered: true` flag is informational; the timestamp comparison is the authoritative guard.
- For batch readings (Quirk 1), sort by timestamp and still apply the same staleness filter before rendering the trail.

### Quirk 6 — Ghost Dispatcher Presence

- Store online dispatchers in a map keyed by `dispatcherId`.
- `dispatcher_left` events must be idempotent: if the `dispatcherId` is not in the local map, silently ignore the event.
- Do not show a jarring disappearance when the delayed `dispatcher_left` finally arrives. Options: fade the avatar out over a short animation, or apply a grace-period timer before removing the entry.
- Do not mark a dispatcher as "definitely offline" based solely on a timeout — wait for the explicit `dispatcher_left` event.
- The 10-second ghost window means the frontend may receive `dispatcher_left` well after the dispatcher tab was closed; this is expected and should not cause an error.

### Quirk 7 — 503 Retry-After

- After receiving a 503 from `GET /api/fleet`, parse the `Retry-After` header value (integer seconds).
- Schedule a single retry after that interval. Do not retry immediately.
- Show a visible "retrying in Xs…" countdown to the dispatcher.
- Track consecutive 503 count. After 3 consecutive 503s, implement circuit-breaker degraded mode:
  - Stop issuing new requests to `GET /api/fleet`.
  - Display the last successfully fetched fleet data with a "stale data — as of HH:MM:SS" banner.
  - Probe for recovery at a low cadence (e.g., every 10–15 seconds) using a single request; on success, close the circuit and resume normal polling.
- Reset the consecutive-503 counter on any successful 200 response.

### Quirk 8 — PATCH Race Condition

- Handle the scenario C 409 response (Section 10) identically to scenario B — both signal that the frontend's locally cached route version is stale.
- Note that scenario C's response body has a different shape: it lacks `yourVersion` and `lastModifiedBy`. The UI must handle both shapes without crashing.
- On either 409, re-fetch the route, update the local version, and present the conflict resolution UI.
- Consider that the race window is 200–1000 ms; a dispatcher who clicks quickly may encounter this without any other dispatcher being involved (the reassignment could have been triggered by themselves moments earlier).

---

## 14. Risks and Assumptions

### Risks

| Risk | Detail |
|------|--------|
| **No SSE reconnection logic in server** | The server does not implement `Last-Event-ID` or any event replay mechanism. If the SSE connection drops, all events missed during the outage are lost. The frontend must handle reconnection and accept a data gap. |
| **No route version in WebSocket broadcasts for `route_assigned`** | The `route_assigned` WS message includes `truckVersion` (the truck's new version) but the `route` object itself starts at `_version: 1`. Downstream clients must use the embedded `route._version`, not a separately transmitted field. |
| **`GET /api/fleet` is the only 503-affected endpoint** | Initial data load depends on this endpoint. If the circuit breaker opens before the first successful fetch, the frontend will have no fleet data at all. The frontend should handle a completely empty initial state gracefully. |
| **Alert `X-Dispatcher-Id` not enforced** | The `POST /api/fleet/:truckId/alert` endpoint does not return 401 if `X-Dispatcher-Id` is missing (the guard exists for the other three endpoints but the alert path only reads the header without rejecting absent values). The frontend should still always send the header for consistency. |
| **Telemetry history is simulated, not persisted** | `GET /api/telemetry/history/:truckId` generates random noise around the current truck state on each call. Two consecutive calls will return different data. This endpoint cannot be used for accurate historical analysis. |
| **No authentication beyond `X-Dispatcher-Id`** | The dispatcher ID is a plain string with no verification. Any client can impersonate any dispatcher ID. This is a mock server limitation and should not be replicated in a production design. |
| **`POST /api/reset` is unauthenticated and destructive** | Any client can reset the entire fleet state. In the frontend, this should be guarded by a confirmation dialog and only exposed in a developer/debug panel. |

### Assumptions

| Assumption | Basis |
|------------|-------|
| All 12 truck IDs are `truck_1` through `truck_12` and are stable across resets. | `initFleet()` always generates the same IDs in order. |
| The WebSocket connection at `/ws` does not require a prior HTTP handshake beyond the standard WS upgrade. | `new WebSocket.Server({ server, path: '/ws' })` — standard ws library setup. |
| The `If-Match` header value must be sent as a plain integer string (e.g., `"3"`), not an ETag-quoted string (e.g., `"\"3\""`). | `parseInt(ifMatch)` is used directly — quoted ETags would parse to `NaN` and never match. |
| Route status transitions are not enforced by the server. | The PATCH handler sets `route.status = status` without validating the transition. The frontend is responsible for enforcing valid transitions in its UI. |
| Trucks in `maintenance` status never receive route assignments. | The `PUT /reassign` endpoint checks `newTruck.status === 'maintenance'` and returns 400. No such check exists in `POST /api/routes` — the frontend should prevent assigning routes to maintenance trucks in its own UI validation. |
| The server's 2-second simulation tick and the SSE push happen in the same `setInterval` callback, so `telemetry` events arrive approximately every 2 seconds under normal conditions. | `setInterval(() => { simulateTrucks(); sendTelemetrySSE(); }, 2000)` |
| `gps_batch` and `telemetry` events can arrive interleaved within the same 2-second window. | Both are emitted from within `sendTelemetrySSE()` — the batch (if triggered) is sent before the normal telemetry payload. |
