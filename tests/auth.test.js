import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { authenticate, verifyAccessToken } from '../src/auth.js';

const issuer = 'https://carddex-test.cloudflareaccess.com';
const audience = 'carddex-test-audience';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
jwk.kid = 'test-key';
const keys = createLocalJWKSet({ keys: [jwk] });

function token(overrides = {}) {
  return new SignJWT({ email: 'owner@example.test', ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setSubject('subject-1')
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

test('accepts a signed Access identity and checks the issuer and audience', async () => {
  const signed = await token();
  assert.equal(
    (await verifyAccessToken(signed, issuer, audience, keys)).email,
    'owner@example.test',
  );
  await assert.rejects(verifyAccessToken(signed, issuer, 'another-app', keys));
  await assert.rejects(
    verifyAccessToken(signed, 'https://other.cloudflareaccess.com', audience, keys),
  );
  await assert.rejects(verifyAccessToken(signed.slice(0, -8) + 'invalid!', issuer, audience, keys));
});

test('rejects expired tokens and tokens without an email', async () => {
  const expired = await new SignJWT({ email: 'owner@example.test' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setSubject('subject')
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(1)
    .sign(privateKey);
  await assert.rejects(verifyAccessToken(expired, issuer, audience, keys));
  await assert.rejects(verifyAccessToken(await token({ email: null }), issuer, audience, keys));
});

test('local test identities require a loopback hostname and an approved email', async () => {
  const env = {
    LOCAL_DEV_AUTH: 'true',
    ADMIN_EMAIL: 'owner@example.test',
    INVITED_EMAILS: 'friend@example.test',
  };
  const request = (email) =>
    new Request('http://127.0.0.1/api/session', { headers: { 'X-Carddex-Dev-Email': email } });
  assert.equal((await authenticate(request('OWNER@example.test'), env)).role, 'admin');
  assert.equal((await authenticate(request('friend@example.test'), env)).role, 'member');
  await assert.rejects(
    authenticate(request('stranger@example.test'), env),
    (error) => error.status === 403,
  );
  await assert.rejects(
    authenticate(new Request('https://carddex.example/api/session'), env),
    (error) => error.status === 503,
  );
});

test('an email header cannot replace a signed token on a public hostname', async () => {
  const env = {
    ADMIN_EMAIL: 'owner@example.test',
    ACCESS_TEAM_DOMAIN: issuer,
    ACCESS_AUD: audience,
    LOCAL_DEV_AUTH: 'true',
  };
  const request = new Request('https://carddex.example/api/session', {
    headers: {
      'Cf-Access-Authenticated-User-Email': 'owner@example.test',
      'X-Carddex-Dev-Email': 'owner@example.test',
    },
  });
  await assert.rejects(authenticate(request, env), (error) => error.status === 401);
});
