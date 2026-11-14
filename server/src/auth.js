import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { query } from './db.js';
import { asyncHandler, httpError } from './http.js';
import { loginSchema } from './validation.js';

const COOKIE = 'tpm_session';
const BCRYPT_ROUNDS = 12;
// Used to keep login timing constant when the email does not exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', BCRYPT_ROUNDS);

export const hashPassword = (pw) => bcrypt.hash(pw, BCRYPT_ROUNDS);

function setSession(res, user) {
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, {
    expiresIn: `${config.sessionDays}d`,
    algorithm: 'HS256',
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'strict',
    maxAge: config.sessionDays * 86_400_000,
    path: '/',
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE, { httpOnly: true, secure: config.isProd, sameSite: 'strict', path: '/' });
}

/**
 * Attaches req.user when a valid session cookie is present. The user row is
 * re-read on every request so role changes and deletions apply immediately.
 */
export const loadUser = asyncHandler(async (req, res, next) => {
  req.user = null;
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    clearSession(res);
    return next();
  }
  const { rows } = await query('SELECT id, name, email, role FROM users WHERE id = $1', [payload.sub]);
  if (rows[0]) req.user = rows[0];
  else clearSession(res);
  next();
});

export function requireAuth(req, _res, next) {
  if (!req.user) return next(httpError(401, 'Sign in to continue.'));
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(httpError(401, 'Sign in to continue.'));
  if (req.user.role !== 'admin') return next(httpError(403, 'Only administrators can do this.'));
  next();
}

/**
 * CSRF protection for cookie-authenticated API calls: state-changing requests
 * must carry a custom header, which browsers will not send cross-site without
 * a CORS preflight (and this API grants no CORS). SameSite=strict cookies add
 * a second layer.
 */
export function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'tpm') return next(httpError(403, 'Missing request header.'));
  next();
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' },
});

export const authRouter = express.Router();

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Enter your email and password.');
    const { email, password } = parsed.data;
    const { rows } = await query(
      'SELECT id, name, email, role, password_hash FROM users WHERE lower(email) = $1',
      [email],
    );
    const user = rows[0];
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) throw httpError(401, 'Email or password is incorrect.');
    setSession(res, user);
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }),
);

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

authRouter.get('/me', (req, res) => {
  res.json({ user: req.user });
});

/** Create the first admin from ADMIN_EMAIL / ADMIN_PASSWORD when the users table is empty. */
export async function bootstrapAdmin() {
  const { email, password, name } = config.bootstrapAdmin;
  const { rows } = await query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n > 0) return;
  if (!email || !password) {
    console.warn('[auth] No users exist. Set ADMIN_EMAIL and ADMIN_PASSWORD, or run `npm run create-admin`.');
    return;
  }
  if (password.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters.');
  await query('INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)', [
    name,
    email.trim().toLowerCase(),
    await hashPassword(password),
    'admin',
  ]);
  console.log(`[auth] Created initial administrator ${email}. You can now remove ADMIN_PASSWORD from the environment.`);
}
