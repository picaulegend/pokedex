import { expect, test } from '@playwright/test';

const origin = 'http://localhost:8789';
const previousOrigin = 'http://127.0.0.1:8789';
const auth = origin + '/api/auth/passkey/';
const token = 'isolated-owner-setup-ySaM23Zso6ouCNf89e2Xg';
const authenticator = {
  protocol: 'ctap2',
  transport: 'internal',
  hasResidentKey: true,
  hasUserVerification: true,
  isUserVerified: true,
};

test('the existing owner can sign in, manage passkeys, and invite a member', async ({
  page,
  context,
  browser,
}) => {
  const api = context.request;
  const session = origin + '/api/session';
  const headers = { Origin: origin };
  const invitations = origin + '/api/invitations';
  const inviteRequest = (client, email) => client.post(invitations, { data: { email }, headers });
  const setup = (value, originHeader = origin) =>
    api.post(origin + '/api/owner/setup', {
      data: { token: value },
      headers: { Origin: originHeader },
    });
  const remove = (id) => api.post(auth + 'delete-passkey', { data: { id }, headers });

  for (const path of ['/', '/index.html', '/standalone', '/passkeys', '/cloud.js']) {
    const response = await api.get(origin + path, { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe('/login');
  }
  expect((await api.get(session, { headers: { 'Cf-Access-Jwt-Assertion': 'old' } })).status()).toBe(
    401,
  );
  expect((await inviteRequest(api, 'member@example.test')).status()).toBe(401);
  expect(
    (await api.put(origin + '/api/profile', { data: { avatarId: 'ash' }, headers })).status(),
  ).toBe(401);
  expect((await api.get(auth + 'generate-register-options?context=owner-setup')).status()).toBe(
    403,
  );
  expect((await setup('wrong code')).status()).toBe(403);
  expect((await setup(token, 'https://example.test')).status()).toBe(403);
  expect((await api.get(previousOrigin + '/api/session')).status()).toBe(401);
  expect(
    (
      await api.post(previousOrigin + '/api/owner/setup', {
        data: { token },
        headers: { Origin: previousOrigin },
      })
    ).status(),
  ).toBe(404);

  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const first = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: authenticator });

  await page.goto(origin);
  await expect(page.getByRole('banner')).toHaveText('Collect');
  await expect(page.getByRole('main', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('link', { name: /owner passkey/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeVisible();
  await expect(
    page.getByText('New account creation is currently closed', { exact: true }),
  ).toBeVisible();
  const sprites = page.locator('.login-sprite');
  await expect(sprites).toHaveCount(3);
  for (const sprite of await sprites.all()) {
    const image = await sprite.evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(image).toMatch(/\/sprites\/[147]-[0-9a-f]{12}\.png/);
    expect((await api.get(new URL(image.match(/"([^"]+)"/)[1], origin).href)).ok()).toBe(true);
  }
  await page.goto(origin + '/setup');
  await page.getByLabel('Setup code').fill(token);
  await page.getByRole('button', { name: 'Create owner passkey' }).click();
  await expect(page).toHaveURL(origin + '/#/pokedex');
  const { user } = await (await api.get(session)).json();
  expect(user).toMatchObject({ id: 'legacy-owner-id', role: 'admin' });
  const progress = await api.get(origin + '/api/pokedex', {
    headers: { 'X-Carddex-Account': user.id },
  });
  expect(await progress.json()).toMatchObject({
    progress: [{ pokemonId: 1, owned: true, revision: 4 }],
  });
  expect((await setup(token)).status()).toBe(409);

  await page.locator('#app-account').click();
  await expect(page.locator('#cloud-account')).toContainText('Owner');
  await page.getByRole('link', { name: 'Manage passkeys' }).click();
  const keys = await (await api.get(auth + 'list-user-passkeys')).json();
  expect(keys.map((key) => key.id)).toContain('legacy-key');
  expect(keys).toHaveLength(2);
  expect((await remove('legacy-key')).ok()).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Remove Owner passkey' })).toBeDisabled();
  const [key] = await (await api.get(auth + 'list-user-passkeys')).json();
  expect((await remove(key.id)).status()).toBe(400);

  await cdp.send('WebAuthn.removeVirtualAuthenticator', first);
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: authenticator });
  await page.getByLabel('Passkey name').fill('Security key');
  await page.getByRole('button', { name: 'Add passkey' }).click();
  await expect(page.getByRole('button', { name: 'Remove Security key' })).toBeEnabled();
  expect((await remove(key.id)).ok()).toBe(true);
  expect((await setup(token)).status()).toBe(409);

  await page.getByLabel('Their email address').fill('member@example.test');
  await page.getByRole('button', { name: 'Create invite link' }).click();
  const inviteLink = page.getByLabel('Invite link');
  await expect(inviteLink).toHaveValue(/\/invite#[\w-]{43}$/);

  const guest = await browser.newContext();
  try {
    const memberPage = await guest.newPage();
    const memberCdp = await guest.newCDPSession(memberPage);
    await memberCdp.send('WebAuthn.enable');
    await memberCdp.send('WebAuthn.addVirtualAuthenticator', { options: authenticator });
    const link = await inviteLink.inputValue();
    await memberPage.goto(link);
    await memberPage.getByRole('button', { name: 'Create passkey' }).click();
    await expect(memberPage).toHaveURL(origin + '/#/pokedex');
    const { user: member } = await (await guest.request.get(session)).json();
    expect(member).toMatchObject({ role: 'member', email: 'member@example.test' });
    expect(member.id).not.toBe(user.id);
    const progress = await guest.request.get(origin + '/api/pokedex', {
      headers: { 'X-Carddex-Account': member.id },
    });
    expect(await progress.json()).toEqual({ progress: [] });
    expect(
      (
        await guest.request.get(origin + '/api/pokedex', {
          headers: { 'X-Carddex-Account': user.id },
        })
      ).status(),
    ).toBe(401);
    expect((await inviteRequest(guest.request, 'other@example.test')).status()).toBe(403);
    expect((await inviteRequest(api, 'member@example.test')).status()).toBe(409);
    const reuse = await browser.newContext();
    try {
      const response = await reuse.request.post(invitations + '/open', {
        data: { token: new URL(link).hash.slice(1) },
        headers,
      });
      expect(response.status()).toBe(404);
    } finally {
      await reuse.close();
    }
  } finally {
    await guest.close();
  }

  await page.getByRole('link', { name: 'Back to Collect' }).click();
  await page.locator('#app-account').click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(origin + '/login');
  expect((await api.get(session)).status()).toBe(401);
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page).toHaveURL(origin + '/#/pokedex');
  expect((await (await api.get(session)).json()).user.id).toBe(user.id);
});
