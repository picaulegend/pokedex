import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { openAccount, syncNow } from './helpers.js';
import {
  emptyHistory,
  removeCopies,
  validateHistory,
} from '../../src/client/card-history-model.js';

const origin = 'http://127.0.0.1:8788';
const friend = { 'X-Carddex-Dev-Email': 'friend@example.test' };
let card,
  variant,
  shared = false;
async function headers(request, extra = {}) {
  const { user } = await (await request.get('/api/session', { headers: extra })).json();
  return { Origin: origin, ...extra, 'X-Carddex-Account': user.id };
}
async function state(request, extra = {}) {
  return (
    await (await request.get('/api/sync', { headers: await headers(request, extra) })).json()
  ).inventory.find((row) => row.variantId === variant);
}
async function save(request, data, extra = {}) {
  const previous = await state(request, extra);
  const result = await request.put(`/api/inventory/${variant}`, {
    headers: await headers(request, extra),
    data: { ...data, baseRevision: previous?.revision || 0, mutationId: randomUUID() },
  });
  expect(result.ok(), await result.text()).toBe(true);
  return (await result.json()).state;
}
const cardUrl = () =>
  `/#/card?${new URLSearchParams({ language: 'en', sourceId: 'sv03.5-166', variant })}`;
const purchase = () => ({
  id: randomUUID(),
  method: 'bought',
  quantity: 1,
  date: '2026-11-01',
  source: 'Private card shop',
  amount: '12.50',
  currency: 'EUR',
  notes: 'Private purchase note',
});

test.beforeEach(async ({ request }) => {
  const result = await request.get('/api/catalogue?pokemon=1', { headers: await headers(request) });
  card = (await result.json()).cards.find((item) => item.sourceId === 'sv03.5-166');
  variant = card.variants[0].id;
  await save(request, { quantity: 1, wanted: false, history: emptyHistory(), historyChoice: true });
});
test.afterEach(async ({ request }) => {
  for (const extra of [{}, friend])
    await save(
      request,
      { quantity: 0, wanted: false, history: emptyHistory(), historyChoice: true },
      extra,
    );
  if (shared) {
    const current = await (
      await request.get('/api/shares?scope=wishlist', { headers: await headers(request) })
    ).json();
    await request.put('/api/shares', {
      headers: await headers(request),
      data: {
        scope: 'wishlist',
        targetId: '',
        enabled: false,
        baseRevision: current.share.revision,
      },
    });
    shared = false;
  }
});

test('purchase and sale details survive reload and the previously owned gallery filter', async ({
  page,
  request,
}) => {
  await page.goto(cardUrl());
  await expect(page.locator('#detail-quantity')).toHaveValue('1');
  await page.evaluate(() => {
    window.historyArt = document.querySelector('#detail-image img');
  });
  await page.locator('#history-describe').click();
  await page.locator('#entry-date').fill('2026-11-01');
  await page.locator('#entry-source').fill('Private card shop');
  await page.locator('#entry-price').fill('12.50');
  await page.locator('#entry-notes').fill('Private purchase note');
  await page.locator('#save-entry').click();
  await expect(page.locator('#entry-dialog')).not.toBeVisible();
  await expect(page.locator('#detail-quantity')).toHaveValue('1');
  await expect.poll(async () => (await state(request)).history.entries.length).toBe(1);
  expect(
    await page.evaluate(() => historyArt === document.querySelector('#detail-image img')),
  ).toBe(true);
  await page.locator('#detail-minus').click();
  await page.locator('#removal-reason').selectOption('sold');
  await page.locator('#removal-date').fill('2026-11-05');
  await page.locator('#removal-person').fill('Private buyer');
  await page.locator('#removal-price').fill('18.00');
  await page.locator('#save-removal').click();
  await expect(page.locator('#removal-dialog')).not.toBeVisible();
  await expect(page.locator('#detail-quantity')).toHaveValue('0');
  await expect.poll(async () => (await state(request)).history.changes.length).toBe(1);
  await page.reload();
  await expect(page.locator('#card-history')).toContainText('Private card shop');
  await expect(page.locator('#card-history')).toContainText('Private buyer');
  await expect(page.locator('#card-history')).toContainText('€12.50');
  await expect(page.locator('#card-history')).toContainText('€18.00 received');
  await page.screenshot({ path: 'test-results/card-history-desktop.png', fullPage: false });
  await page.goto('/#/pokemon?pokemon=1');
  await expect(page.locator('#library-title')).toHaveText('Bulbasaur');
  await page.locator('#library-filter-toggle').click();
  await page.locator('#collection-status').selectOption('past');
  const tile = page.locator('[data-open-card="en:sv03.5-166"]');
  await expect(tile).toBeVisible();
  await expect(tile).toContainText('Previously owned');
  await page.locator('#collection-status').selectOption('owned');
  await expect(tile).toHaveCount(0);
});

test('an accidental owned copy can be removed and its history deleted', async ({
  page,
  request,
}) => {
  await save(request, { quantity: 0, wanted: true, history: emptyHistory(), historyChoice: true });
  await page.goto(cardUrl());
  await expect(page.locator('#detail-quantity')).toHaveValue('0');
  await page.locator('#detail-add-copy').click();
  await page.locator('#detail-plus').click();
  await page.locator('#save-entry').click();
  await expect(page.locator('#detail-quantity')).toHaveValue('1');
  await page.locator('#detail-minus').click();
  await page.getByRole('button', { name: 'Remove from owned', exact: true }).click();
  await expect(page.locator('#card-history')).toContainText('Previously owned');
  await page.getByRole('button', { name: 'Edit details not recorded entry' }).click();
  const deleteEntry = page.getByRole('button', { name: 'Delete entry', exact: true });
  page.once('dialog', (dialog) => dialog.dismiss());
  await deleteEntry.click();
  await expect(deleteEntry).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await deleteEntry.click();
  await expect(page.locator('#detail-message')).toHaveText('History entry deleted.');
  await expect
    .poll(() => state(request))
    .toMatchObject({
      quantity: 0,
      wanted: true,
      history: emptyHistory(),
    });
  await page.reload();
  await expect(page.locator('#detail-quantity')).toHaveValue('0');
  await expect(
    page.getByRole('button', { name: 'Remove from wishlist', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#card-history')).toHaveCount(0);
});

test('offline history stays queued and later edits keep the count and private details', async ({
  page,
  context,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(cardUrl());
  await expect(page.locator('#detail-quantity')).toHaveValue('1');
  await context.setOffline(true);
  await page.locator('#history-describe').click();
  await page.locator('#entry-form').getByLabel('Gift', { exact: true }).check();
  await page.locator('#entry-source').fill('A friend');
  await page.locator('#save-entry').click();
  await expect(page.locator('#entry-dialog')).not.toBeVisible();
  await expect(page.locator('#card-history')).toContainText('A friend');
  await expect(page.locator('#cloud-status')).toContainText('Pending changes stay on this device');
  await context.setOffline(false);
  await syncNow(page);
  await expect.poll(async () => (await state(request)).history.entries[0]?.source).toBe('A friend');
  await page.reload();
  await page.locator('[data-history-edit]').click();
  await page.locator('#entry-notes').fill('Birthday gift');
  await page.locator('#save-entry').click();
  await expect(page.locator('#detail-quantity')).toHaveValue('1');
  await expect
    .poll(async () => (await state(request)).history.entries[0]?.notes)
    .toBe('Birthday gift');
  expect(
    await page.locator('#card-detail').evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/card-history-phone.png', fullPage: false });
});

test('history backups retain zero-owned cards and restoring an older backup does not revive them', async ({
  page,
  request,
  context,
}) => {
  const entry = purchase();
  const original = {
    quantity: 1,
    wanted: false,
    history: validateHistory({ entries: [entry], changes: [], plan: null }, 1),
  };
  const archived = removeCopies(
    original,
    [{ entryId: entry.id, quantity: 1 }],
    { reason: 'given', date: '', person: 'A friend', amount: '', currency: 'EUR', notes: '' },
    randomUUID(),
  );
  await save(request, archived);
  await page.goto(cardUrl());
  await expect(page.locator('#card-history')).toContainText('Given away');
  await openAccount(page);
  const download = page.waitForEvent('download');
  await page.locator('#app-backup').click();
  const backup = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  expect(backup.version).toBe(3);
  expect(backup.inventory.find((row) => row.variantId === variant)).toMatchObject({
    quantity: 0,
    history: { entries: [expect.objectContaining({ id: entry.id })] },
  });
  expect(JSON.stringify(backup)).not.toContain('share_links');
  const older = { ...backup, inventory: [{ variantId: variant, ...original }] };
  await page.locator('#import-file').setInputFiles({
    name: 'older-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(older)),
  });
  await page.locator('#restore-review-confirm').click();
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  expect((await state(request)).quantity).toBe(0);
  expect((await state(request)).history.changes).toHaveLength(1);
  await context.setExtraHTTPHeaders(friend);
  await page.reload();
  await expect(page.locator('#cloud-account')).toContainText('friend@example.test');
  await page.locator('#import-file').setInputFiles({
    name: 'history-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.locator('#restore-review-confirm').click();
  await expect.poll(async () => (await state(request, friend))?.history.changes.length).toBe(1);
  expect((await state(request, friend)).quantity).toBe(0);
});

test('wishlist notes and past ownership details never appear on public links', async ({
  page,
  request,
}) => {
  const entry = purchase();
  await save(request, {
    quantity: 1,
    wanted: true,
    history: validateHistory({ entries: [entry], changes: [], plan: null }, 1),
  });
  await page.goto(cardUrl());
  await page.locator('#history-plan-edit').click();
  await page.locator('#plan-amount').fill('25.00');
  await page.locator('#plan-shop').fill('Private seller');
  await page.locator('#plan-notes').fill('Private shopping note');
  await page.locator('#history-plan-form [type="submit"]').click();
  await expect.poll(async () => (await state(request)).history.plan?.shop).toBe('Private seller');
  const h = await headers(request);
  const current = await (await request.get('/api/shares?scope=wishlist', { headers: h })).json();
  const response = await request.put('/api/shares', {
    headers: h,
    data: { scope: 'wishlist', targetId: '', enabled: true, baseRevision: current.share.revision },
  });
  expect(response.ok(), await response.text()).toBe(true);
  shared = true;
  const link = (await response.json()).share.url;
  for (const path of [link, `${link}/data`]) {
    const text = await (await request.get(path)).text();
    for (const secret of [
      'Private card shop',
      'Private purchase note',
      'Private seller',
      'Private shopping note',
      '12.50',
      '25.00',
      'history',
    ])
      expect(text).not.toContain(secret);
  }
});

test('two offline versions require a choice before either history can replace the other', async ({
  page,
  context,
  request,
}) => {
  const entry = purchase();
  const original = {
    quantity: 1,
    wanted: false,
    history: validateHistory({ entries: [entry], changes: [], plan: null }, 1),
  };
  await save(request, original);
  await page.goto(cardUrl());
  await expect(page.locator('#detail-quantity')).toHaveValue('1');
  await context.setOffline(true);
  await page.locator('#detail-minus').click();
  await page.locator('#removal-reason').selectOption('given');
  await page.locator('#removal-person').fill('Local gift recipient');
  await page.locator('#save-removal').click();
  await expect(page.locator('#removal-dialog')).not.toBeVisible();
  await expect(page.locator('#cloud-status')).toContainText('Pending changes stay on this device');
  await page.route('**/api/inventory/*', (route) => route.abort());
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator('#cloud-status')).toContainText('Pending changes stay on this device');
  await save(
    request,
    removeCopies(
      original,
      [{ entryId: entry.id, quantity: 1 }],
      {
        reason: 'sold',
        date: '',
        person: 'Online buyer',
        amount: '15',
        currency: 'EUR',
        notes: '',
      },
      randomUUID(),
    ),
  );
  await page.unroute('**/api/inventory/*');
  await syncNow(page);
  await openAccount(page);
  await page.locator('#cloud-conflicts').click();
  await expect(page.locator('#cloud-review-items')).toContainText('1 past copies');
  expect((await state(request)).history.changes[0].reason).toBe('sold');
  await page.getByRole('button', { name: 'Keep this device', exact: true }).click();
  await expect.poll(async () => (await state(request)).history.changes[0].reason).toBe('given');
  expect((await state(request)).history.entries[0].source).toBe('Private card shop');
  expect((await state(request)).quantity).toBe(0);
});

test('long histories start small and filters still include every saved entry', async ({
  page,
  request,
}) => {
  const entries = Array.from({ length: 9 }, (_, index) => ({
    ...purchase(),
    quantity: index ? 1 : 30,
    date: index ? '2026-10-01' : '2026-11-01',
    notes: `Entry ${index}`,
  }));
  const changes = Array.from({ length: 22 }, () => ({
    id: randomUUID(),
    quantity: 1,
    allocations: [{ entryId: entries[0].id, quantity: 1 }],
    reason: 'given',
    date: '',
    person: 'Card club',
    amount: '',
    currency: 'EUR',
    notes: '',
  }));
  changes.push({
    ...changes[0],
    id: randomUUID(),
    allocations: [{ entryId: entries[8].id, quantity: 1 }],
  });
  await save(request, {
    quantity: 15,
    wanted: false,
    history: validateHistory({ entries, changes, plan: null }, 15),
  });
  await page.goto(cardUrl());
  await expect(page.locator('.history-entry')).toHaveCount(6);
  await expect(page.locator('.history-change')).toHaveCount(6);
  await page.evaluate(() => {
    window.firstHistoryEntry = document.querySelector('.history-entry');
  });
  await page.locator('[data-history-expand]').click();
  await expect(page.locator('.history-entry')).toHaveCount(9);
  expect(
    await page.evaluate(() => firstHistoryEntry === document.querySelector('.history-entry')),
  ).toBe(true);
  await page.locator('[data-history-filter="past"]').click();
  await expect(page.locator('.history-entry')).toHaveCount(2);
  await expect(page.locator(`#history-entry-${entries[8].id}`)).toBeVisible();
});
