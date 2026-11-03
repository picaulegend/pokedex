import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

test('the migration preserves old checks and delta reads use the account/version index', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  db.exec(readFileSync('migrations/0001_accounts_and_pokedex.sql', 'utf8'));
  db.exec(
    "INSERT INTO users VALUES('owner','owner@example.test','admin','2026-01-01'); INSERT INTO pokedex_progress VALUES('owner',1,1,3,'2026-01-01');",
  );
  db.exec(readFileSync('migrations/0002_cards_collections_and_sync.sql', 'utf8'));
  assert.deepEqual(
    { ...db.prepare('SELECT owned,legacy_owned,revision FROM pokedex_progress').get() },
    { owned: 1, legacy_owned: 1, revision: 3 },
  );
  const plan = db
    .prepare(
      'EXPLAIN QUERY PLAN SELECT * FROM pokedex_progress WHERE user_id=? AND sync_version>CASE WHEN ?>(SELECT COALESCE((SELECT version FROM account_sync WHERE user_id=?),1)) THEN 0 ELSE ? END',
    )
    .all('owner', 1, 'owner', 1);
  assert.ok(
    plan.some(
      (row) => row.detail.includes('pokedex_sync') && row.detail.includes('sync_version>?'),
    ),
  );
  db.close();
});

test('a repeated catalogue import preserves private inventory and collection membership', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  for (const name of ['0001_accounts_and_pokedex.sql', '0002_cards_collections_and_sync.sql'])
    db.exec(readFileSync(`migrations/${name}`, 'utf8'));
  const catalogue = readFileSync('tests/fixtures/catalogue.sql', 'utf8');
  db.exec(catalogue);
  const variant = db.prepare('SELECT id FROM catalogue_variants LIMIT 1').get().id;
  db.exec("INSERT INTO users VALUES('owner','owner@example.test','admin','2026-01-01');");
  db.prepare(
    'INSERT INTO inventory(user_id,variant_id,quantity,wanted,revision) VALUES(?,?,3,1,1)',
  ).run('owner', variant);
  db.exec("INSERT INTO collections(user_id,id,name,revision) VALUES('owner','goal','My goal',1)");
  db.prepare('INSERT INTO collection_cards VALUES(?,?,?)').run('owner', 'goal', variant);
  const cursor = db.prepare('SELECT version FROM account_sync').get().version;
  db.exec(catalogue);
  assert.equal(db.prepare('SELECT quantity FROM inventory').get().quantity, 3);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM collection_cards').get().count, 1);
  assert.equal(db.prepare('SELECT version FROM account_sync').get().version, cursor);
  assert.equal(db.prepare('PRAGMA foreign_key_check').get(), undefined);
  db.close();
});

test('the demand catalogue migration removes unused sample cards and keeps private records', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  for (const name of ['0001_accounts_and_pokedex.sql', '0002_cards_collections_and_sync.sql'])
    db.exec(readFileSync(`migrations/${name}`, 'utf8'));
  db.exec(readFileSync('tests/fixtures/catalogue.sql', 'utf8'));
  db.exec("INSERT INTO users VALUES('owner','owner@example.test','admin','2026-01-01');");
  const cards = db
    .prepare(
      'SELECT c.id,(SELECT id FROM catalogue_variants WHERE card_id=c.id LIMIT 1) AS variant_id FROM catalogue_cards c ORDER BY c.id',
    )
    .all();
  db.prepare(
    'INSERT INTO inventory(user_id,variant_id,quantity,wanted,revision) VALUES(?,?,2,0,1)',
  ).run('owner', cards[0].variant_id);
  db.prepare(
    'INSERT INTO inventory(user_id,variant_id,quantity,wanted,revision) VALUES(?,?,0,1,1)',
  ).run('owner', cards[1].variant_id);
  db.exec("INSERT INTO collections(user_id,id,name,revision) VALUES('owner','goal','Goal',1)");
  db.prepare('INSERT INTO collection_cards VALUES(?,?,?)').run(
    'owner',
    'goal',
    cards[2].variant_id,
  );
  const before = JSON.stringify(
    ['inventory', 'collections', 'collection_cards', 'pokedex_progress'].map((table) =>
      db.prepare(`SELECT * FROM ${table}`).all(),
    ),
  );
  db.exec(readFileSync('migrations/0003_demand_catalogue.sql', 'utf8'));
  const after = JSON.stringify(
    ['inventory', 'collections', 'collection_cards', 'pokedex_progress'].map((table) =>
      db.prepare(`SELECT * FROM ${table}`).all(),
    ),
  );
  assert.equal(before, after);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM catalogue_cards').get().count, 3);
  assert.ok(db.prepare('SELECT COUNT(*) AS count FROM legacy_card_locators').get().count > 3);
  assert.equal(db.prepare('PRAGMA foreign_key_check').get(), undefined);
  db.close();
});
