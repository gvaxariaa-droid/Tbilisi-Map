export type LngLat = [number, number];

export type Stage =
  | 'design'
  | 'facade_works'
  | 'construction_low'
  | 'construction_high'
  | 'exterior_finishing'
  | 'completed'
  | 'partially_completed';

/** In order: the card's stage meter relies on this sequence. `label` is the English source text for translation. */
export const STAGES: { value: Stage; label: string }[] = [
  { value: 'design', label: 'Design' },
  { value: 'facade_works', label: 'Facade works' },
  { value: 'construction_low', label: 'Construction up to 5 floors' },
  { value: 'construction_high', label: 'Construction 5+ floors' },
  { value: 'exterior_finishing', label: 'Exterior finishing' },
  { value: 'completed', label: 'Completed' },
  { value: 'partially_completed', label: 'Partially completed (blocks)' },
];

export const stageLabel = (s: Stage) => STAGES.find((x) => x.value === s)?.label ?? s;
export const stageIndex = (s: Stage) => STAGES.findIndex((x) => x.value === s);

/** Delivery condition a price applies to. */
export type Frame = 'black' | 'white' | 'green';

/** swatch: the square marker; line: the chart line colour (readable on both themes). */
export const FRAMES: { value: Frame; label: string; short: string; swatch: string; line: string }[] = [
  { value: 'black', label: 'Black frame', short: 'Black', swatch: '#2B2F33', line: '#7A848A' },
  { value: 'white', label: 'White frame', short: 'White', swatch: '#E6E9E8', line: '#4C8BD6' },
  { value: 'green', label: 'Green frame', short: 'Green', swatch: '#3E9B5F', line: '#3E9B5F' },
];

export type ProjectColor = 'blue' | 'green' | 'orange' | 'red';
export const PROJECT_COLORS: { value: ProjectColor; label: string; pin: string; deep: string }[] = [
  { value: 'blue', label: 'Blue', pin: '#1F5FA8', deep: '#163F70' },
  { value: 'green', label: 'Green', pin: '#2E9D57', deep: '#1D6B3A' },
  { value: 'orange', label: 'Light orange', pin: '#F08A3C', deep: '#B5591A' },
  { value: 'red', label: 'Red', pin: '#D9372E', deep: '#93221B' },
];
export const projectColor = (c: ProjectColor | undefined) => PROJECT_COLORS.find((x) => x.value === c) ?? PROJECT_COLORS[0];
export const frameLabel = (f: Frame) => FRAMES.find((x) => x.value === f)?.label ?? f;

/** One entry in a project's price history. A single price has max = null. */
export interface PriceEntry {
  id: string;
  frame: Frame;
  min: number;
  max: number | null;
  date: string; // YYYY-MM-DD the price took effect
  created_at: string;
}

/** A price history entry as sent on save; entries without an id are new. */
export interface PriceInput {
  id?: string;
  frame: Frame;
  min: number;
  max: number | null;
  date: string;
}

export interface Project {
  id: string;
  name: string;
  developer: string;
  architect: string | null;
  construction_stage: Stage;
  color: ProjectColor;
  handover_date: string | null; // YYYY-MM-DD
  latitude: number;
  longitude: number;
  description: string | null;
  photo_id: string | null;
  /** Optional project territory. */
  area: PolygonGeometry | null;
  area_m2: number | null;
  /** Newest first. */
  price_history: PriceEntry[];
  created_at: string;
  updated_at: string;
}

export interface ProjectInput {
  name: string;
  developer: string;
  architect: string | null;
  construction_stage: Stage;
  handover_date: string | null;
  latitude: number;
  longitude: number;
  description: string | null;
  area: PolygonGeometry | null;
  color: ProjectColor;
  /** The complete history; saved entries left out are deleted. */
  price_history: PriceInput[];
}

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: LngLat[][];
}

export type LandColor = 'red' | 'orange' | 'green';

export const LAND_COLORS: { value: LandColor; label: string; fill: string; line: string }[] = [
  { value: 'orange', label: 'Light orange', fill: '#F3A55B', line: '#B86A1E' },
  { value: 'red', label: 'Red', fill: '#E0473C', line: '#9E2A22' },
  { value: 'green', label: 'Green', fill: '#45A866', line: '#22693C' },
];
export const landColor = (c: LandColor | undefined) => LAND_COLORS.find((x) => x.value === c) ?? LAND_COLORS[0];

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
  color: LandColor;
  cadastral_code: string | null;
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
  color: LandColor;
  cadastral_code: string | null;
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
  avg_black_frame_usd: number | null;
  avg_white_frame_usd: number | null;
  avg_green_frame_usd: number | null;
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
