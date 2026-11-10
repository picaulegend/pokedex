import {
  escape,
  picture,
  imageUrl,
  bindImages,
  languageName,
  variantName,
  updateMarkup,
  credits,
  icon,
} from './ui.js';
import { createCardHistory } from './card-history-ui.js';
import { hasHistory, unrecordedCount } from './card-history-model.js';
import { createCardPrice } from './card-price-ui.js';

export function createCardDetail({
  app,
  navigation,
  shell,
  api,
  getCard,
  getInventory,
  getCollections,
  canEdit,
  isFeatured,
  saveShowcase,
  save,
  admit,
}) {
  const screen = document.createElement('main');
  screen.id = 'card-detail';
  screen.className = 'app-screen';
  screen.dataset.cloudUi = '';
  screen.hidden = true;
  document.body.append(screen);
  const zoom = document.createElement('dialog');
  zoom.id = 'card-image';
  zoom.dataset.cloudUi = '';
  zoom.className = 'image-dialog';
  zoom.innerHTML =
    '<button class="icon-button" id="image-close" aria-label="Close card image">' +
    icon('close') +
    '</button><div id="image-content"></div>';
  document.body.append(zoom);
  zoom.querySelector('button').onclick = () => zoom.close();
  let record,
    route,
    selected,
    loading = 0,
    busy = false,
    message = '',
    messageError = false,
    draft,
    activeAction,
    pendingAction;
  const historyControls = createCardHistory({
    getContext: () => ({
      card: record.card,
      variantId: selected,
      variant: variantName(currentVariant()),
      own: inventory(),
      image: imageUrl(record.card),
    }),
    canEdit: () => canEdit() && !busy,
    commit: (data, deleting) =>
      action(
        () => (deleting ? save('inventory', selected, data) : saveInventory(data)),
        deleting ? 'History entry deleted.' : 'Card history saved.',
      ),
    refresh: () => render(),
  });
  const currentVariant = () => record?.card.variants.find((v) => v.id === selected);
  const cardPrice = createCardPrice({ api, render });
  const inventory = () => getInventory()[selected] || { quantity: 0, wanted: false };
  const goal = () => getCollections().find((c) => c.id === route?.collection);
  async function ensureKnown(group) {
    if (record.saved) return;
    if (!navigator.onLine)
      throw new Error(
        'Connect to the internet to add this card. Your existing cards can still be edited offline.',
      );
    await admit(record.card, selected, null, group);
    record.saved = true;
  }
  async function setMembership(group, included) {
    if (included && !record.saved) {
      await ensureKnown(group);
      return;
    }
    await save('collection', group.id, {
      name: group.name,
      deleted: false,
      variantIds: included
        ? [...new Set([...group.variantIds, selected])]
        : group.variantIds.filter((id) => id !== selected),
    });
  }
  async function attachGoal() {
    const group = goal();
    if (group && !group.variantIds.includes(selected)) await setMembership(group, true);
  }
  async function saveInventory(data) {
    const group = goal();
    const changes = [{ kind: 'inventory', id: selected, data }];
    if (group && !group.variantIds.includes(selected))
      changes.push({
        kind: 'collection',
        id: group.id,
        data: { name: group.name, deleted: false, variantIds: [...group.variantIds, selected] },
      });
    await save(changes);
  }
  async function action(work, success, pending = {}) {
    if (!canEdit() || busy) return false;
    const key = `${route.language}:${route.sourceId}:${selected}`;
    const focus = document.activeElement?.id;
    let finish;
    activeAction = new Promise((resolve) => {
      finish = resolve;
    });
    busy = true;
    pendingAction = { control: focus, ...pending };
    message = pending.message || 'Saving…';
    messageError = false;
    render();
    try {
      await work();
      if (key === `${route.language}:${route.sourceId}:${selected}`) message = success;
      return true;
    } catch (error) {
      message = error.message || 'This change could not be saved. Try again.';
      messageError = true;
      return false;
    } finally {
      busy = false;
      pendingAction = null;
      render();
      if (
        navigation.route.screen === 'card' &&
        key === `${route.language}:${route.sourceId}:${selected}` &&
        (!document.activeElement?.id || document.activeElement.id === focus)
      )
        document.getElementById(focus)?.focus({ preventScroll: true });
      activeAction = null;
      finish();
    }
  }
  function render() {
    if (
      !record ||
      navigation.route.screen !== 'card' ||
      navigation.route.sourceId !== route.sourceId ||
      navigation.route.language !== route.language
    )
      return;
    const card = record.card,
      variant = currentVariant(),
      checkingPrice = cardPrice.checking(selected),
      own = inventory(),
      groups = getCollections(),
      linkedGoal = goal(),
      featured = isFeatured(selected),
      disabled = busy || !canEdit(),
      savingWishlist = busy && pendingAction.control === 'detail-want',
      wishlistAction = own.wanted ? 'Remove from wishlist' : 'Add to wishlist';
    updateMarkup(
      screen,
      `<div class="card-detail-layout"><h2 id="detail-title">${escape(card.name)}</h2><div class="detail-art"><button id="detail-image" class="image-open" aria-label="Enlarge ${escape(card.name)} card image">${picture(card, 'high')}</button></div><div class="detail-info">
      <dl class="detail-record"><div><dt>Set</dt><dd>${escape(card.setName || 'Not recorded')}</dd></div><div><dt>Card number</dt><dd>${escape(card.number)}${card.officialCount ? `/${escape(card.officialCount)}` : ''}</dd></div><div><dt>Language</dt><dd>${languageName(card.language)}</dd></div><div><dt>Illustrator</dt><dd>${escape(card.artist || 'Not recorded')}</dd></div></dl>
      <div class="finish-field"><label>Finish<select id="detail-finish" ${disabled ? 'disabled' : ''}>${card.variants.map((v) => `<option value="${v.id}" ${v.id === selected ? 'selected' : ''}>${escape(variantName(v))}</option>`).join('')}</select></label><button id="detail-check-price" class="secondary-button" type="button" ${!canEdit() ? 'disabled' : ''} aria-disabled="${checkingPrice}" aria-busy="${checkingPrice}">${checkingPrice ? 'Checking…' : 'Check price'}</button></div>
      ${cardPrice.markup(card, variant, record.saved)}
      ${linkedGoal ? `<div class="goal-context"><button id="detail-add-goal" class="primary-button" aria-pressed="${linkedGoal.variantIds.includes(selected)}" aria-disabled="${disabled || linkedGoal.variantIds.includes(selected)}" aria-busy="${busy && pendingAction.control === 'detail-add-goal'}">${busy && pendingAction.control === 'detail-add-goal' ? 'Adding…' : linkedGoal.variantIds.includes(selected) ? `In ${escape(linkedGoal.name)}` : `Add to ${escape(linkedGoal.name)}`}</button></div>` : ''}
      <div class="detail-actions"><div class="detail-owned"><span class="field-label" id="detail-owned-label">Owned</span><div class="quantity-stepper"><button id="detail-minus" class="icon-button" aria-label="Remove one owned copy" ${disabled || !own.quantity ? 'disabled' : ''}>${icon('minus')}</button><input id="detail-quantity" data-quantity="${selected}" aria-label="Owned copies of ${escape(card.name)}" type="number" inputmode="numeric" min="0" max="999" step="1" value="${escape(draft ?? own.quantity)}" ${disabled || !record.saved ? 'disabled' : ''}><button id="detail-plus" class="icon-button" aria-label="Add one owned copy" aria-busy="${busy && pendingAction.control === 'detail-plus'}" ${disabled || own.quantity >= 999 ? 'disabled' : ''}>${icon('plus')}</button></div></div><button id="detail-want" class="secondary-button want-button${own.wanted ? ' is-wanted' : ''}" data-want="${selected}" aria-label="${wishlistAction}" title="${wishlistAction}" aria-busy="${savingWishlist}" ${disabled ? 'disabled' : ''}>${icon('heart')}<span>${savingWishlist ? 'Saving…' : wishlistAction}</span></button></div>
      ${own.quantity ? `<button id="detail-feature" class="text-button detail-feature" ${disabled ? 'disabled' : ''}>${busy && pendingAction.control === 'detail-feature' ? 'Saving…' : featured ? 'Remove from Trainer Card' : 'Feature on Trainer Card'}</button>` : ''}
      <div class="detail-save-state"><p id="detail-message" role="status" class="${messageError ? 'is-error' : ''}">${escape(message)}</p>${message && !messageError && own.quantity && unrecordedCount(own) > 0 ? `<button id="detail-record-history" class="text-button" ${disabled ? 'disabled' : ''}>Add details</button>` : ''}</div>
      ${historyControls.markup(own, record.saved)}
      <details id="detail-collections" class="filter-panel"><summary>Collections <span>${groups.filter((g) => g.variantIds.includes(selected)).length}</span></summary><div class="membership-list">${groups.length ? groups.map((group) => `<label><input id="member-${group.id}" type="checkbox" data-membership="${group.id}" ${(busy && pendingAction.membership?.id === group.id ? pendingAction.membership.included : group.variantIds.includes(selected)) ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${escape(group.name)}</span></label>`).join('') : '<p>Create a collection to give these cards a goal.</p>'}</div></details>
      <details id="detail-reference" class="card-source-details"><summary>Card reference</summary><p>${escape(card.sourceId)} · ${escape(variantName(currentVariant()))}</p></details></div></div>${credits}`,
    );
    bindImages(screen);
    const $ = (id) => screen.querySelector(`#${id}`);
    $('detail-check-price').onclick = () => void cardPrice.check(card, variant);
    $('detail-finish').onchange = (event) => {
      historyControls.close();
      draft = undefined;
      const { screen: ignored, ...params } = route;
      navigation.go('card', { ...params, variant: event.target.value }, { replace: true });
    };
    $('detail-image').onclick = () => {
      const url = imageUrl(card, 'high');
      zoom.querySelector('#image-content').innerHTML = url
        ? `<img src="${escape(url)}" alt="${escape(card.name)} — ${escape(card.setName)}">`
        : '<p>Image unavailable</p>';
      const image = zoom.querySelector('img');
      if (image)
        image.onerror = () => {
          image.onerror = null;
          image.src = imageUrl(card);
        };
      zoom.showModal();
    };
    const changeQuantity = (quantity) =>
      action(
        async () => {
          if (quantity) await saveInventory({ quantity, wanted: inventory().wanted });
          else await save('inventory', selected, { quantity, wanted: inventory().wanted });
        },
        quantity && !own.quantity ? `${card.name} saved as owned.` : `Owned copies: ${quantity}.`,
      );
    if ($('detail-quantity')) {
      $('detail-quantity').oninput = (event) => {
        draft = event.target.value;
      };
      $('detail-quantity').onchange = (event) => {
        const input = event.target;
        if (
          !input.checkValidity() ||
          !Number.isInteger(Number(input.value)) ||
          input.value === ''
        ) {
          input.reportValidity();
          return;
        }
        const quantity = Number(input.value);
        draft = undefined;
        if (quantity < own.quantity) {
          input.value = own.quantity;
          historyControls.remove(own.quantity - quantity);
          return;
        }
        void changeQuantity(quantity);
      };
      $('detail-minus').onclick = () => historyControls.remove(1);
    }
    $('detail-plus').onclick = () =>
      record.saved
        ? void changeQuantity(Math.min(999, own.quantity + 1))
        : void action(
            async () => {
              await admit(card, selected, true, linkedGoal);
              record.saved = true;
              await attachGoal();
            },
            `${card.name} saved as owned${linkedGoal ? ` in ${linkedGoal.name}` : ''}.`,
          );
    $('detail-want').onclick = () =>
      void action(
        async () => {
          if (record.saved)
            await saveInventory({
              quantity: inventory().quantity,
              wanted: !inventory().wanted,
            });
          else {
            await admit(card, selected, false, linkedGoal);
            record.saved = true;
          }
          await attachGoal();
        },
        own.wanted
          ? 'Removed from your wishlist.'
          : `${card.name} saved as wanted${linkedGoal ? ` in ${linkedGoal.name}` : ''}.`,
      );
    if ($('detail-add-goal'))
      $('detail-add-goal').onclick = () =>
        linkedGoal.variantIds.includes(selected)
          ? undefined
          : void action(() => attachGoal(), `Added to ${linkedGoal.name}.`);
    if ($('detail-feature'))
      $('detail-feature').onclick = () =>
        void action(
          () => saveShowcase(selected, !featured),
          featured ? 'Card removed from your Trainer Card.' : 'Card featured on your Trainer Card.',
        );
    for (const input of screen.querySelectorAll('[data-membership]'))
      input.onchange = () => {
        const group = groups.find((g) => g.id === input.dataset.membership);
        const included = input.checked;
        void action(() => setMembership(group, included), 'Collection updated.', {
          membership: { id: group.id, included },
        });
      };
    historyControls.bind(screen);
  }
  return {
    screen,
    async show(next) {
      historyControls.close();
      if (activeAction) await activeAction;
      if (
        navigation.route.screen !== 'card' ||
        navigation.route.sourceId !== next.sourceId ||
        navigation.route.language !== next.language
      )
        return;
      const same = route?.language === next.language && route?.sourceId === next.sourceId;
      route = next;
      message = '';
      messageError = false;
      draft = undefined;
      const current = ++loading;
      shell.title('Card details');
      if (!same) {
        record = null;
        screen.innerHTML = '<p class="library-empty" role="status">Loading card…</p>';
      }
      try {
        const result = await getCard(next.language, next.sourceId);
        if (current !== loading || navigation.route.screen !== 'card') return;
        record = result;
        selected = cardVariant(next.variant, record.card);
        render();
        if (record.saved) void cardPrice.load(selected);
      } catch (error) {
        if (current === loading) {
          screen.innerHTML = `<p class="error-message" role="status">${escape(error.message)}</p><button id="detail-retry" class="primary-button">Try again</button>`;
          screen.querySelector('button').onclick = () => void this.show(next);
        }
      }
    },
    update() {
      if (!busy) render();
    },
    leave() {
      historyControls.close();
      loading++;
      if (zoom.open) zoom.close();
    },
  };
  function cardVariant(id, card) {
    return card.variants.some((v) => v.id === id)
      ? id
      : card.variants.find((v) => getInventory()[v.id]?.quantity || getInventory()[v.id]?.wanted)
          ?.id ||
          card.variants.find((v) => hasHistory(getInventory()[v.id]))?.id ||
          card.variants[0].id;
  }
}
