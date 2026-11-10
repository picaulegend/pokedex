import { escape, languageName, variantName } from './ui.js';

const euros = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' });
const sourceDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const checkDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function soldSearch(card, variant) {
  const set = card.language === 'ja' ? card.setSourceId : `${card.name} ${card.setName}`;
  const finish = variant.type
    ? variantName(variant)
        .replaceAll(' · ', ' ')
        .replace('pokeball', 'Poké Ball')
        .replace('masterball', 'Master Ball')
    : '';
  const params = new URLSearchParams({
    _nkw: [set, card.number, languageName(card.language), finish].filter(Boolean).join(' '),
    LH_Sold: '1',
    LH_Complete: '1',
  });
  return `https://www.ebay.nl/sch/i.html?${params}`;
}

export function createCardPrice({ api, render }) {
  const states = new Map();
  function stateFor(variantId) {
    if (!states.has(variantId)) states.set(variantId, {});
    return states.get(variantId);
  }
  return {
    async load(variantId) {
      const state = stateFor(variantId);
      try {
        const { price } = await api(`/api/cards/price?${new URLSearchParams({ variantId })}`);
        if (price && (!state.price || price.checkedAt > state.price.checkedAt)) {
          state.price = price;
          state.saved = true;
          render();
        }
      } catch {
        // Keep the card usable if the saved estimate cannot be read.
      }
    },
    async check(card, variant) {
      const state = stateFor(variant.id);
      if (state.checking) return;
      state.checking = true;
      state.error = '';
      render();
      try {
        const { price, saved } = await api('/api/cards/price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: card.language,
            sourceId: card.sourceId,
            variantId: variant.id,
          }),
        });
        if (!state.price || price.checkedAt >= state.price.checkedAt) {
          state.price = price;
          state.saved = saved;
        }
      } catch {
        state.error = navigator.onLine
          ? 'Could not check the price. Try again.'
          : 'Connect to the internet to check the price.';
      } finally {
        state.checking = false;
        render();
      }
    },
    markup(card, variant, cardSaved) {
      const { price, error, saved } = states.get(variant.id) || {};
      const estimate = price?.euroCents;
      const content =
        (estimate
          ? `<p><strong>Market estimate ${escape(euros.format(estimate / 100))}</strong></p><p>Cardmarket 7-day average via TCGdex · Source date <time datetime="${escape(price.sourceUpdatedAt)}">${escape(sourceDate.format(new Date(price.sourceUpdatedAt)))}</time></p>`
          : price
            ? '<p>No estimate for this finish.</p>'
            : '') +
        (price
          ? `<p>Last checked <time datetime="${escape(price.checkedAt)}">${escape(checkDate.format(new Date(price.checkedAt)))}</time></p>`
          : '') +
        (estimate && !saved
          ? cardSaved
            ? '<p>Check again to save this estimate.</p>'
            : '<p>Add this card and check again to save the estimate.</p>'
          : '') +
        (error ? `<p class="is-error">${escape(error)}</p>` : '') +
        (!estimate && (price || error)
          ? `<a href="${escape(soldSearch(card, variant))}" target="_blank" rel="noopener noreferrer">Search eBay sold listings</a>`
          : '');
      return `<div id="detail-price" class="detail-price" role="status">${content}</div>`;
    },
    checking(variantId) {
      return Boolean(states.get(variantId)?.checking);
    },
  };
}
