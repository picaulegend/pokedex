import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function account(request) {
  const { user } = await (await request.get('/api/session')).json();
  return { Origin: 'http://127.0.0.1:8788', 'X-Carddex-Account': user.id };
}
async function state(request) {
  return (await request.get('/api/sync', { headers: await account(request) })).json();
}

test('phone navigation leaves room for Pokémon and works at narrow widths', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-save-state')).toHaveText('Saved');
  for (const width of [320, 360, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await page.locator('.pokemon-card').first().boundingBox()).y).toBeLessThan(420);
    expect(
      (await page.locator('.species-check').first().boundingBox()).width,
    ).toBeGreaterThanOrEqual(44);
    await expect(page.locator('#open-pokedex')).toHaveAttribute('aria-current', 'page');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/redesign-pokedex-phone.png' });
});

test('Back returns through search and the set picker without stacked dialogs or lost input', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#app-save-state')).toHaveText('Saved');
  await page.getByRole('button', { name: 'View cards for Bulbasaur', exact: true }).click();
  await page.locator('#library-add').click();
  await page.locator('#card-search-name').fill('Bulbasaur');
  await page.locator('#search-by-number > summary').click();
  await page.locator('#choose-search-set').click();
  await expect(page.locator('#set-picker')).toBeVisible();
  expect(await page.locator('dialog[open]').count()).toBe(0);
  await page.goBack();
  await expect(page.locator('#card-search')).toBeVisible();
  await expect(page.locator('#card-search-name')).toHaveValue('Bulbasaur');
  await page.reload();
  await expect(page.locator('#card-search')).toBeVisible();
  await expect(page.locator('#app-save-state')).toHaveText('Saved');
  await page.goBack();
  await expect(page.locator('#library-title')).toHaveText('Bulbasaur');
  await expect(page.locator('#card-library')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#main')).toBeVisible();
  await page.locator('.skip').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#collection')).toBeFocused();
});

test('filter edits return to saved cards and failed TCGdex searches offer a working retry', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#app-save-state')).toHaveText('Saved');
  await page.locator('#open-card-search').click();
  await page.locator('#card-search-name').fill('Bulbasaur');
  await page.locator('#search-external').click();
  await expect(page.locator('#search-scope')).toHaveText('TCGdex results');
  await expect(page.locator('.search-card').first()).toContainText('Bulbasaur');
  await page.locator('#card-search-name').fill('Squirtle');
  await expect(page.locator('#search-scope')).toHaveText('Saved cards');
  await expect(page.locator('.search-card').filter({ hasText: 'Bulbasaur' })).toHaveCount(0);
  await page.route('**/api/cards/search?**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'External card search is unavailable.' }),
    }),
  );
  await page.locator('#search-external').click();
  await expect(page.locator('#search-retry')).toBeVisible();
  await expect(page.locator('.search-card')).toHaveCount(0);
  await page.unroute('**/api/cards/search?**');
  await page.locator('#search-retry').click();
  await expect(page.locator('.search-card')).toContainText(['Squirtle']);
});

test('a card can be added directly to a collection goal without an unwanted ownership flag', async ({
  page,
  request,
}) => {
  const id = randomUUID(),
    name = 'Illustration goal';
  const response = await request.put(`/api/collections/${id}`, {
    headers: await account(request),
    data: { name, deleted: false, variantIds: [], baseRevision: 0, mutationId: randomUUID() },
  });
  expect(response.ok()).toBe(true);
  await page.goto('/');
  await expect(page.locator('#app-save-state')).toHaveText('Saved');
  await page.locator('#open-collections').click();
  await page.locator(`[data-open-collection="${id}"]`).click();
  await page.locator('#library-add').click();
  await page.locator('#card-search-name').fill('Arcanine');
  await page.locator('#search-external').click();
  await page.locator('.search-card[data-source-id="sv03.5-059"]').locator('[data-preview]').click();
  const calls = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/'))
      calls.push({ method: request.method(), path: new URL(request.url()).pathname });
  });
  await expect(page.locator('#detail-add-goal')).toBeVisible();
  await page.evaluate(() => {
    window.savedDetailImage = document.querySelector('#detail-image img');
    window.savedGoalButton = document.querySelector('#detail-add-goal');
  });
  await page.locator('#detail-add-goal').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#detail-message')).toContainText(`Added to ${name}`);
  await expect(page.locator('#detail-add-goal')).toHaveText(`In ${name}`);
  await expect(page.locator('#detail-add-goal')).toBeFocused();
  expect(
    await page.evaluate(() => ({
      imageRetained: savedDetailImage === document.querySelector('#detail-image img'),
      buttonRetained: savedGoalButton === document.querySelector('#detail-add-goal'),
    })),
  ).toEqual({ imageRetained: true, buttonRetained: true });
  expect(calls).toEqual([{ method: 'POST', path: '/api/cards/add' }]);
  const selected = await page.locator('#detail-finish').inputValue();
  await expect
    .poll(async () => (await state(request)).collections.find((c) => c.id === id)?.variantIds)
    .toContain(selected);
  await expect
    .poll(async () =>
      Boolean((await state(request)).inventory.find((r) => r.variantId === selected)?.wanted),
    )
    .toBe(false);
  await page.locator('#detail-plus').click();
  await expect(page.locator('#detail-message')).toContainText('saved as owned');
  await page.locator('#open-collections').click();
  await page.locator(`[data-open-collection="${id}"]`).click();
  await expect(page.locator('#library-summary')).toHaveText('1 / 1 owned');
});

test('wanted edits keep keyboard focus and show offline save status in card details', async ({
  page,
  context,
}) => {
  await page.goto('/#/card?language=en&sourceId=sv03.5-001');
  await expect(page.locator('#detail-title')).toHaveText('Bulbasaur');
  await expect(page.locator('#app-save-state')).toHaveText('Saved');
  await page.locator('#detail-want').focus();
  await page.locator('#detail-reference > summary').click();
  await page.evaluate(() => {
    window.savedDetailImage = document.querySelector('#detail-image img');
    window.savedQuantity = document.querySelector('#detail-quantity');
  });
  await page.locator('#detail-want').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#detail-want')).toBeFocused();
  await expect(page.locator('#detail-message')).not.toBeEmpty();
  await expect(page.locator('#detail-reference')).toHaveAttribute('open', '');
  expect(
    await page.evaluate(
      () =>
        savedDetailImage === document.querySelector('#detail-image img') &&
        savedQuantity === document.querySelector('#detail-quantity'),
    ),
  ).toBe(true);
  await context.setOffline(true);
  await page.locator('#detail-plus').click();
  await expect(page.locator('#app-save-state')).toHaveText('Saved on device');
  await expect(page.locator('#app-save-state')).toBeVisible();
  await context.setOffline(false);
  await page.locator('#app-save-state').click();
  await page.locator('#cloud-retry').click();
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
});

test('filter empty states keep saved cards and offer a clear reset', async ({ page, request }) => {
  const headers = await account(request);
  const catalogue = await (
    await request.get('/api/catalogue?pokemon=1&set=base1', { headers })
  ).json();
  const id = catalogue.cards[0].variants[0].id;
  const previous = (await state(request)).inventory.find((row) => row.variantId === id);
  const saved = await request.put(`/api/inventory/${id}`, {
    headers,
    data: {
      quantity: 1,
      wanted: false,
      baseRevision: previous?.revision || 0,
      mutationId: randomUUID(),
    },
  });
  expect(saved.ok()).toBe(true);
  const japanese = (
    await (await request.get('/api/catalogue?pokemon=1&language=ja', { headers })).json()
  ).cards[0].variants[0].id;
  const previousJapanese = (await state(request)).inventory.find(
    (row) => row.variantId === japanese,
  );
  const wanted = await request.put(`/api/inventory/${japanese}`, {
    headers,
    data: {
      quantity: previousJapanese?.quantity || 0,
      wanted: true,
      baseRevision: previousJapanese?.revision || 0,
      mutationId: randomUUID(),
    },
  });
  expect(wanted.ok()).toBe(true);
  await page.goto('/');
  await expect(page.locator('#app-save-state')).toHaveText('Saved');
  await page.getByRole('button', { name: 'View cards for Bulbasaur', exact: true }).click();
  await page.locator('#library-filter-panel > summary').click();
  await page.locator('#card-language').selectOption('ja');
  await page.locator('#card-set').selectOption({ label: 'Base Set' });
  await expect(page.locator('#library-content')).toContainText('No cards match these filters');
  await page.locator('#empty-clear-filters').click();
  await expect(page.locator('.tcg-card').first()).toBeVisible();
  await expect(page.locator('#card-language')).toHaveValue('');
});
