import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FleetApiService } from './fleet-api.service';
import { APP_CONFIG } from '../config/app-config';
import type { TruckListItem, TruckDetail } from '../../shared/models/truck.model';

const BASE = 'http://localhost:3000/api';

const CONFIG = { production: false, apiBaseUrl: BASE, sseUrl: '', wsUrl: '' };

const mockTruck: TruckListItem = {
  id: 'truck_1', name: 'Truck 1', status: 'active',
  location: { lat: 51.5, lng: -0.1 }, speed: 60, heading: 90,
  fuel: 75, engineTemp: 85, currentRouteId: null, _version: 1,
};

const mockDetail: TruckDetail = { ...mockTruck, mileage: 12_345, lastUpdate: 1_700_000_000_000 };

describe('FleetApiService', () => {
  let service: FleetApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: CONFIG },
      ],
    });
    service = TestBed.inject(FleetApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ── TC-FLEET-API-1 ──────────────────────────────────────────────────────────

  it('TC-FLEET-API-1: getFleet() emits FleetResponse on 200', () => {
    const payload = { fleet: [mockTruck], timestamp: 1_700_000_000_000 };
    let result: typeof payload | undefined;

    service.getFleet().subscribe(r => (result = r));
    http.expectOne(`${BASE}/fleet`).flush(payload);

    expect(result?.fleet).toEqual([mockTruck]);
    expect(result?.timestamp).toBe(1_700_000_000_000);
  });

  // ── TC-FLEET-API-2 ──────────────────────────────────────────────────────────

  it('TC-FLEET-API-2: getFleet() maps 503 + Retry-After:3 to ServiceUnavailableAppError', () => {
    let err: { kind?: string; retryAfterSeconds?: number } | undefined;

    service.getFleet().subscribe({ error: e => (err = e) });
    http.expectOne(`${BASE}/fleet`).flush('unavailable', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Retry-After': '3' },
    });

    expect(err?.kind).toBe('service_unavailable');
    expect(err?.retryAfterSeconds).toBe(3);
  });

  it('TC-FLEET-API-2b: getFleet() treats non-integer Retry-After as missing', () => {
    let err: { retryAfterSeconds?: number } | undefined;

    service.getFleet().subscribe({ error: e => (err = e) });
    http.expectOne(`${BASE}/fleet`).flush('unavailable', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Retry-After': '3.5' },
    });

    expect(err?.retryAfterSeconds).toBeUndefined();
  });

  it('TC-FLEET-API-2c: getFleet() handles 503 with no Retry-After header', () => {
    let err: { kind?: string; retryAfterSeconds?: number } | undefined;

    service.getFleet().subscribe({ error: e => (err = e) });
    http.expectOne(`${BASE}/fleet`).flush('unavailable', {
      status: 503,
      statusText: 'Service Unavailable',
    });

    expect(err?.kind).toBe('service_unavailable');
    expect(err?.retryAfterSeconds).toBeUndefined();
  });

  it('TC-FLEET-API-2d: non-503 HTTP errors map to HttpAppError', () => {
    let err: { kind?: string; statusCode?: number } | undefined;

    service.getFleet().subscribe({ error: e => (err = e) });
    http.expectOne(`${BASE}/fleet`).flush('not found', { status: 404, statusText: 'Not Found' });

    expect(err?.kind).toBe('http');
    expect(err?.statusCode).toBe(404);
  });

  // ── TC-FLEET-API-3 ──────────────────────────────────────────────────────────

  it('TC-FLEET-API-3: getTruck() emits TruckDetail on 200', () => {
    let result: TruckDetail | undefined;

    service.getTruck('truck_1').subscribe(r => (result = r));
    http.expectOne(`${BASE}/fleet/truck_1`).flush(mockDetail);

    expect(result?.mileage).toBe(12_345);
    expect(result?.id).toBe('truck_1');
  });

  it('TC-FLEET-API-3b: getTruck() maps 503 to ServiceUnavailableAppError', () => {
    let err: { kind?: string } | undefined;

    service.getTruck('truck_1').subscribe({ error: e => (err = e) });
    http.expectOne(`${BASE}/fleet/truck_1`).flush('', {
      status: 503,
      statusText: 'Service Unavailable',
    });

    expect(err?.kind).toBe('service_unavailable');
  });
});
