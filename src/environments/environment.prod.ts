/**
 * Production environment values.
 *
 * For P0 these intentionally mirror the development localhost values so the
 * production build remains runnable against the local mock server. When a real
 * deployment target exists, prefer replacing `provideAppConfig()` with a
 * runtime-config strategy rather than baking environment-specific URLs here
 * (see app-config.provider.ts).
 *
 * Selected over `environment.ts` by `fileReplacements` in angular.json for the
 * production build configuration.
 */
export const environment = {
  production: true,
  apiBaseUrl: 'http://localhost:3000/api',
  sseUrl: 'http://localhost:3000/api/telemetry/stream',
  wsUrl: 'ws://localhost:3000/ws',
};
