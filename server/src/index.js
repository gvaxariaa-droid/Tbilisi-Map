import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { ZodError } from 'zod';
import { config } from './config.js';
import { pool, query } from './db.js';
import { migrate } from './migrate.js';
import { HttpError } from './http.js';
import { authRouter, bootstrapAdmin, csrfGuard, loadUser } from './auth.js';
import { projectsRouter } from './routes/projects.js';
import { landRouter } from './routes/land.js';
import { photosRouter } from './routes/photos.js';
import { statsRouter } from './routes/stats.js';
import { usersRouter } from './routes/users.js';
import { storage } from './storage.js';

const app = express();
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'blob:', ...config.tileOrigins],
        'connect-src': ["'self'", ...config.tileOrigins],
        'worker-src': ["'self'", 'blob:'],
        'child-src': ['blob:'],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': config.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    // Tile servers (OpenStreetMap in particular) refuse requests that carry no Referer.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const api = express.Router();
api.use(csrfGuard);
api.use(loadUser);
api.get('/health', async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true, storage: storage.name });
});
api.use('/auth', authRouter);
api.use('/projects', projectsRouter);
api.use('/land', landRouter);
api.use('/photos', photosRouter);
api.use('/stats', statsRouter);
api.use('/users', usersRouter);
api.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, api);

// Serve the built React app (single-page app fallback).
if (fs.existsSync(path.join(config.clientDist, 'index.html'))) {
  app.use('/assets', express.static(path.join(config.clientDist, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(config.clientDist, 'index.html'));
  });
} else {
  console.warn(`[server] No client build at ${config.clientDist}. Run "npm run build" in client/, or use the Vite dev server.`);
}

// Error handler: never leak internals to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path?.join('.') || 'input';
    return res.status(400).json({ error: `${field}: ${first?.message || 'invalid value'}`, details: err.issues });
  }
  if (err instanceof multer.MulterError) {
    const msg =
      err.code === 'LIMIT_FILE_SIZE'
        ? `Each photo must be smaller than ${Math.round(config.maxUploadBytes / 1048576)} MB.`
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Too many files, or an unexpected file field.'
          : `Upload rejected (${err.code}).`;
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: msg });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
  if (err?.code === '23514') return res.status(400).json({ error: 'A value is outside the allowed range.' });
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: 'Something went wrong on the server. The error has been logged.' });
});

async function start() {
  if (config.migrateOnStart) await migrate();
  await bootstrapAdmin();
  const server = app.listen(config.port, () => {
    console.log(`[server] Tbilisi Property Map listening on :${config.port} (storage: ${storage.name})`);
  });
  const shutdown = () => {
    server.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
