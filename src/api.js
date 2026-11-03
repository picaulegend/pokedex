import { HttpError } from './auth.js';

export const isId = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie, Cf-Access-Jwt-Assertion',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function progressState(row, pokemonId) {
  return row
    ? {
        pokemonId: row.pokemon_id,
        owned: Boolean(row.owned),
        legacyOwned: Boolean(row.legacy_owned),
        revision: row.revision,
      }
    : { pokemonId, owned: false, legacyOwned: false, revision: 0 };
}

export async function readBody(request, maximum = 4096) {
  if (request.headers.get('Origin') !== new URL(request.url).origin)
    throw new HttpError(403, 'Use the app to save changes.');
  if (!request.headers.get('Content-Type')?.startsWith('application/json'))
    throw new HttpError(415, 'Send JSON data.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Missing change.');
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      throw new HttpError(413, 'This change is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, 'Send a valid change.');
  }
}
