import { TestBed } from '@angular/core/testing';
import { signal, type WritableSignal } from '@angular/core';
import { vi } from 'vitest';
import { AnomalyDashboardComponent } from './anomaly-dashboard';
import { FleetStore } from '../../domain/fleet/fleet.store';
import { TelemetryStore } from '../../domain/telemetry/telemetry.store';
import { SelectedVehicleStore } from '../../domain/vehicle-selection/selected-vehicle.store';
import type { TruckListItem } from '../../shared/models/truck.model';
import type { TruckReading } from '../../shared/models/telemetry.model';

// ── Minimal map-value type the component reads ───────────────────────────────
type TruckEntry = { latest: TruckReading | null; lastAcceptedTs: number };
type TrucksMap  = Map<string, TruckEntry>;

// ── Truck fixtures ────────────────────────────────────────────────────────────
function makeTruck(id: string, name: string, status: TruckListItem['status'] = 'active'): TruckListItem {
  return { id, name, status, location: { lat: 0, lng: 0 }, speed: 60, heading: 0, fuel: 75, engineTemp: 85, currentRouteId: null, _version: 1 };
}

function baseReading(truckId: string, overrides: Partial<TruckReading> = {}): TruckReading {
  return {
    truckId, location: { lat: 0, lng: 0 }, speed: 60, heading: 0,
    fuel: 75, engineTemp: 85, status: 'active', timestamp: 1_700_000_000_000,
    speedSensorError: false, displaySpeed: 60,
    fuelGlitch: false, displayFuel: 75,
    ...overrides,
  };
}

const speedTruck  = makeTruck('truck_speed', 'Speedy',  'active');
const fuelTruck   = makeTruck('truck_fuel',  'Fuelly',  'idle');
const bothTruck   = makeTruck('truck_both',  'Broken',  'maintenance');
const normalTruck = makeTruck('truck_ok',    'Normal',  'active');

const speedReading  = baseReading('truck_speed', { speed: 999, speedSensorError: true, displaySpeed: null });
const fuelReading   = baseReading('truck_fuel',  { fuel: 0, fuelGlitch: true, displayFuel: 50 });
const bothReading   = baseReading('truck_both',  { speed: 999, speedSensorError: true, displaySpeed: null, fuel: 0, fuelGlitch: true, displayFuel: 30 });
const normalReading = baseReading('truck_ok');

function makeMap(...entries: Array<[string, TruckReading | null]>): TrucksMap {
  return new Map(entries.map(([id, r]) => [id, { latest: r, lastAcceptedTs: r?.timestamp ?? 0 }]));
}

describe('AnomalyDashboardComponent', () => {
  let truckListSignal:  WritableSignal<TruckListItem[]>;
  let trucksMapSignal:  WritableSignal<TrucksMap>;
  let selectTruckSpy:  ReturnType<typeof vi.fn>;

  function render(): ReturnType<typeof TestBed.createComponent<AnomalyDashboardComponent>> {
    const fixture = TestBed.createComponent(AnomalyDashboardComponent);
    fixture.detectChanges();
    TestBed.flushEffects();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(async () => {
    truckListSignal = signal<TruckListItem[]>([]);
    trucksMapSignal = signal<TrucksMap>(new Map());
    selectTruckSpy  = vi.fn();

    await TestBed.configureTestingModule({
      imports: [AnomalyDashboardComponent],
      providers: [
        { provide: FleetStore,           useValue: { truckList: truckListSignal.asReadonly() } },
        { provide: TelemetryStore,       useValue: { trucks: trucksMapSignal.asReadonly() } },
        { provide: SelectedVehicleStore, useValue: { selectTruck: selectTruckSpy } },
      ],
    }).compileComponents();
  });

  // ── Empty states ──────────────────────────────────────────────────────────

  it('shows empty state when fleet is empty', () => {
    truckListSignal.set([]);
    expect((render().nativeElement as HTMLElement).querySelector('.anom__empty')).not.toBeNull();
  });

  it('shows empty state when no trucks have anomalies', () => {
    truckListSignal.set([normalTruck]);
    trucksMapSignal.set(makeMap(['truck_ok', normalReading]));
    expect((render().nativeElement as HTMLElement).querySelector('.anom__empty')).not.toBeNull();
  });

  it('hides empty state when anomalies exist', () => {
    truckListSignal.set([speedTruck]);
    trucksMapSignal.set(makeMap(['truck_speed', speedReading]));
    expect((render().nativeElement as HTMLElement).querySelector('.anom__empty')).toBeNull();
  });

  // ── Counter values ────────────────────────────────────────────────────────

  it('totalCount reflects the number of anomalous trucks', () => {
    truckListSignal.set([speedTruck, fuelTruck, normalTruck]);
    trucksMapSignal.set(makeMap(
      ['truck_speed', speedReading],
      ['truck_fuel',  fuelReading],
      ['truck_ok',    normalReading],
    ));
    expect((render().nativeElement as HTMLElement).querySelector('.anom__total-count')?.textContent?.trim()).toBe('2');
  });

  it('speedErrCount counts speed-only and both-type trucks', () => {
    truckListSignal.set([speedTruck, fuelTruck, bothTruck]);
    trucksMapSignal.set(makeMap(
      ['truck_speed', speedReading],
      ['truck_fuel',  fuelReading],
      ['truck_both',  bothReading],
    ));
    // speed + both = 2
    expect((render().nativeElement as HTMLElement).querySelector('.anom__speed-count')?.textContent?.trim()).toBe('2');
  });

  it('fuelGlitchCount counts fuel-only and both-type trucks', () => {
    truckListSignal.set([speedTruck, fuelTruck, bothTruck]);
    trucksMapSignal.set(makeMap(
      ['truck_speed', speedReading],
      ['truck_fuel',  fuelReading],
      ['truck_both',  bothReading],
    ));
    // fuel + both = 2
    expect((render().nativeElement as HTMLElement).querySelector('.anom__fuel-count')?.textContent?.trim()).toBe('2');
  });

  // ── Row rendering ─────────────────────────────────────────────────────────

  it('renders .anom__row for each anomalous truck only', () => {
    truckListSignal.set([speedTruck, fuelTruck, normalTruck]);
    trucksMapSignal.set(makeMap(
      ['truck_speed', speedReading],
      ['truck_fuel',  fuelReading],
      ['truck_ok',    normalReading],
    ));
    const rows = (render().nativeElement as HTMLElement).querySelectorAll('.anom__row');
    expect(rows.length).toBe(2);
  });

  it('shows truck name in each row', () => {
    truckListSignal.set([speedTruck]);
    trucksMapSignal.set(makeMap(['truck_speed', speedReading]));
    expect((render().nativeElement as HTMLElement).querySelector('.anom__row-name')?.textContent?.trim()).toBe('Speedy');
  });

  it('shows truck status badge in each row', () => {
    truckListSignal.set([fuelTruck]);
    trucksMapSignal.set(makeMap(['truck_fuel', fuelReading]));
    const badge = (render().nativeElement as HTMLElement).querySelector('.anom__row-status');
    expect(badge?.classList.contains('anom__row-status--idle')).toBe(true);
  });

  it('does not render non-anomalous trucks', () => {
    truckListSignal.set([speedTruck, normalTruck]);
    trucksMapSignal.set(makeMap(
      ['truck_speed', speedReading],
      ['truck_ok',    normalReading],
    ));
    const rows = (render().nativeElement as HTMLElement).querySelectorAll('.anom__row');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Speedy');
    expect(rows[0].textContent).not.toContain('Normal');
  });

  // ── Anomaly type badge ────────────────────────────────────────────────────

  it('shows "Speed Sensor" label and speed class for speedSensorError-only truck', () => {
    truckListSignal.set([speedTruck]);
    trucksMapSignal.set(makeMap(['truck_speed', speedReading]));
    const badge = (render().nativeElement as HTMLElement).querySelector('.anom__type');
    expect(badge?.textContent?.trim()).toBe('Speed Sensor');
    expect(badge?.classList.contains('anom__type--speed')).toBe(true);
  });

  it('shows "Fuel Glitch" label and fuel class for fuelGlitch-only truck', () => {
    truckListSignal.set([fuelTruck]);
    trucksMapSignal.set(makeMap(['truck_fuel', fuelReading]));
    const badge = (render().nativeElement as HTMLElement).querySelector('.anom__type');
    expect(badge?.textContent?.trim()).toBe('Fuel Glitch');
    expect(badge?.classList.contains('anom__type--fuel')).toBe(true);
  });

  it('shows "Both" label and both class when truck has both anomalies', () => {
    truckListSignal.set([bothTruck]);
    trucksMapSignal.set(makeMap(['truck_both', bothReading]));
    const badge = (render().nativeElement as HTMLElement).querySelector('.anom__type');
    expect(badge?.textContent?.trim()).toBe('Both');
    expect(badge?.classList.contains('anom__type--both')).toBe(true);
  });

  // ── Display values ────────────────────────────────────────────────────────

  it('shows — when displaySpeed is null for speed anomaly truck', () => {
    truckListSignal.set([speedTruck]);
    trucksMapSignal.set(makeMap(['truck_speed', speedReading])); // displaySpeed: null
    const val = (render().nativeElement as HTMLElement).querySelector('.anom__val--speed');
    expect(val?.textContent?.trim()).toBe('—');
  });

  it('shows displayFuel value for fuel glitch truck', () => {
    truckListSignal.set([fuelTruck]);
    trucksMapSignal.set(makeMap(['truck_fuel', fuelReading])); // displayFuel: 50
    const val = (render().nativeElement as HTMLElement).querySelector('.anom__val--fuel');
    expect(val?.textContent?.trim()).toBe('50%');
  });

  it('shows — when displayFuel is null for fuel glitch truck', () => {
    const nullFuelReading = baseReading('truck_fuel', { fuelGlitch: true, displayFuel: undefined });
    truckListSignal.set([fuelTruck]);
    trucksMapSignal.set(makeMap(['truck_fuel', nullFuelReading]));
    const val = (render().nativeElement as HTMLElement).querySelector('.anom__val--fuel');
    expect(val?.textContent?.trim()).toBe('—');
  });

  // ── Timestamp ─────────────────────────────────────────────────────────────

  it('shows formatted timestamp when reading has a nonzero timestamp', () => {
    truckListSignal.set([speedTruck]);
    trucksMapSignal.set(makeMap(['truck_speed', speedReading]));
    const time = (render().nativeElement as HTMLElement).querySelector('.anom__row-time');
    expect(time).not.toBeNull();
    expect(time?.textContent?.trim().length).toBeGreaterThan(0);
  });

  // ── Selection ─────────────────────────────────────────────────────────────

  it('calls SelectedVehicleStore.selectTruck with the truck id when a row is clicked', () => {
    truckListSignal.set([speedTruck]);
    trucksMapSignal.set(makeMap(['truck_speed', speedReading]));
    const row = (render().nativeElement as HTMLElement).querySelector<HTMLElement>('.anom__row');
    row?.click();
    expect(selectTruckSpy).toHaveBeenCalledWith('truck_speed');
  });

  it('calls SelectedVehicleStore.selectTruck on Enter key press on a row', () => {
    truckListSignal.set([fuelTruck]);
    trucksMapSignal.set(makeMap(['truck_fuel', fuelReading]));
    const row = (render().nativeElement as HTMLElement).querySelector<HTMLElement>('.anom__row');
    row?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(selectTruckSpy).toHaveBeenCalledWith('truck_fuel');
  });
});
