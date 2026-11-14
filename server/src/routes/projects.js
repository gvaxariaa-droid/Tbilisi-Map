import express from 'express';
import { query, tx } from '../db.js';
import { asyncHandler, httpError, idParam } from '../http.js';
import { projectSchema } from '../validation.js';
import { requireAdmin } from '../auth.js';
import { removeQuietly } from '../storage.js';
import { upload, storePhoto } from './photos.js';

/**
 * price_history: every price entry, newest first.
 * The current price of each frame is its newest entry (by effective date, then entry time);
 * the client derives it from the history so both always agree.
 */
const SELECT = `
  SELECT p.id, p.name, p.developer, p.architect, p.construction_stage,
         p.handover_date, p.latitude, p.longitude, p.description, p.created_at, p.updated_at,
         CASE WHEN p.area_geom IS NULL THEN NULL ELSE ST_AsGeoJSON(p.area_geom, 8)::json END AS area,
         CASE WHEN p.area_geom IS NULL THEN NULL
              ELSE round(ST_Area(p.area_geom::geography)::numeric, 2) END AS area_m2,
         (SELECT ph.id FROM photos ph WHERE ph.project_id = p.id
           ORDER BY ph.created_at DESC LIMIT 1) AS photo_id,
         COALESCE((SELECT json_agg(json_build_object(
                     'id', pp.id, 'frame', pp.frame, 'min', pp.price_min_usd, 'max', pp.price_max_usd,
                     'date', pp.effective_date, 'created_at', pp.created_at)
                   ORDER BY pp.effective_date DESC, pp.created_at DESC)
                   FROM project_prices pp WHERE pp.project_id = p.id), '[]'::json) AS price_history
  FROM projects p`;

async function getProject(id) {
  const { rows } = await query(`${SELECT} WHERE p.id = $1`, [id]);
  if (!rows[0]) throw httpError(404, 'Project not found.');
  return rows[0];
}

const AREA_SQL = (param) =>
  `CASE WHEN ${param}::text IS NULL THEN NULL
        ELSE ST_ForcePolygonCCW(ST_SetSRID(ST_GeomFromGeoJSON(${param}::text), 4326)) END`;

async function checkArea(area) {
  if (!area) return;
  const { rows } = await query(
    `SELECT ST_IsValid(g) AS valid, ST_IsValidReason(g) AS reason
       FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326) AS g) s`,
    [JSON.stringify(area)],
  );
  if (!rows[0].valid) {
    throw httpError(400, `The project territory is not a valid shape (${rows[0].reason}). Make sure its edges do not cross.`);
  }
}

/** Add a history row for each frame whose price differs from that frame's current price. */
async function recordPrices(c, projectId, prices, date, userId) {
  if (!prices.length) return;
  const { rows } = await c.query(
    `SELECT DISTINCT ON (frame) frame, price_min_usd AS min, price_max_usd AS max
       FROM project_prices WHERE project_id = $1
      ORDER BY frame, effective_date DESC, created_at DESC`,
    [projectId],
  );
  const current = Object.fromEntries(rows.map((r) => [r.frame, r]));
  for (const p of prices) {
    const cur = current[p.frame];
    if (cur && Number(cur.min) === p.min && (cur.max == null ? null : Number(cur.max)) === p.max) continue;
    await c.query(
      `INSERT INTO project_prices (project_id, frame, price_min_usd, price_max_usd, effective_date, created_by)
       VALUES ($1, $2, $3, $4, COALESCE($5::date, current_date), $6)`,
      [projectId, p.frame, p.min, p.max, date, userId],
    );
  }
}

export const projectsRouter = express.Router();

projectsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`${SELECT} ORDER BY p.created_at DESC`);
    res.json(rows);
  }),
);

projectsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getProject(idParam(req)));
  }),
);

projectsRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const d = projectSchema.parse(req.body);
    await checkArea(d.area);
    const id = await tx(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO projects (name, developer, architect, construction_stage, handover_date,
                               latitude, longitude, description, area_geom, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${AREA_SQL('$9')}, $10) RETURNING id`,
        [d.name, d.developer, d.architect, d.construction_stage, d.handover_date,
         d.latitude, d.longitude, d.description, d.area ? JSON.stringify(d.area) : null, req.user.id],
      );
      await recordPrices(c, rows[0].id, d.prices, d.price_date, req.user.id);
      return rows[0].id;
    });
    res.status(201).json(await getProject(id));
  }),
);

projectsRouter.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam(req);
    const d = projectSchema.parse(req.body);
    await checkArea(d.area);
    await tx(async (c) => {
      const { rowCount } = await c.query(
        `UPDATE projects SET name = $2, developer = $3, architect = $4, construction_stage = $5,
                handover_date = $6, latitude = $7, longitude = $8, description = $9, area_geom = ${AREA_SQL('$10')}
         WHERE id = $1`,
        [id, d.name, d.developer, d.architect, d.construction_stage, d.handover_date,
         d.latitude, d.longitude, d.description, d.area ? JSON.stringify(d.area) : null],
      );
      if (!rowCount) throw httpError(404, 'Project not found.');
      await recordPrices(c, id, d.prices, d.price_date, req.user.id);
    });
    res.json(await getProject(id));
  }),
);

projectsRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam(req);
    const keys = await tx(async (c) => {
      const photos = await c.query('SELECT storage_key FROM photos WHERE project_id = $1', [id]);
      const del = await c.query('DELETE FROM projects WHERE id = $1', [id]);
      if (!del.rowCount) throw httpError(404, 'Project not found.');
      return photos.rows.map((r) => r.storage_key);
    });
    await removeQuietly(keys);
    res.status(204).end();
  }),
);

/** Remove one price-history entry (for correcting a mistake). */
projectsRouter.delete(
  '/:id/prices/:priceId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam(req);
    const priceId = idParam(req, 'priceId');
    const { rowCount } = await query('DELETE FROM project_prices WHERE id = $1 AND project_id = $2', [priceId, id]);
    if (!rowCount) throw httpError(404, 'Price entry not found.');
    res.json(await getProject(id));
  }),
);

/** Upload or replace the project's photograph (one photo per project). */
projectsRouter.post(
  '/:id/photo',
  requireAdmin,
  upload.single('photo'),
  asyncHandler(async (req, res) => {
    const id = idParam(req);
    if (!req.file) throw httpError(400, 'Choose a photo to upload.');
    const oldKeys = await tx(async (c) => {
      const exists = await c.query('SELECT 1 FROM projects WHERE id = $1 FOR UPDATE', [id]);
      if (!exists.rowCount) throw httpError(404, 'Project not found.');
      const { id: newId } = await storePhoto(c, req.file, { projectId: id });
      const old = await c.query('DELETE FROM photos WHERE project_id = $1 AND id <> $2 RETURNING storage_key', [id, newId]);
      return old.rows.map((r) => r.storage_key);
    });
    await removeQuietly(oldKeys);
    res.json(await getProject(id));
  }),
);

projectsRouter.delete(
  '/:id/photo',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam(req);
    const { rows } = await query('DELETE FROM photos WHERE project_id = $1 RETURNING storage_key', [id]);
    await removeQuietly(rows.map((r) => r.storage_key));
    res.json(await getProject(id));
  }),
);
