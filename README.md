# FleetPulse

Real-Time Fleet Management Dashboard — Angular client for the provided mock fleet server.

> **Current phase: P0 — scaffold.** This is the Angular app scaffold and a static
> dashboard shell only. No telemetry, SSE, WebSocket, route management, anomaly
> detection, or dispatcher presence is implemented yet. See `ARCHITECTURE.md` §38
> for the full phase plan.

## Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+

## Setup

Install the Angular app dependencies and the mock server dependencies:

```bash
npm install            # Angular client dependencies
npm run server:install # mock server dependencies (express, ws)
```

## Run the mock server

The mock server is provided as-is and **must not be modified**. It runs on port 3000.

```bash
npm run server
```

- REST API: `http://localhost:3000/api`
- Telemetry SSE: `http://localhost:3000/api/telemetry/stream`
- WebSocket: `ws://localhost:3000/ws`

## Run the Angular app

```bash
npm start
```

The dev server runs on `http://localhost:4200`. The mock server should be running
first (later phases connect to it; P0 does not).

To run both together in one terminal:

```bash
npm run dev
```

## Run the tests

```bash
npm test
```

Uses the Angular project default test runner (Vitest + jsdom on Angular 21). The
mock server does not need to be running for tests.

## Configuration

Server URLs are defined in `src/environments/` and exposed to the app through the
`APP_CONFIG` injection token (`src/app/core/config/`). Application code injects
`APP_CONFIG` rather than importing environment files directly.

## Documentation

- `SPEC.md` — product & engineering specification
- `ARCHITECTURE.md` — client architecture and phase plan
- `TEST_PLAN.md` — QA strategy and test mapping
- `PROMPTS.md` — AI usage journal
- `docs/bmad/` — server analysis & integration plan
