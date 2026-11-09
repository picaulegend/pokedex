import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { addCollectionCard } from '../src/card-add.js';
import { cardDetails } from '../src/card-source.js';

async function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  for (const name of readdirSync('migrations').sort())
    db.exec(readFileSync(`migrations/${name}`, 'utf8'));
  db.exec(
    "INSERT INTO users (id,email,role,created_at) VALUES('owner','owner@example.test','admin','2026-01-01'); INSERT INTO users (id,email,role,created_at) VALUES('other','other@example.test','member','2026-01-01')",
  );
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO collections(user_id,id,name,revision) VALUES(?,?,?,1)').run(
    'owner',
    id,
    'Goal',
  );
  const env = {
    LOCAL_DEV_AUTH: 'true',
    CATALOGUE_TEST_SOURCE: 'true',
    ASSETS: {
      fetch: async () => new Response(readFileSync('tests/fixtures/source-cards.json', 'utf8')),
    },
    DB: {
      prepare(sql) {
        return {
          bind(...values) {
            return { sql, values, first: async () => db.prepare(sql).get(...values) || null };
          },
        };
      },
      async batch(statements) {
        db.exec('BEGIN');
        try {
          const result = statements.map(({ sql, values }) => {
            const statement = db.prepare(sql);
            return statement.columns().length
              ? { results: statement.all(...values) }
              : { results: [], meta: statement.run(...values) };
          });
          db.exec('COMMIT');
          return result;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
    },
  };
  const card = await cardDetails(env, new Request('http://127.0.0.1/'), 'en', 'sv03.5-059');
  const body = {
    language: card.language,
    sourceId: card.sourceId,
    variantId: card.variants[0].id,
    quantity: 0,
    wanted: false,
    baseRevision: 0,
    collectionId: id,
    collectionRevision: 1,
    goalOnly: true,
    mutationId: crypto.randomUUID(),
  };
  return { db, env, card, body };
}

test('one collection add imports a goal without creating wanted inventory and retries do not repeat it', async () => {
  const { db, env, card, body } = await fixture();
  try {
    const response = await addCollectionCard(env, { id: 'owner' }, body, card);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.collection.variantIds, [body.variantId]);
    assert.equal(result.state.wanted, false);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inventory').get().n, 0);
    db.prepare(
      'INSERT INTO inventory(user_id,variant_id,quantity,wanted,revision) VALUES(?,?,2,1,1)',
    ).run('owner', body.variantId);
    const before = db.prepare('SELECT revision FROM collections').get().revision;
    assert.equal((await addCollectionCard(env, { id: 'owner' }, body, card)).status, 200);
    assert.equal(db.prepare('SELECT revision FROM collections').get().revision, before);
    assert.deepEqual(
      { ...db.prepare('SELECT quantity,wanted,revision FROM inventory').get() },
      { quantity: 2, wanted: 1, revision: 1 },
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM catalogue_cards').get().n, 1);
    assert.equal(db.prepare('PRAGMA foreign_key_check').get(), undefined);
    assert.equal(
      (
        await addCollectionCard(
          env,
          { id: 'owner' },
          { ...body, quantity: 1, goalOnly: false },
          card,
        )
      ).status,
      409,
    );
  } finally {
    db.close();
  }
});

test('a stale or other-account collection cannot import a card or change ownership', async () => {
  const { db, env, card, body } = await fixture();
  try {
    for (const [user, change] of [
      [{ id: 'other' }, body],
      [{ id: 'owner' }, { ...body, collectionRevision: 2 }],
    ]) {
      assert.equal((await addCollectionCard(env, user, change, card)).status, 409);
      for (const table of ['catalogue_cards', 'inventory', 'collection_cards', 'record_mutations'])
        assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
    }
  } finally {
    db.close();
  }
});

test('owning a new card in a goal saves ownership, progress, and membership together', async () => {
  const { db, env, card, body } = await fixture();
  try {
    const response = await addCollectionCard(
      env,
      { id: 'owner' },
      { ...body, quantity: 1, goalOnly: false },
      card,
    );
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.state.quantity, 1);
    assert.equal(result.state.wanted, false);
    assert.equal(result.collection.variantIds.length, 1);
    assert.ok(result.progress.some((row) => row.pokemonId === 59 && row.owned));
  } finally {
    db.close();
  }
});
