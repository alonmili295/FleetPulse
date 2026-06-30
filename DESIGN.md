# FleetPulse — Design Document

**Role:** BMAD Documentation Architect / Product Designer
**Companion to:** `README.md` (setup + feature summary), `ARCHITECTURE.md` (layered/system architecture, as-built §39), `SPEC.md` (requirements), `PROMPTS.md` (AI workflow)

This document explains the **product and system design** of FleetPulse — the reasoning behind the dispatcher experience, the screen layout, and the interaction and data-presentation choices. It complements `ARCHITECTURE.md` rather than repeating it: where `ARCHITECTURE.md` describes *how* the code is layered, this document describes *why* the product looks and behaves the way it does.

---

## 1. Product Design Goal

FleetPulse is designed for **dispatchers monitoring a live fleet in real time**. The dispatcher's job is to keep an accurate operational picture of every truck and to act quickly when something needs attention.

The UI is organized around **operational awareness**: live status, location, route assignment, anomalies, alerts, and dispatcher collaboration are all visible and continuously updated. Information that hides a problem (a frozen value, a stale position, a silent sensor error) is treated as a design failure.

FleetPulse is a **single-page dashboard** by deliberate choice. A dispatcher needs the whole operational picture at once — the list, the map, the active routes, and the health of the live feeds — without navigating away and losing context. Drilling into a specific truck happens **in place** (a detail panel), not on a separate page.

---

## 2. User Roles and Primary Workflows

**Primary user role: Dispatcher.** There is a single operational role; all features are framed around the dispatcher's monitoring and coordination tasks. Multiple dispatchers can be connected at once and see each other's presence.

**Primary workflows:**

- **Monitor the fleet overview** — scan all trucks, their status, live speed/fuel, and location at a glance.
- **Inspect a truck** — open the vehicle detail panel for gauges, mileage, active route, and recent alerts.
- **View live location and trail on the map** — see spatial context and recent movement.
- **Create / edit / reassign / cancel routes** — manage assignments directly from the dashboard.
- **Resolve route conflicts** — recover cleanly when another dispatcher changed a route first.
- **See other dispatchers currently viewing the same truck** — avoid duplicated or conflicting work.
- **Send truck alerts** — push a message to a truck and have it converge across all dispatchers.
- **Observe runtime health and anomalies** — surface hidden realtime problems (dropped readings, sensor errors, connection state).
- **Filter the fleet list** — narrow the view to the trucks that currently matter.

---

## 3. Screen Layout and UX Rationale

The dashboard is composed of stacked regions, each owning one operational concern:

- **Header** — app title, live connection status banner (SSE feed state), and dispatcher presence indicator (WebSocket state + active dispatcher count).
- **Fleet overview list** — the primary scan surface: every truck with status, live speed/fuel/location, plus the fleet filter controls.
- **Fleet map** — Leaflet map with one marker per truck and a polyline trail for recent movement.
- **Route management** — create/update/reassign/cancel routes, with conflict notices and an audit feed.
- **Vehicle detail panel** — deep inspection of the selected truck.
- **Observability panel** — runtime health of the live feeds.
- **Anomaly dashboard** — fleet-wide view of active sensor anomalies.

**Why this layout works:**

- The **fleet list** gives a fast, dense scan — the dispatcher's default "is everything OK?" view.
- The **map** adds spatial context the list can't convey — where trucks actually are and how they're moving.
- The **vehicle detail panel** provides depth on demand without leaving the dashboard.
- **Route management** stays visible because assignment is a continuous operational task, not an occasional one.
- The **observability and anomaly** regions make otherwise-invisible realtime issues explicit — a dropped-telemetry count or a stuck speed sensor is surfaced rather than silently absorbed.

---

## 4. Interaction Design

- **Single click on a fleet row** selects that truck and opens the Vehicle Detail panel in place.
- **Keyboard selection** is supported on fleet rows (Enter/Space activate the same selection as a click), so the list is operable without a mouse.
- **Filter controls** (text search, status, assignment, low-fuel) narrow the fleet list to the relevant trucks.
- **Changing any filter clears the selected truck**, so the Vehicle Detail panel resets rather than showing a truck that may now be hidden or irrelevant.
- **Anomaly rows are clickable and keyboard-accessible** — selecting one focuses the matching truck in the Vehicle Detail panel.
- **Critical route actions require inline confirmation** — reassign, complete, and cancel present a confirm/cancel step before the mutation is dispatched.
- **Non-critical route updates remain direct** — e.g. moving a route from `assigned` to `in-progress` dispatches immediately.
- **Empty and no-match states are explicit** — the list distinguishes "no fleet data yet" (nothing loaded) from "no trucks match the current filters" (filtered to empty), so the dispatcher always knows *why* the list is empty.

---

## 5. Data Presentation Design

- **Speed, fuel, and temperature** are shown as readable metrics and gauges rather than raw numbers buried in text.
- **`speed: 999` is treated as a sensor error** — it is never shown as a trusted speed. The UI shows the last valid value (or a clear placeholder) and flags the sensor state.
- **A transient `fuel: 0` is treated as a glitch** — the display holds the last valid/estimated fuel value rather than rendering a misleading `0%`.
- **Stale telemetry is dropped, not applied** — a reading older than the last accepted one for that truck is discarded so the UI never rewinds to an earlier position or value.
- **Route status and truck status use badges** — consistent, color-coded chips make state scannable.
- **Recent alerts and the audit feed are bounded** — only the most recent entries are kept and shown, so the panels stay informative instead of turning into unbounded noise.

The guiding principle: the UI should show **trustworthy** data. A wrong-but-confident value is worse than an honestly-flagged "—".

---

## 6. Realtime Collaboration Design

- **Dispatcher presence is shown in the header** — a status dot reflects the WebSocket connection state and an active-dispatcher count shows how many people are connected.
- **Viewing state shows who else is looking at a truck** — when a dispatcher opens a truck, other dispatchers viewing the same truck appear as labelled chips in the detail panel, reducing duplicated or conflicting work.
- **Stale viewers are pruned** — viewing entries expire on a TTL so ghost viewers disappear even when a disconnect notification is delayed.
- **Route broadcasts keep dispatchers converged** — when any dispatcher assigns, updates, or reassigns a route, the change is broadcast over WebSocket and applied to every dispatcher's view.
- **Route conflicts are handled with optimistic locking and visible recovery** — concurrent edits are detected via version checks; the conflicting dispatcher sees who changed it and can retry against the latest version (see §7 and `ARCHITECTURE.md` §39.3).

---

## 7. Resilience and Trust Design

- **The UI prefers last-known-good data over blank or failing screens** — a degraded feed shows the most recent trusted state rather than wiping the dashboard.
- **SSE and WebSocket state are visible** — the dispatcher always knows whether the live feeds are healthy, connecting, or degraded.
- **503 `Retry-After` and the circuit breaker protect the app from hammering the server** — service-unavailable responses are retried on the server's schedule, and repeated failures open the breaker so the client backs off instead of spinning. The circuit breaker is scoped to fleet loading; single-truck lookups bypass it.
- **The observability panel exposes the hidden health signals** — heartbeat age, connection state, dropped-telemetry count, live anomaly count, and the recent audit feed, all derived from existing stores.
- **Build warnings are documented truthfully** — the production build succeeds with existing size-budget warnings only; the documentation does not claim a warning-free build.

---

## 8. Design System

- **Custom CSS design system** — a shared set of design tokens (colors, spacing, typography, radii, shadows) in `styles.css` drives a consistent look.
- **No Angular Material / no UI library** — all components are hand-built, keeping the dependency surface small and predictable.
- **Consistent primitives** — cards, status/route badges, connection banners, buttons, and visible focus states are reused across regions.
- **Responsive layout** — the dashboard adapts to narrower viewports (e.g. the fleet grid collapses, secondary indicators hide) so the core information stays usable.
- **Text-only rendering for server-provided data** — all server strings are rendered via Angular text binding or DOM `textContent`; no `innerHTML` is used with server data, avoiding injection risk.

---

## 9. Design Trade-offs

- **Client-side filtering only** — filters operate on the already-loaded fleet, not a server query; appropriate for this fleet size and avoids extra round-trips.
- **The filtered list does not filter the map** — the map intentionally stays full-fleet so spatial awareness is never silently reduced by a list filter.
- **Inline confirmations instead of modal dialogs** — simpler, dependency-free, and contained to the route-management region.
- **In-app observability instead of external monitoring** — health is derived from existing stores and shown in-panel rather than exported to a monitoring backend.
- **Signals + services instead of NgRx** — fine-grained, synchronous state with less ceremony for a domain of this size.
- **Custom CSS instead of a UI framework** — more control and a smaller footprint, at the cost of building primitives by hand.
- **No backend added** — the mock server remains the single source of truth; all resilience and caching live on the client.

---

## 10. Known Limitations

- **No geofencing** implementation.
- **No command palette / keyboard-shortcut system.**
- **No external metrics export** — observability is runtime/in-app only.
- **No persistent dispatcher session** — identity is per-connection.
- **No E2E multi-browser dispatcher tests** — multi-dispatcher behaviour is covered by unit/integration tests, not full end-to-end browser sessions.
- **Existing Angular size-budget warnings remain** — the production build succeeds, with those budget warnings only.

---

## 11. Improvements With More Time

- Double-click a fleet row to focus that truck on the map.
- Geofencing zones and alerts.
- External observability backend / OpenTelemetry export.
- Advanced route table sorting and filtering.
- E2E tests for real multi-dispatcher sessions.
- Persisted dispatcher identity / session state.
- Latency and events-per-second metrics.
- Command palette and keyboard shortcuts.

---

## 12. Final Validation

- **408 tests passing** across **37 test files**
- **Production build succeeds** — existing size-budget warnings only
- **`mock-server/server.js` unchanged** — verified via `git diff -- mock-server/server.js` (empty diff)
