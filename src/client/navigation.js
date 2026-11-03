const screens = new Set([
  'pokedex',
  'pokemon',
  'collections',
  'collection',
  'wishlist',
  'search',
  'card',
  'sets',
]);

export function createNavigation() {
  const listeners = new Set();
  let active,
    renderedKey,
    generation = 0,
    interactions = 0;
  for (const event of ['pointerdown', 'keydown'])
    addEventListener(event, () => interactions++, { capture: true });
  const read = () => {
    const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
    const params = Object.fromEntries(new URLSearchParams(query));
    delete params.screen;
    return { screen: screens.has(path) ? path : 'pokedex', ...params };
  };
  const hash = (screen, params = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(
        ([, value]) => value !== undefined && value !== null && value !== '',
      ),
    );
    return `#/${screen}${query.size ? `?${query}` : ''}`;
  };
  const remember = () => {
    const focused = document.activeElement;
    history.replaceState({ ...history.state, scroll: scrollY, focus: focused?.id || null }, '');
  };
  async function render() {
    const key = `${history.state?.key}:${location.hash}`;
    if (renderedKey === key) return;
    renderedKey = key;
    active = read();
    const current = ++generation;
    const initialInteractions = interactions,
      initialFocus = document.activeElement;
    document.body.dataset.cloudView = active.screen;
    await Promise.all([...listeners].map((listener) => listener(active)));
    if (current !== generation) return;
    requestAnimationFrame(() => {
      if (
        current !== generation ||
        initialInteractions !== interactions ||
        (document.activeElement !== initialFocus && document.activeElement !== document.body)
      )
        return;
      scrollTo(0, history.state?.scroll || 0);
      const focus = history.state?.focus && document.getElementById(history.state.focus);
      (focus && focus.getClientRects().length
        ? focus
        : document.getElementById('app-title')
      )?.focus({ preventScroll: history.state?.focus !== 'collection' });
    });
  }
  return {
    get route() {
      return active || read();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(params) {
      active = { screen: this.route.screen, ...params };
      history.replaceState(
        { ...history.state, scroll: scrollY, focus: document.activeElement?.id || null },
        '',
        hash(active.screen, params),
      );
      renderedKey = `${history.state?.key}:${location.hash}`;
    },
    go(screen, params = {}, { replace = false, focus } = {}) {
      const next = hash(screen, params);
      if (location.hash === next) {
        if (focus) document.getElementById(focus)?.focus();
        return;
      }
      remember();
      const depth = replace ? history.state?.depth || 0 : (history.state?.depth || 0) + 1;
      history[replace ? 'replaceState' : 'pushState'](
        {
          carddex: true,
          depth,
          key: crypto.randomUUID(),
          scroll: replace && screen === active?.screen ? scrollY : 0,
          focus: focus || (replace ? document.activeElement?.id : null),
        },
        '',
        next,
      );
      void render();
    },
    back(screen = 'pokedex', params = {}) {
      if (history.state?.carddex && history.state.depth > 0) history.back();
      else this.go(screen, params, { replace: true });
    },
    start() {
      history.replaceState(
        history.state?.carddex
          ? history.state
          : { carddex: true, depth: 0, key: crypto.randomUUID(), scroll: 0 },
        '',
        hash(
          read().screen,
          Object.fromEntries(Object.entries(read()).filter(([key]) => key !== 'screen')),
        ),
      );
      addEventListener('popstate', () => void render());
      addEventListener('hashchange', () => void render());
      void render();
    },
  };
}
