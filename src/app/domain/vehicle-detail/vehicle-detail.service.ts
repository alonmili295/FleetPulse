import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { FleetApiService } from '../../core/api/fleet-api.service';
import { VehicleAlertApiService } from '../../core/api/vehicle-alert-api.service';
import { AlertsStore } from '../alerts/alerts.store';
import { AppError } from '../../core/errors/app-error';
import type { Alert, SendAlertBody } from '../../shared/models/alert.model';

const DISPATCHER_ID = 'dispatcher_web';

export type AlertOpResult =
  | { readonly kind: 'success'; readonly alert: Alert }
  | { readonly kind: 'error'; readonly error: AppError };

@Injectable({ providedIn: 'root' })
export class VehicleDetailService implements OnDestroy {
  private readonly fleetApi = inject(FleetApiService);
  private readonly alertApi = inject(VehicleAlertApiService);
  private readonly alertsStore = inject(AlertsStore);

  private readonly _mileageCache = signal<ReadonlyMap<string, number>>(new Map());
  private readonly _loadingTruckId = signal<string | null>(null);
  private readonly _detailError = signal<AppError | null>(null);

  readonly loadingTruckId = this._loadingTruckId.asReadonly();
  readonly detailError = this._detailError.asReadonly();

  private detailSub: Subscription | undefined;

  mileageFor(truckId: string): number | null {
    return this._mileageCache().get(truckId) ?? null;
  }

  loadDetail(truckId: string): void {
    this.detailSub?.unsubscribe();
    this._loadingTruckId.set(truckId);
    this._detailError.set(null);

    this.detailSub = this.fleetApi.getTruck(truckId).subscribe({
      next: detail => {
        this._mileageCache.update(map => {
          const next = new Map(map);
          next.set(truckId, detail.mileage);
          return next;
        });
        this._loadingTruckId.set(null);
      },
      error: (err: AppError) => {
        this._detailError.set(err);
        this._loadingTruckId.set(null);
      },
    });
  }

  sendAlert(truckId: string, body: SendAlertBody): Observable<AlertOpResult> {
    return this.alertApi.sendAlert(truckId, body, DISPATCHER_ID).pipe(
      map(alert => {
        this.alertsStore.addAlert(alert);
        return { kind: 'success', alert } satisfies AlertOpResult;
      }),
      catchError((err: unknown) =>
        of({ kind: 'error', error: err as AppError } satisfies AlertOpResult),
      ),
    );
  }

  ngOnDestroy(): void {
    this.detailSub?.unsubscribe();
  }
}
