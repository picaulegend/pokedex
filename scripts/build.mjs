import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';

await rm('dist', { recursive: true, force: true });
await mkdir('dist');
const html = await readFile('public/index.html', 'utf8');
// Keep the self-contained export separate from the small cloud page.
await writeFile('dist/standalone.html', html);
await mkdir('dist/sprites');
const data = html.match(/<script id="pokemon-data" type="application\/json">([\s\S]*?)<\/script>/);
if (!data) throw new Error('The Pokémon reference is missing.');
const pokemon = JSON.parse(data[1]);
for (const item of pokemon) {
  const image = item.image.match(/^data:image\/png;base64,(.+)$/);
  if (!image) throw new Error('Unexpected Pokémon image format.');
  const bytes = Buffer.from(image[1], 'base64');
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  item.image = `/sprites/${item.id}-${hash}.png`;
  await writeFile(`dist${item.image}`, bytes);
}
const cloudHtml = html.replace(
  data[0],
  `<script id="pokemon-data" type="application/json">${JSON.stringify(pokemon)}</script>`,
);
const cloudDescription =
  'A private Pokémon card collection with Pokédex progress, wanted cards, and shared card search.';
await writeFile(
  'dist/index.html',
  cloudHtml
    .replace(/<title>([^<]*)<\/title>/, '<title data-standalone-title="$1">$1</title>')
    .replace(
      /<meta name="description" content="([^"]*)">/,
      (_, standaloneDescription) =>
        `<meta name="description" content="${cloudDescription}" data-standalone-description="${standaloneDescription}">`,
    )
    .replace(
      '<head>',
      '<head>\n<script id="cloud-mode">window.CARDDEX_CLOUD=true;document.documentElement.classList.add("cloud-app");</script>\n<link rel="stylesheet" data-cloud-style href="/cloud.css">' +
        [
          'cloud.js',
          'cloud-store.js',
          'library.js',
          'navigation.js',
          'shell.js',
          'ui.js',
          'card-search-ui.js',
          'card-detail.js',
          'set-picker.js',
          'share-controls.js',
        ]
          .map((file) => `<link rel="modulepreload" data-cloud-style href="/${file}">`)
          .join(''),
    )
    .replace(
      '</body>',
      '<script type="module" data-cloud-client src="/cloud.js"></script>\n</body>',
    ),
);
for (const file of [
  'cloud.js',
  'cloud-store.js',
  'cloud.css',
  'library.js',
  'set-picker.js',
  'navigation.js',
  'shell.js',
  'ui.js',
  'card-search-ui.js',
  'card-detail.js',
  'share-controls.js',
  'share.js',
  'share.css',
])
  await copyFile(`src/client/${file}`, `dist/${file}`);
await copyFile('scripts/TCGdex-LICENSE.txt', 'dist/TCGdex-LICENSE.txt');
await writeFile(
  'dist/_headers',
  '/sprites/*\n  Cache-Control: public, max-age=31536000, immutable\n',
);
if (process.argv.includes('--test-fixtures'))
  await copyFile('tests/fixtures/source-cards.json', 'dist/__test-source.json');
console.log('Worker assets prepared in dist/.');
