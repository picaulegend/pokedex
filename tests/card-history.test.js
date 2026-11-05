import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import {
  emptyHistory,
  validateHistory,
  removeCopies,
  remaining,
  inventoryChange,
  mergeInventory,
  hasHistory,
} from '../src/client/card-history-model.js';
import { saveRecord, syncRecords, catalogue } from '../src/records.js';

const id = () => crypto.randomUUID();
const entry = (quantity = 2) => ({
  id: id(),
  method: 'bought',
  quantity,
  date: '2026-11-01',
  source: 'Private shop',
  amount: '12.50',
  currency: 'EUR',
  notes: 'Private note',
});
const disposition = {
  reason: 'sold',
  date: '2026-11-05',
  person: 'Private buyer',
  amount: '18',
  currency: 'EUR',
  notes: 'Sold at a card club',
};
function owned(quantity = 2) {
  return {
    quantity,
    wanted: false,
    history: validateHistory({ entries: [entry(quantity)], changes: [], plan: null }, quantity),
  };
}

test('removing part of a purchase keeps its original details and received amount separate', () => {
  const row = owned(3),
    original = structuredClone(row);
  const result = removeCopies(
    row,
    [{ entryId: row.history.entries[0].id, quantity: 1 }],
    disposition,
    id(),
  );
  assert.equal(result.quantity, 2);
  assert.equal(remaining(result.history.entries[0], result.history), 2);
  assert.equal(result.history.entries[0].amount, '12.50');
  assert.equal(result.history.changes[0].amount, '18.00');
  assert.deepEqual(row, original);
});

test('unknown copies also retain a record when the last copy is removed', () => {
  const result = inventoryChange(
    { quantity: 2, wanted: true, history: emptyHistory() },
    { quantity: 0, wanted: true },
    id(),
  );
  assert.equal(result.quantity, 0);
  assert.equal(result.wanted, true);
  assert.equal(hasHistory(result), true);
  assert.equal(result.history.entries[0].originUnknown, true);
  assert.equal(result.history.changes[0].quantity, 2);
  assert.equal(result.history.changes[0].date, '');
  assert.equal(remaining(result.history.entries[0], result.history), 0);
});

test('history rejects invalid allocations, duplicate IDs, invalid dates, and unsafe shop links', () => {
  const row = owned(1),
    removed = removeCopies(
      row,
      [{ entryId: row.history.entries[0].id, quantity: 1 }],
      disposition,
      id(),
    );
  assert.throws(() =>
    validateHistory(
      { ...row.history, entries: [row.history.entries[0], row.history.entries[0]] },
      2,
    ),
  );
  assert.throws(() =>
    validateHistory(
      { ...row.history, entries: [{ ...row.history.entries[0], date: '2026-02-30' }] },
      1,
    ),
  );
  assert.throws(() =>
    removeCopies(row, [{ entryId: row.history.entries[0].id, quantity: 2 }], disposition, id()),
  );
  assert.throws(
    () => inventoryChange(removed, { quantity: 0, wanted: false, history: emptyHistory() }, id()),
    /Keep the history/,
  );
  const plan = { amount: '', currency: 'EUR', shop: '', link: 'javascript:alert(1)', notes: '' };
  assert.throws(() => validateHistory({ ...row.history, plan }, 1), /HTTP or HTTPS/);
  assert.throws(() =>
    validateHistory(
      { ...row.history, entries: [{ ...row.history.entries[0], currency: 'constructor' }] },
      1,
    ),
  );
});

test('restoring an older backup cannot revive a copy whose later removal is saved', () => {
  const old = owned(1);
  const current = removeCopies(
    old,
    [{ entryId: old.history.entries[0].id, quantity: 1 }],
    disposition,
    id(),
  );
  const merged = mergeInventory(current, old);
  assert.equal(merged.quantity, 0);
  assert.equal(merged.history.changes.length, 1);
  assert.equal(mergeInventory(merged, old).quantity, 0);
  assert.equal(
    mergeInventory(current, { quantity: 1, wanted: false, history: emptyHistory() }).quantity,
    0,
  );
});

test('backup merge keeps different copies, is repeatable, and preserves later details', () => {
  const first = owned(1),
    second = owned(2);
  const merged = mergeInventory(first, second);
  assert.equal(merged.quantity, 3);
  assert.equal(merged.history.entries.length, 2);
  assert.deepEqual(mergeInventory(merged, second), merged);
});

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  for (const name of readdirSync('migrations').sort())
    db.exec(readFileSync(`migrations/${name}`, 'utf8'));
  db.exec(readFileSync('tests/fixtures/catalogue.sql', 'utf8'));
  db.exec(
    "INSERT INTO users VALUES('owner','owner@example.test','admin','2026-01-01'); INSERT INTO users VALUES('other','other@example.test','member','2026-01-01');",
  );
  const variantId = db.prepare('SELECT id FROM catalogue_variants LIMIT 1').get().id;
  const env = {
    DB: {
      prepare(sql) {
        const bound = (values = []) => ({
          sql,
          values,
          first: async () => db.prepare(sql).get(...values) || null,
          all: async () => ({ results: db.prepare(sql).all(...values) }),
        });
        return { ...bound(), bind: (...values) => bound(values) };
      },
      async batch(statements) {
        db.exec('BEGIN');
        try {
          const results = statements.map(({ sql, values }) => {
            const statement = db.prepare(sql);
            return statement.columns().length
              ? { results: statement.all(...values) }
              : { results: [], meta: statement.run(...values) };
          });
          db.exec('COMMIT');
          return results;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
    },
  };
  const write = (body, user = 'owner') =>
    saveRecord(
      new Request(`http://127.0.0.1/api/inventory/${variantId}`, {
        method: 'PUT',
        headers: { Origin: 'http://127.0.0.1', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      env,
      { id: user },
      'inventory',
      variantId,
    );
  return { db, env, variantId, write };
}

test('private history saves, retries, syncs, and stale device checks share the inventory revision', async () => {
  const { db, env, variantId, write } = fixture();
  try {
    const row = owned(1);
    const initial = await (await write({ ...row, baseRevision: 0, mutationId: id() })).json();
    const cursor = db
      .prepare("SELECT version FROM account_sync WHERE user_id='owner'")
      .get().version;
    const removal = removeCopies(
      initial.state,
      [{ entryId: row.history.entries[0].id, quantity: 1 }],
      disposition,
      id(),
    );
    const request = { ...removal, baseRevision: 1, mutationId: id() };
    assert.equal((await write(request)).status, 200);
    assert.equal((await write(request)).status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM record_mutations').get().n, 2);
    const stale = await write({ ...row, baseRevision: 1, mutationId: id() });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).state.history.changes.length, 1);
    const synced = await (
      await syncRecords(env, { id: 'owner' }, new URL(`http://127.0.0.1/api/sync?after=${cursor}`))
    ).json();
    assert.equal(synced.inventory[0].quantity, 0);
    assert.equal(synced.inventory[0].history.changes[0].person, 'Private buyer');
    const other = await (
      await syncRecords(env, { id: 'other' }, new URL('http://127.0.0.1/api/sync'))
    ).json();
    assert.deepEqual(other.inventory, []);
    const pokemon = db
      .prepare(
        'SELECT p.pokedex_number FROM catalogue_card_pokemon p JOIN catalogue_variants v ON v.card_id=p.card_id WHERE v.id=?',
      )
      .get(variantId).pokedex_number;
    const personal = await (
      await catalogue(
        env,
        new URL(`http://127.0.0.1/api/catalogue?pokemon=${pokemon}&personal=1`),
        { id: 'owner' },
      )
    ).json();
    assert.ok(personal.cards.some((card) => card.variants.some((v) => v.id === variantId)));
    assert.equal(db.prepare('PRAGMA foreign_key_check').get(), undefined);
  } finally {
    db.close();
  }
});

test('a quantity-only client keeps history and creates an unknown removal without repeating it', async () => {
  const { db, write } = fixture();
  try {
    const row = owned(2);
    await write({ ...row, baseRevision: 0, mutationId: id() });
    const request = { quantity: 0, wanted: false, baseRevision: 1, mutationId: id() };
    const result = await (await write(request)).json();
    assert.equal(result.state.history.entries[0].source, 'Private shop');
    assert.equal(result.state.history.changes[0].reason, 'removed');
    assert.equal((await write(request)).status, 200);
    assert.equal(
      JSON.parse(db.prepare('SELECT history_json FROM inventory').get().history_json).changes
        .length,
      1,
    );
  } finally {
    db.close();
  }
});

test('the history migration preserves existing account records and sync positions', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for (const name of readdirSync('migrations')
      .sort()
      .filter((name) => name < '0006'))
      db.exec(readFileSync(`migrations/${name}`, 'utf8'));
    db.exec(readFileSync('tests/fixtures/catalogue.sql', 'utf8'));
    db.exec("INSERT INTO users VALUES('owner','owner@example.test','admin','2026-01-01')");
    const variant = db.prepare('SELECT id FROM catalogue_variants LIMIT 1').get().id;
    db.prepare(
      'INSERT INTO inventory(user_id,variant_id,quantity,wanted,revision) VALUES(?,?,7,1,4)',
    ).run('owner', variant);
    const before = { ...db.prepare('SELECT * FROM inventory').get() };
    const cursor = db.prepare('SELECT version FROM account_sync').get().version;
    db.exec(readFileSync('migrations/0006_card_history.sql', 'utf8'));
    const after = { ...db.prepare('SELECT * FROM inventory').get() };
    assert.deepEqual(JSON.parse(after.history_json), emptyHistory());
    delete after.history_json;
    assert.deepEqual(after, before);
    assert.equal(db.prepare('SELECT version FROM account_sync').get().version, cursor);
  } finally {
    db.close();
  }
});
