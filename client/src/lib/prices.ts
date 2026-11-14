import type { Frame, LngLat, PriceEntry, Project } from './types.ts';
import { FRAMES } from './types.ts';

/** A range counts as its midpoint in averages. */
export const midpoint = (p: { min: number; max: number | null }) => (p.max == null ? p.min : (p.min + p.max) / 2);

/** Newest entry per frame (history is newest first, but sort defensively). */
export function currentPrices(project: Pick<Project, 'price_history'>): Partial<Record<Frame, PriceEntry>> {
  const out: Partial<Record<Frame, PriceEntry>> = {};
  const sorted = [...project.price_history].sort(
    (a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at),
  );
  for (const e of sorted) if (!out[e.frame]) out[e.frame] = e;
  return out;
}

/** Midpoints of a project's current prices, one per frame that has a price. */
export function currentMidpoints(project: Pick<Project, 'price_history'>): number[] {
  return Object.values(currentPrices(project)).map((e) => midpoint(e!));
}

/** Lowest and highest current price across frames, for list display and filtering. */
export function priceSpan(project: Pick<Project, 'price_history'>): { lo: number; hi: number } | null {
  const cur = Object.values(currentPrices(project));
  if (!cur.length) return null;
  return {
    lo: Math.min(...cur.map((e) => e!.min)),
    hi: Math.max(...cur.map((e) => e!.max ?? e!.min)),
  };
}

const EARTH_R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in metres. */
export function distanceM(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Closed ring approximating a circle of `radiusM` metres around `center`. */
export function circleRing(center: LngLat, radiusM: number, steps = 96): LngLat[] {
  const [lng, lat] = center.map(rad);
  const d = radiusM / EARTH_R;
  const ring: LngLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const brg = (2 * Math.PI * i) / steps;
    const lat2 = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(brg));
    const lng2 = lng + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(lat2));
    ring.push([deg(lng2), deg(lat2)]);
  }
  return ring;
}

export interface RadiusStats {
  radius: number;
  projectCount: number;
  /** Average current price per frame, with the number of projects that have that frame. */
  byFrame: Record<Frame, { avg: number | null; n: number }>;
  /** Average over every current frame price of the projects inside. */
  overall: number | null;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function radiusStats(center: LngLat, radiusM: number, projects: Project[]): RadiusStats {
  const inside = projects.filter((p) => distanceM(center, [p.longitude, p.latitude]) <= radiusM);
  const byFrame = {} as RadiusStats['byFrame'];
  const all: number[] = [];
  for (const f of FRAMES) {
    const vals = inside.map((p) => currentPrices(p)[f.value]).filter(Boolean).map((e) => midpoint(e!));
    byFrame[f.value] = { avg: avg(vals), n: vals.length };
    all.push(...vals);
  }
  return { radius: radiusM, projectCount: inside.length, byFrame, overall: avg(all) };
}
