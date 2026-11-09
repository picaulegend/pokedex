import { json, readBody } from './api.js';
import { emailAddress, HttpError, randomToken, tokenHash } from './auth.js';

const inviteLifetime = 48 * 60 * 60;
const inviteToken = /^[A-Za-z0-9_-]{43}$/;

function inviteCookie(secure) {
  return secure ? '__Host-carddex-invitation' : 'carddex-invitation';
}

const available = `token_hash=? AND expires_at>unixepoch() AND claimed_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM users WHERE email=auth_invitations.email)`;

export async function createInvitation(request, db, origin) {
  const body = await readBody(request);
  const email = emailAddress(body?.email);
  if (!email || email.length > 254) throw new HttpError(400, 'Enter an email address.');
  const token = randomToken();
  const expires = Math.floor(Date.now() / 1000) + inviteLifetime;
  const result = await db
    .prepare(
      `INSERT INTO auth_invitations (user_id,email,token_hash,expires_at)
       SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM users WHERE email=?)`,
    )
    .bind(crypto.randomUUID(), email, await tokenHash(token), expires, email)
    .run();
  if (result.meta.changes !== 1) throw new HttpError(409, 'This email already has an account.');
  return json({ url: `${origin}/invite#${token}` }, 201);
}

export async function openInvitation(request, db, secure) {
  const body = await readBody(request);
  const token = body?.token;
  const invite =
    typeof token === 'string' &&
    inviteToken.test(token) &&
    (await db
      .prepare(`SELECT 1 FROM auth_invitations WHERE ${available}`)
      .bind(await tokenHash(token))
      .first());
  if (!invite) throw new HttpError(404, 'This invite link is invalid, expired, or used.');
  const response = json({ ready: true });
  response.headers.append(
    'Set-Cookie',
    `${inviteCookie(secure)}=${token}; Max-Age=600; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`,
  );
  return response;
}

export async function invitedUser(db, ctx, secure, user, credentialId) {
  const token = ctx.getCookie(inviteCookie(secure));
  if (!inviteToken.test(token || '')) return null;
  const hash = await tokenHash(token);
  if (!user)
    return db
      .prepare(`SELECT user_id AS id,email FROM auth_invitations WHERE ${available}`)
      .bind(hash)
      .first();

  return db
    .prepare(
      `INSERT INTO auth_invitation_credentials (credential_id,user_id)
       SELECT ?,user_id FROM auth_invitations WHERE user_id=? AND ${available}
       RETURNING user_id`,
    )
    .bind(credentialId, user.id, hash)
    .first();
}
