import { localUser, HttpError } from './auth.js';
import { isId, json, progressState as state, readBody } from './api.js';
import { passkeyRequest, passkeyUser } from './passkeys.js';
import { accountPage } from './account-page.js';
import { syncRecords, catalogue, saveRecord } from './records.js';
import { searchCards, previewCard, addCard, resolveSources } from './card-search.js';
import { manageShare, previewShare, publicShare } from './sharing.js';
import { avatars } from './client/avatars.js';
import { saveShowcase } from './showcase.js';
import { checkBadges } from './badges.js';

async function saveProfile(request, env, user) {
  const body = await readBody(request, 256);
  if (!body || Object.keys(body).length !== 1) throw new HttpError(400, 'Send one profile change.');
  if (Object.hasOwn(body, 'avatarId')) {
    const { avatarId } = body;
    if (avatarId !== null && !avatars.some(({ id }) => id === avatarId))
      throw new HttpError(400, 'Choose an available avatar.');
    await env.DB.prepare('UPDATE users SET avatar_id=? WHERE id=? AND avatar_id IS NOT ?')
      .bind(avatarId, user.id, avatarId)
      .run();
    return json({ avatarId });
  }
  const { favoritePokemonId } = body;
  if (
    favoritePokemonId !== null &&
    (!Number.isInteger(favoritePokemonId) || favoritePokemonId < 1 || favoritePokemonId > 1025)
  )
    throw new HttpError(400, 'Choose a valid Pokémon.');
  await env.DB.prepare(
    'UPDATE users SET favorite_pokemon_id=? WHERE id=? AND favorite_pokemon_id IS NOT ?',
  )
    .bind(favoritePokemonId, user.id, favoritePokemonId)
    .run();
  return json({ favoritePokemonId });
}

async function syncChange(request, env, user, pokemonId) {
  const body = await readBody(request);
  if (
    !body ||
    typeof body.owned !== 'boolean' ||
    !Number.isSafeInteger(body.baseRevision) ||
    body.baseRevision < 0 ||
    !isId(body.mutationId) ||
    Object.keys(body).some((key) => !['owned', 'baseRevision', 'mutationId'].includes(key))
  ) {
    throw new HttpError(400, 'Send a valid change.');
  }
  const now = new Date().toISOString();
  const owned = Number(body.owned);
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO pokedex_progress (user_id,pokemon_id,owned,legacy_owned,revision,updated_at)
      SELECT ?,?,?,?,?+1,? WHERE
        NOT EXISTS (SELECT 1 FROM mutation_receipts WHERE user_id=? AND mutation_id=?) AND
        ((?=0 AND NOT EXISTS (SELECT 1 FROM pokedex_progress WHERE user_id=? AND pokemon_id=?)) OR
         EXISTS (SELECT 1 FROM pokedex_progress WHERE user_id=? AND pokemon_id=? AND revision=?))
      ON CONFLICT(user_id,pokemon_id) DO UPDATE SET legacy_owned=excluded.legacy_owned,
        owned=(excluded.legacy_owned OR EXISTS(SELECT 1 FROM inventory i JOIN catalogue_variants v ON v.id=i.variant_id
          JOIN catalogue_card_pokemon p ON p.card_id=v.card_id WHERE i.user_id=excluded.user_id AND i.quantity>0 AND p.pokedex_number=excluded.pokemon_id)),
        revision=excluded.revision,updated_at=excluded.updated_at`,
    ).bind(
      user.id,
      pokemonId,
      owned,
      owned,
      body.baseRevision,
      now,
      user.id,
      body.mutationId,
      body.baseRevision,
      user.id,
      pokemonId,
      user.id,
      pokemonId,
      body.baseRevision,
    ),
    env.DB.prepare(
      `INSERT INTO mutation_receipts
      (user_id,mutation_id,pokemon_id,owned,base_revision,applied_revision,created_at)
      SELECT ?,?,?,?,?,revision,? FROM pokedex_progress WHERE user_id=? AND pokemon_id=? AND revision=?+1 AND legacy_owned=? AND changes()=1
      ON CONFLICT(user_id,mutation_id) DO NOTHING`,
    ).bind(
      user.id,
      body.mutationId,
      pokemonId,
      owned,
      body.baseRevision,
      now,
      user.id,
      pokemonId,
      body.baseRevision,
      owned,
    ),
    env.DB.prepare('SELECT * FROM mutation_receipts WHERE user_id=? AND mutation_id=?').bind(
      user.id,
      body.mutationId,
    ),
    env.DB.prepare('SELECT * FROM pokedex_progress WHERE user_id=? AND pokemon_id=?').bind(
      user.id,
      pokemonId,
    ),
  ]);
  const receipt = results[2].results[0];
  const current = state(results[3].results[0], pokemonId);
  if (
    receipt &&
    (receipt.pokemon_id !== pokemonId ||
      receipt.owned !== owned ||
      receipt.base_revision !== body.baseRevision)
  ) {
    return json(
      { error: 'This change ID was already used.', code: 'mutation_reused', state: current },
      409,
    );
  }
  if (!receipt)
    return json(
      { error: 'This Pokémon changed on another device.', code: 'state_changed', state: current },
      409,
    );
  return json({ state: current, mutationId: body.mutationId });
}

const signInAssets = new Set(['/passkey-ui.js', '/passkeys.css', '/favicon.svg']);
const authenticate = async (request, env) =>
  (await localUser(request, env)) || passkeyUser(request, env);

async function privatePage(request, env, path) {
  if (!['GET', 'HEAD'].includes(request.method))
    throw new HttpError(405, 'This method is not supported.');
  if (['/login', '/setup', '/invite'].includes(path)) {
    const allowSetup =
      new URL(request.url).origin === env.PASSKEY_ORIGIN && Boolean(env.OWNER_SETUP_TOKEN);
    if (path === '/setup' && !allowSetup) throw new HttpError(404, 'Owner setup is unavailable.');
    return accountPage(path, request.method, { allowSetup });
  }
  let user;
  try {
    user = await authenticate(request, env);
  } catch (error) {
    if (error.status !== 401) throw error;
    return new Response(null, {
      status: 302,
      headers: { Location: '/login', 'Cache-Control': 'private, no-store' },
    });
  }
  if (path === '/passkeys')
    return accountPage(path, request.method, {
      canInvite: user.role === 'admin' && !user.development,
    });
  const asset = await env.ASSETS.fetch(request);
  if (!asset.headers.get('Content-Type')?.startsWith('text/html')) return asset;
  const headers = new Headers(asset.headers);
  headers.set('Cache-Control', 'private, no-store');
  return new Response(asset.body, { status: asset.status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/s/')) return publicShare(request, env, url);
    try {
      if (signInAssets.has(url.pathname)) return env.ASSETS.fetch(request);
      if (
        url.pathname.startsWith('/api/auth/') ||
        ['/api/owner/setup', '/api/invitations', '/api/invitations/open'].includes(url.pathname)
      )
        return await passkeyRequest(request, env, url.pathname);
      if (!url.pathname.startsWith('/api/')) return await privatePage(request, env, url.pathname);
      if (!['GET', 'PUT', 'POST'].includes(request.method))
        throw new HttpError(405, 'This method is not supported.');
      const user = await authenticate(request, env);
      const account =
        url.pathname === '/api/shares/preview' && request.method === 'GET'
          ? url.searchParams.get('account')
          : request.headers.get('X-Carddex-Account');
      if (url.pathname !== '/api/session' && account !== user.id) {
        return json(
          {
            error: 'The signed-in account changed. Reload before saving.',
            code: 'account_changed',
          },
          401,
        );
      }
      if (user.development) {
        const now = new Date().toISOString();
        await env.DB.prepare(
          `INSERT INTO users (id,email,role,created_at,updated_at) VALUES (?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET email=excluded.email,role=excluded.role
          WHERE users.email<>excluded.email OR users.role<>excluded.role`,
        )
          .bind(user.id, user.email, user.role, now, now)
          .run();
      }
      if (url.pathname === '/api/session' && request.method === 'GET') {
        const profile = await env.DB.prepare(
          'SELECT avatar_id AS avatarId, favorite_pokemon_id AS favoritePokemonId FROM users WHERE id=?',
        )
          .bind(user.id)
          .first();
        return json({ user: { ...user, ...profile } });
      }
      if (url.pathname === '/api/profile' && request.method === 'PUT')
        return await saveProfile(request, env, user);
      if (url.pathname === '/api/profile/showcase' && request.method === 'PUT')
        return await saveShowcase(request, env, user);
      if (url.pathname === '/api/profile/badges/check' && request.method === 'POST')
        return await checkBadges(request, env, user);
      if (url.pathname === '/api/shares' && ['GET', 'PUT'].includes(request.method))
        return await manageShare(request, env, user, url);
      if (url.pathname === '/api/shares/preview' && request.method === 'GET')
        return await previewShare(request, env, user, url);
      if (url.pathname === '/api/pokedex' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT pokemon_id,owned,legacy_owned,revision FROM pokedex_progress WHERE user_id=? ORDER BY pokemon_id',
        )
          .bind(user.id)
          .all();
        return json({ progress: results.map((row) => state(row)) });
      }
      if (url.pathname === '/api/sync' && request.method === 'GET')
        return await syncRecords(env, user, url);
      if (
        ['/api/catalogue', '/api/catalogue/sets'].includes(url.pathname) &&
        request.method === 'GET'
      )
        return await catalogue(env, url, user);
      if (url.pathname === '/api/cards/search' && request.method === 'GET')
        return await searchCards(request, env, url);
      if (url.pathname === '/api/cards/detail' && request.method === 'GET')
        return await previewCard(request, env, url);
      if (url.pathname === '/api/cards/resolve' && request.method === 'GET')
        return await resolveSources(env, url);
      if (url.pathname === '/api/cards/add' && request.method === 'POST')
        return await addCard(request, env, user);
      const record = url.pathname.match(/^\/api\/(inventory|collections)\/([^/]+)$/);
      if (record && request.method === 'PUT')
        return await saveRecord(
          request,
          env,
          user,
          record[1] === 'inventory' ? 'inventory' : 'collection',
          record[2],
        );
      const match = url.pathname.match(/^\/api\/pokedex\/(\d+)$/);
      if (match && request.method === 'PUT') {
        const id = Number(match[1]);
        if (!Number.isInteger(id) || id < 1 || id > 1025)
          throw new HttpError(400, 'Choose a valid Pokémon.');
        return await syncChange(request, env, user, id);
      }
      throw new HttpError(404, 'This page was not found.');
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error('API request failed', error.name);
      return json(
        { error: 'Saving is not available. Your pending changes stay on this device.' },
        503,
      );
    }
  },
};
