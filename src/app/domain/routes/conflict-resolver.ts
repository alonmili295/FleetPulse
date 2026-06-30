import type { ConflictAppError } from '../../core/errors/app-error';
import type { ConflictDetail } from '../../shared/models/route.model';

export function resolveConflict(
  err: ConflictAppError,
  cachedVersion: number | undefined,
): ConflictDetail {
  return {
    currentVersion: err.currentVersion,
    yourVersion: err.yourVersion ?? cachedVersion ?? 0,
    lastModifiedBy:
      typeof err.lastModifiedBy === 'string' && err.lastModifiedBy.trim().length > 0
        ? err.lastModifiedBy
        : 'unknown',
  };
}
