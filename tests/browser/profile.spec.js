import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const origin = 'http://127.0.0.1:8788';
const friend = { 'X-Carddex-Dev-Email': 'friend@example.test' };
const sprites = 'https://play.pokemonshowdown.com/sprites/trainers/';
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=',
  'base64',
);

test('a trainer avatar saves to the private profile and can be reset', async ({
  page,
  context,
  request,
}) => {
  await context.route(`${sprites}*`, (route) =>
    route.request().url().endsWith('/brock-gen3.png')
      ? route.abort()
      : route.fulfill({ contentType: 'image/png', body: pixel }),
  );
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/#/cards');
  const profile = page.getByRole('button', { name: 'Profile', exact: true });
  await profile.click();
  await expect(page).toHaveURL(/#\/profile$/);
  await expect(profile).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#cloud-account')).toContainText('owner@example.test');
  const defaultAvatar = page.getByRole('radio', { name: 'Default', exact: true });
  const oak = page.getByRole('radio', { name: 'Professor Oak', exact: true });
  const save = page.getByRole('button', { name: 'Save avatar' });
  const status = page.locator('#profile-avatar-status');
  await expect(defaultAvatar).toBeChecked();
  await expect(save).toBeDisabled();
  const missing = page.locator('.profile-avatar-option').filter({ hasText: 'Brock' });
  await expect(missing.locator('svg')).toBeVisible();
  await expect(missing.locator('img')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  await oak.check();
  await page.route('**/api/profile', (route) => route.abort());
  await save.click();
  await expect(status).toContainText('Could not save your avatar');
  await expect(oak).toBeChecked();
  await expect(profile.locator('img')).toBeHidden();
  await page.unroute('**/api/profile');
  await save.click();
  await expect(status).toHaveText('Avatar saved.');
  await expect(profile.locator('img')).toBeVisible();
  await expect(profile.locator('img')).toHaveAttribute('src', sprites + 'oak-gen3.png');

  const readUser = async (headers = {}) =>
    (await (await request.get('/api/session', { headers })).json()).user;
  const owner = await readUser();
  expect(owner.avatarId).toBe('oak');
  expect((await readUser(friend)).avatarId).toBeNull();
  const headers = { Origin: origin, 'X-Carddex-Account': owner.id };
  expect(
    (
      await request.put('/api/profile', { headers, data: { avatarId: 'https://example.test/a' } })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.put('/api/profile', {
        headers: { ...headers, ...friend },
        data: { avatarId: 'ash' },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.put('/api/profile', {
        headers: { ...headers, Origin: 'https://example.test' },
        data: { avatarId: 'ash' },
      })
    ).status(),
  ).toBe(403);

  await page.reload();
  await expect(oak).toBeChecked();
  await expect(profile.locator('img')).toBeVisible();
  await page.getByRole('button', { name: 'Sync and backups', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Sync and backups' })).toBeVisible();
  await page.getByRole('button', { name: 'Close sync and backups' }).click();
  await defaultAvatar.check();
  await save.click();
  await expect(status).toHaveText('Avatar saved.');
  await expect(profile.locator('img')).toBeHidden();
  expect((await readUser()).avatarId).toBeNull();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/#\/cards$/);
});

test('a private favorite marks its Pokémon tile and card page after reload', async ({
  page,
  request,
}) => {
  await page.goto('/#/profile');
  const search = page.getByRole('searchbox', { name: 'Find a Pokémon' });
  const save = page.getByRole('button', { name: 'Save favorite' });
  const status = page.locator('#favorite-status');
  await search.fill('#1025');
  await page.getByRole('button', { name: 'Pecharunt #1025' }).click();
  await save.click();
  await expect(status).toHaveText('Favorite saved.');

  const { user: member } = await (await request.get('/api/session', { headers: friend })).json();
  expect(member.favoritePokemonId).toBeNull();
  const { user: owner } = await (await request.get('/api/session')).json();
  expect(owner.favoritePokemonId).toBe(1025);
  expect(
    (
      await request.put('/api/profile', {
        headers: { Origin: origin, 'X-Carddex-Account': owner.id },
        data: { favoritePokemonId: 1026 },
      })
    ).status(),
  ).toBe(400);

  await page.reload();
  await expect(page.locator('#favorite-name')).toHaveText('Pecharunt');
  await page.getByRole('button', { name: 'View Pokémon', exact: true }).click();
  await expect(page.locator('#library-favorite')).toBeVisible();
  await page.locator('#open-pokedex').click();
  await page.getByRole('searchbox', { name: 'Filter by name or Pokédex number' }).fill('pechar');
  const tile = page.getByRole('button', { name: 'View cards for Pecharunt', exact: true });
  await expect(tile).toHaveAccessibleDescription('Favorite Pokémon');
  await expect(tile.locator('.favorite-heart')).toBeVisible();

  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await search.fill('pika');
  await page.getByRole('button', { name: 'Pikachu #0025' }).click();
  await save.click();
  await expect(status).toHaveText('Favorite saved.');
  await page.getByRole('button', { name: 'View Pokémon', exact: true }).click();
  await expect(page.locator('#library-title')).toHaveText('Pikachu');
  await expect(page.locator('#library-favorite')).toBeVisible();
  await page.locator('#open-pokedex').click();
  await expect(tile.locator('.favorite-heart')).toBeHidden();

  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Clear choice' }).click();
  await save.click();
  await expect(status).toHaveText('Favorite removed.');
  await page.goto('/#/pokemon?pokemon=25');
  await expect(page.locator('#library-title')).toHaveText('Pikachu');
  await expect(page.locator('#library-favorite')).toBeHidden();
});

test('the Trainer Card shows milestones and limits the private showcase to owned cards', async ({
  page,
  request,
}) => {
  const readUser = async (extra = {}) =>
    (await (await request.get('/api/session', { headers: extra })).json()).user;
  const owner = await readUser();
  const headers = { Origin: origin, 'X-Carddex-Account': owner.id };
  const read = async (path, extra = headers) =>
    (await request.get(path, { headers: extra })).json();
  const put = (path, data) => request.put(path, { headers, data });
  const change = (path, baseRevision, data) =>
    put(path, { baseRevision, mutationId: randomUUID(), ...data });
  const { cards } = await read('/api/catalogue?pokemon=1');
  const candidates = cards.flatMap((card) =>
    card.variants.map(({ id }) => ({ id, language: card.language, sourceId: card.sourceId })),
  );
  const before = await read('/api/sync');
  const inventory = new Map(before.inventory.map((row) => [row.variantId, row]));
  const [first, ...others] = candidates
    .filter(({ id }) => !inventory.get(id)?.quantity)
    .slice(0, 4);
  expect(others).toHaveLength(3);
  expect(
    (await put('/api/profile/showcase', { variantId: first.id, featured: true })).status(),
  ).toBe(409);
  for (const { id } of [first, ...others])
    expect(
      (
        await change(`/api/inventory/${id}`, inventory.get(id)?.revision || 0, {
          quantity: 1,
          wanted: false,
        })
      ).status(),
    ).toBe(200);
  for (const id of [2, 3]) {
    const current = before.progress.find((row) => row.pokemonId === id);
    if (!current?.owned)
      expect(
        (await change(`/api/pokedex/${id}`, current?.revision || 0, { owned: true })).status(),
      ).toBe(200);
  }

  await page.goto('/#/profile');
  await expect(page.getByRole('heading', { name: 'Trainer Card' })).toBeVisible();
  await page.getByText('View badge goals', { exact: true }).click();
  await expect(page.locator('.trainer-badges li')).toHaveCount(10);
  const synced = await read('/api/sync');
  const species = new Set(
    synced.inventory.filter((row) => row.quantity > 0).flatMap((row) => row.pokemonIds),
  );
  await expect(page.locator('#badge-century-club .badge-progress')).toHaveText(
    `${species.size} / 100 species`,
  );
  await page.getByRole('button', { name: 'Browse owned cards' }).click();
  await page.locator(`[data-open-card="${first.language}:${first.sourceId}"]`).click();
  await page.locator('#detail-finish').selectOption(first.id);
  await page.getByRole('button', { name: 'Feature on Trainer Card', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove from Trainer Card', exact: true }),
  ).toBeVisible();

  const results = await Promise.all(
    others.map(({ id }) => put('/api/profile/showcase', { variantId: id, featured: true })),
  );
  expect(results.map((response) => response.status()).sort()).toEqual([200, 200, 409]);
  const member = await readUser(friend);
  expect((await read('/api/sync', { ...friend, 'X-Carddex-Account': member.id })).showcase).toEqual(
    [],
  );
  await page.goto('/#/profile');
  await page.reload();
  await expect(page.locator('[data-showcase-open]')).toHaveCount(3);

  const { inventory: current } = await read('/api/sync');
  const row = current.find(({ variantId }) => variantId === first.id);
  expect(
    (
      await change(`/api/inventory/${first.id}`, row.revision, { quantity: 0, wanted: false })
    ).status(),
  ).toBe(200);
  await page.reload();
  await expect(page.locator('[data-showcase-open]')).toHaveCount(2);
  await expect(page.locator(`[data-showcase-open="${first.id}"]`)).toHaveCount(0);
  await page.locator('[data-showcase-remove]').first().click();
  await expect(page.locator('#showcase-status')).toContainText('Card removed');
  await expect(page.locator('[data-showcase-open]')).toHaveCount(1);
  const [{ variantId }] = (await read('/api/sync')).showcase;
  expect((await put('/api/profile/showcase', { variantId, featured: false })).status()).toBe(200);
});
