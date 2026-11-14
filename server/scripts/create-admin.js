// Create an administrator, or reset an existing user's password and make them admin.
// Usage:  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='long-password' ADMIN_NAME='Your Name' npm run create-admin
import { pool, query } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { hashPassword } from '../src/auth.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME || 'Administrator';

if (!email || !password) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (and optionally ADMIN_NAME).');
  process.exit(1);
}
if (password.length < 10) {
  console.error('ADMIN_PASSWORD must be at least 10 characters.');
  process.exit(1);
}

await migrate();
const hash = await hashPassword(password);
const { rows } = await query(
  `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')
   ON CONFLICT (lower(email)) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'
   RETURNING id, (xmax = 0) AS created`,
  [name, email, hash],
);
console.log(rows[0].created ? `Created administrator ${email}.` : `Updated ${email}: password reset, role set to admin.`);
await pool.end();
