import { HttpError } from './auth.js';
import { isId, json, progressState, readBody } from './api.js';
import { cardDetails, cardStatements } from './card-source.js';
import { emptyHistory, inventoryChange, validateHistory } from './client/card-history-model.js';
import { showcaseQuery } from './showcase.js';
import { badgeQuery, badgeSnapshot, markBadgeChange } from './badges.js';

export const collectionSelect = `SELECT c.*,COALESCE((SELECT json_group_array(variant_id) FROM
  (SELECT variant_id FROM collection_cards WHERE user_id=c.user_id AND collection_id=c.id ORDER BY variant_id)),'[]') AS variant_ids FROM collections c`;
export const inventorySelect = `SELECT i.*,c0.language AS source_language,c0.source_id AS source_card_id,
  (SELECT json_group_array(p.pokedex_number) FROM catalogue_card_pokemon p
  JOIN catalogue_variants v ON v.card_id=p.card_id WHERE v.id=i.variant_id) AS pokemon_ids FROM inventory i
  JOIN catalogue_variants v0 ON v0.id=i.variant_id JOIN catalogue_cards c0 ON c0.id=v0.card_id`;

export const inventoryState = (row, variantId) =>
  row
    ? {
        variantId: row.variant_id,
        quantity: row.quantity,
        wanted: Boolean(row.wanted),
        history: JSON.parse(row.history_json || JSON.stringify(emptyHistory())),
        revision: row.revision,
        pokemonIds: JSON.parse(row.pokemon_ids || '[]'),
        source: { language: row.source_language, sourceId: row.source_card_id },
      }
    : { variantId, quantity: 0, wanted: false, history: emptyHistory(), revision: 0 };
export const collectionState = (row) =>
  row
    ? {
        id: row.id,
        name: row.name,
        deleted: Boolean(row.deleted),
        variantIds: JSON.parse(row.variant_ids),
        revision: row.revision,
      }
    : null;

export async function syncRecords(env, user, url) {
  const afterText = url.searchParams.get('after') || '0';
  if (!/^\d{1,16}$/.test(afterText) || !Number.isSafeInteger(Number(afterText)))
    throw new HttpError(400, 'Use a valid sync position.');
  const after = Number(afterText);
  // The cursor and records describe the same state.
  const version = '(SELECT COALESCE((SELECT version FROM account_sync WHERE user_id=?),1))';
  const results = await env.DB.batch([
    env.DB.prepare(
      'SELECT COALESCE((SELECT version FROM account_sync WHERE user_id=?),1) AS version',
    ).bind(user.id),
    env.DB.prepare(
      `SELECT * FROM pokedex_progress WHERE user_id=? AND sync_version>CASE WHEN ?>${version} THEN 0 ELSE ? END`,
    ).bind(user.id, after, user.id, after),
    env.DB.prepare(
      `${inventorySelect} WHERE i.user_id=? AND i.sync_version>CASE WHEN ?>${version} THEN 0 ELSE ? END`,
    ).bind(user.id, after, user.id, after),
    env.DB.prepare(
      `${collectionSelect} WHERE c.user_id=? AND c.sync_version>CASE WHEN ?>${version} THEN 0 ELSE ? END`,
    ).bind(user.id, after, user.id, after),
    showcaseQuery(env, user.id),
    badgeQuery(env, user.id),
  ]);
  const cursor = results[0].results[0].version;
  return json({
    cursor,
    reset: after > cursor,
    progress: results[1].results.map((row) => progressState(row)),
    inventory: results[2].results.map((row) => inventoryState(row)),
    collections: results[3].results.map(collectionState),
    showcase: results[4].results,
    badges: badgeSnapshot(results[5].results[0]),
  });
}

export async function catalogue(env, url, user) {
  if (url.pathname === '/api/catalogue/sets') {
    const language = url.searchParams.get('language');
    if (language && !['en', 'ja'].includes(language))
      throw new HttpError(400, 'Choose English or Japanese.');
    const results = await env.DB.prepare(
      `SELECT id,language,name,source_id AS sourceId,logo_url AS logo,symbol_url AS symbol,
      official_count AS officialCount,total_count AS totalCount,reference_note AS referenceNote FROM catalogue_sets ${language ? 'WHERE language=?' : ''} ORDER BY name COLLATE NOCASE,source_id`,
    )
      .bind(...(language ? [language] : []))
      .all();
    const checked = await env.DB.prepare(
      `SELECT language,checked_at AS checkedAt FROM set_reference_imports ${language ? 'WHERE language=?' : ''}`,
    )
      .bind(...(language ? [language] : []))
      .all();
    return json({ sets: results.results, checked: checked.results });
  }
  let condition, value;
  const page = Number(url.searchParams.get('page') || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000)
    throw new HttpError(400, 'Choose a valid page.');
  if (url.searchParams.has('pokemon')) {
    value = Number(url.searchParams.get('pokemon'));
    if (!Number.isInteger(value) || value < 1 || value > 1025)
      throw new HttpError(400, 'Choose a valid Pokémon.');
    condition = 'c.id IN (SELECT card_id FROM catalogue_card_pokemon WHERE pokedex_number=?)';
  } else if (url.searchParams.has('search')) {
    value = `%${(url.searchParams.get('search') || '').slice(0, 100).replace(/[\\%_]/g, '\\$&')}%`;
    condition = `(c.name LIKE ? ESCAPE '\\' OR c.local_number LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\')`;
  } else {
    const ids = (url.searchParams.get('variants') || '').split(',').filter(Boolean);
    if (!ids.length || ids.length > 200 || !ids.every(isId))
      throw new HttpError(400, 'Choose up to 200 card variants.');
    value = JSON.stringify(ids);
    condition =
      'c.id IN (SELECT card_id FROM catalogue_variants WHERE id IN (SELECT value FROM json_each(?)))';
  }
  const parameters =
    url.searchParams.has('search') && !url.searchParams.has('pokemon')
      ? [value, value, value]
      : [value];
  if (url.searchParams.has('personal')) {
    if (
      !user ||
      url.searchParams.get('personal') !== '1' ||
      !url.searchParams.has('pokemon') ||
      url.searchParams.has('search') ||
      url.searchParams.has('variants')
    )
      throw new HttpError(400, 'Choose a Pokémon to read your saved cards.');
    condition += ` AND c.id IN (SELECT v.card_id FROM catalogue_variants v WHERE v.id IN (
      SELECT variant_id FROM inventory WHERE user_id=? AND (quantity>0 OR wanted=1 OR json_array_length(history_json,'$.entries')>0)
      UNION SELECT m.variant_id FROM collection_cards m JOIN collections g ON g.user_id=m.user_id AND g.id=m.collection_id AND g.deleted=0 WHERE m.user_id=?))`;
    parameters.push(user.id, user.id);
  }
  if (url.searchParams.has('pokemon') && url.searchParams.has('variants')) {
    const ids = url.searchParams.get('variants').split(',').filter(Boolean);
    if (!ids.length || ids.length > 200 || !ids.every(isId))
      throw new HttpError(400, 'Choose up to 200 card variants.');
    condition +=
      ' AND c.id IN (SELECT card_id FROM catalogue_variants WHERE id IN (SELECT value FROM json_each(?)))';
    parameters.push(JSON.stringify(ids));
  }
  if (
    url.searchParams.has('search') &&
    url.searchParams.has('pokemon') &&
    url.searchParams.get('search')
  ) {
    condition +=
      " AND (c.name LIKE ? ESCAPE '\\' OR c.local_number LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\')";
    const term = `%${url.searchParams
      .get('search')
      .slice(0, 100)
      .replace(/[\\%_]/g, '\\$&')}%`;
    parameters.push(term, term, term);
  }
  if (url.searchParams.has('language')) {
    condition += ' AND c.language=?';
    parameters.push(url.searchParams.get('language'));
  }
  if (url.searchParams.get('set')) {
    condition += ' AND s.source_id=?';
    parameters.push(url.searchParams.get('set').slice(0, 60));
  }
  if (url.searchParams.get('number')) {
    const number = url.searchParams.get('number').split('/')[0].trim().slice(0, 20);
    if (/^\d+$/.test(number)) {
      condition += " AND c.local_number NOT GLOB '*[^0-9]*' AND ltrim(c.local_number,'0')=?";
      parameters.push(number.replace(/^0+/, ''));
    } else {
      condition += ' AND upper(c.local_number)=upper(?)';
      parameters.push(number);
    }
  }
  const paged = url.searchParams.has('search');
  const { results: cards } = await env.DB.prepare(
    `SELECT c.id,c.language,c.source_id,c.local_number,c.name,c.artist,c.image_url,c.source_url,
    c.set_id,s.name AS set_name,s.official_count,(SELECT json_group_array(pokedex_number) FROM catalogue_card_pokemon WHERE card_id=c.id) AS pokemon_ids
    FROM catalogue_cards c JOIN catalogue_sets s ON s.id=c.set_id WHERE ${condition} ORDER BY c.language,s.name,c.local_number ${paged ? 'LIMIT 24 OFFSET ?' : ''}`,
  )
    .bind(...parameters, ...(paged ? [(page - 1) * 24] : []))
    .all();
  const { results: variants } = await env.DB.prepare(
    `SELECT id,card_id,type,subtype,foil,size,stamps_json FROM catalogue_variants
    WHERE card_id IN (SELECT value FROM json_each(?)) ORDER BY type,subtype,foil,id`,
  )
    .bind(JSON.stringify(cards.map((c) => c.id)))
    .all();
  const byCard = new Map();
  for (const v of variants) {
    const list = byCard.get(v.card_id) || [];
    list.push({
      id: v.id,
      type: v.type,
      subtype: v.subtype,
      foil: v.foil,
      size: v.size,
      stamps: JSON.parse(v.stamps_json),
    });
    byCard.set(v.card_id, list);
  }
  return json({
    cards: cards.map((c) => ({
      id: c.id,
      language: c.language,
      sourceId: c.source_id,
      number: c.local_number,
      name: c.name,
      artist: c.artist,
      image: c.image_url,
      sourceUrl: c.source_url,
      setId: c.set_id,
      setName: c.set_name,
      officialCount: c.official_count,
      pokemonIds: JSON.parse(c.pokemon_ids),
      variants: byCard.get(c.id) || [],
    })),
    scope: 'saved',
    page,
    hasMore: paged && cards.length === 24,
  });
}

export async function prepareInventoryHistory(env, user, id, body) {
  const current = await env.DB.prepare(
    'SELECT quantity,wanted,history_json,revision FROM inventory WHERE user_id=? AND variant_id=?',
  )
    .bind(user.id, id)
    .first();
  const row = current
    ? {
        quantity: current.quantity,
        wanted: Boolean(current.wanted),
        history: JSON.parse(current.history_json),
      }
    : undefined;
  try {
    // The write gate reports stale revisions. Do not treat a conflict as a bad edit.
    if ((current?.revision || 0) !== body.baseRevision)
      return body.history === undefined
        ? row?.history || emptyHistory()
        : validateHistory(body.history, body.quantity);
    return inventoryChange(
      row,
      {
        quantity: body.quantity,
        wanted: body.wanted,
        ...(body.history === undefined ? {} : { history: body.history }),
        historyChoice: body.historyChoice,
      },
      body.mutationId,
    ).history;
  } catch (error) {
    throw new HttpError(400, error.message);
  }
}

export async function saveRecord(request, env, user, kind, id, preparedCard) {
  if (!isId(id)) throw new HttpError(400, 'Choose a valid record.');
  const body = await readBody(request, kind === 'collection' ? 90000 : 1000000);
  const fields =
    kind === 'inventory'
      ? ['quantity', 'wanted', 'history', 'historyChoice', 'baseRevision', 'mutationId']
      : ['name', 'variantIds', 'deleted', 'baseRevision', 'mutationId'];
  if (
    !body ||
    Object.keys(body).some((key) => !fields.includes(key)) ||
    !isId(body.mutationId) ||
    !Number.isSafeInteger(body.baseRevision) ||
    body.baseRevision < 0
  )
    throw new HttpError(400, 'Send a valid change.');
  let data, history;
  if (kind === 'inventory') {
    if (
      !Number.isInteger(body.quantity) ||
      body.quantity < 0 ||
      body.quantity > 999 ||
      typeof body.wanted !== 'boolean' ||
      (body.historyChoice !== undefined &&
        (typeof body.historyChoice !== 'boolean' || body.history === undefined))
    )
      throw new HttpError(400, 'Choose a quantity from 0 to 999 and a wanted status.');
    if (
      !preparedCard &&
      !(await env.DB.prepare('SELECT 1 FROM catalogue_variants WHERE id=?').bind(id).first())
    ) {
      // Old offline edits can refer to a removed, unused sample card.
      const locator = await env.DB.prepare(
        'SELECT language,source_id FROM legacy_card_locators WHERE variant_id=?',
      )
        .bind(id)
        .first();
      if (!locator) throw new HttpError(404, 'This card variant is not in the catalogue.');
      if (!body.quantity && !body.wanted)
        return json({ state: inventoryState(null, id), progress: [], mutationId: body.mutationId });
      preparedCard = await cardDetails(env, request, locator.language, locator.source_id);
    }
    if (preparedCard && !preparedCard.variants.some((v) => v.id === id))
      throw new HttpError(
        422,
        'This source variant changed. Find the card and select its finish again.',
      );
    data = { quantity: body.quantity, wanted: body.wanted };
    history = await prepareInventoryHistory(env, user, id, body);
    if (body.history !== undefined) data.history = history;
    if (body.historyChoice !== undefined) data.historyChoice = body.historyChoice;
  } else {
    if (
      typeof body.name !== 'string' ||
      !body.name.trim() ||
      body.name.trim().length > 80 ||
      typeof body.deleted !== 'boolean' ||
      !Array.isArray(body.variantIds) ||
      body.variantIds.length > 2000 ||
      !body.variantIds.every(isId) ||
      new Set(body.variantIds).size !== body.variantIds.length
    )
      throw new HttpError(400, 'Use a collection name and up to 2,000 different card variants.');
    const valid = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM catalogue_variants WHERE id IN (SELECT value FROM json_each(?))',
    )
      .bind(JSON.stringify(body.variantIds))
      .first();
    if (valid.count !== body.variantIds.length)
      throw new HttpError(400, 'A card variant is not in the catalogue.');
    data = {
      name: body.name.trim(),
      variantIds: [...body.variantIds].sort(),
      deleted: body.deleted,
    };
  }
  const payload = JSON.stringify({ ...data, baseRevision: body.baseRevision });
  const requestId = crypto.randomUUID();
  const eligible = `NOT EXISTS(SELECT 1 FROM record_mutations WHERE user_id=? AND mutation_id=?)`;
  const statements = preparedCard ? cardStatements(env.DB, preparedCard) : [];
  if (kind === 'inventory') {
    statements.push(
      env.DB.prepare(
        `INSERT INTO inventory(user_id,variant_id,quantity,wanted,history_json,revision)
      SELECT ?,?,?,?,?,?+1 WHERE ${eligible} AND (?=0 OR EXISTS(SELECT 1 FROM inventory WHERE user_id=? AND variant_id=? AND revision=?))
      ON CONFLICT(user_id,variant_id) DO UPDATE SET quantity=excluded.quantity,wanted=excluded.wanted,history_json=excluded.history_json,revision=excluded.revision
      WHERE inventory.revision=?`,
      ).bind(
        user.id,
        id,
        data.quantity,
        Number(data.wanted),
        JSON.stringify(history),
        body.baseRevision,
        user.id,
        body.mutationId,
        body.baseRevision,
        user.id,
        id,
        body.baseRevision,
        body.baseRevision,
      ),
    );
  } else {
    statements.push(
      env.DB.prepare(
        `INSERT INTO collections(user_id,id,name,deleted,revision)
      SELECT ?,?,?,?,?+1 WHERE ${eligible} AND (?=0 OR EXISTS(SELECT 1 FROM collections WHERE user_id=? AND id=? AND revision=?))
      ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,deleted=excluded.deleted,revision=excluded.revision
      WHERE collections.revision=?`,
      ).bind(
        user.id,
        id,
        data.name,
        Number(data.deleted),
        body.baseRevision,
        user.id,
        body.mutationId,
        body.baseRevision,
        user.id,
        id,
        body.baseRevision,
        body.baseRevision,
      ),
    );
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO record_mutations(user_id,mutation_id,kind,target_id,payload,request_id)
    SELECT ?,?,?,?,?,? WHERE changes()=1 ON CONFLICT DO NOTHING`,
    ).bind(user.id, body.mutationId, kind, id, payload, requestId),
  );
  if (kind === 'collection') {
    const gate =
      'EXISTS(SELECT 1 FROM record_mutations WHERE user_id=? AND mutation_id=? AND request_id=?)';
    statements.push(
      env.DB.prepare(
        `DELETE FROM collection_cards WHERE user_id=? AND collection_id=?
        AND variant_id NOT IN (SELECT value FROM json_each(?)) AND ${gate}`,
      ).bind(user.id, id, JSON.stringify(data.variantIds), user.id, body.mutationId, requestId),
      markBadgeChange(env, user.id),
    );
    statements.push(
      env.DB.prepare(
        `INSERT INTO collection_cards(user_id,collection_id,variant_id)
      SELECT ?,?,value FROM json_each(?) WHERE ${gate} ON CONFLICT DO NOTHING`,
      ).bind(user.id, id, JSON.stringify(data.variantIds), user.id, body.mutationId, requestId),
      markBadgeChange(env, user.id),
    );
  }
  statements.push(
    env.DB.prepare('SELECT * FROM record_mutations WHERE user_id=? AND mutation_id=?').bind(
      user.id,
      body.mutationId,
    ),
  );
  statements.push(
    kind === 'inventory'
      ? env.DB.prepare(`${inventorySelect} WHERE i.user_id=? AND i.variant_id=?`).bind(user.id, id)
      : env.DB.prepare(`${collectionSelect} WHERE c.user_id=? AND c.id=?`).bind(user.id, id),
  );
  if (kind === 'inventory')
    statements.push(
      env.DB.prepare(
        `SELECT * FROM pokedex_progress WHERE user_id=? AND pokemon_id IN
    (SELECT p.pokedex_number FROM catalogue_card_pokemon p JOIN catalogue_variants v ON v.card_id=p.card_id WHERE v.id=?)`,
      ).bind(user.id, id),
    );
  const result = await env.DB.batch(statements);
  const offset = kind === 'inventory' ? 3 : 2;
  const receipt = result.at(-offset).results[0];
  const state =
    kind === 'inventory'
      ? inventoryState(result.at(-2).results[0], id)
      : collectionState(result.at(-1).results[0]);
  if (receipt && (receipt.kind !== kind || receipt.target_id !== id || receipt.payload !== payload))
    return json({ error: 'This change ID was already used.', code: 'mutation_reused', state }, 409);
  if (!receipt)
    return json(
      {
        error: 'This record changed on another device. Review your choice.',
        code: 'state_changed',
        state,
      },
      409,
    );
  return json({
    state,
    progress: kind === 'inventory' ? result.at(-1).results.map((row) => progressState(row)) : [],
    mutationId: body.mutationId,
  });
}
