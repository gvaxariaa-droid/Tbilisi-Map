import { z } from 'zod';
import { round2 } from './http.js';

export const STAGES = [
  'design',
  'facade_works',
  'construction_low',
  'construction_high',
  'exterior_finishing',
  'completed',
  'partially_completed',
];
// Partly completed projects still have blocks being built, so they count as under construction.
export const UNDER_CONSTRUCTION_STAGES = ['facade_works', 'construction_low', 'construction_high', 'exterior_finishing', 'partially_completed'];
export const COMPLETED_STAGES = ['completed'];

/** Optional free text: '' and null become null. */
const optText = (max) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v ? v : null));

const optPhone = z
  .union([
    z
      .string()
      .trim()
      .max(40)
      .regex(/^[+0-9 ()\-.]*$/, 'Phone numbers may contain digits, spaces, +, -, ( and ) only'),
    z.null(),
  ])
  .optional()
  .transform((v) => (v ? v : null));

/** Optional non-negative USD amount. */
const usd = (max) => z.number().finite().min(0).max(max).nullable().optional().transform((v) => v ?? null);

const position = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);

export const polygonSchema = z
  .object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(position).min(4).max(1000)).length(1, 'Land plots must be a single polygon without holes'),
  })
  .refine(
    (g) => {
      const ring = g.coordinates[0];
      const a = ring[0];
      const b = ring[ring.length - 1];
      return a[0] === b[0] && a[1] === b[1];
    },
    { message: 'Polygon ring must be closed (first and last point equal)' },
  );

export const FRAMES = ['black', 'white', 'green'];

const priceEntry = z
  .object({
    /** Present for an entry that already exists; absent for a new one. */
    id: z.string().uuid().optional(),
    frame: z.enum(FRAMES),
    min: z.number().finite().min(0).max(1_000_000),
    max: z.number().finite().min(0).max(1_000_000).nullable().optional().transform((v) => v ?? null),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  })
  .refine((p) => p.max == null || p.max >= p.min, { message: 'The upper price must be at least the lower price', path: ['max'] })
  // "1,200 to 1,200" is a single price
  .transform((p) => ({ ...p, max: p.max != null && p.max === p.min ? null : p.max }));

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const projectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(200),
  developer: z.string().trim().min(1, 'Developer is required').max(200),
  architect: optText(200),
  construction_stage: z.enum(STAGES),
  handover_date: z
    .union([dateStr, z.literal(''), z.null()])
    .optional()
    .transform((v) => v || null),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  description: optText(5000),
  /** Optional project territory drawn on the map. */
  area: polygonSchema.nullable().optional().transform((v) => v ?? null),
  color: z.enum(['blue', 'green', 'orange', 'red']).optional().default('blue'),
  /**
   * The complete price history as edited in the form. Entries with an id are updated,
   * entries without one are added, and saved entries missing from the list are deleted.
   */
  price_history: z.array(priceEntry).max(300).optional(),
});

export const landSchema = z
  .object({
    name: z.string().trim().min(1, 'Land plot name is required').max(200),
    geometry: polygonSchema,
    area_is_manual: z.boolean().optional().default(false),
    area_m2: z.number().finite().positive().max(1e10).nullable().optional(),
    total_price_usd: usd(1e12),
    price_per_m2_usd: usd(1_000_000),
    k2_coefficient: z.number().finite().min(0).max(100).nullable().optional().transform((v) => v ?? null),
    color: z.enum(['red', 'orange', 'green']).optional().default('orange'),
    cadastral_code: z
      .union([
        z
          .string()
          .trim()
          .max(60)
          .regex(/^[0-9A-Za-z.\-/ ]*$/, 'Cadastral codes contain digits, dots and dashes, e.g. 01.72.14.009.012'),
        z.null(),
      ])
      .optional()
      .transform((v) => (v ? v : null)),
    owner_name: optText(200),
    owner_phone: optPhone,
    agent_name: optText(200),
    agent_phone: optPhone,
    notes: optText(5000),
  })
  .refine((d) => !d.area_is_manual || (d.area_m2 != null && d.area_m2 > 0), {
    message: 'Enter a manual area greater than 0, or switch back to the calculated area',
    path: ['area_m2'],
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
});

const password = z.string().min(10, 'Passwords need at least 10 characters').max(200);

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  password,
  role: z.enum(['admin', 'viewer']),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(['admin', 'viewer']).optional(),
  password: password.optional(),
});

/**
 * Fill in whichever price is missing from the other one and the area.
 * When both are supplied they are kept as given (the client keeps them consistent).
 */
export function reconcilePrices(area, total, perM2) {
  if (!(area > 0)) return { total, perM2 };
  if (total != null && perM2 == null) return { total, perM2: round2(total / area) };
  if (perM2 != null && total == null) return { total: round2(perM2 * area), perM2 };
  return { total, perM2 };
}
