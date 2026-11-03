import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { pathToFileURL } from 'node:url';

const hostname = 'carddex-preview.pohon.workers.dev';
const applicationName = 'Carddex preview';

export function applicationSettings(email, providerId) {
  return {
    name: applicationName,
    type: 'self_hosted',
    domain: hostname,
    session_duration: '24h',
    app_launcher_visible: false,
    allowed_idps: [providerId],
    auto_redirect_to_identity: true,
    policies: [{ name: 'Approved collectors', decision: 'allow', include: [{ email: { email } }] }],
  };
}

export function checkProviderChange(apps) {
  if (apps.some((app) => !Array.isArray(app.allowed_idps) || !app.allowed_idps.length)) {
    throw new Error(
      'An existing Access app accepts all identity providers. Review it before adding an email provider.',
    );
  }
}

export function checkExistingApplication(app, policies, email, providerId) {
  if (app.name !== applicationName || app.domain !== hostname)
    throw new Error('The existing Access app needs a separate review.');
  if (app.allowed_idps?.length !== 1 || app.allowed_idps[0] !== providerId)
    throw new Error('The existing app has different sign-in settings.');
  const policy = policies[0];
  if (
    policies.length !== 1 ||
    policy.decision !== 'allow' ||
    policy.include?.length !== 1 ||
    Object.keys(policy.include[0]).join() !== 'email' ||
    policy.include[0].email?.email?.toLowerCase() !== email ||
    policy.require?.length ||
    policy.exclude?.length
  ) {
    throw new Error('The existing app has a different access policy. It was left in place.');
  }
}

async function main() {
  for (const file of ['.env.cloudflare', '.dev.vars']) if (existsSync(file)) loadEnvFile(file);
  const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('Set ADMIN_EMAIL in .dev.vars.');
  let token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    const credentials = JSON.parse(
      execFileSync('node_modules/.bin/wrangler', ['auth', 'token', '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
    token = credentials.token || credentials.apiToken || credentials.oauthToken;
  }
  if (!token) throw new Error('Set CLOUDFLARE_API_TOKEN in .env.cloudflare.');

  async function api(path, method = 'GET', data, allowMissing = false) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.account_id}/access/${path}`,
      {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(data ? { body: JSON.stringify(data) } : {}),
      },
    );
    const body = await response.json();
    if (allowMissing && path === 'organizations' && response.status === 404) return null;
    if (
      allowMissing &&
      body.errors?.some((error) => error.code === 9999 && /not_enabled/i.test(error.message))
    )
      return null;
    if (!response.ok || !body.success) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          'The current credential cannot manage Access. Use a scoped Access API token in .env.cloudflare. See docs/cloud-preview.md.',
        );
      }
      throw new Error(
        `Access API ${method} ${path} failed (HTTP ${response.status}; codes ${(body.errors || []).map((error) => error.code).join(',')}). Read the current state before retrying a write.`,
      );
    }
    return body;
  }

  async function list(path) {
    const rows = [];
    for (let page = 1; ; page++) {
      const body = await api(`${path}?page=${page}&per_page=50`, 'GET', undefined, true);
      if (body === null) return [];
      rows.push(...body.result);
      if (!body.result_info || page >= (body.result_info.total_pages || 1)) return rows;
    }
  }

  let organization = (await api('organizations', 'GET', undefined, true))?.result;
  let apps = await list('apps');
  let providers = organization ? await list('identity_providers') : [];
  let provider = providers.find((item) => item.type === 'onetimepin');
  let app = apps.find((item) => item.domain === hostname);
  if (!provider) checkProviderChange(apps);
  if (app && app.name !== applicationName)
    throw new Error('Another Access app already protects this hostname. It was left in place.');
  const plan = {
    account: config.account_id,
    hostname,
    approved_email: email,
    organization: organization ? 'Reuse' : 'Create Zero Trust organization with default domain',
    email_provider: provider ? 'Reuse' : 'Create email code provider',
    application: app ? 'Verify and reuse' : 'Create an app for this hostname only',
    worker_configuration: 'Set issuer and audience; disable version preview URLs',
  };
  console.log(JSON.stringify(plan, null, 2));
  if (!process.argv.includes('--apply')) {
    console.log('Read-only plan. Use --apply to perform this setup.');
    return;
  }

  if (!organization)
    organization = (await api('organizations', 'POST', { name: 'Carddex' })).result;
  if (!provider) {
    // Read again after organization setup or a previous partial run.
    apps = await list('apps');
    providers = await list('identity_providers');
    provider = providers.find((item) => item.type === 'onetimepin');
    if (!provider) {
      checkProviderChange(apps);
      provider = (
        await api('identity_providers', 'POST', {
          name: 'Carddex email code',
          type: 'onetimepin',
          config: {},
        })
      ).result;
    }
  }
  app = (await list('apps')).find((item) => item.domain === hostname);
  if (!app) app = (await api('apps', 'POST', applicationSettings(email, provider.id))).result;
  app = (await api(`apps/${app.id}`)).result;
  const policies = await list(`apps/${app.id}/policies`);
  checkExistingApplication(app, policies, email, provider.id);
  const issuer = `https://${organization.auth_domain.replace(/^https:\/\//, '').replace(/\/$/, '')}`;
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) || !app.aud) {
    throw new Error(
      'The Access app did not return a valid issuer and audience. Worker settings were left in place.',
    );
  }
  config.vars = { ...config.vars, ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: app.aud };
  config.preview_urls = false;
  writeFileSync('wrangler.jsonc', JSON.stringify(config, null, 2) + '\n');
  mkdirSync('.wrangler', { recursive: true });
  writeFileSync(
    '.wrangler/access-setup.json',
    JSON.stringify({ hostname, app_id: app.id, issuer, audience: app.aud }, null, 2) + '\n',
  );
  console.log('Access policy verified. Worker settings saved. Run npm run deploy to use them.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
