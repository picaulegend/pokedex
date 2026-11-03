import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWranglerJson } from '../scripts/lib/wrangler.mjs';

test('D1 output is read after progress and warning lines without mistaking a warning for JSON', () => {
  const result = [{ success: true, results: [], meta: { rows_written: 1 } }];
  assert.deepEqual(parseWranglerJson(JSON.stringify(result)), result);
  assert.deepEqual(
    parseWranglerJson(`[WARNING] A progress message\n├ Processing\n${JSON.stringify(result)}\n`),
    result,
  );
});

test('an unknown D1 result asks for a database check before another write', () => {
  assert.throws(
    () => parseWranglerJson('Upload complete, result missing.'),
    /Read the database before a retry/,
  );
});
