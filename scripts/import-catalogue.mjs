import { runWrangler, runWranglerJson } from './lib/wrangler.mjs';

if (!process.argv.includes('--audit') || process.argv.includes('--remote')) {
  console.error(
    'Bulk imports are disabled for the app. Use --audit for the separate local audit database.',
  );
  process.exit(1);
}
const persistence = '.wrangler/catalogue-audit-state';
runWrangler([
  'd1',
  'migrations',
  'apply',
  'carddex-preview',
  '--local',
  '--persist-to',
  persistence,
]);
const args = [
  'd1',
  'execute',
  'carddex-preview',
  '--local',
  '--persist-to',
  persistence,
  '--file',
  'work/catalogue-sample/import-d1.sql',
];
try {
  const result = runWranglerJson(args);
  console.log(
    JSON.stringify({
      location: 'isolated local audit',
      success: true,
      results: result.length,
      rowsRead: result.reduce((sum, r) => sum + (r.meta?.rows_read || 0), 0),
      rowsWritten: result.reduce((sum, r) => sum + (r.meta?.rows_written || 0), 0),
      databaseBytes: result.at(-1)?.meta?.size_after,
    }),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
