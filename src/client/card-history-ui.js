import { escape } from './ui.js';
import {
  emptyHistory,
  historyOf,
  hasHistory,
  validateHistory,
  remaining,
  removedFrom,
  describedCount,
  unrecordedCount,
  pastCount,
  removeCopies,
  deleteHistoryEntry,
  currencies,
} from './card-history-model.js';

const methodNames = {
  bought: 'Bought',
  pulled: 'Pulled',
  gift: 'Gift',
  trade: 'Trade',
  other: 'Other',
};
const changeNames = {
  removed: 'Removed',
  sold: 'Sold',
  traded: 'Traded',
  given: 'Given away',
  lost: 'Lost',
  other: 'No longer owned',
};
const copies = (count) => `${count} ${count === 1 ? 'copy' : 'copies'}`;
const money = (amount, currency) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(Number(amount));
const dateLabel = (value) =>
  value
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${value}T12:00:00Z`))
    : 'Date not recorded';
const symbol = (name) =>
  `<svg class="history-icon" aria-hidden="true"><use href="#history-i-${name}"/></svg>`;
const planTemplate = `<dialog id="history-plan-dialog" class="history-dialog" aria-labelledby="history-plan-title"><form id="history-plan-form"><header class="sheet-heading"><h2 id="history-plan-title">Wishlist notes</h2><button id="history-plan-close" class="icon-button" type="button" aria-label="Close wishlist notes">${symbol('close')}</button></header><div class="sheet-body"><p id="history-plan-card" class="muted"></p><div class="form-grid"><label>Target price <span class="money-input"><span id="plan-currency-symbol">€</span><input id="plan-amount" type="number" min="0" max="9999999" step="0.01" inputmode="decimal" placeholder="0.00"></span></label><label>Currency<select id="plan-currency"><option>EUR</option><option>USD</option><option>GBP</option><option>JPY</option></select></label></div><label>Shop or seller<input id="plan-shop" maxlength="160"></label><label>Link<input id="plan-link" type="url" maxlength="1000" placeholder="https://…"></label><label>Notes<textarea id="plan-notes" maxlength="1000" rows="4"></textarea></label><p class="muted">All details are optional and private.</p><p id="plan-error" class="history-error" role="alert" hidden></p></div><footer class="sheet-footer"><button id="history-plan-cancel" class="secondary-button" type="button">Cancel</button><button class="primary-button" type="submit">Save notes</button></footer></form></dialog>`;

const icons = `<svg class="history-icons" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <symbol id="history-i-grid" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </symbol>
      <symbol id="history-i-folder" viewBox="0 0 24 24">
        <path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3z" />
      </symbol>
      <symbol id="history-i-heart" viewBox="0 0 24 24">
        <path d="M20 5a5 5 0 0 0-7 0l-1 1-1-1a5 5 0 0 0-7 7l8 8 8-8a5 5 0 0 0 0-7z" />
      </symbol>
      <symbol id="history-i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></symbol>
      <symbol id="history-i-arrow" viewBox="0 0 24 24"><path d="m14 6-6 6 6 6M8 12h13" /></symbol>
      <symbol id="history-i-bought" viewBox="0 0 24 24">
        <path d="M5 8h14l1 12H4zM8 8V6a4 4 0 0 1 8 0v2" />
      </symbol>
      <symbol id="history-i-pulled" viewBox="0 0 24 24">
        <path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" />
      </symbol>
      <symbol id="history-i-gift" viewBox="0 0 24 24">
        <path
          d="M3 10h18v4H3zM5 14v7h14v-7M12 10v11M12 10S4 10 5 5c1-4 7 0 7 5Zm0 0s8 0 7-5c-1-4-7 0-7 5Z"
        />
      </symbol>
      <symbol id="history-i-trade" viewBox="0 0 24 24">
        <path d="M4 7h15l-4-4M20 17H5l4 4M19 7l-4 4M5 17l4-4" />
      </symbol>
      <symbol id="history-i-other" viewBox="0 0 24 24">
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </symbol>
      <symbol id="history-i-edit" viewBox="0 0 24 24">
        <path d="m15 5 4 4M4 20l1-5L16 4a3 3 0 0 1 4 4L9 19z" />
      </symbol>
      <symbol id="history-i-lock" viewBox="0 0 24 24">
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </symbol>
      <symbol id="history-i-check" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></symbol>
      <symbol id="history-i-close" viewBox="0 0 24 24"><path d="m6 6 12 12M6 18 18 6" /></symbol>
      <symbol id="history-i-clock" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6l4 2" />
      </symbol>
    </svg>`;

const entryTemplate = `<dialog
      id="entry-dialog"
      class="history-dialog"
      aria-labelledby="entry-title"
      aria-describedby="entry-description"
    >
      <form id="entry-form">
        <header class="sheet-heading">
          <div>
            <h2 id="entry-title">Add entry</h2>
            <p id="entry-description">Record how you got this card.</p>
          </div>
          <button class="icon-button" id="close-entry" type="button" aria-label="Close entry form">
            <svg class="icon"><use href="#history-i-close" /></svg>
          </button>
        </header>
        <div class="sheet-body">
          <div class="mini-card">
            <img id="entry-card-image" width="38" height="53" alt="" />
            <div><strong id="entry-card-name"></strong><span id="entry-card-reference"></span></div>
            <span class="mini-finish" id="entry-card-finish"></span>
          </div>
          <fieldset id="entry-purpose">
            <legend>This entry is for</legend>
            <div class="purpose-options">
              <label
                ><input name="purpose" type="radio" value="new" checked /><span
                  >New copies</span
                ></label
              ><label id="existing-purpose-label"
                ><input name="purpose" type="radio" value="existing" /><span
                  >Copies I already own</span
                ></label
              >
            </div>
          </fieldset>
          <fieldset class="method-field">
            <legend>How did you get it?</legend>
            <div class="method-options">
              <label
                ><input name="method" value="bought" type="radio" checked /><span
                  ><svg class="icon"><use href="#history-i-bought" /></svg>Bought</span
                ></label
              ><label
                ><input name="method" value="pulled" type="radio" /><span
                  ><svg class="icon"><use href="#history-i-pulled" /></svg>Pulled</span
                ></label
              ><label
                ><input name="method" value="gift" type="radio" /><span
                  ><svg class="icon"><use href="#history-i-gift" /></svg>Gift</span
                ></label
              ><label
                ><input name="method" value="trade" type="radio" /><span
                  ><svg class="icon"><use href="#history-i-trade" /></svg>Trade</span
                ></label
              ><label
                ><input name="method" value="other" type="radio" /><span
                  ><svg class="icon"><use href="#history-i-other" /></svg>Other</span
                ></label
              >
            </div>
          </fieldset>
          <div class="form-grid date-quantity">
            <label
              ><span>Date <span class="optional">optional</span></span
              ><input id="entry-date" type="date" /></label
            ><label
              >Copies<input
                id="entry-quantity"
                type="number"
                min="1"
                max="999"
                step="1"
                value="1"
                required
                inputmode="numeric"
            /></label>
          </div>
          <label
            ><span
              ><span id="source-label">Shop or seller</span>
              <span class="optional">optional</span></span
            ><input id="entry-source" maxlength="160" placeholder="e.g. a card shop or card show"
          /></label>
          <div id="price-fields">
            <div class="form-grid">
              <label
                ><span
                  ><span id="price-label">Total paid</span>
                  <span class="optional">optional</span></span
                ><span class="money-input"
                  ><span id="entry-currency-label">€</span
                  ><input
                    id="entry-price"
                    type="number"
                    min="0"
                    max="9999999"
                    step="0.01"
                    inputmode="decimal"
                    placeholder="0.00" /></span></label
              ><label
                >Currency<select id="entry-currency">
                  <option value="EUR">EUR — Euro</option>
                  <option value="USD">USD — US dollar</option>
                  <option value="GBP">GBP — Pound</option>
                  <option value="JPY">JPY — Yen</option>
                </select></label
              >
            </div>
            <p class="field-hint">
              The total for the copies in this entry, including any delivery cost you want to
              record.
            </p>
          </div>
          <p id="pull-hint" class="pull-hint" hidden>
            Opened a pack or box? You can record it above. Leave the pack price in your notes.
          </p>
          <label
            ><span>Notes <span class="optional">optional</span></span
            ><textarea
              id="entry-notes"
              maxlength="1000"
              rows="3"
              placeholder="Anything you would like to remember…"
            ></textarea>
          </label>
          <label class="checkbox-label" id="remove-wanted-label" hidden
            ><input id="remove-wanted" type="checkbox" checked /><span
              >Remove this card from my wishlist</span
            ></label
          >
          <div id="count-preview" class="count-preview" aria-live="polite"></div>
          <p class="form-error" id="entry-error" role="alert" hidden></p>
        </div>
        <footer class="sheet-footer">
          <button type="button" id="delete-entry" class="text-button delete-button" hidden>
            Delete entry</button
          ><button class="secondary-button" id="cancel-entry" type="button">Cancel</button
          ><button class="primary-button" id="save-entry" type="submit">
            <svg class="icon"><use href="#history-i-check" /></svg><span>Save entry</span>
          </button>
        </footer>
      </form>
    </dialog>`;

const removalTemplate = `<dialog
      id="removal-dialog"
      class="history-dialog"
      aria-labelledby="removal-title"
      aria-describedby="removal-description"
    >
      <form id="removal-form">
        <header class="sheet-heading">
          <div>
            <h2 id="removal-title">Remove a copy</h2>
            <p id="removal-description">The card and its history will stay saved.</p>
          </div>
          <button
            id="close-removal"
            class="icon-button"
            type="button"
            aria-label="Close removal form"
          >
            <svg class="icon"><use href="#history-i-close" /></svg>
          </button>
        </header>
        <div class="sheet-body">
          <p id="removal-card-reference" class="removal-card-reference"></p>
          <fieldset id="removal-picker">
            <legend id="removal-picker-label">Which copy?</legend>
            <div id="removal-choices" class="removal-choices"></div>
          </fieldset>
          <label
            >What happened?<select id="removal-reason">
              <option value="removed">Removed · Details not recorded</option>
              <option value="sold">Sold</option>
              <option value="traded">Traded</option>
              <option value="given">Given away</option>
              <option value="lost">Lost</option>
              <option value="other">Other</option>
            </select></label
          >
          <label
            ><span>Date <span class="optional">optional</span></span
            ><input id="removal-date" type="date"
          /></label>
          <label
            ><span
              ><span id="removal-person-label">Person or place</span>
              <span class="optional">optional</span></span
            ><input
              id="removal-person"
              maxlength="160"
              placeholder="Who received it, or where it happened"
          /></label>
          <div id="removal-price-fields" hidden>
            <div class="form-grid">
              <label
                ><span>Total received <span class="optional">optional</span></span
                ><span class="money-input"
                  ><span id="removal-currency-label">€</span
                  ><input
                    id="removal-price"
                    type="number"
                    min="0"
                    max="9999999"
                    step="0.01"
                    inputmode="decimal"
                    placeholder="0.00" /></span
              ></label>
              <label
                >Currency<select id="removal-currency">
                  <option value="EUR">EUR — Euro</option>
                  <option value="USD">USD — US dollar</option>
                  <option value="GBP">GBP — Pound</option>
                  <option value="JPY">JPY — Yen</option>
                </select></label
              >
            </div>
            <p class="field-hint">The total received for the sale or trade.</p>
          </div>
          <label
            ><span>Notes <span class="optional">optional</span></span
            ><textarea
              id="removal-notes"
              maxlength="1000"
              rows="3"
              placeholder="Anything else you want to keep in the history"
            ></textarea>
          </label>
          <p id="removal-error" class="history-error" role="alert" hidden></p><p id="removal-count-preview" class="count-preview" aria-live="polite"></p>
        </div>
        <footer class="sheet-footer">
          <button id="cancel-removal" class="secondary-button" type="button">Cancel</button
          ><button id="save-removal" class="primary-button" type="submit">Remove from owned</button>
        </footer>
      </form>
    </dialog>`;

export function createCardHistory({ getContext, canEdit, commit, refresh }) {
  const host = document.createElement('div');
  host.dataset.cloudUi = '';
  host.innerHTML = icons + entryTemplate + removalTemplate + planTemplate;
  document.body.append(host);
  const $ = (id) => host.querySelector(`#${id}`);
  let active,
    editing,
    requested = 1,
    filter = 'all',
    limit = 6,
    viewKey;
  const current = () => getContext();
  const signature = (context) =>
    JSON.stringify({
      variantId: context.variantId,
      quantity: context.own.quantity,
      wanted: context.own.wanted,
      history: validateHistory(historyOf(context.own), context.own.quantity),
    });
  function begin() {
    if (!canEdit()) return false;
    active = { context: current(), signature: signature(current()) };
    return true;
  }
  function assertCurrent() {
    if (!active || active.signature !== signature(current()))
      throw new Error(
        'This card changed while this form was open. Close it and open it again before saving.',
      );
  }
  async function submit(form, errorId, makeChange, deleteButton) {
    const error = $(errorId);
    error.hidden = true;
    try {
      if (!canEdit() || (!deleteButton && !form.reportValidity())) return;
      assertCurrent();
      const data = makeChange();
      data.history = validateHistory(data.history, data.quantity);
      const button = deleteButton || form.querySelector('[type="submit"]');
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      try {
        if (await commit(data, Boolean(deleteButton))) form.closest('dialog').close();
        else throw new Error('The change could not be saved. Try again.');
      } finally {
        button.disabled = false;
        button.setAttribute('aria-busy', 'false');
      }
    } catch (reason) {
      error.textContent = reason.message;
      error.hidden = false;
    }
  }
  function close() {
    for (const dialog of host.querySelectorAll('dialog[open]')) dialog.close();
    active = null;
  }
  for (const [button, dialog] of [
    ['close-entry', 'entry-dialog'],
    ['cancel-entry', 'entry-dialog'],
    ['close-removal', 'removal-dialog'],
    ['cancel-removal', 'removal-dialog'],
    ['history-plan-close', 'history-plan-dialog'],
    ['history-plan-cancel', 'history-plan-dialog'],
  ])
    $(button).onclick = () => $(dialog).close();

  function entryForm(purpose = 'existing', id = null) {
    if (!begin()) return;
    const { card, variant, own } = active.context;
    const history = historyOf(own);
    editing = id;
    const entry = history.entries.find((item) => item.id === id);
    $('entry-form').reset();
    $('entry-error').hidden = true;
    $('entry-title').textContent = entry ? 'Edit entry' : 'Add entry';
    $('entry-purpose').hidden = Boolean(entry);
    $('existing-purpose-label').querySelector('input').disabled = !unrecordedCount(own);
    $('entry-form').elements.purpose.value =
      !entry && purpose === 'existing' && !unrecordedCount(own) ? 'new' : purpose;
    $('entry-form').elements.method.value = entry?.method || 'bought';
    $('entry-date').value = entry?.date || '';
    $('entry-quantity').value = entry?.quantity || 1;
    $('entry-source').value = entry?.source || '';
    $('entry-price').value = entry?.amount ?? '';
    $('entry-currency').value = entry?.currency || history.plan?.currency || 'EUR';
    $('entry-notes').value = entry?.notes || '';
    $('remove-wanted-label').hidden = Boolean(entry) || !own.wanted;
    $('delete-entry').hidden = !entry;
    $('save-entry').querySelector('span').textContent = entry ? 'Save changes' : 'Save entry';
    $('entry-card-name').textContent = card.name;
    $('entry-card-reference').textContent = `${card.setName} · ${card.number}`;
    $('entry-card-finish').textContent = variant;
    const thumbnail = $('entry-card-image');
    const image = active.context.image;
    thumbnail.hidden = !image;
    if (image && thumbnail.getAttribute('src') !== image) thumbnail.src = image;
    updateEntryForm();
    $('entry-dialog').showModal();
  }
  function updateEntryForm() {
    if (!active) return;
    const form = $('entry-form'),
      own = active.context.own,
      history = historyOf(own);
    const entry = history.entries.find((item) => item.id === editing);
    const method = form.elements.method.value;
    const source = {
      bought: 'Shop or seller',
      pulled: 'Pack, box, or place',
      gift: 'From whom or where',
      trade: 'Person or place',
      other: 'Person or place',
    };
    $('source-label').textContent = source[method];
    $('entry-source').placeholder = '';
    $('price-fields').hidden = !['bought', 'trade'].includes(method);
    $('entry-price').disabled = $('price-fields').hidden;
    $('entry-currency').disabled = $('price-fields').hidden;
    $('pull-hint').hidden = method !== 'pulled';
    $('price-label').textContent = method === 'trade' ? 'Extra cash paid' : 'Total paid';
    $('entry-currency-label').textContent = currencies[$('entry-currency').value];
    $('entry-price').step = $('entry-currency').value === 'JPY' ? '1' : '0.01';
    const purpose = form.elements.purpose.value;
    $('entry-quantity').min = entry ? Math.max(1, removedFrom(entry, history)) : 1;
    $('entry-quantity').max = entry
      ? unrecordedCount(own) + entry.quantity
      : purpose === 'new'
        ? 999 - own.quantity
        : unrecordedCount(own);
    const quantity = Number($('entry-quantity').value);
    $('count-preview').textContent =
      entry || purpose === 'existing'
        ? `Your total stays at ${copies(own.quantity)}.`
        : `Adds ${copies(quantity)}. Your total will be ${copies(own.quantity + quantity)}.`;
  }
  $('entry-form').oninput = $('entry-form').onchange = updateEntryForm;
  $('entry-form').onsubmit = (event) => {
    event.preventDefault();
    void submit(event.currentTarget, 'entry-error', () => {
      const own = current().own,
        history = structuredClone(historyOf(own)),
        form = $('entry-form');
      const old = history.entries.find((item) => item.id === editing);
      const quantity = Number($('entry-quantity').value);
      const method = form.elements.method.value;
      const entry = {
        id: editing || crypto.randomUUID(),
        method,
        quantity,
        date: $('entry-date').value,
        source: $('entry-source').value,
        amount: ['bought', 'trade'].includes(method) ? $('entry-price').value : '',
        currency: $('entry-currency').value,
        notes: $('entry-notes').value,
        originUnknown: false,
      };
      if (old) history.entries[history.entries.indexOf(old)] = entry;
      else history.entries.push(entry);
      return {
        quantity: own.quantity + (!old && form.elements.purpose.value === 'new' ? quantity : 0),
        wanted:
          own.wanted &&
          (!own.wanted || $('remove-wanted-label').hidden || !$('remove-wanted').checked),
        history,
      };
    });
  };
  $('delete-entry').onclick = (event) => {
    if (
      !canEdit() ||
      !confirm('Delete this entry and its related history? Your owned count stays the same.')
    )
      return;
    void submit(
      $('entry-form'),
      'entry-error',
      () => deleteHistoryEntry(current().own, editing),
      event.currentTarget,
    );
  };

  function allocations() {
    const history = historyOf(active.context.own);
    const existing = history.changes.find((item) => item.id === editing);
    if (existing) return existing.allocations.map((part) => ({ ...part }));
    if (requested === 1) {
      const selected = $('removal-form').querySelector('[name="removal-copy"]:checked');
      return selected ? [{ entryId: selected.value, quantity: 1 }] : [];
    }
    return [...$('removal-choices').querySelectorAll('[data-remove-from]')]
      .map((input) => ({ entryId: input.dataset.removeFrom, quantity: Number(input.value) }))
      .filter((part) => part.quantity > 0);
  }
  function removalForm(quantity = 1, id = null) {
    if (!begin()) return;
    const { card, variant, own } = active.context,
      history = historyOf(own);
    const existing = history.changes.find((item) => item.id === id);
    if (!existing && !own.quantity) return;
    editing = id;
    requested = existing?.quantity || Math.min(quantity, own.quantity);
    $('removal-form').reset();
    $('removal-error').hidden = true;
    $('removal-title').textContent = existing
      ? 'Edit change'
      : requested === 1
        ? 'Remove a copy'
        : `Remove ${copies(requested)}`;
    $('removal-description').textContent = existing
      ? 'Update what happened. Copy counts stay the same.'
      : 'The card and its history will stay saved.';
    $('save-removal').textContent = existing ? 'Save changes' : 'Remove from owned';
    $('removal-card-reference').textContent =
      `${card.name} · ${card.setName} · ${card.number} · ${variant}`;
    $('removal-picker').hidden = Boolean(existing);
    $('removal-picker-label').textContent =
      requested === 1 ? 'Which copy?' : `Which ${copies(requested)}?`;
    const groups = history.entries
      .filter((entry) => remaining(entry, history) > 0)
      .map((entry) => ({
        id: entry.id,
        quantity: remaining(entry, history),
        title: `${entry.originUnknown ? 'Details not recorded' : methodNames[entry.method]} · ${dateLabel(entry.date)}`,
        source: entry.source,
      }));
    if (unrecordedCount(own))
      groups.push({
        id: 'unrecorded',
        quantity: unrecordedCount(own),
        title: 'Details not recorded',
        source: '',
      });
    $('removal-choices').innerHTML = groups
      .map((group) => {
        const label = `<span><strong>${escape(group.title)}</strong><small>${escape(group.source)}${group.source ? ' · ' : ''}${copies(group.quantity)} owned</small></span>`;
        return requested === 1
          ? `<label class="removal-choice"><input type="radio" name="removal-copy" value="${escape(group.id)}" ${groups.length === 1 ? 'checked' : ''}>${label}</label>`
          : `<label class="removal-choice removal-choice-quantity">${label}<input type="number" min="0" max="${Math.min(group.quantity, requested)}" step="1" required inputmode="numeric" value="${groups.length === 1 ? requested : 0}" data-remove-from="${escape(group.id)}" aria-label="Copies to remove from ${escape(group.title)}"></label>`;
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
    if (!active) return;
    const reason = $('removal-reason').value;
    const withPrice = ['sold', 'traded'].includes(reason);
    $('removal-price-fields').hidden = !withPrice;
    $('removal-price').disabled = $('removal-currency').disabled = !withPrice;
    $('removal-price').step = $('removal-currency').value === 'JPY' ? '1' : '0.01';
    $('removal-currency-label').textContent = currencies[$('removal-currency').value];
    $('removal-person-label').textContent =
      reason === 'sold' ? 'Buyer or place' : reason === 'given' ? 'Given to' : 'Person or place';
    const selected = allocations().reduce((sum, part) => sum + part.quantity, 0);
    $('save-removal').disabled = selected !== requested;
    $('removal-count-preview').textContent = editing
      ? `Your total stays at ${copies(active.context.own.quantity)}.`
      : selected !== requested
        ? `Select ${copies(requested)}. ${selected} selected.`
        : `${copies(active.context.own.quantity - requested)} will remain owned. The history is kept.`;
  }
  $('removal-form').oninput = $('removal-form').onchange = updateRemovalForm;
  $('removal-form').onsubmit = (event) => {
    event.preventDefault();
    void submit(event.currentTarget, 'removal-error', () => {
      const own = current().own,
        history = structuredClone(historyOf(own));
      const existing = history.changes.find((item) => item.id === editing);
      const fields = {
        reason: $('removal-reason').value,
        date: $('removal-date').value,
        person: $('removal-person').value,
        amount: ['sold', 'traded'].includes($('removal-reason').value)
          ? $('removal-price').value
          : '',
        currency: $('removal-currency').value,
        notes: $('removal-notes').value,
      };
      const parts = allocations();
      if (parts.reduce((sum, part) => sum + part.quantity, 0) !== requested)
        throw new Error('Choose the copies to remove.');
      if (existing) {
        Object.assign(existing, fields);
        return { quantity: own.quantity, wanted: own.wanted, history };
      }
      return removeCopies(own, parts, fields, crypto.randomUUID(), crypto.randomUUID());
    });
  };

  function planForm() {
    if (!begin()) return;
    const plan = historyOf(active.context.own).plan || {
      amount: '',
      currency: 'EUR',
      shop: '',
      link: '',
      notes: '',
    };
    $('history-plan-card').textContent = `${active.context.card.name} · ${active.context.variant}`;
    $('plan-error').hidden = true;
    for (const key of ['amount', 'currency', 'shop', 'link', 'notes'])
      $(`plan-${key}`).value = plan[key];
    updatePlanCurrency();
    $('history-plan-dialog').showModal();
  }
  function updatePlanCurrency() {
    $('plan-amount').step = $('plan-currency').value === 'JPY' ? '1' : '0.01';
    $('plan-currency-symbol').textContent = currencies[$('plan-currency').value];
  }
  $('plan-currency').onchange = updatePlanCurrency;
  $('history-plan-form').onsubmit = (event) => {
    event.preventDefault();
    void submit(event.currentTarget, 'plan-error', () => {
      const own = current().own,
        history = structuredClone(historyOf(own));
      const plan = Object.fromEntries(
        ['amount', 'currency', 'shop', 'link', 'notes'].map((key) => [
          key,
          $(`plan-${key}`).value.trim(),
        ]),
      );
      history.plan = plan.amount || plan.shop || plan.link || plan.notes ? plan : null;
      return { quantity: own.quantity, wanted: own.wanted, history };
    });
  };

  function markup(own, saved) {
    const key = current()?.variantId;
    if (key !== viewKey) {
      close();
      filter = 'all';
      limit = 6;
      viewKey = key;
    }
    if (!saved) return '';
    const history = historyOf(own),
      past = pastCount(history),
      disabled = !canEdit();
    const changesFor = (entry) =>
      history.changes.filter((change) =>
        change.allocations.some((part) => part.entryId === entry.id),
      );
    const latest = (entry) =>
      [entry.date, ...changesFor(entry).map((change) => change.date)].sort().at(-1);
    const entries = history.entries
      .filter((entry) =>
        filter === 'owned'
          ? remaining(entry, history) > 0
          : filter === 'past'
            ? removedFrom(entry, history) > 0
            : true,
      )
      .sort((a, b) => latest(b).localeCompare(latest(a)));
    const rows = entries
      .slice(0, limit)
      .map((entry) => {
        const changes = changesFor(entry);
        const title = entry.originUnknown ? 'Details not recorded' : methodNames[entry.method];
        return `<article class="history-entry" id="history-entry-${entry.id}"><span class="history-method">${symbol(entry.method)}</span><div class="history-entry-main"><div class="history-entry-top"><h4>${escape(title)}</h4><span>${escape(dateLabel(entry.date))}</span><strong class="history-amount">${entry.amount !== '' ? escape(money(entry.amount, entry.currency)) : ''}</strong><button data-history-edit="${entry.id}" class="history-edit" aria-label="Edit ${escape(title.toLowerCase())} entry" ${disabled ? 'disabled' : ''}>${symbol('edit')}</button></div><p>${escape(entry.source || 'Place not recorded')} <small>· ${copies(entry.quantity)}</small></p>${entry.notes ? `<p class="history-note">${escape(entry.notes)}</p>` : ''}${changes.length ? `<p class="history-ownership">${remaining(entry, history) ? `${copies(remaining(entry, history))} still owned` : 'Previously owned'}</p>` : ''}${changes
          .slice(0, limit)
          .map((change) => {
            const part = change.allocations.find((allocation) => allocation.entryId === entry.id);
            return `<div class="history-change"><div class="history-entry-top"><h4>${escape(changeNames[change.reason])}</h4><span>${escape(dateLabel(change.date))}</span><button data-history-change="${change.id}" class="history-edit" aria-label="Edit ${escape(changeNames[change.reason].toLowerCase())} details" ${disabled ? 'disabled' : ''}>${symbol('edit')}</button></div><p>${escape(change.person)}${change.person ? ' · ' : ''}${copies(part.quantity)}${change.amount !== '' ? ` · ${escape(money(change.amount, change.currency))} received in total` : ''}</p>${change.notes ? `<p class="history-note">${escape(change.notes)}</p>` : ''}</div>`;
          })
          .join(
            '',
          )}${changes.length > limit ? '<button data-history-expand class="text-button">Show more changes</button>' : ''}</div></article>`;
      })
      .join('');
    const plan = history.plan;
    return `${
      own.quantity || hasHistory(own)
        ? `<section id="card-history" class="card-history" aria-labelledby="card-history-title"><header class="history-heading"><div><h3 id="card-history-title">Card history</h3><p>${copies(own.quantity)} owned${past ? ` · ${copies(past)} previously owned` : ''}</p></div>${history.entries.length ? `<button id="history-add-entry" class="text-button" ${disabled || (!unrecordedCount(own) && own.quantity >= 999) ? 'disabled' : ''}>${symbol('plus')}Add entry</button>` : ''}</header>${
            past
              ? `<div class="history-filters" role="group" aria-label="History filter">${[
                  ['all', 'All'],
                  ['owned', 'Still owned'],
                  ['past', 'Previously owned'],
                ]
                  .map(
                    ([value, label]) =>
                      `<button data-history-filter="${value}" aria-pressed="${filter === value}">${label}</button>`,
                  )
                  .join('')}</div>`
              : ''
          }<div class="history-list">${rows}</div>${!entries.length && history.entries.length ? '<p class="history-note">No copies match this filter.</p>' : ''}${entries.length > limit ? '<button id="history-more" class="text-button">Show more entries</button>' : ''}${unrecordedCount(own) ? `<div class="history-unrecorded"><span>${copies(unrecordedCount(own))} without details</span><button id="history-describe" class="text-button" ${disabled ? 'disabled' : ''}>Add details</button></div>` : ''}</section>`
        : ''
    }${own.wanted || plan ? `<section class="card-history-plan" aria-labelledby="history-plan-heading"><header class="history-heading"><h3 id="history-plan-heading">Wishlist notes</h3><button id="history-plan-edit" class="text-button" ${disabled ? 'disabled' : ''}>${plan ? 'Edit notes' : 'Add notes'}</button></header>${plan ? `<p>${plan.amount !== '' ? `Target: ${escape(money(plan.amount, plan.currency))}` : ''}${plan.amount !== '' && plan.shop ? ' · ' : ''}${escape(plan.shop)}</p>${plan.notes ? `<p class="history-note">${escape(plan.notes)}</p>` : ''}${plan.link ? `<a href="${escape(plan.link)}" target="_blank" rel="noopener noreferrer">Open shop link</a>` : ''}` : ''}</section>` : ''}${hasHistory(own) || own.wanted || plan ? `<p class="history-privacy">${symbol('lock')}Prices, places, people, and notes stay private.</p>` : ''}`;
  }
  function bind(screen) {
    const listen = (id, work) => {
      const button = screen.querySelector(`#${id}`);
      if (button) button.onclick = work;
    };
    listen('history-add-entry', () =>
      entryForm(unrecordedCount(current().own) ? 'existing' : 'new'),
    );
    listen('history-describe', () => entryForm('existing'));
    listen('detail-record-history', () => entryForm('existing'));
    listen('history-plan-edit', planForm);
    listen('history-more', () => {
      limit += 6;
      refresh();
    });
    for (const button of screen.querySelectorAll('[data-history-expand]'))
      button.onclick = () => {
        limit += 6;
        refresh();
      };
    for (const button of screen.querySelectorAll('[data-history-filter]'))
      button.onclick = () => {
        filter = button.dataset.historyFilter;
        limit = 6;
        refresh();
      };
    for (const button of screen.querySelectorAll('[data-history-edit]'))
      button.onclick = () => entryForm('existing', button.dataset.historyEdit);
    for (const button of screen.querySelectorAll('[data-history-change]'))
      button.onclick = () => removalForm(0, button.dataset.historyChange);
  }
  return { markup, bind, remove: removalForm, close };
}
