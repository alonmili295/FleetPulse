import { resolveConflict } from './conflict-resolver';
import type { ConflictAppError } from '../../core/errors/app-error';

function makeErr(
  currentVersion: number,
  yourVersion?: number,
  lastModifiedBy?: string,
): ConflictAppError {
  return {
    kind: 'conflict',
    message: 'conflict',
    currentVersion,
    ...(yourVersion !== undefined && { yourVersion }),
    ...(lastModifiedBy !== undefined && { lastModifiedBy }),
  };
}

describe('resolveConflict', () => {
  it('full 409 shape: all fields pass through unchanged', () => {
    const result = resolveConflict(makeErr(5, 2, 'dispatcher_2'), 2);
    expect(result).toEqual({ currentVersion: 5, yourVersion: 2, lastModifiedBy: 'dispatcher_2' });
  });

  it('lean 409 shape: yourVersion falls back to cachedVersion', () => {
    expect(resolveConflict(makeErr(5), 2).yourVersion).toBe(2);
  });

  it('lean 409 shape with no cachedVersion: yourVersion is 0', () => {
    expect(resolveConflict(makeErr(5), undefined).yourVersion).toBe(0);
  });

  it('lean 409 shape: lastModifiedBy defaults to unknown', () => {
    expect(resolveConflict(makeErr(5), 1).lastModifiedBy).toBe('unknown');
  });

  it('empty string lastModifiedBy normalizes to unknown', () => {
    expect(resolveConflict(makeErr(5, 1, ''), 1).lastModifiedBy).toBe('unknown');
  });

  it('whitespace-only lastModifiedBy normalizes to unknown', () => {
    expect(resolveConflict(makeErr(5, 1, '   '), 1).lastModifiedBy).toBe('unknown');
  });

  it('currentVersion is preserved exactly', () => {
    expect(resolveConflict(makeErr(42, 1, 'alice'), 1).currentVersion).toBe(42);
  });

  it('yourVersion from error takes precedence over cachedVersion', () => {
    expect(resolveConflict(makeErr(5, 7, 'alice'), 3).yourVersion).toBe(7);
  });
});
