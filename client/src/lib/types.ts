export type LngLat = [number, number];

export type Stage =
  | 'planning'
  | 'design'
  | 'construction'
  | 'structure'
  | 'facade'
  | 'interior_works'
  | 'completed'
  | 'delivered';

/** In build order: the card's stage meter relies on this sequence. */
export const STAGES: { value: Stage; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'design', label: 'Design' },
  { value: 'construction', label: 'Construction' },
  { value: 'structure', label: 'Structure' },
  { value: 'facade', label: 'Facade' },
  { value: 'interior_works', label: 'Interior works' },
  { value: 'completed', label: 'Completed' },
  { value: 'delivered', label: 'Delivered' },
];

export const stageLabel = (s: Stage) => STAGES.find((x) => x.value === s)?.label ?? s;
export const stageIndex = (s: Stage) => STAGES.findIndex((x) => x.value === s);

export interface Project {
  id: string;
  name: string;
  developer: string;
  architect: string | null;
  construction_stage: Stage;
  price_per_m2_usd: number | null;
  handover_date: string | null; // YYYY-MM-DD
  latitude: number;
  longitude: number;
  description: string | null;
  photo_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectInput {
  name: string;
  developer: string;
  architect: string | null;
  construction_stage: Stage;
  price_per_m2_usd: number | null;
  handover_date: string | null;
  latitude: number;
  longitude: number;
  description: string | null;
}

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: LngLat[][];
}

export interface LandPlot {
  id: string;
  name: string;
  geometry: PolygonGeometry;
  area_m2: number;
  area_is_manual: boolean;
  computed_area_m2: number;
  total_price_usd: number | null;
  price_per_m2_usd: number | null;
  k2_coefficient: number | null;
  /** Contacts are only present for signed-in users. */
  owner_name?: string | null;
  owner_phone?: string | null;
  agent_name?: string | null;
  agent_phone?: string | null;
  notes: string | null;
  photo_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface LandInput {
  name: string;
  geometry: PolygonGeometry;
  area_is_manual: boolean;
  area_m2: number | null;
  total_price_usd: number | null;
  price_per_m2_usd: number | null;
  k2_coefficient: number | null;
  owner_name: string | null;
  owner_phone: string | null;
  agent_name: string | null;
  agent_phone: string | null;
  notes: string | null;
}

export interface Stats {
  project_count: number;
  land_count: number;
  total_land_area_m2: number;
  avg_project_price_per_m2_usd: number | null;
  avg_land_price_per_m2_usd: number | null;
  under_construction_count: number;
  completed_count: number;
}

export type Role = 'admin' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  created_at?: string;
}
