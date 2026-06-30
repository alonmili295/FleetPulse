import { TestBed } from '@angular/core/testing';
import { AuditLog } from './audit-log';
import type { AuditEntry } from './audit-log';

function makeEntry(timestamp: number): AuditEntry {
  return { timestamp, action: 'create', routeId: `route_${timestamp}`, detail: 'x' };
}

describe('AuditLog', () => {
  let log: AuditLog;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    log = TestBed.inject(AuditLog);
  });

  it('starts empty', () => {
    expect(log.entries()).toEqual([]);
  });

  it('append() adds entries newest-first', () => {
    log.append(makeEntry(1));
    log.append(makeEntry(2));
    expect(log.entries()[0].timestamp).toBe(2);
    expect(log.entries()[1].timestamp).toBe(1);
  });

  it('keeps at most 50 entries', () => {
    for (let i = 0; i < 55; i++) {
      log.append(makeEntry(i));
    }
    expect(log.entries().length).toBe(50);
  });

  it('oldest entries are dropped when limit is exceeded', () => {
    for (let i = 0; i < 52; i++) {
      log.append(makeEntry(i));
    }
    const timestamps = log.entries().map(e => e.timestamp);
    expect(timestamps).not.toContain(0);
    expect(timestamps).not.toContain(1);
    expect(timestamps).toContain(51);
  });
});
