import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const files = new Map([
  ['/', ['app-context.html', 'text/html']],
  ['/app-context.css', ['app-context.css', 'text/css']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/prototype.js', ['prototype.js', 'text/javascript']],
  ['/app/cloud.css', ['../../src/client/cloud.css', 'text/css']],
  ['/app/base.css', ['../../public/index.html', 'text/css']],
]);

// Serve only these UI files. Account routes and database files are unavailable.
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1:8791').pathname;
  const file = files.get(path);
  if (!file || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    let content = await readFile(new URL(file[0], import.meta.url), 'utf8');
    if (path === '/app/base.css') content = content.match(/<style>([\s\S]*?)<\/style>/)[1];
    if (path === '/') {
      const original = await readFile(new URL('index.html', import.meta.url), 'utf8');
      for (const [marker, pattern] of [
        ['ICONS', /<svg class="icon-library"[\s\S]*?<\/svg>/],
        ['ENTRY FORM', /<dialog\s+id="entry-dialog"[\s\S]*?<\/dialog>/],
        ['REMOVAL FORM', /<dialog\s+id="removal-dialog"[\s\S]*?<\/dialog>/],
        ['HISTORY', /<section id="history-section"[\s\S]*?<\/section>/],
        ['WISHLIST NOTES', /<section\s+id="wanted-section"[\s\S]*?<\/section>/],
        ['TOAST', /<div class="toast"[\s\S]*?<\/div>/],
      ]) {
        const partial = original.match(pattern)?.[0];
        if (!partial) throw new Error(`Missing prototype section: ${marker}`);
        content = content.replace(`<!-- ${marker} -->`, partial);
      }
    }
    response.writeHead(200, {
      'Content-Type': `${file[1]}; charset=utf-8`,
      'Cache-Control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(500).end('The prototype could not load. Check the source files.');
  }
});
server.listen(8791, '127.0.0.1', () => console.log('App context: http://127.0.0.1:8791/'));
