import { Injectable, signal } from '@angular/core';
import type { Route } from '../../shared/models/route.model';

@Injectable({ providedIn: 'root' })
export class RoutesStore {
  readonly #routes = signal<Route[]>([]);
  readonly #loaded = signal(false);
  readonly #versions = new Map<string, number>();

  readonly routeList = this.#routes.asReadonly();
  readonly isLoaded = this.#loaded.asReadonly();

  routeById(id: string): Route | undefined {
    return this.#routes().find(r => r.id === id);
  }

  versionFor(id: string): number | undefined {
    return this.#versions.get(id);
  }

  setRoutes(routes: Route[]): void {
    this.#versions.clear();
    for (const r of routes) {
      this.#versions.set(r.id, r._version);
    }
    this.#routes.set([...routes]);
    this.#loaded.set(true);
  }

  upsertRoute(route: Route): void {
    this.#versions.set(route.id, route._version);
    this.#routes.update(list => {
      const idx = list.findIndex(r => r.id === route.id);
      return idx === -1
        ? [...list, route]
        : list.map((r, i) => (i === idx ? route : r));
    });
  }

  removeRoute(id: string): void {
    this.#versions.delete(id);
    this.#routes.update(list => list.filter(r => r.id !== id));
  }
}
