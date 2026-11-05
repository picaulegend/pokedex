export function createShell(app, navigation) {
  const shell = document.createElement('div');
  shell.dataset.cloudUi = '';
  shell.innerHTML = `<header class="app-header"><button id="app-back" class="icon-button" aria-label="Back" hidden>←</button><h1 id="app-title" tabindex="-1">Pokédex</h1><button id="app-save-state" class="save-chip" aria-label="Account and save status">Connecting…</button><button id="app-account" class="icon-button" aria-label="Account and backups">•••</button></header>
    <nav class="app-nav" aria-label="Main navigation"><a class="app-brand" href="#/pokedex"><span class="brand-ball" aria-hidden="true"></span>Carddex</a><button id="open-pokedex" data-destination="pokedex"><span aria-hidden="true">▦</span>Pokédex</button><button id="open-collections" data-destination="collections"><span aria-hidden="true">▤</span>Collections <small id="collections-count">0</small></button><button id="open-wishlist" data-destination="wishlist"><span aria-hidden="true">♡</span>Wishlist <small id="wishlist-count">0</small></button><button id="open-card-search" class="nav-add" data-destination="search"><span aria-hidden="true">＋</span>Add card</button></nav>`;
  document.body.prepend(shell);
  const mark = document.createElement('span');
  mark.className = 'app-mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.innerHTML =
    '<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="12" fill="#e6ed8c" stroke="currentColor" stroke-width="2"/><path d="M2 14h24a12 12 0 0 1-24 0" fill="#f7f8f3" stroke="currentColor" stroke-width="2"/><circle cx="14" cy="14" r="4" fill="#f7f8f3" stroke="currentColor" stroke-width="2"/></svg>';
  shell.querySelector('#app-title').before(mark);
  document.querySelector('.skip').addEventListener('click', (event) => {
    event.preventDefault();
    navigation.go('pokedex', {}, { focus: 'collection' });
  });
  const paths = {
    pokedex:
      '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    collections: '<path d="M4 6h6l2 2h8v12H4zM7 3h13v3"/>',
    wishlist:
      '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
    search: '<path d="M12 4v16M4 12h16"/>',
  };
  for (const button of shell.querySelectorAll('[data-destination]'))
    button.querySelector('span').innerHTML =
      `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[button.dataset.destination]}</svg>`;
  const panel = document.createElement('dialog');
  panel.id = 'account-panel';
  panel.dataset.cloudUi = '';
  panel.className = 'utility-dialog';
  panel.setAttribute('aria-labelledby', 'account-title');
  panel.innerHTML = `<div class="dialog-head"><h2 id="account-title">Account</h2><button id="account-close" class="icon-button" aria-label="Close account menu">×</button></div><p id="cloud-account">Connecting your account…</p><p id="cloud-status" role="status" aria-live="polite"></p><div class="account-actions"><button class="secondary-button" id="cloud-import" hidden>Import old checkmarks</button><button class="primary-button" id="cloud-conflicts" hidden>Review changes</button><button class="secondary-button" id="cloud-retry">Sync now</button><button class="secondary-button" id="cloud-signin" hidden>Sign in again</button></div><h3>Files</h3><div class="account-tools"><button id="app-backup">Download backup <small>All cards, quantities, and collections</small></button><button id="app-restore">Restore from backup</button><button id="app-checklist">Download offline checklist <small>Pokédex ticks only</small></button><button id="app-share">List missing Pokémon</button><button id="app-print">Print Pokédex</button></div>`;
  document.body.append(panel);
  const signout = document.createElement('a');
  signout.id = 'app-signout';
  signout.className = 'secondary-button signout-link';
  signout.href = '/cdn-cgi/access/logout';
  signout.textContent = 'Sign out';
  signout.hidden = true;
  panel.append(signout);
  const about = document.createElement('div');
  about.className = 'account-about';
  about.innerHTML =
    '<h3>About Carddex</h3><p>Your Pokémon card collection.</p><p>Card data: <a href="https://tcgdex.dev/" target="_blank" rel="noopener noreferrer">TCGdex</a> · <a href="/TCGdex-LICENSE.txt" target="_blank" rel="noopener noreferrer">MIT licence</a>.<br>Pokémon sprites: <a href="https://pokeapi.co/" target="_blank" rel="noopener noreferrer">PokéAPI</a>.</p><p>Unofficial fan app. Pokémon © Nintendo / Creatures / GAME FREAK.</p>';
  panel.append(about);
  const restore = document.createElement('dialog');
  restore.id = 'restore-review';
  restore.className = 'utility-dialog';
  restore.dataset.cloudUi = '';
  restore.setAttribute('aria-labelledby', 'restore-review-title');
  restore.innerHTML =
    '<h2 id="restore-review-title">Restore your collection</h2><p id="restore-account"></p><dl id="restore-counts" class="restore-counts"></dl><p>Merge this backup with your saved collection. Existing quantities keep the higher value. Collection members are combined.</p><div class="form-actions"><button id="restore-review-cancel" class="secondary-button">Cancel</button><button id="restore-review-confirm" class="primary-button">Merge backup</button></div>';
  document.body.append(restore);
  let resolveRestore;
  function finishRestore(value) {
    const resolve = resolveRestore;
    resolveRestore = null;
    restore.close();
    resolve?.(value);
  }
  restore.querySelector('#restore-review-confirm').onclick = () => finishRestore(true);
  restore.querySelector('#restore-review-cancel').onclick = () => finishRestore(false);
  restore.addEventListener('close', () => {
    const resolve = resolveRestore;
    resolveRestore = null;
    resolve?.(false);
  });
  const $ = (id) => document.getElementById(id);
  const progress = document.createElement('p');
  progress.className = 'dex-progress-text';
  progress.append(
    $('owned-total'),
    ` of ${Number($('progress-track').getAttribute('aria-valuemax')).toLocaleString('en-US')} species owned · `,
    $('percent-total'),
  );
  $('progress-track').before(progress);
  const openAccount = () => {
    if (!panel.open) panel.showModal();
  };
  $('app-account').onclick = openAccount;
  $('app-save-state').onclick = openAccount;
  $('account-close').onclick = () => panel.close();
  for (const [from, to] of [
    ['app-backup', 'export-button'],
    ['app-restore', 'import-button'],
    ['app-checklist', 'save-html'],
    ['app-share', 'share-button'],
    ['app-print', 'print-button'],
  ])
    $(from).onclick = () => {
      panel.close();
      $(to).click();
    };
  $('app-back').onclick = () => navigation.back();
  shell.querySelector('nav').onclick = (event) => {
    const button = event.target.closest('[data-destination]');
    if (button) navigation.go(button.dataset.destination);
  };
  let screen;
  navigation.subscribe((route) => {
    if (screen && screen !== route.screen) $('toast').hidden = true;
    screen = route.screen;
    const active = route.collection
      ? 'collections'
      : route.from === 'wishlist'
        ? 'wishlist'
        : ['collection', 'collections'].includes(route.screen)
          ? 'collections'
          : route.screen === 'wishlist'
            ? 'wishlist'
            : ['search', 'sets', 'card'].includes(route.screen) && !route.pokemon
              ? 'search'
              : 'pokedex';
    for (const button of shell.querySelectorAll('[data-destination]')) {
      if (button.dataset.destination === active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    $('app-back').hidden = ['pokedex', 'collections', 'wishlist'].includes(route.screen);
    if (panel.open) panel.close();
  });
  return {
    panel,
    account(user) {
      signout.hidden = user.development;
    },
    confirmRestore(data, email) {
      restore.querySelector('#restore-account').textContent = `Account: ${email}`;
      restore.querySelector('#restore-counts').innerHTML =
        `<div><dt>Card records</dt><dd>${data.inventory.length}</dd></div><div><dt>Collections</dt><dd>${data.collections.length}</dd></div><div><dt>Simple checkmarks</dt><dd>${data.legacyOwned.length}</dd></div>`;
      return new Promise((resolve) => {
        resolveRestore = resolve;
        restore.showModal();
      });
    },
    title(text, heading = text) {
      $('app-title').textContent = heading;
      document.title = `${text} · Carddex`;
    },
    status(text, kind) {
      if ($('app-save-state').textContent !== text) $('app-save-state').textContent = text;
      if ($('app-save-state').dataset.state !== kind) $('app-save-state').dataset.state = kind;
    },
    lock(value) {
      $('open-card-search').disabled = value;
      for (const id of ['app-backup', 'app-restore', 'app-checklist']) $(id).disabled = value;
    },
  };
}
