import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TelemetryHealthStore {
  private readonly _droppedCount = signal(0);
  readonly droppedCount = this._droppedCount.asReadonly();

  incrementDropped(count = 1): void {
    this._droppedCount.update(n => n + count);
  }

  reset(): void {
    this._droppedCount.set(0);
  }
}
