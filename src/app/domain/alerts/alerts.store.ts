import { Injectable, signal } from '@angular/core';
import type { Alert } from '../../shared/models/alert.model';

const BUFFER_CAP = 50;

@Injectable({ providedIn: 'root' })
export class AlertsStore {
  private readonly _alerts = signal<readonly Alert[]>([]);

  readonly alerts = this._alerts.asReadonly();

  addAlert(alert: Alert): void {
    this._alerts.update(list => {
      if (list.some(a => a.id === alert.id)) return list;
      return [alert, ...list].slice(0, BUFFER_CAP);
    });
  }

  alertsForTruck(truckId: string): readonly Alert[] {
    return this._alerts().filter(a => a.truckId === truckId);
  }
}
