import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api.ts';
import type { Role, User } from '../lib/types.ts';
import { useAuth, useToast } from '../state/store.tsx';
import { Button, Field, Modal, TextInput, inputClass } from './ui.tsx';

export function LoginDialog({ onClose }: { onClose(): void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Sign in" onClose={onClose} width="max-w-sm">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email">
          <TextInput type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <TextInput type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && <p role="alert" className="text-sm text-signal">{error}</p>}
        <Button variant="primary" type="submit" className="w-full" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="text-xs leading-relaxed text-ink-faint">
          Accounts are created by an administrator. Without signing in you can browse the public map.
        </p>
      </form>
    </Modal>
  );
}

export function UsersDialog({ onClose }: { onClose(): void }) {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer' as Role });
  const [busy, setBusy] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = () => api.listUsers().then(setUsers).catch((e: Error) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setError(null);
    try {
      await fn();
      toast(done);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await run(() => api.createUser(form), `Added ${form.email}`);
    setForm({ name: '', email: '', password: '', role: 'viewer' });
    setBusy(false);
  };

  return (
    <Modal title="Users" onClose={onClose} width="max-w-2xl">
      <p className="mb-3 text-[13px] leading-relaxed text-ink-soft">
        Administrators can add, edit and delete records and manage users. Viewers can see everything, including owner and agent
        contacts, but cannot change anything. Anyone with the public link sees projects and land without contacts.
      </p>
      {error && <p role="alert" className="mb-3 rounded-md bg-signal/10 px-3 py-2 text-sm text-signal">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="text-[12px] text-ink-faint">
            <tr>
              <th className="py-1.5 font-normal">Name</th>
              <th className="py-1.5 font-normal">Email</th>
              <th className="py-1.5 font-normal">Role</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(users ?? []).map((u) => (
              <tr key={u.id} className="align-middle">
                <td className="py-2 pr-2 text-ink">{u.name}{u.id === me?.id && <span className="text-ink-faint"> (you)</span>}</td>
                <td className="py-2 pr-2 text-ink-soft">{u.email}</td>
                <td className="py-2 pr-2">
                  <select
                    className={`${inputClass} h-8 w-auto py-0`}
                    value={u.role}
                    aria-label={`Role for ${u.name}`}
                    onChange={(e) => run(() => api.updateUser(u.id, { role: e.target.value as Role }), `${u.name} is now ${e.target.value === 'admin' ? 'an administrator' : 'a viewer'}`)}
                  >
                    <option value="admin">Administrator</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </td>
                <td className="whitespace-nowrap py-2 text-right">
                  {resetFor === u.id ? (
                    <span className="inline-flex gap-1">
                      <input className={`${inputClass} h-8 w-36 py-0`} type="password" placeholder="New password" aria-label="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                      <Button size="sm" variant="primary" disabled={newPassword.length < 10} onClick={() => run(() => api.updateUser(u.id, { password: newPassword }), `Password changed for ${u.name}`).then(() => { setResetFor(null); setNewPassword(''); })}>Set</Button>
                      <Button size="sm" variant="ghost" onClick={() => setResetFor(null)}>Cancel</Button>
                    </span>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => { setResetFor(u.id); setNewPassword(''); }}>Reset password</Button>
                      {u.id !== me?.id && (
                        <Button size="sm" variant="ghost" className="text-signal" onClick={() => window.confirm(`Delete the account for ${u.name}? They will be signed out immediately.`) && run(() => api.deleteUser(u.id), `Deleted ${u.name}`)}>
                          Delete
                        </Button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users === null && !error && <p className="py-3 text-sm text-ink-faint">Loading users…</p>}
      </div>

      <form onSubmit={create} className="mt-5 rounded-md border border-line p-3">
        <h3 className="mb-2 text-[13px] font-semibold text-ink">Add a user</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Email"><TextInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
          <Field label="Password" hint="At least 10 characters. Share it privately.">
            <TextInput type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={10} />
          </Field>
          <Field label="Role">
            <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="viewer">Viewer</option>
              <option value="admin">Administrator</option>
            </select>
          </Field>
        </div>
        <Button variant="primary" type="submit" className="mt-3" disabled={busy || form.password.length < 10 || !form.name || !form.email}>
          {busy ? 'Adding…' : 'Add user'}
        </Button>
      </form>
    </Modal>
  );
}
