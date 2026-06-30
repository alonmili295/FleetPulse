import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { APP_CONFIG } from '../config/app-config';
import { AppError } from '../errors/app-error';
import type { Alert, SendAlertBody } from '../../shared/models/alert.model';

@Injectable({ providedIn: 'root' })
export class VehicleAlertApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  sendAlert(truckId: string, body: SendAlertBody, dispatcherId: string): Observable<Alert> {
    return this.http
      .post<Alert>(`${this.config.apiBaseUrl}/fleet/${truckId}/alert`, body, {
        headers: { 'X-Dispatcher-Id': dispatcherId },
      })
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => this.mapError(err))));
  }

  private mapError(err: HttpErrorResponse): AppError {
    return AppError.http(err.status, err.message, err.error, err);
  }
}
