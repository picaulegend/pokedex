import { test, expect } from '@playwright/test';

async function headers(request) {
  const { user } = await (await request.get('/api/session')).json();
  return { 'X-Carddex-Account': user.id };
}

test('the saved set reference includes sets with no cards and separates languages', async ({
  request,
}) => {
  const h = await headers(request);
  const before = await (await request.get('/api/sync', { headers: h })).json();
  const en = await (await request.get('/api/catalogue/sets?language=en', { headers: h })).json();
  expect(en.sets.some((s) => s.sourceId === 'swsh3' && s.name === 'Darkness Ablaze')).toBe(true);
  expect(en.sets.every((s) => s.language === 'en' && !('cards' in s))).toBe(true);
  expect(en.sets.some((s) => s.sourceId === 'A1')).toBe(false);
  const cards = await (
    await request.get('/api/catalogue?search=&set=swsh3', { headers: h })
  ).json();
  expect(cards.cards).toEqual([]);
  const ja = await (await request.get('/api/catalogue/sets?language=ja', { headers: h })).json();
  expect(ja.sets.every((s) => s.language === 'ja')).toBe(true);
  const after = await (await request.get('/api/sync', { headers: h })).json();
  expect(after.cursor).toBe(before.cursor);
});

test('sets can be picked by name or printed total without an external card search', async ({
  page,
}) => {
  let externalCalls = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/cards/search') externalCalls++;
  });
  await page.goto('/');
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  await page.locator('#open-card-search').click();
  await page.locator('#search-by-number > summary').click();
  await page.locator('#choose-search-set').click();
  await page.locator('#set-picker-query').fill('165');
  await expect(page.locator('.set-choice')).toHaveCount(1);
  await page.locator('[data-set="sv03.5"]').click();
  await expect(page.locator('#choose-search-set')).toHaveText('151');
  await expect(page.locator('#card-search-set')).toHaveValue('sv03.5');
  await page.locator('#choose-search-set').click();
  await page.locator('#set-picker-query').fill('darkness');
  await page.locator('[data-set="swsh3"]').click();
  await expect(page.locator('#choose-search-set')).toHaveText('Darkness Ablaze');
  await page.locator('#card-search-language').selectOption('ja');
  await expect(page.locator('#card-search-set')).toHaveValue('');
  await page.locator('#choose-search-set').click();
  await page.locator('#set-picker-query').fill('SV2a');
  await expect(page.locator('.set-choice')).toHaveCount(1);
  await page.locator('[data-set="SV2a"]').click();
  await expect(page.locator('#choose-search-set')).toHaveText('ポケモンカード151');
  await page.locator('#clear-search-set').click();
  await expect(page.locator('#card-search-set')).toHaveValue('');
  expect(externalCalls).toBe(0);
});

test('the phone set picker remains usable with missing images and reuses its saved list offline', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://assets.tcgdex.net/**', (route) => route.abort());
  let setRequests = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/catalogue/sets') setRequests++;
  });
  await page.goto('/');
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  await page.locator('#open-card-search').click();
  await page.locator('#search-by-number > summary').click();
  await page.locator('#choose-search-set').click();
  await expect(page.locator('.set-choice')).toHaveCount(4);
  await page.locator('#set-picker-query').fill('151');
  await expect(page.locator('[data-set="sv03.5"]')).toBeVisible();
  expect(await page.locator('#set-picker').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/set-picker-phone.png', fullPage: false });
  await page.locator('#app-back').click();
  await context.setOffline(true);
  await page.locator('#choose-search-set').click();
  await page.locator('#set-picker-query').fill('151');
  await page.locator('[data-set="sv03.5"]').click();
  await expect(page.locator('#choose-search-set')).toHaveText('151');
  expect(setRequests).toBe(1);
  await context.setOffline(false);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#choose-search-set').click();
  await page.locator('#set-picker-query').fill('');
  await page.screenshot({ path: 'test-results/set-picker-desktop.png', fullPage: false });
});
