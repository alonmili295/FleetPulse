import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { APP_CONFIG } from '../config/app-config';
import { AppError } from '../errors/app-error';
import type { TruckId, TruckListItem, TruckDetail } from '../../shared/models/truck.model';

export interface FleetResponse {
  readonly fleet: TruckListItem[];
  readonly timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class FleetApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  getFleet(): Observable<FleetResponse> {
    return this.http.get<FleetResponse>(`${this.config.apiBaseUrl}/fleet`).pipe(
      catchError((err: HttpErrorResponse) => throwError(() => this.mapError(err))),
    );
  }

  getTruck(id: TruckId): Observable<TruckDetail> {
    return this.http.get<TruckDetail>(`${this.config.apiBaseUrl}/fleet/${id}`).pipe(
      catchError((err: HttpErrorResponse) => throwError(() => this.mapError(err))),
    );
  }

  private mapError(err: HttpErrorResponse): AppError {
    if (err.status === 503) {
      const raw = err.headers.get('Retry-After') ?? '';
      const retryAfterSeconds = /^\d+$/.test(raw) ? parseInt(raw, 10) : undefined;
      return AppError.serviceUnavailable('Service temporarily unavailable', retryAfterSeconds, err);
    }
    return AppError.http(err.status, err.message, err.error, err);
  }
}
