# PROMPTS.md — AI Usage Journal

This document records how AI assistance (Claude, via an agentic coding CLI) was used during the FleetPulse assignment. It is intentionally honest: the AI accelerated analysis, planning, and drafting, but every output was reviewed, corrected, and in several cases reworded or reformatted by hand before being accepted. The AI did **not** produce flawless output on the first try, and this journal notes where it had to be steered.

Conventions used throughout:
- A **BMAD Analyst** prompt style = "read the sources, extract facts, do not invent."
- A **BMAD Architect** prompt style = "given the analysis, design structure and decisions; justify trade-offs."
- A hard rule was repeated in every prompt: **do not modify `mock-server/server.js`**, and the server code is the source of truth whenever documents disagree.

---

## Step 1 — Mock server analysis

**Prompt style:** BMAD Analyst.

**Intent:** Understand the *actual* behaviour of the provided mock server before writing anything — REST endpoints, SSE event types, WebSocket message types, request/response payload shapes, required headers, error shapes (401/404/409/503), optimistic locking, and the 8 intentional server quirks.

**Artifact:** `docs/bmad/SERVER_ANALYSIS.md`.

**How AI was used:** The AI read the assignment HTML and `server.js` and produced a structured analysis (endpoint table, payload models, quirk-by-quirk breakdown, and a risks/assumptions section).

**Review & corrections:**
- Verified each endpoint, header, and payload field against `server.js` directly rather than trusting the summary.
- Confirmed subtle server details that are easy to miss — e.g. the two *different* 409 response shapes (immediate version check vs. post-delay race check), that `If-Match` is compared via `parseInt` (so it must be a bare integer string, not a quoted ETag), and that `POST /api/routes` does **not** block maintenance trucks while `reassign` does.
- These caught details were kept as explicit "risks/assumptions" so they would carry forward into the spec.

---

## Step 2 — Mock server integration planning

**Prompt style:** BMAD Architect.

**Intent:** Decide how to bring the provided server into the repository and run it locally **without changing its behaviour**.

**Artifact:** `docs/bmad/SERVER_INTEGRATION_PLAN.md`.

**How AI was used:** Drafted the folder layout (`mock-server/`), the server `package.json`, root npm scripts, local dev flow, environment URLs, a validation checklist, and an explicit "do-not-change" list.

**Review & corrections:**
- Adjusted the npm scripts on review: replaced `cd mock-server && npm install/start` with the cross-platform `npm --prefix mock-server install` / `npm --prefix mock-server start` form so they behave consistently on Windows.
- Confirmed the integration keeps `server.js` byte-for-byte unchanged and adds only a sibling `package.json` and lockfile.

---

## Step 3 — Product specification

**Prompt style:** BMAD Analyst.

**Intent:** Convert the assignment into an implementation-ready specification: functional requirements, non-functional requirements, the 8 quirks with expected frontend behaviour, testing requirements, and acceptance criteria.

**Artifact:** `SPEC.md`.

**Sources:** assignment HTML, `docs/bmad/SERVER_ANALYSIS.md`, `docs/bmad/SERVER_INTEGRATION_PLAN.md`, and `mock-server/server.js`.

**How AI was used:** Generated a structured spec with stable requirement IDs (FR / NFR / FO / RM / DP / VD / OB / SQ / PF / T / AC) so quirks, requirements, tests, and acceptance criteria could be cross-referenced.

**Review & corrections:**
- Established a source-of-truth hierarchy stating the server code wins over any document.
- Verified each requirement traced back to a real server behaviour (no invented endpoints or fields).
- **Encoding/formatting issue found and fixed iteratively:** at one point the spec was suspected of containing mojibake (e.g. `â`, `Â§`). On inspection of the raw bytes the file was actually already valid UTF-8 with the correct characters (`—`, `→`, `§`, `×`, `≥`); the garbled appearance was a Windows editor reading UTF-8 as Latin-1. The fix applied was adding a UTF-8 BOM so Windows tooling detects the encoding correctly, rather than blindly "replacing" characters that were already correct. This was confirmed by byte-level inspection and by `Select-String` returning no mojibake matches.
- The assignment HTML path referenced in the spec was corrected from `docs/bmad/assignment/...` to the actual location `docs/assignment/...` after the file was moved.

---

## Step 4 — Client architecture

**Prompt style:** BMAD Architect.

**Intent:** Design the Angular client architecture *before* implementation, fully traceable to `SPEC.md`.

**Artifact:** `ARCHITECTURE.md`.

**Sources:** `SPEC.md`, assignment HTML, `docs/bmad/SERVER_ANALYSIS.md`, `docs/bmad/SERVER_INTEGRATION_PLAN.md`, and `mock-server/server.js`.

**How AI was used:** Produced a layered architecture document (overview, folder structure, layer responsibilities, data-flow diagrams, per-quirk handling design, resilience/circuit-breaker design, observability, testing architecture, trade-offs, and phased implementation plan).

**Key decisions captured:**
- **Core infrastructure layer** for REST (`HttpClient` + interceptors), SSE (`EventSource` wrapper), WebSocket (wrapper), logging, and resilience (circuit breaker / retry).
- **Domain layer** owning telemetry processing, sensor-anomaly detection, route conflict resolution, and dispatcher presence as pure, testable logic.
- **Signal-based stores** as the single source of trusted UI state.
- **Feature components** that only render state and dispatch user intents — no transport or business logic.
- **RxJS for streams** (transport, reconnect, backoff) and **Angular Signals for stable UI state**, with the boundary at the store edge.
- **Leaflet** preferred for the map, with a coordinate-grid fallback (map quality is not graded).
- **NgRx intentionally not selected** for this time-boxed assignment — focused domain services plus Signal stores were judged a better trade-off.
- **Redis not implemented** because the mock server must remain unchanged and there is no real backend to cache for; client-side resilience is handled by the circuit breaker and last-good cached state.

**Review & corrections:**
- **Architecture wording refined to avoid overstating constraints.** An early draft justified some decisions by saying the spec "forbids" them (e.g. "SPEC NFR-7 explicitly forbids NgRx"). This was reworded to state these as deliberate engineering trade-offs for a time-boxed assignment, which is more accurate and professional than implying a hard prohibition.
- Loosened over-specific commitments: the framework wording became "Angular with standalone components as the default structure" (rather than "no NgModules"), and the testing section was changed to use the Angular project's default test runner unless explicitly changed — the important point being that tests target pure domain logic with mocked I/O, not a specific runner brand.

---

## Overall assessment of AI usage

- **Where AI helped most:** rapidly turning the server code and assignment into structured, cross-referenced planning documents, and surfacing edge cases (dual 409 shapes, `parseInt`-based `If-Match`, unguarded maintenance assignment) that are easy to overlook.
- **Where human review was essential:** verifying every claim against `server.js`, fixing cross-platform npm scripts, correcting a file path, diagnosing an encoding *display* problem correctly (rather than corrupting already-valid content), and toning down wording that overstated constraints.
- **Discipline maintained throughout:** no frontend code was written during the planning phase, the mock server was never modified, and no backend, NgRx, or Redis was introduced.

All planning artifacts are intended to be living documents; they will be updated as implementation reveals new details, with the server code remaining the final source of truth.
