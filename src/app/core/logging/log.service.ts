// core/logging — structured ring-buffer logger; used throughout P2–P9 (pipeline drops, transport reconnects, conflict handling). No external library, no PII beyond dispatcher names already in the protocol.

import { Injectable, inject } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';
import { RingBuffer } from '../../shared/utils/ring-buffer';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly ts: number;
  readonly level: LogLevel;
  readonly scope: string;
  readonly message: string;
  readonly data?: unknown;
}

const BUFFER_CAPACITY = 500;

@Injectable({ providedIn: 'root' })
export class LogService {
  // Inject APP_CONFIG per NFR-8 — services must not import environment files directly.
  private readonly config = inject(APP_CONFIG);
  private readonly ring = new RingBuffer<LogEntry>(BUFFER_CAPACITY);

  /** Suppressed entirely in production to avoid storing debug noise in the ring. */
  debug(scope: string, message: string, data?: unknown): void {
    if (this.config.production) return;
    this.write('debug', scope, message, data);
  }

  info(scope: string, message: string, data?: unknown): void {
    this.write('info', scope, message, data);
  }

  warn(scope: string, message: string, data?: unknown): void {
    this.write('warn', scope, message, data);
  }

  error(scope: string, message: string, data?: unknown): void {
    this.write('error', scope, message, data);
  }

  /** Snapshot of buffered entries, oldest first. Maximum BUFFER_CAPACITY entries. */
  entries(): ReadonlyArray<LogEntry> {
    return this.ring.toArray();
  }

  private write(level: LogLevel, scope: string, message: string, data?: unknown): void {
    const entry: LogEntry = {
      ts: Date.now(),
      level,
      scope,
      message,
      ...(data !== undefined && { data }),
    };
    this.ring.push(entry);
    // Console sink is dev-only (ARCHITECTURE §29); never writes to an external sink.
    if (!this.config.production) {
      const fn = level === 'error' ? console.error
               : level === 'warn'  ? console.warn
               : console.log;
      fn(`[${level.toUpperCase()}] ${scope}: ${message}`, ...(data !== undefined ? [data] : []));
    }
  }
}
