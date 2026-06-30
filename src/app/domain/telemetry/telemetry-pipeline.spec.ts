import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { TelemetryPipeline } from './telemetry-pipeline';
import { SseClient } from '../../core/realtime/sse-client';
import type { SseClientEvent } from '../../core/realtime/sse-client';
import { FleetService } from '../fleet/fleet.service';
import { FleetStore } from '../fleet/fleet.store';
import { ConnectionStore } from '../fleet/connection.store';
import { TelemetryStore } from './telemetry.store';
import { TelemetryHealthStore } from '../observability/telemetry-health.store';
import { LogService } from '../../core/logging/log.service';
import type { TruckListItem } from '../../shared/models/truck.model';
import type { RawReading } from '../../shared/models/telemetry.model';

const mockTruck: TruckListItem = {
  id: 'truck_1', name: 'Truck 1', status: 'active',
  location: { lat: 51.5, lng: -0.1 }, speed: 60, heading: 90,
  fuel: 75, engineTemp: 85, currentRouteId: null, _version: 1,
};

function makeRawReading(overrides: Partial<RawReading> = {}): RawReading {
  return {
    truckId: 'truck_1',
    location: { lat: 51.5, lng: -0.1 },
    speed: 60,
    heading: 90,
    fuel: 75,
    engineTemp: 85,
    status: 'active',
    timestamp: 1001,
    ...overrides,
  };
}

describe('TelemetryPipeline', () => {
  let events$: Subject<SseClientEvent>;
  let pipeline: TelemetryPipeline;

  let fleetServiceSpy: { load: ReturnType<typeof vi.fn> };
  let fleetStoreSpy: { setFleet: ReturnType<typeof vi.fn>; patchTruck: ReturnType<typeof vi.fn> };
  let telemetryStoreSpy: {
    applyReading: ReturnType<typeof vi.fn>;
    applyTrail: ReturnType<typeof vi.fn>;
    lastAcceptedTsFor: ReturnType<typeof vi.fn>;
    latestFor: ReturnType<typeof vi.fn>;
  };
  let connectionStoreSpy: {
    markConnected: ReturnType<typeof vi.fn>;
    markConnecting: ReturnType<typeof vi.fn>;
    markDisconnected: ReturnType<typeof vi.fn>;
    markHeartbeat: ReturnType<typeof vi.fn>;
  };
  let healthStoreSpy: { incrementDropped: ReturnType<typeof vi.fn> };
  let logSpy: {
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    events$ = new Subject<SseClientEvent>();
    fleetServiceSpy = { load: vi.fn().mockReturnValue(of([mockTruck])) };
    fleetStoreSpy = { setFleet: vi.fn(), patchTruck: vi.fn() };
    healthStoreSpy = { incrementDropped: vi.fn() };
    telemetryStoreSpy = {
      applyReading: vi.fn(),
      applyTrail: vi.fn(),
      lastAcceptedTsFor: vi.fn().mockReturnValue(0),
      latestFor: vi.fn().mockReturnValue(null),
    };
    connectionStoreSpy = {
      markConnected: vi.fn(),
      markConnecting: vi.fn(),
      markDisconnected: vi.fn(),
      markHeartbeat: vi.fn(),
    };
    logSpy = { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        TelemetryPipeline,
        { provide: SseClient, useValue: { events$: events$.asObservable() } },
        { provide: FleetService, useValue: fleetServiceSpy },
        { provide: FleetStore, useValue: fleetStoreSpy },
        { provide: ConnectionStore, useValue: connectionStoreSpy },
        { provide: TelemetryStore, useValue: telemetryStoreSpy },
        { provide: TelemetryHealthStore, useValue: healthStoreSpy },
        { provide: LogService, useValue: logSpy },
      ],
    });

    pipeline = TestBed.inject(TelemetryPipeline);
    pipeline.start();
  });

  // ── idempotency ──────────────────────────────────────────────────────────────

  it('calling start() multiple times does not create duplicate subscriptions', () => {
    pipeline.start(); // second call — must be a no-op
    pipeline.start(); // third call — must be a no-op

    const raw = makeRawReading({ timestamp: 1001 });
    events$.next({ kind: 'message', message: { type: 'telemetry', readings: [raw], timestamp: Date.now() } });

    expect(telemetryStoreSpy.applyReading).toHaveBeenCalledTimes(1);
  });

  // ── lifecycle events ─────────────────────────────────────────────────────────

  it('open event calls markConnecting', () => {
    events$.next({ kind: 'open' });
    expect(connectionStoreSpy.markConnecting).toHaveBeenCalled();
  });

  it('error event calls markDisconnected', () => {
    events$.next({ kind: 'error' });
    expect(connectionStoreSpy.markDisconnected).toHaveBeenCalled();
  });

  // ── connected message ────────────────────────────────────────────────────────

  it('connected message marks connected, loads fleet, and sets fleet in store', () => {
    events$.next({ kind: 'message', message: { type: 'connected', truckCount: 1, timestamp: 1 } });
    expect(connectionStoreSpy.markConnected).toHaveBeenCalled();
    expect(fleetServiceSpy.load).toHaveBeenCalled();
    expect(fleetStoreSpy.setFleet).toHaveBeenCalledWith([mockTruck]);
  });

  it('second connected event triggers another fleet re-baseline', () => {
    events$.next({ kind: 'message', message: { type: 'connected', truckCount: 1, timestamp: 1 } });
    events$.next({ kind: 'message', message: { type: 'connected', truckCount: 1, timestamp: 2 } });
    expect(fleetServiceSpy.load).toHaveBeenCalledTimes(2);
  });

  it('fleet load error is logged and pipeline continues processing', () => {
    fleetServiceSpy.load.mockReturnValue(throwError(() => new Error('network')));
    events$.next({ kind: 'message', message: { type: 'connected', truckCount: 1, timestamp: 1 } });
    expect(logSpy.error).toHaveBeenCalledWith(
      'TelemetryPipeline',
      'Fleet re-baseline failed',
      expect.any(Error),
    );
    events$.next({ kind: 'message', message: { type: 'heartbeat', timestamp: 2 } });
    expect(connectionStoreSpy.markHeartbeat).toHaveBeenCalled();
  });

  // ── heartbeat message ────────────────────────────────────────────────────────

  it('heartbeat message calls markHeartbeat', () => {
    events$.next({ kind: 'message', message: { type: 'heartbeat', timestamp: 999 } });
    expect(connectionStoreSpy.markHeartbeat).toHaveBeenCalled();
  });

  // ── telemetry message ────────────────────────────────────────────────────────

  it('accepted telemetry reading updates TelemetryStore and patches FleetStore', () => {
    const raw = makeRawReading({ timestamp: 1001 });
    events$.next({ kind: 'message', message: { type: 'telemetry', readings: [raw], timestamp: Date.now() } });
    expect(telemetryStoreSpy.applyReading).toHaveBeenCalledWith(
      expect.objectContaining({ timestamp: 1001 }),
    );
    expect(fleetStoreSpy.patchTruck).toHaveBeenCalledWith(
      'truck_1',
      expect.objectContaining({ speed: 60, fuel: 75 }),
    );
  });

  it('stale telemetry reading is dropped — TelemetryStore and FleetStore not updated', () => {
    telemetryStoreSpy.lastAcceptedTsFor.mockReturnValue(2000);
    const raw = makeRawReading({ timestamp: 500 });
    events$.next({ kind: 'message', message: { type: 'telemetry', readings: [raw], timestamp: Date.now() } });
    expect(telemetryStoreSpy.applyReading).not.toHaveBeenCalled();
    expect(fleetStoreSpy.patchTruck).not.toHaveBeenCalled();
  });

  // ── gps_batch message ────────────────────────────────────────────────────────

  it('gps_batch uses per-truck lastAcceptedTs — truck_1 not affected by truck_2 timestamp', () => {
    telemetryStoreSpy.lastAcceptedTsFor.mockImplementation((id: string) =>
      id === 'truck_2' ? 5000 : 1000,
    );
    const readings = [makeRawReading({ truckId: 'truck_1', timestamp: 2000 })];
    events$.next({ kind: 'message', message: { type: 'gps_batch', truckId: 'truck_1', readings } });
    expect(telemetryStoreSpy.applyTrail).toHaveBeenCalledWith(
      'truck_1',
      expect.arrayContaining([expect.objectContaining({ timestamp: 2000 })]),
      expect.objectContaining({ timestamp: 2000 }),
    );
    expect(fleetStoreSpy.patchTruck).toHaveBeenCalledWith(
      'truck_1',
      expect.objectContaining({ speed: 60, fuel: 75 }),
    );
  });

  it('all-stale gps_batch does not call applyTrail or patchTruck', () => {
    telemetryStoreSpy.lastAcceptedTsFor.mockReturnValue(9999);
    const readings = [makeRawReading({ timestamp: 500 })];
    events$.next({ kind: 'message', message: { type: 'gps_batch', truckId: 'truck_1', readings } });
    expect(telemetryStoreSpy.applyTrail).not.toHaveBeenCalled();
    expect(fleetStoreSpy.patchTruck).not.toHaveBeenCalled();
  });

  // ── unknown message ──────────────────────────────────────────────────────────

  // ── TelemetryHealthStore integration ────────────────────────────────────────

  it('stale telemetry reading increments TelemetryHealthStore droppedCount', () => {
    telemetryStoreSpy.lastAcceptedTsFor.mockReturnValue(2000);
    const raw = makeRawReading({ timestamp: 500 });
    events$.next({ kind: 'message', message: { type: 'telemetry', readings: [raw], timestamp: Date.now() } });
    expect(healthStoreSpy.incrementDropped).toHaveBeenCalledTimes(1);
  });

  it('accepted telemetry reading does not increment TelemetryHealthStore droppedCount', () => {
    const raw = makeRawReading({ timestamp: 1001 });
    events$.next({ kind: 'message', message: { type: 'telemetry', readings: [raw], timestamp: Date.now() } });
    expect(healthStoreSpy.incrementDropped).not.toHaveBeenCalled();
  });

  it('all-stale gps_batch increments TelemetryHealthStore by reading count', () => {
    telemetryStoreSpy.lastAcceptedTsFor.mockReturnValue(9999);
    const readings = [makeRawReading({ timestamp: 500 }), makeRawReading({ timestamp: 600 })];
    events$.next({ kind: 'message', message: { type: 'gps_batch', truckId: 'truck_1', readings } });
    expect(healthStoreSpy.incrementDropped).toHaveBeenCalledWith(2);
  });

  it('partially stale gps_batch increments TelemetryHealthStore only for dropped readings', () => {
    telemetryStoreSpy.lastAcceptedTsFor.mockReturnValue(1000);
    const readings = [
      makeRawReading({ timestamp: 500 }),  // stale (500 <= 1000)
      makeRawReading({ timestamp: 2000 }), // fresh
    ];
    events$.next({ kind: 'message', message: { type: 'gps_batch', truckId: 'truck_1', readings } });
    expect(healthStoreSpy.incrementDropped).toHaveBeenCalledWith(1);
  });

  // ── unknown message ──────────────────────────────────────────────────────────

  it('unknown message logs a warning', () => {
    events$.next({ kind: 'message', message: { type: 'unknown', raw: '{"type":"future"}' } });
    expect(logSpy.warn).toHaveBeenCalledWith(
      'TelemetryPipeline',
      expect.stringContaining('Unknown SSE frame'),
    );
  });

  // ── P4: anomaly detection — telemetry ────────────────────────────────────────

  it('speed 999 is annotated with speedSensorError and applyReading receives annotated reading', () => {
    const raw = makeRawReading({ speed: 999, timestamp: 1001 });
    events$.next({ kind: 'message', message: { type: 'telemetry', readings: [raw], timestamp: Date.now() } });
    expect(telemetryStoreSpy.applyReading).toHaveBeenCalledWith(
      expect.objectContaining({ speedSensorError: true, displaySpeed: null }),
    );
  });

  it('speed 999 does not patch FleetStore with raw sensor value', () => {
    const raw = makeRawReading({ speed: 999, timestamp: 1001 });
    events$.next({ kind: 'message', message: { type: 'telemetry', readings: [raw], timestamp: Date.now() } });
    expect(fleetStoreSpy.patchTruck).toHaveBeenCalledTimes(1);
    const patch = fleetStoreSpy.patchTruck.mock.calls[0][1] as Record<string, unknown>;
    expect(patch['speed']).toBeUndefined();
  });

  it('speed 999 carries forward previous displaySpeed to FleetStore patch', () => {
    telemetryStoreSpy.latestFor.mockReturnValue({ displaySpeed: 60, displayFuel: 75 });
    const raw = makeRawReading({ speed: 999, timestamp: 1001 });
    events$.next({ kind: 'message', message: { type: 'telemetry', readings: [raw], timestamp: Date.now() } });
    expect(fleetStoreSpy.patchTruck).toHaveBeenCalledWith(
      'truck_1',
      expect.objectContaining({ speed: 60 }),
    );
  });

  it('fuel 0 is annotated with fuelGlitch and applyReading receives annotated reading', () => {
    const raw = makeRawReading({ fuel: 0, timestamp: 1001 });
    events$.next({ kind: 'message', message: { type: 'telemetry', readings: [raw], timestamp: Date.now() } });
    expect(telemetryStoreSpy.applyReading).toHaveBeenCalledWith(
      expect.objectContaining({ fuelGlitch: true }),
    );
  });

  it('fuel 0 glitch does not patch FleetStore with 0', () => {
    const raw = makeRawReading({ fuel: 0, timestamp: 1001 });
    events$.next({ kind: 'message', message: { type: 'telemetry', readings: [raw], timestamp: Date.now() } });
    const patch = fleetStoreSpy.patchTruck.mock.calls[0][1] as Record<string, unknown>;
    expect(patch['fuel']).toBeUndefined();
  });

  it('fuel 0 carries forward previous displayFuel to FleetStore patch', () => {
    telemetryStoreSpy.latestFor.mockReturnValue({ displaySpeed: 60, displayFuel: 75 });
    const raw = makeRawReading({ fuel: 0, timestamp: 1001 });
    events$.next({ kind: 'message', message: { type: 'telemetry', readings: [raw], timestamp: Date.now() } });
    expect(fleetStoreSpy.patchTruck).toHaveBeenCalledWith(
      'truck_1',
      expect.objectContaining({ fuel: 75 }),
    );
  });

  // ── P4: anomaly detection — gps_batch ───────────────────────────────────────

  it('gps_batch with speed 999 does not patch FleetStore with 999', () => {
    const readings = [makeRawReading({ truckId: 'truck_1', speed: 999, fuel: 75, timestamp: 1001 })];
    events$.next({ kind: 'message', message: { type: 'gps_batch', truckId: 'truck_1', readings } });
    const patch = fleetStoreSpy.patchTruck.mock.calls[0][1] as Record<string, unknown>;
    expect(patch['speed']).toBeUndefined();
    expect(patch['fuel']).toBe(75);
  });

  it('gps_batch annotations carry forward display values within the batch', () => {
    const readings = [
      makeRawReading({ truckId: 'truck_1', speed: 60, fuel: 75, timestamp: 1001 }),
      makeRawReading({ truckId: 'truck_1', speed: 999, fuel: 0, timestamp: 1002 }),
      makeRawReading({ truckId: 'truck_1', speed: 70, fuel: 50, timestamp: 1003 }),
    ];
    events$.next({ kind: 'message', message: { type: 'gps_batch', truckId: 'truck_1', readings } });

    expect(telemetryStoreSpy.applyTrail).toHaveBeenCalledWith(
      'truck_1',
      expect.arrayContaining([
        expect.objectContaining({ timestamp: 1001, speedSensorError: false, displaySpeed: 60, fuelGlitch: false, displayFuel: 75 }),
        expect.objectContaining({ timestamp: 1002, speedSensorError: true, displaySpeed: 60, fuelGlitch: true, displayFuel: 75 }),
        expect.objectContaining({ timestamp: 1003, speedSensorError: false, displaySpeed: 70, fuelGlitch: false, displayFuel: 50 }),
      ]),
      expect.objectContaining({ timestamp: 1003, speedSensorError: false, displaySpeed: 70 }),
    );
  });
});
