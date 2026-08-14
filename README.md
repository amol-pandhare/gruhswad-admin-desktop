# Gruhswad Admin Desktop

Independent Gruhswad kitchen operations app. Neon is the primary source for web orders and synchronized business data; SQLite keeps an offline desktop cache plus local expenses and reporting data.

While running, the app checks Neon every 60 seconds for newly persisted website enquiries. The first run establishes a baseline; later starts catch up missed rows, refresh the Enquiries badge/list, and show deduplicated native notifications.

Current release: **0.3.3**. The application includes Overview, cloud Orders, Catalog, One-day menu, Operations, Expenses, Reports, Sync Centre, and Settings. The WhatsApp Business inbox backend remains present, but its renderer shortcut is currently disabled and marked **Coming soon**.

## Current behavior

- **Overview** combines online and local manual orders for revenue, order counts, open value, averages, and recent activity. Unresolved conflicts produce a prominent Sync Centre CTA.
- **Orders** has All, Online, and Manual views under one section. Online orders remain Neon-backed; structured manual orders, custom lines, statuses, and payments stay local-only. Shared service-date and source filters apply across the views.
- **Enquiries** searches and filters Party, Bulk, and Tiffin requests, shows complete captured customer/requirement/item snapshots and event history, opens trusted contact actions, and changes status through Neon's restricted transition function.
- **Customers** combines pulled Neon profiles with locally created profiles, supports email, archive/restore, WhatsApp/email shortcuts, and prefilled manual-order creation. Customer changes synchronize only through the explicit Sync Centre push.
- **Catalog** supports add/edit/archive/restore for items, category add/rename/reorder/activate/deactivate, web-compatibility control, bundles, and a visual food-image picker. Catalog Preview is an admin presentation mode that hides editing controls and empty categories; it is not a faithful public-site preview.
- **Publish menu** saves either a one-day or weekly publication locally, supports one optional Today's Special, clears builder selections, exports compact and photo PDFs, previews and exports template PNGs, and shares dish names and prices through WhatsApp. One-day dates resolve to tomorrow in India; weekly output displays a rolling seven-day window. All exports use the latest locally saved publication.
- **Operations** uses accordion sections for runtime brand, contact, ordering, fulfilment, Party/Bulk guest capacity, private backup-email recipient, service area, platforms, public location, an ordered themed announcement collection, the same-day preorder window, and optional India-calendar closures.
- **Sync Centre** previews pulls and pushes, resolves conflicts, keeps audit history, and publishes verified menu images to Google Cloud Storage.
- **Settings** manages encrypted connection secrets and GCS credentials, backups, restore, and application updates.

Closing the application with unresolved conflicts or pushable dirty records opens a native warning. **Go to Sync Centre** keeps the app open and navigates there; **Exit Anyway** preserves the pending state and closes the app.

The sidebar includes the approved **Powered by Alpha Initiatives** attribution at its lower-left edge. Activating it opens <https://alphinitive.vercel.app/> through a fixed, main-process allowlisted action; the renderer cannot supply an arbitrary external URL.

## Local development

1. Install Node 22 and pnpm 10.
2. Run `pnpm install`.
3. Run `pnpm dev`.
4. Enter the webhook URL, inbox token and rotated least-privilege Neon sync URL under **Settings**. Secrets are encrypted with Electron `safeStorage`.
5. To publish generated menu images, import a least-privilege Google Cloud service-account JSON under **Settings**. The credential is encrypted with `safeStorage`; the Sync Centre publishes the latest verified master and one-day exports to the configured bucket (default `fb-image-store`) under `menus/`.
6. Full catalog item edits can choose a packaged food image or browse for JPEG, PNG, or WebP content. Saved images upload to `menu-items/{item-id}.{ext}`, are cached locally for desktop/PDF use, and store only `{item-id}.{ext}` in `image_asset`. Public web consumers resolve that filename as `https://storage.googleapis.com/fb-image-store/menu-items/{image_asset}`.

Local image selection is validated in the trusted main process, limited to 10 MB, and represented in the renderer by a short-lived opaque token. Images upload only when the full item save succeeds. Selecting the placeholder removes the previous cloud object; an extension change also cleans up the old object so each item has at most one cloud image.

The SQLite database is created in Electron's per-user application-data directory. The bundled master-menu snapshot is used only to seed an empty database; subsequent reads come from SQLite.

## Local data profiles

Settings exposes two fixed, restart-switched SQLite profiles. Production remains at `C:\Users\amolp\AppData\Roaming\gruhswad-admin-desktop\gruhswad-admin.db`; Intensive testing uses `C:\Users\amolp\AppData\Roaming\gruhswad-admin-desktop-testing\gruhswad-admin.db`. The active selection is stored outside both profiles at `C:\Users\amolp\AppData\Roaming\gruhswad-admin-desktop-profile.json` so it can be resolved before SQLite opens.

Create or refresh the test copy only from the Production profile. The app uses SQLite's online backup API, validates integrity and migration history, and preserves the previous test database as a timestamped safety copy. WAL/SHM files, encrypted secrets, caches, and staged restores are not copied. The Intensive testing profile forces `APP_ENV=prod`, which in this deployment intentionally selects `DATABASE_URL_PROD` for the designated least-privilege Neon child branch.

Packaged applications load append-only migrations from `resources/drizzle`. Electron Builder's `extraResources` entry must remain in place or fresh installs and upgrades will fail at startup.

## Neon permissions

Use separate least-privilege roles. Restrict the desktop sync role to the synchronized catalog, settings, publication, customer, address, order, line, and event tables, plus read-only enquiry/event access and execution of the enquiry transition function. Keep the webhook role restricted to `whatsapp_inbox`. Never use a Neon owner credential in the application.

Apply `neon-migrations/0002_enquiry_read_access.sql`, `neon-migrations/0003_desktop_sync_role.sql`, and `neon-migrations/0004_enquiry_seen_state.sql` as the Neon owner or migration role. Migration `0004` adds `enquiries.seen_at` and grants the group role execution of `gruhswad_mark_enquiry_seen(uuid)`. The application connection must use the dedicated login role that is a member of `gruhswad_desktop_sync`; do not place an owner URL in Settings or `.env`. Apply the migrations separately to every Neon branch used by the app because roles, passwords, and branch schema state must be verified for the target endpoint.

## Offline synchronization

- Orders are refreshed from Neon into SQLite and remain readable offline.
- WhatsApp notification outcomes are mirrored from Neon for order-detail visibility. The desktop never sends notifications itself; synchronized status changes use Neon's shared transition function and transactional outbox.
- On launch, the app opens from SQLite immediately and performs one silent Neon pull when a connection is configured.
- **Pull from Neon** previews and merges remote changes while preserving dirty local records.
- **Push to Neon** previews and sends only compatible dirty records.
- Overlapping edits become explicit conflicts in **Sync Centre**.
- Local expenses, payments, manual orders, reports, and WhatsApp imports are never pushed. Customer profiles created while recording a manual order are separate synchronized records and can be pushed explicitly.
- A one-day menu reaches the website only after an explicit push.
- Dashboard conflict alerts and the safe-exit warning use a fast local-only attention check and do not depend on Neon connectivity.
- Landing announcements synchronize together as `{ maxAnnouncements, items }` in the `announcement` app-setting record. The admin limit is 1-6 (default 6); overflow items remain stored but disabled, and each ordered item supports a theme, optional schedule, and paired HTTPS CTA.
- Scheduled operations closures are synchronized inside the existing `operations` app-setting record. A one-day closure stores equal start/end dates; ranges are inclusive. Clearing restores `open: true` locally and still requires the normal Sync Centre push to reach the storefront.
- Party/Bulk enquiry capacity is stored as `maxPartyBulkGuests` in the same Operations app-setting (1-500, default 25 for legacy records). Save locally and push Operations from Sync Centre before the storefront uses a change.
- The enquiry poll refreshes the badge and visible Enquiries list immediately when Neon returns new rows. Native alerts can be enabled and tested in Settings; if Windows blocks or does not support them, the running app shows an in-app fallback while continuing cursor advancement.
- The 60-second unread-count reconciliation treats Neon HTTPS timeouts and connection resets as temporary unavailability. It preserves the last known badge and retries later instead of rejecting the IPC handler or displaying a false zero; schema and permission errors still surface for correction.
- Enquiry unread state is separate from workflow status. Opening an enquiry marks it seen through the restricted Neon function, immediately updates the unread badge, and leaves `new`, `contacted`, `quoted`, `converted`, or `closed` unchanged.
- Backup notification email is stored in the separate private `notification` app-setting. Save it locally and push Operations through Sync Centre to the intended Neon branch. The web deployment additionally requires `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL`; delivery failure is backup-only and never blocks the persisted customer WhatsApp flow.

Database selection uses `APP_ENV=local|prod`. An encrypted Neon URL saved in Settings takes precedence, followed by `DATABASE_URL_LOCAL` or `DATABASE_URL_PROD`, then the legacy `DATABASE_URL` fallback. Startup synchronization never pushes data and failures remain visible in Sync Centre history.

## WhatsApp webhook

Deploy the `webhook` directory to Vercel and configure the variables in `webhook/.env.example`. Register `/api/webhooks/whatsapp` as the Meta callback URL. Configure the desktop with the deployment base URL and the matching `INBOX_API_TOKEN`.

Only the structured message generated by the Gruhswad order page is converted into a draft order. Other messages remain marked `unmatched` for manual handling.

## Backups and reports

Backups are encrypted with Electron `safeStorage`, making them intentionally tied to the same operating-system account. The Orders CSV and dashboard combine online and local manual orders without merging their identities; each CSV row declares its record type and source. Reports use the selected service-date range. Restored databases are validated and applied on the next launch.

## Customer directory migration

Before pushing customers created or edited by the desktop application, apply `neon-migrations/0001_customer_directory.sql` using a Neon owner or dedicated migration role. The migration ensures optional email storage and adds archive metadata. Do not grant DDL permissions to the desktop sync role. If the migration is missing, Sync Centre leaves customer records dirty and reports the required action without partially publishing them.

## Master menu PDF

Open **Catalog** and use **Export menu PDF** at the upper-left. The export reads the current SQLite catalog and Operations settings, works offline, and opens the native Save dialog. It creates A4 portrait pages with three category columns, readable item text, category banners, recommendations, contact details, and the service footer. Large catalogs receive extra pages instead of smaller text.

## Published menu and template image exports

The Publish menu page supports one-day and weekly modes and exports a compact saved-menu PDF and a separate photo-layout PDF. Legacy publications without mode metadata remain compatible and normalize to one-day mode. Items that have become unavailable, archived, website-incompatible, or assigned to inactive categories are omitted. The featured panel is optional and is removed when its saved item is no longer printable.

Catalog and One-day menu also have separate preview and export buttons for 1085 x 1536 PNG images. Every page uses the complete packaged `MASTER-002_Template.png` background and renders text-only dynamic menu content in the available center area. Oversized menus create numbered continuation images instead of shrinking below a readable size.

After a saved export, an in-app gallery opens with whole-image fitting, scrolling, zoom below and above 100%, fixed previous/next controls, arrow-key navigation, page indicators, thumbnails, opening in the default viewer, and showing the file in its destination folder. Preview-only generation does not replace the latest saved export record.

## Brand attribution

`src/renderer/public/alpha-initiatives-credit.png` is the approved Alpha Initiatives attribution artwork copied byte-for-byte from the web project's source asset. Keep its aspect ratio intact and do not recreate or recolor it. The desktop placement is inside the sticky sidebar footer so it stays at the bottom-left without covering operational content.

## Google Cloud menu publication

The Sync Centre **Publish Menu Images** action requires both a saved master export and a saved one-day export. It verifies each file's timestamp, size, dimensions, and SHA-256 hash before uploading. A newer cloud manifest blocks an older local export, while identical hash sets are treated as already published.

Stable objects are published under `menus/`:

```text
menus/master-menu.png
menus/master-menu-02.png
menus/master-menu.json
menus/one-day-menu.png
menus/one-day-menu-02.png
menus/one-day-menu.json
```

Pages upload before their manifest. Obsolete continuation pages are deleted only within these controlled prefixes. The desktop application does not change bucket IAM or public-access configuration.

## Releases

Release builds embed `APP_ENV=prod` as their default environment but never bundle `.env` or a Neon URL. On first launch, open **Settings**, enter the least-privilege production Neon URL, and save it to the operating-system credential vault. An external runtime `APP_ENV` or `.env` can still intentionally override the packaged default.

To create the unsigned Windows installer locally:

```powershell
$env:APP_ENV="prod"
pnpm.cmd dist
```

Artifacts are written to `release/`, including `Gruhswad-Admin-Setup-0.3.3.exe`, its block map, `latest.yml`, and `win-unpacked`. Windows SmartScreen may warn because version 0.3.3 is unsigned.

Pushing a `v*` tag runs `.github/workflows/release.yml`; merging a pull request alone intentionally does not publish a release. The tag must exactly match the package version (`0.3.3` uses `v0.3.3`) and point to the reviewed commit on `master`.

The workflow is a gated sequence:

1. Validate the tag/version contract, frozen pnpm lockfile, tests, desktop and webhook type checks, and production build.
2. Package Windows NSIS and macOS DMG/ZIP independently with Electron Builder `--publish never`.
3. Upload the complete platform sets as workflow artifacts.
4. Publish only after both platform jobs succeed, using the sole job granted `contents: write`.

Windows releases contain the installer, blockmap, and `latest.yml`. macOS releases contain DMG and ZIP packages, their blockmaps, and `latest-mac.yml`. Missing required files fail the workflow, and space-free package names must stay aligned with the updater metadata.

The standardized workflow is unsigned and sets `CSC_IDENTITY_AUTO_DISCOVERY=false`; Windows SmartScreen and macOS Gatekeeper warnings are expected. Signing and Apple notarization must be introduced through a separately reviewed change covering credentials, timestamping, renewal, rotation, and verification.

Before tagging a new version:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd test
pnpm.cmd typecheck
pnpm.cmd --filter @gruhswad/whatsapp-webhook typecheck
$env:APP_ENV="prod"
pnpm.cmd build
pnpm.cmd release:verify-tag -- v0.3.3
$env:CSC_IDENTITY_AUTO_DISCOVERY="false"
pnpm.cmd exec electron-builder --win nsis --publish never
```

Inspect the installer, blockmap, and `latest.yml`, then smoke-test `release/win-unpacked/Gruhswad Admin.exe` with `ELECTRON_RUN_AS_NODE` unset and isolated `GRUHSWAD_TEST_USER_DATA`. After the reviewed version change is merged, update `master`, create an annotated matching tag, push only that tag, monitor all four workflow jobs, and verify the final GitHub Release assets. Do not move or reuse a published tag; issue a new patch version for release defects.

The published 0.3.3 release is available at <https://github.com/amol-pandhare/gruhswad-admin-desktop/releases/tag/v0.3.3>.

## Commands

- `pnpm dev` - Electron development mode
- `pnpm test` - contract and domain tests
- `pnpm typecheck` - strict TypeScript checks
- `pnpm build` - production bundles
- `pnpm pack` - unpacked application build
- `pnpm dist` - local installer build

When smoke-testing a packaged app from an automation shell, unset `ELECTRON_RUN_AS_NODE` and set `GRUHSWAD_TEST_USER_DATA` to an isolated profile directory.
