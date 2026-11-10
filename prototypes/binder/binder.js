const cards = new Map(
  [
    [1, 'Bulbasaur', 'grass'],
    [2, 'Ivysaur', 'grass'],
    [3, 'Venusaur ex', 'grass'],
    [4, 'Charmander', 'fire'],
    [5, 'Charmeleon', 'fire'],
    [6, 'Charizard ex', 'fire', true],
    [7, 'Squirtle', 'water'],
    [8, 'Wartortle', 'water'],
    [9, 'Blastoise ex', 'water'],
    [10, 'Caterpie', 'grass'],
    [11, 'Metapod', 'grass'],
    [12, 'Butterfree', 'grass', true],
    [25, 'Pikachu', 'lightning'],
    [26, 'Raichu', 'lightning'],
    [39, 'Jigglypuff', 'colorless'],
    [52, 'Meowth', 'colorless'],
    [54, 'Psyduck', 'water'],
    [58, 'Growlithe', 'fire'],
    [59, 'Arcanine', 'fire'],
    [94, 'Gengar', 'psychic', true],
    [131, 'Lapras', 'water'],
    [133, 'Eevee', 'colorless'],
    [143, 'Snorlax', 'colorless'],
    [149, 'Dragonite', 'dragon', true],
  ].map(([id, name, type, missing = false]) => [id, { id, name, type, missing }]),
);

const storageKey = 'collect-binder-prototype-v1';
const compact = matchMedia('(max-width: 680px)');
const $ = (id) => document.getElementById(id);
const book = $('book');
const tray = $('tray');
const imagesReady = new Set();

function example() {
  const four = [1, 2, 3, null, 4, 5, 6, null, 7, null, 9, null, 25, 26, null, null];
  const nine = [1, 2, 3, 4, 5, 6, 7, null, 9, 25, 26, null, 39, 52, 54, null, 94, 133];
  return { size: 9, layouts: { 4: four, 9: [...nine, ...Array(18).fill(null)] } };
}

function load() {
  const fallback = example();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    for (const count of [4, 9]) {
      const slots = saved?.layouts?.[count];
      if (!Array.isArray(slots) || slots.length < count * 2 || slots.length % (count * 2)) continue;
      const occupied = slots.filter((id) => id !== null);
      if (occupied.every((id) => cards.has(id)) && new Set(occupied).size === occupied.length) {
        fallback.layouts[count] = slots;
      }
    }
    if (saved?.size === 4) fallback.size = 4;
  } catch {
    // The prototype can run in memory when browser storage is unavailable.
  }
  return fallback;
}

let state = load();
let view = 'binder';
let selected = null;
let dragged = null;
const currentPages = { 4: 0, 9: 0 };
const history = { 4: [], 9: [] };
const slots = () => state.layouts[state.size];
const page = () => currentPages[state.size];
const totalPages = () => slots().length / state.size;
const visiblePages = () => (compact.matches ? 1 : 2);
const cardNumber = (id) => String(id).padStart(3, '0');
const describe = (card) => `${card.name}${card.missing ? ', missing' : ''}`;

function announce(message) {
  $('announcement').textContent = message;
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Keep the current layout usable when browser storage is unavailable.
  }
}

function cardFace({ id, name, type, missing }) {
  const number = cardNumber(id);
  return `<span class="card-face${missing ? ' missing' : ''}" aria-hidden="true">
    <span class="card-sample ${type}"><span>${name}</span><img src="./sprites/${id}.png" alt="" draggable="false"><small>${number} / 165</small></span>
    <img class="card-image${imagesReady.has(id) ? ' loaded' : ''}" data-art="${id}" src="https://assets.tcgdex.net/en/sv/sv03.5/${number}/low.webp" alt="" draggable="false" loading="lazy">
    ${missing ? '<span class="missing-tag">Missing</span>' : ''}
  </span>`;
}

document.addEventListener(
  'load',
  (event) => {
    if (!event.target.matches?.('[data-art]')) return;
    imagesReady.add(Number(event.target.dataset.art));
    event.target.classList.add('loaded');
  },
  true,
);

function renderBook() {
  const count = state.size;
  const first = page();
  book.dataset.size = count;
  book.innerHTML = Array.from({ length: visiblePages() }, (_, offset) => {
    const pageNumber = first + offset;
    const start = pageNumber * count;
    const pockets = slots()
      .slice(start, start + count)
      .map((id, position) => {
        const card = cards.get(id);
        const label = `Page ${pageNumber + 1}, pocket ${position + 1}`;
        return `<button class="pocket" type="button" data-slot="${start + position}" ${card ? `data-card="${id}" draggable="true"` : ''} aria-label="${label}, ${card ? describe(card) : 'empty'}">${card ? cardFace(card) : '<span class="pocket-plus" aria-hidden="true">+</span>'}</button>`;
      })
      .join('');
    return `<section class="binder-page" aria-label="Page ${pageNumber + 1}">
      <div class="page-heading"><span>Page ${String(pageNumber + 1).padStart(2, '0')}</span><span>${count === 4 ? '2 × 2' : '3 × 3'}</span></div>
      <div class="pocket-grid">${pockets}</div>
    </section>`;
  }).join('');
  $('page-count').textContent = compact.matches
    ? `Page ${first + 1} of ${totalPages()}`
    : `Pages ${first + 1}–${first + 2} of ${totalPages()}`;
  $('previous').disabled = first === 0;
  $('next').disabled = first + visiblePages() >= totalPages();
  $('previous').setAttribute('aria-label', compact.matches ? 'Previous page' : 'Previous pages');
  $('next').setAttribute('aria-label', compact.matches ? 'Next page' : 'Next pages');
}

function renderTray() {
  const placed = new Set(slots());
  const unplaced = [...cards.values()].filter(({ id }) => !placed.has(id));
  $('tray-count').textContent = unplaced.length;
  $('tray-cards').innerHTML = unplaced.length
    ? unplaced
        .map(
          (card) =>
            `<button class="tray-card" type="button" data-card="${card.id}" draggable="true" aria-label="${describe(card)}">${cardFace(card)}<span class="tray-card-name">${card.name}</span></button>`,
        )
        .join('')
    : '<p class="tray-empty">All cards are in the binder. Move a card here to free its pocket.</p>';
}

function renderList() {
  const placement = new Map(slots().map((id, index) => [id, index]));
  $('card-list').innerHTML = [...cards.values()]
    .map((card) => {
      const index = placement.get(card.id);
      const location =
        index === undefined
          ? 'Unplaced'
          : `Page ${Math.floor(index / state.size) + 1} · Pocket ${(index % state.size) + 1}`;
      return `<li>${cardFace(card)}<strong>${card.name}</strong><span>${card.missing ? 'Missing' : 'Owned'}</span><small>${location}</small></li>`;
    })
    .join('');
}

function renderSelection() {
  const card = cards.get(selected);
  for (const button of $('binder-view').querySelectorAll('[data-card]')) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.card) === selected));
  }
  book.classList.toggle('placing', Boolean(card));
  $('return-card').hidden = !card || !slots().includes(selected);
  $('instruction').textContent = card
    ? `${card.name} selected. Choose a pocket.`
    : 'Drag a card into a pocket, or select a card and then a pocket.';
}

function renderLayout() {
  renderBook();
  renderTray();
  renderSelection();
  for (const button of document.querySelectorAll('button[data-size]')) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.size) === state.size));
  }
  $('undo').disabled = history[state.size].length === 0;
}

function select(id) {
  selected = id === selected ? null : id;
  renderSelection();
  announce(
    selected ? `${cards.get(selected).name} selected. Choose a pocket.` : 'Selection cleared.',
  );
}

function checkpoint() {
  const changes = history[state.size];
  changes.push({ slots: [...slots()], page: page() });
  if (changes.length > 30) changes.shift();
}

function move(id, target) {
  const origin = slots().indexOf(id);
  if (origin === target) return;
  const replaced = slots()[target];
  checkpoint();
  if (origin !== -1) slots()[origin] = replaced ?? null;
  if (target !== -1) slots()[target] = id;
  selected = null;
  save();
  renderLayout();
  announce(
    target === -1 ? `${cards.get(id).name} returned to the tray.` : `${cards.get(id).name} placed.`,
  );
}

function showPage(index) {
  currentPages[state.size] = compact.matches ? index : index - (index % 2);
  renderBook();
  renderSelection();
}

book.addEventListener('click', (event) => {
  const pocket = event.target.closest('[data-slot]');
  if (!pocket) return;
  const index = Number(pocket.dataset.slot);
  const id = slots()[index];
  if (selected && selected !== id) {
    move(selected, index);
    book.querySelector(`[data-slot="${index}"]`).focus({ preventScroll: true });
  } else if (id) {
    select(id);
  }
});

tray.addEventListener('click', (event) => {
  const card = event.target.closest('[data-card]');
  if (!card) return;
  select(Number(card.dataset.card));
  if (selected) {
    // Move focus to the pockets so a keyboard or touch user can place the card next.
    book.querySelector('.pocket').focus({ preventScroll: !compact.matches });
  }
});

$('return-card').addEventListener('click', () => {
  const id = selected;
  move(id, -1);
  tray.querySelector(`[data-card="${id}"]`).focus();
});

let dropTarget;
function markDropTarget(target) {
  if (target === dropTarget) return;
  dropTarget?.classList.remove('drop-target');
  dropTarget = target;
  dropTarget?.classList.add('drop-target');
}

const binderView = $('binder-view');
binderView.addEventListener('dragstart', (event) => {
  const source = event.target.closest('[data-card]');
  if (!source) return;
  dragged = Number(source.dataset.card);
  event.dataTransfer.setData('text/plain', String(dragged));
  event.dataTransfer.effectAllowed = 'move';
});

binderView.addEventListener('dragover', (event) => {
  if (dragged === null) return;
  const pocket = event.target.closest('[data-slot]');
  const target = pocket || (tray.contains(event.target) && slots().includes(dragged) ? tray : null);
  markDropTarget(target);
  if (!target) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
});

binderView.addEventListener('dragleave', (event) => {
  if (!binderView.contains(event.relatedTarget)) markDropTarget(null);
});

binderView.addEventListener('drop', (event) => {
  if (dragged === null || !dropTarget) return;
  event.preventDefault();
  const index = dropTarget === tray ? -1 : Number(dropTarget.dataset.slot);
  const id = dragged;
  markDropTarget(null);
  dragged = null;
  move(id, index);
});

binderView.addEventListener('dragend', () => {
  dragged = null;
  markDropTarget(null);
});

$('previous').addEventListener('click', () => showPage(page() - visiblePages()));
$('next').addEventListener('click', () => showPage(page() + visiblePages()));
compact.addEventListener('change', () => showPage(page()));

$('add-pages').addEventListener('click', () => {
  checkpoint();
  currentPages[state.size] = totalPages();
  slots().push(...Array(state.size * 2).fill(null));
  save();
  renderLayout();
  announce('Two empty pages added.');
});

$('undo').addEventListener('click', () => {
  const previous = history[state.size].pop();
  state.layouts[state.size] = previous.slots;
  currentPages[state.size] = compact.matches ? previous.page : previous.page - (previous.page % 2);
  selected = null;
  save();
  renderLayout();
  announce('Last change undone.');
});

for (const button of document.querySelectorAll('button[data-size]')) {
  button.addEventListener('click', () => {
    const size = Number(button.dataset.size);
    if (state.size === size) return;
    state.size = size;
    selected = null;
    if (!compact.matches) currentPages[size] -= currentPages[size] % 2;
    save();
    renderLayout();
    announce(`Showing your ${size}-pocket layout.`);
  });
}

for (const button of document.querySelectorAll('[data-view]')) {
  button.addEventListener('click', () => {
    view = button.dataset.view;
    for (const toggle of document.querySelectorAll('[data-view]')) {
      toggle.setAttribute('aria-pressed', String(toggle === button));
    }
    binderView.hidden = view !== 'binder';
    $('list-view').hidden = view !== 'list';
    if (view === 'list') renderList();
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && selected) select(selected);
});

$('reset').addEventListener('click', () => {
  if (!confirm('Reset both sample binder layouts?')) return;
  state = example();
  currentPages[4] = currentPages[9] = 0;
  history[4] = [];
  history[9] = [];
  selected = null;
  save();
  renderLayout();
  if (view === 'list') renderList();
  announce('Sample layouts reset.');
});

$('owned-count').textContent =
  `${[...cards.values()].filter((card) => !card.missing).length} of ${cards.size} owned`;
renderLayout();
