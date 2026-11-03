import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { runWranglerJson } from './lib/wrangler.mjs';
import { normalizeSets, setImportSql } from '../src/set-reference.js';

const fixture = process.argv.includes('--fixture'),
  apply = process.argv.includes('--apply'),
  remote = process.argv.includes('--remote'),
  test = process.argv.includes('--test');
if ((remote && (fixture || test)) || (test && !fixture))
  throw new Error('Test set data must stay in the local test database.');
async function fetchJson(path) {
  const response = await fetch(`https://api.tcgdex.net/v2/${path}`, {
    signal: AbortSignal.timeout(20000),
    redirect: 'error',
  });
  if (!response.ok)
    throw new Error(`Set reference request failed (${response.status}). No import was applied.`);
  return response.json();
}
const input = fixture
  ? JSON.parse(await readFile('tests/fixtures/set-reference.json', 'utf8'))
  : null;
const [en, ja, pocket] = input
  ? [input.en, input.ja, { sets: input.digitalIds.map((id) => ({ id })) }]
  : await Promise.all([fetchJson('en/sets'), fetchJson('ja/sets'), fetchJson('en/series/tcgp')]);
if (!Array.isArray(pocket.sets))
  throw new Error('Missing digital set classification. No import was applied.');
const digital = new Set(pocket.sets.map((s) => s.id));
const sets = [];
for (const [language, rows] of [
  ['en', en],
  ['ja', ja],
]) {
  const canonical = new Map();
  for (const id of new Set(rows.map((r) => r.id))) {
    if (new Set(rows.filter((r) => r.id === id).map((r) => r.name)).size > 1) {
      // A full set reply verifies its identity. normalizeSets discards the cards field.
      canonical.set(id, await fetchJson(`${language}/sets/${encodeURIComponent(id)}`));
    }
  }
  sets.push(...(await normalizeSets(language, rows, digital, canonical)));
}
const checkedAt = new Date().toISOString(),
  sql = setImportSql(sets, checkedAt);
const directory = test ? '.wrangler/test-set-reference' : 'work/set-reference';
await mkdir(directory, { recursive: true });
const file = `${directory}/import.sql`;
await writeFile(file, sql);
await writeFile(`${directory}/sets.json`, JSON.stringify({ checkedAt, sets }, null, 2) + '\n');
const excludedDigital = [...en, ...ja].filter((s) => digital.has(s.id)).length;
console.log(
  JSON.stringify({
    physicalSets: {
      en: sets.filter((s) => s.language === 'en').length,
      ja: sets.filter((s) => s.language === 'ja').length,
    },
    excludedDigital,
    duplicateRows: en.length + ja.length - excludedDigital - sets.length,
    sourceConflicts: sets
      .filter((s) => s.referenceNote)
      .map((s) => ({ language: s.language, sourceId: s.sourceId, note: s.referenceNote })),
    sqlBytes: Buffer.byteLength(sql),
    cardRecordsAdded: 0,
    prepared: file,
  }),
);
if (apply) {
  const args = [
    'd1',
    'execute',
    'carddex-preview',
    remote ? '--remote' : '--local',
    ...(remote ? [] : ['--persist-to', test ? '.wrangler/test-state' : '.wrangler/preview-state']),
    '--file',
    file,
  ];
  const result = runWranglerJson(args);
  console.log(
    JSON.stringify({
      applied: remote ? 'remote' : test ? 'local tests' : 'local preview',
      rowsWritten: result.reduce((sum, r) => sum + (r.meta?.rows_written || 0), 0),
      databaseBytes: result.at(-1)?.meta?.size_after,
    }),
  );
}
