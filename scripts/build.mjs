import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { iconDataUrl, writeAppIcons } from './lib/app-icons.mjs';
import { loginSpriteIds } from '../src/sign-in-art.js';

await rm('dist', { recursive: true, force: true });
await mkdir('dist');
const html = await readFile('public/index.html', 'utf8');
await writeAppIcons('dist');
await writeFile(
  'dist/manifest.webmanifest',
  JSON.stringify({
    id: '/',
    name: 'Collect',
    short_name: 'Collect',
    description: 'Your private Pokémon card collection, wishlist, and Pokédex progress.',
    lang: 'en',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f8f3',
    theme_color: '#233a34',
    icons: [192, 512].map((size) => ({
      src: `/icon-${size}.png`,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: 'any maskable',
    })),
  }),
);
// Keep the self-contained export separate from the small cloud page.
const standaloneHtml = html.replace(
  /<link rel="icon"[^>]*>/,
  `<link rel="icon" href="${iconDataUrl}">`,
);
await writeFile('dist/standalone.html', standaloneHtml);
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
const appModules = [
  'cloud.js',
  'cloud-store.js',
  'library.js',
  'collection-binder.js',
  'binder-model.js',
  'navigation.js',
  'shell.js',
  'profile.js',
  'trainer-card.js',
  'badge-definitions.js',
  'avatars.js',
  'ui.js',
  'card-search-ui.js',
  'card-detail.js',
  'card-orders.js',
  'card-price-ui.js',
  'card-history-ui.js',
  'card-history-model.js',
  'set-picker.js',
  'share-controls.js',
];
const appTheme = await readFile('src/client/app-theme.css');
async function themedStyles(file) {
  return Buffer.concat([appTheme, await readFile(`src/client/${file}`)]);
}
const appAssets = [
  ['cloud.css', await themedStyles('cloud.css')],
  ...(await Promise.all(
    appModules.map(async (file) => [file, await readFile(`src/client/${file}`)]),
  )),
];
// Relative imports must use the same asset version as the entry point and stylesheet.
const appHash = createHash('sha256');
for (const [file, bytes] of appAssets)
  appHash.update(file).update('\0').update(String(bytes.length)).update('\0').update(bytes);
const appPath = `/app/${appHash.digest('hex').slice(0, 16)}`;
await mkdir(`dist${appPath}`, { recursive: true });
for (const [file, bytes] of appAssets) await writeFile(`dist${appPath}/${file}`, bytes);
const cloudDescription =
  'Your private Pokémon card collection. Track your cards, build collections, and keep a wishlist in Pokédex order.';
await writeFile(
  'dist/index.html',
  cloudHtml
    .replace(
      /<title>([^<]*)<\/title>/,
      '<title data-standalone-title="$1">Collect — Your Pokémon card collection</title>',
    )
    .replace(
      /<link rel="icon"[^>]*>/,
      '<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">\n<link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">\n<link rel="manifest" href="/manifest.webmanifest">',
    )
    .replace(
      /<meta name="description" content="([^"]*)">/,
      (_, standaloneDescription) =>
        `<meta name="description" content="${cloudDescription}" data-standalone-description="${standaloneDescription}">`,
    )
    .replace(
      '<meta charset="utf-8">',
      '<meta charset="utf-8">\n<meta name="robots" content="noindex,nofollow,noarchive">\n<meta property="og:site_name" content="Collect">\n<meta property="og:title" content="Collect — Your Pokémon card collection">\n<meta property="og:description" content="' +
        cloudDescription +
        `">\n<meta property="og:type" content="website">\n<script id="cloud-mode">window.CARDDEX_CLOUD=true;document.documentElement.classList.add("cloud-app");</script>\n<link rel="stylesheet" data-cloud-style href="${appPath}/cloud.css">` +
        appModules
          .map((file) => `<link rel="modulepreload" data-cloud-style href="${appPath}/${file}">`)
          .join(''),
    )
    .replace(
      '</body>',
      `<script type="module" data-cloud-client src="${appPath}/cloud.js"></script>\n</body>`,
    ),
);
for (const file of ['share.js', 'share.css']) await copyFile(`src/client/${file}`, `dist/${file}`);
const loginSprites = pokemon
  .filter(({ id }) => loginSpriteIds.includes(id))
  .map(
    ({ id, image }) => `.login-sprite[data-pokemon="${id}"] { --starter-image: url("${image}"); }`,
  )
  .join('\n');
await writeFile(
  'dist/passkeys.css',
  Buffer.concat([await themedStyles('passkeys.css'), Buffer.from(loginSprites + '\n')]),
);
await build({
  entryPoints: ['src/client/passkey-ui.js'],
  bundle: true,
  minify: true,
  format: 'esm',
  outfile: 'dist/passkey-ui.js',
});
await copyFile('scripts/TCGdex-LICENSE.txt', 'dist/TCGdex-LICENSE.txt');
await writeFile(
  'dist/_headers',
  '/\n  Cache-Control: private, no-store\n/sprites/*\n  Cache-Control: public, max-age=31536000, immutable\n',
);
if (process.argv.includes('--test-fixtures'))
  await copyFile('tests/fixtures/source-cards.json', 'dist/__test-source.json');
console.log('Worker assets prepared in dist/.');
