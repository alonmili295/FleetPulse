import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SelectedVehicleStore {
  private readonly _selectedTruckId = signal<string | null>(null);

  readonly selectedTruckId = this._selectedTruckId.asReadonly();

  selectTruck(id: string): void {
    this._selectedTruckId.set(id);
  }

  clearSelection(): void {
    this._selectedTruckId.set(null);
  }
}
