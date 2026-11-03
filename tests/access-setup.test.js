import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationSettings,
  checkProviderChange,
  checkExistingApplication,
} from '../scripts/setup-access.mjs';

test('the planned Access policy allows one exact email and one provider', () => {
  const app = applicationSettings('owner@example.test', 'email-provider');
  assert.equal(app.domain, 'carddex-preview.pohon.workers.dev');
  assert.deepEqual(app.allowed_idps, ['email-provider']);
  assert.deepEqual(app.policies[0].include, [{ email: { email: 'owner@example.test' } }]);
  checkExistingApplication(app, app.policies, 'owner@example.test', 'email-provider');
});

test('adding a provider stops if it would expand sign-in for another app', () => {
  assert.throws(() => checkProviderChange([{ name: 'Another app', allowed_idps: [] }]));
  assert.throws(() => checkProviderChange([{ name: 'Another app' }]));
  checkProviderChange([{ name: 'Another app', allowed_idps: ['existing-provider'] }]);
});

test('an existing app with a broader policy is preserved for review', () => {
  const app = applicationSettings('owner@example.test', 'email-provider');
  const policies = [
    { ...app.policies[0], include: [{ email_domain: { domain: 'example.test' } }] },
  ];
  assert.throws(() =>
    checkExistingApplication(app, policies, 'owner@example.test', 'email-provider'),
  );
  assert.throws(() =>
    checkExistingApplication(
      { ...app, name: 'Another app' },
      app.policies,
      'owner@example.test',
      'email-provider',
    ),
  );
});
