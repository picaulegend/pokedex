const pages = {
  '/login': {
    title: 'Sign in',
    content:
      '<p>Open your private Pokémon card collection.</p><button id="passkey-login">Sign in with a passkey</button>',
  },
  '/setup': {
    title: 'Set up your owner passkey',
    content: `<p>Use your setup code to add the first passkey for your owner account.</p>
<form id="passkey-setup"><label for="setup-code">Setup code</label><input id="setup-code" name="token" type="password" required autocomplete="off" maxlength="512"><button>Create owner passkey</button></form>
<a href="/login">Back to sign-in</a>`,
  },
  '/passkeys': {
    title: 'Manage passkeys',
    content: `<p>Add a passkey on another device or use a security key so you can still sign in if you lose one.</p>
<ul id="passkey-list"></ul>
<form id="passkey-add"><label for="passkey-name">Passkey name</label><input id="passkey-name" name="name" maxlength="100" placeholder="For example, security key"><button>Add passkey</button></form>
<a href="/">Back to Carddex</a>`,
  },
  '/invite': {
    title: 'Join Carddex',
    content: `<p>Create a passkey to open your own private collection.</p>
<button id="invite-accept">Create passkey</button>
<p><a href="/login">Go to sign-in</a></p>`,
  },
};

const inviteSection = `<section id="invite">
<h2>Invite someone</h2>
<p>The link expires in 48 hours and creates one account. Send it to the person you want to invite.</p>
<form id="invite-create"><label for="invite-email">Their email address</label><input id="invite-email" name="email" type="email" maxlength="254" required><button>Create invite link</button></form>
<div id="invite-result" hidden><label for="invite-link">Invite link</label><input id="invite-link" readonly><button type="button" id="invite-copy">Copy link</button></div>
</section>`;

export function accountPage(path, method, { allowSetup, canInvite } = {}) {
  const { title, content } = pages[path];
  const setup = path === '/login' && allowSetup ? '<a href="/setup">Set up owner passkey</a>' : '';
  return new Response(
    method === 'HEAD'
      ? null
      : `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>${title} · Carddex</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/passkeys.css"></head>
<body><main><p class="brand">Carddex</p><h1>${title}</h1>${content}${canInvite ? inviteSection : ''}
<p id="passkey-status" role="status" aria-live="polite"></p>${setup}</main>
<script type="module" src="/passkey-ui.js"></script></body></html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy':
          "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
