import { escape, picture, bindImages, languageName, credits, plural } from './ui.js';
import { createSetPicker } from './set-picker.js';

export function createCardSearch({
  app,
  api,
  navigation,
  shell,
  openCard,
  collectionName,
  ownership,
}) {
  const screen = document.createElement('main');
  screen.id = 'card-search';
  screen.className = 'app-screen';
  screen.dataset.cloudUi = '';
  screen.hidden = true;
  screen.innerHTML = `<div class="screen-intro"><h2 id="card-search-title">Find a card</h2><p id="search-context">Start with a Pokémon name, or use a set and card number.</p></div>
    <form id="card-search-form"><div class="search-main-fields"><label>Pokémon or card name<input id="card-search-name" type="search" maxlength="100" placeholder="For example: Arcanine" autocomplete="off"></label><label>Language<select id="card-search-language"><option value="en">English</option><option value="ja">Japanese</option></select></label></div>
    <details id="search-by-number" class="filter-panel"><summary>Set and card number <span id="search-set-chip"></span></summary><div class="search-number-fields"><div class="search-set-field"><span>Set</span><div class="selected-set"><button class="secondary-button" id="choose-search-set" type="button">Choose a set</button><button class="icon-button" id="clear-search-set" type="button" aria-label="Clear selected set" hidden>×</button></div><input id="card-search-set" type="hidden"><small id="selected-set-detail"></small></div><label>Card number<input id="card-search-number" maxlength="20" placeholder="For example: 001/165"></label></div></details>
    <button class="primary-button search-submit" type="submit">Search cards</button></form>
    <div class="search-results-heading"><h2 id="search-scope">In Carddex</h2></div><p id="card-search-status" role="status">Search for a card you own or want.</p><button class="secondary-button" id="search-retry" hidden>Try again</button><div id="card-search-results" class="search-results"></div><div class="search-pages"><button class="secondary-button" id="search-previous" hidden>Previous</button><span id="search-page"></span><button class="secondary-button" id="search-next" hidden>Next</button></div><p class="search-more"><span id="search-more-text">Not listed? TCGdex has every printing.</span><button class="secondary-button" id="search-external">Search TCGdex</button></p>${credits}`;
  document.body.append(screen);
  const $ = (id) => screen.querySelector(`#${id}`);
  let context = {},
    contextKey,
    generation = 0,
    page = 1,
    external = false,
    lastRequest,
    busy = false,
    controller;
  const cardsByKey = new Map();
  const picker = createSetPicker(api, navigation, shell);
  const searchKey = (route) =>
    JSON.stringify([
      route.pokemon || '',
      route.collection || '',
      route.term || '',
      route.language || '',
      route.set || '',
      route.number || '',
      route.mode || '',
      String(route.page || 1),
    ]);
  function rememberSearch(mode, requestedPage = 1) {
    if (navigation.route.screen !== 'search') return;
    const params = {
      pokemon: context.pokemon,
      collection: context.collection,
      term: $('card-search-name').value,
      language: $('card-search-language').value,
      set: $('card-search-set').value,
      setName: $('card-search-set').value ? $('choose-search-set').textContent : undefined,
      number: $('card-search-number').value,
      mode,
      page: mode ? requestedPage : undefined,
    };
    navigation.update(params);
    contextKey = searchKey(params);
  }
  function setDetails(card, reference) {
    const set =
      reference?.sets.find((s) => card.sourceId === `${s.sourceId}-${card.number}`) ||
      reference?.sets.find((s) => card.sourceId.startsWith(`${s.sourceId}-`));
    return {
      ...card,
      setName: card.setName || set?.name,
      officialCount: card.officialCount || set?.officialCount,
    };
  }
  try {
    $('card-search-language').value =
      localStorage.getItem('carddex.card-language') === 'ja' ? 'ja' : 'en';
  } catch {
    /* Use English. */
  }
  function clearResults() {
    cardsByKey.clear();
    $('card-search-results').replaceChildren();
    $('card-search-results').classList.remove('is-stale');
  }
  function resetResults(message, keep = false) {
    generation++;
    controller?.abort();
    controller = null;
    busy = false;
    screen.removeAttribute('aria-busy');
    if (!keep) clearResults();
    else if (cardsByKey.size) $('card-search-results').classList.add('is-stale');
    message ??= cardsByKey.size
      ? 'These results are from your last search. Search again to update them.'
      : 'Search again to use these details.';
    $('search-page').textContent = '';
    $('search-previous').hidden = $('search-next').hidden = $('search-retry').hidden = true;
    $('search-external').disabled = false;
    screen.querySelector('[type="submit"]').disabled = false;
    $('card-search-status').textContent = message;
  }
  function selectSet(set, remember = true) {
    $('card-search-set').value = set?.sourceId || '';
    $('choose-search-set').textContent = set?.name || 'Choose a set';
    $('clear-search-set').hidden = !set?.sourceId;
    $('selected-set-detail').textContent = set?.sourceId
      ? `${set.sourceId}${set.officialCount ? ` · Printed total: ${set.officialCount}` : ''}${set.referenceNote ? ` · ${set.referenceNote}` : ''}`
      : '';
    $('search-set-chip').textContent = set?.name || '';
    resetResults(undefined, true);
    if (remember) rememberSearch();
  }
  $('choose-search-set').onclick = async () => {
    const set = await picker.open($('card-search-language').value, $('card-search-set').value);
    if (set) selectSet(set);
  };
  $('clear-search-set').onclick = () => selectSet(null);
  async function runSearch(all, requestedPage = 1) {
    external = all;
    page = requestedPage;
    lastRequest = { all, page };
    resetResults(all ? 'Finding more cards…' : 'Searching saved cards…', true);
    const current = generation;
    controller = new AbortController();
    const signal = controller.signal;
    rememberSearch(all ? 'external' : 'saved', page);
    busy = true;
    $('search-external').disabled = true;
    screen.querySelector('[type="submit"]').disabled = true;
    $('search-scope').textContent = all ? 'From TCGdex' : 'In Carddex';
    $('search-more-text').textContent = all
      ? 'Change the search, then search TCGdex again.'
      : 'Not listed? TCGdex has every printing.';
    screen.setAttribute('aria-busy', 'true');
    const language = $('card-search-language').value,
      name = $('card-search-name').value.trim();
    const query = new URLSearchParams({
      language,
      page: String(page),
      set: $('card-search-set').value,
      number: $('card-search-number').value.trim(),
    });
    const pokemon = context.pokemon || app.findPokemon?.(name);
    if (pokemon) query.set('pokemon', pokemon);
    query.set(all ? 'q' : 'search', pokemon && !context.pokemon ? '' : name);
    try {
      const referenceRequest = picker.getSets(language).catch(() => null);
      const result = await api(`${all ? '/api/cards/search' : '/api/catalogue'}?${query}`, {
        signal,
      });
      const reference = picker.peekSets(language);
      if (current !== generation || navigation.route.screen !== 'search') return;
      clearResults();
      $('card-search-results').innerHTML = result.cards
        .map((brief, index) => {
          const card = setDetails(brief, reference);
          const key = String(index);
          cardsByKey.set(key, card);
          return `<article class="search-card" data-source-id="${escape(card.sourceId)}"><button class="card-open" id="search-card-${index}" data-preview="${key}">${picture(card)}<span class="card-caption"><strong>${escape(card.name)}</strong><span data-set-name>${escape(card.setName || 'Set not recorded')}</span><span data-card-number>${escape(card.number)}${card.officialCount ? `/${card.officialCount}` : ''} · ${languageName(card.language)}</span>${ownership(card)}</span></button></article>`;
        })
        .join('');
      bindImages(screen);
      void referenceRequest.then((reference) => {
        if (!reference || current !== generation || navigation.route.screen !== 'search') return;
        for (const [key, brief] of cardsByKey) {
          const card = setDetails(brief, reference);
          cardsByKey.set(key, card);
          const button = screen.querySelector(`[data-preview="${key}"]`);
          if (button) {
            button.querySelector('[data-set-name]').textContent =
              card.setName || 'Set not recorded';
            button.querySelector('[data-card-number]').textContent =
              `${card.number}${card.officialCount ? `/${card.officialCount}` : ''} · ${languageName(card.language)}`;
          }
        }
      });
      $('card-search-status').textContent = all
        ? result.cards.length
          ? `${plural(result.cards.length, 'result')}. Open a card to choose its finish.`
          : 'No cards found. Try another name, set, or number.'
        : result.cards.length
          ? `${plural(result.cards.length, 'saved match', 'saved matches')} in Carddex.`
          : 'No saved matches in Carddex yet. Search TCGdex below.';
      $('search-page').textContent = result.cards.length ? `Page ${page}` : '';
      $('search-previous').hidden = page === 1;
      $('search-next').hidden = !result.hasMore;
    } catch (error) {
      if (current === generation && !signal.aborted) {
        clearResults();
        $('card-search-status').textContent = error.message;
        $('search-retry').hidden = false;
      }
    } finally {
      if (current === generation) {
        busy = false;
        screen.removeAttribute('aria-busy');
        $('search-external').disabled = false;
        screen.querySelector('[type="submit"]').disabled = false;
      }
    }
  }
  $('card-search-form').onsubmit = (event) => {
    event.preventDefault();
    if (!busy) void runSearch(false);
  };
  $('search-external').onclick = () => void runSearch(true);
  $('search-retry').onclick = () => void runSearch(lastRequest.all, lastRequest.page);
  $('search-previous').onclick = () => void runSearch(external, page - 1);
  $('search-next').onclick = () => void runSearch(external, page + 1);
  for (const id of ['card-search-name', 'card-search-number'])
    $(id).oninput = () => {
      resetResults(undefined, true);
      rememberSearch();
    };
  $('card-search-language').onchange = () => {
    selectSet(null);
    try {
      localStorage.setItem('carddex.card-language', $('card-search-language').value);
    } catch {
      /* The current choice still works. */
    }
  };
  $('card-search-results').onclick = (event) => {
    const button = event.target.closest('[data-preview]');
    if (button) openCard(cardsByKey.get(button.dataset.preview), context);
  };
  return {
    screen,
    show(route) {
      shell.title('Add a card');
      const nextKey = searchKey(route);
      if (nextKey === contextKey) return;
      contextKey = nextKey;
      context = { pokemon: route.pokemon, collection: route.collection, from: 'search' };
      $('card-search-name').value = route.term || '';
      $('card-search-number').value = route.number || '';
      if (['en', 'ja'].includes(route.language)) $('card-search-language').value = route.language;
      selectSet(
        route.set ? { sourceId: route.set, name: route.setName || route.set } : null,
        false,
      );
      const goal = route.collection && collectionName(route.collection);
      $('card-search-title').textContent = route.pokemon
        ? `Cards for ${app.pokemonName(Number(route.pokemon))}`
        : goal
          ? `Add to ${goal}`
          : 'Find a card';
      $('search-context').textContent = goal
        ? 'Open a card, choose its finish, then add it to this collection.'
        : 'Search by Pokémon name, or choose a set and card number.';
      resetResults('Search for a card you own or want.');
      if (['saved', 'external'].includes(route.mode))
        void runSearch(
          route.mode === 'external',
          Math.max(1, Math.min(1000, Number(route.page) || 1)),
        );
      else if (route.pokemon || route.collection) void runSearch(false);
    },
    leave() {
      if (busy) resetResults('Search again to continue.', true);
    },
    setLocked(value) {
      screen.querySelector('form').inert = value;
      $('search-external').disabled = value;
    },
  };
}
