import { Injectable, inject } from '@angular/core';
import { Observable, throwError, timer } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { FleetApiService } from '../../core/api/fleet-api.service';
import { CircuitBreaker } from '../../core/resilience/circuit-breaker';
import { LogService } from '../../core/logging/log.service';
import { retryAfterMs } from '../../core/resilience/retry-policy';
import type { TruckId, TruckListItem, TruckDetail } from '../../shared/models/truck.model';
import type { ServiceUnavailableAppError } from '../../core/errors/app-error';

const SCOPE = 'FleetService';

@Injectable({ providedIn: 'root' })
export class FleetService {
  private readonly api = inject(FleetApiService);
  private readonly log = inject(LogService);

  // Scoped to load() / GET /api/fleet only.
  private readonly fleetBreaker = new CircuitBreaker();

  load(): Observable<TruckListItem[]> {
    return this.fleetBreaker.execute(() => this.api.getFleet()).pipe(
      map(r => r.fleet),
      catchError((err: unknown) => {
        const appErr = err as { kind?: string; message?: string } & Partial<ServiceUnavailableAppError>;
        if (appErr?.kind === 'service_unavailable') {
          if (appErr.message === 'Circuit breaker is OPEN') {
            this.log.warn(SCOPE, 'Fleet load skipped — circuit breaker is OPEN');
            return throwError(() => err);
          }
          // Real 503 from the server: retry after Retry-After delay.
          const delayMs = retryAfterMs(appErr as ServiceUnavailableAppError);
          this.log.warn(SCOPE, `503 received — retrying in ${delayMs}ms`);
          return timer(delayMs).pipe(
            switchMap(() => this.fleetBreaker.execute(() => this.api.getFleet())),
            map(r => r.fleet),
          );
        }
        this.log.error(SCOPE, 'Fleet load failed', err);
        return throwError(() => err);
      }),
    );
  }

  getTruck(id: TruckId): Observable<TruckDetail> {
    return this.api.getTruck(id).pipe(
      catchError((err: unknown) => {
        this.log.error(SCOPE, `Truck ${id} load failed`, err);
        return throwError(() => err);
      }),
    );
  }
}
