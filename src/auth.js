import { createRemoteJWKSet, jwtVerify } from 'jose';

const keySets = new Map();
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

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

export async function verifyAccessToken(token, issuer, audience, keys) {
  const { payload } = await jwtVerify(token, keys, {
    issuer,
    audience,
    algorithms: ['RS256'],
    requiredClaims: ['sub', 'email', 'exp', 'iat'],
  });
  const email = emailAddress(payload.email);
  if (!email || typeof payload.sub !== 'string' || !payload.sub)
    throw new Error('Invalid identity');
  return { subject: payload.sub, email, issuer };
}

export async function authenticate(request, env) {
  const admin = emailAddress(env.ADMIN_EMAIL);
  if (!admin) throw new HttpError(503, 'Account setup is incomplete.');
  let identity;
  if (env.LOCAL_DEV_AUTH === 'true' && localHosts.has(new URL(request.url).hostname)) {
    const email = emailAddress(request.headers.get('X-Carddex-Dev-Email') || admin);
    if (!email) throw new HttpError(401, 'Sign in to continue.');
    identity = { subject: `local:${email}`, email, issuer: 'local-development' };
  } else {
    const issuer = env.ACCESS_TEAM_DOMAIN;
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer || '') || !env.ACCESS_AUD) {
      throw new HttpError(503, 'Cloud sign-in setup is incomplete.');
    }
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token) throw new HttpError(401, 'Sign in to continue.');
    if (!keySets.has(issuer))
      keySets.set(issuer, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)));
    try {
      identity = await verifyAccessToken(token, issuer, env.ACCESS_AUD, keySets.get(issuer));
    } catch {
      throw new HttpError(401, 'Sign in to continue.');
    }
  }
  const invited = new Set([
    admin,
    ...(env.INVITED_EMAILS || '').split(',').map(emailAddress).filter(Boolean),
  ]);
  if (!invited.has(identity.email)) throw new HttpError(403, 'This account has not been invited.');
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${identity.issuer}\n${identity.subject}`),
  );
  const id = Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, '0')).join('');
  return {
    id,
    email: identity.email,
    role: identity.email === admin ? 'admin' : 'member',
    development: identity.issuer === 'local-development',
  };
}
