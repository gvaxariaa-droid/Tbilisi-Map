import type { LandPlot, Project, Stage } from './types.ts';
import { parseAmount } from './format.ts';

export interface ProjectFilters {
  stages: Stage[];
  minPrice: string;
  maxPrice: string;
  developer: string; // '' = any
}

export type LandField = 'all' | 'name' | 'owner' | 'agent';
export type LandSort = 'newest' | 'price_desc' | 'price_asc' | 'area_desc' | 'area_asc' | 'ppm_desc' | 'ppm_asc';

export interface LandFilters {
  query: string;
  field: LandField;
  minArea: string;
  maxArea: string;
  minTotal: string;
  maxTotal: string;
  minPpm: string;
  maxPpm: string;
  minK2: string;
  maxK2: string;
  sort: LandSort;
}

export const emptyProjectFilters: ProjectFilters = { stages: [], minPrice: '', maxPrice: '', developer: '' };
export const emptyLandFilters: LandFilters = {
  query: '',
  field: 'all',
  minArea: '',
  maxArea: '',
  minTotal: '',
  maxTotal: '',
  minPpm: '',
  maxPpm: '',
  minK2: '',
  maxK2: '',
  sort: 'newest',
};

const norm = (s: string | null | undefined) => (s ?? '').toLocaleLowerCase().normalize('NFKD');

function matches(haystack: (string | null | undefined)[], needle: string) {
  const n = norm(needle.trim());
  if (!n) return true;
  return haystack.some((h) => norm(h).includes(n));
}

/** A range filter. Records without a value are excluded once either bound is set. */
function inRange(value: number | null | undefined, min: string, max: string) {
  const lo = parseAmount(min);
  const hi = parseAmount(max);
  const hasLo = lo != null && !Number.isNaN(lo);
  const hasHi = hi != null && !Number.isNaN(hi);
  if (!hasLo && !hasHi) return true;
  if (value == null) return false;
  if (hasLo && value < (lo as number)) return false;
  if (hasHi && value > (hi as number)) return false;
  return true;
}

export function filterProjects(list: Project[], search: string, f: ProjectFilters): Project[] {
  return list.filter(
    (p) =>
      matches([p.name, p.developer, p.architect], search) &&
      (f.stages.length === 0 || f.stages.includes(p.construction_stage)) &&
      (!f.developer || p.developer === f.developer) &&
      inRange(p.price_per_m2_usd, f.minPrice, f.maxPrice),
  );
}

function landFieldValues(l: LandPlot, field: LandField) {
  switch (field) {
    case 'name':
      return [l.name];
    case 'owner':
      return [l.owner_name, l.owner_phone];
    case 'agent':
      return [l.agent_name, l.agent_phone];
    default:
      return [l.name, l.owner_name, l.agent_name, l.owner_phone, l.agent_phone];
  }
}

const SORTERS: Record<LandSort, (a: LandPlot, b: LandPlot) => number> = {
  newest: (a, b) => b.created_at.localeCompare(a.created_at),
  price_desc: (a, b) => nullsLast(a.total_price_usd, b.total_price_usd, -1),
  price_asc: (a, b) => nullsLast(a.total_price_usd, b.total_price_usd, 1),
  area_desc: (a, b) => b.area_m2 - a.area_m2,
  area_asc: (a, b) => a.area_m2 - b.area_m2,
  ppm_desc: (a, b) => nullsLast(a.price_per_m2_usd, b.price_per_m2_usd, -1),
  ppm_asc: (a, b) => nullsLast(a.price_per_m2_usd, b.price_per_m2_usd, 1),
};

function nullsLast(a: number | null, b: number | null, dir: 1 | -1) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * dir;
}

export function filterLands(list: LandPlot[], search: string, f: LandFilters): LandPlot[] {
  return list
    .filter(
      (l) =>
        matches([l.name, l.owner_name, l.agent_name], search) &&
        matches(landFieldValues(l, f.field), f.query) &&
        inRange(l.area_m2, f.minArea, f.maxArea) &&
        inRange(l.total_price_usd, f.minTotal, f.maxTotal) &&
        inRange(l.price_per_m2_usd, f.minPpm, f.maxPpm) &&
        inRange(l.k2_coefficient, f.minK2, f.maxK2),
    )
    .sort(SORTERS[f.sort]);
}

export function countActiveProjectFilters(f: ProjectFilters) {
  return (f.stages.length ? 1 : 0) + (f.developer ? 1 : 0) + (f.minPrice || f.maxPrice ? 1 : 0);
}

export function countActiveLandFilters(f: LandFilters) {
  return (
    (f.query ? 1 : 0) +
    (f.minArea || f.maxArea ? 1 : 0) +
    (f.minTotal || f.maxTotal ? 1 : 0) +
    (f.minPpm || f.maxPpm ? 1 : 0) +
    (f.minK2 || f.maxK2 ? 1 : 0)
  );
}
