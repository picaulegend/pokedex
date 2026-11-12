import { HttpError } from './auth.js';
import { json, readBody, isId } from './api.js';
import {
  cardDetails,
  cardCategories,
  cardTypeFields,
  publicCard,
  sourceLocation,
  sourceRead,
  pocketSetIds,
} from './card-source.js';
import { catalogue, saveRecord } from './records.js';
import { addCollectionCard } from './card-add.js';
import { evaluateBadges } from './badges.js';

export async function searchCards(request, env, url) {
  const language = url.searchParams.get('language') || 'en';
  const q = (url.searchParams.get('q') || '').trim();
  const set = (url.searchParams.get('set') || '').trim();
  const number = (url.searchParams.get('number') || '').split('/')[0].trim();
  const pokemon = url.searchParams.get('pokemon'),
    category = url.searchParams.get('category'),
    page = Number(url.searchParams.get('page') || 1);
  if (category && (!cardCategories.includes(category) || (pokemon && category !== 'Pokemon')))
    throw new HttpError(400, 'Choose a valid card type.');
  const selectedCategory = pokemon ? 'Pokemon' : category;
  if (
    !['en', 'ja'].includes(language) ||
    q.length > 100 ||
    set.length > 60 ||
    number.length > 20 ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1000 ||
    (pokemon && (!/^\d+$/.test(pokemon) || Number(pokemon) < 1 || Number(pokemon) > 1025)) ||
    (!pokemon && !category && q.length < 2 && set.length < 2)
  )
    throw new HttpError(400, 'Enter a card name or set, or choose a card type.');
  const target = new URL(`https://api.tcgdex.net/v2/${language}/cards`);
  if (selectedCategory) target.searchParams.set('category', `eq:${selectedCategory}`);
  target.searchParams.set('pagination:page', page);
  target.searchParams.set('pagination:itemsPerPage', '24');
  if (pokemon) target.searchParams.set('dexId', `eq:${pokemon}`);
  if (q) target.searchParams.set('name', q);
  if (set) target.searchParams.set('set.id', `eq:${set}`);
  let result, hasMore;
  if (set && number) {
    if (!/^[a-zA-Z0-9.+-]{1,60}$/.test(set)) throw new HttpError(400, 'Choose a valid set ID.');
    if (page > 1) return json({ cards: [], page, hasMore: false, scope: 'external' });
    try {
      const card = await sourceRead(
        env,
        request,
        `https://api.tcgdex.net/v2/${language}/sets/${encodeURIComponent(set)}/${encodeURIComponent(number)}`,
      );
      result =
        cardCategories.includes(card.category) &&
        (!selectedCategory || card.category === selectedCategory) &&
        (!q || card.name.toLowerCase().includes(q.toLowerCase())) &&
        (!pokemon || card.dexId?.includes(Number(pokemon)))
          ? [card]
          : [];
    } catch (error) {
      if (error.status !== 404) throw error;
      result = [];
    }
    hasMore = false;
  } else {
    result = await sourceRead(env, request, target.href);
    hasMore = Array.isArray(result) && result.length >= 24;
    // The list endpoint's number filter is unreliable. Compare the returned brief records.
    if (number && Array.isArray(result)) {
      const normalize = (value) =>
        /^\d+$/.test(String(value))
          ? String(value).replace(/^0+/, '')
          : String(value).toUpperCase();
      result = result.filter((c) => normalize(c.localId) === normalize(number));
    }
  }
  if (!Array.isArray(result))
    throw new HttpError(502, 'The card source sent an invalid search reply.');
  const digitalSets = await pocketSetIds(env, request);
  return json({
    cards: result
      .slice(0, 24)
      .filter(
        (c) =>
          typeof c.id === 'string' &&
          typeof c.name === 'string' &&
          ![...digitalSets].some((id) => c.id.startsWith(`${id}-`)),
      )
      .map((c) => ({
        sourceId: c.id,
        language,
        name: c.name,
        number: String(c.localId || ''),
        image: c.image || null,
        // The list endpoint omits card types. The exact lookup returns full details.
        ...cardTypeFields({ ...c, category: c.category || selectedCategory || undefined }),
      })),
    page,
    hasMore,
    scope: 'external',
  });
}

export async function previewCard(request, env, url) {
  const language = url.searchParams.get('language'),
    sourceId = url.searchParams.get('sourceId');
  sourceLocation(language, sourceId);
  const known = await env.DB.prepare(
    'SELECT v.id FROM catalogue_cards c JOIN catalogue_variants v ON v.card_id=c.id WHERE c.language=? AND c.source_id=? LIMIT 1',
  )
    .bind(language, sourceId)
    .first();
  if (known) {
    const query = new URL('/api/catalogue', url);
    query.searchParams.set('variants', known.id);
    const result = await (await catalogue(env, query)).json();
    return json({ card: result.cards[0], saved: true });
  }
  return json({
    card: publicCard(await cardDetails(env, request, language, sourceId)),
    saved: false,
  });
}

export async function resolveSources(env, url) {
  const ids = (url.searchParams.get('variants') || '').split(',').filter(Boolean);
  if (!ids.length || ids.length > 200 || !ids.every(isId))
    throw new HttpError(400, 'Choose up to 200 card variants.');
  const { results } = await env.DB.prepare(
    `SELECT v.id AS variantId,c.language,c.source_id AS sourceId
    FROM catalogue_variants v JOIN catalogue_cards c ON c.id=v.card_id WHERE v.id IN (SELECT value FROM json_each(?))
    UNION SELECT variant_id,language,source_id FROM legacy_card_locators WHERE variant_id IN (SELECT value FROM json_each(?))`,
  )
    .bind(JSON.stringify(ids), JSON.stringify(ids))
    .all();
  return json({ sources: results });
}

export async function addCard(request, env, user) {
  const body = await readBody(request, 1000000);
  if (
    !body ||
    Object.keys(body).some(
      (k) =>
        ![
          'language',
          'sourceId',
          'variantId',
          'quantity',
          'wanted',
          'history',
          'baseRevision',
          'mutationId',
          'collectionId',
          'collectionRevision',
          'goalOnly',
        ].includes(k),
    ) ||
    !isId(body.variantId) ||
    !isId(body.mutationId) ||
    !Number.isInteger(body.quantity) ||
    body.quantity < 0 ||
    body.quantity > 999 ||
    typeof body.wanted !== 'boolean' ||
    (!body.quantity &&
      !body.wanted &&
      !body.goalOnly &&
      !body.history?.entries?.length &&
      !body.history?.orders?.length) ||
    (body.goalOnly !== undefined && typeof body.goalOnly !== 'boolean') ||
    (body.goalOnly && (!body.collectionId || body.quantity || body.wanted)) ||
    (body.goalOnly && body.history !== undefined) ||
    (body.collectionId !== undefined &&
      (!isId(body.collectionId) ||
        !Number.isSafeInteger(body.collectionRevision) ||
        body.collectionRevision < 1)) ||
    (body.collectionId === undefined && body.collectionRevision !== undefined) ||
    !Number.isSafeInteger(body.baseRevision) ||
    body.baseRevision < 0
  )
    throw new HttpError(400, 'Add a copy, add an order, or mark the card as wanted.');
  sourceLocation(body.language, body.sourceId);
  if (
    body.collectionId &&
    !(await env.DB.prepare('SELECT 1 FROM collections WHERE user_id=? AND id=? AND deleted=0')
      .bind(user.id, body.collectionId)
      .first())
  )
    throw new HttpError(404, 'This collection is unavailable.');
  const known = await env.DB.prepare(
    'SELECT c.id FROM catalogue_cards c JOIN catalogue_variants v ON v.card_id=c.id WHERE c.language=? AND c.source_id=? AND v.id=?',
  )
    .bind(body.language, body.sourceId, body.variantId)
    .first();
  if (!known) {
    if (body.baseRevision !== 0)
      throw new HttpError(409, 'The saved card record changed. Refresh and try again.');
    const used = await env.DB.prepare(
      'SELECT 1 FROM record_mutations WHERE user_id=? AND mutation_id=?',
    )
      .bind(user.id, body.mutationId)
      .first();
    if (used) throw new HttpError(409, 'This change ID was already used.');
  }
  const card = known ? null : await cardDetails(env, request, body.language, body.sourceId);
  if (card && !card.variants.some((v) => v.id === body.variantId))
    throw new HttpError(
      422,
      'This source variant changed. Find the card and select its finish again.',
    );
  let response;
  if (body.collectionId) {
    response = await addCollectionCard(env, user, body, card);
  } else {
    const change = new Request(request.url, {
      method: 'PUT',
      headers: request.headers,
      body: JSON.stringify({
        quantity: body.quantity,
        wanted: body.wanted,
        ...(body.history === undefined ? {} : { history: body.history }),
        baseRevision: body.baseRevision,
        mutationId: body.mutationId,
      }),
    });
    response = await saveRecord(change, env, user, 'inventory', body.variantId, card);
  }
  if (!response.ok || (!body.quantity && !body.collectionId)) return response;
  try {
    const badges = await evaluateBadges(env, user.id);
    return json({ ...(await response.clone().json()), badges }, response.status);
  } catch (error) {
    // The card save already succeeded. The next sync can retry the badge check.
    console.error('Badge check failed', error.name);
    return response;
  }
}
