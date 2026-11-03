import { identifier } from './identifiers.js';

const assetUrl = (value) => {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'assets.tcgdex.net' ? url.href : null;
  } catch {
    return null;
  }
};
const count = (value) => (Number.isInteger(value) && value >= 0 && value <= 100000 ? value : null);

export async function normalizeSets(
  language,
  rows,
  digitalIds = new Set(),
  canonicalSets = new Map(),
) {
  if (
    !['en', 'ja'].includes(language) ||
    !Array.isArray(rows) ||
    !rows.length ||
    rows.length > 3000
  )
    throw new Error('Invalid set reference list.');
  const seen = new Set(),
    result = [];
  for (const original of rows) {
    if (
      typeof original.id !== 'string' ||
      !/^[a-zA-Z0-9.+-]{1,100}$/.test(original.id) ||
      typeof original.name !== 'string' ||
      !original.name.trim() ||
      original.name.length > 200
    )
      throw new Error('Invalid source set.');
    if (seen.has(original.id)) continue;
    const names = [...new Set(rows.filter((r) => r.id === original.id).map((r) => r.name))];
    const canonical = canonicalSets.get(original.id);
    if (names.length > 1 && (canonical?.id !== original.id || !names.includes(canonical.name)))
      throw new Error(
        `Conflicting set reference ${language}/${original.id} needs source verification.`,
      );
    const row = names.length > 1 ? canonical : original;
    seen.add(row.id);
    if (digitalIds.has(row.id)) continue;
    // Do not carry a cards field or any other checklist data into the database.
    const referenceNote =
      names.length > 1
        ? `The source also lists ${names.filter((name) => name !== row.name).join(' / ')} under this reference. Confirm the card image.`
        : null;
    const brief = {
      id: row.id,
      name: row.name,
      logo: assetUrl(row.logo),
      symbol: assetUrl(row.symbol),
      cardCount: { official: count(row.cardCount?.official), total: count(row.cardCount?.total) },
    };
    if (referenceNote) brief.sourceNames = names;
    result.push({
      id: await identifier('set', language, row.id),
      language,
      sourceId: row.id,
      name: row.name,
      logo: brief.logo,
      symbol: brief.symbol,
      officialCount: brief.cardCount.official,
      totalCount: brief.cardCount.total,
      referenceNote,
      sourceUrl: `https://api.tcgdex.net/v2/${language}/sets/${encodeURIComponent(row.id)}`,
      sourceJson: JSON.stringify(brief),
    });
  }
  return result;
}

const quote = (value) =>
  value === null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : `'${String(value).replaceAll("'", "''")}'`;
export function setImportSql(sets, checkedAt) {
  const statements = ['-- Shared set metadata only. No card records or checklists.'];
  const columns = [
    'id',
    'language',
    'source_id',
    'name',
    'source_url',
    'source_json',
    'logo_url',
    'symbol_url',
    'official_count',
    'total_count',
    'reference_note',
  ];
  const mutable = columns.filter((c) => !['id', 'language', 'source_id'].includes(c));
  for (const row of sets) {
    const values = [
      row.id,
      row.language,
      row.sourceId,
      row.name,
      row.sourceUrl,
      row.sourceJson,
      row.logo,
      row.symbol,
      row.officialCount,
      row.totalCount,
      row.referenceNote,
    ];
    statements.push(
      `INSERT INTO catalogue_sets(${columns.join(',')}) VALUES(${values.map(quote).join(',')}) ON CONFLICT(id) DO UPDATE SET ${mutable.map((c) => `${c}=excluded.${c}`).join(',')} WHERE ${mutable.map((c) => `catalogue_sets.${c} IS NOT excluded.${c}`).join(' OR ')};`,
    );
  }
  for (const language of [...new Set(sets.map((r) => r.language))])
    statements.push(
      `INSERT INTO set_reference_imports(language,checked_at,set_count) VALUES(${quote(language)},${quote(checkedAt)},${sets.filter((r) => r.language === language).length}) ON CONFLICT(language) DO UPDATE SET checked_at=excluded.checked_at,set_count=excluded.set_count;`,
    );
  return statements.join('\n') + '\n';
}
