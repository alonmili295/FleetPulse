import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AppError } from '../errors/app-error';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/** Plain class — FleetService owns a private instance per operation. */
export class CircuitBreaker {
  constructor(
    private readonly failureThreshold = 3,
    private readonly resetTimeoutMs = 30_000,
  ) {}

  private _state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private openedAt = 0;

  state(): CircuitState {
    return this._state;
  }

  execute<T>(fn: () => Observable<T>): Observable<T> {
    if (this._state === 'OPEN') {
      if (Date.now() - this.openedAt >= this.resetTimeoutMs) {
        this._state = 'HALF_OPEN';
      } else {
        return throwError(() => AppError.serviceUnavailable('Circuit breaker is OPEN'));
      }
    }

    return fn().pipe(
      tap({ next: () => this.onSuccess() }),
      catchError((err: unknown) => {
        this.onFailure(err);
        return throwError(() => err);
      }),
    );
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this._state = 'CLOSED';
  }

  private onFailure(err: unknown): void {
    if (!isServiceUnavailable(err)) return;
    this.failureCount++;
    if (this._state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this._state = 'OPEN';
      this.openedAt = Date.now();
      this.failureCount = 0;
    }
  }
}

function isServiceUnavailable(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { kind?: string }).kind === 'service_unavailable'
  );
}
