import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import maplibregl, {
  type ExpressionSpecification,
  type Marker,
  type GeoJSONSource,
  type Map as MlMap,
  type MapLayerMouseEvent,
  type MapLayerTouchEvent,
  type MapMouseEvent,
  type MapTouchEvent,
} from 'maplibre-gl';

type XY = { x: number; y: number };
type Box = [[number, number], [number, number]];
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LandPlot, LngLat, Project } from '../lib/types.ts';
import { BASEMAP_LAYERS, buildStyle, TBILISI_CENTER, type Basemap } from '../lib/mapStyle.ts';
import { boundsOf, fromPolygon, midpoint } from '../lib/geo.ts';
import { circleRing } from '../lib/prices.ts';
import { formatArea, formatUsdShort } from '../lib/format.ts';
import { LAND_COLORS } from '../lib/types.ts';

/**
 * Drawing state, owned by App so the toolbar and the land form share it.
 *   draw: placing corner points; clicking the first point (or Finish) closes the shape
 *   edit: closed shape; drag corners, drag/click edge midpoints to add corners, click a corner to select it
 */
export interface DrawState {
  /** What the shape is for: a land plot, or a project's territory. */
  target: 'land' | 'project';
  mode: 'draw' | 'edit';
  vertices: LngLat[];
  selected: number | null;
  history: LngLat[][];
}

export interface LayerVisibility {
  projects: boolean;
  territories: boolean;
  land: boolean;
  labels: boolean;
}

export interface RadiusView {
  center: LngLat;
  radii: number[]; // metres
}

export interface MapHandle {
  fitPolygon(vertices: LngLat[]): void;
  flyTo(point: LngLat, zoom?: number): void;
}

interface Props {
  basemap: Basemap;
  projects: Project[];
  lands: LandPlot[];
  selectedProjectId: string | null;
  selectedLandId: string | null;
  selection: LngLat | null;
  draw: DrawState | null;
  /** Territory of the project being edited, shown while not actively drawing. */
  formArea: LngLat[] | null;
  /** Saved territory to hide while its project is being edited. */
  editingProjectId: string | null;
  layers: LayerVisibility;
  radius: RadiusView | null;
  /** Extra right padding when fitting bounds so a side panel does not cover the target. */
  panelOpen: boolean;
  onMapClick(p: LngLat): void;
  onProjectClick(id: string): void;
  onLandClick(id: string): void;
  onDrawChange(next: DrawState): void;
  onDrawFinish(): void;
}

type Fc = GeoJSON.FeatureCollection;
const EMPTY: Fc = { type: 'FeatureCollection', features: [] };
const PROJECT_COLOR = '#1F5FA8';
const LAND_FILL: ExpressionSpecification = [
  'match', ['get', 'color'],
  ...LAND_COLORS.flatMap((c) => [c.value, c.fill]),
  LAND_COLORS[0].fill,
] as unknown as ExpressionSpecification;
const LAND_LINE: ExpressionSpecification = [
  'match', ['get', 'color'],
  ...LAND_COLORS.flatMap((c) => [c.value, c.line]),
  LAND_COLORS[0].line,
] as unknown as ExpressionSpecification;
const LABEL_MIN_ZOOM = 14;

/** Area-weighted centroid of a ring (falls back to the vertex average for degenerate rings). */
function centroid(v: LngLat[]): LngLat {
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < v.length; i++) {
    const [x0, y0] = v[i];
    const [x1, y1] = v[(i + 1) % v.length];
    const f = x0 * y1 - x1 * y0;
    a += f; x += (x0 + x1) * f; y += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-14) return [v.reduce((s, p) => s + p[0], 0) / v.length, v.reduce((s, p) => s + p[1], 0) / v.length];
  return [x / (3 * a), y / (3 * a)];
}

const radiusLabel = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);
const SIGNAL = '#E0362C';
const DRAFT = '#E0362C';

function draftData(draw: DrawState | null, vertices: LngLat[] | null, cursor: LngLat | null): Fc {
  if (!draw) return EMPTY;
  const v = vertices ?? draw.vertices;
  const features: GeoJSON.Feature[] = [];
  if (v.length >= 3) {
    features.push({
      type: 'Feature',
      properties: { kind: 'area', closed: draw.mode === 'edit' },
      geometry: { type: 'Polygon', coordinates: [[...v, v[0]]] },
    });
  }
  if (draw.mode === 'draw' && v.length >= 1) {
    const path = cursor ? [...v, cursor] : v;
    if (path.length >= 2) {
      features.push({ type: 'Feature', properties: { kind: 'path' }, geometry: { type: 'LineString', coordinates: path } });
    }
  }
  if (draw.mode === 'edit') {
    v.forEach((a, i) => {
      const b = v[(i + 1) % v.length];
      features.push({
        type: 'Feature',
        properties: { kind: 'mid', insertAt: i + 1 },
        geometry: { type: 'Point', coordinates: midpoint(a, b) },
      });
    });
  }
  v.forEach((c, i) => {
    features.push({
      type: 'Feature',
      properties: {
        kind: 'vertex',
        index: i,
        first: draw.mode === 'draw' && i === 0 && v.length >= 3,
        selected: draw.mode === 'edit' && draw.selected === i,
      },
      geometry: { type: 'Point', coordinates: c },
    });
  });
  return { type: 'FeatureCollection', features };
}

function addLayers(map: MlMap) {
  map.addSource('lands', { type: 'geojson', data: EMPTY });
  map.addSource('areas', { type: 'geojson', data: EMPTY });
  map.addSource('form-area', { type: 'geojson', data: EMPTY });
  map.addSource('radius', { type: 'geojson', data: EMPTY });

  // Radius circles around the selected point (drawn first, under everything else).
  map.addLayer({
    id: 'radius-fill',
    type: 'fill',
    source: 'radius',
    paint: { 'fill-color': '#E0362C', 'fill-opacity': 0.05 },
  });
  map.addLayer({
    id: 'radius-line',
    type: 'line',
    source: 'radius',
    paint: { 'line-color': '#E0362C', 'line-width': 1.75, 'line-dasharray': [3, 2], 'line-opacity': 0.9 },
  });

  // Project territories: light blue areas, below land plots.
  map.addLayer({
    id: 'areas-fill',
    type: 'fill',
    source: 'areas',
    paint: { 'fill-color': PROJECT_COLOR, 'fill-opacity': ['case', ['get', 'selected'], 0.32, 0.18] },
  });
  map.addLayer({
    id: 'areas-line',
    type: 'line',
    source: 'areas',
    paint: { 'line-color': PROJECT_COLOR, 'line-width': ['case', ['get', 'selected'], 2.5, 1.5] },
  });
  map.addLayer({
    id: 'form-area-fill',
    type: 'fill',
    source: 'form-area',
    paint: { 'fill-color': PROJECT_COLOR, 'fill-opacity': 0.22 },
  });
  map.addLayer({
    id: 'form-area-line',
    type: 'line',
    source: 'form-area',
    paint: { 'line-color': PROJECT_COLOR, 'line-width': 2, 'line-dasharray': [2, 1.5] },
  });
  map.addSource('projects', { type: 'geojson', data: EMPTY });
  map.addSource('selection', { type: 'geojson', data: EMPTY });
  map.addSource('draft', { type: 'geojson', data: EMPTY });

  // Land plots: semi-transparent ochre polygons with a visible border.
  map.addLayer({
    id: 'lands-fill',
    type: 'fill',
    source: 'lands',
    paint: { 'fill-color': LAND_FILL, 'fill-opacity': ['case', ['get', 'selected'], 0.55, 0.38] },
  });
  map.addLayer({
    id: 'lands-casing',
    type: 'line',
    source: 'lands',
    filter: ['==', ['get', 'selected'], true],
    paint: { 'line-color': '#ffffff', 'line-width': 5 },
  });
  map.addLayer({
    id: 'lands-line',
    type: 'line',
    source: 'lands',
    paint: {
      'line-color': LAND_LINE,
      'line-width': ['case', ['get', 'selected'], 2.5, 1.75],
    },
  });

  // Projects: blue circles with a white ring (round = building, polygon = land).
  map.addLayer({
    id: 'projects-halo',
    type: 'circle',
    source: 'projects',
    filter: ['==', ['get', 'selected'], true],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 11, 16, 17],
      'circle-color': PROJECT_COLOR,
      'circle-opacity': 0.22,
    },
  });
  map.addLayer({
    id: 'projects-circle',
    type: 'circle',
    source: 'projects',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['case', ['get', 'selected'], 6.5, 5], 16, ['case', ['get', 'selected'], 11, 9]],
      'circle-color': ['case', ['get', 'selected'], '#163F70', PROJECT_COLOR],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });

  // Draft polygon (drawing / editing).
  map.addLayer({
    id: 'draft-fill',
    type: 'fill',
    source: 'draft',
    filter: ['==', ['get', 'kind'], 'area'],
    paint: { 'fill-color': DRAFT, 'fill-opacity': ['case', ['get', 'closed'], 0.22, 0.1] },
  });
  map.addLayer({
    id: 'draft-outline',
    type: 'line',
    source: 'draft',
    filter: ['all', ['==', ['get', 'kind'], 'area'], ['==', ['get', 'closed'], true]],
    paint: { 'line-color': DRAFT, 'line-width': 2.25 },
  });
  map.addLayer({
    id: 'draft-path',
    type: 'line',
    source: 'draft',
    filter: ['==', ['get', 'kind'], 'path'],
    paint: { 'line-color': DRAFT, 'line-width': 2.25, 'line-dasharray': [2, 1.5] },
  });
  map.addLayer({
    id: 'draft-midpoints',
    type: 'circle',
    source: 'draft',
    filter: ['==', ['get', 'kind'], 'mid'],
    paint: {
      'circle-radius': 4,
      'circle-color': '#ffffff',
      'circle-opacity': 0.9,
      'circle-stroke-color': DRAFT,
      'circle-stroke-width': 1.5,
    },
  });
  map.addLayer({
    id: 'draft-vertices',
    type: 'circle',
    source: 'draft',
    filter: ['==', ['get', 'kind'], 'vertex'],
    paint: {
      'circle-radius': ['case', ['any', ['get', 'first'], ['get', 'selected']], 8, 6],
      'circle-color': ['case', ['get', 'selected'], DRAFT, '#ffffff'],
      'circle-stroke-color': DRAFT,
      'circle-stroke-width': ['case', ['get', 'first'], 3, 2],
    },
  });

  // The red selection circle: a map layer, so it is anchored to coordinates, never to the screen.
  map.addLayer({
    id: 'selection-halo',
    type: 'circle',
    source: 'selection',
    paint: { 'circle-radius': 15, 'circle-color': SIGNAL, 'circle-opacity': 0.18 },
  });
  map.addLayer({
    id: 'selection-dot',
    type: 'circle',
    source: 'selection',
    paint: { 'circle-radius': 7, 'circle-color': SIGNAL, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 },
  });
}

const MapView = forwardRef<MapHandle, Props>(function MapView(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const coordRef = useRef<HTMLSpanElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // Draw state is read by native map handlers. Several map events can fire before React
  // re-renders (e.g. mouseup then click), so the latest emitted state is tracked synchronously.
  const latestDraw = useRef<DrawState | null>(props.draw);
  const lastPropDraw = useRef<DrawState | null>(props.draw);
  if (props.draw !== lastPropDraw.current) {
    lastPropDraw.current = props.draw;
    latestDraw.current = props.draw;
  }
  const emitDraw = (next: DrawState) => {
    latestDraw.current = next;
    propsRef.current.onDrawChange(next);
  };
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Live-drag state is kept out of React so dragging stays at frame rate.
  const cursorRef = useRef<LngLat | null>(null);
  const dragRef = useRef<{ index: number; vertices: LngLat[]; base: LngLat[]; moved: boolean } | null>(null);

  const setSource = (id: string, data: Fc) => {
    (mapRef.current?.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  };
  const renderDraft = () => {
    const d = latestDraw.current;
    setSource('draft', draftData(d, dragRef.current?.vertices ?? null, d?.mode === 'draw' ? cursorRef.current : null));
  };

  /* --------------------------------------------------------------- setup */
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: buildStyle(propsRef.current.basemap),
      center: TBILISI_CENTER,
      zoom: 12,
      maxZoom: 20,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }),
      'bottom-right',
    );
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 120 }), 'bottom-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    const toLngLat = (e: { lngLat: { lng: number; lat: number } }): LngLat => [e.lngLat.lng, e.lngLat.lat];
    const box = (p: XY, r = 9): Box => [
      [p.x - r, p.y - r],
      [p.x + r, p.y + r],
    ];

    const showCoords = (p: LngLat | null) => {
      if (!coordRef.current) return;
      const c = p ?? [map.getCenter().lng, map.getCenter().lat];
      coordRef.current.textContent = `${c[1].toFixed(6)}, ${c[0].toFixed(6)}`;
    };

    /* ---- drag a vertex (mouse + touch) */
    const beginDrag = (index: number, vertices: LngLat[], base: LngLat[]) => {
      dragRef.current = { index, vertices, base, moved: false };
      map.dragPan.disable();
      map.getCanvas().style.cursor = 'grabbing';
      renderDraft();
    };
    const moveDrag = (p: LngLat) => {
      const d = dragRef.current;
      if (!d) return;
      d.vertices = d.vertices.map((v, i) => (i === d.index ? p : v));
      d.moved = true;
      renderDraft();
    };
    const endDrag = () => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      map.dragPan.enable();
      map.getCanvas().style.cursor = '';
      const cur = latestDraw.current;
      if (!cur) return;
      const changed = d.moved || d.vertices.length !== d.base.length;
      emitDraw({
        ...cur,
        vertices: d.vertices,
        selected: d.index,
        history: changed ? [...cur.history, d.base] : cur.history,
      });
    };

    const pressVertex = (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
      const d = latestDraw.current;
      if (d?.mode !== 'edit' || !e.features?.length) return;
      if ('originalEvent' in e && 'button' in e.originalEvent && (e.originalEvent as MouseEvent).button !== 0) return;
      e.preventDefault();
      const index = Number(e.features[0].properties?.index);
      beginDrag(index, d.vertices.slice(), d.vertices);
    };
    const pressMidpoint = (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
      const d = latestDraw.current;
      if (d?.mode !== 'edit' || !e.features?.length) return;
      // A vertex sitting on top of the midpoint takes priority.
      if (map.queryRenderedFeatures(box(e.point, 7), { layers: ['draft-vertices'] }).length) return;
      e.preventDefault();
      const at = Number(e.features[0].properties?.insertAt);
      const geom = e.features[0].geometry as GeoJSON.Point;
      const next = [...d.vertices];
      next.splice(at, 0, [geom.coordinates[0], geom.coordinates[1]]);
      beginDrag(at, next, d.vertices);
    };

    const onMove = (e: MapMouseEvent | MapTouchEvent) => {
      const p = toLngLat(e);
      showCoords(p);
      if (dragRef.current) return moveDrag(p);
      const d = latestDraw.current;
      if (d?.mode === 'draw') {
        cursorRef.current = p;
        renderDraft();
      }
    };

    const onClick = (e: MapMouseEvent) => {
      const P = propsRef.current;
      const d = latestDraw.current;
      if (d) {
        if (d.mode === 'draw') {
          const onFirst =
            d.vertices.length >= 3 &&
            map
              .queryRenderedFeatures(box(e.point), { layers: ['draft-vertices'] })
              .some((f) => Number(f.properties?.index) === 0);
          if (onFirst) return P.onDrawFinish();
          emitDraw({ ...d, vertices: [...d.vertices, toLngLat(e)], history: [...d.history, d.vertices] });
        } else {
          const hit = map.queryRenderedFeatures(box(e.point), { layers: ['draft-vertices'] })[0];
          emitDraw({ ...d, selected: hit ? Number(hit.properties?.index) : null });
        }
        return;
      }
      const project = map.queryRenderedFeatures(box(e.point, 6), { layers: ['projects-circle'] })[0];
      if (project) return P.onProjectClick(String(project.properties?.id));
      const land = map.queryRenderedFeatures(e.point, { layers: ['lands-fill'] })[0];
      if (land) return P.onLandClick(String(land.properties?.id));
      const area = map.queryRenderedFeatures(e.point, { layers: ['areas-fill'] })[0];
      if (area) return P.onProjectClick(String(area.properties?.id));
      P.onMapClick(toLngLat(e));
    };

    map.on('load', () => {
      addLayers(map);
      map.on('mousedown', 'draft-vertices', pressVertex);
      map.on('touchstart', 'draft-vertices', pressVertex);
      map.on('mousedown', 'draft-midpoints', pressMidpoint);
      map.on('touchstart', 'draft-midpoints', pressMidpoint);
      for (const layer of ['projects-circle', 'lands-fill', 'areas-fill', 'draft-vertices', 'draft-midpoints']) {
        map.on('mouseenter', layer, () => {
          if (dragRef.current) return;
          const drawing = latestDraw.current;
          if (layer.startsWith('draft')) map.getCanvas().style.cursor = drawing?.mode === 'edit' ? 'move' : 'pointer';
          else if (!drawing) map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layer, () => {
          if (dragRef.current) return;
          map.getCanvas().style.cursor = latestDraw.current?.mode === 'draw' ? 'crosshair' : '';
        });
      }
      setReady(true);
    });
    map.on('error', (e) => {
      // Tile errors are common (offline, rate limits); report once without breaking the app.
      if (!map.isStyleLoaded()) setLoadError('The base map could not load. Check your connection or tile provider settings.');
      console.warn('[map]', e.error?.message ?? e);
    });
    map.on('mousemove', onMove);
    map.on('touchmove', onMove);
    map.on('mouseup', endDrag);
    map.on('touchend', endDrag);
    map.on('touchcancel', endDrag);
    map.on('click', onClick);
    map.on('moveend', () => showCoords(null));
    map.on('mouseout', () => {
      cursorRef.current = null;
      if (latestDraw.current?.mode === 'draw') renderDraft();
      showCoords(null);
    });

    // Keep the canvas sized to its container (sidebar collapse, window resize, mobile rotation).
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current!);
    showCoords(null);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------- data sync */
  useEffect(() => {
    if (!ready) return;
    setSource('projects', {
      type: 'FeatureCollection',
      features: props.projects.map((p) => ({
        type: 'Feature',
        properties: { id: p.id, selected: p.id === props.selectedProjectId },
        geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
      })),
    });
  }, [ready, props.projects, props.selectedProjectId]);

  useEffect(() => {
    if (!ready) return;
    setSource('areas', {
      type: 'FeatureCollection',
      features: props.projects
        .filter((p) => p.area && p.id !== props.editingProjectId)
        .map((p) => ({
          type: 'Feature',
          properties: { id: p.id, selected: p.id === props.selectedProjectId },
          geometry: p.area!,
        })),
    });
  }, [ready, props.projects, props.selectedProjectId, props.editingProjectId]);

  useEffect(() => {
    if (!ready) return;
    const v = props.draw?.target === 'project' ? null : props.formArea;
    setSource(
      'form-area',
      v && v.length >= 3
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...v, v[0]]] } }] }
        : EMPTY,
    );
  }, [ready, props.formArea, props.draw]);

  // Radius circles + their distance labels.
  const radiusMarkers = useRef<Marker[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    radiusMarkers.current.forEach((m) => m.remove());
    radiusMarkers.current = [];
    const r = props.radius;
    if (!r || !r.radii.length) return setSource('radius', EMPTY);
    const sorted = [...r.radii].sort((a, b) => b - a);
    setSource('radius', {
      type: 'FeatureCollection',
      features: sorted.map((m) => ({
        type: 'Feature',
        properties: { radius: m },
        geometry: { type: 'Polygon', coordinates: [circleRing(r.center, m)] },
      })),
    });
    for (const m of sorted) {
      const north = circleRing(r.center, m, 4)[0]; // first step is due north
      const el = document.createElement('div');
      el.className = 'radius-label';
      el.textContent = radiusLabel(m);
      radiusMarkers.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(north).addTo(map));
    }
  }, [ready, props.radius]);

  // Small price / area labels on land plots (HTML markers, so no font server is needed).
  const landMarkers = useRef<Marker[]>([]);
  const [zoom, setZoom] = useState(12);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const onZoom = () => setZoom(Math.floor(map.getZoom() * 2) / 2);
    map.on('zoomend', onZoom);
    onZoom();
    return () => {
      map.off('zoomend', onZoom);
    };
  }, [ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    landMarkers.current.forEach((m) => m.remove());
    landMarkers.current = [];
    if (!props.layers.land || !props.layers.labels || zoom < LABEL_MIN_ZOOM) return;
    for (const l of props.lands) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'land-label';
      el.dataset.color = l.color;
      if (l.id === props.selectedLandId) el.dataset.selected = 'true';
      const price = document.createElement('strong');
      price.textContent = l.total_price_usd != null ? formatUsdShort(l.total_price_usd) : 'No price';
      const area = document.createElement('span');
      area.textContent = formatArea(l.area_m2, false);
      el.append(price, area);
      el.title = l.name;
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (!latestDraw.current) propsRef.current.onLandClick(l.id);
      });
      landMarkers.current.push(
        new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(centroid(fromPolygon(l.geometry))).addTo(map),
      );
    }
  }, [ready, props.lands, props.selectedLandId, props.layers.land, props.layers.labels, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const vis = (on: boolean) => (on ? 'visible' : 'none');
    const groups: [boolean, string[]][] = [
      [props.layers.projects, ['projects-halo', 'projects-circle']],
      [props.layers.territories, ['areas-fill', 'areas-line']],
      [props.layers.land, ['lands-fill', 'lands-casing', 'lands-line']],
    ];
    for (const [on, ids] of groups) for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis(on));
  }, [ready, props.layers]);

  useEffect(() => {
    if (!ready) return;
    setSource('lands', {
      type: 'FeatureCollection',
      features: props.lands.map((l) => ({
        type: 'Feature',
        properties: { id: l.id, selected: l.id === props.selectedLandId, color: l.color },
        geometry: l.geometry,
      })),
    });
  }, [ready, props.lands, props.selectedLandId]);

  useEffect(() => {
    if (!ready) return;
    setSource(
      'selection',
      props.selection
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: props.selection } }] }
        : EMPTY,
    );
  }, [ready, props.selection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!props.draw) cursorRef.current = null;
    renderDraft();
    const drawing = props.draw?.mode === 'draw';
    map.getCanvas().style.cursor = drawing ? 'crosshair' : '';
    if (props.draw) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, props.draw]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const [base, layers] of Object.entries(BASEMAP_LAYERS)) {
      for (const id of layers) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', base === props.basemap ? 'visible' : 'none');
      }
    }
  }, [ready, props.basemap]);

  /* ---------------------------------------------------------- imperative */
  useImperativeHandle(ref, () => ({
    fitPolygon(vertices) {
      const map = mapRef.current;
      if (!map || vertices.length === 0) return;
      const wide = window.innerWidth >= 768;
      map.fitBounds(boundsOf(vertices), {
        padding: { top: 70, bottom: wide ? 70 : window.innerHeight * 0.45, left: 50, right: wide && propsRef.current.panelOpen ? 420 : 50 },
        maxZoom: 18,
        duration: 700,
      });
    },
    flyTo(point, zoom = 16) {
      const map = mapRef.current;
      if (!map) return;
      const wide = window.innerWidth >= 768;
      map.easeTo({
        center: point,
        zoom: Math.max(map.getZoom(), zoom),
        duration: 700,
        offset: wide && propsRef.current.panelOpen ? [-190, 0] : [0, wide ? 0 : -window.innerHeight * 0.2],
      });
    },
  }));

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" aria-label="Map of Tbilisi" role="application" />
      <div className="pointer-events-none absolute bottom-2 left-1/2 hidden -translate-x-1/2 rounded bg-white/85 px-2 py-0.5 text-[11px] tabular-nums text-ink-soft shadow-sm backdrop-blur sm:block">
        <span ref={coordRef} />
      </div>
      {loadError && (
        <div role="alert" className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-white px-4 py-2 text-sm text-signal shadow-float">
          {loadError}
        </div>
      )}
    </div>
  );
});

export default MapView;
