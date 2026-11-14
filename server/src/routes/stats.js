import express from 'express';
import { query } from '../db.js';
import { asyncHandler } from '../http.js';
import { UNDER_CONSTRUCTION_STAGES, COMPLETED_STAGES } from '../validation.js';

export const statsRouter = express.Router();

statsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT
         (SELECT count(*)::int FROM projects) AS project_count,
         (SELECT count(*)::int FROM land_plots) AS land_count,
         (SELECT COALESCE(sum(area_m2), 0) FROM land_plots) AS total_land_area_m2,
         (SELECT round(avg(price_per_m2_usd), 2) FROM projects WHERE price_per_m2_usd IS NOT NULL)
           AS avg_project_price_per_m2_usd,
         (SELECT round(avg(price_per_m2_usd), 2) FROM land_plots WHERE price_per_m2_usd IS NOT NULL)
           AS avg_land_price_per_m2_usd,
         (SELECT count(*)::int FROM projects WHERE construction_stage = ANY($1)) AS under_construction_count,
         (SELECT count(*)::int FROM projects WHERE construction_stage = ANY($2)) AS completed_count`,
      [UNDER_CONSTRUCTION_STAGES, COMPLETED_STAGES],
    );
    res.json(rows[0]);
  }),
);
