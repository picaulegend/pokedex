import { timingSafeEqual } from 'node:crypto';
import { emailAddress, HttpError, randomToken, sha256, tokenHash } from './auth.js';
import { readBody, json } from './api.js';

const lifetime = 600;

function setupCookie(secure) {
  return secure ? '__Host-carddex-owner-setup' : 'carddex-owner-setup';
}

export async function beginOwnerSetup(request, env, secure) {
  const email = emailAddress(env.ADMIN_EMAIL);
  const secret = env.OWNER_SETUP_TOKEN;
  if (!email || !secret || secret.length < 32)
    throw new HttpError(404, 'Owner setup is unavailable.');
  const body = await readBody(request);
  if (
    typeof body?.token !== 'string' ||
    !timingSafeEqual(await sha256(body.token), await sha256(secret))
  )
    throw new HttpError(403, 'The setup code is incorrect.');

  const now = new Date();
  const ticket = randomToken();
  const [, result] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id,email,role,created_at,updated_at)
       SELECT ?,?,'admin',?,? WHERE NOT EXISTS (SELECT 1 FROM users)`,
    ).bind(crypto.randomUUID(), email, now.toISOString(), now.toISOString()),
    env.DB.prepare(
      `INSERT INTO auth_owner_setup (user_id,token_hash,expires_at)
       SELECT id,?,? FROM users
       WHERE email=? AND role='admin'
         AND (SELECT COUNT(*) FROM users WHERE email=?)=1
         AND NOT EXISTS (SELECT 1 FROM passkey WHERE userId=users.id)
       ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,
         expires_at=excluded.expires_at, used=0
       WHERE auth_owner_setup.used=0 OR auth_owner_setup.expires_at<=?`,
    ).bind(await tokenHash(ticket), now.getTime() + lifetime * 1000, email, email, now.getTime()),
  ]);
  if (result.meta.changes !== 1)
    throw new HttpError(409, 'Owner setup is unavailable. If you added a passkey, sign in.');

  const response = json({ ready: true });
  response.headers.append(
    'Set-Cookie',
    `${setupCookie(secure)}=${ticket}; Max-Age=${lifetime}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`,
  );
  return response;
}

export async function ownerGrant(db, ctx, secure, userId) {
  const ticket = ctx.getCookie(setupCookie(secure));
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket || '')) return null;
  const key = await tokenHash(ticket);
  const now = Date.now();
  const unused = `token_hash=? AND expires_at>? AND used=0
    AND NOT EXISTS (SELECT 1 FROM passkey WHERE userId=auth_owner_setup.user_id)`;
  if (userId)
    return db
      .prepare(`UPDATE auth_owner_setup SET used=1 WHERE user_id=? AND ${unused} RETURNING user_id`)
      .bind(userId, key, now)
      .first();

  return db
    .prepare(
      `SELECT users.id,users.email FROM auth_owner_setup
     JOIN users ON users.id=auth_owner_setup.user_id WHERE ${unused}`,
    )
    .bind(key, now)
    .first();
}
