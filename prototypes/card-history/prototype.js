// Isolated sample data. This prototype has no account, storage, or app API calls.
const $ = (id) => document.getElementById(id);
const appContext = document.body.dataset.layout === 'app';
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const methods = {
  bought: {
    title: 'Bought',
    source: 'Shop or seller',
    placeholder: 'e.g. a card shop or card show',
  },
  pulled: {
    title: 'Pulled',
    source: 'Pack, box, or place',
    placeholder: 'e.g. a 151 booster · At home',
  },
  gift: {
    title: 'Gift',
    source: 'From whom or where',
    placeholder: 'e.g. a friend, a birthday, a card club',
  },
  trade: { title: 'Trade', source: 'Person or place', placeholder: 'e.g. a friend or a card show' },
  other: { title: 'Other', source: 'Person or place', placeholder: 'Anything you remember' },
};
const currencies = { EUR: '€', USD: '$', GBP: '£', JPY: '¥' };
const removalReasons = {
  removed: 'Removed',
  sold: 'Sold',
  traded: 'Traded',
  given: 'Given away',
  lost: 'Lost',
  other: 'No longer owned',
};
const bulbasaur = {
  name: 'Bulbasaur',
  number: '166',
  species: '001',
  artist: 'Illustrated by Yoriyuki Ikegami',
  finish: 'Holo',
  image: 'https://assets.tcgdex.net/en/sv/sv03.5/166/high.webp',
};
// Card reference is taken from the isolated source fixtures. Prices and stories are invented.
function samples() {
  const data = {
    owned: {
      ...bulbasaur,
      quantity: 3,
      wanted: false,
      entries: [
        {
          id: 'sample-bought',
          method: 'bought',
          quantity: 1,
          date: '2026-11-03',
          source: 'Card show · Utrecht',
          amount: '12.50',
          currency: 'EUR',
          notes: 'Found it in the last binder of the day. Worth the extra look.',
        },
        {
          id: 'sample-pulled',
          method: 'pulled',
          quantity: 1,
          date: '2026-10-19',
          source: '151 booster · At home',
          amount: '',
          currency: 'EUR',
          notes: 'The very last pack in the box.',
        },
        {
          id: 'sample-gift',
          method: 'gift',
          quantity: 1,
          date: '2026-09-02',
          source: 'From Sam',
          amount: '',
          currency: 'EUR',
          notes: 'Birthday gift.',
        },
      ],
    },
    wanted: {
      name: 'Squirtle',
      number: '007',
      species: '007',
      artist: 'Illustrated by kantaro',
      finish: 'Regular',
      image: 'https://assets.tcgdex.net/en/sv/sv03.5/007/high.webp',
      quantity: 0,
      wanted: true,
      entries: [],
      plan: {
        amount: '2.00',
        currency: 'EUR',
        shop: 'The local card shop',
        link: '',
        notes: 'A clean copy for my Kanto binder. Check the singles box next time.',
      },
    },
    empty: { ...bulbasaur, quantity: 2, wanted: false, entries: [] },
    past: {
      ...bulbasaur,
      quantity: 0,
      wanted: false,
      entries: [
        {
          id: 'past-bought',
          method: 'bought',
          quantity: 1,
          remaining: 0,
          date: '2026-08-12',
          source: 'Card show · Utrecht',
          amount: '8.00',
          currency: 'EUR',
          notes: 'Bought for my Kanto binder.',
        },
      ],
      removals: [
        {
          id: 'past-sale',
          quantity: 1,
          allocations: [{ entryId: 'past-bought', quantity: 1 }],
          reason: 'sold',
          date: '2026-11-04',
          person: 'Local card club',
          amount: '14.00',
          currency: 'EUR',
          notes: 'Sold after I found another copy.',
        },
      ],
    },
  };
  data.wanted.reverse = {
    ...data.wanted,
    finish: 'Reverse holo',
    quantity: 1,
    wanted: false,
    entries: [
      {
        id: 'sample-reverse',
        method: 'pulled',
        quantity: 1,
        date: '2026-10-19',
        source: '151 booster',
        amount: '',
        currency: 'EUR',
        notes: '',
      },
    ],
  };
  return data;
}
let cards = samples();
let scenario = 'owned';
let selectedFinish = 'base';
let editingId = null;
let editingRemovalId = null;
let requestedRemoval = 1;
let historyFilter = 'all';
let sequence = 0;
const demoId = (prefix) => `${prefix}-${Date.now()}-${sequence++}`;
let toastTimer;
const current = () => (selectedFinish === 'reverse' ? cards[scenario].reverse : cards[scenario]);
const remaining = (entry) => entry.remaining ?? entry.quantity;
const removals = () => current().removals || [];
const entryRemovals = (entry) =>
  removals().filter((event) => event.allocations.some((part) => part.entryId === entry.id));
const removedCount = () => removals().reduce((sum, event) => sum + event.quantity, 0);
const described = () => current().entries.reduce((sum, entry) => sum + remaining(entry), 0);
const undescribed = () => current().quantity - described();
const copies = (quantity) => `${quantity} ${quantity === 1 ? 'copy' : 'copies'}`;
const money = (amount, currency) =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
  }).format(Number(amount));
function dateLabel(value) {
  return value
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${value}T12:00:00Z`))
    : 'Date not recorded';
}
function toast(message) {
  clearTimeout(toastTimer);
  $('toast').querySelector('span').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => {
    $('toast').hidden = true;
  }, 4500);
}
function updateImage(element, image, alt = '') {
  if (element.getAttribute('src') !== image) element.src = image;
  element.alt = alt;
}
function render() {
  const card = current();
  const owned = card.quantity > 0;
  for (const button of document.querySelectorAll('[data-scenario]'))
    button.setAttribute('aria-pressed', String(button.dataset.scenario === scenario));
  $('card-title').textContent = card.name;
  $('card-subtitle').textContent = `Scarlet & Violet — 151 · ${card.number}/165 · English`;
  $('reference-number').textContent = card.number === '166' ? 'Illustration Rare' : 'Common';
  $('card-finish').textContent = card.finish;
  $('card-artist').textContent = card.artist.replace('Illustrated by ', '');
  updateImage(
    $('card-image'),
    card.image,
    `${card.name} — Scarlet & Violet 151, ${card.number}/165`,
  );
  $('wishlist-toggle').setAttribute('aria-pressed', String(card.wanted));
  $('wishlist-toggle').setAttribute(
    'aria-label',
    card.wanted ? 'Remove from wishlist' : 'Add to wishlist',
  );
  $('owned-pill').classList.toggle('is-wanted', !owned);
  $('owned-pill')
    .querySelector('use')
    .setAttribute('href', owned ? '#i-check' : '#i-heart');
  $('owned-count').textContent = owned
    ? `${copies(card.quantity)} owned`
    : card.wanted
      ? 'On your wishlist'
      : 'No copies owned';
  $('add-copy').querySelector('span').textContent =
    owned || card.entries.length ? 'Add a copy' : 'I got this card';
  $('add-copy').disabled = card.quantity >= 999;
  $('add-copy').className = `button ${owned ? 'secondary' : 'primary'}`;
  $('remove-copy').hidden = !owned;
  $('collection-status').textContent = owned
    ? 'In your collection'
    : card.entries.length
      ? 'Previously owned'
      : 'A card you are looking for';
  $('history-section').hidden = !owned && !card.entries.length;
  $('wanted-section').hidden = !card.wanted;
  $('history-summary').textContent =
    `${copies(card.quantity)} owned · ${removedCount() ? `${copies(removedCount())} previously owned` : `${copies(described())} with details`}`;
  if (!removedCount()) historyFilter = 'all';
  $('history-filters').hidden = !removedCount();
  for (const button of document.querySelectorAll('[data-history-filter]'))
    button.setAttribute('aria-pressed', String(button.dataset.historyFilter === historyFilter));
  const entries = [...card.entries]
    .filter((entry) =>
      historyFilter === 'owned'
        ? remaining(entry) > 0
        : historyFilter === 'past'
          ? entryRemovals(entry).length > 0
          : true,
    )
    .sort((a, b) => latestEntryDate(b).localeCompare(latestEntryDate(a)));
  $('history-list').innerHTML = entries.map(renderEntry).join('');
  $('history-no-match').hidden = !card.entries.length || entries.length > 0;
  $('unrecorded').hidden = !card.entries.length || undescribed() === 0;
  $('unrecorded-title').textContent = `${copies(undescribed())} without details`;
  $('empty-history').hidden = card.entries.length > 0;
  $('empty-copy-note').textContent =
    `Your ${copies(card.quantity)} ${card.quantity === 1 ? 'is' : 'are'} already counted.`;
  $('add-entry').hidden = !card.entries.length;
  const plan = card.plan || { amount: '', currency: 'EUR', shop: '', link: '', notes: '' };
  $('target-price').value = plan.amount;
  $('target-currency').value = plan.currency;
  $('target-currency-label').textContent = currencies[plan.currency];
  $('target-price').step = plan.currency === 'JPY' ? '1' : '0.01';
  $('target-shop').value = plan.shop;
  $('target-link').value = plan.link;
  $('target-notes').value = plan.notes;
  $('plan-status').textContent = '';
  if (appContext) renderAppControls();
}

function latestEntryDate(entry) {
  return [entry.date, ...entryRemovals(entry).map((event) => event.date)].sort().at(-1);
}

function renderEntry(entry) {
  const events = entryRemovals(entry);
  const title = entry.originUnknown ? 'Details not recorded' : methods[entry.method].title;
  const changes = events
    .map((event) => {
      const part = event.allocations.find((allocation) => allocation.entryId === entry.id);
      return `<div class="entry-change"><div class="entry-top"><strong>${escape(removalReasons[event.reason])}</strong><span class="entry-date">${escape(dateLabel(event.date))}</span><button class="entry-edit" data-edit-removal="${escape(event.id)}" aria-label="Edit ${escape(removalReasons[event.reason].toLowerCase())} details">${icon('edit')}</button></div><p class="entry-source">${escape(event.person || '')}${event.person ? ' · ' : ''}${copies(part.quantity)}${event.amount !== '' ? ` · ${escape(money(event.amount, event.currency))} received${event.quantity > part.quantity ? ` in total for ${copies(event.quantity)}` : ''}` : ''}</p>${event.notes ? `<p class="entry-note">${escape(event.notes)}</p>` : ''}</div>`;
    })
    .join('');
  return `<article class="history-entry${remaining(entry) ? '' : ' is-past'}"><div class="method-icon ${entry.method}">${icon(entry.method)}</div><div class="entry-main"><div class="entry-top"><h3>${escape(title)}</h3><span class="entry-date">${escape(dateLabel(entry.date))}</span><span class="entry-price">${entry.amount !== '' ? escape(money(entry.amount, entry.currency)) : ''}</span><button class="entry-edit" data-edit="${escape(entry.id)}" aria-label="Edit ${escape(title.toLowerCase())} entry${entry.date ? ` from ${escape(dateLabel(entry.date))}` : ''}">${icon('edit')}</button></div><p class="entry-source">${escape(entry.source || 'Place not recorded')} <span class="entry-count">· ${copies(entry.quantity)}</span></p>${entry.notes ? `<p class="entry-note">${escape(entry.notes)}</p>` : ''}${events.length ? `<p class="entry-ownership">${remaining(entry) ? `${copies(remaining(entry))} still owned` : 'Previously owned'}</p>` : ''}${changes}</div></article>`;
}

function renderAppControls() {
  const card = current();
  $('context-quantity').value = card.quantity;
  $('context-minus').disabled = card.quantity === 0;
  $('context-plus').disabled = card.quantity >= 999;
  $('wishlist-toggle').textContent = card.wanted ? 'On wishlist' : 'Add to wishlist';
  $('context-finish').innerHTML =
    scenario === 'wanted'
      ? `<option value="base">Regular</option><option value="reverse">Reverse holo</option>`
      : '<option value="base">Holo</option>';
  $('context-finish').value = selectedFinish;
  $('context-source-reference').textContent = `sv03.5-${card.number} · ${card.finish}`;
  $('context-add-details').hidden = undescribed() === 0;
}

function changeAppQuantity(quantity) {
  const input = $('context-quantity');
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) {
    input.reportValidity();
    return;
  }
  $('context-save-message').hidden = false;
  if (quantity < current().quantity) {
    input.value = current().quantity;
    $('context-save-message').hidden = true;
    openRemoval(current().quantity - quantity);
    return;
  }
  current().quantity = quantity;
  render();
  $('context-save-text').textContent = `Owned copies: ${quantity}.`;
}

function removalAllocations() {
  const existing = removals().find((event) => event.id === editingRemovalId);
  if (existing) return existing.allocations.map((part) => ({ ...part }));
  if (requestedRemoval === 1) {
    const selected = $('removal-form').querySelector('[name="removal-copy"]:checked');
    return selected ? [{ entryId: selected.value, quantity: 1 }] : [];
  }
  return [...$('removal-choices').querySelectorAll('[data-remove-from]')]
    .map((input) => ({ entryId: input.dataset.removeFrom, quantity: Number(input.value) }))
    .filter((part) => part.quantity > 0);
}

function openRemoval(quantity = 1, eventId = null) {
  const card = current();
  const existing = removals().find((event) => event.id === eventId);
  if (!existing && !card.quantity) return;
  editingRemovalId = existing?.id || null;
  requestedRemoval = existing?.quantity || Math.min(quantity, card.quantity);
  $('removal-form').reset();
  $('removal-title').textContent = existing
    ? 'Edit change'
    : requestedRemoval === 1
      ? 'Remove a copy'
      : `Remove ${copies(requestedRemoval)}`;
  $('removal-description').textContent = existing
    ? 'Update what happened. Copy counts stay the same.'
    : 'The card and its history will stay saved.';
  $('save-removal').textContent = existing ? 'Save changes' : 'Remove from owned';
  $('removal-card-reference').textContent =
    `${card.name} · 151 · ${card.number}/165 · ${card.finish}`;
  $('removal-picker').hidden = Boolean(existing);
  $('removal-picker-label').textContent =
    requestedRemoval === 1 ? 'Which copy?' : `Which ${copies(requestedRemoval)}?`;
  const groups = card.entries
    .filter((entry) => remaining(entry) > 0)
    .map((entry) => ({
      id: entry.id,
      quantity: remaining(entry),
      title: `${entry.originUnknown ? 'Details not recorded' : methods[entry.method].title} · ${dateLabel(entry.date)}`,
      source: entry.source,
    }));
  if (undescribed())
    groups.push({
      id: '__unrecorded__',
      quantity: undescribed(),
      title: 'Details not recorded',
      source: '',
    });
  $('removal-choices').innerHTML = groups
    .map((group, index) => {
      const description = `<span><strong>${escape(group.title)}</strong><small>${escape(group.source || '')}${group.source ? ' · ' : ''}${copies(group.quantity)} owned</small></span>`;
      return requestedRemoval === 1
        ? `<label class="removal-choice"><input type="radio" name="removal-copy" value="${escape(group.id)}" ${groups.length === 1 ? 'checked' : ''}>${description}</label>`
        : `<label class="removal-choice removal-choice-quantity">${description}<input type="number" min="0" max="${Math.min(group.quantity, requestedRemoval)}" step="1" required inputmode="numeric" value="${groups.length === 1 ? requestedRemoval : 0}" data-remove-from="${escape(group.id)}" aria-label="Copies to remove from ${escape(group.title)}" id="remove-group-${index}"></label>`;
    })
    .join('');
  $('removal-reason').value = existing?.reason || 'removed';
  $('removal-date').value = existing?.date || '';
  $('removal-person').value = existing?.person || '';
  $('removal-price').value = existing?.amount ?? '';
  $('removal-currency').value = existing?.currency || 'EUR';
  $('removal-notes').value = existing?.notes || '';
  updateRemovalForm();
  $('removal-dialog').showModal();
}

function updateRemovalForm() {
  const reason = $('removal-reason').value;
  const priceVisible = ['sold', 'traded'].includes(reason);
  $('removal-price-fields').hidden = !priceVisible;
  $('removal-price').disabled = !priceVisible;
  $('removal-currency').disabled = !priceVisible;
  $('removal-price').step = $('removal-currency').value === 'JPY' ? '1' : '0.01';
  $('removal-currency-label').textContent = currencies[$('removal-currency').value];
  $('removal-person-label').textContent =
    reason === 'sold' ? 'Buyer or place' : reason === 'given' ? 'Given to' : 'Person or place';
  const selected = removalAllocations().reduce((sum, part) => sum + part.quantity, 0);
  const valid = selected === requestedRemoval;
  $('save-removal').disabled = !valid;
  $('removal-count-preview').textContent = editingRemovalId
    ? `${copies(current().quantity)} owned. This change will keep the count unchanged.`
    : !valid
      ? `Select ${copies(requestedRemoval)}. ${selected} selected.`
      : `${copies(current().quantity - requestedRemoval)} will remain owned. The history is kept.`;
}

$('removal-form').addEventListener('input', updateRemovalForm);
$('removal-form').addEventListener('change', updateRemovalForm);
$('removal-form').onsubmit = (event) => {
  event.preventDefault();
  if (!$('removal-form').reportValidity()) return;
  const allocations = removalAllocations();
  if (allocations.reduce((sum, part) => sum + part.quantity, 0) !== requestedRemoval) return;
  const card = current();
  const existing = removals().find((change) => change.id === editingRemovalId);
  const change = {
    reason: $('removal-reason').value,
    date: $('removal-date').value,
    person: $('removal-person').value.trim(),
    amount: ['sold', 'traded'].includes($('removal-reason').value) ? $('removal-price').value : '',
    currency: $('removal-currency').value,
    notes: $('removal-notes').value.trim(),
  };
  if (existing) Object.assign(existing, change);
  else {
    for (const part of allocations) {
      if (part.entryId === '__unrecorded__') {
        const entry = {
          id: demoId('past-unknown'),
          originUnknown: true,
          method: 'other',
          quantity: part.quantity,
          remaining: 0,
          date: '',
          source: '',
          amount: '',
          currency: 'EUR',
          notes: '',
        };
        card.entries.push(entry);
        part.entryId = entry.id;
      } else {
        const entry = card.entries.find((item) => item.id === part.entryId);
        if (!entry || part.quantity > remaining(entry)) return;
        entry.remaining = remaining(entry) - part.quantity;
      }
    }
    card.removals ||= [];
    card.removals.push({
      id: demoId('change'),
      quantity: requestedRemoval,
      allocations,
      ...change,
    });
    card.quantity -= requestedRemoval;
  }
  historyFilter = 'all';
  $('removal-dialog').close();
  render();
  if (appContext) {
    $('context-save-message').hidden = false;
    $('context-save-text').textContent = `Owned copies: ${card.quantity}. History kept.`;
  }
  toast(
    existing
      ? 'History updated. The owned count stays the same.'
      : `${copies(requestedRemoval)} removed from owned. History kept.`,
  );
};
for (const id of ['close-removal', 'cancel-removal'])
  $(id).onclick = () => $('removal-dialog').close();
$('remove-copy').onclick = () => openRemoval();
for (const button of document.querySelectorAll('[data-history-filter]'))
  button.onclick = () => {
    historyFilter = button.dataset.historyFilter;
    render();
  };

function openEntry(purpose = 'new', entryId = null) {
  const card = current();
  editingId = entryId;
  const entry = card.entries.find((item) => item.id === editingId);
  $('entry-form').reset();
  $('entry-error').hidden = true;
  $('entry-title').textContent = entry ? 'Edit entry' : 'Add entry';
  $('entry-purpose').hidden = Boolean(entry);
  $('existing-purpose-label').querySelector('input').disabled = undescribed() === 0;
  $('entry-form').elements.purpose.value = purpose;
  $('entry-form').elements.method.value = entry?.method || 'bought';
  $('entry-date').value = entry?.date || '';
  $('entry-quantity').value = entry?.quantity || 1;
  $('entry-source').value = entry?.source || (!card.quantity ? card.plan?.shop || '' : '');
  $('entry-price').value = entry?.amount ?? '';
  $('entry-currency').value = entry?.currency || card.plan?.currency || 'EUR';
  $('entry-notes').value = entry?.notes || '';
  $('remove-wanted-label').hidden = Boolean(entry) || !card.wanted;
  $('delete-entry').hidden = !entry || entryRemovals(entry).length > 0;
  $('save-entry').querySelector('span').textContent = entry ? 'Save changes' : 'Save entry';
  $('entry-card-name').textContent = card.name;
  $('entry-card-reference').textContent = `151 · ${card.number}/165 · English`;
  $('entry-card-finish').textContent = card.finish;
  updateImage($('entry-card-image'), card.image);
  updateForm();
  $('entry-dialog').showModal();
}
function updateForm() {
  const form = $('entry-form');
  const method = form.elements.method.value;
  const purpose = form.elements.purpose.value;
  const quantity = Number($('entry-quantity').value);
  const edit = current().entries.find((entry) => entry.id === editingId);
  const max = edit
    ? undescribed() + edit.quantity
    : purpose === 'new'
      ? 999 - current().quantity
      : undescribed();
  $('entry-quantity').max = max;
  $('entry-quantity').min = edit ? Math.max(1, edit.quantity - remaining(edit)) : 1;
  $('source-label').textContent = methods[method].source;
  $('entry-source').placeholder = methods[method].placeholder;
  $('price-fields').hidden = !['bought', 'trade'].includes(method);
  $('entry-price').disabled = $('price-fields').hidden;
  $('entry-currency').disabled = $('price-fields').hidden;
  $('price-label').textContent = method === 'trade' ? 'Extra cash paid' : 'Total paid';
  $('pull-hint').hidden = method !== 'pulled';
  $('entry-currency-label').textContent = currencies[$('entry-currency').value];
  $('entry-price').step = $('entry-currency').value === 'JPY' ? '1' : '0.01';
  const valid =
    Number.isInteger(quantity) && quantity >= Number($('entry-quantity').min) && quantity <= max;
  let message;
  if (!valid)
    message = `Enter between ${$('entry-quantity').min} and ${max} copies for this entry.`;
  else if (edit)
    message = `Your total stays at <strong>${copies(current().quantity)}</strong>. Only these details change.`;
  else if (purpose === 'existing')
    message = `Details for ${copies(quantity)} you own. Your total stays at <strong>${copies(current().quantity)}</strong>.`;
  else
    message = `Adds ${copies(quantity)}. Your total will be <strong>${copies(current().quantity + quantity)}</strong>.`;
  $('count-preview').innerHTML = `${icon(valid ? 'check' : 'clock')}<span>${message}</span>`;
}
$('entry-form').addEventListener('input', updateForm);
$('entry-form').addEventListener('change', updateForm);
$('entry-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  updateForm();
  if (!form.reportValidity()) return;
  const card = current();
  const edit = card.entries.find((entry) => entry.id === editingId);
  const quantity = Number($('entry-quantity').value);
  const purpose = form.elements.purpose.value;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > Number($('entry-quantity').max))
    return;
  const method = form.elements.method.value;
  const entry = {
    ...(edit || {}),
    id: editingId || `demo-${Date.now()}`,
    method,
    quantity,
    remaining: edit ? remaining(edit) + quantity - edit.quantity : quantity,
    originUnknown: false,
    date: $('entry-date').value,
    source: $('entry-source').value.trim(),
    amount: ['bought', 'trade'].includes(method) ? $('entry-price').value : '',
    currency: $('entry-currency').value,
    notes: $('entry-notes').value.trim(),
  };
  if (edit) card.entries[card.entries.indexOf(edit)] = entry;
  else {
    card.entries.push(entry);
    if (purpose === 'new') card.quantity += quantity;
    if (card.wanted && $('remove-wanted').checked) card.wanted = false;
  }
  $('entry-dialog').close();
  render();
  toast(
    edit
      ? 'Entry updated in this demo.'
      : purpose === 'new'
        ? `${copies(quantity)} added.`
        : 'Details added. Your copy count stays the same.',
  );
});
for (const id of ['close-entry', 'cancel-entry']) $(id).onclick = () => $('entry-dialog').close();
$('entry-dialog').addEventListener('click', (event) => {
  if (
    event.target === $('entry-dialog') &&
    event.clientX < $('entry-dialog').getBoundingClientRect().left
  )
    $('entry-dialog').close();
});
$('delete-entry').onclick = () => {
  current().entries = current().entries.filter((entry) => entry.id !== editingId);
  $('entry-dialog').close();
  render();
  toast('Details removed. Your copies are still counted.');
};
$('add-copy').onclick = () => openEntry('new');
$('add-entry').onclick = () => openEntry(undescribed() > 0 ? 'existing' : 'new');
$('describe-existing').onclick = $('first-entry').onclick = () => openEntry('existing');
$('history-list').onclick = (event) => {
  const removal = event.target.closest('[data-edit-removal]');
  if (removal) {
    openRemoval(0, removal.dataset.editRemoval);
    return;
  }
  const button = event.target.closest('[data-edit]');
  if (button) openEntry('existing', button.dataset.edit);
};
$('wishlist-toggle').onclick = () => {
  current().wanted = !current().wanted;
  render();
  toast(
    current().wanted
      ? 'Added to the wishlist in this demo.'
      : 'Removed from the wishlist in this demo.',
  );
};
for (const button of document.querySelectorAll('[data-scenario]'))
  button.onclick = () => {
    scenario = button.dataset.scenario;
    historyFilter = 'all';
    selectedFinish = 'base';
    if (appContext) $('context-save-message').hidden = true;
    render();
  };
$('reset-demo').onclick = () => {
  cards = samples();
  scenario = 'owned';
  selectedFinish = 'base';
  historyFilter = 'all';
  if (appContext) $('context-save-message').hidden = true;
  render();
  toast('Back to the sample cards.');
};
$('target-currency').onchange = () => {
  $('target-currency-label').textContent = currencies[$('target-currency').value];
  $('target-price').step = $('target-currency').value === 'JPY' ? '1' : '0.01';
};
$('wanted-form').onsubmit = (event) => {
  event.preventDefault();
  current().plan = {
    amount: $('target-price').value,
    currency: $('target-currency').value,
    shop: $('target-shop').value.trim(),
    link: $('target-link').value.trim(),
    notes: $('target-notes').value.trim(),
  };
  $('plan-status').textContent = 'Notes saved in this demo.';
  toast('Wishlist notes saved in this demo.');
};
$('card-image').onload = () => {
  $('card-image').hidden = false;
  $('image-fallback').hidden = true;
};
$('card-image').onerror = () => {
  $('card-image').hidden = true;
  $('image-fallback').hidden = false;
};
if (appContext) {
  $('context-plus').onclick = () => changeAppQuantity(Math.min(999, current().quantity + 1));
  $('context-minus').onclick = () => changeAppQuantity(Math.max(0, current().quantity - 1));
  $('context-quantity').onchange = () => {
    const input = $('context-quantity');
    if (!input.value || !input.checkValidity()) {
      input.reportValidity();
      return;
    }
    changeAppQuantity(Number(input.value));
  };
  $('context-add-details').onclick = () => openEntry('existing');
  $('context-finish').onchange = (event) => {
    selectedFinish = event.target.value;
    historyFilter = 'all';
    $('context-save-message').hidden = true;
    render();
  };
  for (const button of document.querySelectorAll('button[data-comparison]'))
    button.onclick = () => {
      document.body.dataset.comparison = button.dataset.comparison;
      for (const option of document.querySelectorAll('button[data-comparison]'))
        option.setAttribute('aria-pressed', String(option === button));
      $('context-save-message').hidden = true;
    };
  for (const button of document.querySelectorAll('[data-shell]'))
    button.onclick = () => toast('This prototype shows the card details page.');
  $('context-member').onchange = (event) => {
    $('context-memberships').textContent = event.target.checked ? '1' : '0';
    toast('Collection changed in this demo.');
  };
  $('context-enlarge').onclick = () => {
    updateImage($('context-full-image'), current().image, current().name);
    $('context-image-dialog').showModal();
  };
  $('context-image-close').onclick = () => $('context-image-dialog').close();
}
render();
