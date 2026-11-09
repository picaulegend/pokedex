# Collect

A private Pokémon card collection built around the National Pokédex. The checklist has 1,025 species, from Bulbasaur to Pecharunt. Owning at least one card of a Pokémon completes its Pokédex entry.

The [cloud app](https://collect.postwork.tech) uses Cloudflare Workers and D1. The passkey setup keeps the existing owner account and its collection records. The [original Pages app](https://pokedex-1gj.pages.dev) remains a standalone checklist.

## Cloud app

- Track exact cards, quantities, and wanted cards for each Pokémon.
- Record when and where you bought, pulled, received, or traded for a card, with optional prices and private notes.
- Keep card history after selling, trading, giving away, or losing a copy. Use **Previously owned** in the Pokémon card filters to find cards with no copies left.
- Create named collections and select their cards by hand. One owned card can count towards several collections.
- Search shared saved cards first. Use **Search TCGdex** for an explicit external search.
- Select English or Japanese physical sets from saved set details. Search sets by name, source reference, or printed card count.
- Keep old checkmarks when the exact card is not yet recorded.
- Sync private records between devices. After online sign-in, changes made during a lost connection stay on the device until sync succeeds.
- Back up and restore cards, history, wishlist notes, quantities, wanted flags, collections, and old checkmarks as JSON.

The shared card catalogue starts empty. A card is saved when someone owns it, wants it, or selects it for a collection goal. Search results and previews are temporary. Set details are saved separately, without card lists. Images use source URLs.

The current scope is physical Pokémon cards in English and Japanese. Trainer cards, Energy cards, and digital Pocket cards are excluded. Collections based on rules and complete-set checklists remain planned work.

The app has a $0 monthly operating budget. It uses Workers Free and D1 Free. It has no R2 binding. Read [AGENTS.md](AGENTS.md) for the project rules and [the cloud guide](docs/cloud-preview.md) for setup, current limits, and operation.

Use the main navigation for **Pokédex**, **Cards**, **Collections**, and **Wishlist**. **Cards** shows all the cards you own. **Add card** starts a search. Open a card image for its details, finish, quantity, and collection membership. The Back button returns to the previous view. Select the header avatar to open your private **Profile**, choose an avatar, or manage your account. Select the save status in the header to open sync and backup tools.

In card details, **+** adds a copy quickly. **Add details** records how you got copies already counted. **Add entry** can also record new copies. **−** lets you choose the copy and record what happened; it lowers the owned count and keeps its history. Each finish has separate quantities, history, and wishlist notes. Dates, places, people, prices, and notes are optional and stay private on shared pages.

Cloud JSON backups use version 3 and include zero-owned cards with saved history. Version 2 cloud backups are still accepted. Restoring an older backup keeps saved later changes and does not count those past copies as owned again.

The cloud page starts with 48 Pokémon and adds more as you scroll. Card galleries show 48 cards at a time, with **Show more cards**. Filters use the full saved list. Saves keep existing images and controls in place. Search details stay in the URL for reloads, and card results appear before set details finish loading.

The cloud build includes browser icons, Apple and Android home screen icons, and a web app manifest. Icon shapes are in `scripts/lib/app-icons.mjs`; generated image files stay in `dist/`. Shared pages use the same icons through `/s/assets/`. The standalone checklist keeps an embedded icon so its downloaded HTML needs no extra files.

## Read-only sharing

Open a collection or the wishlist and select **Share**. Use **Preview page** to check the saved online view. **Create link** creates a public link that needs no visitor account. **Stop sharing** blocks future visits. Re-enabling creates a new link.

Shared pages show the latest saved online cards, with filters and image enlargement. They hide email addresses, exact copy quantities, card history, prices, private notes, and other collection names. A shared wishlist includes wanted cards and missing cards from collection goals.

## Local cloud preview

Use Node.js 22.13 or later. From the repository folder, run:

```sh
npm ci
cp .dev.vars.example .dev.vars
```

Set `ADMIN_EMAIL` in `.dev.vars`. Generate a different random value for each of `BETTER_AUTH_SECRET` and `OWNER_SETUP_TOKEN` with `openssl rand -hex 32`. Then run:

```sh
npm run dev
```

Open <http://localhost:8787/setup> and enter the setup code from `.dev.vars`. The command builds the cloud assets and applies migrations to a local database. Local settings and data stay out of Git.

To fetch and load the local set reference, run `npm run sets:local` after local migrations. Use `npm run sets:prepare` to prepare the data without a database change. The card catalogue stays empty until cards are added. See the cloud guide before a hosted update.

## Checks and deployment

```sh
npm run format:check
npm test
```

Install a test browser with `npx playwright install chromium`, or use an installed Chrome with `PLAYWRIGHT_CHANNEL=chrome npm test`. Browser tests use isolated databases on ports 8788 and 8789.

Use `npm run format` to format supported source and documentation files. Embedded checklist data, applied migrations, audit results, and test fixtures are excluded.

`npm run deploy` builds and deploys the configured private Worker. It does not apply database migrations, refresh set details, or change Access policies. The [cloud guide](docs/cloud-preview.md) covers these separate steps.

## Standalone checklist

Open `public/index.html` in a browser, or start a local server:

```sh
python3 -m http.server 8000 --directory public
```

Open <http://localhost:8000>. All Pokémon names and sprite images are in the HTML file. The saved file works offline. It has species checkmarks, name and number search, generation filters, grid and compact views, a missing list, backup and restore, and a print view.

Each browser and site address has separate checklist storage. Use **Back up**, then **Restore**, to move checkmarks. **Share missing** lists unchecked Pokémon for the chosen generation range; the main search and display filters do not shorten that list.

The standalone JSON backup and **Save HTML with progress** contain species checkmarks only. Use a cloud JSON backup to keep exact cards, quantities, wanted flags, and collections. A downloaded HTML copy from the cloud app is also a standalone checklist. The cloud app needs a connection to download that complete offline file.

For a separate Cloudflare Pages deployment, connect the repository and use these settings:

| Setting                | Value       |
| ---------------------- | ----------- |
| Production branch      | `main`      |
| Framework preset       | None        |
| Build command          | `exit 0`    |
| Build output directory | `public`    |
| Root directory         | Leave blank |

This publishes the standalone checklist. See the [Cloudflare static HTML guide](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/).

## Files

- `public/index.html`: standalone checklist, with embedded Pokémon data and sprites.
- `src/`: Worker API, card source handling, and cloud client.
- `migrations/`: database schema changes, applied in order.
- `scripts/`: cloud build, set reference, and isolated catalogue audit.
- `tests/`: unit and browser tests, with isolated fixtures.
- `docs/cloud-preview.md`: current cloud status, setup, and operation.
- `docs/catalogue-sample-audit.md`: historical source audit and its limits.
- `dist/`, `work/`, and `.wrangler/`: generated assets, audit files, and local data; excluded from Git.

## Catalogue audit

The audit covers English and Japanese 151, English Base Set, and English SVP Black Star Promos. These samples do not seed the app. Read the [sample audit](docs/catalogue-sample-audit.md) for the results and limits.

Run the audit with Python 3:

```sh
python3 scripts/catalogue_sample.py
```

The script saves source replies, a SQLite database, SQL, and a JSON report in `work/catalogue-sample/`. It also updates the audit document. Use `--offline` to reuse saved replies, or `--refresh` to fetch them again. `npm run catalogue:audit` prepares and loads a separate local D1 audit database; it cannot import into the app or a remote database.

## Data and credits

The checklist covers National Pokédex numbers #0001 to #1025. This range was checked on 29 October 2026.

Names and types come from [PokéAPI data](https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv). Pokémon sprites come from [PokéAPI sprites](https://github.com/PokeAPI/sprites). Trainer avatars come from [Pokémon Showdown](https://play.pokemonshowdown.com/sprites/trainers/). Card and set details come from [TCGdex](https://tcgdex.dev/); its data licence is included in `scripts/TCGdex-LICENSE.txt` and the cloud build.

This is an unofficial fan tool. Pokémon © Nintendo / Creatures / GAME FREAK. Pokémon names and artwork belong to their owners.
