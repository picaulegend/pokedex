import { HttpError } from './auth.js';
import { isId, json, readBody } from './api.js';
import { renderSharedPage, renderUnavailablePage } from './shared-page.js';

const tokenPattern = /^[a-f0-9]{64}$/;
export const shareHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' https://assets.tcgdex.net; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
export function shareTarget(scope, targetId = '') {
  if (
    !['collection', 'wishlist'].includes(scope) ||
    (scope === 'collection' ? !isId(targetId) : targetId !== '')
  )
    throw new HttpError(400, 'Choose a collection or your wishlist.');
  return { scope, targetId };
}
async function validateTarget(env, userId, target) {
  if (
    target.scope === 'collection' &&
    !(await env.DB.prepare('SELECT 1 FROM collections WHERE user_id=? AND id=? AND deleted=0')
      .bind(userId, target.targetId)
      .first())
  )
    throw new HttpError(404, 'This collection is unavailable.');
}
function privateState(row, origin) {
  return {
    enabled: Boolean(row?.enabled),
    revision: row?.revision || 0,
    url: row?.enabled ? `${origin}/s/${row.token}` : null,
  };
}
function previewUrl(origin, userId, target) {
  return `${origin}/api/shares/preview?${new URLSearchParams({ ...target, account: userId })}`;
}
export async function manageShare(request, env, user, url) {
  let target, body;
  if (request.method === 'GET')
    target = shareTarget(url.searchParams.get('scope'), url.searchParams.get('targetId') || '');
  else {
    body = await readBody(request);
    if (
      !body ||
      Object.keys(body).some(
        (key) => !['scope', 'targetId', 'enabled', 'baseRevision'].includes(key),
      ) ||
      typeof body.enabled !== 'boolean' ||
      !Number.isSafeInteger(body.baseRevision) ||
      body.baseRevision < 0
    )
      throw new HttpError(400, 'Choose whether sharing is on or off.');
    target = shareTarget(body.scope, body.targetId || '');
  }
  await validateTarget(env, user.id, target);
  const read = () =>
    env.DB.prepare(
      'SELECT token,enabled,revision FROM share_links WHERE user_id=? AND scope=? AND target_id=?',
    )
      .bind(user.id, target.scope, target.targetId)
      .first();
  let row = await read();
  if (body) {
    if ((row?.revision || 0) !== body.baseRevision)
      return json(
        {
          error: 'Sharing changed on another device. Check its current state before trying again.',
          share: privateState(row, url.origin),
        },
        409,
      );
    if (Boolean(row?.enabled) !== body.enabled) {
      const token = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      const now = new Date().toISOString();
      if (row)
        await env.DB.prepare(
          `UPDATE share_links SET enabled=?,token=CASE WHEN enabled=0 AND ?=1 THEN ? ELSE token END,revision=revision+1,updated_at=?
        WHERE user_id=? AND scope=? AND target_id=? AND revision=?
        AND (?='wishlist' OR EXISTS(SELECT 1 FROM collections WHERE user_id=? AND id=? AND deleted=0))`,
        )
          .bind(
            Number(body.enabled),
            Number(body.enabled),
            token,
            now,
            user.id,
            target.scope,
            target.targetId,
            body.baseRevision,
            target.scope,
            user.id,
            target.targetId,
          )
          .run();
      else
        await env.DB.prepare(
          `INSERT INTO share_links(user_id,scope,target_id,token,enabled,revision,created_at,updated_at)
        SELECT ?,?,?,?,?,1,?,? WHERE (?='wishlist' OR EXISTS(SELECT 1 FROM collections WHERE user_id=? AND id=? AND deleted=0))
        ON CONFLICT(user_id,scope,target_id) DO NOTHING`,
        )
          .bind(
            user.id,
            target.scope,
            target.targetId,
            token,
            Number(body.enabled),
            now,
            now,
            target.scope,
            user.id,
            target.targetId,
          )
          .run();
      row = await read();
      if (!row || row.revision !== body.baseRevision + 1 || Boolean(row.enabled) !== body.enabled)
        return json(
          {
            error: 'Sharing changed. Check its current state before trying again.',
            share: privateState(row, url.origin),
          },
          409,
        );
    }
  }
  return json({
    share: privateState(row, url.origin),
    previewUrl: previewUrl(url.origin, user.id, target),
  });
}

function filters(url, scope) {
  const page = Number(url.searchParams.get('page') || 1),
    language = url.searchParams.get('language') || '',
    status = url.searchParams.get('status') || '',
    search = (url.searchParams.get('search') || '').trim();
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1000 ||
    !['', 'en', 'ja'].includes(language) ||
    !['', 'owned', 'missing'].includes(status) ||
    (scope === 'wishlist' && status) ||
    search.length > 100
  )
    throw new HttpError(400, 'Choose valid page filters.');
  return { page, language, status, search };
}
export function shareQuery(userId, target) {
  const targets =
    target.scope === 'collection'
      ? {
          sql: 'SELECT variant_id FROM collection_cards WHERE user_id=? AND collection_id=?',
          values: [userId, target.targetId],
        }
      : {
          sql: `SELECT variant_id FROM inventory WHERE user_id=? AND wanted=1
      UNION SELECT m.variant_id FROM collection_cards m JOIN collections g ON g.user_id=m.user_id AND g.id=m.collection_id AND g.deleted=0
      LEFT JOIN inventory i ON i.user_id=m.user_id AND i.variant_id=m.variant_id WHERE m.user_id=? AND COALESCE(i.quantity,0)=0`,
          values: [userId, userId],
        };
  return {
    sql: `WITH targets AS (${targets.sql}), records AS (
    SELECT c.language,c.source_id,c.local_number,c.name,c.artist,c.image_url,s.name AS set_name,s.official_count,
      v.id AS variant_id,v.type,v.subtype,v.foil,v.size,v.stamps_json,
      ${target.scope === 'collection' ? 'CASE WHEN COALESCE(i.quantity,0)>0 THEN 1 ELSE 0 END' : '0'} AS owned
    FROM targets t JOIN catalogue_variants v ON v.id=t.variant_id JOIN catalogue_cards c ON c.id=v.card_id JOIN catalogue_sets s ON s.id=c.set_id
    LEFT JOIN inventory i ON i.user_id=? AND i.variant_id=v.id)`,
    values: [...targets.values, userId],
  };
}
async function pageData(env, userId, target, url, token) {
  const selected = filters(url, target.scope),
    query = shareQuery(userId, target),
    conditions = [],
    values = [];
  if (selected.language) {
    conditions.push('language=?');
    values.push(selected.language);
  }
  if (selected.status) {
    conditions.push('owned=?');
    values.push(Number(selected.status === 'owned'));
  }
  if (selected.search) {
    conditions.push(
      "(name LIKE ? ESCAPE '\\' OR set_name LIKE ? ESCAPE '\\' OR local_number LIKE ? ESCAPE '\\')",
    );
    const term = `%${selected.search.replace(/[\\%_]/g, '\\$&')}%`;
    values.push(term, term, term);
  }
  const where = conditions.join(' AND ') || '1';
  const gate = token
    ? env.DB.prepare(
        `SELECT l.scope,CASE WHEN l.scope='collection' THEN c.name ELSE 'Wishlist' END AS title FROM share_links l
      LEFT JOIN collections c ON c.user_id=l.user_id AND c.id=l.target_id AND c.deleted=0
      WHERE l.token=? AND l.enabled=1 AND (l.scope='wishlist' OR c.id IS NOT NULL)`,
      ).bind(token)
    : target.scope === 'collection'
      ? env.DB.prepare(
          'SELECT name AS title FROM collections WHERE user_id=? AND id=? AND deleted=0',
        ).bind(userId, target.targetId)
      : env.DB.prepare("SELECT 'Wishlist' AS title");
  const result = await env.DB.batch([
    gate,
    env.DB.prepare(
      `${query.sql} SELECT COUNT(*) AS total,COALESCE(SUM(owned),0) AS owned,COALESCE(SUM(CASE WHEN ${where} THEN 1 ELSE 0 END),0) AS matches FROM records`,
    ).bind(...query.values, ...values),
    env.DB.prepare(
      `${query.sql} SELECT * FROM records WHERE ${where} ORDER BY language,set_name,local_number,variant_id LIMIT 24 OFFSET ?`,
    ).bind(...query.values, ...values, (selected.page - 1) * 24),
  ]);
  const entity = result[0].results[0];
  if (!entity) throw new HttpError(404, 'This shared page is unavailable.');
  const summary = result[1].results[0];
  return {
    scope: target.scope,
    title: entity.title,
    total: summary.total,
    ...(target.scope === 'collection' ? { owned: summary.owned } : {}),
    matches: summary.matches,
    page: selected.page,
    pageSize: 24,
    hasMore: selected.page * 24 < summary.matches,
    filters: selected,
    cards: result[2].results.map((row) => ({
      name: row.name,
      language: row.language,
      sourceId: row.source_id,
      number: row.local_number,
      setName: row.set_name,
      officialCount: row.official_count,
      artist: row.artist,
      image: row.image_url,
      finish: {
        type: row.type,
        subtype: row.subtype,
        foil: row.foil,
        size: row.size,
        stamps: JSON.parse(row.stamps_json),
      },
      ...(target.scope === 'collection' ? { owned: Boolean(row.owned) } : {}),
    })),
  };
}
export async function previewShare(request, env, user, url) {
  const target = shareTarget(url.searchParams.get('scope'), url.searchParams.get('targetId') || '');
  const page = await pageData(env, user.id, target, url);
  return new Response(renderSharedPage(page, url, { preview: true, account: user.id, target }), {
    headers: { ...shareHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  });
}
export async function publicShare(request, env, url) {
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response('This page is read-only.', {
      status: 405,
      headers: { ...shareHeaders, Allow: 'GET, HEAD' },
    });
  const assets = {
    '/s/assets/favicon.svg': '/favicon.svg',
    '/s/assets/favicon.ico': '/favicon.ico',
    '/s/assets/apple-touch-icon.png': '/apple-touch-icon.png',
    '/s/assets/share.css': '/share.css',
    '/s/assets/share.js': '/share.js',
    '/s/assets/TCGdex-LICENSE.txt': '/TCGdex-LICENSE.txt',
  };
  if (assets[url.pathname]) {
    const response = await env.ASSETS.fetch(
      new Request(new URL(assets[url.pathname], url), { method: request.method }),
    );
    const headers = new Headers(response.headers);
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(response.body, { status: response.status, headers });
  }
  try {
    const match = url.pathname.match(/^\/s\/([a-f0-9]{64})(\/data)?$/);
    if (!match || !tokenPattern.test(match[1]))
      throw new HttpError(404, 'This shared page is unavailable.');
    const link = await env.DB.prepare(
      'SELECT user_id,scope,target_id FROM share_links WHERE token=? AND enabled=1',
    )
      .bind(match[1])
      .first();
    if (!link) throw new HttpError(404, 'This shared page is unavailable.');
    const page = await pageData(
      env,
      link.user_id,
      { scope: link.scope, targetId: link.target_id },
      url,
      match[1],
    );
    return new Response(
      request.method === 'HEAD'
        ? null
        : match[2]
          ? JSON.stringify(page)
          : renderSharedPage(page, url),
      {
        headers: {
          ...shareHeaders,
          'Content-Type': match[2] ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
        },
      },
    );
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 503;
    return new Response(request.method === 'HEAD' ? null : renderUnavailablePage(status), {
      status,
      headers: { ...shareHeaders, 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}
