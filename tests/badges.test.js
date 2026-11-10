import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { badgeProgress, checkBadges } from '../src/badges.js';
import { saveRecord } from '../src/records.js';
import { badges, pokemonTotal } from '../src/client/badge-definitions.js';

const card = (id, setId = 'one', language = 'en') => ({ setId, language, pokemonIds: [id] });

test('evolution branches count once and specialist counts come from the same species', () => {
  const progress = badgeProgress(
    [
      ...[43, 44, 45, 182].map((id) => card(id)),
      ...Array.from({ length: 10 }, () => card(1, 'first')),
      ...Array.from({ length: 4 }, (_, index) => card(2, `set-${index}`)),
    ],
    false,
  );
  assert.deepEqual(progress['evolution-expert'], [1]);
  assert.deepEqual(progress['starter-master'], [0]);
  assert.deepEqual(progress['species-specialist'], [4, 4]);
});

test('a collection with all species and both languages for 25 species meets every rule', () => {
  const cards = [
    ...Array.from({ length: pokemonTotal }, (_, index) => card(index + 1, `set-${index % 5}`)),
    ...Array.from({ length: 25 }, (_, index) => card(index + 1, 'japanese', 'ja')),
    ...Array.from({ length: 8 }, (_, index) => card(1, `set-${index % 5}`)),
  ];
  const progress = badgeProgress(cards, true);
  assert.deepEqual(progress['across-languages'], [25]);
  assert.deepEqual(progress['generation-master'], [9]);
  for (const { id, targets } of badges)
    assert.ok(
      targets.every(([target], index) => progress[id][index] >= target),
      id,
    );
});

test('badge checks backfill, skip unrelated writes, and keep awards after a sale', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec('PRAGMA foreign_keys=ON');
  const migration = '0013_trainer_badges.sql';
  for (const name of readdirSync('migrations')
    .sort()
    .filter((name) => name < migration))
    db.exec(readFileSync(`migrations/${name}`, 'utf8'));
  db.exec(
    "INSERT INTO users (id,email,role,created_at) VALUES ('owner','owner@example.test','admin','2026-01-01'),('member','member@example.test','member','2026-01-01')",
  );
  const goal = crypto.randomUUID();
  db.prepare("INSERT INTO collections(user_id,id,name,revision) VALUES('owner',?,'Goal',1)").run(
    goal,
  );
  for (let i = 0; i < 5; i++)
    db.prepare(
      "INSERT INTO catalogue_sets (id,language,source_id,name,source_url,source_json) VALUES(?,'en',?,?,'','{}')",
    ).run(`set-${i}`, `set-${i}`, `Set ${i}`);
  const printing = db.prepare(
    "INSERT INTO catalogue_cards (id,set_id,language,source_id,local_number,name,source_url,source_json) VALUES(?,?,'en',?,?,?,'','{}')",
  );
  const variant = db.prepare(
    "INSERT INTO catalogue_variants (id,card_id,source_key,stamps_json,source_json) VALUES(?,?,?,'[]','{}')",
  );
  const own = db.prepare(
    "INSERT INTO inventory (user_id,variant_id,quantity,wanted,revision) VALUES('owner',?,?,0,1)",
  );
  const member = db.prepare(
    "INSERT INTO collection_cards (user_id,collection_id,variant_id) VALUES('owner',?,?)",
  );
  const variants = [];
  for (let i = 0; i < 50; i++) {
    const id = crypto.randomUUID();
    variants.push(id);
    printing.run(`card-${i}`, `set-${i % 5}`, `card-${i}`, String(i), `Card ${i}`);
    variant.run(id, `card-${i}`, 'regular');
    own.run(id, 1);
    if (i < 25) member.run(goal, id);
  }
  const extraFinish = crypto.randomUUID();
  variant.run(extraFinish, 'card-0', 'holo');
  member.run(goal, extraFinish);
  own.run(extraFinish, 0);
  db.exec(readFileSync(`migrations/${migration}`, 'utf8'));
  for (const name of readdirSync('migrations')
    .sort()
    .filter((name) => name > migration))
    db.exec(readFileSync(`migrations/${name}`, 'utf8'));

  let inventoryReads = 0;
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...params) {
            const query = db.prepare(sql);
            return {
              first: async () => query.get(...params),
              execute() {
                if (sql.includes('SELECT DISTINCT v.card_id')) inventoryReads++;
                return query.columns().length
                  ? { results: query.all(...params) }
                  : { results: [], meta: query.run(...params) };
              },
            };
          },
        };
      },
      async batch(statements) {
        db.exec('BEGIN');
        try {
          const result = statements.map((statement) => statement.execute());
          db.exec('COMMIT');
          return result;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
    },
  };
  const request = (data = {}, method = 'POST') =>
    new Request('http://localhost/api', {
      method,
      headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  const check = async (id = 'owner') =>
    (await (await checkBadges(request(), env, { id })).json()).badges;
  const editGoal = (name, variantIds, baseRevision) =>
    saveRecord(
      request(
        { name, variantIds, baseRevision, deleted: false, mutationId: crypto.randomUUID() },
        'PUT',
      ),
      env,
      { id: 'owner' },
      'collection',
      goal,
    );

  const initial = await check();
  assert.deepEqual(initial.progress['first-binder'], [50, 5]);
  assert.ok(initial.earned['first-binder']);
  assert.equal(initial.earned['goal-complete'], undefined);
  assert.equal(inventoryReads, 1);
  const quantity = db.prepare(
    "UPDATE inventory SET quantity=? WHERE user_id='owner' AND variant_id=?",
  );
  quantity.run(2, variants[0]);
  const choices = variants.slice(0, 25);
  assert.equal((await editGoal('Rename', [...choices, extraFinish], 1)).status, 200);
  assert.deepEqual(await check(), initial);
  assert.equal(inventoryReads, 1);

  assert.equal((await editGoal('Rename', choices, 2)).status, 200);
  const complete = await check();
  assert.ok(complete.earned['goal-complete']);
  assert.equal(inventoryReads, 2);
  quantity.run(0, variants[0]);
  const sold = await check();
  assert.deepEqual(sold.progress['first-binder'], [49, 5]);
  assert.deepEqual(sold.progress['goal-complete'], [0]);
  assert.deepEqual(sold.earned, complete.earned);
  assert.deepEqual((await check('member')).earned, {});
});
