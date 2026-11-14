import express from 'express';
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { asyncHandler, httpError, idParam, round2 } from '../http.js';
import { landSchema, reconcilePrices } from '../validation.js';
import { requireAdmin } from '../auth.js';
import { removeQuietly } from '../storage.js';
import { upload, storePhotos } from './photos.js';

/**
 * Owner and agent contacts are business-sensitive: they are only selected
 * for signed-in users (admins and viewers), never for anonymous visitors.
 */
function selectSql(includeContacts) {
  return `
    SELECT l.id, l.name,
           ST_AsGeoJSON(l.geom, 8)::json AS geometry,
           l.area_m2, l.area_is_manual,
           round(ST_Area(l.geom::geography)::numeric, 2) AS computed_area_m2,
           l.total_price_usd, l.price_per_m2_usd, l.k2_coefficient, l.color, l.cadastral_code, l.deal_status, l.seen_status,
           ${includeContacts ? 'l.owner_name, l.owner_phone, l.agent_name, l.agent_phone,' : ''}
           l.notes, l.created_at, l.updated_at,
           COALESCE((SELECT json_agg(ph.id ORDER BY ph.created_at)
                       FROM photos ph WHERE ph.land_plot_id = l.id), '[]'::json) AS photo_ids
    FROM land_plots l`;
}

async function getLand(id, includeContacts) {
  const { rows } = await query(`${selectSql(includeContacts)} WHERE l.id = $1`, [id]);
  if (!rows[0]) throw httpError(404, 'Land plot not found.');
  return rows[0];
}

/** Validate the drawn polygon with PostGIS and measure it on the WGS84 ellipsoid. */
async function analysePolygon(geometry) {
  const { rows } = await query(
    `SELECT ST_IsValid(g) AS valid, ST_IsValidReason(g) AS reason, ST_Area(g::geography) AS area
       FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326) AS g) s`,
    [JSON.stringify(geometry)],
  );
  const r = rows[0];
  if (!r.valid) {
    throw httpError(400, `The land boundary is not a valid shape (${r.reason}). Make sure its edges do not cross each other.`);
  }
  if (!(r.area >= 1)) throw httpError(400, 'The land boundary is too small. Draw at least 1 m².');
  return { area: round2(r.area) };
}

async function prepare(body) {
  const d = landSchema.parse(body);
  const { area: computed } = await analysePolygon(d.geometry);
  const area = d.area_is_manual ? round2(d.area_m2) : computed;
  const { total, perM2 } = reconcilePrices(area, d.total_price_usd, d.price_per_m2_usd);
  return { ...d, area, total, perM2 };
}

const GEOM_SQL = 'ST_ForcePolygonCCW(ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326))';

export const landRouter = express.Router();

landRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`${selectSql(!!req.user)} ORDER BY l.created_at DESC`);
    res.json(rows);
  }),
);

landRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getLand(idParam(req), !!req.user));
  }),
);

landRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const d = await prepare(req.body);
    const { rows } = await query(
      `INSERT INTO land_plots (name, geom, area_m2, area_is_manual, total_price_usd, price_per_m2_usd,
                               k2_coefficient, owner_name, owner_phone, agent_name, agent_phone, notes, created_by,
                               color, cadastral_code, deal_status, seen_status)
       VALUES ($1, ${GEOM_SQL}, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
      [d.name, JSON.stringify(d.geometry), d.area, d.area_is_manual, d.total, d.perM2, d.k2_coefficient,
       d.owner_name, d.owner_phone, d.agent_name, d.agent_phone, d.notes, req.user.id, d.color, d.cadastral_code,
       d.deal_status, d.seen_status],
    );
    res.status(201).json(await getLand(rows[0].id, true));
  }),
);

landRouter.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam(req);
    const d = await prepare(req.body);
    const { rowCount } = await query(
      `UPDATE land_plots SET name = $1, geom = ${GEOM_SQL}, area_m2 = $3, area_is_manual = $4,
              total_price_usd = $5, price_per_m2_usd = $6, k2_coefficient = $7, owner_name = $8,
              owner_phone = $9, agent_name = $10, agent_phone = $11, notes = $12, color = $14, cadastral_code = $15,
              deal_status = $16, seen_status = $17
       WHERE id = $13`,
      [d.name, JSON.stringify(d.geometry), d.area, d.area_is_manual, d.total, d.perM2, d.k2_coefficient,
       d.owner_name, d.owner_phone, d.agent_name, d.agent_phone, d.notes, id, d.color, d.cadastral_code,
       d.deal_status, d.seen_status],
    );
    if (!rowCount) throw httpError(404, 'Land plot not found.');
    res.json(await getLand(id, true));
  }),
);

landRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam(req);
    const keys = await tx(async (c) => {
      const photos = await c.query('SELECT storage_key FROM photos WHERE land_plot_id = $1', [id]);
      const del = await c.query('DELETE FROM land_plots WHERE id = $1', [id]);
      if (!del.rowCount) throw httpError(404, 'Land plot not found.');
      return photos.rows.map((r) => r.storage_key);
    });
    await removeQuietly(keys);
    res.status(204).end();
  }),
);

landRouter.post(
  '/:id/photos',
  requireAdmin,
  upload.array('photos', 12),
  asyncHandler(async (req, res) => {
    const id = idParam(req);
    const files = req.files || [];
    if (!files.length) throw httpError(400, 'Choose at least one photo to upload.');
    const { rows } = await query(
      `SELECT (SELECT count(*)::int FROM photos WHERE land_plot_id = $1) AS n,
              EXISTS (SELECT 1 FROM land_plots WHERE id = $1) AS exists`,
      [id],
    );
    if (!rows[0].exists) throw httpError(404, 'Land plot not found.');
    if (rows[0].n + files.length > config.maxPhotosPerLand) {
      throw httpError(400, `A land plot can have at most ${config.maxPhotosPerLand} photos.`);
    }
    await storePhotos(files, { landPlotId: id });
    res.json(await getLand(id, true));
  }),
);
