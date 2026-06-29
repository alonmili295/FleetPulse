import { Provider } from '@angular/core';

import { environment } from '../../../environments/environment';
import { APP_CONFIG, AppConfig } from './app-config';

/**
 * Provides the application configuration to the DI container.
 *
 * For P0 the values originate from the compile-time Angular environment files
 * (`environment.ts` / `environment.prod.ts`). This function is the only place in
 * the app that reads `environment` — every other layer injects `APP_CONFIG`.
 *
 * This indirection means the provider can later be replaced by a runtime-config
 * strategy (e.g. fetching `/config.json` at startup, or reading injected env
 * vars) for staging/production deployments, without changing a single consumer.
 */
export function provideAppConfig(): Provider {
  const config: AppConfig = {
    production: environment.production,
    apiBaseUrl: environment.apiBaseUrl,
    sseUrl: environment.sseUrl,
    wsUrl: environment.wsUrl,
  };

  return { provide: APP_CONFIG, useValue: config };
}
