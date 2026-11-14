export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const httpError = (status, message, details) => new HttpError(status, message, details);

/** Wrap an async route handler so rejections reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

/** Throws 404 when the route param is not a UUID (avoids Postgres cast errors). */
export function idParam(req, name = 'id') {
  const id = req.params[name];
  if (!isUuid(id)) throw httpError(404, 'Record not found.');
  return id;
}

export const round2 = (n) => Math.round(n * 100) / 100;
