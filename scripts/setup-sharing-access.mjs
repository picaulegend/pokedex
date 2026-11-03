import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { pathToFileURL } from 'node:url';
import { checkExistingApplication } from './setup-access.mjs';

const hostname = 'carddex-preview.pohon.workers.dev';
export function sharingApplication(providerId) {
  return {
    name: 'Carddex shared pages',
    type: 'self_hosted',
    domain: `${hostname}/s/*`,
    app_launcher_visible: false,
    allowed_idps: [providerId],
    policies: [{ name: 'Public read-only pages', decision: 'bypass', include: [{ everyone: {} }] }],
  };
}
export function checkSharingApplication(app, policies) {
  if (
    app.name !== 'Carddex shared pages' ||
    app.type !== 'self_hosted' ||
    app.domain !== `${hostname}/s/*` ||
    policies.length !== 1 ||
    policies[0].decision !== 'bypass' ||
    policies[0].include?.length !== 1 ||
    Object.keys(policies[0].include[0]).join() !== 'everyone' ||
    Object.keys(policies[0].include[0].everyone).length ||
    policies[0].exclude?.length ||
    policies[0].require?.length
  )
    throw new Error(
      'The shared-page Access application differs from the expected narrow public path. It was left in place.',
    );
}
async function main() {
  for (const file of ['.env.cloudflare', '.dev.vars']) if (existsSync(file)) loadEnvFile(file);
  const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8')),
    token = process.env.CLOUDFLARE_API_TOKEN,
    email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!token || !email)
    throw new Error('Set the Access token in .env.cloudflare and ADMIN_EMAIL in .dev.vars.');
  async function api(path, method = 'GET', data) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.account_id}/access/${path}`,
      {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(data ? { body: JSON.stringify(data) } : {}),
        signal: AbortSignal.timeout(20000),
      },
    );
    const body = await response.json();
    if (!response.ok || !body.success)
      throw new Error(
        `Access ${method} failed (HTTP ${response.status}). Read the current state before another write.`,
      );
    return body;
  }
  async function list(path) {
    const rows = [];
    for (let page = 1; ; page++) {
      const body = await api(`${path}?page=${page}&per_page=50`);
      rows.push(...body.result);
      if (page >= (body.result_info?.total_pages || 1)) return rows;
    }
  }
  const apps = await list('apps'),
    parent = apps.find((app) => app.domain === hostname);
  if (!parent || parent.allowed_idps?.length !== 1)
    throw new Error(
      'The existing private Access application needs a review. No settings were changed.',
    );
  const policies = await list(`apps/${parent.id}/policies`);
  checkExistingApplication(parent, policies, email, parent.allowed_idps[0]);
  const settings = sharingApplication(parent.allowed_idps[0]);
  let app = apps.find((app) => app.domain === settings.domain);
  if (app) checkSharingApplication(app, await list(`apps/${app.id}/policies`));
  console.log(
    JSON.stringify({
      publicPath: settings.domain,
      privateApplication: 'Verified; unchanged',
      action: app
        ? 'Verify and reuse the shared-page application'
        : 'Create a public application for /s/* only',
    }),
  );
  if (!process.argv.includes('--apply')) {
    console.log('Read-only plan. Use --apply after the shared-page handler is deployed.');
    return;
  }
  if (!app) app = (await api('apps', 'POST', settings)).result;
  app = (await api(`apps/${app.id}`)).result;
  checkSharingApplication(app, await list(`apps/${app.id}/policies`));
  const current = (await api(`apps/${parent.id}`)).result;
  checkExistingApplication(
    current,
    await list(`apps/${parent.id}/policies`),
    email,
    parent.allowed_idps[0],
  );
  mkdirSync('.wrangler', { recursive: true });
  writeFileSync(
    '.wrangler/sharing-access.json',
    JSON.stringify({ app_id: app.id, domain: app.domain, parent_app_id: parent.id }, null, 2) +
      '\n',
  );
  console.log(
    'Public sharing path verified. The private application and edit routes keep sign-in protection.',
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
