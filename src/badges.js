import { json, readBody } from './api.js';
import { HttpError } from './auth.js';
import { badgeRulesVersion, badges, pokemonTotal } from './client/badge-definitions.js';
import { evolutionLines } from './client/evolution-lines.js';

// National Pokédex ranges match the generations in the app.
const generationEnds = [151, 251, 386, 493, 649, 721, 809, 905, pokemonTotal];
const starterTrios = [
  [1, 4, 7],
  [152, 155, 158],
  [252, 255, 258],
  [387, 390, 393],
  [495, 498, 501],
  [650, 653, 656],
  [722, 725, 728],
  [810, 813, 816],
  [906, 909, 912],
];
const threeStageLines = evolutionLines.filter((line) => line.length === 3);

export function badgeProgress(cards, completedGoal) {
  const sets = new Set();
  const species = new Map();
  // The query gives one row for each owned printing, across all its finishes.
  for (const card of cards) {
    sets.add(card.setId);
    for (const id of card.pokemonIds) {
      if (!species.has(id))
        species.set(id, { printings: 0, sets: new Set(), languages: new Set() });
      const stats = species.get(id);
      stats.printings++;
      stats.sets.add(card.setId);
      stats.languages.add(card.language);
    }
  }
  let bilingual = 0;
  let specialist = [0, 0];
  let bestScore = -1;
  for (const stats of species.values()) {
    if (stats.languages.has('en') && stats.languages.has('ja')) bilingual++;
    const score = Math.min(stats.printings / 10, stats.sets.size / 4);
    if (score > bestScore) {
      bestScore = score;
      specialist = [stats.printings, stats.sets.size];
    }
  }
  const completedFamilies = new Set(
    threeStageLines.filter((line) => line.every((id) => species.has(id))).map((line) => line[0]),
  );
  const starterLines = Math.max(
    ...starterTrios.map((trio) => trio.filter((id) => completedFamilies.has(id)).length),
  );
  let generations = 0;
  for (const [index, end] of generationEnds.entries()) {
    const start = (generationEnds[index - 1] || 0) + 1;
    let id = start;
    while (id <= end && species.has(id)) id++;
    if (id > end) generations++;
  }
  return {
    'first-binder': [cards.length, sets.size],
    'century-club': [species.size],
    'evolution-expert': [completedFamilies.size],
    'starter-master': [starterLines],
    'species-specialist': specialist,
    'across-languages': [bilingual],
    'goal-complete': [Number(completedGoal)],
    'pokedex-veteran': [species.size],
    'generation-master': [generations],
    'pokedex-complete': [species.size],
  };
}

// Run immediately after the membership insert or delete in the same batch.
export function markBadgeChange(env, userId) {
  return env.DB.prepare(
    `INSERT INTO trainer_badge_checks(user_id,revision)
    SELECT ?,1 WHERE changes()>0
    ON CONFLICT(user_id) DO UPDATE SET revision=revision+1`,
  ).bind(userId);
}

export function badgeQuery(env, userId) {
  return env.DB.prepare(
    `SELECT COALESCE(b.revision,0) AS revision, COALESCE(b.checked_revision,-1) AS checkedRevision,
      COALESCE(b.rules_version,0) AS rulesVersion, COALESCE(b.progress_json,'{}') AS progress,
      (SELECT json_group_object(badge_id,awarded_at) FROM trainer_badges WHERE user_id=u.id) AS earned
    FROM users u LEFT JOIN trainer_badge_checks b ON b.user_id=u.id WHERE u.id=?`,
  ).bind(userId);
}

export function badgeSnapshot(row) {
  return {
    checkedRevision: row.checkedRevision,
    rulesVersion: row.rulesVersion,
    needsCheck: row.rulesVersion < badgeRulesVersion || row.checkedRevision < row.revision,
    progress: JSON.parse(row.progress),
    earned: JSON.parse(row.earned),
  };
}

export async function checkBadges(request, env, user) {
  const body = await readBody(request, 32);
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).length)
    throw new HttpError(400, 'Send an empty badge check.');
  return json({ badges: await evaluateBadges(env, user.id) });
}

export async function evaluateBadges(env, userId) {
  const status = badgeQuery(env, userId);
  const current = badgeSnapshot(await status.first());
  if (!current.needsCheck) return current;

  const [state, cards, goal] = await env.DB.batch([
    status,
    env.DB.prepare(
      `SELECT c.id, c.set_id AS setId, c.language,
        (SELECT json_group_array(pokedex_number) FROM catalogue_card_pokemon WHERE card_id=c.id) AS pokemonIds
      FROM (SELECT DISTINCT v.card_id FROM inventory i JOIN catalogue_variants v ON v.id=i.variant_id
        WHERE i.user_id=? AND i.quantity>0) owned
      JOIN catalogue_cards c ON c.id=owned.card_id ORDER BY c.id`,
    ).bind(userId),
    env.DB.prepare(
      `SELECT 1 FROM collections c JOIN collection_cards g ON g.user_id=c.user_id AND g.collection_id=c.id
      JOIN catalogue_variants v ON v.id=g.variant_id
      LEFT JOIN inventory i ON i.user_id=g.user_id AND i.variant_id=g.variant_id
      WHERE c.user_id=? AND c.deleted=0
      GROUP BY c.id HAVING COUNT(DISTINCT v.card_id)>=25 AND MIN(COALESCE(i.quantity,0))>0 LIMIT 1`,
    ).bind(userId),
  ]);
  const snapshot = state.results[0];
  if (!badgeSnapshot(snapshot).needsCheck) return badgeSnapshot(snapshot);
  const progress = badgeProgress(
    cards.results.map((card) => ({ ...card, pokemonIds: JSON.parse(card.pokemonIds) })),
    Boolean(goal.results.length),
  );
  const earned = badges
    .filter(({ id, targets }) => targets.every(([target], index) => progress[id][index] >= target))
    .map(({ id }) => id);

  // If a card or goal changed during calculation, leave the check pending.
  const [, , latest] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO trainer_badge_checks(user_id,revision,checked_revision,rules_version,progress_json)
      VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET checked_revision=excluded.checked_revision,
      rules_version=excluded.rules_version,progress_json=excluded.progress_json
      WHERE trainer_badge_checks.revision=excluded.revision
      AND trainer_badge_checks.rules_version<=excluded.rules_version
      AND (trainer_badge_checks.checked_revision<excluded.checked_revision OR trainer_badge_checks.rules_version<excluded.rules_version)`,
    ).bind(
      userId,
      snapshot.revision,
      snapshot.revision,
      badgeRulesVersion,
      JSON.stringify(progress),
    ),
    env.DB.prepare(
      `INSERT INTO trainer_badges(user_id,badge_id,awarded_at)
      SELECT ?,value,? FROM json_each(?) WHERE changes()=1 ON CONFLICT DO NOTHING`,
    ).bind(userId, new Date().toISOString(), JSON.stringify(earned)),
    status,
  ]);
  return badgeSnapshot(latest.results[0]);
}
