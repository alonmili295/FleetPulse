import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { CircuitBreaker } from './circuit-breaker';
import { AppError } from '../errors/app-error';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  const svcErr = () => AppError.serviceUnavailable('503 from server');
  const httpErr = () => AppError.http(404, 'Not found');

  beforeEach(() => {
    vi.useFakeTimers();
    cb = new CircuitBreaker();
  });

  afterEach(() => vi.useRealTimers());

  // ── TC-CB-1 ─────────────────────────────────────────────────────────────────

  it('TC-CB-1: starts CLOSED and opens after 3 service_unavailable failures', () => {
    expect(cb.state()).toBe('CLOSED');
    for (let i = 0; i < 3; i++) {
      cb.execute(() => throwError(svcErr)).subscribe({ error: () => {} });
    }
    expect(cb.state()).toBe('OPEN');
  });

  it('TC-CB-1b: non-service_unavailable errors do not count toward the threshold', () => {
    for (let i = 0; i < 5; i++) {
      cb.execute(() => throwError(httpErr)).subscribe({ error: () => {} });
    }
    expect(cb.state()).toBe('CLOSED');
  });

  // ── TC-CB-2 ─────────────────────────────────────────────────────────────────

  it('TC-CB-2: OPEN state rejects immediately without executing the protected operation', () => {
    for (let i = 0; i < 3; i++) {
      cb.execute(() => throwError(svcErr)).subscribe({ error: () => {} });
    }
    expect(cb.state()).toBe('OPEN');

    const fn = vi.fn().mockReturnValue(of('should not run'));
    let err: { kind?: string; message?: string } | undefined;
    cb.execute(fn).subscribe({ error: e => (err = e) });

    expect(fn).not.toHaveBeenCalled();
    expect(err?.kind).toBe('service_unavailable');
    expect(err?.message).toBe('Circuit breaker is OPEN');
  });

  // ── TC-CB-3 ─────────────────────────────────────────────────────────────────

  it('TC-CB-3: OPEN transitions to HALF_OPEN after reset timeout; success closes it', () => {
    for (let i = 0; i < 3; i++) {
      cb.execute(() => throwError(svcErr)).subscribe({ error: () => {} });
    }
    expect(cb.state()).toBe('OPEN');

    vi.advanceTimersByTime(30_001);

    let result: string | undefined;
    cb.execute(() => of('ok')).subscribe(r => (result = r));

    expect(result).toBe('ok');
    expect(cb.state()).toBe('CLOSED');
  });

  // ── TC-CB-4 ─────────────────────────────────────────────────────────────────

  it('TC-CB-4: HALF_OPEN failure re-opens the circuit', () => {
    for (let i = 0; i < 3; i++) {
      cb.execute(() => throwError(svcErr)).subscribe({ error: () => {} });
    }
    vi.advanceTimersByTime(30_001);

    cb.execute(() => throwError(svcErr)).subscribe({ error: () => {} });

    expect(cb.state()).toBe('OPEN');
  });
});
