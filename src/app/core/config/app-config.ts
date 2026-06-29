import { InjectionToken } from '@angular/core';

/**
 * Application configuration contract.
 *
 * The single typed surface every layer uses to read server connection details.
 * Consumers inject `APP_CONFIG`; they never import the Angular `environment`
 * files directly (NFR-8, ARCHITECTURE §6).
 */
export interface AppConfig {
  readonly production: boolean;
  /** REST base URL, e.g. http://localhost:3000/api */
  readonly apiBaseUrl: string;
  /** Server-Sent Events telemetry stream URL */
  readonly sseUrl: string;
  /** WebSocket dispatcher channel URL */
  readonly wsUrl: string;
}

/** DI token used to inject the resolved {@link AppConfig}. */
export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');
