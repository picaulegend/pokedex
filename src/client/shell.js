export function createShell(app, navigation) {
  const shell = document.createElement('div');
  shell.dataset.cloudUi = '';
  const icon = (path) =>
    `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
  shell.innerHTML = `<header class="app-header"><a class="app-brand" href="#/pokedex">CARDDEX</a><button id="app-back" class="icon-button" aria-label="Back" hidden>${icon('M19 12H5m7-7-7 7 7 7')}</button><h1 id="app-title" tabindex="-1">Pokédex</h1><button id="app-save-state" class="save-chip" aria-label="Account and save status">Connecting…</button><button id="app-account" class="icon-button" aria-label="Account and backups"><svg aria-hidden="true"><use href="#i-more"/></svg></button></header>
    <nav class="app-nav" aria-label="Main navigation"><button id="open-pokedex" data-destination="pokedex"><svg aria-hidden="true"><use href="#i-grid"/></svg>Pokédex</button><button id="open-collections" data-destination="collections">${icon('M3 7h18v13H3zM3 4h18m-12 7h6')}Collections <small id="collections-count">0</small></button><button id="open-wishlist" data-destination="wishlist">${icon('M20 5a4.5 4.5 0 0 0-6.4 0L12 6.6 10.4 5A4.5 4.5 0 0 0 4 11.4l8 8 8-8A4.5 4.5 0 0 0 20 5Z')}Wishlist <small id="wishlist-count">0</small></button><button id="open-card-search" class="nav-add" data-destination="search">${icon('M12 5v14M5 12h14')}Add card</button></nav>`;
  document.body.prepend(shell);
  document.querySelector('.skip').addEventListener('click', (event) => {
    event.preventDefault();
    navigation.go('pokedex', {}, { focus: 'collection' });
  });
  const panel = document.createElement('dialog');
  panel.id = 'account-panel';
  panel.dataset.cloudUi = '';
  panel.className = 'utility-dialog';
  panel.setAttribute('aria-labelledby', 'account-title');
  panel.innerHTML = `<div class="dialog-head"><h2 id="account-title">Account</h2><button id="account-close" class="icon-button" aria-label="Close account menu">×</button></div><p id="cloud-account">Connecting your account…</p><p id="cloud-status" role="status" aria-live="polite"></p><div class="account-actions"><button class="secondary-button" id="cloud-import" hidden>Import old checkmarks</button><button class="primary-button" id="cloud-conflicts" hidden>Review changes</button><button class="secondary-button" id="cloud-retry">Sync now</button><button class="secondary-button" id="cloud-signin" hidden>Sign in again</button></div><h3>Files</h3><div class="account-tools"><button id="app-backup">Download backup <small>All cards, quantities, and collections</small></button><button id="app-restore">Restore from backup</button><button id="app-checklist">Download offline checklist <small>Pokédex ticks only</small></button><button id="app-share">List missing Pokémon</button><button id="app-print">Print Pokédex</button></div>`;
  document.body.append(panel);
  const passkeys = document.createElement('a');
  passkeys.href = '/passkeys';
  passkeys.textContent = 'Manage passkeys';
  passkeys.className = 'secondary-button signout-link';
  passkeys.hidden = true;
  panel.append(passkeys);
  const invite = document.createElement('a');
  invite.href = '/passkeys#invite';
  invite.textContent = 'Invite someone';
  invite.className = 'secondary-button signout-link';
  invite.hidden = true;
  panel.append(invite);
  const signout = document.createElement('button');
  signout.id = 'app-signout';
  signout.className = 'secondary-button signout-link';
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
  $('search').setAttribute('aria-label', 'Filter by name or Pokédex number');
  $('search').placeholder = 'Filter by name or number';
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
      passkeys.hidden = user.development;
      invite.hidden = user.development || user.role !== 'admin';
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
      if ($('app-save-state').title !== text) $('app-save-state').title = text;
    },
    lock(value) {
      $('open-card-search').disabled = value;
      for (const id of ['app-backup', 'app-restore', 'app-checklist']) $(id).disabled = value;
    },
  };
}
