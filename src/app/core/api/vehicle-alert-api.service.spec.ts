import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { VehicleAlertApiService } from './vehicle-alert-api.service';
import { APP_CONFIG } from '../config/app-config';
import type { Alert } from '../../shared/models/alert.model';

const mockAlert: Alert = {
  id: 'alert_1', truckId: 'truck_1', message: 'Check engine', severity: 'warning',
  sentBy: 'dispatcher_web', timestamp: 1000, acknowledged: false,
};

describe('VehicleAlertApiService', () => {
  let service: VehicleAlertApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        VehicleAlertApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: APP_CONFIG,
          useValue: { apiBaseUrl: '/api', sseUrl: '/api/telemetry', wsUrl: 'ws://localhost', production: false },
        },
      ],
    });
    service = TestBed.inject(VehicleAlertApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('makes POST to the correct URL', () => {
    service.sendAlert('truck_1', { message: 'Check engine', severity: 'warning' }, 'dispatcher_web').subscribe();
    const req = http.expectOne('/api/fleet/truck_1/alert');
    expect(req.request.method).toBe('POST');
    req.flush(mockAlert);
  });

  it('includes X-Dispatcher-Id header', () => {
    service.sendAlert('truck_1', {}, 'dispatcher_web').subscribe();
    const req = http.expectOne('/api/fleet/truck_1/alert');
    expect(req.request.headers.get('X-Dispatcher-Id')).toBe('dispatcher_web');
    req.flush(mockAlert);
  });

  it('returns typed Alert on success', () => {
    let result: Alert | undefined;
    service.sendAlert('truck_1', { message: 'Check engine' }, 'dispatcher_web').subscribe(a => { result = a; });
    http.expectOne('/api/fleet/truck_1/alert').flush(mockAlert, { status: 201, statusText: 'Created' });
    expect(result).toEqual(mockAlert);
  });

  it('maps HTTP error to AppError', () => {
    let caught: unknown;
    service.sendAlert('truck_1', {}, 'dispatcher_web').subscribe({ error: e => { caught = e; } });
    http.expectOne('/api/fleet/truck_1/alert').flush('Not found', { status: 404, statusText: 'Not Found' });
    expect((caught as { kind: string }).kind).toBe('http');
    expect((caught as { statusCode: number }).statusCode).toBe(404);
  });
});
