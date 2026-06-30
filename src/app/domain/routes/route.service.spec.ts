import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { RouteService } from './route.service';
import { RoutesApiService } from '../../core/api/routes-api.service';
import { RoutesStore } from './routes.store';
import { AuditLog } from './audit-log';
import { AppError } from '../../core/errors/app-error';
import type { Route } from '../../shared/models/route.model';

function makeRoute(id: string, version: number): Route {
  return {
    id, truckId: 'truck_1', destination: 'Test', priority: 'normal', notes: '',
    status: 'assigned', assignedBy: 'dispatcher_web', assignedAt: 1000, _version: version,
  };
}

describe('RouteService', () => {
  let service: RouteService;
  let apiSpy: {
    getRoutes: ReturnType<typeof vi.fn>;
    createRoute: ReturnType<typeof vi.fn>;
    updateRoute: ReturnType<typeof vi.fn>;
    reassignRoute: ReturnType<typeof vi.fn>;
  };
  let storeSpy: {
    setRoutes: ReturnType<typeof vi.fn>;
    upsertRoute: ReturnType<typeof vi.fn>;
    versionFor: ReturnType<typeof vi.fn>;
  };
  let auditSpy: { append: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    apiSpy = {
      getRoutes: vi.fn().mockReturnValue(of({ routes: [makeRoute('route_1', 3)], timestamp: Date.now() })),
      createRoute: vi.fn().mockReturnValue(of(makeRoute('route_1', 1))),
      updateRoute: vi.fn().mockReturnValue(of(makeRoute('route_1', 4))),
      reassignRoute: vi.fn().mockReturnValue(of(makeRoute('route_1', 2))),
    };
    storeSpy = {
      setRoutes: vi.fn(),
      upsertRoute: vi.fn(),
      versionFor: vi.fn().mockReturnValue(3),
    };
    auditSpy = { append: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        RouteService,
        { provide: RoutesApiService, useValue: apiSpy },
        { provide: RoutesStore, useValue: storeSpy },
        { provide: AuditLog, useValue: auditSpy },
      ],
    });
    service = TestBed.inject(RouteService);
  });

  // loadRoutes
  it('loadRoutes() calls getRoutes and commits to store', () => {
    service.loadRoutes().subscribe();
    expect(apiSpy.getRoutes).toHaveBeenCalled();
    expect(storeSpy.setRoutes).toHaveBeenCalledWith([makeRoute('route_1', 3)]);
  });

  // createRoute
  it('createRoute() returns success, upserts store, and appends audit entry', () => {
    let result: unknown;
    service.createRoute({ truckId: 'truck_1', destination: 'Test' }).subscribe(r => (result = r));
    expect((result as { kind: string }).kind).toBe('success');
    expect(storeSpy.upsertRoute).toHaveBeenCalled();
    expect(auditSpy.append).toHaveBeenCalledWith(expect.objectContaining({ action: 'create' }));
  });

  it('createRoute() 409 truck-already-assigned returns error result (not conflict)', () => {
    apiSpy.createRoute.mockReturnValue(
      throwError(() => AppError.http(409, 'Truck already assigned', { currentRouteId: 'route_1' })),
    );
    let result: unknown;
    service.createRoute({ truckId: 'truck_1', destination: 'Test' }).subscribe(r => (result = r));
    const r = result as { kind: string; error: { kind: string } };
    expect(r.kind).toBe('error');
    expect(r.error.kind).toBe('http');
  });

  // updateRoute
  it('updateRoute() reads version from store and passes it as a bare integer string', () => {
    storeSpy.versionFor.mockReturnValue(3);
    service.updateRoute('route_1', { status: 'in-progress' }).subscribe();
    expect(apiSpy.updateRoute).toHaveBeenCalledWith('dispatcher_web', 'route_1', { status: 'in-progress' }, '3');
  });

  it('updateRoute() with no cached version returns error without calling the API', () => {
    storeSpy.versionFor.mockReturnValue(undefined);
    let result: unknown;
    service.updateRoute('route_1', { status: 'in-progress' }).subscribe(r => (result = r));
    expect(apiSpy.updateRoute).not.toHaveBeenCalled();
    expect((result as { kind: string }).kind).toBe('error');
  });

  it('updateRoute() success returns success result, upserts store, and appends audit entry', () => {
    let result: unknown;
    service.updateRoute('route_1', { status: 'in-progress' }).subscribe(r => (result = r));
    expect((result as { kind: string }).kind).toBe('success');
    expect(storeSpy.upsertRoute).toHaveBeenCalled();
    expect(auditSpy.append).toHaveBeenCalledWith(expect.objectContaining({ action: 'update' }));
  });

  it('updateRoute() 409 full shape returns conflict result with normalized ConflictDetail', () => {
    apiSpy.updateRoute.mockReturnValue(
      throwError(() => AppError.conflict(5, 'conflict', 2, 'dispatcher_2')),
    );
    let result: unknown;
    service.updateRoute('route_1', {}).subscribe(r => (result = r));
    const r = result as { kind: string; conflict: { currentVersion: number; yourVersion: number; lastModifiedBy: string } };
    expect(r.kind).toBe('conflict');
    expect(r.conflict.currentVersion).toBe(5);
    expect(r.conflict.yourVersion).toBe(2);
    expect(r.conflict.lastModifiedBy).toBe('dispatcher_2');
    expect(auditSpy.append).toHaveBeenCalledWith(expect.objectContaining({ action: 'conflict' }));
  });

  it('updateRoute() 409 lean shape normalizes lastModifiedBy to unknown and falls back to cached yourVersion', () => {
    storeSpy.versionFor.mockReturnValue(2);
    apiSpy.updateRoute.mockReturnValue(
      throwError(() => AppError.conflict(5, 'conflict')),
    );
    let result: unknown;
    service.updateRoute('route_1', {}).subscribe(r => (result = r));
    const r = result as { kind: string; conflict: { yourVersion: number; lastModifiedBy: string } };
    expect(r.kind).toBe('conflict');
    expect(r.conflict.yourVersion).toBe(2);
    expect(r.conflict.lastModifiedBy).toBe('unknown');
  });

  // reassignRoute
  it('reassignRoute() returns success, upserts store, and appends audit entry', () => {
    let result: unknown;
    service.reassignRoute('route_1', { newTruckId: 'truck_2' }).subscribe(r => (result = r));
    expect((result as { kind: string }).kind).toBe('success');
    expect(storeSpy.upsertRoute).toHaveBeenCalled();
    expect(auditSpy.append).toHaveBeenCalledWith(expect.objectContaining({ action: 'reassign' }));
  });

  it('reassignRoute() 400 maintenance truck returns error result', () => {
    apiSpy.reassignRoute.mockReturnValue(
      throwError(() => AppError.http(400, 'Cannot assign to truck in maintenance')),
    );
    let result: unknown;
    service.reassignRoute('route_1', { newTruckId: 'truck_7' }).subscribe(r => (result = r));
    const r = result as { kind: string; error: { statusCode: number } };
    expect(r.kind).toBe('error');
    expect(r.error.statusCode).toBe(400);
  });
});
