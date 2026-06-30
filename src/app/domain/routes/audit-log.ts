import { Injectable, signal } from '@angular/core';
import type { ConflictDetail } from '../../shared/models/route.model';

export type AuditAction = 'create' | 'update' | 'reassign' | 'conflict';

export interface AuditEntry {
  readonly timestamp: number;
  readonly action: AuditAction;
  readonly routeId: string;
  readonly detail: string;
  readonly conflict?: ConflictDetail;
}

const MAX_ENTRIES = 50;

@Injectable({ providedIn: 'root' })
export class AuditLog {
  readonly #entries = signal<readonly AuditEntry[]>([]);
  readonly entries = this.#entries.asReadonly();

  append(entry: AuditEntry): void {
    this.#entries.update(list => {
      const next = [entry, ...list];
      return next.length > MAX_ENTRIES ? next.slice(0, MAX_ENTRIES) : next;
    });
  }
}
