import type { ServiceUnavailableAppError } from '../errors/app-error';

const FALLBACK_MS = 3_000;

/** Returns the retry delay in milliseconds from a 503 error, falling back to 3 s. */
export function retryAfterMs(err: ServiceUnavailableAppError): number {
  const seconds = err.retryAfterSeconds;
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return FALLBACK_MS;
  return seconds * 1000;
}
