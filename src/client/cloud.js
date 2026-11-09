import {
  cardCounts,
  mergeRemote,
  mergeSync,
  queueChange,
  queueRecord,
  updateAccount,
  visibleOwned,
  visibleRecords,
} from './cloud-store.js';
import { createCardLibrary } from './library.js';
import { plural } from './ui.js';
import { createNavigation } from './navigation.js';
import { createShell } from './shell.js';
import {
  hasDetails,
  historyOf,
  validateHistory,
  mergeInventory,
  pastCount,
} from './card-history-model.js';

const app = window.carddex;
const navigation = createNavigation();
const shell = createShell(app, navigation);
const panel = shell.panel;
const dialog = document.createElement('dialog');
dialog.id = 'cloud-review';
dialog.setAttribute('aria-labelledby', 'cloud-review-title');
dialog.innerHTML =
  '<h2 id="cloud-review-title">Choose which changes to keep</h2><div id="cloud-review-items"></div><div class="dialog-actions"><button class="secondary-button" id="cloud-review-close">Close</button></div>';
document.body.append(dialog);
const $ = (id) => document.getElementById(id);
let user,
  saved,
  busy = false,
  authFailed = false,
  message = '',
  channel,
  generation = 0;
let flushTask;
const library = createCardLibrary({
  app,
  navigation,
  shell,
  api,
  getState: () => saved,
  canEdit: () => Boolean(user && !authFailed),
  save: async (kind, id, data) => {
    const changes = Array.isArray(kind) ? kind : [{ kind, id, data }];
    const next = await updateAccount(user.id, (state) => {
      for (const { kind, id, data } of changes) {
        if (kind === 'inventory') {
          state.variantLinks ||= {};
          state.variantLinks[id] = library.pokemonIds(id);
        }
        queueRecord(state, kind, id, data);
      }
    });
    show(next);
    announce();
    void flush();
  },
  clearLegacy: async (id) => {
    const next = await updateAccount(user.id, (state) => queueChange(state, id, false));
    show(next);
    announce();
    void flush();
  },
  admit: async (card, variantId, owned, collection) => {
    if (
      collection &&
      saved.recordPending.some(
        (change) => change.kind === 'collection' && change.id === collection.id,
      )
    )
      await flush();
    if (collection) {
      if (
        saved.recordPending.some(
          (change) => change.kind === 'collection' && change.id === collection.id,
        ) ||
        saved.recordConflicts[`collection:${collection.id}`]
      )
        throw new Error('Sync or review this collection before adding a new card.');
      collection = saved.collections[collection.id];
      if (!collection || collection.deleted) throw new Error('This collection is unavailable.');
    }
    const current = visibleRecords(saved, 'inventory')[variantId];
    const body = await api('/api/cards/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: card.language,
        sourceId: card.sourceId,
        variantId,
        quantity:
          owned === null
            ? 0
            : owned
              ? Math.min(999, (current?.quantity || 0) + 1)
              : current?.quantity || 0,
        wanted: owned === null ? false : owned ? Boolean(current?.wanted) : true,
        ...(collection
          ? {
              collectionId: collection.id,
              collectionRevision: collection.revision,
              goalOnly: owned === null,
            }
          : {}),
        baseRevision: current?.revision || 0,
        mutationId: crypto.randomUUID(),
      }),
    });
    const next = await updateAccount(user.id, (state) => {
      if (
        body.state.revision &&
        (!state.inventory[variantId] || state.inventory[variantId].revision <= body.state.revision)
      )
        state.inventory[variantId] = body.state;
      if (
        body.collection &&
        (!state.collections[body.collection.id] ||
          state.collections[body.collection.id].revision <= body.collection.revision)
      )
        state.collections[body.collection.id] = body.collection;
      state.variantLinks ||= {};
      state.variantLinks[variantId] = card.pokemonIds;
      mergeRemote(state, body.progress);
    });
    show(next);
    announce();
  },
});

async function api(path, options = {}) {
  const headers = new Headers(options.headers);
  if (user && path !== '/api/session') headers.set('X-Carddex-Account', user.id);
  let response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      redirect: 'manual',
      cache: 'no-store',
      ...options,
      headers,
    });
  } catch (error) {
    if (options.signal?.aborted || error.name === 'AbortError') throw error;
    throw new Error('Connection is unavailable. Pending changes stay on this device.');
  }
  if (response.type === 'opaqueredirect') {
    authFailed = true;
    app.setEditing(false);
    library.setLocked(true);
    throw new Error('Sign in again. Pending changes stay on this device.');
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('The server did not send a valid reply. Try again.');
  }
  if (response.status === 401) {
    authFailed = true;
    app.setEditing(false);
    library.setLocked(true);
    throw new Error(
      body.code === 'account_changed'
        ? 'The account changed. Reload before saving. Pending changes stay with their original account.'
        : 'Sign in again. Pending changes stay on this device.',
    );
  }
  if (!response.ok) {
    const error = new Error(body.error || 'Sync is not available.');
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function status() {
  $('cloud-signin').hidden = !authFailed;
  $('cloud-retry').disabled = busy;
  $('cloud-conflicts').hidden =
    !saved || !(Object.keys(saved.conflicts).length + Object.keys(saved.recordConflicts).length);
  $('cloud-import').hidden = !user || saved?.legacyImported || !app.legacySnapshot()?.owned.length;
  let text = message;
  if (!text && saved) {
    const conflicts =
      Object.keys(saved.conflicts).length + Object.keys(saved.recordConflicts).length;
    const pending = saved.pending.length + saved.recordPending.length;
    text = conflicts
      ? `${plural(conflicts, 'record')} changed on another device. Review your choices.`
      : pending
        ? `${plural(pending, 'change')} saved on this device. Waiting to sync.`
        : 'All changes saved online.';
  }
  $('cloud-status').textContent = text || 'Checking your saved progress.';
  const conflicts =
    saved && Object.keys(saved.conflicts).length + Object.keys(saved.recordConflicts).length;
  const pending = saved && saved.pending.length + saved.recordPending.length;
  shell.status(
    authFailed
      ? 'Sign in'
      : !saved
        ? 'Connecting…'
        : conflicts
          ? 'Review changes'
          : pending
            ? 'Saved on device'
            : message
              ? 'Check sync'
              : busy
                ? 'Saving…'
                : 'Saved',
    authFailed || conflicts || message ? 'warning' : pending ? 'pending' : 'saved',
  );
  if (user)
    $('save-status').textContent =
      `· ${saved?.pending.length || saved?.recordPending.length ? 'Changes waiting to sync' : message ? 'Check sync status' : 'Saved online'}`;
}

function show(next) {
  saved = next;
  app.showCloudCollection(visibleOwned(next), cardCounts(next));
  status();
  library.update();
}

function announce() {
  channel?.postMessage('changed');
}

async function refresh() {
  if (!user || authFailed) return;
  saved = await updateAccount(user.id);
  const body = await api(`/api/sync?after=${saved.cursor || 0}`);
  const next = await updateAccount(user.id, (state) => mergeSync(state, body));
  message = '';
  show(next);
}

function flush() {
  if (flushTask) return flushTask;
  flushTask = drain().finally(() => {
    flushTask = null;
    if (user && !authFailed && !message && (saved?.pending.length || saved?.recordPending.length))
      void flush();
  });
  return flushTask;
}
async function drain() {
  if (!user || busy || authFailed) return;
  busy = true;
  status();
  try {
    while (true) {
      saved = await updateAccount(user.id);
      const change = saved.pending[0];
      if (!change) break;
      try {
        const result = await api(`/api/pokedex/${change.pokemonId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owned: change.owned,
            baseRevision: change.baseRevision,
            mutationId: change.mutationId,
          }),
        });
        const next = await updateAccount(user.id, (state) => {
          state.pending = state.pending.filter((item) => item.mutationId !== change.mutationId);
          mergeRemote(state, [result.state]);
        });
        message = '';
        show(next);
        announce();
        if (!change.owned && result.state.owned)
          app.notify(
            'You still own recorded cards for this Pokémon. Open its cards to change their quantities.',
          );
      } catch (error) {
        if (error.status !== 409 || error.body.code !== 'state_changed') throw error;
        const next = await updateAccount(user.id, (state) => {
          const same = state.pending.filter((item) => item.pokemonId === change.pokemonId);
          const wanted = same.at(-1)?.owned ?? change.owned;
          state.pending = state.pending.filter((item) => item.pokemonId !== change.pokemonId);
          mergeRemote(state, [error.body.state]);
          if (wanted !== error.body.state.owned)
            state.conflicts[change.pokemonId] = { pokemonId: change.pokemonId, wanted };
        });
        message = '';
        show(next);
        announce();
      }
    }
    while (true) {
      saved = await updateAccount(user.id);
      const change = saved.recordPending[0];
      if (!change) break;
      try {
        const result = await api(
          `/api/${change.kind === 'inventory' ? 'inventory' : 'collections'}/${change.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...change.data,
              baseRevision: change.baseRevision,
              mutationId: change.mutationId,
            }),
          },
        );
        const next = await updateAccount(user.id, (state) => {
          state.recordPending = state.recordPending.filter(
            (item) => item.mutationId !== change.mutationId,
          );
          state[change.kind === 'inventory' ? 'inventory' : 'collections'][change.id] =
            result.state;
          mergeRemote(state, result.progress);
        });
        message = '';
        show(next);
        announce();
      } catch (error) {
        if (error.status !== 409 || error.body.code !== 'state_changed') throw error;
        const next = await updateAccount(user.id, (state) => {
          const same = state.recordPending.filter(
            (item) => item.kind === change.kind && item.id === change.id,
          );
          const wanted = same.at(-1) || change;
          state.recordPending = state.recordPending.filter(
            (item) => !(item.kind === change.kind && item.id === change.id),
          );
          const table = state[change.kind === 'inventory' ? 'inventory' : 'collections'];
          if (error.body.state) table[change.id] = error.body.state;
          else delete table[change.id];
          state.recordConflicts[`${change.kind}:${change.id}`] = wanted;
        });
        message = '';
        show(next);
        announce();
      }
    }
    await refresh();
  } catch (error) {
    message = error.message || 'You are offline. Pending changes stay on this device.';
  } finally {
    busy = false;
    status();
  }
}

async function start() {
  $('cloud-retry').disabled = true;
  try {
    ({ user } = await api('/api/session'));
    shell.account(user);
    app.setScope(user.id);
    saved = await updateAccount(user.id);
    $('cloud-account').textContent =
      `${user.email}${user.role === 'admin' ? ' · Owner' : ''}${user.development ? ' · Local preview' : ''}`;
    document.querySelector('.sidebar-foot').innerHTML =
      '<div class="local-tag"><span class="dot"></span> YOUR PRIVATE COLLECTION</div>Changes sync between your devices. Use <strong>Back up</strong> to keep a separate copy.';
    channel =
      typeof BroadcastChannel === 'function' ? new BroadcastChannel(`carddex:${user.id}`) : null;
    if (channel)
      channel.onmessage = async () => {
        show(await updateAccount(user.id));
        void flush();
      };
    try {
      await refresh();
    } catch (error) {
      message = error.message;
    }
    show(saved);
    app.setEditing(!authFailed);
    library.setLocked(authFailed);
    if (saved.pending.length || saved.recordPending.length) void flush();
  } catch (error) {
    $('cloud-account').textContent = 'Account connection needed';
    message = error.message;
    app.setEditing(false);
  } finally {
    status();
  }
}

window.addEventListener('carddex:change', async (event) => {
  if (!user || !saved || authFailed) return;
  const current = ++generation;
  try {
    const next = await updateAccount(user.id, (state) => {
      for (const change of event.detail.changes) queueChange(state, change.pokemonId, change.owned);
    });
    if (current === generation) show(next);
    announce();
    void flush();
  } catch {
    message = 'Saving on this device failed. Download a backup before closing.';
    app.setEditing(false);
    status();
  }
});

$('cloud-retry').onclick = () => (user ? void flush() : void start());
$('cloud-signin').onclick = () => location.assign('/login' + location.hash);
$('app-signout').onclick = async () => {
  const button = $('app-signout');
  button.disabled = true;
  try {
    await api('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    location.replace('/login');
  } catch (error) {
    message = error.message;
    status();
    button.disabled = false;
  }
};
$('cloud-import').onclick = async () => {
  const legacy = app.legacySnapshot();
  if (!legacy?.owned.length) return;
  const next = await updateAccount(user.id, (state) => {
    const existing = new Set(visibleOwned(state));
    for (const id of legacy.owned) if (!existing.has(id)) queueChange(state, id, true);
    state.legacyImported = true;
  });
  show(next);
  announce();
  void flush();
};
$('cloud-conflicts').onclick = () => {
  panel.close();
  const list = $('cloud-review-items');
  list.replaceChildren();
  for (const item of Object.values(saved.conflicts)) {
    const section = document.createElement('section');
    section.className = 'cloud-conflict';
    const title = document.createElement('strong');
    title.textContent = app.pokemonName(item.pokemonId);
    const detail = document.createElement('p');
    detail.textContent = `This device: ${item.wanted ? 'Have' : 'Missing'}. Online: ${saved.server[item.pokemonId]?.owned ? 'Have' : 'Missing'}.`;
    section.append(title, detail);
    for (const [label, keepLocal] of [
      ['Keep this device', true],
      ['Use online record', false],
    ]) {
      const button = document.createElement('button');
      button.className = 'secondary-button';
      button.textContent = label;
      button.onclick = async () => {
        const next = await updateAccount(user.id, (state) => {
          if (keepLocal) queueChange(state, item.pokemonId, item.wanted);
          else delete state.conflicts[item.pokemonId];
        });
        show(next);
        announce();
        dialog.close();
        void flush();
      };
      section.append(button);
    }
    list.append(section);
  }
  for (const item of Object.values(saved.recordConflicts)) {
    const section = document.createElement('section');
    section.className = 'cloud-conflict';
    const title = document.createElement('strong');
    title.textContent = item.kind === 'collection' ? item.data.name : 'Card ownership';
    const detail = document.createElement('p');
    const remote = saved[item.kind === 'inventory' ? 'inventory' : 'collections'][item.id];
    detail.textContent =
      item.kind === 'inventory'
        ? `This device: ${item.data.quantity} owned, ${item.data.wanted ? 'wanted' : 'not wanted'}, ${pastCount(historyOf(item.data))} past copies. Online: ${remote?.quantity || 0} owned, ${remote?.wanted ? 'wanted' : 'not wanted'}, ${pastCount(historyOf(remote))} past copies. The selected record keeps its card history and notes.`
        : `This device: ${plural(item.data.variantIds.length, 'card')}${item.data.deleted ? ', deleted' : ''}. Online: ${plural(remote?.variantIds.length || 0, 'card')}${remote?.deleted ? ', deleted' : ''}.`;
    section.append(title, detail);
    for (const [label, keepLocal] of [
      ['Keep this device', true],
      ['Use online record', false],
    ]) {
      const button = document.createElement('button');
      button.className = 'secondary-button';
      button.textContent = label;
      button.onclick = async () => {
        const next = await updateAccount(user.id, (state) => {
          if (keepLocal)
            queueRecord(state, item.kind, item.id, {
              ...item.data,
              ...(item.kind === 'inventory' && item.data.history ? { historyChoice: true } : {}),
            });
          else delete state.recordConflicts[`${item.kind}:${item.id}`];
        });
        show(next);
        announce();
        dialog.close();
        void flush();
      };
      section.append(button);
    }
    list.append(section);
  }
  dialog.showModal();
};
$('cloud-review-close').onclick = () => dialog.close();
window.addEventListener('carddex:backup', async () => {
  if (!user || authFailed) return;
  const current = await updateAccount(user.id);
  const legacy = new Set(
    Object.values(current.server)
      .filter((r) => r.legacyOwned)
      .map((r) => r.pokemonId),
  );
  for (const row of current.pending)
    row.owned ? legacy.add(row.pokemonId) : legacy.delete(row.pokemonId);
  for (const row of Object.values(current.conflicts))
    row.wanted ? legacy.add(row.pokemonId) : legacy.delete(row.pokemonId);
  const content = {
    app: 'carddex',
    version: 3,
    exportedAt: new Date().toISOString(),
    owned: visibleOwned(current),
    legacyOwned: [...legacy],
    inventory: Object.values(visibleRecords(current, 'inventory'))
      .filter((r) => r.quantity || r.wanted || hasDetails(r))
      .map((r) => ({
        variantId: r.variantId,
        quantity: r.quantity,
        wanted: r.wanted,
        history: historyOf(r),
      })),
    collections: Object.values(visibleRecords(current, 'collection'))
      .filter((c) => !c.deleted)
      .map((c) => ({ id: c.id, name: c.name, variantIds: c.variantIds })),
  };
  const references = new Map(library.sourceReferences().map((r) => [r.variantId, r]));
  for (const row of Object.values(visibleRecords(current, 'inventory')))
    if (row.source?.language && row.source?.sourceId)
      references.set(row.variantId, { variantId: row.variantId, ...row.source });
  const ids = [
    ...new Set([
      ...content.inventory.map((r) => r.variantId),
      ...content.collections.flatMap((c) => c.variantIds),
    ]),
  ];
  try {
    for (let offset = 0; offset < ids.length; offset += 200) {
      const missing = ids.slice(offset, offset + 200).filter((id) => !references.has(id));
      if (missing.length)
        for (const row of (await api(`/api/cards/resolve?variants=${missing.join(',')}`)).sources)
          references.set(row.variantId, row);
    }
  } catch {
    /* Existing cached source references remain in an offline backup. */
  }
  content.sources = ids.map((id) => references.get(id)).filter(Boolean);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `carddex-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  app.notify('Full collection backup download started.');
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('carddex:restore', async (event) => {
  if (!user || authFailed) return;
  try {
    app.notify('Checking your backup…');
    const data = event.detail;
    const id = (value) =>
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    if (
      !Array.isArray(data.legacyOwned) ||
      data.legacyOwned.length > 1025 ||
      !data.legacyOwned.every((n) => Number.isInteger(n) && n >= 1 && n <= 1025) ||
      !Array.isArray(data.inventory) ||
      data.inventory.length > 5000 ||
      !data.inventory.every(
        (r) =>
          id(r.variantId) &&
          Number.isInteger(r.quantity) &&
          r.quantity >= 0 &&
          r.quantity <= 999 &&
          typeof r.wanted === 'boolean',
      ) ||
      !Array.isArray(data.collections) ||
      data.collections.length > 500 ||
      !data.collections.every(
        (c) =>
          id(c.id) &&
          typeof c.name === 'string' &&
          c.name.trim().length > 0 &&
          c.name.length <= 80 &&
          Array.isArray(c.variantIds) &&
          c.variantIds.length <= 2000 &&
          c.variantIds.every(id) &&
          new Set(c.variantIds).size === c.variantIds.length,
      ) ||
      (data.sources !== undefined &&
        (!Array.isArray(data.sources) ||
          data.sources.length > 10000 ||
          !data.sources.every(
            (r) =>
              id(r.variantId) &&
              ['en', 'ja'].includes(r.language) &&
              typeof r.sourceId === 'string' &&
              /^[a-zA-Z0-9.+-]{1,100}$/.test(r.sourceId),
          )))
    )
      throw new Error('Choose a valid Carddex backup.');
    data.inventory = data.inventory
      .map((row) => ({ ...row, history: validateHistory(historyOf(row), row.quantity) }))
      .filter((r) => r.quantity || r.wanted || hasDetails(r));
    if (new Set(data.inventory.map((r) => r.variantId)).size !== data.inventory.length)
      throw new Error('This backup has duplicate card records.');
    const ids = [
      ...new Set([
        ...data.inventory.map((r) => r.variantId),
        ...data.collections.flatMap((c) => c.variantIds),
      ]),
    ];
    const missingIds = [],
      sources = new Map((data.sources || []).map((r) => [r.variantId, r]));
    for (let offset = 0; offset < ids.length; offset += 200) {
      const result = await api(
        `/api/catalogue?variants=${ids.slice(offset, offset + 200).join(',')}`,
      );
      const valid = new Set(result.cards.flatMap((c) => c.variants.map((v) => v.id)));
      missingIds.push(...ids.slice(offset, offset + 200).filter((id) => !valid.has(id)));
    }
    for (let offset = 0; offset < missingIds.length; offset += 200) {
      const unresolved = missingIds.slice(offset, offset + 200).filter((id) => !sources.has(id));
      if (unresolved.length)
        for (const source of (await api(`/api/cards/resolve?variants=${unresolved.join(',')}`))
          .sources)
          sources.set(source.variantId, source);
    }
    for (const variantId of missingIds) {
      const source = sources.get(variantId);
      if (!source)
        throw new Error(
          'This older backup lacks source IDs for some cards. Add those cards through search before restoring it.',
        );
      const detail = await api(
        `/api/cards/detail?${new URLSearchParams({ language: source.language, sourceId: source.sourceId })}`,
      );
      if (!detail.card.variants.some((v) => v.id === variantId))
        throw new Error(
          'A source variant changed. Select its finish through card search before restoring it.',
        );
    }
    if (!(await shell.confirmRestore(data, user.email))) return;
    const goalOnly = [];
    for (const variantId of missingIds) {
      const source = sources.get(variantId),
        record = data.inventory.find((r) => r.variantId === variantId);
      const result = await api('/api/cards/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: source.language,
          sourceId: source.sourceId,
          variantId,
          quantity: record?.quantity || 0,
          wanted: Boolean(record?.wanted || !record?.quantity),
          ...(record ? { wanted: record.wanted, history: record.history } : {}),
          baseRevision: 0,
          mutationId: crypto.randomUUID(),
        }),
      });
      await updateAccount(user.id, (state) => {
        state.inventory[variantId] = result.state;
        mergeRemote(state, result.progress);
      });
      if (!record) goalOnly.push(variantId);
    }
    const next = await updateAccount(user.id, (state) => {
      const own = visibleRecords(state, 'inventory'),
        groups = visibleRecords(state, 'collection');
      for (const pokemonId of data.legacyOwned) queueChange(state, pokemonId, true);
      for (const variantId of goalOnly)
        queueRecord(state, 'inventory', variantId, { quantity: 0, wanted: false });
      for (const row of data.inventory)
        queueRecord(state, 'inventory', row.variantId, mergeInventory(own[row.variantId], row));
      for (const group of data.collections) {
        const existing = groups[group.id];
        const variantIds = [...new Set([...(existing?.variantIds || []), ...group.variantIds])];
        if (variantIds.length > 2000)
          throw new Error(
            'A merged collection has more than 2,000 variants. Restore a smaller collection.',
          );
        queueRecord(state, 'collection', group.id, {
          name: existing && !existing.deleted ? existing.name : group.name.trim(),
          deleted: false,
          variantIds,
        });
      }
    });
    show(next);
    announce();
    void flush();
  } catch (error) {
    message = error.message || 'Restore failed.';
    status();
  }
});
window.addEventListener('online', () => void flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void flush();
});
setInterval(() => {
  if (document.visibilityState === 'visible') void flush();
}, 300000);
navigation.start();
void start();
