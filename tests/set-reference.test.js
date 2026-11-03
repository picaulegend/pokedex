import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { normalizeSets, setImportSql } from '../src/set-reference.js';
import { sourceLocation } from '../src/card-source.js';

const fixture = JSON.parse(readFileSync('tests/fixtures/set-reference.json', 'utf8'));
const migrations = [
  '0001_accounts_and_pokedex.sql',
  '0002_cards_collections_and_sync.sql',
  '0003_demand_catalogue.sql',
  '0004_set_reference.sql',
];

test('set metadata excludes digital sets and card lists and accepts Japanese plus references', async () => {
  const rows = await normalizeSets(
    'ja',
    [
      {
        id: 'SM1+',
        name: 'サン＆ムーン',
        cards: [{ id: 'must-not-be-stored' }],
        logo: 'https://other.test/image',
        cardCount: { official: 51, total: 60 },
      },
      { id: 'A1', name: 'Digital set', cardCount: { official: 226, total: 286 } },
    ],
    new Set(['A1']),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceId, 'SM1+');
  assert.equal(rows[0].logo, null);
  assert.equal(JSON.parse(rows[0].sourceJson).cards, undefined);
  assert.match(sourceLocation('ja', 'SM1+-001'), /SM1%2B-001$/);
});

test('conflicting source references require verification and keep a clear note', async () => {
  const rows = [
    { id: 'BW3a', name: 'First name', cardCount: { official: 52, total: 52 } },
    { id: 'BW3a', name: 'Other name', cardCount: { official: 52, total: 52 } },
  ];
  await assert.rejects(normalizeSets('ja', rows), /needs source verification/);
  const result = await normalizeSets(
    'ja',
    rows,
    new Set(),
    new Map([['BW3a', { ...rows[0], cards: [{ id: 'unused' }] }]]),
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'First name');
  assert.match(result[0].referenceNote, /Other name/);
  assert.equal(JSON.parse(result[0].sourceJson).cards, undefined);
});

test('set reference imports add no cards and preserve existing cards, foreign keys, and private records', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  for (const name of migrations) db.exec(readFileSync(`migrations/${name}`, 'utf8'));
  const sets = [
    ...(await normalizeSets('en', fixture.en, new Set(fixture.digitalIds))),
    ...(await normalizeSets('ja', fixture.ja, new Set(fixture.digitalIds))),
  ];
  const sql = setImportSql(sets, '2026-11-01T12:00:00.000Z');
  db.exec(sql);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM catalogue_sets').get().count, 6);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM catalogue_cards').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM catalogue_variants').get().count, 0);
  db.exec(readFileSync('tests/fixtures/catalogue.sql', 'utf8'));
  db.exec("INSERT INTO users VALUES('owner','owner@example.test','admin','2026-01-01');");
  const variant = db.prepare('SELECT id FROM catalogue_variants LIMIT 1').get().id;
  db.prepare(
    'INSERT INTO inventory(user_id,variant_id,quantity,wanted,revision) VALUES(?,?,2,1,1)',
  ).run('owner', variant);
  const snapshot = () =>
    JSON.stringify(
      [
        'catalogue_cards',
        'catalogue_variants',
        'catalogue_card_pokemon',
        'users',
        'pokedex_progress',
        'inventory',
      ].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()),
    );
  const before = snapshot();
  db.exec(sql);
  db.exec(sql);
  assert.equal(snapshot(), before);
  assert.equal(db.prepare('PRAGMA foreign_key_check').get(), undefined);
  assert.equal(
    db
      .prepare(
        "SELECT official_count FROM catalogue_sets WHERE language='en' AND source_id='sv03.5'",
      )
      .get().official_count,
    165,
  );
  assert.equal(
    db
      .prepare(
        "SELECT json_type(source_json,'$.cards') AS cards FROM catalogue_sets WHERE language='en' AND source_id='sv03.5'",
      )
      .get().cards,
    null,
  );
  db.close();
});
