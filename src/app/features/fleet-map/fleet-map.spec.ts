import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import * as L from 'leaflet';
import { FleetMapComponent } from './fleet-map';
import { FleetStore } from '../../domain/fleet/fleet.store';
import { TelemetryStore } from '../../domain/telemetry/telemetry.store';
import type { TruckListItem } from '../../shared/models/truck.model';
import type { TruckReading } from '../../shared/models/telemetry.model';

// Declared outside vi.mock so the implementation closure captures the binding.
// beforeEach assigns a fresh object before each test.
let mapMock: { setView: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };

vi.mock('leaflet', () => ({
  map: vi.fn().mockImplementation(() => mapMock),
  tileLayer: vi.fn().mockReturnValue({
    addTo: vi.fn().mockReturnThis(),
  }),
  circleMarker: vi.fn().mockImplementation(() => ({
    addTo:     vi.fn().mockReturnThis(),
    setLatLng: vi.fn().mockReturnThis(),
    bindPopup: vi.fn().mockReturnThis(),
    remove:    vi.fn(),
  })),
  polyline: vi.fn().mockImplementation(() => ({
    addTo:      vi.fn().mockReturnThis(),
    setLatLngs: vi.fn().mockReturnThis(),
    remove:     vi.fn(),
  })),
}));

const mockTruck: TruckListItem = {
  id: 'truck_1', name: 'Truck 1', status: 'active',
  location: { lat: 32.0853, lng: 34.7818 },
  speed: 60, heading: 90, fuel: 75, engineTemp: 85,
  currentRouteId: null, _version: 1,
};

const mockTruck2: TruckListItem = {
  id: 'truck_2', name: 'Truck 2', status: 'idle',
  location: { lat: 32.1, lng: 34.8 },
  speed: 0, heading: 0, fuel: 50, engineTemp: 70,
  currentRouteId: null, _version: 1,
};

const baseReading: TruckReading = {
  truckId: 'truck_1',
  location: { lat: 32.0853, lng: 34.7818 },
  speed: 60, heading: 90, fuel: 75, engineTemp: 85,
  status: 'active', timestamp: 1000,
  displaySpeed: 60, displayFuel: 75,
  speedSensorError: false, fuelGlitch: false,
};

describe('FleetMapComponent', () => {
  const truckList = signal<TruckListItem[]>([]);
  let latestForMock: ReturnType<typeof vi.fn>;
  let historyForMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    mapMock = { setView: vi.fn(), remove: vi.fn() };
    mapMock.setView.mockReturnValue(mapMock); // L.map(el).setView(...) returns the same map instance

    truckList.set([]);
    latestForMock  = vi.fn().mockReturnValue(null);
    historyForMock = vi.fn().mockReturnValue([]);

    await TestBed.configureTestingModule({
      imports: [FleetMapComponent],
      providers: [
        { provide: FleetStore,     useValue: { truckList } },
        { provide: TelemetryStore, useValue: { latestFor: latestForMock, historyFor: historyForMock } },
      ],
    }).compileComponents();
  });

  it('renders the map container div', () => {
    const fixture = TestBed.createComponent(FleetMapComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.fleet-map')).not.toBeNull();
  });

  it('initializes Leaflet map after view init centered on Tel Aviv', () => {
    const fixture = TestBed.createComponent(FleetMapComponent);
    fixture.detectChanges();
    expect(vi.mocked(L.map)).toHaveBeenCalledTimes(1);
    expect(mapMock.setView).toHaveBeenCalledWith([32.0853, 34.7818], 11);
  });

  it('creates one circleMarker per truck', () => {
    truckList.set([mockTruck, mockTruck2]);
    const fixture = TestBed.createComponent(FleetMapComponent);
    fixture.detectChanges();
    expect(vi.mocked(L.circleMarker)).toHaveBeenCalledTimes(2);
  });

  it('uses live telemetry location over REST fallback', () => {
    truckList.set([mockTruck]);
    latestForMock.mockReturnValue({ ...baseReading, location: { lat: 32.1, lng: 34.9 } });
    const fixture = TestBed.createComponent(FleetMapComponent);
    fixture.detectChanges();
    expect(vi.mocked(L.circleMarker)).toHaveBeenCalledWith([32.1, 34.9], expect.anything());
  });

  it('uses REST fallback location when no live telemetry exists', () => {
    truckList.set([mockTruck]);
    latestForMock.mockReturnValue(null);
    const fixture = TestBed.createComponent(FleetMapComponent);
    fixture.detectChanges();
    expect(vi.mocked(L.circleMarker)).toHaveBeenCalledWith([32.0853, 34.7818], expect.anything());
  });

  it('creates a polyline when history has at least 2 points', () => {
    truckList.set([mockTruck]);
    historyForMock.mockReturnValue([
      { ...baseReading, location: { lat: 32.0, lng: 34.7 } },
      { ...baseReading, location: { lat: 32.1, lng: 34.8 } },
    ]);
    const fixture = TestBed.createComponent(FleetMapComponent);
    fixture.detectChanges();
    expect(vi.mocked(L.polyline)).toHaveBeenCalledWith(
      [[32.0, 34.7], [32.1, 34.8]],
      expect.anything(),
    );
  });

  it('does not create a polyline when history has fewer than 2 points', () => {
    truckList.set([mockTruck]);
    historyForMock.mockReturnValue([{ ...baseReading, location: { lat: 32.0, lng: 34.7 } }]);
    const fixture = TestBed.createComponent(FleetMapComponent);
    fixture.detectChanges();
    expect(vi.mocked(L.polyline)).not.toHaveBeenCalled();
  });

  it('popup uses displaySpeed and displayFuel — not raw 999 or 0', () => {
    truckList.set([mockTruck]);
    latestForMock.mockReturnValue({
      ...baseReading,
      speed: 999, displaySpeed: 60, speedSensorError: true,
      fuel: 0,   displayFuel: 75,  fuelGlitch: true,
    });
    const fixture = TestBed.createComponent(FleetMapComponent);
    fixture.detectChanges();
    const popupEl = vi.mocked(L.circleMarker).mock.results[0].value
      .bindPopup.mock.calls[0][0] as HTMLElement;
    expect(popupEl.textContent).toContain('60');
    expect(popupEl.textContent).toContain('75');
    expect(popupEl.textContent).not.toContain('999');
  });

  it('popup shows — when sensor error has no carry-forward', () => {
    truckList.set([mockTruck]);
    latestForMock.mockReturnValue({
      ...baseReading,
      speed: 999, displaySpeed: null, speedSensorError: true,
    });
    const fixture = TestBed.createComponent(FleetMapComponent);
    fixture.detectChanges();
    const popupEl = vi.mocked(L.circleMarker).mock.results[0].value
      .bindPopup.mock.calls[0][0] as HTMLElement;
    expect(popupEl.textContent).toContain('—');
    expect(popupEl.textContent).not.toContain('999');
  });

  it('popup uses truck REST baseline values when no live telemetry exists', () => {
    truckList.set([{ ...mockTruck, speed: 55, fuel: 80 }]);
    latestForMock.mockReturnValue(null);
    const fixture = TestBed.createComponent(FleetMapComponent);
    fixture.detectChanges();
    const popupEl = vi.mocked(L.circleMarker).mock.results[0].value
      .bindPopup.mock.calls[0][0] as HTMLElement;
    expect(popupEl.textContent).toContain('55.0');
    expect(popupEl.textContent).toContain('80');
  });

  it('calls map.remove() on component destroy', () => {
    const fixture = TestBed.createComponent(FleetMapComponent);
    fixture.detectChanges();
    fixture.destroy();
    expect(mapMock.remove).toHaveBeenCalled();
  });
});
