import type { StyleSpecification } from 'maplibre-gl';

// Tile providers are configurable at build time (see client/.env.example).
// Defaults: Esri World Street Map (street names, buildings) + Esri World Imagery with Esri place labels.
// For heavy production traffic use a commercial provider (e.g. MapTiler) and set the URLs.
const env = import.meta.env;

const STREETS =
  env.VITE_STREETS_TILE_URL ||
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const STREETS_ATTR =
  env.VITE_STREETS_ATTRIBUTION ||
  'Esri, HERE, Garmin, © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, and the GIS user community';
const SATELLITE =
  env.VITE_SATELLITE_TILE_URL ||
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_ATTR =
  env.VITE_SATELLITE_ATTRIBUTION || 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community';
const LABELS =
  env.VITE_LABELS_TILE_URL ??
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

export type Basemap = 'streets' | 'satellite';

export const TBILISI_CENTER: [number, number] = [44.793, 41.7151];

export function buildStyle(initial: Basemap): StyleSpecification {
  const vis = (b: Basemap) => (b === initial ? 'visible' : 'none') as 'visible' | 'none';
  const style: StyleSpecification = {
    version: 8,
    sources: {
      streets: { type: 'raster', tiles: [STREETS], tileSize: 256, maxzoom: 19, attribution: STREETS_ATTR },
      satellite: { type: 'raster', tiles: [SATELLITE], tileSize: 256, maxzoom: 19, attribution: SATELLITE_ATTR },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#E4E8E6' } },
      { id: 'streets', type: 'raster', source: 'streets', layout: { visibility: vis('streets') } },
      { id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: vis('satellite') } },
    ],
  };
  if (LABELS) {
    style.sources.labels = { type: 'raster', tiles: [LABELS], tileSize: 256, maxzoom: 19 };
    style.layers.push({ id: 'satellite-labels', type: 'raster', source: 'labels', layout: { visibility: vis('satellite') } });
  }
  return style;
}

export const BASEMAP_LAYERS: Record<Basemap, string[]> = {
  streets: ['streets'],
  satellite: ['satellite', 'satellite-labels'],
};
