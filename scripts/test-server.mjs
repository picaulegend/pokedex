import { rm } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { projectRoot, wranglerPath, runWrangler, runWranglerJson } from './lib/wrangler.mjs';

process.env.WRANGLER_SEND_METRICS = 'false';
process.env.WRANGLER_LOG_PATH ||= `${projectRoot}.wrangler/logs/tests.log`;

const passkeys = process.argv.includes('--passkeys');
const state = passkeys ? '.wrangler/passkey-test-state' : '.wrangler/test-state';
const port = passkeys ? '8789' : '8788';
await rm(new URL(`../${state}/`, import.meta.url), { recursive: true, force: true });
if (!passkeys)
  execFileSync(process.execPath, ['scripts/build.mjs', '--test-fixtures'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
runWrangler(['d1', 'migrations', 'apply', 'carddex-preview', '--local', '--persist-to', state], {
  stdio: 'inherit',
});
runWranglerJson([
  'd1',
  'execute',
  'carddex-preview',
  '--local',
  '--persist-to',
  state,
  '--file',
  passkeys ? 'tests/fixtures/passkey-owner.sql' : 'tests/fixtures/catalogue.sql',
]);
if (!passkeys)
  execFileSync(process.execPath, ['scripts/sync-sets.mjs', '--fixture', '--test', '--apply'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

const vars = passkeys
  ? [
      'LOCAL_DEV_AUTH:false',
      'PASSKEY_ORIGIN:http://localhost:8789',
      'BETTER_AUTH_SECRET:isolated-tests-secret-h3CDKmVbbj23fKzQ28e1qw',
      'OWNER_SETUP_TOKEN:isolated-owner-setup-ySaM23Zso6ouCNf89e2Xg',
    ]
  : ['LOCAL_DEV_AUTH:true', 'INVITED_EMAILS:friend@example.test', 'CATALOGUE_TEST_SOURCE:true'];
const server = spawn(
  wranglerPath,
  [
    'dev',
    '--ip',
    '127.0.0.1',
    '--port',
    port,
    '--inspector-port',
    passkeys ? '9231' : '9230',
    '--persist-to',
    state,
    '--var',
    'ADMIN_EMAIL:owner@example.test',
    ...vars.flatMap((value) => ['--var', value]),
  ],
  { cwd: projectRoot, stdio: 'inherit' },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.on('exit', (code) => process.exit(code ?? 1));
