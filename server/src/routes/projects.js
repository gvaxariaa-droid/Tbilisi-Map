import express from 'express';
import { query, tx } from '../db.js';
import { asyncHandler, httpError, idParam } from '../http.js';
import { projectSchema } from '../validation.js';
import { requireAdmin } from '../auth.js';
import { removeQuietly } from '../storage.js';
import { upload, storePhoto } from './photos.js';

const SELECT = `
  SELECT p.id, p.name, p.developer, p.architect, p.construction_stage,
         p.price_per_m2_usd, p.handover_date, p.latitude, p.longitude,
         p.description, p.created_at, p.updated_at,
         (SELECT ph.id FROM photos ph WHERE ph.project_id = p.id
           ORDER BY ph.created_at DESC LIMIT 1) AS photo_id
  FROM projects p`;

async function getProject(id) {
  const { rows } = await query(`${SELECT} WHERE p.id = $1`, [id]);
  if (!rows[0]) throw httpError(404, 'Project not found.');
  return rows[0];
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
    const { rows } = await query(
      `INSERT INTO projects (name, developer, architect, construction_stage, price_per_m2_usd,
                             handover_date, latitude, longitude, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [d.name, d.developer, d.architect, d.construction_stage, d.price_per_m2_usd,
       d.handover_date, d.latitude, d.longitude, d.description, req.user.id],
    );
    res.status(201).json(await getProject(rows[0].id));
  }),
);

projectsRouter.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam(req);
    const d = projectSchema.parse(req.body);
    const { rowCount } = await query(
      `UPDATE projects SET name = $2, developer = $3, architect = $4, construction_stage = $5,
              price_per_m2_usd = $6, handover_date = $7, latitude = $8, longitude = $9, description = $10
       WHERE id = $1`,
      [id, d.name, d.developer, d.architect, d.construction_stage, d.price_per_m2_usd,
       d.handover_date, d.latitude, d.longitude, d.description],
    );
    if (!rowCount) throw httpError(404, 'Project not found.');
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
