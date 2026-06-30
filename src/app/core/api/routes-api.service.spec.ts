import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RoutesApiService } from './routes-api.service';
import { APP_CONFIG } from '../config/app-config';
import type { AppConfig } from '../config/app-config';

const mockConfig: AppConfig = {
  production: false,
  apiBaseUrl: 'http://localhost:3000/api',
  sseUrl: 'http://localhost:3000/api/telemetry/stream',
  wsUrl: 'ws://localhost:3000/ws',
};

describe('RoutesApiService', () => {
  let service: RoutesApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: mockConfig },
      ],
    });
    service = TestBed.inject(RoutesApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getRoutes() sends GET /api/routes', () => {
    service.getRoutes().subscribe();
    const req = http.expectOne('http://localhost:3000/api/routes');
    expect(req.request.method).toBe('GET');
    req.flush({ routes: [], timestamp: Date.now() });
  });

  it('createRoute() sends POST /api/routes with X-Dispatcher-Id header and body', () => {
    const body = { truckId: 'truck_1', destination: 'Tel Aviv' };
    service.createRoute('dispatcher_1', body).subscribe();
    const req = http.expectOne('http://localhost:3000/api/routes');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-Dispatcher-Id')).toBe('dispatcher_1');
    expect(req.request.body).toEqual(body);
    req.flush({ id: 'route_1', truckId: 'truck_1', destination: 'Tel Aviv', status: 'assigned', _version: 1 });
  });

  it('updateRoute() sends PATCH with If-Match as bare integer string and X-Dispatcher-Id', () => {
    service.updateRoute('dispatcher_1', 'route_1', { status: 'in-progress' }, '3').subscribe();
    const req = http.expectOne('http://localhost:3000/api/routes/route_1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.headers.get('If-Match')).toBe('3');
    expect(req.request.headers.get('X-Dispatcher-Id')).toBe('dispatcher_1');
    req.flush({ id: 'route_1', status: 'in-progress', _version: 4 });
  });

  it('updateRoute() 409 full shape maps to ConflictAppError with all fields', () => {
    let caught: unknown;
    service.updateRoute('dispatcher_1', 'route_1', {}, '2').subscribe({ error: e => (caught = e) });
    http.expectOne('http://localhost:3000/api/routes/route_1').flush(
      { error: 'Route was modified by another dispatcher', currentVersion: 5, yourVersion: 2, lastModifiedBy: 'dispatcher_2' },
      { status: 409, statusText: 'Conflict' },
    );
    const err = caught as Record<string, unknown>;
    expect(err['kind']).toBe('conflict');
    expect(err['currentVersion']).toBe(5);
    expect(err['yourVersion']).toBe(2);
    expect(err['lastModifiedBy']).toBe('dispatcher_2');
    expect(err['message']).toBe('Route was modified by another dispatcher');
  });

  it('updateRoute() 409 lean shape maps to ConflictAppError without yourVersion/lastModifiedBy', () => {
    let caught: unknown;
    service.updateRoute('dispatcher_1', 'route_1', {}, '2').subscribe({ error: e => (caught = e) });
    http.expectOne('http://localhost:3000/api/routes/route_1').flush(
      { error: 'Route was modified during processing', currentVersion: 5 },
      { status: 409, statusText: 'Conflict' },
    );
    const err = caught as Record<string, unknown>;
    expect(err['kind']).toBe('conflict');
    expect(err['currentVersion']).toBe(5);
    expect(err['yourVersion']).toBeUndefined();
    expect(err['lastModifiedBy']).toBeUndefined();
  });

  it('createRoute() 409 truck-already-assigned maps to HttpAppError (no currentVersion)', () => {
    let caught: unknown;
    service.createRoute('dispatcher_1', { truckId: 'truck_1', destination: 'X' }).subscribe({ error: e => (caught = e) });
    http.expectOne('http://localhost:3000/api/routes').flush(
      { error: 'Truck already assigned', currentRouteId: 'route_1', assignedBy: 'dispatcher_2' },
      { status: 409, statusText: 'Conflict' },
    );
    const err = caught as Record<string, unknown>;
    expect(err['kind']).toBe('http');
    expect(err['statusCode']).toBe(409);
  });

  it('reassignRoute() sends PUT /api/routes/:id/reassign with X-Dispatcher-Id and no If-Match', () => {
    service.reassignRoute('dispatcher_1', 'route_1', { newTruckId: 'truck_2' }).subscribe();
    const req = http.expectOne('http://localhost:3000/api/routes/route_1/reassign');
    expect(req.request.method).toBe('PUT');
    expect(req.request.headers.get('X-Dispatcher-Id')).toBe('dispatcher_1');
    expect(req.request.headers.has('If-Match')).toBe(false);
    expect(req.request.body).toEqual({ newTruckId: 'truck_2' });
    req.flush({ id: 'route_1', truckId: 'truck_2', _version: 2 });
  });
});
