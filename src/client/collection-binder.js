import { emptyBinder, maxSpreads } from './binder-model.js';
import { bindImages, escape, icon, picture, updateMarkup, variantName } from './ui.js';

const firstLayout = emptyBinder();
const trayBatch = 24;

export function createCollectionBinder({ root, manageButton, getCard, save, onError }) {
  root.innerHTML = `<div class="binder-settings" id="binder-settings" hidden>
      <div class="binder-format"><span>Pockets per page</span><div class="binder-buttons" role="group" aria-label="Pockets per page">
        <button type="button" class="filter" data-binder-size="4" aria-pressed="false">4</button>
        <button type="button" class="filter" data-binder-size="9" aria-pressed="true">9</button>
      </div></div>
      <p>Each pocket size has its own layout.</p>
      <div class="binder-buttons binder-page-actions">
        <button type="button" class="secondary-button" id="binder-add-pages">Add pages</button>
        <button type="button" class="secondary-button" id="binder-remove-pages" aria-describedby="binder-remove-help">Remove pages</button>
      </div>
      <p id="binder-remove-help">Cards on removed pages return to the tray. The binder keeps at least two pages.</p>
    </div>
    <div id="binder-view">
      <div class="binder-stage">
        <button type="button" class="icon-button" id="binder-expand" aria-label="Enlarge binder" title="Enlarge binder" aria-haspopup="dialog">${icon('expand')}</button>
        <div class="binder-page-nav" role="group" aria-label="Binder pages">
          <button type="button" class="icon-button" id="binder-previous" aria-label="Previous pages"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
          <div class="binder-book" id="binder-book" aria-label="Binder pockets"></div>
          <button type="button" class="icon-button" id="binder-next" aria-label="Next pages"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
          <p id="binder-page-count" aria-live="polite"></p>
        </div>
      </div>
      <section class="binder-tray" id="binder-tray" aria-label="Unplaced cards">
        <button type="button" class="secondary-button" id="binder-return" hidden>Return to tray</button>
        <label id="binder-filter-label" hidden>Search cards<input id="binder-filter" type="search" autocomplete="off"></label>
        <div class="binder-tray-cards" id="binder-tray-cards"></div>
        <button type="button" class="secondary-button" id="binder-more" hidden>Show more cards</button>
      </section>
      <p id="binder-status" role="status"></p>
    </div>
    <dialog class="binder-dialog" id="binder-zoom" aria-label="Enlarged binder">
      <button type="button" class="icon-button" id="binder-zoom-close" aria-label="Close enlarged binder" title="Close enlarged binder" autofocus>${icon('close')}</button>
    </dialog>`;
  const $ = (id) => root.querySelector(`#binder-${id}`);
  const book = $('book'),
    tray = $('tray'),
    view = $('view'),
    zoom = $('zoom'),
    expand = $('expand');
  expand.onclick = () => {
    zoom.append(view);
    zoom.showModal();
    zoom.scrollTop = 0;
  };
  $('zoom-close').onclick = () => zoom.close();
  zoom.addEventListener('close', () => {
    zoom.before(view);
    if (expand.getClientRects().length) expand.focus({ preventScroll: true });
  });
  const compact = matchMedia('(max-width: 700px)');
  let group, rows, editable, pending;
  let selected = null,
    dragged = null,
    dropTarget = null,
    limit = trayBatch,
    pages = { 4: 0, 9: 0 };
  const layout = () => group?.binder || firstLayout;
  const slots = () => layout().layouts[layout().size];
  const visiblePages = () => (compact.matches ? 1 : 2);
  const pageCount = () => slots().length / layout().size;
  const spreadStart = () => pages[layout().size] - (pages[layout().size] % 2);
  const canChange = () => Boolean(group && editable && !pending);
  const setStatus = (message) => ($('status').textContent = message);
  const showSettings = (open) => {
    $('settings').hidden = !open;
    manageButton.setAttribute('aria-expanded', String(open));
  };

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
    const removeLabel = `Remove pages ${spreadStart() + 1}–${spreadStart() + 2}`;
    if ($('remove-pages').textContent !== removeLabel) $('remove-pages').textContent = removeLabel;
    bindImages(book);
  }

  function renderTray() {
    const placed = new Set(slots());
    const unplaced = group.variantIds.filter((id) => !placed.has(id));
    const query = $('filter').value.trim().toLowerCase();
    const matches = query
      ? unplaced.filter((id) => cardInfo(id).label.toLowerCase().includes(query))
      : unplaced;
    $('return').hidden = !selected || !placed.has(selected);
    $('return').disabled = !canChange();
    tray.hidden = !unplaced.length && $('return').hidden && !(dragged && placed.has(dragged));
    $('filter-label').hidden = !unplaced.length || (unplaced.length <= trayBatch && !query);
    $('more').hidden = matches.length <= limit;
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
        .join('') || (unplaced.length ? '<p>No matching cards.</p>' : ''),
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
    $('remove-pages').disabled = pageCount() <= 2 || !editable;
    $('remove-pages').setAttribute(
      'aria-disabled',
      String(!canChange() || $('remove-pages').disabled),
    );
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
    return commit({ size, layouts: { ...layouts, [size]: next } }, message, () => {
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
    if (slots().includes(dragged)) tray.hidden = false;
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
    if (group && !root.hidden) renderTray();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !zoom.open && selected && !pending) select(selected);
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
  manageButton.onclick = () => showSettings($('settings').hidden);
  $('add-pages').onclick = () => {
    if (!canChange() || $('add-pages').disabled) return;
    const next = [...slots(), ...Array(layout().size * 2).fill(null)];
    void changeSlots(next, pageCount(), 'Two empty pages added.');
  };
  $('remove-pages').onclick = () => {
    if (!canChange() || $('remove-pages').disabled) return;
    const { size } = layout();
    const first = spreadStart();
    const next = [...slots()];
    next.splice(first * size, size * 2);
    void changeSlots(next, first, `Pages ${first + 1}–${first + 2} removed.`);
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
    closeZoom() {
      zoom.close();
    },
    update(next, inventory, canEdit) {
      if (root.hidden || group?.id !== next?.id) zoom.close();
      if (group?.id !== next?.id) {
        selected = null;
        dragged = null;
        showSettings(false);
        limit = trayBatch;
        $('filter').value = '';
        pages = { 4: 0, 9: 0 };
        setStatus('');
      }
      group = next;
      rows = inventory;
      editable = canEdit;
      render();
    },
  };
}
