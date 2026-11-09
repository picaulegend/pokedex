import { openAccount, syncNow } from './helpers.js';
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const origin = 'http://127.0.0.1:8788';
const friend = { 'X-Carddex-Dev-Email': 'friend@example.test' };

async function accountHeaders(request, headers = {}) {
  const response = await request.get('/api/session', { headers });
  expect(response.ok()).toBeTruthy();
  return { ...headers, 'X-Carddex-Account': (await response.json()).user.id };
}

async function row(request, id, headers = {}) {
  const response = await request.get('/api/pokedex', {
    headers: await accountHeaders(request, headers),
  });
  expect(response.ok()).toBeTruthy();
  return (
    (await response.json()).progress.find((item) => item.pokemonId === id) || {
      pokemonId: id,
      owned: false,
      revision: 0,
    }
  );
}

async function change(request, id, owned, headers = {}) {
  const current = await row(request, id, headers);
  const data = { owned, baseRevision: current.revision, mutationId: randomUUID() };
  const response = await request.put(`/api/pokedex/${id}`, {
    headers: { Origin: origin, ...(await accountHeaders(request, headers)) },
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return { data, body: await response.json() };
}

test('accounts have separate progress; an uninvited user is refused', async ({ request }) => {
  const owner = await (await request.get('/api/session')).json();
  const member = await (await request.get('/api/session', { headers: friend })).json();
  expect(owner.user.role).toBe('admin');
  expect(member.user.role).toBe('member');
  expect(owner.user.id).not.toBe(member.user.id);
  await change(request, 1000, false, friend);
  await change(request, 1000, true);
  const result = await request.get(`/api/pokedex?user_id=${owner.user.id}`, {
    headers: await accountHeaders(request, friend),
  });
  expect((await result.json()).progress.find((item) => item.pokemonId === 1000)?.owned).toBe(false);
  expect(
    (
      await request.get('/api/pokedex', {
        headers: { 'X-Carddex-Dev-Email': 'stranger@example.test' },
      })
    ).status(),
  ).toBe(403);
});

test('retries apply once; reused IDs and stale revisions do not overwrite progress', async ({
  request,
}) => {
  const first = await change(request, 1001, true);
  const headers = { Origin: origin, ...(await accountHeaders(request)) };
  const retry = await request.put('/api/pokedex/1001', { headers, data: first.data });
  expect((await retry.json()).state.revision).toBe(first.body.state.revision);
  const before = await row(request, 1002);
  const reused = await request.put('/api/pokedex/1002', { headers, data: first.data });
  expect(reused.status()).toBe(409);
  expect(await row(request, 1002)).toEqual(before);
  const stale = await request.put('/api/pokedex/1001', {
    headers,
    data: { ...first.data, owned: false, mutationId: randomUUID() },
  });
  expect(stale.status()).toBe(409);
  expect((await row(request, 1001)).owned).toBe(true);
});

test('rejects cross-origin changes, invalid values, and account overrides', async ({ request }) => {
  const data = { owned: true, baseRevision: 0, mutationId: randomUUID() };
  const headers = { Origin: origin, ...(await accountHeaders(request)) };
  expect((await request.put('/api/pokedex/1026', { headers, data })).status()).toBe(400);
  expect(
    (
      await request.put('/api/pokedex/1003', {
        headers: { ...headers, Origin: 'https://other.example' },
        data,
      })
    ).status(),
  ).toBe(403);
  expect(
    (await request.put('/api/pokedex/1003', { headers, data: { ...data, owned: 'yes' } })).status(),
  ).toBe(400);
  expect(
    (
      await request.put('/api/pokedex/1003', { headers, data: { ...data, userId: 'someone-else' } })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.put('/api/pokedex/1003', {
        headers,
        data: { ...data, mutationId: '-'.repeat(36) },
      })
    ).status(),
  ).toBe(400);
});

test('phone and desktop share progress, keep offline changes, and export a standalone copy', async ({
  browser,
  request,
}) => {
  await change(request, 1, false);
  await change(request, 4, false);
  const desktop = await browser.newContext();
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const page = await desktop.newPage();
  await page.goto('/');
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /private Pokémon card collection/,
  );
  await page.locator('[data-id="1"]').check();
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  const phone = await mobile.newPage();
  await phone.goto('/');
  await expect(phone.locator('[data-id="1"]')).toBeChecked();
  await desktop.setOffline(true);
  await page.locator('[data-id="4"]').check();
  await expect(page.locator('#cloud-status')).toContainText('Pending changes stay on this device.');
  await desktop.setOffline(false);
  await syncNow(page);
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  await syncNow(phone);
  await expect(phone.locator('[data-id="4"]')).toBeChecked();
  await openAccount(page);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#app-checklist').click();
  const download = await downloadPromise;
  const html = await readFile(await download.path(), 'utf8');
  expect(html).not.toContain('id="cloud-mode"');
  expect(html).not.toMatch(/<script[^>]+data-cloud-client/);
  expect(html).not.toContain('data-standalone-description');
  expect(html).not.toContain('data-standalone-title');
  expect(html).toContain('<title>Collect — My Pokémon card checklist</title>');
  expect(html).not.toContain('class="cloud-app"');
  expect(html).not.toContain('id="app-header"');
  expect(html).toContain('An offline Pokémon card checklist');
  const offline = await desktop.newPage();
  await offline.route('**/*', (route) => route.abort());
  await offline.setContent(html, { waitUntil: 'domcontentloaded' });
  await expect(offline.locator('[data-id="1"]')).toBeChecked();
  await expect(offline.locator('[data-id="4"]')).toBeChecked();
  await expect(offline.locator('[data-id="7"]')).toBeEnabled();
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: false });
  await phone.screenshot({ path: 'test-results/phone.png', fullPage: false });
  await desktop.close();
  await mobile.close();
});

test('old browser checkmarks need an explicit import', async ({ page, request }) => {
  await change(request, 2, false);
  await page.addInitScript(() =>
    localStorage.setItem(
      'carddex.national.collection.v1',
      JSON.stringify({
        app: 'carddex',
        version: 1,
        owned: [2],
        updatedAt: new Date().toISOString(),
      }),
    ),
  );
  await page.goto('/');
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  await expect(page.locator('[data-id="2"]')).not.toBeChecked();
  await openAccount(page);
  await page.locator('#cloud-import').click();
  await page.locator('#account-close').click();
  await expect(page.locator('[data-id="2"]')).toBeChecked();
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  expect((await row(request, 2)).owned).toBe(true);
});

test('a stale offline edit needs a choice; pending edits survive a page reload', async ({
  browser,
  request,
}) => {
  await change(request, 5, false);
  await change(request, 7, false);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  await context.setOffline(true);
  await page.locator('[data-id="5"]').check();
  await expect(page.locator('#cloud-status')).toContainText('Pending changes stay on this device.');
  await change(request, 5, true);
  await change(request, 5, false);
  await context.setOffline(false);
  await syncNow(page);
  await openAccount(page);
  await expect(page.locator('#cloud-conflicts')).toBeVisible();
  await page.locator('#cloud-conflicts').click();
  await expect(page.locator('#cloud-review')).toBeVisible();
  await page.getByRole('button', { name: 'Use online record' }).click();
  await expect(page.locator('[data-id="5"]')).not.toBeChecked();
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  await page.route('**/api/pokedex/7', (route) => route.abort());
  await page.locator('[data-id="7"]').check();
  await expect(page.locator('#cloud-status')).toContainText('Pending changes stay on this device.');
  await page.reload();
  await expect(page.locator('[data-id="7"]')).toBeChecked();
  expect((await row(request, 7)).owned).toBe(false);
  await page.unroute('**/api/pokedex/7');
  await syncNow(page);
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  expect((await row(request, 7)).owned).toBe(true);
  await context.setExtraHTTPHeaders(friend);
  await page.reload();
  await expect(page.locator('#cloud-account')).toContainText('friend@example.test');
  await expect(page.locator('[data-id="7"]')).not.toBeChecked();
  await context.close();
});

test('switching accounts cannot send pending changes to another person', async ({
  browser,
  request,
}) => {
  await change(request, 8, false);
  await change(request, 8, false, friend);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  await context.setOffline(true);
  await page.locator('[data-id="8"]').check();
  await expect(page.locator('#cloud-status')).toContainText('Pending changes stay on this device.');
  await context.setExtraHTTPHeaders(friend);
  await context.setOffline(false);
  await syncNow(page);
  await expect(page.locator('#cloud-status')).toContainText('The account changed.');
  expect((await row(request, 8, friend)).owned).toBe(false);
  await page.reload();
  await expect(page.locator('#cloud-account')).toContainText('friend@example.test');
  await expect(page.locator('[data-id="8"]')).not.toBeChecked();
  await context.setExtraHTTPHeaders({});
  await page.reload();
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  expect((await row(request, 8)).owned).toBe(true);
  expect((await row(request, 8, friend)).owned).toBe(false);
  await context.close();
});
