import type { LngLat, PolygonGeometry } from './types.ts';

const EARTH_RADIUS = 6378137; // WGS84 equatorial radius, metres (same constant as turf.js)
const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Geodesic area of a ring in m² on a spherical earth (Chamberlain & Duquette, NASA JPL 2007),
 * the same method used by @turf/area. Works for open or closed rings and either winding.
 * Within ~0.3% of PostGIS's ellipsoidal ST_Area(geography); the server value is authoritative.
 */
export function ringArea(ring: LngLat[]): number {
  const n = ring.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % n];
    total += rad(lon2 - lon1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((total * EARTH_RADIUS * EARTH_RADIUS) / 2);
}

/** Closed GeoJSON polygon from open vertices (first point repeated at the end). */
export function toPolygon(vertices: LngLat[]): PolygonGeometry {
  return { type: 'Polygon', coordinates: [[...vertices, vertices[0]]] };
}

/** Open vertex list from a closed GeoJSON ring. */
export function fromPolygon(g: PolygonGeometry): LngLat[] {
  const ring = g.coordinates[0] ?? [];
  const last = ring.length - 1;
  const closed = last > 0 && ring[0][0] === ring[last][0] && ring[0][1] === ring[last][1];
  return (closed ? ring.slice(0, last) : ring).map(([x, y]) => [x, y] as LngLat);
}

export function boundsOf(points: LngLat[]): [LngLat, LngLat] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of points) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [[w, s], [e, n]];
}

function orient(a: LngLat, b: LngLat, c: LngLat) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: LngLat, b: LngLat, p: LngLat) {
  return (
    Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1])
  );
}

function segmentsIntersect(p1: LngLat, p2: LngLat, p3: LngLat, p4: LngLat) {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;
  return false;
}

/** True when any two non-adjacent edges of the (open) ring cross or touch. */
export function selfIntersects(vertices: LngLat[]): boolean {
  const n = vertices.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = vertices[i];
    const a2 = vertices[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // skip edges that share a vertex
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsIntersect(a1, a2, vertices[j], vertices[(j + 1) % n])) return true;
    }
  }
  return false;
}

export function midpoint(a: LngLat, b: LngLat): LngLat {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export type PriceAnchor = 'total' | 'perM2';

/**
 * Land price arithmetic. `anchor` is the field the user last typed; the other is derived:
 *   total  = area × price per m²
 *   per m² = total ÷ area
 */
export function derivePrices(
  area: number | null,
  total: number | null,
  perM2: number | null,
  anchor: PriceAnchor,
): { total: number | null; perM2: number | null } {
  if (!area || !(area > 0)) return { total, perM2 };
  if (anchor === 'total') return { total, perM2: total == null ? perM2 : round2(total / area) };
  return { perM2, total: perM2 == null ? total : round2(perM2 * area) };
}
