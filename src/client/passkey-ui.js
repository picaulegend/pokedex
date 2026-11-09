import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/client';

const auth = createAuthClient({ plugins: [passkeyClient()] });
const status = document.querySelector('#passkey-status');
const list = document.querySelector('#passkey-list');

function result(response) {
  if (response.error) throw new Error(response.error.message || 'The passkey action failed.');
  return response.data;
}

async function run(button, message, action) {
  button.disabled = true;
  status.textContent = message;
  try {
    if (!window.PublicKeyCredential) throw new Error('This browser does not support passkeys.');
    await action();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function post(path, data) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return body;
}

async function signInAfterSetup() {
  status.textContent = 'Passkey created. Confirm again to sign in.';
  try {
    result(await auth.signIn.passkey());
    location.replace('/');
  } catch {
    location.replace('/login');
  }
}

const login = document.querySelector('#passkey-login');
if (login)
  login.onclick = () =>
    run(login, 'Waiting for your passkey…', async () => {
      result(await auth.signIn.passkey());
      location.replace('/' + location.hash);
    });

const setup = document.querySelector('#passkey-setup');
if (setup)
  setup.onsubmit = (event) => {
    event.preventDefault();
    void run(setup.querySelector('button'), 'Creating your passkey…', async () => {
      const input = setup.elements.token;
      await post('/api/owner/setup', { token: input.value.trim() });
      result(await auth.passkey.addPasskey({ context: 'owner-setup', name: 'Owner passkey' }));
      input.value = '';
      await signInAfterSetup();
    });
  };

const acceptInvite = document.querySelector('#invite-accept');
if (acceptInvite)
  acceptInvite.onclick = () =>
    run(acceptInvite, 'Creating your passkey…', async () => {
      await post('/api/invitations/open', { token: location.hash.slice(1) });
      result(await auth.passkey.addPasskey({ context: 'invitation' }));
      await signInAfterSetup();
    });

const inviteForm = document.querySelector('#invite-create');
if (inviteForm) {
  const inviteResult = document.querySelector('#invite-result');
  const link = document.querySelector('#invite-link');
  inviteForm.onsubmit = (event) => {
    event.preventDefault();
    void run(inviteForm.querySelector('button'), 'Creating an invite link…', async () => {
      const { url } = await post('/api/invitations', { email: inviteForm.elements.email.value });
      link.value = url;
      inviteResult.hidden = false;
      status.textContent = 'Invite link ready.';
    });
  };
  document.querySelector('#invite-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(link.value);
      status.textContent = 'Invite link copied.';
    } catch {
      link.select();
      status.textContent = 'Copy the selected link.';
    }
  };
}

async function showPasskeys() {
  const keys = result(await auth.passkey.listUserPasskeys());
  list.replaceChildren();
  for (const key of keys) {
    const item = document.createElement('li');
    item.textContent = key.name || 'Passkey';
    const button = document.createElement('button');
    button.className = 'secondary-button';
    button.textContent = 'Remove';
    button.setAttribute('aria-label', `Remove ${item.textContent}`);
    button.disabled = keys.length < 2;
    button.onclick = () => {
      if (!window.confirm('Remove this passkey?')) return;
      void run(button, 'Removing passkey…', async () => {
        result(await auth.passkey.deletePasskey({ id: key.id }));
        await showPasskeys();
        status.textContent = 'Passkey removed.';
      });
    };
    item.append(button);
    list.append(item);
  }
}

const add = document.querySelector('#passkey-add');
if (add) {
  showPasskeys().catch((error) => {
    status.textContent = error.message;
  });
  add.onsubmit = (event) => {
    event.preventDefault();
    void run(add.querySelector('button'), 'Creating a passkey…', async () => {
      const input = add.elements.name;
      result(await auth.passkey.addPasskey({ name: input.value.trim() || 'Passkey' }));
      input.value = '';
      await showPasskeys();
      status.textContent = 'Passkey added.';
    });
  };
}
