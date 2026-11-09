import { inventoryChange, reconcileQuantity, emptyHistory } from './card-history-model.js';

const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('carddex-cloud-v1', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('accounts');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export function emptyState() {
  return {
    version: 1,
    server: {},
    pending: [],
    conflicts: {},
    cursor: 0,
    inventory: {},
    collections: {},
    badges: null,
    recordPending: [],
    recordConflicts: {},
  };
}

// One transaction keeps changes from separate tabs in the same queue.
export async function updateAccount(userId, update) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('accounts', update ? 'readwrite' : 'readonly');
    const store = transaction.objectStore('accounts');
    const request = store.get(userId);
    let next;
    request.onsuccess = () => {
      try {
        next = request.result || emptyState();
        if (next.version !== 1) throw new Error('Saved changes use an unsupported format.');
        for (const [key, value] of Object.entries(emptyState()))
          if (next[key] === undefined) next[key] = value;
        if (update && update(next) !== false) store.put(next, userId);
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    };
    transaction.oncomplete = () => resolve(next);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error('Saving on this device failed.'));
  });
}

export function mergeSync(state, body) {
  if (!body.reset && body.cursor <= state.cursor) return false;
  if (body.reset) {
    state.server = {};
    state.inventory = {};
    state.collections = {};
  }
  mergeRemote(state, body.progress);
  for (const [kind, rows] of [
    ['inventory', body.inventory],
    ['collections', body.collections],
  ]) {
    for (const row of rows) {
      const id = row.variantId || row.id;
      if (!state[kind][id] || state[kind][id].revision <= row.revision) state[kind][id] = row;
    }
  }
  state.cursor = body.cursor;
  return true;
}

export function mergeBadges(state, snapshot) {
  if (!snapshot) return false;
  const previous = state.badges;
  if (
    previous &&
    (previous.rulesVersion > snapshot.rulesVersion ||
      (previous.rulesVersion === snapshot.rulesVersion &&
        previous.checkedRevision >= snapshot.checkedRevision))
  )
    return false;
  state.badges = snapshot;
  return true;
}

export function visibleRecords(state, kind) {
  const rows = { ...state[kind === 'inventory' ? 'inventory' : 'collections'] };
  const value = (item) =>
    kind === 'inventory' && item.data.history === undefined
      ? {
          ...item.data,
          history: reconcileQuantity(
            rows[item.id] || { quantity: 0, history: emptyHistory() },
            item.data.quantity,
            item.mutationId,
          ),
        }
      : item.data;
  for (const item of state.recordPending)
    if (item.kind === kind)
      rows[item.id] = { ...rows[item.id], ...value(item), id: item.id, variantId: item.id };
  for (const item of Object.values(state.recordConflicts))
    if (item.kind === kind)
      rows[item.id] = { ...rows[item.id], ...value(item), id: item.id, variantId: item.id };
  return rows;
}

export function queueRecord(state, kind, id, data) {
  const mutationId = crypto.randomUUID();
  if (kind === 'inventory')
    data = inventoryChange(visibleRecords(state, kind)[id], data, mutationId);
  const previous = state.recordPending
    .filter((item) => item.kind === kind && item.id === id)
    .at(-1);
  const rows = state[kind === 'inventory' ? 'inventory' : 'collections'];
  const baseRevision = previous ? previous.baseRevision + 1 : rows[id]?.revision || 0;
  state.recordPending.push({ kind, id, data, baseRevision, mutationId });
  delete state.recordConflicts[`${kind}:${id}`];
}

export function mergeRemote(state, rows) {
  for (const row of rows) {
    if (!state.server[row.pokemonId] || state.server[row.pokemonId].revision <= row.revision) {
      state.server[row.pokemonId] = row;
    }
  }
}

export function visibleOwned(state, inventory = visibleRecords(state, 'inventory')) {
  const values = new Map(Object.values(state.server).map((row) => [row.pokemonId, row.owned]));
  const legacy = new Map(
    Object.values(state.server).map((row) => [row.pokemonId, row.legacyOwned ?? row.owned]),
  );
  for (const change of state.pending) {
    values.set(change.pokemonId, change.owned);
    legacy.set(change.pokemonId, change.owned);
  }
  for (const change of Object.values(state.conflicts)) {
    values.set(change.pokemonId, change.wanted);
    legacy.set(change.pokemonId, change.wanted);
  }
  const affected = new Set([
      ...state.pending.map((r) => r.pokemonId),
      ...Object.values(state.conflicts).map((r) => r.pokemonId),
    ]),
    cardsOwned = new Set();
  const pendingVariants = new Set(
    [...state.recordPending, ...Object.values(state.recordConflicts)]
      .filter((r) => r.kind === 'inventory')
      .map((r) => r.id),
  );
  for (const row of Object.values(inventory)) {
    for (const id of row.pokemonIds || state.variantLinks?.[row.variantId] || []) {
      if (pendingVariants.has(row.variantId)) affected.add(id);
      if (row.quantity > 0) cardsOwned.add(id);
    }
  }
  for (const id of affected) values.set(id, Boolean(legacy.get(id) || cardsOwned.has(id)));
  return [...values]
    .filter(([, owned]) => owned)
    .map(([id]) => id)
    .sort((a, b) => a - b);
}

export function cardCounts(state, inventory = visibleRecords(state, 'inventory')) {
  const counts = new Map();
  for (const row of Object.values(inventory))
    if (row.quantity > 0)
      for (const id of row.pokemonIds || state.variantLinks?.[row.variantId] || [])
        counts.set(id, (counts.get(id) || 0) + 1);
  return counts;
}

export function queueChange(state, pokemonId, owned) {
  const previous = state.pending.filter((change) => change.pokemonId === pokemonId).at(-1);
  const baseRevision = previous
    ? previous.baseRevision + 1
    : state.server[pokemonId]?.revision || 0;
  state.pending.push({ pokemonId, owned, baseRevision, mutationId: crypto.randomUUID() });
  delete state.conflicts[pokemonId];
}
