const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

export const sha256 = (value) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));

export const randomToken = () =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');

export const tokenHash = async (value) => Buffer.from(await sha256(value)).toString('hex');

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function emailAddress(value) {
  if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return null;
  return value.trim().toLowerCase();
}

export async function localUser(request, env) {
  if (env.LOCAL_DEV_AUTH !== 'true' || !localHosts.has(new URL(request.url).hostname)) return null;
  const admin = emailAddress(env.ADMIN_EMAIL);
  if (!admin) throw new HttpError(503, 'Account setup is incomplete.');
  const email = emailAddress(request.headers.get('X-Carddex-Dev-Email') || admin);
  const invited = (env.INVITED_EMAILS || '').split(',').map(emailAddress);
  if (!email || (email !== admin && !invited.includes(email)))
    throw new HttpError(403, 'This account has not been invited.');

  return {
    id: await tokenHash(`local-development\nlocal:${email}`),
    email,
    role: email === admin ? 'admin' : 'member',
    development: true,
  };
}
