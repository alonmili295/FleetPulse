import { Component, ViewChild, ElementRef, AfterViewInit, OnDestroy, ChangeDetectionStrategy, inject, computed, effect } from '@angular/core';
import * as L from 'leaflet';
import { FleetStore } from '../../domain/fleet/fleet.store';
import { TelemetryStore } from '../../domain/telemetry/telemetry.store';
import type { TruckListItem } from '../../shared/models/truck.model';
import type { TruckReading } from '../../shared/models/telemetry.model';

interface TruckMapEntry {
  readonly truck: TruckListItem;
  readonly live: TruckReading | null;
  readonly history: TruckReading[];
}

function statusFillColor(status: string): string {
  if (status === 'active')      return '#00875a';
  if (status === 'idle')        return '#ff8b00';
  if (status === 'maintenance') return '#bf2600';
  return '#0052cc';
}

@Component({
  selector: 'app-fleet-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fleet-map.html',
  styleUrl: './fleet-map.css',
})
export class FleetMapComponent implements AfterViewInit, OnDestroy {
  private readonly fleetStore = inject(FleetStore);
  private readonly telemetryStore = inject(TelemetryStore);

  @ViewChild('mapEl') private readonly mapEl!: ElementRef<HTMLElement>;

  private map?: L.Map;
  private readonly circleMarkers = new Map<string, L.CircleMarker>();
  private readonly trails = new Map<string, L.Polyline>();

  private readonly mapData = computed<TruckMapEntry[]>(() =>
    this.fleetStore.truckList().map(truck => ({
      truck,
      live:    this.telemetryStore.latestFor(truck.id),
      history: this.telemetryStore.historyFor(truck.id),
    }))
  );

  constructor() {
    effect(() => {
      const data = this.mapData(); // read before guard so signal dependency is always tracked
      if (!this.map) return;
      this.applyMapData(data);
    });
  }

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement).setView([32.0853, 34.7818], 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(this.map);
    this.applyMapData(this.mapData());
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = undefined;
    this.circleMarkers.clear();
    this.trails.clear();
  }

  private applyMapData(entries: TruckMapEntry[]): void {
    if (!this.map) return;

    const currentIds = new Set(entries.map(e => e.truck.id));

    for (const [id, marker] of this.circleMarkers) {
      if (!currentIds.has(id)) {
        marker.remove();
        this.circleMarkers.delete(id);
        this.trails.get(id)?.remove();
        this.trails.delete(id);
      }
    }

    for (const { truck, live, history } of entries) {
      const loc = live?.location ?? truck.location;
      const latlng: L.LatLngTuple = [loc.lat, loc.lng];
      const fillColor = statusFillColor(truck.status);

      let marker = this.circleMarkers.get(truck.id);
      if (marker) {
        marker.setLatLng(latlng);
        marker.setStyle({ fillColor, color: '#ffffff' });
      } else {
        marker = L.circleMarker(latlng, {
          radius: 9,
          color: '#ffffff',
          fillColor,
          fillOpacity: 0.85,
          weight: 2,
        }).addTo(this.map);
        this.circleMarkers.set(truck.id, marker);
      }

      marker.bindPopup(buildPopup(truck, live));

      if (history.length >= 2) {
        const latlngs = history.map(r => [r.location.lat, r.location.lng] as L.LatLngTuple);
        let trail = this.trails.get(truck.id);
        if (trail) {
          trail.setLatLngs(latlngs);
          trail.setStyle({ color: fillColor });
        } else {
          trail = L.polyline(latlngs, { color: fillColor, weight: 2, opacity: 0.35 }).addTo(this.map);
          this.trails.set(truck.id, trail);
        }
      } else {
        const existing = this.trails.get(truck.id);
        if (existing) {
          existing.remove();
          this.trails.delete(truck.id);
        }
      }
    }
  }
}

function buildPopup(truck: TruckListItem, live: TruckReading | null): HTMLElement {
  // no live yet → use REST baseline; live exists but display value absent → anomaly → show —
  const speedStr = live == null
    ? `${truck.speed.toFixed(1)} km/h`
    : live.displaySpeed != null
      ? `${live.displaySpeed.toFixed(1)} km/h`
      : '—';

  const fuelStr = live == null
    ? `${truck.fuel.toFixed(0)}%`
    : live.displayFuel != null
      ? `${live.displayFuel.toFixed(0)}%`
      : '—';

  const locSource = live?.location ?? truck.location;

  const root = document.createElement('div');
  root.className = 'fleet-map__popup';

  const title = document.createElement('strong');
  title.textContent = truck.name;
  root.appendChild(title);

  const statusLine = document.createElement('div');
  statusLine.textContent = `Status: ${truck.status}`;
  root.appendChild(statusLine);

  const speedLine = document.createElement('div');
  speedLine.textContent = `Speed: ${speedStr}`;
  root.appendChild(speedLine);

  const fuelLine = document.createElement('div');
  fuelLine.textContent = `Fuel: ${fuelStr}`;
  root.appendChild(fuelLine);

  const locLine = document.createElement('div');
  locLine.textContent = `Location: ${locSource.lat.toFixed(4)}, ${locSource.lng.toFixed(4)}`;
  root.appendChild(locLine);

  return root;
}
