import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localUser } from '../src/auth.js';

test('local test identities require a loopback hostname and an approved email', async () => {
  const env = {
    LOCAL_DEV_AUTH: 'true',
    ADMIN_EMAIL: 'owner@example.test',
    INVITED_EMAILS: 'friend@example.test',
  };
  const request = (email) =>
    new Request('http://127.0.0.1/api/session', { headers: { 'X-Carddex-Dev-Email': email } });
  assert.equal((await localUser(request('OWNER@example.test'), env)).role, 'admin');
  assert.equal((await localUser(request('friend@example.test'), env)).role, 'member');
  await assert.rejects(localUser(request('stranger@example.test'), env), { status: 403 });
  assert.equal(await localUser(new Request('https://carddex.example/api/session'), env), null);
  assert.equal(
    await localUser(request('owner@example.test'), { ...env, LOCAL_DEV_AUTH: 'false' }),
    null,
  );
});
