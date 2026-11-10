import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/binder.css', ['binder.css', 'text/css; charset=utf-8']],
  ['/binder.js', ['binder.js', 'text/javascript; charset=utf-8']],
]);

// Use the sprites already embedded in the standalone checklist as image fallbacks.
const checklist = await readFile(new URL('../../public/index.html', import.meta.url), 'utf8');
const data = checklist.match(
  /<script id="pokemon-data" type="application\/json">([^<]+)<\/script>/,
);
const sprites = new Map(
  JSON.parse(data[1])
    .slice(0, 151)
    .map(({ id, image }) => [id, image]),
);
const port = Number(process.env.BINDER_PORT || 8792);

createServer(async (request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  const file = files.get(path);
  const sprite = sprites.get(Number(path.match(/^\/sprites\/(\d+)\.png$/)?.[1]));
  if ((!file && !sprite) || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const body = file
      ? await readFile(new URL(file[0], import.meta.url))
      : Buffer.from(sprite.split(',')[1], 'base64');
    response.writeHead(200, {
      'Content-Type': file?.[1] || 'image/png',
      'Cache-Control': file ? 'no-store' : 'public, max-age=3600',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(500).end('Check the prototype files.');
  }
}).listen(port, '127.0.0.1', () => console.log(`Binder prototype: http://127.0.0.1:${port}/`));
