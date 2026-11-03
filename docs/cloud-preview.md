# Cloud preview guide

The cloud app uses Workers Static Assets, a Worker API, D1, and Cloudflare Access. Use this guide for setup and operation. [AGENTS.md](../AGENTS.md) holds the cost and catalogue rules.

## Current state

The private cloud app is at [carddex-preview.pohon.workers.dev](https://carddex-preview.pohon.workers.dev). It has separate accounts, Pokédex sync, exact card quantities, wanted cards, manual collections, and explicit card search. The original [Pages app](https://pokedex-1gj.pages.dev) remains a standalone checklist with separate browser storage.

The administrator email is a Worker secret. Access uses email code sign-in and currently allows only the administrator. Version preview URLs are disabled. The separate `/s/*` path serves explicitly enabled read-only share pages without sign-in. The API also verifies signed Access tokens and the app's approved email list.

The owner confirmed email code sign-in and Pokédex sync between devices on 1 November 2026. Automated checks cover the card, collection, search, and set picker flows. Live English and Japanese source card details were checked without saving them. The owner confirmed that external Arcanine search works. The new layout and full card and collection flows still need a real phone check by the owner.

Workers is on Free, D1 uses the free allowance, and the app has no R2 binding. The account's existing R2 subscription remains separate. The $0 monthly operating budget requires explicit approval before paid usage or a billing change. Check current free limits and account use before a large import or a new service.

## Cards and collections

- **Pokédex**, **Collections**, and **Wishlist** are the main destinations. Phones use bottom navigation; desktop uses a sidebar. The header keeps save status visible in every view. Open its menu for account details, sync controls, and backups.
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

Migration `0005_share_links.sql` adds the link table and a collection-deletion trigger. Take a private database backup before applying it remotely. After deploying the share handler, run `npm run sharing:plan`, then `npm run sharing:apply` to create or verify a separate Access application for `carddex-preview.pohon.workers.dev/s/*` with one Bypass policy. This command verifies the original administrator-only application and leaves it in place. Check anonymous `/s/*` requests and signed-in `/api/*` protection after setup. No billing plan or image storage change is required.

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

Use Node.js 22.13 or later. Run `npm ci`, copy `.dev.vars.example` to `.dev.vars`, and set `ADMIN_EMAIL`. Local settings are excluded from Git.

`npm run dev` builds assets and applies local migrations. Open <http://127.0.0.1:8787>. It uses `.wrangler/preview-state`. Local sign-in requires `LOCAL_DEV_AUTH=true` and a loopback address. `X-Carddex-Dev-Email` can select a test identity listed in `INVITED_EMAILS`; it cannot authenticate a public request.

`public/index.html` is the standalone checklist. The build creates cloud assets in `dist/`. A normal build excludes source test fixtures.

Run `npm run format:check` and `npm test`. Install a browser with `npx playwright install chromium`, or use `PLAYWRIGHT_CHANNEL=chrome npm test`. `npm run format` applies the shared format. It excludes embedded checklist data, migrations, audit results, and test fixtures.

Browser tests run `scripts/test-server.mjs`. It rebuilds test assets, resets only `.wrangler/test-state`, and starts the loopback server on port 8788. Test identities and source replies are isolated from the manual preview. Checks cover signed identities, refused accounts, account separation, retries, stale changes, offline edits, backups, catalogue growth, collections, set selection, and standalone HTML export.

For source request changes, also check a live search and card preview from Cloudflare. Local tests with saved replies and direct requests from Node do not check the hosted connection. Workers support `redirect: 'manual'` or `redirect: 'follow'`; the app uses `manual` and refuses redirects. Using `redirect: 'error'` prevents the request from reaching the source. See the [Workers fetch reference](https://developers.cloudflare.com/workers/runtime-apis/fetch/).

## Deployment and Access

The current Worker, database, and Access application are already configured. Do not create replacements for routine updates. Keep private backups in the ignored `.wrangler/` folder. Database exports can print signed download URLs; keep these out of logs and shared output.

For a code update, run the checks, then `npm run deploy`. This builds and deploys the Worker. It does not apply migrations, refresh sets, or change Access. Before a required hosted migration, back up the database, then run:

```sh
npx wrangler d1 migrations apply carddex-preview --remote
```

Do not rewrite applied migrations. Add a new migration for a schema change. Check sign-in and the affected flows after deployment.

### Access setup from the terminal

Access setup uses the Cloudflare API. The current Wrangler OAuth login does not supply Access management scopes. For setup or repair, create a token limited to the configured account, with these account permissions:

- **Access: Apps and Policies — Edit**
- **Access: Organizations, Identity Providers, and Groups — Edit**

Copy `.env.example` to `.env.cloudflare` and put the token there. Keep it out of Git and logs. Set the administrator email in `.dev.vars`.

`npm run access:plan` shows a read-only plan. `npm run access:apply` creates required settings and reuses matching settings. It stops if a new provider could change another app's sign-in options, or if the existing preview policy differs from the expected policy. It allows only the configured administrator, writes the issuer and audience to `wrangler.jsonc`, and disables version preview URLs. Deploy after a setup change. Deployment can use Wrangler OAuth; it does not need the Access token.

Invitations require the same approved emails in the app's `INVITED_EMAILS` secret and the Access policy. The current setup script manages the administrator-only policy. Review and change both lists together when invitations are needed.

### A separate deployment

These steps are for a new account or deployment, not the current preview:

1. Sign in with `npx wrangler login` and set the intended account in `wrangler.jsonc`.
2. Create a separate database with `npx wrangler d1 create carddex-preview`. Set its returned ID in the configuration.
3. Apply remote migrations. Set `ADMIN_EMAIL` with `npx wrangler secret put ADMIN_EMAIL`.
4. Configure Access for every public hostname, with email code sign-in and the approved email list.
5. Set `ACCESS_TEAM_DOMAIN` to the HTTPS team address without a trailing slash. Set `ACCESS_AUD` to the app's audience tag. The terminal setup can write these values.
6. Deploy and check sign-in and account separation. Keep local authentication disabled on public hosts.

References: [Access applications API](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/create/), [Zero Trust organization API](https://developers.cloudflare.com/api/resources/zero_trust/subresources/organizations/methods/create/), [Access on Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [token verification](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), and [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).

## Backups and old checkmarks

The Pages and Worker addresses have separate browser storage. To move the old checklist:

1. Open the Pages app and select **Back up**.
2. Sign in to the cloud app, open the header account menu, select **Restore collection**, and choose the file.
3. Choose **Add these checkmarks to my collection**.
4. Wait for **All changes saved online**. Check the result on another device.

If old checkmarks exist at the same address, **Import old checkmarks** offers a separate import. They are not merged into an account automatically.

**Download backup** creates a cloud JSON backup with quantities, wanted flags, active collections, old checkmarks, and source references. **Restore from backup** shows the target account, record counts, and merge rules before **Merge backup** confirms the change. Restore keeps the higher quantity for each variant and combines matching collection members. It fetches missing card details only for backup records and saves them after confirmation. Source access is needed if those cards are not already saved. Older backups can use retained sample identifiers; otherwise, add a missing card through search first.

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
