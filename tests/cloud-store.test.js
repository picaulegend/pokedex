import { test } from 'node:test';
import assert from 'node:assert/strict';

// These checks use pure state functions; browser tests cover the actual database.
globalThis.indexedDB = { open: () => ({}) };
const { emptyState, visibleOwned, queueRecord, queueChange } =
  await import('../src/client/cloud-store.js');
delete globalThis.indexedDB;

test('cached card links cannot replace a newer server Pokédex record', () => {
  const state = emptyState();
  state.server = {
    1: { pokemonId: 1, owned: false, legacyOwned: false },
    3: { pokemonId: 3, owned: true, legacyOwned: false },
  };
  state.inventory.card = { variantId: 'card', quantity: 1, wanted: false, pokemonIds: [1] };
  assert.deepEqual(visibleOwned(state), [3]);
});

test('offline quantities update linked Pokémon and clearing an old check keeps exact ownership', () => {
  const state = emptyState();
  state.server = { 1: { pokemonId: 1, owned: true, legacyOwned: true, revision: 1 } };
  state.variantLinks = { card: [1, 25] };
  queueRecord(state, 'inventory', 'card', { quantity: 2, wanted: false });
  queueChange(state, 1, false);
  assert.deepEqual(visibleOwned(state), [1, 25]);
  queueRecord(state, 'inventory', 'card', { quantity: 0, wanted: false });
  assert.deepEqual(visibleOwned(state), []);
});
