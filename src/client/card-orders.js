import { historyOf, ordersOf } from './card-history-model.js';

export function saveOrder(row, details, id) {
  const history = structuredClone(historyOf(row));
  if (id) {
    const order = ordersOf({ history }).find((item) => item.id === id);
    if (!order) throw new Error('This order is unavailable.');
    Object.assign(order, details);
  } else {
    history.orders ||= [];
    history.orders.push({ ...details, id: crypto.randomUUID(), at: new Date().toISOString() });
  }
  return { quantity: row.quantity, wanted: row.wanted, history };
}

export function resolveOrder(row, action, id) {
  const history = structuredClone(historyOf(row));
  const order = ordersOf({ history }).find((item) => item.id === id);
  if (!order || order.outcome) throw new Error('This order is no longer pending.');
  const received = action === 'received';
  if (received && row.quantity >= 999) throw new Error('You can own up to 999 copies.');

  const at = new Date().toISOString();
  order.outcome = { action, at };
  if (received) {
    history.entries.push({
      id: order.id,
      method: 'bought',
      quantity: 1,
      date: order.date,
      source: order.source,
      amount: order.amount,
      currency: order.currency,
      notes: order.notes,
      originUnknown: false,
      receivedAt: at,
    });
  }
  return { quantity: row.quantity + Number(received), wanted: row.wanted, history };
}
