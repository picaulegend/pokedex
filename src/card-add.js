import { json, progressState } from './api.js';
import { cardStatements } from './card-source.js';
import { collectionSelect, collectionState, inventorySelect, inventoryState } from './records.js';

// The receipt, optional catalogue import, inventory, and membership share one transaction.
export async function addCollectionCard(env, user, body, card) {
  const payload = JSON.stringify({
    language: body.language,
    sourceId: body.sourceId,
    variantId: body.variantId,
    quantity: body.quantity,
    wanted: body.wanted,
    baseRevision: body.baseRevision,
    collectionId: body.collectionId,
    collectionRevision: body.collectionRevision,
    goalOnly: Boolean(body.goalOnly),
  });
  const requestId = crypto.randomUUID();
  const gate = {
    sql: 'EXISTS(SELECT 1 FROM record_mutations WHERE user_id=? AND mutation_id=? AND request_id=?)',
    values: [user.id, body.mutationId, requestId],
  };
  const statements = [
    env.DB.prepare(
      `INSERT INTO record_mutations(user_id,mutation_id,kind,target_id,payload,request_id)
    SELECT ?,?,'card-add',?,?,? WHERE
      EXISTS(SELECT 1 FROM collections WHERE user_id=? AND id=? AND revision=? AND deleted=0)
      AND ((SELECT COUNT(*) FROM collection_cards WHERE user_id=? AND collection_id=?)<2000
        OR EXISTS(SELECT 1 FROM collection_cards WHERE user_id=? AND collection_id=? AND variant_id=?))
      AND (?=1 OR COALESCE((SELECT revision FROM inventory WHERE user_id=? AND variant_id=?),0)=?)
    ON CONFLICT(user_id,mutation_id) DO NOTHING`,
    ).bind(
      user.id,
      body.mutationId,
      body.variantId,
      payload,
      requestId,
      user.id,
      body.collectionId,
      body.collectionRevision,
      user.id,
      body.collectionId,
      user.id,
      body.collectionId,
      body.variantId,
      Number(Boolean(body.goalOnly)),
      user.id,
      body.variantId,
      body.baseRevision,
    ),
    ...(card ? cardStatements(env.DB, card, gate) : []),
  ];
  if (!body.goalOnly)
    statements.push(
      env.DB.prepare(
        `INSERT INTO inventory(user_id,variant_id,quantity,wanted,revision)
    SELECT ?,?,?,?,?+1 WHERE ${gate.sql}
    ON CONFLICT(user_id,variant_id) DO UPDATE SET quantity=excluded.quantity,wanted=excluded.wanted,revision=excluded.revision`,
      ).bind(
        user.id,
        body.variantId,
        body.quantity,
        Number(body.wanted),
        body.baseRevision,
        ...gate.values,
      ),
    );
  statements.push(
    env.DB.prepare(
      `UPDATE collections SET revision=revision+1 WHERE user_id=? AND id=? AND ${gate.sql}`,
    ).bind(user.id, body.collectionId, ...gate.values),
    env.DB.prepare(
      `INSERT INTO collection_cards(user_id,collection_id,variant_id) SELECT ?,?,? WHERE ${gate.sql} ON CONFLICT DO NOTHING`,
    ).bind(user.id, body.collectionId, body.variantId, ...gate.values),
    env.DB.prepare('SELECT * FROM record_mutations WHERE user_id=? AND mutation_id=?').bind(
      user.id,
      body.mutationId,
    ),
    env.DB.prepare(`${inventorySelect} WHERE i.user_id=? AND i.variant_id=?`).bind(
      user.id,
      body.variantId,
    ),
    env.DB.prepare(`${collectionSelect} WHERE c.user_id=? AND c.id=?`).bind(
      user.id,
      body.collectionId,
    ),
    env.DB.prepare(
      `SELECT * FROM pokedex_progress WHERE user_id=? AND pokemon_id IN
      (SELECT p.pokedex_number FROM catalogue_card_pokemon p JOIN catalogue_variants v ON v.card_id=p.card_id WHERE v.id=?)`,
    ).bind(user.id, body.variantId),
  );
  const result = await env.DB.batch(statements);
  const receipt = result.at(-4).results[0];
  const state = inventoryState(result.at(-3).results[0], body.variantId);
  const collection = collectionState(result.at(-2).results[0]);
  if (
    receipt &&
    (receipt.kind !== 'card-add' ||
      receipt.target_id !== body.variantId ||
      receipt.payload !== payload)
  )
    return json(
      { error: 'This change ID was already used.', code: 'mutation_reused', state, collection },
      409,
    );
  if (!receipt)
    return json(
      {
        error: 'This card or collection changed on another device. Sync, then try again.',
        code: 'state_changed',
        state,
        collection,
      },
      409,
    );
  return json({
    state,
    collection,
    progress: result.at(-1).results.map((row) => progressState(row)),
    mutationId: body.mutationId,
  });
}
