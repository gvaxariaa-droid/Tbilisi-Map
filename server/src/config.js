import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  return value;
}

function list(value) {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(process.env.PORT || 8080),
  // Number of reverse proxies in front of the app (Render/Railway/Fly = 1).
  trustProxy: Number(process.env.TRUST_PROXY ?? (isProd ? 1 : 0)),

  databaseUrl: required('DATABASE_URL'),
  // "true" enables TLS to the database (needed for most external connection strings).
  databaseSsl: process.env.DATABASE_SSL === 'true',
  // "true" also verifies the server certificate (recommended when your provider supports it).
  databaseSslStrict: process.env.DATABASE_SSL_STRICT === 'true',
  migrateOnStart: process.env.MIGRATE_ON_START !== 'false',

  jwtSecret: required('JWT_SECRET'),
  sessionDays: Number(process.env.SESSION_DAYS || 7),

  storageDriver: process.env.STORAGE_DRIVER || 'local', // 'local' | 's3'
  uploadDir: path.resolve(process.env.UPLOAD_DIR || path.join(here, '../uploads')),
  s3: {
    bucket: process.env.S3_BUCKET,
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined, // e.g. Cloudflare R2 endpoint
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  },
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024,
  maxPhotosPerLand: Number(process.env.MAX_PHOTOS_PER_LAND || 30),

  // Origins the browser may load map tiles from (must match the client's VITE_*_TILE_URL settings).
  tileOrigins: list(
    process.env.TILE_ORIGINS ||
      'https://tile.openstreetmap.org,https://server.arcgisonline.com,https://services.arcgisonline.com',
  ),

  clientDist: path.resolve(process.env.CLIENT_DIST || path.join(here, '../../client/dist')),

  bootstrapAdmin: {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    name: process.env.ADMIN_NAME || 'Administrator',
  },
};

if (config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters. Generate one with: openssl rand -hex 32');
}
if (config.storageDriver === 's3') {
  for (const key of ['bucket', 'accessKeyId', 'secretAccessKey']) {
    if (!config.s3[key]) throw new Error(`STORAGE_DRIVER=s3 requires S3_${key.replace(/[A-Z]/g, (c) => '_' + c).toUpperCase()}`);
  }
}
