import { HttpError } from './auth.js';
import { isId, json, readBody } from './api.js';

export function showcaseQuery(env, userId) {
  return env.DB.prepare(
    `SELECT t.variant_id AS variantId, c.source_id AS sourceId, c.language,
      c.name, c.image_url AS image, c.local_number AS number, s.name AS setName,
      v.type, v.subtype, v.foil, v.size, v.stamps_json AS stamps
    FROM trainer_showcase t JOIN catalogue_variants v ON v.id=t.variant_id
    JOIN catalogue_cards c ON c.id=v.card_id JOIN catalogue_sets s ON s.id=c.set_id
    WHERE t.user_id=? ORDER BY t.position`,
  ).bind(userId);
}

export async function saveShowcase(request, env, user) {
  const body = await readBody(request, 256);
  if (
    !body ||
    Object.keys(body).length !== 2 ||
    !isId(body.variantId) ||
    typeof body.featured !== 'boolean'
  )
    throw new HttpError(400, 'Choose a card to add or remove.');
  const { variantId, featured } = body;
  const change = featured
    ? env.DB.prepare(
        `INSERT INTO trainer_showcase (user_id,variant_id,position)
        SELECT ?,?,slots.position FROM (SELECT 1 AS position UNION ALL SELECT 2 UNION ALL SELECT 3) slots
        WHERE slots.position NOT IN (SELECT position FROM trainer_showcase WHERE user_id=?)
        AND EXISTS (SELECT 1 FROM inventory WHERE user_id=? AND variant_id=? AND quantity>0)
        ORDER BY slots.position LIMIT 1
        ON CONFLICT(user_id,variant_id) DO NOTHING`,
      ).bind(user.id, variantId, user.id, user.id, variantId)
    : env.DB.prepare('DELETE FROM trainer_showcase WHERE user_id=? AND variant_id=?').bind(
        user.id,
        variantId,
      );
  const [, { results: showcase }] = await env.DB.batch([change, showcaseQuery(env, user.id)]);
  if (featured && !showcase.some((card) => card.variantId === variantId))
    return json(
      {
        error:
          showcase.length >= 3
            ? 'Your showcase is full. Remove a card from your Trainer Card first.'
            : 'Save an owned copy online before you feature this card.',
        showcase,
      },
      409,
    );
  return json({ showcase });
}
