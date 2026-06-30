import { TestBed } from '@angular/core/testing';
import { signal, type WritableSignal } from '@angular/core';
import { vi } from 'vitest';
import { ObservabilityPanelComponent } from './observability-panel';
import { ConnectionStore } from '../../domain/fleet/connection.store';
import { PresenceStore } from '../../domain/presence/presence.store';
import { FleetStore } from '../../domain/fleet/fleet.store';
import { TelemetryStore } from '../../domain/telemetry/telemetry.store';
import { AuditLog } from '../../domain/routes/audit-log';
import { TelemetryHealthStore } from '../../domain/observability/telemetry-health.store';
import type { TruckListItem } from '../../shared/models/truck.model';
import type { SseConnectionState } from '../../domain/fleet/connection.store';
import type { WsState } from '../../shared/models/ws.model';
import type { AuditEntry } from '../../domain/routes/audit-log';

const mockTruck: TruckListItem = {
  id: 'truck_1', name: 'Truck 1', status: 'active',
  location: { lat: 51.5, lng: -0.1 }, speed: 60, heading: 90,
  fuel: 75, engineTemp: 85, currentRouteId: null, _version: 1,
};

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return { timestamp: 1_700_000_000_000, action: 'create', routeId: 'r1', detail: 'Route created', ...overrides };
}

describe('ObservabilityPanelComponent', () => {
  let sseSignal:            WritableSignal<SseConnectionState>;
  let isDegradedSignal:     WritableSignal<boolean>;
  let lastHeartbeatAtSignal: WritableSignal<number>;
  let wsStateSignal:        WritableSignal<WsState>;
  let activeCountSignal:    WritableSignal<number>;
  let selfIdSignal:         WritableSignal<string | null>;
  let truckListSignal:      WritableSignal<TruckListItem[]>;
  let auditEntriesSignal:   WritableSignal<readonly AuditEntry[]>;
  let droppedCountSignal:   WritableSignal<number>;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let mockTelemetryStore:   { latestFor: ReturnType<typeof vi.fn> };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  function render(): ReturnType<typeof TestBed.createComponent<ObservabilityPanelComponent>> {
    const fixture = TestBed.createComponent(ObservabilityPanelComponent);
    fixture.detectChanges();
    TestBed.flushEffects();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(async () => {
    sseSignal             = signal<SseConnectionState>('connecting');
    isDegradedSignal      = signal(true);
    lastHeartbeatAtSignal = signal(0);
    wsStateSignal         = signal<WsState>('disconnected');
    activeCountSignal     = signal(0);
    selfIdSignal          = signal<string | null>(null);
    truckListSignal       = signal<TruckListItem[]>([]);
    auditEntriesSignal    = signal<readonly AuditEntry[]>([]);
    droppedCountSignal    = signal(0);
    mockTelemetryStore    = { latestFor: vi.fn().mockReturnValue(null) };

    await TestBed.configureTestingModule({
      imports: [ObservabilityPanelComponent],
      providers: [
        {
          provide: ConnectionStore,
          useValue: {
            sse:              sseSignal.asReadonly(),
            isDegraded:       isDegradedSignal.asReadonly(),
            lastHeartbeatAt:  lastHeartbeatAtSignal.asReadonly(),
          },
        },
        {
          provide: PresenceStore,
          useValue: {
            wsState:     wsStateSignal.asReadonly(),
            activeCount: activeCountSignal.asReadonly(),
            selfId:      selfIdSignal.asReadonly(),
          },
        },
        { provide: FleetStore,          useValue: { truckList: truckListSignal.asReadonly() } },
        { provide: TelemetryStore,      useValue: mockTelemetryStore },
        { provide: AuditLog,            useValue: { entries: auditEntriesSignal.asReadonly() } },
        { provide: TelemetryHealthStore, useValue: { droppedCount: droppedCountSignal.asReadonly() } },
      ],
    }).compileComponents();
  });

  // ── SSE state ─────────────────────────────────────────────────────────────

  it('shows SSE connected badge', () => {
    sseSignal.set('connected');
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('.obs__sse-badge')?.textContent?.trim()).toBe('connected');
    expect(el.querySelector('.obs__sse-badge')?.classList.contains('obs__badge--connected')).toBe(true);
  });

  it('shows SSE disconnected badge', () => {
    sseSignal.set('disconnected');
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('.obs__sse-badge')?.classList.contains('obs__badge--disconnected')).toBe(true);
  });

  // ── Degraded / Live status ─────────────────────────────────────────────────

  it('shows Live status when not degraded', () => {
    isDegradedSignal.set(false);
    expect((render().nativeElement as HTMLElement).querySelector('.obs__status--live')).not.toBeNull();
  });

  it('shows Degraded status when isDegraded is true', () => {
    isDegradedSignal.set(true);
    expect((render().nativeElement as HTMLElement).querySelector('.obs__status--degraded')).not.toBeNull();
  });

  // ── Heartbeat ──────────────────────────────────────────────────────────────

  it('shows — for heartbeat when lastHeartbeatAt is 0', () => {
    lastHeartbeatAtSignal.set(0);
    expect((render().nativeElement as HTMLElement).querySelector('.obs__heartbeat')?.textContent?.trim()).toBe('—');
  });

  it('shows formatted time when lastHeartbeatAt is nonzero', () => {
    lastHeartbeatAtSignal.set(1_700_000_000_000);
    const text = (render().nativeElement as HTMLElement).querySelector('.obs__heartbeat')?.textContent?.trim() ?? '';
    expect(text).not.toBe('—');
    expect(text.length).toBeGreaterThan(0);
  });

  // ── WebSocket state ────────────────────────────────────────────────────────

  it('shows WS connected badge', () => {
    wsStateSignal.set('connected');
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('.obs__ws-badge')?.classList.contains('obs__badge--connected')).toBe(true);
  });

  // ── Dispatcher info ────────────────────────────────────────────────────────

  it('shows active dispatcher count', () => {
    activeCountSignal.set(3);
    expect((render().nativeElement as HTMLElement).querySelector('.obs__dispatcher-count')?.textContent?.trim()).toBe('3');
  });

  it('shows own dispatcher ID when registered', () => {
    selfIdSignal.set('dispatcher_abc');
    expect((render().nativeElement as HTMLElement).querySelector('.obs__self-id')?.textContent?.trim()).toBe('dispatcher_abc');
  });

  it('shows — for own ID when not registered', () => {
    selfIdSignal.set(null);
    expect((render().nativeElement as HTMLElement).querySelector('.obs__self-id')?.textContent?.trim()).toBe('—');
  });

  // ── Anomaly count ──────────────────────────────────────────────────────────

  it('shows 0 anomalies when no trucks have sensor errors', () => {
    truckListSignal.set([mockTruck]);
    mockTelemetryStore.latestFor.mockReturnValue({ speedSensorError: false, fuelGlitch: false });
    expect((render().nativeElement as HTMLElement).querySelector('.obs__anomaly-count')?.textContent?.trim()).toBe('0');
  });

  it('counts truck with speedSensorError as an anomaly', () => {
    truckListSignal.set([mockTruck]);
    mockTelemetryStore.latestFor.mockReturnValue({ speedSensorError: true, fuelGlitch: false });
    expect((render().nativeElement as HTMLElement).querySelector('.obs__anomaly-count')?.textContent?.trim()).toBe('1');
  });

  it('counts truck with fuelGlitch as an anomaly', () => {
    truckListSignal.set([mockTruck]);
    mockTelemetryStore.latestFor.mockReturnValue({ speedSensorError: false, fuelGlitch: true });
    expect((render().nativeElement as HTMLElement).querySelector('.obs__anomaly-count')?.textContent?.trim()).toBe('1');
  });

  // ── Dropped reading count ──────────────────────────────────────────────────

  it('shows dropped reading count from TelemetryHealthStore', () => {
    droppedCountSignal.set(7);
    expect((render().nativeElement as HTMLElement).querySelector('.obs__dropped-count')?.textContent?.trim()).toBe('7');
  });

  // ── Audit log ──────────────────────────────────────────────────────────────

  it('shows empty state when audit log has no entries', () => {
    auditEntriesSignal.set([]);
    expect((render().nativeElement as HTMLElement).querySelector('.obs__audit-empty')).not.toBeNull();
  });

  it('renders audit log entries when present', () => {
    auditEntriesSignal.set([makeEntry({ detail: 'Route A created' })]);
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('.obs__audit-empty')).toBeNull();
    expect(el.querySelector('.obs__audit-list')).not.toBeNull();
    expect(el.textContent).toContain('Route A created');
  });

  it('renders at most 5 audit entries even when more exist', () => {
    auditEntriesSignal.set([
      makeEntry({ timestamp: 6000, detail: 'Op 6' }),
      makeEntry({ timestamp: 5000, detail: 'Op 5' }),
      makeEntry({ timestamp: 4000, detail: 'Op 4' }),
      makeEntry({ timestamp: 3000, detail: 'Op 3' }),
      makeEntry({ timestamp: 2000, detail: 'Op 2' }),
      makeEntry({ timestamp: 1000, detail: 'Op 1' }),
    ]);
    const items = (render().nativeElement as HTMLElement).querySelectorAll('.obs__audit-item');
    expect(items.length).toBe(5);
    expect(items[0].textContent).toContain('Op 6');
  });

  it('shows audit action badge for each entry', () => {
    auditEntriesSignal.set([makeEntry({ action: 'conflict' })]);
    const badge = (render().nativeElement as HTMLElement).querySelector('.obs__audit-action');
    expect(badge?.classList.contains('obs__audit-action--conflict')).toBe(true);
  });
});
