import { emptyBinder, maxSpreads, sameBinder } from './binder-model.js';
import { bindImages, escape, picture, plural, updateMarkup, variantName } from './ui.js';

const firstLayout = emptyBinder();
const trayBatch = 24;

export function createCollectionBinder({ root, getCard, save, onError }) {
  root.innerHTML = `<div class="binder-toolbar">
      <div class="binder-format"><span>Pockets per page</span><div class="binder-buttons" role="group" aria-label="Pockets per page">
        <button type="button" class="filter" data-binder-size="4" aria-pressed="false">4 <small>2 × 2</small></button>
        <button type="button" class="filter" data-binder-size="9" aria-pressed="true">9 <small>3 × 3</small></button>
      </div></div>
      <div class="binder-buttons">
        <button type="button" class="secondary-button" id="binder-undo">Undo</button>
        <button type="button" class="secondary-button" id="binder-add-pages">Add pages</button>
      </div>
    </div>
    <div class="binder-stage">
      <div class="binder-book" id="binder-book" aria-label="Binder pockets"></div>
      <div class="binder-page-nav" role="group" aria-label="Turn pages">
        <button type="button" class="icon-button" id="binder-previous" aria-label="Previous pages"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
        <p id="binder-page-count" aria-live="polite"></p>
        <button type="button" class="icon-button" id="binder-next" aria-label="Next pages"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
      </div>
    </div>
    <section class="binder-tray" id="binder-tray" aria-labelledby="binder-tray-title">
      <div class="binder-tray-heading">
        <div><h3 id="binder-tray-title">Unplaced cards <span id="binder-tray-count"></span></h3>
        <p id="binder-instruction"></p></div>
        <button type="button" class="secondary-button" id="binder-return" hidden>Return to tray</button>
      </div>
      <label id="binder-filter-label" hidden>Find an unplaced card<input id="binder-filter" type="search" autocomplete="off"></label>
      <div class="binder-tray-cards" id="binder-tray-cards"></div>
      <button type="button" class="secondary-button" id="binder-more" hidden>Show more cards</button>
    </section>
    <p id="binder-status" role="status"></p>`;
  const $ = (id) => root.querySelector(`#binder-${id}`);
  const book = $('book'),
    tray = $('tray');
  const compact = matchMedia('(max-width: 700px)');
  let group, rows, editable, pending;
  let selected = null,
    dragged = null,
    dropTarget = null,
    limit = trayBatch,
    pages = { 4: 0, 9: 0 },
    history = { 4: [], 9: [] };
  const layout = () => group?.binder || firstLayout;
  const slots = () => layout().layouts[layout().size];
  const visiblePages = () => (compact.matches ? 1 : 2);
  const pageCount = () => slots().length / layout().size;
  const canChange = () => Boolean(group && editable && !pending);
  const setStatus = (message) => ($('status').textContent = message);

  function cardInfo(id) {
    const card = getCard(id);
    const variant = card?.variants.find((variant) => variant.id === id);
    const name = card?.name || 'Collection card';
    const finish = variant ? variantName(variant) : '';
    return {
      card,
      name,
      finish,
      label: [name, card?.setName, card?.number, finish].filter(Boolean).join(', '),
      missing: !rows[id]?.quantity,
    };
  }

  function cardFace({ card, missing }) {
    return `<span class="binder-card-face${missing ? ' binder-missing' : ''}" aria-hidden="true">
      ${card ? picture(card) : '<span class="tcg-picture">Card details unavailable</span>'}
      ${missing ? '<span class="binder-missing-label">Missing</span>' : ''}
    </span>`;
  }

  function normalizePage(index) {
    const last = Math.min(Math.max(0, index), pageCount() - 1);
    return compact.matches ? last : last - (last % 2);
  }

  function renderBook() {
    const { size } = layout();
    const first = (pages[size] = normalizePage(pages[size]));
    book.dataset.pockets = size;
    book.classList.toggle('binder-placing', Boolean(selected));
    updateMarkup(
      book,
      Array.from({ length: visiblePages() }, (_, offset) => {
        const page = first + offset;
        const start = page * size;
        const pockets = slots()
          .slice(start, start + size)
          .map((id, position) => {
            const index = start + position;
            const info = id && cardInfo(id);
            const label = `Page ${page + 1}, pocket ${position + 1}, ${info ? info.label + (info.missing ? ', missing' : '') : 'empty'}`;
            const card = info
              ? `data-binder-card="${escape(id)}" draggable="${canChange()}" aria-pressed="${selected === id}"`
              : '';
            return `<button type="button" id="binder-slot-${index}" class="binder-pocket" data-binder-slot="${index}" ${card} aria-label="${escape(label)}" aria-disabled="${!canChange()}">${info ? cardFace(info) : '<span aria-hidden="true">+</span>'}</button>`;
          })
          .join('');
        return `<section class="binder-page" id="binder-page-${page}" aria-label="Page ${page + 1}">
          <div class="binder-page-label" aria-hidden="true"><span>Page ${page + 1}</span><span>${size === 4 ? '2 × 2' : '3 × 3'}</span></div>
          <div class="binder-pocket-grid">${pockets}</div></section>`;
      }).join(''),
    );
    const label = compact.matches
      ? `Page ${first + 1} of ${pageCount()}`
      : `Pages ${first + 1}–${first + 2} of ${pageCount()}`;
    if ($('page-count').textContent !== label) $('page-count').textContent = label;
    $('previous').disabled = first === 0;
    $('next').disabled = first + visiblePages() >= pageCount();
    $('previous').setAttribute('aria-label', compact.matches ? 'Previous page' : 'Previous pages');
    $('next').setAttribute('aria-label', compact.matches ? 'Next page' : 'Next pages');
    bindImages(book);
  }

  function renderTray() {
    const placed = new Set(slots());
    const unplaced = group.variantIds.filter((id) => !placed.has(id));
    const query = $('filter').value.trim().toLowerCase();
    const matches = query
      ? unplaced.filter((id) => cardInfo(id).label.toLowerCase().includes(query))
      : unplaced;
    $('tray-count').textContent = unplaced.length;
    $('filter-label').hidden = unplaced.length <= trayBatch && !query;
    $('return').hidden = !selected || !placed.has(selected);
    $('return').disabled = !canChange();
    $('more').hidden = matches.length <= limit;
    const instructions = selected
      ? `${cardInfo(selected).name} selected. Choose a pocket.`
      : 'Drag a card into a pocket, or select a card and then a pocket.';
    if ($('instruction').textContent !== instructions) $('instruction').textContent = instructions;
    updateMarkup(
      $('tray-cards'),
      matches
        .slice(0, limit)
        .map((id) => {
          const info = cardInfo(id);
          return `<button type="button" class="binder-tray-card" id="binder-card-${escape(id)}"
          data-binder-card="${escape(id)}" draggable="${canChange()}" aria-pressed="${selected === id}" aria-disabled="${!canChange()}"
          aria-label="${escape(info.label + (info.missing ? ', missing' : ''))}">
          ${cardFace(info)}<span>${escape(info.name)}</span><small>${escape(info.finish)}</small></button>`;
        })
        .join('') ||
        `<p>${query ? 'No unplaced cards match this search.' : group.variantIds.length ? 'All cards are in the binder.' : 'Add cards to this collection to start your binder.'}</p>`,
    );
    bindImages($('tray-cards'));
  }

  function render() {
    if (root.hidden || !group) return;
    if (selected && !group.variantIds.includes(selected)) selected = null;
    renderBook();
    renderTray();
    const { size } = layout();
    for (const button of root.querySelectorAll('[data-binder-size]')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.binderSize) === size));
      button.setAttribute('aria-disabled', String(!canChange()));
    }
    $('add-pages').disabled = pageCount() >= maxSpreads * 2 || !editable;
    $('add-pages').setAttribute('aria-disabled', String(!canChange() || $('add-pages').disabled));
    const change = history[size].at(-1);
    $('undo').disabled = !change || !sameBinder(change.after, slots()) || !editable;
    $('undo').setAttribute('aria-disabled', String(!canChange() || $('undo').disabled));
  }

  async function commit(next, message, finish) {
    if (!canChange()) return false;
    const id = group.id;
    pending = id;
    setStatus('Saving binder layout…');
    render();
    try {
      await save(id, next, group.binder);
      if (group?.id === id) {
        finish?.();
        setStatus(message);
      }
      return true;
    } catch (error) {
      if (group?.id === id) {
        setStatus('');
        onError(error);
      }
      return false;
    } finally {
      pending = null;
      render();
    }
  }

  function changeSlots(next, page, message) {
    const { size, layouts } = layout();
    const before = layouts[size];
    const beforePage = pages[size];
    return commit({ size, layouts: { ...layouts, [size]: next } }, message, () => {
      history[size].push({ before, after: next, page: beforePage });
      if (history[size].length > 30) history[size].shift();
      pages[size] = page;
      selected = null;
    });
  }

  function move(id, index) {
    const next = [...slots()];
    const origin = next.indexOf(id);
    if (origin === index) return;
    const replaced = next[index];
    if (origin !== -1) next[origin] = replaced ?? null;
    if (index !== -1) next[index] = id;
    const name = cardInfo(id).name;
    return changeSlots(
      next,
      pages[layout().size],
      index === -1 ? `${name} returned to the tray.` : `${name} placed.`,
    );
  }

  function select(id) {
    selected = selected === id ? null : id;
    setStatus(
      selected ? `${cardInfo(selected).name} selected. Choose a pocket.` : 'Selection cleared.',
    );
    render();
  }

  function highlight(target) {
    if (target === dropTarget) return;
    dropTarget?.classList.remove('binder-drop-target');
    dropTarget = target;
    dropTarget?.classList.add('binder-drop-target');
  }

  function dropDestination(target) {
    return (
      target.closest('[data-binder-slot]') ||
      (tray.contains(target) && slots().includes(dragged) ? tray : null)
    );
  }

  root.addEventListener('dragstart', (event) => {
    const source = event.target.closest('[data-binder-card]');
    if (!source || !canChange()) return;
    dragged = source.dataset.binderCard;
    event.dataTransfer.setData('text/plain', dragged);
    event.dataTransfer.effectAllowed = 'move';
  });
  root.addEventListener('dragover', (event) => {
    if (!dragged || !canChange()) return;
    const target = dropDestination(event.target);
    highlight(target);
    if (target) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  });
  root.addEventListener('dragleave', (event) => {
    if (!root.contains(event.relatedTarget)) highlight(null);
  });
  root.addEventListener('drop', (event) => {
    if (!dragged || !canChange()) return;
    const target = dropDestination(event.target);
    if (!target) return;
    event.preventDefault();
    const id = dragged;
    dragged = null;
    highlight(null);
    void move(id, target === tray ? -1 : Number(target.dataset.binderSlot));
  });
  root.addEventListener('dragend', () => {
    dragged = null;
    highlight(null);
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selected && !pending) select(selected);
  });

  book.addEventListener('click', (event) => {
    const pocket = event.target.closest('[data-binder-slot]');
    if (!pocket || !canChange()) return;
    const index = Number(pocket.dataset.binderSlot);
    const id = slots()[index];
    if (selected && selected !== id) void move(selected, index);
    else if (id) select(id);
  });
  tray.addEventListener('click', (event) => {
    const button = event.target.closest('[data-binder-card]');
    if (!button || !canChange()) return;
    select(button.dataset.binderCard);
    if (selected) book.querySelector('.binder-pocket').focus({ preventScroll: !compact.matches });
  });
  $('return').onclick = async () => {
    if (!selected || !canChange()) return;
    const id = selected;
    if (await move(id, -1)) (document.getElementById(`binder-card-${id}`) || $('filter')).focus();
  };
  $('filter').oninput = () => {
    limit = trayBatch;
    renderTray();
  };
  $('more').onclick = () => {
    const first = limit;
    limit += trayBatch;
    renderTray();
    $('tray-cards').children[first]?.focus();
  };
  for (const [id, direction] of [
    ['previous', -1],
    ['next', 1],
  ])
    $(id).onclick = () => {
      pages[layout().size] += direction * visiblePages();
      renderBook();
      if ($(id).disabled) $(direction === 1 ? 'previous' : 'next').focus({ preventScroll: true });
    };
  compact.addEventListener('change', () => {
    if (!root.hidden && group) renderBook();
  });
  $('add-pages').onclick = () => {
    if (!canChange()) return;
    const next = [...slots(), ...Array(layout().size * 2).fill(null)];
    void changeSlots(next, pageCount(), 'Two empty pages added.');
  };
  $('undo').onclick = () => {
    const { size, layouts } = layout();
    const change = history[size].at(-1);
    if (!canChange() || !change || !sameBinder(change.after, slots())) return;
    void commit(
      { size, layouts: { ...layouts, [size]: change.before } },
      'Last binder edit undone.',
      () => {
        history[size].pop();
        pages[size] = change.page;
        selected = null;
      },
    );
  };
  for (const button of root.querySelectorAll('[data-binder-size]'))
    button.onclick = () => {
      const size = Number(button.dataset.binderSize);
      if (size === layout().size) return;
      void commit({ ...layout(), size }, `Showing the ${size}-pocket layout.`, () => {
        selected = null;
      });
    };

  return {
    update(next, inventory, canEdit) {
      if (group?.id !== next?.id) {
        selected = null;
        limit = trayBatch;
        $('filter').value = '';
        pages = { 4: 0, 9: 0 };
        history = { 4: [], 9: [] };
        setStatus('');
      }
      group = next;
      rows = inventory;
      editable = canEdit;
      render();
    },
  };
}
