import { icon } from './ui.js';

export function createShareControls({ api, canEdit, getState }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'sharing-panel';
  dialog.className = 'utility-dialog';
  dialog.dataset.cloudUi = '';
  dialog.setAttribute('aria-labelledby', 'sharing-panel-title');
  dialog.innerHTML =
    '<div class="dialog-head"><h2 id="sharing-panel-title">Share a collection</h2><button id="sharing-close" class="icon-button" aria-label="Close sharing">' +
    icon('close') +
    '</button></div><p id="sharing-description"></p><p class="muted">Visitors cannot edit. They do not see your email, copy counts, or other collections. The page always shows your latest saved changes.</p><p id="sharing-pending" hidden>Changes that are not synced yet will appear after they are saved online.</p><p id="sharing-status" role="status">Checking sharing…</p><a id="sharing-preview" class="secondary-button sharing-preview-link" target="_blank" rel="noopener noreferrer" hidden>Preview page</a><div id="sharing-link-fields" hidden><label>Link<input id="sharing-url" type="url" readonly></label><div class="form-actions"><button id="sharing-copy" class="primary-button">Copy link</button><button id="sharing-send" class="secondary-button" hidden>Share…</button><a id="sharing-open" class="secondary-button" target="_blank" rel="noopener noreferrer">Open page</a></div></div><div class="sharing-switch"><button id="sharing-enable" class="primary-button" disabled>Create link</button><button id="sharing-stop" class="secondary-button" hidden>Stop sharing</button><button id="sharing-retry" class="secondary-button" hidden>Try again</button></div>';
  document.body.append(dialog);
  const $ = (id) => dialog.querySelector(`#${id}`);
  let target,
    state,
    generation = 0,
    busy = false;
  function draw() {
    const enabled = Boolean(state?.share.enabled);
    $('sharing-link-fields').hidden = !enabled;
    $('sharing-enable').hidden = enabled;
    $('sharing-enable').disabled = busy || !state || !canEdit();
    $('sharing-stop').hidden = !enabled;
    $('sharing-stop').disabled = busy || !canEdit();
    $('sharing-copy').disabled = busy;
    $('sharing-send').hidden = !navigator.share;
    $('sharing-preview').hidden = enabled || !state?.previewUrl;
    if (state?.previewUrl) $('sharing-preview').href = state.previewUrl;
    $('sharing-url').value = state?.share.url || '';
    $('sharing-open').href = state?.share.url || '#';
    const saved = getState();
    $('sharing-pending').hidden = !(saved?.pending.length || saved?.recordPending.length);
  }
  async function load() {
    const current = ++generation;
    busy = true;
    $('sharing-retry').hidden = true;
    $('sharing-retry').textContent = 'Try again';
    draw();
    try {
      const value = await api(`/api/shares?${new URLSearchParams(target)}`);
      if (current !== generation || !dialog.open) return;
      state = value;
      $('sharing-status').textContent = state.share.enabled
        ? 'Sharing is on. Anyone with the link can view this page.'
        : 'Sharing is off.';
    } catch (error) {
      if (current === generation) {
        $('sharing-status').textContent = error.message;
        $('sharing-retry').hidden = false;
      }
    } finally {
      if (current === generation) {
        busy = false;
        draw();
      }
    }
  }
  async function change(enabled) {
    if (!state || busy || !canEdit()) return;
    const current = ++generation;
    busy = true;
    $('sharing-status').textContent = enabled ? 'Creating your link…' : 'Turning sharing off…';
    draw();
    try {
      const value = await api('/api/shares', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, enabled, baseRevision: state.share.revision }),
      });
      if (current !== generation || !dialog.open) return;
      state = value;
      $('sharing-status').textContent = enabled
        ? 'Sharing is on. Anyone with the link can view this page.'
        : 'Sharing is off. The old link no longer works. A new link will replace it if you share again.';
    } catch (error) {
      if (current === generation) {
        if (error.body?.share) state = { ...state, share: error.body.share };
        $('sharing-status').textContent = error.message;
        $('sharing-retry').textContent = 'Check sharing';
        $('sharing-retry').hidden = false;
      }
    } finally {
      if (current === generation) {
        busy = false;
        draw();
      }
    }
  }
  $('sharing-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    generation++;
    busy = false;
  });
  $('sharing-enable').onclick = () => void change(true);
  $('sharing-stop').onclick = () => void change(false);
  $('sharing-retry').onclick = () => void load();
  $('sharing-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(state.share.url);
      $('sharing-status').textContent = 'Link copied.';
    } catch {
      $('sharing-url').focus();
      $('sharing-url').select();
      $('sharing-status').textContent = 'Select and copy the link above.';
    }
  };
  $('sharing-send').onclick = async () => {
    try {
      await navigator.share({ title: 'Collect', url: state.share.url });
    } catch (error) {
      if (error.name !== 'AbortError')
        $('sharing-status').textContent = 'Use Copy link to share this page.';
    }
  };
  return {
    open(value, title) {
      target = value;
      state = null;
      busy = false;
      $('sharing-panel-title').textContent =
        value.scope === 'wishlist' ? 'Share your wishlist' : 'Share this collection';
      $('sharing-description').textContent =
        value.scope === 'wishlist'
          ? 'Anyone with the link can see the cards you want and the cards missing from your collections.'
          : 'Anyone with the link can see the cards in “' + title + '” and which ones you own.';
      $('sharing-status').textContent = 'Checking sharing…';
      draw();
      if (!dialog.open) dialog.showModal();
      void load();
    },
    close() {
      if (dialog.open) dialog.close();
    },
  };
}
