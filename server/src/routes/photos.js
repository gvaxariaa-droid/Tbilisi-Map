import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { asyncHandler, httpError, idParam } from '../http.js';
import { detectImageType } from '../images.js';
import { storage, removeQuietly } from '../storage.js';
import { requireAdmin } from '../auth.js';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 12, fields: 0 },
});

/**
 * Validate and store one uploaded image, then insert its photos row using `client`.
 * If the database insert fails, the stored object is removed again.
 */
export async function storePhoto(client, file, { projectId = null, landPlotId = null }) {
  const type = detectImageType(file.buffer);
  if (!type) throw httpError(415, `"${file.originalname}" is not a JPEG, PNG or WebP image.`);
  const owner = projectId ? 'projects' : 'land';
  const key = `${owner}/${projectId || landPlotId}/${randomUUID()}.${type.ext}`;
  await storage.put(key, file.buffer, type.contentType);
  try {
    const { rows } = await client.query(
      `INSERT INTO photos (project_id, land_plot_id, storage_key, content_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [projectId, landPlotId, key, type.contentType, file.size],
    );
    return { id: rows[0].id, key };
  } catch (err) {
    await removeQuietly([key]);
    throw err;
  }
}

/** Store several photos atomically: either all rows commit, or none and their files are removed. */
export async function storePhotos(files, owner) {
  const stored = [];
  try {
    return await tx(async (client) => {
      for (const f of files) stored.push(await storePhoto(client, f, owner));
      return stored;
    });
  } catch (err) {
    await removeQuietly(stored.map((s) => s.key));
    throw err;
  }
}

export const photosRouter = express.Router();

// Public: photos are shown on public property cards.
photosRouter.get(
  '/:id/file',
  asyncHandler(async (req, res) => {
    const id = idParam(req);
    const { rows } = await query('SELECT storage_key, content_type FROM photos WHERE id = $1', [id]);
    if (!rows[0]) throw httpError(404, 'Photo not found.');
    let stream;
    try {
      stream = await storage.get(rows[0].storage_key);
    } catch {
      throw httpError(404, 'Photo file is missing from storage.');
    }
    res.set({
      'Content-Type': rows[0].content_type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    });
    stream.on('error', (err) => {
      console.error('[photos] stream error', err.message);
      if (!res.headersSent) res.status(500);
      res.end();
    });
    stream.pipe(res);
  }),
);

photosRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam(req);
    const { rows } = await query('DELETE FROM photos WHERE id = $1 RETURNING storage_key', [id]);
    if (!rows[0]) throw httpError(404, 'Photo not found.');
    await removeQuietly([rows[0].storage_key]);
    res.status(204).end();
  }),
);
