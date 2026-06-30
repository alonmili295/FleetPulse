import { TestBed } from '@angular/core/testing';
import { RoutesStore } from './routes.store';
import type { Route } from '../../shared/models/route.model';

function makeRoute(id: string, version: number, truckId = 'truck_1'): Route {
  return {
    id, truckId, destination: 'Test', priority: 'normal', notes: '',
    status: 'assigned', assignedBy: 'dispatcher_web', assignedAt: 1000, _version: version,
  };
}

describe('RoutesStore', () => {
  let store: RoutesStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(RoutesStore);
  });

  it('isLoaded() is false initially', () => {
    expect(store.isLoaded()).toBe(false);
  });

  it('routeList() is empty initially', () => {
    expect(store.routeList()).toEqual([]);
  });

  it('versionFor() returns undefined for unknown id', () => {
    expect(store.versionFor('unknown')).toBeUndefined();
  });

  it('setRoutes() populates routeList and sets isLoaded to true', () => {
    store.setRoutes([makeRoute('route_1', 1)]);
    expect(store.routeList().length).toBe(1);
    expect(store.isLoaded()).toBe(true);
  });

  it('setRoutes() seeds versionFor() from route._version', () => {
    store.setRoutes([makeRoute('route_1', 3), makeRoute('route_2', 7)]);
    expect(store.versionFor('route_1')).toBe(3);
    expect(store.versionFor('route_2')).toBe(7);
  });

  it('setRoutes() replaces the entire version cache on a second call', () => {
    store.setRoutes([makeRoute('route_1', 3)]);
    store.setRoutes([makeRoute('route_2', 5)]);
    expect(store.versionFor('route_1')).toBeUndefined();
    expect(store.versionFor('route_2')).toBe(5);
  });

  it('routeById() returns the correct route', () => {
    store.setRoutes([makeRoute('route_1', 1), makeRoute('route_2', 2)]);
    expect(store.routeById('route_2')?.id).toBe('route_2');
  });

  it('routeById() returns undefined for unknown id', () => {
    expect(store.routeById('nope')).toBeUndefined();
  });

  it('upsertRoute() updates an existing route in the list', () => {
    store.setRoutes([makeRoute('route_1', 1)]);
    store.upsertRoute(makeRoute('route_1', 2));
    expect(store.routeList().length).toBe(1);
    expect(store.routeList()[0]._version).toBe(2);
  });

  it('upsertRoute() inserts a new route', () => {
    store.setRoutes([makeRoute('route_1', 1)]);
    store.upsertRoute(makeRoute('route_2', 1));
    expect(store.routeList().length).toBe(2);
  });

  it('upsertRoute() updates versionFor()', () => {
    store.setRoutes([makeRoute('route_1', 1)]);
    store.upsertRoute(makeRoute('route_1', 4));
    expect(store.versionFor('route_1')).toBe(4);
  });

  it('removeRoute() removes the route from the list', () => {
    store.setRoutes([makeRoute('route_1', 1), makeRoute('route_2', 2)]);
    store.removeRoute('route_1');
    expect(store.routeList().length).toBe(1);
    expect(store.routeList()[0].id).toBe('route_2');
  });

  it('removeRoute() clears the version cache entry', () => {
    store.setRoutes([makeRoute('route_1', 1)]);
    store.removeRoute('route_1');
    expect(store.versionFor('route_1')).toBeUndefined();
  });
});
