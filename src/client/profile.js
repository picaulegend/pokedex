import { avatars, trainerSprites } from './avatars.js';
import { escape } from './ui.js';
import { createTrainerCard, trainerCardMarkup } from './trainer-card.js';

export const avatarFace = `<span class="avatar-face" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="3"/><path d="M5 20v-1a7 7 0 0 1 14 0v1" stroke-linecap="round"/></svg><img alt="" width="80" height="80" hidden></span>`;

export function showAvatar(face, id) {
  const avatar = avatars.find((item) => item.id === id);
  const image = face.querySelector('img');
  const icon = face.querySelector('svg');
  const url = avatar && `${trainerSprites}${avatar.sprite}.png`;
  if (image.getAttribute('src') === (url || null)) return;
  image.hidden = true;
  icon.removeAttribute('hidden');
  if (url) {
    image.onload = () => {
      image.hidden = false;
      icon.setAttribute('hidden', '');
    };
    image.onerror = () => {
      image.hidden = true;
      icon.removeAttribute('hidden');
    };
    image.referrerPolicy = 'no-referrer';
    image.src = url;
  } else image.removeAttribute('src');
}

function createFavoritePicker($, app, navigation, saveProfile, showFavorite) {
  const search = $('favorite-search');
  const results = $('favorite-results');
  const matches = $('favorite-matches');
  const status = $('favorite-status');
  const image = $('favorite-image');
  const name = $('favorite-name');
  const open = $('favorite-open');
  const clear = $('favorite-clear');
  const save = $('favorite-save');
  let saved = null;
  let draft = null;
  let locked = true;
  let saving = false;

  function update() {
    $('favorite-controls').disabled = locked || saving;
    save.disabled = locked || saving || draft === saved;
    clear.hidden = draft === null;
    open.hidden = saved === null || draft !== saved;
    name.textContent = draft === null ? 'No favorite selected' : app.pokemonName(draft);
    image.hidden = draft === null;
    const src = draft === null ? null : app.pokemonImage(draft);
    if (src && image.getAttribute('src') !== src) image.src = src;
    if (!src) image.removeAttribute('src');
  }

  search.oninput = () => {
    const query = search.value.trim();
    const found = query ? app.searchPokemon(query, 7) : [];
    const visible = found.slice(0, 6);
    results.innerHTML = visible
      .map(
        ({ id, name }) =>
          `<li><button type="button" class="secondary-button" data-favorite-choice="${id}">${escape(name)} <small>#${String(id).padStart(4, '0')}</small></button></li>`,
      )
      .join('');
    matches.textContent = !query
      ? ''
      : !found.length
        ? 'No Pokémon found.'
        : found.length > visible.length
          ? 'First 6 matches. Type more to narrow the list.'
          : `${visible.length} ${visible.length === 1 ? 'match' : 'matches'}.`;
  };

  function choose(id) {
    draft = id;
    search.value = '';
    results.replaceChildren();
    matches.textContent = '';
    status.textContent = '';
    update();
    (save.disabled ? search : save).focus();
  }

  results.onclick = (event) => {
    const choice = event.target.closest('[data-favorite-choice]');
    if (choice) choose(Number(choice.dataset.favoriteChoice));
  };
  clear.onclick = () => choose(null);
  open.onclick = () => navigation.go('pokemon', { pokemon: saved });
  save.onclick = async () => {
    if (save.disabled) return;
    saving = true;
    status.textContent = 'Saving favorite…';
    update();
    try {
      const result = await saveProfile({ favoritePokemonId: draft });
      draft = saved = result.favoritePokemonId;
      showFavorite(saved);
      status.textContent = saved === null ? 'Favorite removed.' : 'Favorite saved.';
    } catch (error) {
      status.textContent =
        error.status === 401
          ? 'Sign in again to save your favorite.'
          : 'Could not save your favorite. Check your connection and try again.';
    } finally {
      saving = false;
      update();
    }
  };
  return {
    account(id) {
      draft = saved = id ?? null;
      locked = false;
      showFavorite(saved);
      update();
    },
    lock() {
      locked = true;
      update();
    },
  };
}

export function createProfile({ app, navigation, shell, saveProfile, saveShowcase }) {
  const screen = document.createElement('main');
  screen.id = 'profile-screen';
  screen.className = 'app-screen';
  screen.dataset.cloudUi = '';
  screen.hidden = true;
  screen.innerHTML = `<div class="profile-layout">
    ${trainerCardMarkup(avatarFace)}
    <section class="profile-favorite" aria-labelledby="profile-favorite-title">
      <h3 id="profile-favorite-title">Favorite Pokémon</h3>
      <p>Your favorite gets a heart in the Pokédex.</p>
      <fieldset id="favorite-controls" aria-labelledby="profile-favorite-title" disabled>
        <div class="profile-favorite-choice">
          <img id="favorite-image" alt="" width="56" height="56" hidden>
          <strong id="favorite-name">No favorite selected</strong>
          <button type="button" class="secondary-button" id="favorite-open" hidden>View Pokémon</button>
          <button type="button" class="secondary-button" id="favorite-clear" hidden>Clear choice</button>
        </div>
        <label for="favorite-search">Find a Pokémon<input type="search" id="favorite-search" maxlength="100" placeholder="Name or Pokédex number" autocomplete="off"></label>
        <p id="favorite-matches" role="status"></p>
        <ul id="favorite-results"></ul>
      </fieldset>
      <div class="profile-save">
        <button type="button" class="primary-button" id="favorite-save" disabled>Save favorite</button>
        <p id="favorite-status" role="status"></p>
      </div>
    </section>
    <form id="profile-avatar-form">
      <fieldset id="profile-avatars" disabled>
        <legend>Choose an avatar</legend>
        <div class="profile-avatar-grid">
          ${[{ id: '', name: 'Default' }, ...avatars]
            .map(
              ({ id, name }) =>
                `<label class="profile-avatar-option"><input type="radio" name="avatar" value="${id}" ${id ? '' : 'checked'}><span>${avatarFace}<strong>${name}</strong></span></label>`,
            )
            .join('')}
        </div>
      </fieldset>
      <div class="profile-save">
        <button class="primary-button" id="profile-save-avatar" disabled>Save avatar</button>
        <p id="profile-avatar-status" role="status"></p>
      </div>
      <p class="profile-credits">Trainer sprites: <a href="${trainerSprites}" target="_blank" rel="noopener noreferrer">Pokémon Showdown</a>.</p>
    </form>
    <section class="profile-account" aria-labelledby="profile-account-title">
      <h3 id="profile-account-title">Account</h3>
      <div class="profile-actions">
        <button class="secondary-button" id="profile-account-tools">Sync and backups</button>
        <a class="secondary-button" id="profile-passkeys" href="/passkeys" hidden>Manage passkeys</a>
        <a class="secondary-button" id="profile-invite" href="/passkeys#invite" hidden>Invite someone</a>
        <button class="secondary-button" id="app-signout" hidden>Sign out</button>
      </div>
      <p id="profile-account-status" role="status"></p>
    </section>
  </div>`;
  document.body.append(screen);
  const $ = (id) => screen.querySelector(`#${id}`);
  const trainer = createTrainerCard($, { app, navigation, saveShowcase });
  const favorite = createFavoritePicker($, app, navigation, saveProfile, trainer.favorite);
  const form = $('profile-avatar-form');
  const options = $('profile-avatars');
  const save = $('profile-save-avatar');
  const status = $('profile-avatar-status');
  const preview = screen.querySelector('.profile-intro .avatar-face');
  const selected = () => form.elements.avatar.value || null;
  let saved = null;
  let locked = true;
  let saving = false;
  let loaded = false;
  function update() {
    options.disabled = locked || saving;
    save.disabled = locked || saving || selected() === saved;
  }
  function setSaved(id) {
    saved = avatars.some((avatar) => avatar.id === id) ? id : null;
    form.elements.avatar.value = saved || '';
    shell.avatar(saved);
    showAvatar(preview, saved);
    update();
  }
  form.onchange = () => {
    status.textContent = '';
    update();
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (save.disabled) return;
    const id = selected();
    saving = true;
    status.textContent = 'Saving avatar…';
    update();
    try {
      const result = await saveProfile({ avatarId: id });
      setSaved(result.avatarId);
      status.textContent = 'Avatar saved.';
    } catch (error) {
      status.textContent =
        error.status === 401
          ? 'Sign in again to save your avatar.'
          : 'Could not save your avatar. Check your connection and try again.';
    } finally {
      saving = false;
      update();
    }
  };
  $('profile-account-tools').onclick = () => shell.openAccount();
  navigation.subscribe((route) => {
    screen.hidden = route.screen !== 'profile';
    if (screen.hidden) return;
    shell.title('Profile');
    if (loaded) return;
    loaded = true;
    for (const option of options.querySelectorAll('label'))
      showAvatar(option.querySelector('.avatar-face'), option.querySelector('input').value);
  });
  return {
    progress: trainer.progress,
    badges: trainer.badges,
    showcase: trainer.showcase,
    account(user) {
      $('cloud-account').textContent =
        `${user.email}${user.role === 'admin' ? ' · Owner' : ''}${user.development ? ' · Local preview' : ''}`;
      $('app-signout').hidden = user.development;
      $('profile-passkeys').hidden = user.development;
      $('profile-invite').hidden = user.development || user.role !== 'admin';
      locked = false;
      setSaved(user.avatarId);
      favorite.account(user.favoritePokemonId);
    },
    lock() {
      locked = true;
      update();
      favorite.lock();
      trainer.lock();
    },
  };
}
