# Project instructions

## Communication

- Use ASD-STE100 Simplified Technical English for technical topics.

## Cost

- Keep this a small, private app with a $0 monthly operating budget.
- Use Workers Free and D1 Free. Check current free limits and account use before large imports or new services.
- Do not enable paid usage or change billing plans without explicit user approval.
- The account has an existing R2 subscription. This app does not use R2. Get approval before adding R2 use; leave existing account services in place.
- Prefer source image URLs, stored catalogue data, and queries that read only the required records. Avoid repeated full data reads.

## Card catalogue

- Start with no card records. Add a shared card record only when a person owns it, wants it, or selects it for a collection goal.
- Search saved cards in D1 first. Provide an explicit external search even when saved matches exist. Local results do not prove complete coverage.
- Keep external search results temporary. Fetch full details for a selected card when needed; reuse saved records for normal views.
- Share card details across accounts. Keep ownership, wanted status, and collection membership private by default. Public links expose only an explicitly enabled view.
- Open a Pokémon with that person's owned and wanted cards. Use a separate search to add other cards.
- Save all available English and Japanese physical set metadata as a shared reference for the set picker. This includes names, source IDs, image URLs, and card counts, without card lists.
- Fetch a set checklist only when a collection goal requires it. Do not preload card records or unrelated checklists.
- Keep catalogue samples in isolated audit and test data. Preserve all existing user records during catalogue changes.

## Public sharing

- Share only a selected collection or the account's wishlist. Require the owner to enable each link. Visitors need no account and cannot edit records.
- Show saved online data on each page request. Hide email addresses, exact copy quantities, account IDs, and other collection names.
- Read saved card data only. Public views must not search the external source or import cards.
- Check the link and its enabled state on every request. Do not cache shared page content. Turning a link off blocks future requests; re-enabling creates a new link. Deleting a collection turns its link off.
- Only `/s/*` bypasses Cloudflare Access. Keep account and edit routes protected. The private preview requires a verified, matching account.
- Keep shared links out of collection JSON backups. Restoring a backup must not enable sharing.

## Maintenance

- Keep existing controls and images in place during saves. Show pending and completed actions without replacing a screen. Keep large lists small on first render; filters must still use all saved records.
- Use read-only local transactions for account reads. Keep related edits in one local transaction and preserve the existing offline queue and conflict checks.
- Keep the cloud app and standalone checklist distinct in code and notes. Standalone exports contain species checkmarks only; cloud JSON backups contain the full card collection.
- Do not rewrite applied database migrations. Add a new migration for a schema change.
- Keep `wrangler.jsonc` valid as JSON. The Access setup script reads it with `JSON.parse`; the format override preserves this requirement.
- Run `npm run format:check` and the relevant tests before deployment. Browser tests must use the isolated test database, not preview data.
- For external source request changes, also check live search and card details from Cloudflare. Local tests with saved source replies do not check the hosted connection.
- Keep secrets, private backups, generated assets, and local database files out of Git and shared output.
