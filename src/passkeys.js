import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from 'better-auth/api';
import { HttpError } from './auth.js';
import { createInvitation, invitedUser, openInvitation } from './invitations.js';
import { beginOwnerSetup, ownerGrant } from './owner-setup.js';

const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
const endpoints = new Map([
  ['/api/owner/setup', 'POST'],
  ['/api/invitations', 'POST'],
  ['/api/invitations/open', 'POST'],
  ['/api/auth/sign-out', 'POST'],
  ['/api/auth/passkey/generate-register-options', 'GET'],
  ['/api/auth/passkey/verify-registration', 'POST'],
  ['/api/auth/passkey/generate-authenticate-options', 'GET'],
  ['/api/auth/passkey/verify-authentication', 'POST'],
  ['/api/auth/passkey/list-user-passkeys', 'GET'],
  ['/api/auth/passkey/delete-passkey', 'POST'],
]);

function config(request, env) {
  const url = new URL(request.url);
  const secure = url.protocol === 'https:';
  if (
    url.origin !== env.PASSKEY_ORIGIN ||
    (!secure && !loopback.has(url.hostname)) ||
    !env.BETTER_AUTH_SECRET ||
    env.BETTER_AUTH_SECRET.length < 32
  ) {
    throw new HttpError(503, 'Passkey setup is incomplete.');
  }
  return { url, secure };
}

function createAuth(env, url, secure) {
  return betterAuth({
    appName: 'Carddex',
    baseURL: url.origin,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    user: {
      modelName: 'users',
      fields: { createdAt: 'created_at', updatedAt: 'updated_at' },
      additionalFields: { role: { type: 'string', input: false } },
    },
    account: { modelName: 'auth_accounts' },
    session: { modelName: 'auth_sessions' },
    verification: { modelName: 'auth_verifications' },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ctx.path === '/passkey/generate-register-options' &&
          ctx.query?.context &&
          (await getAuthoritativeSessionFromCtx(ctx))
        )
          throw new APIError('BAD_REQUEST', {
            message: 'Sign out before setting up a new account.',
          });
        if (ctx.path === '/passkey/delete-passkey') {
          const session = await getAuthoritativeSessionFromCtx(ctx);
          if (
            session &&
            !(await env.DB.prepare('SELECT 1 FROM passkey WHERE userId=? AND id<>? LIMIT 1')
              .bind(session.user.id, ctx.body.id)
              .first())
          ) {
            throw new APIError('BAD_REQUEST', {
              message: 'Add another passkey before removing this one.',
            });
          }
          return;
        }
        if (
          ctx.path !== '/passkey/verify-registration' &&
          ctx.path !== '/passkey/generate-register-options'
        )
          return;
        if ((ctx.body?.name?.length || ctx.query?.name?.length || 0) > 100)
          throw new APIError('BAD_REQUEST', { message: 'Use a name with at most 100 characters.' });
      }),
    },
    plugins: [
      passkey({
        rpID: url.hostname,
        rpName: 'Carddex',
        origin: url.origin,
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        registration: {
          requireSession: false,
          async resolveUser({ ctx, context }) {
            if (context === 'invitation') {
              const member = await invitedUser(env.DB, ctx, secure);
              if (!member)
                throw new APIError('FORBIDDEN', { message: 'Open the invite link again.' });
              return { id: member.id, name: member.email };
            }
            const owner = context === 'owner-setup' && (await ownerGrant(env.DB, ctx, secure));
            if (!owner) throw new APIError('FORBIDDEN', { message: 'Start owner setup again.' });
            return { id: owner.id, name: owner.email };
          },
          async afterVerification({ ctx, context, user, verification }) {
            if (context == null) return;
            if (context === 'invitation') {
              const credentialId = verification.registrationInfo.credential.id;
              if (!(await invitedUser(env.DB, ctx, secure, user, credentialId)))
                throw new APIError('FORBIDDEN', {
                  message: 'This invite link is no longer available.',
                });
              return;
            }
            if (context !== 'owner-setup' || !(await ownerGrant(env.DB, ctx, secure, user.id)))
              throw new APIError('FORBIDDEN', { message: 'Start owner setup again.' });
          },
        },
      }),
    ],
  });
}

export async function passkeyUser(request, env) {
  const { url, secure } = config(request, env);
  if (!request.headers.has('Cookie')) throw new HttpError(401, 'Sign in to continue.');
  const { user } = (await readSession(request, createAuth(env, url, secure))) || {};
  if (!user) throw new HttpError(401, 'Sign in to continue.');
  return { id: user.id, email: user.email, role: user.role, development: false };
}

function readSession(request, auth) {
  return auth.api.getSession({ headers: request.headers, query: { disableRefresh: true } });
}

export async function passkeyRequest(request, env, path) {
  const { url, secure } = config(request, env);
  const method = endpoints.get(path);
  if (!method) throw new HttpError(404, 'This page was not found.');
  if (request.method !== method) throw new HttpError(405, 'This method is not supported.');
  if (
    request.headers.get('Sec-Fetch-Site') === 'cross-site' ||
    (method === 'POST' && request.headers.get('Origin') !== url.origin)
  )
    throw new HttpError(403, 'Use the app to change your account.');
  if (path === '/api/owner/setup') return beginOwnerSetup(request, env, secure);
  const auth = createAuth(env, url, secure);
  if (path === '/api/invitations') {
    const session = await readSession(request, auth);
    if (!session) throw new HttpError(401, 'Sign in to continue.');
    if (session.user.role !== 'admin')
      throw new HttpError(403, 'Only the owner can create an invite link.');
    return createInvitation(request, env.DB, url.origin);
  }
  if (path === '/api/invitations/open') {
    if (request.headers.has('Cookie') && (await readSession(request, auth)))
      throw new HttpError(409, 'Sign out or open this link in a private window.');
    return openInvitation(request, env.DB, secure);
  }
  const response = await auth.handler(request);
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status: response.status, headers });
}
