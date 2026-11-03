import { HttpError } from './auth.js';
import { encode, identifier } from './identifiers.js';

const encoder = new TextEncoder();
const hex = (bytes) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function sourceLocation(language, id) {
  if (
    !['en', 'ja'].includes(language) ||
    typeof id !== 'string' ||
    !/^[a-zA-Z0-9.+-]{1,100}$/.test(id)
  )
    throw new HttpError(400, 'Choose a card language and source ID.');
  return `https://api.tcgdex.net/v2/${language}/cards/${encodeURIComponent(id)}`;
}

const temporary = new Map();
export async function sourceRead(env, request, url) {
  const cached = temporary.get(url);
  if (cached && cached.until > Date.now()) return cached.value;
  let value;
  const host = new URL(request.url).hostname;
  if (
    env.CATALOGUE_TEST_SOURCE === 'true' &&
    env.LOCAL_DEV_AUTH === 'true' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(host)
  ) {
    const response = await env.ASSETS.fetch(
      new Request(new URL('/__test-source.json', request.url)),
    );
    const rows = await response.json();
    const target = new URL(url),
      language = target.pathname.split('/')[2],
      id = decodeURIComponent(target.pathname.split('/')[4] || '');
    const records = rows.filter((r) => r.language === language).map((r) => r.card);
    if (target.pathname.includes('/series/')) value = { id: 'tcgp', sets: [{ id: 'A1' }] };
    else if (target.pathname.split('/')[3] === 'sets') {
      const number = decodeURIComponent(target.pathname.split('/')[5] || '');
      const normalize = (n) => (/^\d+$/.test(String(n)) ? String(n).replace(/^0+/, '') : String(n));
      value = records.find((c) => c.set.id === id && normalize(c.localId) === normalize(number));
    } else if (id) value = records.find((c) => c.id === id);
    else {
      let result = records.filter(
        (c) =>
          (!target.searchParams.has('dexId') ||
            c.dexId.includes(Number(target.searchParams.get('dexId').replace('eq:', '')))) &&
          (!target.searchParams.get('name') ||
            c.name.toLowerCase().includes(target.searchParams.get('name').toLowerCase())) &&
          (!target.searchParams.get('localId') ||
            c.localId === target.searchParams.get('localId').replace('eq:', '')) &&
          (!target.searchParams.get('set.id') ||
            c.set.id === target.searchParams.get('set.id').replace('eq:', '')),
      );
      const page = Number(target.searchParams.get('pagination:page') || 1);
      result = result.slice((page - 1) * 24, page * 24);
      value = result.map((c) => ({ id: c.id, name: c.name, localId: c.localId, image: c.image }));
    }
    if (!value) throw new HttpError(404, 'This card was not found at the source.');
  } else {
    let response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        // Workers support manual or follow. Refuse source redirects through the status check below.
        redirect: 'manual',
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new HttpError(
        503,
        'External card search is unavailable. Your saved cards are still available.',
      );
    }
    if (response.status === 404) throw new HttpError(404, 'This card was not found at the source.');
    if (!response.ok)
      throw new HttpError(503, 'External card search is unavailable. Try again later.');
    const text = await response.text();
    if (text.length > 2 * 1024 * 1024)
      throw new HttpError(502, 'The card source sent too much data. Narrow your search.');
    try {
      value = JSON.parse(text);
    } catch {
      throw new HttpError(502, 'The card source sent an invalid reply.');
    }
  }
  if (JSON.stringify(value).length <= 65536) {
    if (temporary.size >= 32) temporary.delete(temporary.keys().next().value);
    temporary.set(url, { value, until: Date.now() + 300000 });
  }
  return value;
}

export async function cardDetails(env, request, language, sourceId) {
  const sourceUrl = sourceLocation(language, sourceId);
  const raw = await sourceRead(env, request, sourceUrl);
  if (
    raw?.id !== sourceId ||
    raw.category !== 'Pokemon' ||
    typeof raw.name !== 'string' ||
    !raw.set?.id ||
    !Array.isArray(raw.dexId) ||
    !raw.dexId.length ||
    !raw.dexId.every((n) => Number.isInteger(n) && n >= 1 && n <= 1025)
  )
    throw new HttpError(422, 'This source record is not a supported Pokémon card.');
  if ((await pocketSetIds(env, request)).has(raw.set.id))
    throw new HttpError(422, 'This is a digital Pocket card. This app records physical cards.');
  const id = await identifier('card', language, sourceId),
    setId = await identifier('set', language, raw.set.id);
  let variants = raw.variants_detailed;
  if (!Array.isArray(variants) || !variants.length)
    variants = [{ variantId: 'unknown', type: 'Finish not recorded' }];
  const seen = new Set(),
    result = [];
  for (const v of variants.slice(0, 100)) {
    const physical = Object.fromEntries(
      Object.entries(v).filter(([key]) => !['pricing', 'thirdParty', 'variantId'].includes(key)),
    );
    const key =
      v.variantId || hex(await crypto.subtle.digest('SHA-256', encoder.encode(encode(physical))));
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: await identifier('variant', id, key),
      type: v.type,
      subtype: v.subtype,
      foil: v.foil,
      size: v.size,
      stamps: Array.isArray(v.stamp) ? v.stamp : [],
      sourceId: v.variantId || null,
      sourceKey: key,
      raw: v,
    });
  }
  return {
    id,
    language,
    sourceId,
    number: String(raw.localId),
    name: raw.name,
    artist: raw.illustrator || null,
    image: raw.image || null,
    sourceUrl,
    setId,
    setSourceId: raw.set.id,
    setName: raw.set.name || raw.set.id,
    officialCount: raw.set.cardCount?.official ?? null,
    pokemonIds: [...new Set(raw.dexId)],
    variants: result,
    raw,
  };
}

export async function pocketSetIds(env, request) {
  // The English series lists the digital set IDs. The Japanese series route returns 404.
  const series = await sourceRead(env, request, 'https://api.tcgdex.net/v2/en/series/tcgp');
  if (!Array.isArray(series?.sets))
    throw new HttpError(
      502,
      'The card source did not return its card categories. Try again later.',
    );
  return new Set(series.sets.map((set) => set.id));
}

export function cardStatements(db, card, gate) {
  // A concurrent addition reuses the same IDs. Existing saved source data is preserved.
  const insert = (table, columns, values) =>
    db
      .prepare(
        `INSERT INTO ${table}(${columns}) SELECT ${values.map(() => '?').join(',')} WHERE ${gate?.sql || '1'} ON CONFLICT DO NOTHING`,
      )
      .bind(...values, ...(gate?.values || []));
  const statements = [
    insert(
      'catalogue_sets',
      'id,language,source_id,name,source_url,source_json,logo_url,symbol_url,official_count,total_count',
      [
        card.setId,
        card.language,
        card.setSourceId,
        card.setName,
        `https://api.tcgdex.net/v2/${card.language}/sets/${card.setSourceId}`,
        encode(card.raw.set),
        card.raw.set.logo || null,
        card.raw.set.symbol || null,
        card.raw.set.cardCount?.official ?? null,
        card.raw.set.cardCount?.total ?? null,
      ],
    ),
    insert(
      'catalogue_cards',
      'id,set_id,language,source_id,local_number,name,artist,image_url,source_updated,source_url,source_json',
      [
        card.id,
        card.setId,
        card.language,
        card.sourceId,
        card.number,
        card.name,
        card.artist,
        card.image,
        card.raw.updated || null,
        card.sourceUrl,
        encode(card.raw),
      ],
    ),
  ];
  for (const pokemonId of card.pokemonIds)
    statements.push(
      insert('catalogue_card_pokemon', 'card_id,pokedex_number', [card.id, pokemonId]),
    );
  for (const v of card.variants)
    statements.push(
      insert(
        'catalogue_variants',
        'id,card_id,source_id,source_key,type,subtype,foil,size,stamps_json,source_json',
        [
          v.id,
          card.id,
          v.sourceId,
          v.sourceKey,
          v.type || null,
          v.subtype || null,
          v.foil || null,
          v.size || null,
          encode(v.stamps),
          encode(v.raw),
        ],
      ),
    );
  return statements;
}

export function publicCard(card) {
  const { raw, setSourceId, ...rest } = card;
  return { ...rest, variants: card.variants.map(({ raw, sourceKey, sourceId, ...v }) => v) };
}
