import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Subject, of, throwError } from 'rxjs';
import { VehicleDetailService } from './vehicle-detail.service';
import { FleetApiService } from '../../core/api/fleet-api.service';
import { VehicleAlertApiService } from '../../core/api/vehicle-alert-api.service';
import { AlertsStore } from '../alerts/alerts.store';
import { AppError } from '../../core/errors/app-error';
import type { TruckDetail } from '../../shared/models/truck.model';
import type { Alert } from '../../shared/models/alert.model';

const mockDetail: TruckDetail = {
  id: 'truck_1', name: 'Truck 1', status: 'active',
  location: { lat: 51.5, lng: -0.1 }, speed: 60, heading: 90,
  fuel: 75, engineTemp: 85, currentRouteId: null, _version: 1,
  mileage: 12345, lastUpdate: 1000,
};

const mockAlert: Alert = {
  id: 'alert_1', truckId: 'truck_1', message: 'Check engine', severity: 'warning',
  sentBy: 'dispatcher_web', timestamp: 2000, acknowledged: false,
};

describe('VehicleDetailService', () => {
  let service: VehicleDetailService;
  let mockFleetApi: { getTruck: ReturnType<typeof vi.fn> };
  let mockAlertApi: { sendAlert: ReturnType<typeof vi.fn> };
  let mockAlertsStore: { addAlert: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFleetApi = { getTruck: vi.fn().mockReturnValue(of(mockDetail)) };
    mockAlertApi = { sendAlert: vi.fn().mockReturnValue(of(mockAlert)) };
    mockAlertsStore = { addAlert: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        VehicleDetailService,
        { provide: FleetApiService, useValue: mockFleetApi },
        { provide: VehicleAlertApiService, useValue: mockAlertApi },
        { provide: AlertsStore, useValue: mockAlertsStore },
      ],
    });
    service = TestBed.inject(VehicleDetailService);
  });

  it('loadDetail calls FleetApiService.getTruck with the correct truckId', () => {
    service.loadDetail('truck_1');
    expect(mockFleetApi.getTruck).toHaveBeenCalledWith('truck_1');
  });

  it('mileageFor returns null before any load', () => {
    expect(service.mileageFor('truck_1')).toBeNull();
  });

  it('mileageFor returns cached value after successful load', () => {
    service.loadDetail('truck_1');
    expect(service.mileageFor('truck_1')).toBe(12345);
  });

  it('loadingTruckId is set to truckId during load and null after completion', () => {
    const subject = new Subject<TruckDetail>();
    mockFleetApi.getTruck.mockReturnValue(subject.asObservable());

    service.loadDetail('truck_1');
    expect(service.loadingTruckId()).toBe('truck_1');

    subject.next(mockDetail);
    subject.complete();

    expect(service.loadingTruckId()).toBeNull();
  });

  it('detailError is set on HTTP failure and loadingTruckId is null after failure', () => {
    const error = AppError.http(500, 'Server error');
    mockFleetApi.getTruck.mockReturnValue(throwError(() => error));
    service.loadDetail('truck_1');
    expect(service.detailError()).toEqual(error);
    expect(service.loadingTruckId()).toBeNull();
  });

  it('a second loadDetail call cancels the first subscription so stale responses are discarded', () => {
    const firstSubject = new Subject<TruckDetail>();
    const secondDetail: TruckDetail = { ...mockDetail, id: 'truck_2', name: 'Truck 2', mileage: 99999 };
    const secondSubject = new Subject<TruckDetail>();

    mockFleetApi.getTruck
      .mockReturnValueOnce(firstSubject.asObservable())
      .mockReturnValueOnce(secondSubject.asObservable());

    service.loadDetail('truck_1');
    service.loadDetail('truck_2');

    // First request completes after the second started — must be ignored
    firstSubject.next(mockDetail);
    firstSubject.complete();
    expect(service.mileageFor('truck_1')).toBeNull();

    secondSubject.next(secondDetail);
    secondSubject.complete();
    expect(service.mileageFor('truck_2')).toBe(99999);
  });

  it('ngOnDestroy unsubscribes the active detail request', () => {
    const subject = new Subject<TruckDetail>();
    mockFleetApi.getTruck.mockReturnValue(subject.asObservable());

    service.loadDetail('truck_1');
    service.ngOnDestroy();

    subject.next(mockDetail);
    subject.complete();

    expect(service.mileageFor('truck_1')).toBeNull();
  });

  it('sendAlert calls VehicleAlertApiService.sendAlert with correct args', () => {
    service.sendAlert('truck_1', { message: 'Check engine', severity: 'warning' }).subscribe();
    expect(mockAlertApi.sendAlert).toHaveBeenCalledWith(
      'truck_1',
      { message: 'Check engine', severity: 'warning' },
      'dispatcher_web',
    );
  });

  it('sendAlert adds alert to AlertsStore and returns success result', () => {
    let result: unknown;
    service.sendAlert('truck_1', { message: 'Check engine' }).subscribe(r => { result = r; });
    expect(mockAlertsStore.addAlert).toHaveBeenCalledWith(mockAlert);
    expect((result as { kind: string }).kind).toBe('success');
  });

  it('sendAlert returns error result and does not call AlertsStore on failure', () => {
    const error = AppError.http(400, 'Bad request');
    mockAlertApi.sendAlert.mockReturnValue(throwError(() => error));
    let result: unknown;
    service.sendAlert('truck_1', {}).subscribe(r => { result = r; });
    expect(mockAlertsStore.addAlert).not.toHaveBeenCalled();
    expect((result as { kind: string }).kind).toBe('error');
  });
});
