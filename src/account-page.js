const pages = {
  '/login': {
    title: 'Sign in',
    description: 'Open your private Pokémon card collection.',
    content: '<button class="primary-button" id="passkey-login">Sign in with a passkey</button>',
  },
  '/setup': {
    title: 'Set up your owner passkey',
    description: 'Use your setup code to add the first passkey for your owner account.',
    content: `<form id="passkey-setup">
<label>Setup code<input id="setup-code" name="token" type="password" required autocomplete="off" maxlength="512"></label>
<button class="primary-button">Create owner passkey</button>
</form>`,
    link: '<a href="/login">Back to sign-in</a>',
  },
  '/passkeys': {
    title: 'Manage passkeys',
    description:
      'Add a passkey on another device or use a security key so you can still sign in if you lose one.',
    content: `<ul id="passkey-list"></ul>
<form id="passkey-add">
<label>Passkey name<input id="passkey-name" name="name" maxlength="100" placeholder="For example, security key"></label>
<button class="primary-button">Add passkey</button>
</form>`,
    link: '<a href="/">Back to Collect</a>',
  },
  '/invite': {
    title: 'Join Collect',
    description: 'Create a passkey to open your own private collection.',
    content: '<button class="primary-button" id="invite-accept">Create passkey</button>',
    link: '<a href="/login">Go to sign-in</a>',
  },
};

const inviteSection = `<section id="invite">
<h2>Invite someone</h2>
<p>The link expires in 48 hours and creates one account. Send it to the person you want to invite.</p>
<form id="invite-create">
<label>Their email address<input id="invite-email" name="email" type="email" maxlength="254" required></label>
<button class="primary-button">Create invite link</button>
</form>
<div id="invite-result" hidden>
<label>Invite link<input id="invite-link" readonly></label>
<button class="secondary-button" type="button" id="invite-copy">Copy link</button>
</div>
</section>`;

export function accountPage(path, method, { allowSetup, canInvite } = {}) {
  const { title, description, content, link } = pages[path];
  const nextLink =
    path === '/login' && allowSetup ? '<a href="/setup">Set up owner passkey</a>' : link;
  return new Response(
    method === 'HEAD'
      ? null
      : `<!doctype html>
<html lang="en" class="cloud-app">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>${title} · Collect</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/passkeys.css"></head>
<body class="account-page">
<header class="app-header"><span class="app-brand">Collect</span></header>
<main class="account-panel">
<header class="screen-intro"><h1>${title}</h1><p>${description}</p></header>
${content}${canInvite ? inviteSection : ''}
<p id="passkey-status" role="status" aria-live="polite"></p>
${nextLink ? `<footer class="account-links">${nextLink}</footer>` : ''}
</main>
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
