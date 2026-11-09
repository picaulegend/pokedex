import { visibleRecords } from './cloud-store.js';
import { createCardSearch } from './card-search-ui.js';
import { createCardDetail } from './card-detail.js';
import { hasHistory } from './card-history-model.js';
import { createShareControls } from './share-controls.js';
import {
  escape,
  imageUrl,
  picture,
  bindImages,
  languageName,
  preserveFocus,
  updateMarkup,
  credits,
  plural,
} from './ui.js';
export { variantName } from './ui.js';

export function createCardLibrary({
  app,
  api,
  navigation,
  shell,
  getState,
  canEdit,
  save,
  clearLegacy,
  admit,
}) {
  const screen = document.createElement('main');
  screen.id = 'card-library';
  screen.className = 'app-screen';
  screen.dataset.cloudUi = '';
  screen.hidden = true;
  screen.innerHTML = `<header class="view-heading"><img id="library-sprite" class="library-sprite" data-plain-image alt="" width="96" height="96" hidden><div><span id="library-dex" class="library-dex" hidden></span><h2 id="library-title"></h2><p id="library-summary"></p><div id="collection-progress" class="collection-progress" hidden></div></div><div class="view-actions"><button class="primary-button" id="library-add">Add cards</button><button class="primary-button" id="new-collection" hidden>New collection</button><details id="collection-menu" class="view-menu" hidden><summary class="secondary-button">Manage</summary><div><button id="collection-rename">Rename</button><button id="collection-delete">Delete collection</button></div></details></div></header>
    <p id="library-message" role="status"></p><div id="library-legacy" hidden></div>
    <form id="collection-form" hidden><label>Collection name<input id="collection-name" maxlength="80" required placeholder="For example: Favourite artwork"></label><div class="form-actions"><button class="primary-button" type="submit">Save collection</button><button class="secondary-button" id="collection-cancel" type="button">Cancel</button></div></form>
    <details id="library-filter-panel" class="filter-panel"><summary>Filters <span id="library-filter-count"></span></summary><div id="library-filters"><label>Language<select id="card-language"><option value="">All languages</option><option value="en">English</option><option value="ja">Japanese</option></select></label><label>Set<select id="card-set"><option value="">All sets</option></select></label><label>Artist<select id="card-artist"><option value="">All artists</option></select></label><label id="wishlist-collection-label" hidden>Collection<select id="wishlist-collection"><option value="">All collections</option></select></label><label id="collection-status-label" hidden>Show<select id="collection-status"><option value="">All cards</option><option value="missing">Missing</option><option value="owned">Owned</option><option value="past">Previously owned</option></select></label><button class="secondary-button" id="library-clear-filters">Clear filters</button></div></details>
    <div id="library-content"></div>${credits}`;
  document.body.append(screen);
  const $ = (id) => screen.querySelector(`#${id}`);
  const metadata = new Map(),
    cache = new Map(),
    byVariant = new Map(),
    cardRequests = new Map();
  const filterIds = [
    'card-language',
    'card-set',
    'card-artist',
    'wishlist-collection',
    'collection-status',
  ];
  const filterSnapshots = new Map();
  let restoreFilters;
  let derivedState, derived;
  function snapshot() {
    const state = getState();
    if (derived && state === derivedState) return derived;
    const inventory = state ? visibleRecords(state, 'inventory') : {};
    const collections = Object.values(state ? visibleRecords(state, 'collection') : {}).filter(
      (group) => !group.deleted,
    );
    const personal = new Set(
      Object.values(inventory)
        .filter((row) => row.quantity || row.wanted || hasHistory(row))
        .map((row) => row.variantId),
    );
    const wanted = new Set(
      Object.values(inventory)
        .filter((row) => row.wanted)
        .map((row) => row.variantId),
    );
    for (const group of collections)
      for (const id of group.variantIds) {
        personal.add(id);
        if (!inventory[id]?.quantity) wanted.add(id);
      }
    derivedState = state;
    return (derived = {
      inventory,
      collections,
      groups: new Map(collections.map((group) => [group.id, group])),
      personal,
      wanted,
    });
  }
  const inventory = () => snapshot().inventory;
  const collections = () => snapshot().collections;
  const group = (id) => snapshot().groups.get(id);
  const personalIds = () => snapshot().personal;
  const wantedIds = () => snapshot().wanted;
  let route,
    cards = [],
    loadedKey = '',
    generation = 0,
    filtersKey,
    locked = true,
    galleryKey,
    galleryLimit = 48;
  function remember(card) {
    metadata.set(`${card.language}:${card.sourceId}`, { card, saved: true });
    for (const variant of card.variants) byVariant.set(variant.id, card);
    return card;
  }
  async function getCard(language, sourceId) {
    const key = `${language}:${sourceId}`;
    if (metadata.has(key)) return metadata.get(key);
    if (!cardRequests.has(key))
      cardRequests.set(
        key,
        api(`/api/cards/detail?${new URLSearchParams({ language, sourceId })}`)
          .then((result) => {
            metadata.set(key, result);
            for (const variant of result.card.variants) byVariant.set(variant.id, result.card);
            return result;
          })
          .finally(() => cardRequests.delete(key)),
      );
    return cardRequests.get(key);
  }
  function badges(variants, missing = false) {
    const rows = inventory();
    const copies = variants.reduce((n, v) => n + (rows[v.id]?.quantity || 0), 0),
      wanted = variants.some((v) => rows[v.id]?.wanted);
    const html =
      (copies ? `<span class="owned-badge">${copies} owned</span>` : '') +
      (!copies && variants.some((v) => hasHistory(rows[v.id]))
        ? '<span class="past-badge">Previously owned</span>'
        : '') +
      (wanted
        ? '<span class="wanted-badge">Wanted</span>'
        : missing && !copies
          ? '<span class="wanted-badge">Missing</span>'
          : '') +
      (missing && variants.length > 1 ? `<span>${variants.length} finishes</span>` : '');
    return html ? `<span class="ownership-badges">${html}</span>` : '';
  }
  function openCard(card, context = {}) {
    if (card.variants) remember(card);
    navigation.go('card', { language: card.language, sourceId: card.sourceId, ...context });
  }
  const search = createCardSearch({
    app,
    api,
    navigation,
    shell,
    openCard,
    collectionName: (id) => group(id)?.name,
    ownership: (card) => badges(card.variants || []),
  });
  const detail = createCardDetail({
    app,
    navigation,
    shell,
    getCard,
    getInventory: inventory,
    getCollections: collections,
    canEdit,
    save,
    admit,
  });
  const sharing = createShareControls({ api, canEdit, getState });
  const shareButton = document.createElement('button');
  shareButton.id = 'library-share';
  shareButton.className = 'secondary-button';
  shareButton.textContent = 'Share';
  shareButton.hidden = true;
  screen.querySelector('.view-actions').append(shareButton);
  shareButton.onclick = () =>
    sharing.open(
      {
        scope: route.screen === 'wishlist' ? 'wishlist' : 'collection',
        targetId: route.screen === 'collection' ? route.collection : '',
      },
      group(route.collection)?.name,
    );
  async function load(path, cacheKey = path) {
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const key = `carddex.catalogue.v1.${cacheKey}`;
    let result;
    try {
      result = (await api(path)).cards;
      try {
        sessionStorage.setItem(key, JSON.stringify(result));
      } catch {
        /* Memory still works. */
      }
    } catch (error) {
      try {
        result = JSON.parse(sessionStorage.getItem(key));
      } catch {
        /* Show the original error. */
      }
      if (!Array.isArray(result)) throw error;
    }
    if (cache.size >= 32) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, result);
    for (const card of result) remember(card);
    return result;
  }
  function viewIds() {
    if (route.screen === 'collections')
      return [...new Set(collections().flatMap((group) => group.variantIds.slice(0, 3)))];
    return route.screen === 'wishlist'
      ? [...wantedIds()]
      : route.screen === 'collection'
        ? group(route.collection)?.variantIds || []
        : [...personalIds()];
  }
  function recordKey() {
    return JSON.stringify([route.screen, route.pokemon, route.collection, viewIds().sort()]);
  }
  async function loadView() {
    const current = ++generation,
      ids = viewIds(),
      nextKey = recordKey();
    const view = { ...route };
    loadedKey = nextKey;
    const result = new Map();
    const include = (card) => !view.pokemon || card.pokemonIds.includes(Number(view.pokemon));
    for (const id of ids) {
      const card = byVariant.get(id);
      if (card && include(card)) result.set(card.id, card);
    }
    cards = [...result.values()];
    render();
    const missing = ids.filter((id) => !byVariant.has(id));
    if (!cards.length && missing.length && view.screen !== 'collections')
      $('library-content').innerHTML =
        '<p class="library-empty" role="status">Loading your cards…</p>';
    try {
      if (missing.length && view.screen === 'pokemon') {
        const path = `/api/catalogue?${new URLSearchParams({ pokemon: view.pokemon, personal: '1' })}`;
        for (const card of await load(path, `${path}:${ids.slice().sort().join(',')}`))
          result.set(card.id, card);
      } else
        for (let offset = 0; offset < missing.length; offset += 200) {
          if (current !== generation || screen.hidden) return;
          const query = new URLSearchParams({
            variants: missing
              .slice(offset, offset + 200)
              .sort()
              .join(','),
          });
          for (const card of await load(`/api/catalogue?${query}`)) result.set(card.id, card);
        }
      if (current !== generation || screen.hidden) return;
      cards = [...result.values()];
      setFilters();
      if (restoreFilters) {
        for (const [id, value] of Object.entries(restoreFilters.values)) $(id).value = value;
        $('library-filter-panel').open = restoreFilters.open;
        restoreFilters = null;
      }
      render();
    } catch (error) {
      if (current === generation) {
        loadedKey = '';
        $('library-content').replaceChildren();
        $('library-message').textContent = error.message;
      }
    }
  }
  function setFilters() {
    for (const [id, values, label] of [
      ['card-set', [...new Map(cards.map((c) => [c.setId, c.setName])).entries()], 'All sets'],
      [
        'card-artist',
        [...new Set(cards.map((c) => c.artist).filter(Boolean))].sort().map((name) => [name, name]),
        'All artists',
      ],
      ['wishlist-collection', collections().map((c) => [c.id, c.name]), 'All collections'],
    ]) {
      const previous = $(id).value;
      $(id).innerHTML =
        `<option value="">${label}</option>` +
        values
          .map(([value, name]) => `<option value="${escape(value)}">${escape(name)}</option>`)
          .join('');
      if (values.some(([value]) => value === previous)) $(id).value = previous;
    }
  }
  function clearFilters() {
    for (const id of [
      'card-language',
      'card-set',
      'card-artist',
      'wishlist-collection',
      'collection-status',
    ])
      $(id).value = '';
    render();
  }
  function showMessage(error) {
    $('library-message').textContent = error.message || 'This change could not be saved.';
  }
  function render() {
    if (!route || screen.hidden) return;
    const rows = inventory(),
      groups = collections(),
      current = group(route.collection);
    const isList = route.screen === 'collections',
      isGoal = route.screen === 'collection',
      isWishlist = route.screen === 'wishlist';
    const title = isList
      ? 'Collections'
      : isGoal
        ? current?.name || 'Collection not found'
        : isWishlist
          ? 'Wishlist'
          : app.pokemonName(Number(route.pokemon));
    shell.title(title, isGoal ? 'Collections' : route.screen === 'pokemon' ? 'Pokédex' : title);
    $('library-title').textContent = title;
    const isPokemon = route.screen === 'pokemon';
    $('library-sprite').hidden = $('library-dex').hidden = !isPokemon;
    if (isPokemon) {
      const image = app.pokemonImage(Number(route.pokemon));
      if ($('library-sprite').getAttribute('src') !== image) $('library-sprite').src = image;
      $('library-dex').textContent = `#${String(route.pokemon).padStart(4, '0')}`;
    }
    $('library-add').hidden = isList || (isGoal && !current);
    $('library-add').disabled = locked;
    $('new-collection').hidden = !isList;
    $('new-collection').disabled = locked;
    $('collection-menu').hidden = !isGoal || !current;
    shareButton.hidden = !(isWishlist || (isGoal && current));
    shareButton.disabled = locked;
    const goalOwned = current?.variantIds.filter((id) => rows[id]?.quantity > 0).length || 0,
      goalTotal = current?.variantIds.length || 0;
    const wanted = isWishlist ? wantedIds() : new Set();
    const choices = {
      'card-language': new Set(cards.map((c) => c.language)).size,
      'card-set': new Set(cards.map((c) => c.setId)).size,
      'card-artist': new Set(cards.map((c) => c.artist).filter(Boolean)).size,
      'wishlist-collection': isWishlist
        ? groups.filter((g) => g.variantIds.some((id) => wanted.has(id))).length + 1
        : 0,
      'collection-status':
        !isList &&
        !isWishlist &&
        (cards.some((card) =>
          card.variants.some((v) => !rows[v.id]?.quantity && hasHistory(rows[v.id])),
        ) ||
          (isGoal && goalOwned && goalOwned < goalTotal))
          ? 2
          : 0,
    };
    let anyFilter = false;
    for (const id of filterIds) {
      const shown = !isList && (Boolean($(id).value) || choices[id] > 1);
      $(id).closest('label').hidden = !shown;
      anyFilter ||= shown;
    }
    $('library-filter-panel').hidden = !anyFilter;
    $('collection-progress').hidden = !isGoal || !goalTotal;
    if (isList) $('library-summary').textContent = '';
    else if (isGoal) {
      $('library-summary').textContent = goalTotal ? `${goalOwned} / ${goalTotal} owned` : '';
      updateMarkup(
        $('collection-progress'),
        `<progress aria-label="Collection progress" value="${goalOwned}" max="${goalTotal || 1}"></progress>`,
      );
    } else if (isWishlist)
      $('library-summary').textContent = plural(wantedIds().size, 'wanted card');
    else {
      const currentCount = cards.filter((card) =>
        card.variants.some((v) => rows[v.id]?.quantity || wantedIds().has(v.id)),
      ).length;
      const past = cards.filter((card) =>
        card.variants.some((v) => !rows[v.id]?.quantity && hasHistory(rows[v.id])),
      ).length;
      $('library-summary').textContent =
        `${plural(currentCount, 'card')} you own or want.${past ? ` ${plural(past, 'card')} previously owned.` : ''}`;
    }
    $('collection-status').querySelector('option[value=""]').textContent = isPokemon
      ? 'Owned and wanted'
      : 'All cards';
    const legacy =
      route.screen === 'pokemon' &&
      (getState()
        ?.pending.filter((p) => p.pokemonId === Number(route.pokemon))
        .at(-1)?.owned ??
        getState()?.server[route.pokemon]?.legacyOwned);
    $('library-legacy').hidden = !legacy;
    if (legacy) {
      $('library-legacy').innerHTML =
        '<span>Ticked in your Pokédex, but no card is recorded. Add the card you own, or untick it.</span><button id="clear-legacy" class="secondary-button">Untick</button>';
      $('clear-legacy').disabled = locked;
      $('clear-legacy').onclick = () => void clearLegacy(Number(route.pokemon)).catch(showMessage);
    }
    const filterCount = [
      'card-language',
      'card-set',
      'card-artist',
      'wishlist-collection',
      'collection-status',
    ].filter((id) => $(id).value).length;
    $('library-filter-count').textContent = filterCount ? `${filterCount} active` : '';
    preserveFocus($('library-content'), () => {
      if (isList) {
        $('library-content').className = 'collection-list';
        updateMarkup(
          $('library-content'),
          groups
            .map((c) => {
              const have = c.variantIds.filter((id) => rows[id]?.quantity > 0).length;
              const thumbs = c.variantIds
                .slice(0, 3)
                .map((id) => byVariant.get(id) && imageUrl(byVariant.get(id)))
                .filter(Boolean)
                .map(
                  (url) =>
                    `<img src="${escape(url)}" alt="" data-plain-image loading="lazy" width="245" height="342">`,
                )
                .join('');
              return `<button class="collection-tile" id="goal-${c.id}" data-open-collection="${c.id}"><span class="goal-art${thumbs ? '' : ' is-empty'}" aria-hidden="true">${thumbs}</span><strong>${escape(c.name)}</strong><span>${c.variantIds.length ? `${have} / ${c.variantIds.length} owned` : 'No cards yet'}</span>${c.variantIds.length ? `<progress aria-label="${escape(c.name)} progress" value="${have}" max="${c.variantIds.length}"></progress>` : ''}</button>`;
            })
            .join('') ||
            '<div class="library-empty"><h3>No collections yet</h3><p>Use New collection to start one, for example for one Pokémon, artist, or set.</p></div>',
        );
        return;
      }
      $('library-content').className = 'tcg-grid';
      let allowed = isWishlist
        ? wantedIds()
        : isGoal
          ? new Set(current?.variantIds || [])
          : personalIds();
      if (isWishlist && $('wishlist-collection').value) {
        const members = new Set(group($('wishlist-collection').value)?.variantIds || []);
        allowed = new Set([...allowed].filter((id) => members.has(id)));
      }
      const visible = cards.filter(
        (c) =>
          (!$('card-language').value || c.language === $('card-language').value) &&
          (!$('card-set').value || c.setId === $('card-set').value) &&
          (!$('card-artist').value || c.artist === $('card-artist').value),
      );
      const entries = visible.flatMap((card) => {
        let variants = card.variants.filter((variant) => allowed.has(variant.id));
        if (!isWishlist)
          variants = variants.filter((variant) => {
            const row = rows[variant.id];
            const status = $('collection-status').value;
            if (status === 'past') return !row?.quantity && hasHistory(row);
            if (status === 'owned') return row?.quantity > 0;
            if (status === 'missing') return !row?.quantity && wantedIds().has(variant.id);
            return !isPokemon || row?.quantity > 0 || wantedIds().has(variant.id);
          });
        return variants.length ? [{ card, variants }] : [];
      });
      const nextGalleryKey = JSON.stringify([
        route.screen,
        route.collection,
        route.pokemon,
        filterIds.map((id) => $(id).value),
        entries.map(({ card, variants }) => [card.id, variants.map((variant) => variant.id)]),
      ]);
      if (galleryKey !== nextGalleryKey) {
        galleryKey = nextGalleryKey;
        galleryLimit = 48;
      }
      const content = entries
        .slice(0, galleryLimit)
        .map(({ card, variants }) => {
          const selected = variants[0].id;
          const memberships = groups.filter(
            (g) => g !== current && variants.some((v) => g.variantIds.includes(v.id)),
          );
          return `<article class="tcg-card" data-card-id="${card.id}"><button id="card-${card.id}" class="card-open" data-open-card="${card.language}:${card.sourceId}" data-variant="${selected}">${picture(card)}<span class="card-caption"><strong>${escape(card.name)}</strong><span>${escape(card.setName)}</span><span data-card-number>${escape(card.number)}${card.officialCount ? `/${escape(card.officialCount)}` : ''} · <span class="tcg-language">${languageName(card.language)}</span></span>${badges(variants, true)}</span></button>${memberships.length ? `<p class="tcg-members">${memberships.map((c) => escape(c.name)).join(' · ')}</p>` : ''}${isWishlist ? `<button id="acquire-${selected}" data-acquire="${selected}" class="secondary-button" ${locked || (rows[selected]?.quantity || 0) >= 999 ? 'disabled' : ''}>${rows[selected]?.quantity ? 'Add one copy' : 'Mark as owned'}</button>` : ''}</article>`;
        })
        .join('');
      updateMarkup(
        $('library-content'),
        content +
          (entries.length > galleryLimit
            ? `<button class="secondary-button library-more" data-more-cards>Show more cards · ${galleryLimit} of ${entries.length} shown</button>`
            : '') ||
          `<div class="library-empty"><h3>${filterCount ? 'No cards match these filters' : isWishlist ? 'Your wishlist is empty' : isGoal ? (current ? 'No cards in this collection yet' : 'This collection is unavailable') : 'No cards recorded yet'}</h3><p>${filterCount ? 'Your saved cards are still here. Clear the filters to see them.' : isGoal && !current ? 'It may have been deleted on another device.' : isWishlist ? 'Use Add cards, then choose Add to wishlist on a card.' : isGoal ? 'Use Add cards to choose cards for this collection.' : 'Use Add cards to find a card you own or want.'}</p>${filterCount ? '<button id="empty-clear-filters" class="secondary-button">Clear filters</button>' : ''}</div>`,
      );
    });
    bindImages(screen);
  }
  function addCards() {
    navigation.go('search', {
      pokemon: route.screen === 'pokemon' ? route.pokemon : undefined,
      collection: route.screen === 'collection' ? route.collection : undefined,
    });
  }
  $('library-add').onclick = addCards;
  $('new-collection').onclick = () => {
    $('collection-form').hidden = false;
    $('collection-name').value = '';
    $('collection-name').focus();
  };
  $('collection-cancel').onclick = () => {
    $('collection-form').hidden = true;
    $('new-collection').focus();
  };
  $('collection-rename').onclick = () => {
    $('collection-menu').open = false;
    $('collection-form').hidden = false;
    $('collection-name').value = group(route.collection)?.name || '';
    $('collection-name').focus();
  };
  $('collection-delete').onclick = async () => {
    const current = group(route.collection);
    if (
      !current ||
      locked ||
      !confirm(`Delete “${current.name}”? Your owned cards will stay in your inventory.`)
    )
      return;
    try {
      await save('collection', current.id, {
        name: current.name,
        deleted: true,
        variantIds: current.variantIds,
      });
      navigation.go('collections', {}, { replace: true });
    } catch (error) {
      showMessage(error);
    }
  };
  $('collection-form').onsubmit = async (event) => {
    event.preventDefault();
    if (locked) return;
    const current = route.screen === 'collection' && group(route.collection),
      id = current?.id || crypto.randomUUID();
    const name = $('collection-name').value.trim();
    if (!name) {
      $('collection-name').setCustomValidity('Enter a collection name.');
      $('collection-name').reportValidity();
      return;
    }
    try {
      await save('collection', id, { name, deleted: false, variantIds: current?.variantIds || [] });
      $('collection-form').hidden = true;
      if (!current) navigation.go('collection', { collection: id });
      else render();
    } catch (error) {
      showMessage(error);
    }
  };
  $('collection-name').oninput = () => $('collection-name').setCustomValidity('');
  $('library-clear-filters').onclick = clearFilters;
  for (const id of [
    'card-language',
    'card-set',
    'card-artist',
    'wishlist-collection',
    'collection-status',
  ])
    $(id).onchange = render;
  $('library-content').onclick = async (event) => {
    if (event.target.closest('[data-more-cards]')) {
      galleryLimit += 48;
      render();
      return;
    }
    const tile = event.target.closest('[data-open-collection]');
    if (tile) {
      navigation.go('collection', { collection: tile.dataset.openCollection });
      return;
    }
    const cardButton = event.target.closest('[data-open-card]');
    if (cardButton) {
      const card = cards.find((c) => `${c.language}:${c.sourceId}` === cardButton.dataset.openCard);
      openCard(card, {
        pokemon: route.pokemon,
        collection: route.collection,
        variant: cardButton.dataset.variant,
        from: route.screen,
      });
      return;
    }
    const acquire = event.target.closest('[data-acquire]');
    if (acquire && canEdit()) {
      const id = acquire.dataset.acquire,
        own = inventory()[id] || { quantity: 0, wanted: false };
      try {
        await save('inventory', id, {
          quantity: Math.min(999, own.quantity + 1),
          wanted: own.wanted,
        });
        app.notify('Owned copy added.');
      } catch (error) {
        showMessage(error);
      }
    }
    if (event.target.closest('#empty-clear-filters')) clearFilters();
  };
  async function show(next) {
    sharing.close();
    if (route && !screen.hidden && filtersKey)
      filterSnapshots.set(filtersKey, {
        values: Object.fromEntries(filterIds.map((id) => [id, $(id).value])),
        open: $('library-filter-panel').open,
      });
    route = next;
    generation++;
    screen.hidden = !['pokemon', 'collections', 'collection', 'wishlist'].includes(next.screen);
    search.screen.hidden = next.screen !== 'search';
    detail.screen.hidden = next.screen !== 'card';
    if (next.screen !== 'card') detail.leave();
    if (next.screen !== 'search') search.leave();
    if (!getState()) {
      if (!screen.hidden)
        $('library-content').innerHTML = '<p class="library-empty">Connecting your account…</p>';
      return;
    }
    if (next.screen === 'search') {
      search.show(next);
      return;
    }
    if (next.screen === 'card') {
      await detail.show(next);
      return;
    }
    if (next.screen === 'pokedex') {
      shell.title('Pokédex');
      app.showPokedex();
      return;
    }
    if (screen.hidden) return;
    const key = `${next.screen}:${next.pokemon || next.collection || ''}`;
    if (filtersKey !== key) {
      filtersKey = key;
      restoreFilters = filterSnapshots.get(key);
      for (const id of [
        'card-language',
        'card-set',
        'card-artist',
        'wishlist-collection',
        'collection-status',
      ])
        $(id).value = '';
      $('library-filter-panel').open = false;
      $('collection-form').hidden = true;
      $('library-message').textContent = '';
    }
    if (next.screen === 'collections') render();
    else await loadView();
  }
  navigation.subscribe(show);
  document.querySelector('#collection').addEventListener('click', (event) => {
    const button = event.target.closest('[data-open-pokemon]');
    if (button && canEdit()) navigation.go('pokemon', { pokemon: button.dataset.openPokemon });
  });
  let ready = false;
  return {
    sourceReferences() {
      return [...metadata.values()].flatMap(({ card }) =>
        card.variants.map((v) => ({
          variantId: v.id,
          language: card.language,
          sourceId: card.sourceId,
        })),
      );
    },
    pokemonIds(id) {
      return byVariant.get(id)?.pokemonIds || [];
    },
    update() {
      document.getElementById('wishlist-count').textContent = wantedIds().size;
      document.getElementById('collections-count').textContent = collections().length;
      document.getElementById('wishlist-count').hidden = !wantedIds().size;
      document.getElementById('collections-count').hidden = !collections().length;
      if (!ready && getState()) {
        ready = true;
        void show(navigation.route);
        return;
      }
      detail.update();
      if (!screen.hidden) {
        if (route.screen !== 'collections' && loadedKey !== recordKey()) void loadView();
        else render();
      }
    },
    setLocked(value) {
      locked = value;
      shell.lock(value);
      search.setLocked(value);
      detail.update();
      render();
    },
  };
}
