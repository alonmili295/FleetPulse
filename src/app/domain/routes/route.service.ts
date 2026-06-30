import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { RoutesApiService } from '../../core/api/routes-api.service';
import { RoutesStore } from './routes.store';
import { AuditLog } from './audit-log';
import { resolveConflict } from './conflict-resolver';
import { AppError } from '../../core/errors/app-error';
import type { CreateRouteBody, PatchRouteBody, ReassignRouteBody, Route, ConflictDetail } from '../../shared/models/route.model';

export type RouteOpResult =
  | { readonly kind: 'success'; readonly route: Route }
  | { readonly kind: 'conflict'; readonly conflict: ConflictDetail }
  | { readonly kind: 'error'; readonly error: AppError };

@Injectable({ providedIn: 'root' })
export class RouteService {
  private readonly dispatcherId = 'dispatcher_web';
  private readonly api = inject(RoutesApiService);
  private readonly store = inject(RoutesStore);
  private readonly auditLog = inject(AuditLog);

  loadRoutes(): Observable<void> {
    return this.api.getRoutes().pipe(
      map(response => {
        this.store.setRoutes(response.routes);
      }),
    );
  }

  createRoute(body: CreateRouteBody): Observable<RouteOpResult> {
    return this.api.createRoute(this.dispatcherId, body).pipe(
      map(route => {
        this.store.upsertRoute(route);
        this.auditLog.append({
          timestamp: Date.now(),
          action: 'create',
          routeId: route.id,
          detail: `Created route to ${route.destination}`,
        });
        return { kind: 'success', route } satisfies RouteOpResult;
      }),
      catchError((err: unknown) => {
        return of({ kind: 'error', error: err as AppError } satisfies RouteOpResult);
      }),
    );
  }

  updateRoute(routeId: string, body: PatchRouteBody): Observable<RouteOpResult> {
    const version = this.store.versionFor(routeId);
    if (version === undefined) {
      return of({
        kind: 'error',
        error: AppError.http(0, `No cached version for route ${routeId}`),
      } satisfies RouteOpResult);
    }

    const cachedVersion = version;
    return this.api.updateRoute(this.dispatcherId, routeId, body, String(version)).pipe(
      map(route => {
        this.store.upsertRoute(route);
        this.auditLog.append({
          timestamp: Date.now(),
          action: 'update',
          routeId: route.id,
          detail: `Updated route status to ${route.status}`,
        });
        return { kind: 'success', route } satisfies RouteOpResult;
      }),
      catchError((err: unknown) => {
        const appErr = err as AppError;
        if (appErr.kind === 'conflict') {
          const conflict = resolveConflict(appErr, cachedVersion);
          this.auditLog.append({
            timestamp: Date.now(),
            action: 'conflict',
            routeId,
            detail: `Conflict: current v${conflict.currentVersion}, yours v${conflict.yourVersion}`,
            conflict,
          });
          return of({ kind: 'conflict', conflict } satisfies RouteOpResult);
        }
        return of({ kind: 'error', error: appErr } satisfies RouteOpResult);
      }),
    );
  }

  reassignRoute(routeId: string, body: ReassignRouteBody): Observable<RouteOpResult> {
    return this.api.reassignRoute(this.dispatcherId, routeId, body).pipe(
      map(route => {
        this.store.upsertRoute(route);
        this.auditLog.append({
          timestamp: Date.now(),
          action: 'reassign',
          routeId: route.id,
          detail: `Reassigned route to truck ${route.truckId}`,
        });
        return { kind: 'success', route } satisfies RouteOpResult;
      }),
      catchError((err: unknown) => {
        return of({ kind: 'error', error: err as AppError } satisfies RouteOpResult);
      }),
    );
  }
}
