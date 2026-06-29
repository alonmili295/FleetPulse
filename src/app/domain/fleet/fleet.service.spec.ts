import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { FleetService } from './fleet.service';
import { FleetApiService } from '../../core/api/fleet-api.service';
import { LogService } from '../../core/logging/log.service';
import { AppError } from '../../core/errors/app-error';
import type { TruckListItem, TruckDetail } from '../../shared/models/truck.model';

const mockTruck: TruckListItem = {
  id: 'truck_1', name: 'Truck 1', status: 'active',
  location: { lat: 51.5, lng: -0.1 }, speed: 60, heading: 90,
  fuel: 75, engineTemp: 85, currentRouteId: null, _version: 1,
};

const mockDetail: TruckDetail = { ...mockTruck, mileage: 12_345, lastUpdate: 1_700_000_000_000 };

/** Real-server 503 — includes a cause to be clearly distinct from the synthetic circuit-open error. */
const real503 = (retryAfterSeconds = 3) =>
  AppError.serviceUnavailable('Service temporarily unavailable', retryAfterSeconds, new Error('HTTP 503'));

describe('FleetService', () => {
  let service: FleetService;
  let apiSpy: { getFleet: ReturnType<typeof vi.fn>; getTruck: ReturnType<typeof vi.fn> };
  let logSpy: { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    apiSpy = { getFleet: vi.fn(), getTruck: vi.fn() };
    logSpy = { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        FleetService,
        { provide: FleetApiService, useValue: apiSpy },
        { provide: LogService, useValue: logSpy },
      ],
    });
    service = TestBed.inject(FleetService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── TC-503-1 ─────────────────────────────────────────────────────────────────

  it('TC-503-1: load() retries once after a real 503, succeeds on second attempt', () => {
    apiSpy.getFleet
      .mockReturnValueOnce(throwError(() => real503(3)))
      .mockReturnValueOnce(of({ fleet: [mockTruck], timestamp: 0 }));

    let result: TruckListItem[] | undefined;
    service.load().subscribe(r => (result = r));

    vi.advanceTimersByTime(3000);

    expect(result).toEqual([mockTruck]);
    expect(apiSpy.getFleet).toHaveBeenCalledTimes(2);
    expect(logSpy.warn).toHaveBeenCalledWith('FleetService', expect.stringContaining('503 received'));
  });

  // ── TC-503-2 ─────────────────────────────────────────────────────────────────

  it('TC-503-2: non-503 error propagates immediately without retry', () => {
    const httpErr = AppError.http(500, 'Internal server error');
    apiSpy.getFleet.mockReturnValue(throwError(() => httpErr));

    let caughtError: { kind?: string } | undefined;
    service.load().subscribe({ error: e => (caughtError = e) });

    expect(caughtError?.kind).toBe('http');
    expect(apiSpy.getFleet).toHaveBeenCalledTimes(1);
    expect(logSpy.error).toHaveBeenCalledWith('FleetService', 'Fleet load failed', httpErr);
  });

  // ── TC-503-3 ─────────────────────────────────────────────────────────────────

  it('TC-503-3: circuit-open error is rethrown immediately without calling the API again', () => {
    apiSpy.getFleet.mockReturnValue(throwError(() => real503(3)));

    // Two load() calls, each triggering an initial + retry failure,
    // accumulating 3 service_unavailable failures to open the circuit breaker.
    service.load().subscribe({ error: () => {} });
    vi.advanceTimersByTime(3000); // first retry fires → failureCount = 2
    service.load().subscribe({ error: () => {} });
    vi.advanceTimersByTime(3000); // second retry fires → failureCount = 3 → OPEN

    const callCountWhenOpen = apiSpy.getFleet.mock.calls.length;

    let caughtError: { kind?: string; message?: string } | undefined;
    service.load().subscribe({ error: e => (caughtError = e) });

    expect(caughtError?.kind).toBe('service_unavailable');
    expect(caughtError?.message).toBe('Circuit breaker is OPEN');
    expect(apiSpy.getFleet).toHaveBeenCalledTimes(callCountWhenOpen); // no new API calls
    expect(logSpy.warn).toHaveBeenCalledWith(
      'FleetService',
      'Fleet load skipped — circuit breaker is OPEN',
    );
  });

  // ── getTruck ─────────────────────────────────────────────────────────────────

  it('getTruck() delegates directly to the API without a circuit breaker', () => {
    apiSpy.getTruck.mockReturnValue(of(mockDetail));

    let result: TruckDetail | undefined;
    service.getTruck('truck_1').subscribe(r => (result = r));

    expect(result).toEqual(mockDetail);
    expect(apiSpy.getTruck).toHaveBeenCalledWith('truck_1');
  });

  it('getTruck() logs and rethrows API errors', () => {
    const err = AppError.http(404, 'Not found');
    apiSpy.getTruck.mockReturnValue(throwError(() => err));

    let caughtError: { kind?: string } | undefined;
    service.getTruck('truck_1').subscribe({ error: e => (caughtError = e) });

    expect(caughtError?.kind).toBe('http');
    expect(logSpy.error).toHaveBeenCalledWith('FleetService', 'Truck truck_1 load failed', err);
  });
});
