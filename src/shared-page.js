import { escape, imageUrl, variantName, languageName } from './client/ui.js';

const documentHead = (title, description, image) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#233a34"><meta name="color-scheme" content="light"><meta name="application-name" content="Collect"><meta property="og:site_name" content="Collect"><link rel="icon" href="/s/assets/favicon.ico" sizes="16x16 32x32 48x48"><link rel="icon" href="/s/assets/favicon.svg" type="image/svg+xml" sizes="any"><link rel="apple-touch-icon" href="/s/assets/apple-touch-icon.png" sizes="180x180"><title>${escape(title)} · Collect</title><meta name="description" content="${escape(description)}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:type" content="website">${image ? `<meta property="og:image" content="${escape(image)}">` : ''}<link rel="stylesheet" href="/s/assets/share.css"><script defer src="/s/assets/share.js"></script></head>`;
export function renderSharedPage(page, url, options = {}) {
  const summary =
    page.scope === 'collection'
      ? `${page.owned} of ${page.total} ${page.total === 1 ? 'card' : 'cards'} owned`
      : `${page.total} wanted ${page.total === 1 ? 'card' : 'cards'}`;
  const base = options.preview ? '/api/shares/preview' : url.pathname.replace(/\/data$/, '');
  const parameters = {
    ...(options.preview ? { ...options.target, account: options.account } : {}),
    ...page.filters,
  };
  const link = (overrides) => `${base}?${new URLSearchParams({ ...parameters, ...overrides })}`;
  const picture = (card) => {
    const image = imageUrl(card);
    return image
      ? `<img src="${escape(image)}" alt="${escape(card.name)} — ${escape(card.setName)}" width="245" height="342" loading="lazy" referrerpolicy="no-referrer">`
      : '<span class="no-image">Image unavailable</span>';
  };
  return `${documentHead(page.title, summary, page.cards[0] && imageUrl(page.cards[0], 'high'))}<body><header class="share-header"><a href="${escape(base)}${options.preview ? `?${escape(new URLSearchParams(options.target))}&amp;account=${escape(options.account)}` : ''}" class="brand"><img src="/s/assets/favicon.svg" width="30" height="30" alt="">Collect</a><span>Shared ${page.scope === 'collection' ? 'collection' : 'wishlist'}</span></header><main>
    ${options.preview ? '<p class="preview-banner">Private preview. This address is only for your signed-in account.</p>' : ''}
    <section class="share-intro"><h1>${escape(page.title)}</h1><p class="summary">${escape(summary)}</p>${page.scope === 'collection' ? `<progress value="${page.owned}" max="${page.total || 1}" aria-label="Collection progress"></progress>` : ''}<p class="live-note">Read-only. Refresh the page to see the latest changes.</p></section>
    <details class="filters"><summary>Filter cards${page.filters.search || page.filters.language || page.filters.status ? ' · Active' : ''}</summary><form action="${escape(base)}" method="get">${
      options.preview
        ? Object.entries({ ...options.target, account: options.account })
            .map(
              ([key, value]) =>
                `<input type="hidden" name="${escape(key)}" value="${escape(value)}">`,
            )
            .join('')
        : ''
    }<label>Find a card<input type="search" name="search" maxlength="100" value="${escape(page.filters.search)}" placeholder="Card name, set, or number"></label><label>Language<select name="language"><option value="">All languages</option><option value="en" ${page.filters.language === 'en' ? 'selected' : ''}>English</option><option value="ja" ${page.filters.language === 'ja' ? 'selected' : ''}>Japanese</option></select></label>${page.scope === 'collection' ? `<label>Show<select name="status"><option value="">All cards</option><option value="owned" ${page.filters.status === 'owned' ? 'selected' : ''}>Owned</option><option value="missing" ${page.filters.status === 'missing' ? 'selected' : ''}>Not owned</option></select></label>` : ''}<div class="form-actions"><button type="submit">Apply filters</button><a href="${escape(link({ page: 1, language: '', status: '', search: '' }))}" class="secondary">Clear filters</a></div></form></details>
    <p class="result-count">${page.matches} ${page.matches === 1 ? 'card' : 'cards'}${page.matches !== page.total ? ' match these filters' : ''} · Page ${page.page}</p>
    <section class="gallery" aria-label="Shared cards">${page.cards.map((card, index) => `<article class="card"><button class="card-image" data-enlarge="${escape(imageUrl(card, 'high') || '')}" data-title="${escape(card.name)}" aria-label="Enlarge ${escape(card.name)} card image" ${!imageUrl(card) ? 'disabled' : ''}>${picture(card)}</button><div class="card-info"><h2>${escape(card.name)}</h2><p>${escape(card.setName)}</p><p>${escape(card.number)}${card.officialCount ? `/${card.officialCount}` : ''} · ${languageName(card.language)}</p><p class="finish">${escape(variantName(card.finish))}</p>${page.scope === 'collection' && card.owned ? '<span class="badge owned">Owned</span>' : ''}<details class="reference"><summary>Card details</summary><p>${escape(card.sourceId)}</p><p>Artist: ${escape(card.artist || 'Not recorded')}</p></details></div></article>`).join('') || `<div class="empty"><h2>${page.total ? 'No cards match these filters' : page.scope === 'wishlist' ? 'No wanted cards right now' : 'No cards in this collection yet'}</h2><p>${page.total ? 'Try another filter.' : 'Check this page again after the collection is updated.'}</p></div>`}</section>
    <nav class="pagination" aria-label="Card pages">${page.page > 1 ? `<a class="secondary" href="${escape(link({ page: page.page - 1 }))}">Previous</a>` : ''}${page.hasMore ? `<a class="secondary" href="${escape(link({ page: page.page + 1 }))}">Next</a>` : ''}</nav>
    <footer>Read-only sharing by Collect. Card data: <a href="https://tcgdex.dev/" rel="noreferrer noopener" target="_blank">TCGdex</a> · <a href="/s/assets/TCGdex-LICENSE.txt" rel="noreferrer noopener" target="_blank">MIT licence</a>. Pokémon artwork belongs to its rights holders.</footer></main><dialog id="image-viewer" aria-label="Card image"><button id="close-image" aria-label="Close card image"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button><img id="large-image" alt="" referrerpolicy="no-referrer"></dialog></body></html>`;
}
export function renderUnavailablePage(status) {
  const heading =
    status === 404
      ? 'This shared page is unavailable'
      : status === 400
        ? 'Check the page filters'
        : 'This page could not be loaded';
  return `${documentHead('Shared page unavailable', heading)}<body><header class="share-header"><span class="brand"><img src="/s/assets/favicon.svg" width="30" height="30" alt="">Collect</span></header><main class="empty"><h1>${heading}</h1><p>${status === 404 ? 'The link may have been turned off or replaced. Ask the owner for a current link.' : status === 400 ? 'Use the original link or choose other filters.' : 'Please try again later.'}</p></main></body></html>`;
}
