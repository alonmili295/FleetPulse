/**
 * Development environment values.
 *
 * These are the concrete compile-time values consumed by `provideAppConfig()`
 * (src/app/core/config/app-config.provider.ts). Application code must NOT import
 * this file directly — it injects `APP_CONFIG` instead (NFR-8, ARCHITECTURE §6).
 *
 * The production build swaps this file for `environment.prod.ts` via
 * `fileReplacements` in angular.json.
 */
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000/api',
  sseUrl: 'http://localhost:3000/api/telemetry/stream',
  wsUrl: 'ws://localhost:3000/ws',
};
