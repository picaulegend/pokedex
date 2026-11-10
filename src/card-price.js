import { isId, json, readBody } from './api.js';
import { HttpError } from './auth.js';
import { cardDetails, sourceLocation } from './card-source.js';

const priceQuery = (db, variantId) =>
  db
    .prepare(
      `SELECT euro_cents AS euroCents, source_updated_at AS sourceUpdatedAt, checked_at AS checkedAt
       FROM card_price_checks WHERE variant_id=?`,
    )
    .bind(variantId);

export async function readCardPrice(env, url) {
  const variantId = url.searchParams.get('variantId');
  if (!isId(variantId)) throw new HttpError(400, 'Choose a card finish.');
  return json({ price: await priceQuery(env.DB, variantId).first() });
}

const productId = (variant) => variant.raw.thirdParty?.cardmarket;
const priceField = (variant) =>
  ['reverse', 'reverse-holo'].includes(variant.type) ? 'avg7-holo' : 'avg7';
const plainFinish = (variant) =>
  ['normal', 'holo', 'reverse', 'reverse-holo'].includes(variant.type) &&
  !variant.subtype &&
  !variant.foil &&
  !variant.stamps.length &&
  (!variant.size || variant.size === 'standard');

export function cardmarketEstimate(card, variantId) {
  const variant = card.variants.find((v) => v.id === variantId);
  if (!variant || !['normal', 'holo', 'reverse', 'reverse-holo'].includes(variant.type))
    return null;
  const id = productId(variant);
  const price = variant.raw.pricing?.cardmarket;
  if (!Number.isSafeInteger(id) || id < 1 || price?.idProduct !== id || price.unit !== 'EUR')
    return null;
  const field = priceField(variant);
  // Cardmarket groups a card's main printing and reverse foil under one product ID.
  // Different printings that use the same price field cannot be priced separately.
  if (
    card.variants.some(
      (v) =>
        v !== variant &&
        productId(v) === id &&
        (priceField(v) === field || !plainFinish(v) || !plainFinish(variant)),
    )
  )
    return null;
  const amount = price[field];
  const euroCents = Math.round(amount * 100);
  const sourceDate = typeof price.updated === 'string' ? Date.parse(price.updated) : NaN;
  if (
    typeof amount !== 'number' ||
    !Number.isSafeInteger(euroCents) ||
    euroCents < 1 ||
    !Number.isFinite(sourceDate)
  )
    return null;
  return { euroCents, sourceUpdatedAt: new Date(sourceDate).toISOString() };
}

export async function checkCardPrice(request, env) {
  const body = await readBody(request, 512);
  if (!isId(body?.variantId)) throw new HttpError(400, 'Choose a card finish.');
  const { language, sourceId, variantId } = body;
  sourceLocation(language, sourceId);
  const known = await env.DB.prepare(
    `SELECT c.language, c.source_id AS sourceId
     FROM catalogue_variants v JOIN catalogue_cards c ON c.id=v.card_id WHERE v.id=?`,
  )
    .bind(variantId)
    .first();
  if (known && (known.language !== language || known.sourceId !== sourceId))
    throw new HttpError(400, 'This finish does not belong to this card.');

  const checkedAt = new Date().toISOString();
  const card = await cardDetails(env, request, language, sourceId);
  const estimate = cardmarketEstimate(card, variantId);
  const price = { euroCents: null, sourceUpdatedAt: null, ...estimate, checkedAt };
  if (!known) return json({ price, saved: false });

  const [, result] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO card_price_checks (variant_id,euro_cents,source_updated_at,checked_at)
       VALUES (?,?,?,?)
       ON CONFLICT(variant_id) DO UPDATE SET
         euro_cents=excluded.euro_cents, source_updated_at=excluded.source_updated_at,
         checked_at=excluded.checked_at
       WHERE excluded.checked_at > card_price_checks.checked_at`,
    ).bind(variantId, price.euroCents, price.sourceUpdatedAt, checkedAt),
    priceQuery(env.DB, variantId),
  ]);
  return json({ price: result.results[0], saved: true });
}
