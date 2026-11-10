import { test, expect } from '@playwright/test';

test('price checks save a separate estimate for the selected finish', async ({ page }) => {
  await page.goto('/#/card?language=ja&sourceId=SV2a-001');
  const finish = page.getByRole('combobox', { name: 'Finish', exact: true });
  const price = page.locator('#detail-price');
  const check = page.getByRole('button', { name: 'Check price' });
  await finish.selectOption({ label: 'Reverse holo · pokeball' });
  await check.click();
  await expect(price).toContainText('€1.33');
  await expect(price).toContainText('Source date');
  await expect(price.locator('time').last()).toHaveAttribute('datetime', /^\d{4}-/);
  await expect(price).toContainText('Last checked');

  await page.reload();
  await expect(price).toContainText('€1.33');
  await finish.selectOption({ label: 'Reverse holo · masterball' });
  await expect(price).not.toContainText('€1.33');
  await check.click();
  await expect(price).toContainText('€30.00');
  await finish.selectOption({ label: 'Reverse holo · pokeball' });
  await expect(price).toContainText('€1.33');
});

test('ambiguous prices offer a sold search and preview prices stay temporary', async ({ page }) => {
  await page.goto('/#/card?language=en&sourceId=base1-44');
  const finish = page.getByRole('combobox', { name: 'Finish', exact: true });
  await finish.selectOption({
    label: 'Regular · shadowless · First edition',
  });
  const price = page.locator('#detail-price');
  const check = page.getByRole('button', { name: 'Check price' });
  await check.click();
  await expect(price).toContainText('No estimate for this finish.');
  const sold = price.getByRole('link', { name: 'Search eBay sold listings' });
  await expect(sold).toBeVisible();
  const url = new URL(await sold.getAttribute('href'));
  expect(url.searchParams.get('_nkw')).toContain('Bulbasaur Base Set 44 English');
  expect(url.searchParams.get('_nkw')).toContain('First edition');
  expect(url.searchParams.get('LH_Sold')).toBe('1');

  await page.goto('/#/card?language=en&sourceId=sv03.5-004');
  await expect(page.getByRole('heading', { name: 'Charmander' })).toBeVisible();
  await check.click();
  await expect(price).toContainText('Add this card and check again to save the estimate.');
  const variantId = await finish.inputValue();
  const read = await page.evaluate(async (id) => {
    const { user } = await (await fetch('/api/session')).json();
    return fetch(`/api/cards/price?variantId=${id}`, {
      headers: { 'X-Carddex-Account': user.id },
    }).then((reply) => reply.json());
  }, variantId);
  expect(read.price).toBeNull();
});
