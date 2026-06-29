import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { LogService } from './log.service';
import { provideAppConfig } from '../config/app-config.provider';
import { APP_CONFIG } from '../config/app-config';

// ── Development mode (production = false) ────────────────────────────────────

describe('LogService', () => {
  let service: LogService;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    TestBed.configureTestingModule({
      providers: [provideAppConfig()],
    });
    service = TestBed.inject(LogService);
  });

  afterEach(() => vi.restoreAllMocks());

  // ── Structured entries ──────────────────────────────────────────────────────

  it('writes a structured entry with level, scope, message, and timestamp', () => {
    const before = Date.now();
    service.info('TestScope', 'hello world');
    const after = Date.now();

    const entries = service.entries();
    expect(entries.length).toBe(1);
    const e = entries[0];
    expect(e.level).toBe('info');
    expect(e.scope).toBe('TestScope');
    expect(e.message).toBe('hello world');
    expect(e.ts).toBeGreaterThanOrEqual(before);
    expect(e.ts).toBeLessThanOrEqual(after);
  });

  it('attaches optional data when provided', () => {
    service.warn('scope', 'with data', { code: 42 });
    expect(service.entries()[0].data).toEqual({ code: 42 });
  });

  it('omits the data field entirely when no data is passed', () => {
    service.info('scope', 'no data');
    expect(Object.prototype.hasOwnProperty.call(service.entries()[0], 'data')).toBe(false);
  });

  // ── All four log levels ─────────────────────────────────────────────────────

  it('writes debug entries (production = false)', () => {
    service.debug('scope', 'debug msg');
    const e = service.entries().find(x => x.level === 'debug');
    expect(e).toBeDefined();
    expect(e?.message).toBe('debug msg');
  });

  it('writes info entries', () => {
    service.info('scope', 'info msg');
    expect(service.entries().find(x => x.level === 'info')?.message).toBe('info msg');
  });

  it('writes warn entries', () => {
    service.warn('scope', 'warn msg');
    expect(service.entries().find(x => x.level === 'warn')?.message).toBe('warn msg');
  });

  it('writes error entries', () => {
    service.error('scope', 'error msg');
    expect(service.entries().find(x => x.level === 'error')?.message).toBe('error msg');
  });

  it('does not throw when called with only scope and message (no data)', () => {
    expect(() => service.debug('s', 'm')).not.toThrow();
    expect(() => service.info('s', 'm')).not.toThrow();
    expect(() => service.warn('s', 'm')).not.toThrow();
    expect(() => service.error('s', 'm')).not.toThrow();
  });

  // ── Bounded capacity ────────────────────────────────────────────────────────

  it('keeps only the most recent 500 entries when the buffer overflows', () => {
    for (let i = 0; i < 510; i++) {
      service.info('scope', `msg-${i}`);
    }
    const entries = service.entries();
    expect(entries.length).toBe(500);
    // The 10 oldest (msg-0 … msg-9) must have been evicted.
    expect(entries[0].message).toBe('msg-10');
    expect(entries[entries.length - 1].message).toBe('msg-509');
  });

  it('entries() returns results oldest-first', () => {
    service.info('s', 'first');
    service.info('s', 'second');
    service.info('s', 'third');
    const msgs = service.entries().map(e => e.message);
    expect(msgs).toEqual(['first', 'second', 'third']);
  });
});

// ── Production mode (production = true) ──────────────────────────────────────
// A separate describe block is required because each describe configures its own
// TestBed module; nesting two configureTestingModule calls in one describe causes
// an Angular "already configured" error.

describe('LogService — production flag', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    TestBed.configureTestingModule({
      providers: [
        {
          provide: APP_CONFIG,
          useValue: { production: true, apiBaseUrl: '', sseUrl: '', wsUrl: '' },
        },
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('suppresses debug() entirely when production is true', () => {
    const service = TestBed.inject(LogService);
    service.debug('scope', 'should not appear');
    expect(service.entries()).toHaveLength(0);
  });

  it('still writes info, warn, and error entries in production', () => {
    const service = TestBed.inject(LogService);
    service.info('s', 'info in prod');
    service.warn('s', 'warn in prod');
    service.error('s', 'error in prod');
    expect(service.entries()).toHaveLength(3);
    expect(service.entries().map(e => e.level)).toEqual(['info', 'warn', 'error']);
  });
});
