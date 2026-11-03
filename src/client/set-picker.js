const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const normalize = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '');
function asset(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'assets.tcgdex.net'
      ? /\.(webp|png|jpg)$/.test(url.pathname)
        ? url.href
        : `${url.href}.webp`
      : null;
  } catch {
    return null;
  }
}

export function createSetPicker(api, navigation, shell) {
  const dialog = document.createElement('main');
  dialog.id = 'set-picker';
  dialog.className = 'app-screen';
  dialog.hidden = true;
  dialog.dataset.cloudUi = '';
  dialog.setAttribute('aria-labelledby', 'set-picker-title');
  dialog.innerHTML = `<label class="set-picker-search"><span id="set-picker-title"></span><input id="set-picker-query" type="search" maxlength="100" placeholder="Set name, code, or printed total (165)" autocomplete="off"></label>
    <div class="set-picker-list"><button class="set-any" id="set-picker-any"><span class="set-art" aria-hidden="true">✱</span><span class="set-choice-text"><strong>Any set</strong><span>Search all sets</span></span></button><div id="set-picker-results" class="set-picker-results"></div></div><p id="set-picker-status" role="status"></p><button class="secondary-button" id="set-picker-more" hidden>Show more sets</button>`;
  document.body.append(dialog);
  const $ = (id) => dialog.querySelector(`#${id}`),
    cache = new Map(),
    pending = new Map();
  let sets = [],
    language = 'en',
    selected = '',
    limit = 30,
    resolveSelection,
    generation = 0;
  function peek(lang) {
    if (cache.has(lang)) return cache.get(lang);
    try {
      const value = JSON.parse(sessionStorage.getItem(`carddex.set-reference.v1.${lang}`));
      if (Array.isArray(value?.sets) && value.sets.every((set) => set.language === lang))
        return value;
    } catch {
      /* Read from the server when no stored reference is available. */
    }
    return null;
  }
  function load(lang) {
    if (cache.has(lang)) return Promise.resolve(cache.get(lang));
    const stored = peek(lang);
    if (stored?.cachedAt > Date.now() - 6 * 60 * 60 * 1000) {
      cache.set(lang, stored);
      return Promise.resolve(stored);
    }
    if (pending.has(lang)) return pending.get(lang);
    const task = fetchSets(lang, stored).finally(() => pending.delete(lang));
    pending.set(lang, task);
    return task;
  }
  async function fetchSets(lang, stored) {
    const key = `carddex.set-reference.v1.${lang}`;
    try {
      const body = await api(`/api/catalogue/sets?language=${lang}`);
      body.cachedAt = Date.now();
      cache.set(lang, body);
      try {
        sessionStorage.setItem(key, JSON.stringify(body));
      } catch {
        /* The memory copy remains available. */
      }
      return body;
    } catch (error) {
      try {
        const value = stored;
        if (Array.isArray(value?.sets) && value.sets.every((s) => s.language === lang)) {
          cache.set(lang, value);
          return value;
        }
      } catch {
        /* Show the connection error. */
      }
      throw error;
    }
  }
  function render() {
    const terms = normalize($('set-picker-query').value.trim()).split(/\s+/).filter(Boolean);
    let recent = [];
    try {
      recent = JSON.parse(localStorage.getItem(`carddex.recent-sets.${language}`) || '[]');
      if (!Array.isArray(recent)) recent = [];
    } catch {
      /* Use names. */
    }
    const matches = sets
      .filter((set) => {
        const text = normalize(
          [set.name, set.sourceId, set.officialCount, set.totalCount].join(' '),
        );
        return terms.every((term) => text.includes(term));
      })
      .sort((a, b) => {
        const rank = (set) => {
          const i = recent.indexOf(set.sourceId);
          return !terms.length && i >= 0 ? i : 100;
        };
        return rank(a) - rank(b) || a.name.localeCompare(b.name, language);
      });
    const visible = matches.slice(0, limit);
    $('set-picker-any').hidden = terms.length > 0;
    $('set-picker-any').setAttribute('aria-pressed', String(!selected));
    $('set-picker-status').textContent = !matches.length
      ? 'No sets match. Try a set name or the printed total.'
      : visible.length < matches.length
        ? `${visible.length} of ${matches.length} sets shown`
        : '';
    $('set-picker-results').innerHTML = visible
      .map((set) => {
        const logo = asset(set.logo),
          symbol = asset(set.symbol);
        return `<button class="set-choice" data-set="${escape(set.sourceId)}" aria-pressed="${selected === set.sourceId}"><span class="set-art">${logo ? `<img class="set-logo" src="${escape(logo)}" alt="" loading="lazy" width="76" height="38">` : symbol ? `<img class="set-symbol" src="${escape(symbol)}" alt="" loading="lazy" width="30" height="30">` : `<span>${escape(set.sourceId.slice(0, 4))}</span>`}</span><span class="set-choice-text"><strong>${escape(set.name)}</strong><span>${escape(set.sourceId)}${set.officialCount ? ` · ${set.officialCount} cards` : set.totalCount ? ` · ${set.totalCount} cards` : ''}</span>${set.referenceNote ? `<span class="set-reference-note">${escape(set.referenceNote)}</span>` : ''}</span>${logo && symbol ? `<img class="set-symbol" src="${escape(symbol)}" alt="" loading="lazy" width="24" height="24">` : ''}</button>`;
      })
      .join('');
    for (const img of $('set-picker-results').querySelectorAll('img'))
      img.onerror = () => {
        const area = img.closest('.set-art');
        img.remove();
        if (area && !area.children.length) {
          const text = document.createElement('span');
          text.textContent = area.closest('[data-set]').dataset.set.slice(0, 4);
          area.append(text);
        }
      };
    $('set-picker-more').hidden = visible.length >= matches.length;
  }
  function finish(value) {
    const resolve = resolveSelection;
    resolveSelection = null;
    resolve?.(value);
    if (value?.sourceId)
      try {
        const key = `carddex.recent-sets.${language}`;
        const recent = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(
          key,
          JSON.stringify(
            [
              value.sourceId,
              ...(Array.isArray(recent) ? recent : []).filter((id) => id !== value.sourceId),
            ].slice(0, 5),
          ),
        );
      } catch {
        /* Selection still works. */
      }
    navigation.back('search');
  }
  navigation.subscribe((route) => {
    dialog.hidden = route.screen !== 'sets';
    if (route.screen === 'sets') {
      if (!resolveSelection) {
        navigation.go('search', {}, { replace: true });
        return;
      }
      shell.title('Choose a set');
    } else if (resolveSelection) {
      generation++;
      const resolve = resolveSelection;
      resolveSelection = null;
      resolve(undefined);
    }
  });
  $('set-picker-any').onclick = () => finish({ sourceId: '', name: '' });
  $('set-picker-query').oninput = () => {
    limit = 30;
    render();
  };
  $('set-picker-more').onclick = () => {
    limit += 30;
    render();
  };
  $('set-picker-results').onclick = (event) => {
    const button = event.target.closest('[data-set]');
    if (button) finish(sets.find((set) => set.sourceId === button.dataset.set));
  };
  return {
    getSets: load,
    peekSets: peek,
    open(lang, current = '') {
      resolveSelection?.(undefined);
      const promise = new Promise((resolve) => {
        resolveSelection = resolve;
      });
      language = lang;
      selected = current;
      sets = [];
      limit = 30;
      const request = ++generation;
      $('set-picker-title').textContent =
        language === 'ja' ? 'Find a Japanese set' : 'Find an English set';
      $('set-picker-query').value = '';
      $('set-picker-results').replaceChildren();
      $('set-picker-more').hidden = true;
      $('set-picker-status').textContent = 'Loading sets…';
      navigation.go('sets', {
        language,
        pokemon: navigation.route.pokemon,
        collection: navigation.route.collection,
      });
      void load(language)
        .then((body) => {
          if (request === generation) {
            sets = body.sets;
            render();
          }
        })
        .catch((error) => {
          if (request === generation) $('set-picker-status').textContent = error.message;
        });
      return promise;
    },
  };
}
