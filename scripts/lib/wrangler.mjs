import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const wranglerPath = fileURLToPath(
  new URL('../../node_modules/.bin/wrangler', import.meta.url),
);

export function runWrangler(args, options = {}) {
  return execFileSync(wranglerPath, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options,
  });
}

export function parseWranglerJson(output) {
  // Some D1 commands print progress or warnings before the final JSON array.
  for (const match of output.matchAll(/^\[/gm)) {
    try {
      const result = JSON.parse(output.slice(match.index));
      if (Array.isArray(result)) return result;
    } catch {
      // Try the next line that could start the final result.
    }
  }
  throw new Error('No D1 JSON result was returned. Read the database before a retry.');
}

export function runWranglerJson(args) {
  const result = parseWranglerJson(runWrangler([...args, '--json']));
  if (!result.length || result.some((row) => row.success !== true)) {
    throw new Error('A D1 command did not complete. Read the database before a retry.');
  }
  return result;
}
