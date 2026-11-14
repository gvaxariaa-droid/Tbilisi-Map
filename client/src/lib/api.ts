import type { LandInput, LandPlot, Project, ProjectInput, Role, Stats, User } from './types.ts';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'tpm' };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method: opts.method ?? 'GET', headers, body, credentials: 'same-origin' });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error ?? `The server answered with status ${res.status}.`, res.status);
  return data as T;
}

const one = (file: File, field: string) => {
  const fd = new FormData();
  fd.append(field, file);
  return fd;
};

export const photoUrl = (id: string) => `/api/photos/${id}/file`;

export const api = {
  me: () => request<{ user: User | null }>('/auth/me'),
  login: (email: string, password: string) =>
    request<{ user: User }>('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  listProjects: () => request<Project[]>('/projects'),
  createProject: (p: ProjectInput) => request<Project>('/projects', { method: 'POST', body: p }),
  updateProject: (id: string, p: ProjectInput) => request<Project>(`/projects/${id}`, { method: 'PUT', body: p }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  uploadProjectPhoto: (id: string, file: File) =>
    request<Project>(`/projects/${id}/photo`, { method: 'POST', form: one(file, 'photo') }),
  deleteProjectPhoto: (id: string) => request<Project>(`/projects/${id}/photo`, { method: 'DELETE' }),
  deleteProjectPrice: (id: string, priceId: string) =>
    request<Project>(`/projects/${id}/prices/${priceId}`, { method: 'DELETE' }),

  listLand: () => request<LandPlot[]>('/land'),
  createLand: (l: LandInput) => request<LandPlot>('/land', { method: 'POST', body: l }),
  updateLand: (id: string, l: LandInput) => request<LandPlot>(`/land/${id}`, { method: 'PUT', body: l }),
  deleteLand: (id: string) => request<void>(`/land/${id}`, { method: 'DELETE' }),
  uploadLandPhotos: (id: string, files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('photos', f));
    return request<LandPlot>(`/land/${id}/photos`, { method: 'POST', form: fd });
  },
  getLand: (id: string) => request<LandPlot>(`/land/${id}`),
  deletePhoto: (id: string) => request<void>(`/photos/${id}`, { method: 'DELETE' }),

  stats: () => request<Stats>('/stats'),

  listUsers: () => request<User[]>('/users'),
  createUser: (u: { name: string; email: string; password: string; role: Role }) =>
    request<User>('/users', { method: 'POST', body: u }),
  updateUser: (id: string, u: { name?: string; role?: Role; password?: string }) =>
    request<User>(`/users/${id}`, { method: 'PATCH', body: u }),
  deleteUser: (id: string) => request<void>(`/users/${id}`, { method: 'DELETE' }),
};

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Client-side pre-check; the server re-validates by file signature. */
export function checkPhoto(file: File): string | null {
  if (!PHOTO_TYPES.includes(file.type)) return `${file.name}: use a JPEG, PNG or WebP image.`;
  if (file.size > MAX_PHOTO_BYTES) return `${file.name}: photos must be smaller than 10 MB.`;
  return null;
}
