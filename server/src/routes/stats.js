import express from 'express';
import { query } from '../db.js';
import { asyncHandler } from '../http.js';
import { UNDER_CONSTRUCTION_STAGES, COMPLETED_STAGES } from '../validation.js';

export const statsRouter = express.Router();

statsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `WITH current_prices AS (
         -- newest entry per project and frame; a price range counts as its midpoint
         SELECT DISTINCT ON (project_id, frame) frame,
                (price_min_usd + COALESCE(price_max_usd, price_min_usd)) / 2 AS mid
           FROM project_prices
          ORDER BY project_id, frame, effective_date DESC, created_at DESC
       )
       SELECT
         (SELECT count(*)::int FROM projects) AS project_count,
         (SELECT count(*)::int FROM land_plots) AS land_count,
         (SELECT COALESCE(sum(area_m2), 0) FROM land_plots) AS total_land_area_m2,
         (SELECT round(avg(mid), 2) FROM current_prices) AS avg_project_price_per_m2_usd,
         (SELECT round(avg(mid), 2) FROM current_prices WHERE frame = 'black') AS avg_black_frame_usd,
         (SELECT round(avg(mid), 2) FROM current_prices WHERE frame = 'white') AS avg_white_frame_usd,
         (SELECT round(avg(mid), 2) FROM current_prices WHERE frame = 'green') AS avg_green_frame_usd,
         (SELECT round(avg(price_per_m2_usd), 2) FROM land_plots WHERE price_per_m2_usd IS NOT NULL)
           AS avg_land_price_per_m2_usd,
         (SELECT count(*)::int FROM projects WHERE construction_stage = ANY($1)) AS under_construction_count,
         (SELECT count(*)::int FROM projects WHERE construction_stage = ANY($2)) AS completed_count`,
      [UNDER_CONSTRUCTION_STAGES, COMPLETED_STAGES],
    );
    res.json(rows[0]);
  }),
);
