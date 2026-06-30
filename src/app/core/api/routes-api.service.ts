import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { APP_CONFIG } from '../config/app-config';
import { AppError } from '../errors/app-error';
import type { Route, CreateRouteBody, PatchRouteBody, ReassignRouteBody } from '../../shared/models/route.model';

export interface RoutesResponse {
  readonly routes: Route[];
  readonly timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class RoutesApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  getRoutes(): Observable<RoutesResponse> {
    return this.http
      .get<RoutesResponse>(`${this.config.apiBaseUrl}/routes`)
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => this.mapError(err))));
  }

  createRoute(dispatcherId: string, body: CreateRouteBody): Observable<Route> {
    return this.http
      .post<Route>(`${this.config.apiBaseUrl}/routes`, body, {
        headers: { 'X-Dispatcher-Id': dispatcherId },
      })
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => this.mapError(err))));
  }

  updateRoute(
    dispatcherId: string,
    routeId: string,
    body: PatchRouteBody,
    ifMatch: string,
  ): Observable<Route> {
    return this.http
      .patch<Route>(`${this.config.apiBaseUrl}/routes/${routeId}`, body, {
        headers: { 'X-Dispatcher-Id': dispatcherId, 'If-Match': ifMatch },
      })
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => this.mapError(err))));
  }

  reassignRoute(
    dispatcherId: string,
    routeId: string,
    body: ReassignRouteBody,
  ): Observable<Route> {
    return this.http
      .put<Route>(`${this.config.apiBaseUrl}/routes/${routeId}/reassign`, body, {
        headers: { 'X-Dispatcher-Id': dispatcherId },
      })
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => this.mapError(err))));
  }

  private mapError(err: HttpErrorResponse): AppError {
    if (err.status === 409) {
      const body = err.error as Record<string, unknown>;
      if (typeof body?.['currentVersion'] === 'number') {
        const message =
          typeof body['error'] === 'string' ? body['error'] : err.message;
        return AppError.conflict(
          body['currentVersion'] as number,
          message,
          typeof body['yourVersion'] === 'number' ? (body['yourVersion'] as number) : undefined,
          typeof body['lastModifiedBy'] === 'string' ? (body['lastModifiedBy'] as string) : undefined,
        );
      }
    }
    return AppError.http(err.status, err.message, err.error, err);
  }
}
