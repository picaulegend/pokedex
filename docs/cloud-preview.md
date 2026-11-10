# Cloud preview guide

The cloud app uses Workers Static Assets, a Worker API, D1, and Better Auth passkeys. Use this guide for setup and operation. [AGENTS.md](../AGENTS.md) holds the cost and catalogue rules.

## Current state

Collect is the private cloud app at [collect.postwork.tech](https://collect.postwork.tech). It has separate accounts, Pokédex sync, exact card quantities, wanted cards, manual collections, and explicit card search. The original [Pages app](https://pokedex-1gj.pages.dev) remains a standalone checklist with separate browser storage.

The owner signs in with a passkey. The first passkey attaches to the existing administrator account. The account ID stays the same, so the app can read its collections and pending edits. Version preview URLs are disabled. The `/s/*` path serves enabled read-only share pages without sign-in.

The owner confirmed email code sign-in and Pokédex sync between devices on 1 November 2026. Automated checks cover the card, collection, search, and set picker flows. Live English and Japanese source card details were checked without saving them. The owner confirmed that external Arcanine search works. The new layout and full card and collection flows still need a real phone check by the owner.

Workers is on Free, D1 uses the free allowance, and the app has no R2 binding. The account's existing R2 subscription remains separate. The $0 monthly operating budget requires explicit approval before paid usage or a billing change. Check current free limits and account use before a large import or a new service.

## Cards and collections

- **Pokédex**, **Cards**, **Collections**, and **Wishlist** are the main destinations. Phones use bottom navigation; desktop uses a sidebar. Select the header avatar to open your private **Profile**. Select the save status to open **Sync and backups**.
- Select a Pokémon name in the Pokédex to open its gallery with owned and wanted cards, plus missing collection members. The tile shows the number of recorded cards. **Filters** shows only the filters that have two or more values in the current view. Open a card for its larger image, finish, quantity, wanted status, and collection memberships. Back navigation returns to the previous screen.
- **Add card** opens search. **Search cards** reads saved records. **Search TCGdex**, below the results, makes an explicit external search, with up to 24 results per page. Saved matches do not prove complete coverage. Changed search details grey out old results until the next search. Failed searches offer a retry.
- **Choose a set** searches saved names, source references, or printed card totals. It follows the selected language and shows source logos or symbols when available. Recently used sets appear first. Open **Set and card number** to use the picker. **Any set** is the first item in the list. Changing language clears the set. Choosing a set does not load its cards.
- Collector numbers accept `001`, `1`, or `001/165`. A set and number use the dedicated source lookup; the source list endpoint's exact number filter is unreliable.
- Previews are temporary. A shared card is saved when someone adds it as owned or wanted, or selects it for a collection goal. Normal saved-card views use D1. Images use source URLs, with a placeholder on failure.
- Card and variant IDs are stable and include language and source card references. Source variant references are scoped to their card. Finish, edition, foil pattern, stamps, and size are shown when supplied. Physical variant coverage can be incomplete.
- **Owned** accepts 0 to 999. An owned variant counts towards each linked Pokémon. A card can link to more than one Pokémon. **Add to wishlist** keeps a card wanted when a copy is already owned. On a card that is not saved, **＋** saves the first owned copy.
- Create a collection with **New collection**, then use **Add cards** from that collection. Adding an owned or wanted card keeps that collection as its destination. **Add to [collection name]** can add a goal card without a separate wanted flag. Collection membership is also available in card details. Rename and Delete are in **Manage**. Collections use variants selected by hand. Missing members appear in the wishlist. Each required variant counts once per collection; one owned variant can count towards several collections. Removing membership or deleting a collection keeps ownership.
- Old or simple checkmarks mean that the exact card is unknown. They stay separate from exact quantities. The card view can remove an old checkmark. Unchecking a Pokémon does not erase recorded cards.

The current scope is English and Japanese physical Pokémon cards. Trainer, Energy, and digital Pocket cards are excluded. Collections based on rules and complete-set checklist goals remain planned work.

## Private profile

Choose a trainer or **Default**, then select **Save avatar**. The account saves the choice online and shows it in the header on each device after sign-in or reload. The profile also gives access to passkeys, sign-out, and **Sync and backups**. Owners can create an invite from the profile.

Migration `0010_profile_avatar.sql` adds an optional avatar ID to each account. The private profile uses a fixed list of trainer sprites from [Pokémon Showdown](https://play.pokemonshowdown.com/sprites/trainers/). The browser loads the images from their source and shows a default icon if an image does not load. Public shares and collection backups do not include the avatar.

## Private card history

Each owned card finish can have entries for bought, pulled, gift, trade, or other. Dates, places or people, amounts paid, currencies, and notes are optional. Wishlist notes can store a target price, shop, link, and notes. **+** keeps the quick add flow. **Add details** describes copies already counted; **Add entry** can also add new copies.

Reducing a quantity opens a copy selector. A later change records sold, traded, given away, lost, other, or details not recorded. The owned count decreases, while the original entry and the later change remain saved. A card can have zero owned copies and a complete private history. The Pokémon gallery keeps its normal owned and wanted view; **Filters → Show → Previously owned** finds saved cards with no copies left. The same filter is available in collection views when relevant. Past copies do not count towards Pokédex progress or collection completion.

Migration `0006_card_history.sql` adds private `history_json` to inventory. It preserves existing quantities, wanted flags, revisions, and progress. History and ownership share one inventory revision and one local queued edit. Old clients and older queued changes that reduce quantities also keep history, with unknown dates and reasons when those details were not supplied. A conflict needs a choice between the device record and the online record, including that record's history and wishlist notes.

Cloud JSON backup version 3 includes history and wishlist notes, including records with zero owned copies. Version 2 cloud backups remain supported. Restore merges entries and later changes by ID and keeps recorded removals from older backups from becoming owned copies again. Shared links remain excluded. The standalone HTML and its exports still contain species checkmarks only.

History starts with six entries and up to six later changes per entry. **Show more** reveals the rest. Filters use the full saved history. Card images and controls stay in place during saves. Shared collection and wishlist pages never include history, prices, people, places, or private notes. No new external service, image storage, or billing plan is required.

Card history was deployed on 5 November 2026. All 88 automated checks passed: 37 unit and API checks and 51 browser checks. A private database backup was saved before migration. Before-and-after checks confirmed that existing records, quantities, revisions, sync positions, and sharing settings were preserved, with no foreign key errors. Live checks confirmed sign-in protection for the app, account routes, and private assets, plus the expected public share responses. No sample records were added to the hosted database.

## Rendering and saves

The cloud build replaces embedded Pokémon sprites with files that have a content hash in their names. These files use a long browser cache life. The HTML keeps only the small Pokémon reference and starts with 48 cards. More Pokémon appear as the page scrolls. A direct card or search link does not build a hidden Pokémon grid. Card galleries show 48 saved printings at a time, and filters use the full list. Printing still includes the full selected Pokédex.

Card details and galleries update existing page elements. Saving keeps card images, controls, keyboard focus, and open details in place. The Add button shows its pending state and then **Added ✓**. A new card added from a collection is imported and linked in one database transaction. Optional ownership is saved in that same transaction. A goal-only add does not create a temporary wanted record. Change IDs keep retries from repeating a write. Existing offline edits retain their saved queue and revision checks.

Search details are kept in the URL. A submitted search can run again after reload; an unfinished query remains ready to submit. Card results do not wait for set details. Changed inputs cancel obsolete search reads and clear the busy state. Set requests are shared while pending; a recent set reference can be reused from session storage for six hours. These stored references contain no card lists.

Local account reads use read-only browser transactions. An unchanged sync reply makes no account write. Related local edits can enter the queue in one transaction. Inventory, collection, and wishlist lookup values are calculated once per displayed state. Card details already read are reused by variant ID. A Pokémon lookup with missing details reads only that signed-in account's relevant saved cards, without sending all personal variant IDs in batches.

The complete standalone HTML is served separately at `/standalone` for checklist exports. Downloading it needs a connection. The downloaded file contains embedded images and species checkmarks and works offline. The cloud JSON backup remains the backup for exact cards and collections.

The 1 November 2026 browser comparison used isolated fixture data, a 390-pixel phone viewport, a four-times CPU slowdown, and a 250 ms delay per API request. These are local measurements, not real-user timing statistics.

| Check                                      |          Before |  After |
| ------------------------------------------ | --------------: | -----: |
| Initial HTML, before compression           | 1,601,862 bytes | 164 KB |
| Initial Pokémon rendered                   |           1,025 |     48 |
| Initial HTML elements                      |          14,416 |  1,133 |
| API requests for a new collection card     |               5 |      1 |
| Full card-screen replacements for that add |               5 |      0 |
| Local account writes for that add          |              13 |      1 |
| Local account writes for saved membership  |               7 |      3 |

The rendering and save changes were deployed on 1 November 2026. All 74 automated tests passed, including the full offline export, print restoration, unchanged sync reads, request cancellation, and public sharing. These code changes needed no database migration or Access policy change.

## Read-only sharing

Open a collection or the wishlist and select **Share**. **Preview page** opens a private preview. **Create link** creates a live public link; visitors need no account. The link can be copied or sent through the device share menu. **Stop sharing** blocks future page requests. Re-enabling creates a new link. Deleting a collection turns its link off, and restoring it does not restore sharing.

Collection pages show selected cards and owned/missing progress. Wishlist pages show all wanted cards, including missing collection goals, without ownership counts or other collection names. Shared pages hide account IDs, email addresses, and exact copy quantities. Each page shows up to 24 saved card variants, with filters and pagination. Visitors can enlarge images but cannot edit records or run external card searches. Cards use source image URLs. Shared HTML and data replies use `no-store`; links are checked on every request. An already opened page or saved copy can remain after sharing is turned off.

The private controls use `/api/shares`. The owner preview at `/api/shares/preview` requires a verified account matching its `account` query value. Other private API routes retain the account-header check. Public pages and their small asset allowlist use `/s/*` before private authentication. Only GET and HEAD are allowed there. A token selects one account and view; public query parameters cannot change that scope.

Migration `0005_share_links.sql` adds the link table and a collection-deletion trigger. The Worker handles `/s/*` before it checks the account session. Check an anonymous share link and the signed-in private preview after a deployment.

Shared links are not included in collection JSON backups. Restoring a backup must not enable public sharing. Sharing controls need a connection; queued collection edits appear on shared pages after they are saved online.

Sharing was deployed on 1 November 2026. All 63 automated tests passed. Hosted checks confirmed public share assets, unavailable-link replies, rejected public writes, and retained sign-in protection for the app and private API. The database change kept all existing records. No account view was enabled for sharing during setup.

## Shared catalogue and set reference

New databases start with no card records. Card details are shared across accounts. Private records stay separate for each account. Only an explicitly enabled shared view publishes its limited card list and progress. External search results are not saved. Short-lived source replies can be reused. Adding the same source card and language reuses the same record.

All available English and Japanese physical set details can be saved in advance: names, source references, logo and symbol URLs, and card counts. The set reference contains no card lists. The picker reads D1 and reuses loaded lists on the device. It does not call TCGdex. Refresh is manual.

Use `npm run sets:prepare` to prepare an update without a database change. Data and SQL go in the ignored `work/set-reference/` folder. After local migrations, `npm run sets:local` fetches and loads the local preview. For a hosted update, check the free allowances and required migrations, take a database backup, then run:

```sh
node scripts/sync-sets.mjs --apply --remote
```

The command writes only set details and import dates. Repeated imports keep the same IDs and update changed details. Preserve all card and private records.

The source check on 1 November 2026 found 205 English and 202 unique Japanese physical set references, with 15 Pocket entries excluded. These are dated counts, not a promise of complete source coverage. Some sets lack a logo or symbol and remain selectable by text.

Two Japanese references have conflicting names:

| Source reference | Canonical name   | Other name listed under the same reference |
| ---------------- | ---------------- | ------------------------------------------ |
| `BW3a`           | ヘイルブリザード | サイコドライブ                             |
| `BW8a`           | ライデンナックル | ラセンフォース                             |

The importer checks the canonical set reply and retains a visible conflict note. It does not invent references for the missing separate entries. A source correction is needed before those entries can be selected separately.

The hosted import on 1 November 2026 wrote 1,632 rows and left the database at 524,288 bytes. A before-and-after comparison confirmed that all card and private records were unchanged. No card checklists were stored.

The historical card samples remain isolated audit data. The [README](../README.md#catalogue-audit) explains the audit. `npm run catalogue:prepare` prepares audit SQL only. `npm run catalogue:audit` loads `.wrangler/catalogue-audit-state`, separate from app and test data. It refuses remote imports and ordinary app imports. Candidate image corrections need visual checks before use.

## Local development and checks

Use Node.js 22.13 or later. Run `npm ci`, then copy `.dev.vars.example` to `.dev.vars`. Set `ADMIN_EMAIL` and use a different random value for each of `BETTER_AUTH_SECRET` and `OWNER_SETUP_TOKEN`. Use `openssl rand -hex 32` to generate each value. Remove `LOCAL_DEV_AUTH=true` from an older local configuration to test sign-in with a passkey.

`npm run dev` builds assets and applies local migrations to `.wrangler/preview-state`. Open <http://localhost:8787/setup> and enter `OWNER_SETUP_TOKEN`. Use the same hostname each time. The browser ties the passkey to this hostname.

`public/index.html` is the standalone checklist. The build creates cloud assets in `dist/`. A normal build excludes source test fixtures.

Run `npm run format:check` and `npm test`. Install a browser with `npx playwright install chromium`, or use `PLAYWRIGHT_CHANNEL=chrome npm test`. `npm run format` applies the shared format. It excludes embedded checklist data, migrations, audit results, and test fixtures.

Browser tests run `scripts/test-server.mjs`. It rebuilds test assets and starts loopback servers on ports 8788 and 8789. Each server resets only its own test database. The passkey server uses a virtual authenticator and an existing owner fixture. The other server uses local test identities and saved source replies. Checks cover signed identities, refused accounts, account separation, retries, stale changes, offline edits, backups, catalogue growth, collections, set selection, and standalone HTML export.

For source request changes, also check a live search and card preview from Cloudflare. Local tests with saved replies and direct requests from Node do not check the hosted connection. Workers support `redirect: 'manual'` or `redirect: 'follow'`; the app uses `manual` and refuses redirects. Using `redirect: 'error'` prevents the request from reaching the source. See the [Workers fetch reference](https://developers.cloudflare.com/workers/runtime-apis/fetch/).

## Deploy the passkey change

Keep the current Worker, hostname, and D1 database. Store a private database backup in the ignored `.wrangler/` folder. Keep signed download URLs out of shared output.

1. Run the format check and tests. Check that the hosted `ADMIN_EMAIL` matches the email on the existing administrator row.
2. Generate two different random values with `openssl rand -hex 32`. Set them as the Worker secrets `BETTER_AUTH_SECRET` and `OWNER_SETUP_TOKEN` with Wrangler. Keep the setup code private.
3. Back up D1. Apply the additive migration with `npx wrangler d1 migrations apply carddex-preview --remote`. Run `npm run deploy`. This command builds and deploys the Worker.
4. Remove the Cloudflare Access protection for the legacy Worker hostname after the Worker starts to require passkey sessions. Check that a new browser session reaches Collect sign-in and that private API requests return 401. Keep other Cloudflare applications and policies in place.
5. On the hosted hostname, open `/setup` and enter the setup code. Create the first passkey and sign in. Check the existing collection and test an anonymous share link. Use **Manage passkeys** in the account menu to add a second passkey. Remove the `OWNER_SETUP_TOKEN` secret when setup is complete.

The setup code can open registration only until the account has its first passkey for the primary hostname. Setup never changes an existing account ID. The last passkey on the account cannot be removed in the app. A fresh database creates its owner from `ADMIN_EMAIL` during setup.

The owner can select **Invite someone** in the account menu. Enter the recipient's email address and copy the invite link. The link expires after 48 hours or after one person uses it to create a passkey. The recipient starts with a separate private collection.

For another deployment, set `PASSKEY_ORIGIN` to the exact HTTPS address. When changing hostnames, set `PASSKEY_LEGACY_ORIGIN` to the previous address so its passkeys and links still work. Set a new `OWNER_SETUP_TOKEN` and register the owner passkey at `/setup` on the primary hostname. Both hostnames use the same saved accounts. The browser keeps pending local edits at the hostname where you made them.

## Backups and old checkmarks

The Pages and Worker addresses have separate browser storage. To move the old checklist:

1. Open the Pages app and select **Back up**.
2. Sign in to the cloud app. Select the save status in the header, select **Restore from backup**, and choose the file.
3. Choose **Add these checkmarks to my collection**.
4. Wait for **All changes saved online**. Check the result on another device.

If old checkmarks exist at the same address, **Import old checkmarks** offers a separate import. They are not merged into an account automatically.

**Download backup** creates a cloud JSON backup with quantities, wanted flags, active collections, binder layouts, old checkmarks, and source references. **Restore from backup** shows the target account, record counts, and merge rules before **Merge backup** confirms the change. Restore keeps the higher quantity for each variant and combines matching collection members. If a collection already has a binder layout, restore keeps that layout. It fetches missing card details only for backup records and saves them after confirmation. Source access is needed if those cards are not already saved. Older backups can use retained sample identifiers; otherwise, add a missing card through search first.

**Download offline checklist** downloads a standalone HTML file and needs a connection. A standalone JSON backup or HTML export contains species checkmarks only. Use cloud JSON for the full collection. A downloaded HTML checklist works offline and has separate browser storage.

## Sync and offline use

- Records and queued changes belong to one account. Each request is bound to the account that opened the page. If sign-in changes, reload before saving. Pending changes stay with their original account.
- Each progress, inventory, and collection record has a revision. A stale change requires a choice. A repeated change ID is not applied twice.
- A sync cursor and database indexes fetch changed records only. Visible pages check every five minutes, after edits, on return to the page, and when the connection returns.
- Pending changes stay in IndexedDB during a lost connection. The app retries when online. For conflicting Pokédex edits, choose **Keep this device** or **Use online record**.
- Open the cloud app online to identify the account. Edits can then be queued during a lost connection. Opening the cloud app from scratch while offline remains planned work.

## Next checks

1. Check the hosted set picker and an English and Japanese card addition with the owner. Check wanted status, a manual collection, and sync on a second device.
2. Keep source gaps visible. Check physical variants and uncertain images when a real collection needs them.
3. Decide the next collection flow after this use check. Rule-based goals, set checklists, and offline startup are not implemented yet.
