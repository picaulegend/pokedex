import { rm } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { projectRoot, wranglerPath, runWrangler, runWranglerJson } from './lib/wrangler.mjs';

process.env.WRANGLER_SEND_METRICS = 'false';
process.env.WRANGLER_LOG_PATH ||= `${projectRoot}.wrangler/logs/tests.log`;

// This state belongs only to the automated server on port 8788.
await rm(new URL('../.wrangler/test-state/', import.meta.url), { recursive: true, force: true });
execFileSync(process.execPath, ['scripts/build.mjs', '--test-fixtures'], {
  cwd: projectRoot,
  stdio: 'inherit',
});
runWrangler(
  [
    'd1',
    'migrations',
    'apply',
    'carddex-preview',
    '--local',
    '--persist-to',
    '.wrangler/test-state',
  ],
  { stdio: 'inherit' },
);
runWranglerJson([
  'd1',
  'execute',
  'carddex-preview',
  '--local',
  '--persist-to',
  '.wrangler/test-state',
  '--file',
  'tests/fixtures/catalogue.sql',
]);
execFileSync(process.execPath, ['scripts/sync-sets.mjs', '--fixture', '--test', '--apply'], {
  cwd: projectRoot,
  stdio: 'inherit',
});

const server = spawn(
  wranglerPath,
  [
    'dev',
    '--ip',
    '127.0.0.1',
    '--port',
    '8788',
    '--inspector-port',
    '9230',
    '--persist-to',
    '.wrangler/test-state',
    '--var',
    'LOCAL_DEV_AUTH:true',
    '--var',
    'ADMIN_EMAIL:owner@example.test',
    '--var',
    'INVITED_EMAILS:friend@example.test',
    '--var',
    'CATALOGUE_TEST_SOURCE:true',
  ],
  {
    cwd: projectRoot,
    stdio: 'inherit',
  },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.on('exit', (code) => process.exit(code ?? 1));
