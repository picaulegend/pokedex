export const acquisitionMethods = ['bought', 'pulled', 'gift', 'trade', 'other'];
export const changeMethods = ['removed', 'sold', 'traded', 'given', 'lost', 'other'];
export const currencies = { EUR: '€', USD: '$', GBP: '£', JPY: '¥' };
export const emptyHistory = () => ({ entries: [], changes: [], plan: null });
export const historyOf = (row) => row?.history || emptyHistory();
export const hasHistory = (row) => Boolean(historyOf(row).entries.length);
export const hasDetails = (row) => hasHistory(row) || Boolean(historyOf(row).plan);
const isId = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail = (message = 'Use valid card history details.') => {
  throw new Error(message);
};
function object(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    fail();
}
function text(value, max) {
  if (typeof value !== 'string' || value.length > max) fail();
  return value.trim();
}
function date(value) {
  value = text(value, 10);
  if (
    value &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) ||
      new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value)
  )
    fail('Use a valid date.');
  return value;
}
function price(amount, currency) {
  if (
    !Object.hasOwn(currencies, currency) ||
    typeof amount !== 'string' ||
    (amount !== '' && !/^\d{1,7}(?:\.\d{1,2})?$/.test(amount)) ||
    (currency === 'JPY' && amount !== '' && !Number.isInteger(Number(amount)))
  )
    fail('Use a valid amount and currency.');
  return amount === '' ? '' : Number(amount).toFixed(currency === 'JPY' ? 0 : 2);
}
function quantity(value, zero = false) {
  if (!Number.isInteger(value) || value < (zero ? 0 : 1) || value > 999)
    fail('Use a quantity from 0 to 999.');
  return value;
}
export function removedFrom(entry, history) {
  let count = 0;
  for (const change of history.changes)
    for (const part of change.allocations) if (part.entryId === entry.id) count += part.quantity;
  return count;
}
export const remaining = (entry, history) => entry.quantity - removedFrom(entry, history);
export const describedCount = (history) =>
  history.entries.reduce((sum, entry) => sum + remaining(entry, history), 0);
export const pastCount = (history) =>
  history.changes.reduce((sum, change) => sum + change.quantity, 0);
export const unrecordedCount = (row) => row.quantity - describedCount(historyOf(row));

export function validateHistory(value, owned) {
  quantity(owned, true);
  object(value, ['entries', 'changes', 'plan']);
  if (
    !Array.isArray(value.entries) ||
    !Array.isArray(value.changes) ||
    value.entries.length > 1000 ||
    value.changes.length > 1000 ||
    JSON.stringify(value).length > 240000
  )
    fail('This card has too much history for one saved record.');
  const entries = value.entries.map((entry) => {
    object(entry, [
      'id',
      'method',
      'quantity',
      'date',
      'source',
      'amount',
      'currency',
      'notes',
      'originUnknown',
    ]);
    if (
      !isId(entry.id) ||
      !acquisitionMethods.includes(entry.method) ||
      (entry.originUnknown !== undefined && typeof entry.originUnknown !== 'boolean')
    )
      fail();
    return {
      id: entry.id.toLowerCase(),
      method: entry.method,
      quantity: quantity(entry.quantity),
      date: date(entry.date),
      source: text(entry.source, 160),
      amount: price(entry.amount, entry.currency),
      currency: entry.currency,
      notes: text(entry.notes, 1000),
      originUnknown: Boolean(entry.originUnknown),
    };
  });
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  if (byId.size !== entries.length) fail('Each history entry needs its own ID.');
  const changes = value.changes.map((change) => {
    object(change, [
      'id',
      'quantity',
      'allocations',
      'reason',
      'date',
      'person',
      'amount',
      'currency',
      'notes',
    ]);
    if (
      !isId(change.id) ||
      !changeMethods.includes(change.reason) ||
      !Array.isArray(change.allocations) ||
      !change.allocations.length ||
      change.allocations.length > 999
    )
      fail();
    const allocations = change.allocations.map((part) => {
      object(part, ['entryId', 'quantity']);
      if (!isId(part.entryId) || !byId.has(part.entryId.toLowerCase()))
        fail('A later change needs its original history entry.');
      return { entryId: part.entryId.toLowerCase(), quantity: quantity(part.quantity) };
    });
    if (
      new Set(allocations.map((part) => part.entryId)).size !== allocations.length ||
      allocations.reduce((sum, part) => sum + part.quantity, 0) !== quantity(change.quantity)
    )
      fail('Choose the copies for this change.');
    return {
      id: change.id.toLowerCase(),
      quantity: change.quantity,
      allocations,
      reason: change.reason,
      date: date(change.date),
      person: text(change.person, 160),
      amount: price(change.amount, change.currency),
      currency: change.currency,
      notes: text(change.notes, 1000),
    };
  });
  if (new Set(changes.map((change) => change.id)).size !== changes.length)
    fail('Each later change needs its own ID.');
  let plan = null;
  if (value.plan != null) {
    object(value.plan, ['amount', 'currency', 'shop', 'link', 'notes']);
    const link = text(value.plan.link, 1000);
    if (link) {
      let url;
      try {
        url = new URL(link);
      } catch {
        fail('Use a valid shop link.');
      }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        fail('Use an HTTP or HTTPS shop link.');
    }
    plan = {
      amount: price(value.plan.amount, value.plan.currency),
      currency: value.plan.currency,
      shop: text(value.plan.shop, 160),
      link,
      notes: text(value.plan.notes, 1000),
    };
  }
  const history = { entries, changes, plan };
  if (entries.some((entry) => remaining(entry, history) < 0) || describedCount(history) > owned)
    fail('The history does not match the owned count.');
  return history;
}

export function retainHistory(previous, next) {
  for (const change of previous.changes) {
    const kept = next.changes.find((item) => item.id === change.id);
    if (
      !kept ||
      kept.quantity !== change.quantity ||
      JSON.stringify([...kept.allocations].sort((a, b) => a.entryId.localeCompare(b.entryId))) !==
        JSON.stringify([...change.allocations].sort((a, b) => a.entryId.localeCompare(b.entryId)))
    )
      fail('Keep the history of copies you no longer own.');
  }
}

export function removeCopies(row, allocations, fields, id, unknownId = id) {
  const history = structuredClone(historyOf(row));
  const total = allocations.reduce((sum, part) => sum + part.quantity, 0);
  quantity(total);
  if (
    total > row.quantity ||
    new Set(allocations.map((part) => part.entryId)).size !== allocations.length
  )
    fail('Choose the copies to remove.');
  const parts = allocations.map((part) => {
    quantity(part.quantity);
    if (part.entryId === 'unrecorded') {
      if (part.quantity > unrecordedCount(row)) fail('Choose copies you still own.');
      history.entries.push({
        id: unknownId,
        method: 'other',
        quantity: part.quantity,
        date: '',
        source: '',
        amount: '',
        currency: 'EUR',
        notes: '',
        originUnknown: true,
      });
      return { entryId: unknownId, quantity: part.quantity };
    }
    const entry = history.entries.find((item) => item.id === part.entryId);
    if (!entry || part.quantity > remaining(entry, history)) fail('Choose copies you still own.');
    return { entryId: entry.id, quantity: part.quantity };
  });
  history.changes.push({ id, quantity: total, allocations: parts, ...fields });
  return {
    quantity: row.quantity - total,
    wanted: row.wanted,
    history: validateHistory(history, row.quantity - total),
  };
}

// Old clients and old queued edits also keep a record when their count decreases.
export function reconcileQuantity(row, nextQuantity, mutationId) {
  const history = historyOf(row);
  if (nextQuantity >= row.quantity) return structuredClone(history);
  let count = row.quantity - nextQuantity;
  const allocations = [];
  const unknown = Math.min(count, unrecordedCount(row));
  if (unknown) {
    allocations.push({ entryId: 'unrecorded', quantity: unknown });
    count -= unknown;
  }
  for (const entry of [...history.entries].reverse()) {
    const amount = Math.min(count, remaining(entry, history));
    if (amount) {
      allocations.push({ entryId: entry.id, quantity: amount });
      count -= amount;
    }
  }
  if (count) fail('The history does not match the owned count.');
  return removeCopies(
    row,
    allocations,
    { reason: 'removed', date: '', person: '', amount: '', currency: 'EUR', notes: '' },
    mutationId,
  ).history;
}

export function inventoryChange(row, data, mutationId) {
  row ||= { quantity: 0, wanted: false, history: emptyHistory() };
  const history =
    data.history === undefined
      ? reconcileQuantity(row, data.quantity, mutationId)
      : validateHistory(data.history, data.quantity);
  if (!data.historyChoice) {
    retainHistory(historyOf(row), history);
    if (row.quantity - data.quantity > pastCount(history) - pastCount(historyOf(row)))
      fail('Record what happened to the copies you removed.');
  }
  return { ...data, history };
}

export function mergeInventory(existing, incoming) {
  existing ||= { quantity: 0, wanted: false, history: emptyHistory() };
  const a = historyOf(existing),
    b = historyOf(incoming);
  const entries = new Map(b.entries.map((entry) => [entry.id, structuredClone(entry)]));
  for (const entry of a.entries)
    entries.set(entry.id, {
      ...entry,
      quantity: Math.max(entry.quantity, entries.get(entry.id)?.quantity || 0),
    });
  const changes = new Map(b.changes.map((change) => [change.id, structuredClone(change)]));
  for (const change of a.changes) changes.set(change.id, structuredClone(change));
  const history = {
    entries: [...entries.values()],
    changes: [...changes.values()],
    plan: a.plan || b.plan || null,
  };
  const importedUnknown = b.entries.length
    ? unrecordedCount(incoming)
    : Math.max(0, incoming.quantity - a.entries.reduce((sum, entry) => sum + entry.quantity, 0));
  const quantity = describedCount(history) + Math.max(unrecordedCount(existing), importedUnknown);
  return {
    quantity,
    wanted: Boolean(existing.wanted || incoming.wanted),
    history: validateHistory(history, quantity),
  };
}
