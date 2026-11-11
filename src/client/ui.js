export const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const iconPaths = {
  close: 'm6 6 12 12M18 6 6 18',
  expand: 'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6',
  heart: 'M20 5a4.5 4.5 0 0 0-6.4 0L12 6.6 10.4 5A4.5 4.5 0 0 0 4 11.4l8 8 8-8A4.5 4.5 0 0 0 20 5Z',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
};
export const icon = (name) =>
  `<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${iconPaths[name]}"/></svg>`;
export const plural = (count, word, words = `${word}s`) =>
  `${count.toLocaleString('en-US')} ${count === 1 ? word : words}`;
export const languageName = (value) => (value === 'ja' ? 'Japanese' : 'English');
export function cardTypeName({ category, trainerType, energyType }) {
  if (category === 'Pokemon') return 'Pokémon';
  if (category === 'Trainer') return trainerType ? `Trainer · ${trainerType}` : 'Trainer';
  if (category === 'Energy') return energyType ? `Energy · ${energyType}` : 'Energy';
  return '';
}
export function variantName(variant) {
  const label = (value) =>
    ({
      normal: 'Regular',
      holo: 'Holo',
      reverse: 'Reverse holo',
      'reverse-holo': 'Reverse holo',
      'set-logo': 'Set logo stamp',
      '1st-edition': 'First edition',
      standard: 'Standard',
    })[value] || value;
  return (
    [
      ...new Set(
        [
          variant.type,
          variant.subtype,
          variant.foil,
          ...(variant.stamps || []),
          variant.size !== 'standard' && variant.size,
        ]
          .filter(Boolean)
          .map(label),
      ),
    ].join(' · ') || 'Finish not recorded'
  );
}
export function imageUrl(card, quality = 'low') {
  try {
    const url = new URL(card.image);
    if (url.protocol === 'https:' && url.hostname === 'assets.tcgdex.net')
      return /\.(webp|png|jpg)$/.test(url.pathname) ? url.href : `${url.href}/${quality}.webp`;
  } catch {
    /* The card remains usable without an image. */
  }
  return null;
}
export function picture(card, quality = 'low') {
  const url = imageUrl(card);
  const preferred = quality === 'low' ? url : imageUrl(card, quality);
  return `<span class="tcg-picture">${url ? `<img src="${escape(url)}"${preferred !== url ? ` srcset="${escape(preferred)}"` : ''} alt="${escape(card.name)}${card.setName ? ` — ${escape(card.setName)}` : ''}" loading="lazy" width="245" height="342">` : '<span>Image unavailable</span>'}</span>`;
}
const failedImages = new WeakMap();
const failedImageSources = new WeakMap();
export function bindImages(root) {
  for (const image of root.querySelectorAll('img:not([data-plain-image])')) {
    const fallback = () => {
      if (image.srcset) {
        failedImageSources.set(image, image.srcset);
        image.removeAttribute('srcset');
        return;
      }
      failedImages.set(image, image.getAttribute('src'));
      image.hidden = true;
      if (!image.parentElement?.querySelector('[data-image-fallback]')) {
        const label = document.createElement('span');
        label.dataset.imageFallback = '';
        label.textContent = 'Image unavailable';
        image.after(label);
      }
    };
    image.onerror = fallback;
    if (
      failedImages.get(image) === image.getAttribute('src') ||
      (image.complete && !image.naturalWidth)
    )
      fallback();
    else {
      image.hidden = false;
      image.parentElement?.querySelector('[data-image-fallback]')?.remove();
    }
  }
}
const markup = new WeakMap();
// Keep controls and images in place when only their saved values change.
export function updateMarkup(root, html) {
  const previous = markup.get(root);
  if (
    previous?.html === html &&
    previous.first === root.firstChild &&
    previous.last === root.lastChild
  )
    return;
  const template = document.createElement('template');
  template.innerHTML = html;
  const key = (node) => node.nodeType === 1 && (node.id || node.getAttribute('data-card-id'));
  const matches = (a, b) =>
    a && a.nodeType === b.nodeType && a.nodeName === b.nodeName && key(a) === key(b);
  function patch(parent, desired) {
    const keyed = new Map([...parent.children].filter(key).map((node) => [key(node), node]));
    let cursor = parent.firstChild;
    for (const next of [...desired.childNodes]) {
      let node = key(next) ? keyed.get(key(next)) : cursor;
      if (!matches(node, next)) node = next.cloneNode(true);
      if (node !== cursor) parent.insertBefore(node, cursor);
      if (node.nodeType === 1) {
        for (const attr of [...node.attributes])
          if (
            !next.hasAttribute(attr.name) &&
            !(node.tagName === 'DETAILS' && attr.name === 'open')
          )
            node.removeAttribute(attr.name);
        for (const attr of [...next.attributes]) {
          // Keep the lower resolution image in place after the preferred image fails.
          if (attr.name === 'srcset' && failedImageSources.get(node) === attr.value) continue;
          if (node.getAttribute(attr.name) !== attr.value) node.setAttribute(attr.name, attr.value);
        }
        patch(node, next);
        if (node.tagName === 'INPUT') {
          if (node.value !== next.value) node.value = next.value;
          if (node.checked !== next.checked) node.checked = next.checked;
        }
        if (node.tagName === 'SELECT' && node.value !== next.value) node.value = next.value;
      } else if (node.nodeValue !== next.nodeValue) node.nodeValue = next.nodeValue;
      cursor = node.nextSibling;
    }
    while (cursor) {
      const next = cursor.nextSibling;
      cursor.remove();
      cursor = next;
    }
  }
  patch(root, template.content);
  markup.set(root, { html, first: root.firstChild, last: root.lastChild });
}
export function preserveFocus(root, draw) {
  const focused = document.activeElement;
  const id = root.contains(focused) ? focused.id : null;
  const openDetails = [...root.querySelectorAll('details[open][id]')].map((element) => element.id);
  const start = focused?.selectionStart,
    end = focused?.selectionEnd;
  draw();
  for (const id of openDetails) {
    const element = document.getElementById(id);
    if (element) element.open = true;
  }
  const next = id && document.getElementById(id);
  if (next && !next.disabled && next.getClientRects().length) {
    next.focus({ preventScroll: true });
    if (typeof start === 'number')
      try {
        next.setSelectionRange(start, end);
      } catch {
        /* Number inputs have no selection range. */
      }
  }
}
export const credits =
  '<footer class="library-footer">Card data: <a href="https://tcgdex.dev/" target="_blank" rel="noopener noreferrer">TCGdex</a> · <a href="/TCGdex-LICENSE.txt" target="_blank" rel="noopener noreferrer">MIT licence</a>. Pokémon artwork belongs to its rights holders.</footer>';
