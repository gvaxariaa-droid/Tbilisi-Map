import express from 'express';
import { query, tx } from '../db.js';
import { asyncHandler, httpError, idParam } from '../http.js';
import { createUserSchema, updateUserSchema } from '../validation.js';
import { requireAdmin, hashPassword } from '../auth.js';

const COLUMNS = 'id, name, email, role, created_at';

export const usersRouter = express.Router();
usersRouter.use(requireAdmin);

usersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`SELECT ${COLUMNS} FROM users ORDER BY created_at`);
    res.json(rows);
  }),
);

usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const d = createUserSchema.parse(req.body);
    try {
      const { rows } = await query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
        [d.name, d.email, await hashPassword(d.password), d.role],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') throw httpError(409, 'A user with this email already exists.');
      throw err;
    }
  }),
);

usersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idParam(req);
    const d = updateUserSchema.parse(req.body);
    const user = await tx(async (c) => {
      // Serialize admin-count checks.
      await c.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
      const cur = await c.query('SELECT role FROM users WHERE id = $1', [id]);
      if (!cur.rows[0]) throw httpError(404, 'User not found.');
      if (d.role === 'viewer' && cur.rows[0].role === 'admin') {
        const admins = await c.query(`SELECT count(*)::int AS n FROM users WHERE role = 'admin'`);
        if (admins.rows[0].n <= 1) throw httpError(400, 'Keep at least one administrator.');
      }
      const hash = d.password ? await hashPassword(d.password) : null;
      const { rows } = await c.query(
        `UPDATE users SET name = COALESCE($2, name), role = COALESCE($3, role),
                password_hash = COALESCE($4, password_hash)
         WHERE id = $1 RETURNING ${COLUMNS}`,
        [id, d.name ?? null, d.role ?? null, hash],
      );
      return rows[0];
    });
    res.json(user);
  }),
);

usersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idParam(req);
    if (id === req.user.id) throw httpError(400, 'You cannot delete your own account.');
    await tx(async (c) => {
      await c.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
      const cur = await c.query('SELECT role FROM users WHERE id = $1', [id]);
      if (!cur.rows[0]) throw httpError(404, 'User not found.');
      if (cur.rows[0].role === 'admin') {
        const admins = await c.query(`SELECT count(*)::int AS n FROM users WHERE role = 'admin'`);
        if (admins.rows[0].n <= 1) throw httpError(400, 'Keep at least one administrator.');
      }
      await c.query('DELETE FROM users WHERE id = $1', [id]);
    });
    res.status(204).end();
  }),
);
