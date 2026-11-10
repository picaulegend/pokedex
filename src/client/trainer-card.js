import { badges } from './badge-definitions.js';
import {
  bindImages,
  escape,
  icon,
  languageName,
  picture,
  updateMarkup,
  variantName,
} from './ui.js';

export function trainerCardMarkup(avatar) {
  return `<section class="trainer-card" aria-labelledby="trainer-card-title">
    <header class="screen-intro profile-intro">
      ${avatar}<div><h2 id="trainer-card-title">Trainer Card</h2><p id="cloud-account">Connecting your account…</p></div>
    </header>
    <div class="trainer-stats">
      <div class="trainer-dex">
        <label for="trainer-progress">Pokédex progress</label>
        <strong id="trainer-progress-count">Loading progress…</strong>
        <progress id="trainer-progress"></progress>
      </div>
      <div class="trainer-favorite">
        <img id="trainer-favorite-image" alt="" width="64" height="64" hidden>
        <div><span>Favorite Pokémon</span><strong id="trainer-favorite-name">No favorite selected</strong></div>
      </div>
    </div>
    <h3 id="trainer-badge-title">Milestone badges <span id="trainer-badge-count"></span></h3>
    <ul id="trainer-earned-badges" aria-label="Earned badges" hidden>
      ${badges.map(({ id, icon, name }) => `<li id="earned-${id}" hidden><span aria-hidden="true">${icon}</span> ${name}</li>`).join('')}
    </ul>
    <details class="trainer-badge-goals">
      <summary>View badge goals</summary>
      <p>Badges use cards saved online. Earned badges stay on your Trainer Card.</p>
      <ul class="trainer-badges" aria-labelledby="trainer-badge-title">
        ${badges.map(({ id, icon, name, description }) => `<li id="badge-${id}" data-earned="false"><span aria-hidden="true">${icon}</span><div><strong>${name}</strong><small>${description}</small><small class="badge-progress"></small></div></li>`).join('')}
      </ul>
    </details>
  </section>
  <section class="trainer-showcase" aria-labelledby="trainer-showcase-title">
    <div class="trainer-showcase-heading">
      <div><h3 id="trainer-showcase-title">Card showcase</h3><p>Open a card you own and select <strong>Feature on Trainer Card</strong>.</p></div>
      <button type="button" class="secondary-button" id="showcase-browse">Browse owned cards</button>
    </div>
    <ul id="showcase-slots" class="trainer-slots"></ul>
    <p id="showcase-status" role="status"></p>
  </section>`;
}

export function createTrainerCard($, { app, navigation, saveShowcase }) {
  const slots = $('showcase-slots');
  const status = $('showcase-status');
  let cards = [];
  let saving = null;
  let locked = true;
  let progressKey;
  let badgeKey;

  function renderCards() {
    const featured = cards.map(
      (card) => `<li id="showcase-${escape(card.variantId)}">
        <button type="button" class="card-open" data-showcase-open="${escape(card.variantId)}">
          ${picture(card)}<span class="card-caption"><strong>${escape(card.name)}</strong><span>${escape(card.setName)} · ${escape(card.number)}</span><span>${languageName(card.language)} · ${escape(variantName({ ...card, stamps: JSON.parse(card.stamps) }))}</span></span>
        </button>
        <button type="button" class="secondary-button" data-showcase-remove="${escape(card.variantId)}" aria-label="Remove ${escape(card.name)} from showcase" ${locked || saving ? 'disabled' : ''}>${saving === card.variantId ? 'Removing…' : 'Remove'}</button>
      </li>`,
    );
    while (featured.length < 3)
      featured.push('<li class="trainer-empty-slot">' + icon('plus') + 'Open slot</li>');
    updateMarkup(slots, featured.join(''));
    bindImages(slots);
  }

  $('showcase-browse').onclick = () => navigation.go('cards');
  slots.onclick = async (event) => {
    const open = event.target.closest('[data-showcase-open]');
    const remove = event.target.closest('[data-showcase-remove]');
    if (open) {
      const card = cards.find((item) => item.variantId === open.dataset.showcaseOpen);
      if (card)
        navigation.go('card', {
          language: card.language,
          sourceId: card.sourceId,
          variant: card.variantId,
          from: 'profile',
        });
    }
    if (!remove || locked || saving) return;
    saving = remove.dataset.showcaseRemove;
    status.textContent = 'Removing card…';
    renderCards();
    try {
      await saveShowcase(saving, false);
      status.textContent = 'Card removed from your Trainer Card.';
      if (navigation.route.screen === 'profile' && document.activeElement === document.body)
        $('showcase-browse').focus({ preventScroll: true });
    } catch (error) {
      status.textContent = error.message;
    } finally {
      saving = null;
      renderCards();
    }
  };

  renderCards();
  return {
    favorite(id) {
      const image = $('trainer-favorite-image');
      if (id) {
        const src = app.pokemonImage(id);
        if (image.getAttribute('src') !== src) image.src = src;
      } else image.removeAttribute('src');
      image.hidden = !id;
      $('trainer-favorite-name').textContent = id ? app.pokemonName(id) : 'No favorite selected';
    },
    progress(owned) {
      const key = owned.length;
      if (key === progressKey) return;
      progressKey = key;
      const progress = $('trainer-progress');
      progress.max = app.pokemonTotal;
      progress.value = owned.length;
      $('trainer-progress-count').textContent =
        `${owned.length.toLocaleString('en-US')} / ${app.pokemonTotal.toLocaleString('en-US')} species`;
    },
    badges(snapshot) {
      const key = `${snapshot?.rulesVersion}:${snapshot?.checkedRevision}`;
      if (key === badgeKey) return;
      badgeKey = key;
      let earnedCount = 0;
      for (const { id, targets } of badges) {
        const date = snapshot?.earned[id];
        const values = snapshot?.progress[id];
        const item = $(`badge-${id}`);
        item.dataset.earned = String(Boolean(date));
        $(`earned-${id}`).hidden = !date;
        if (date) earnedCount++;
        item.querySelector('.badge-progress').textContent = date
          ? `Earned ${new Date(date).toLocaleDateString()}`
          : values
            ? targets
                .map(
                  ([target, label], index) =>
                    `${Math.min(target, values[index]).toLocaleString('en-US')} / ${target.toLocaleString('en-US')} ${label}`,
                )
                .join(' · ')
            : '';
      }
      $('trainer-earned-badges').hidden = !earnedCount;
      $('trainer-badge-count').textContent = snapshot?.rulesVersion
        ? `${earnedCount} / ${badges.length} earned`
        : 'Checks after sync';
    },
    showcase(next, canEdit) {
      cards = next;
      locked = !canEdit;
      renderCards();
    },
    lock() {
      locked = true;
      renderCards();
    },
  };
}
