# Gruhswad Admin Desktop

Independent Gruhswad kitchen operations app. Neon is the primary source for web orders and synchronized business data; SQLite keeps an offline desktop cache plus local expenses and reporting data.

Current release: **0.3.0**. The application includes Overview, cloud Orders, Catalog, One-day menu, Operations, Expenses, Reports, Sync Centre, and Settings. The WhatsApp Business inbox backend remains present, but its renderer shortcut is currently disabled and marked **Coming soon**.

## Current behavior

- **Overview** combines online and local manual orders for revenue, order counts, open value, averages, and recent activity. Unresolved conflicts produce a prominent Sync Centre CTA.
- **Orders** has All, Online, and Manual views under one section. Online orders remain Neon-backed; structured manual orders, custom lines, statuses, and payments stay local-only. Shared service-date and source filters apply across the views.
- **Customers** combines pulled Neon profiles with locally created profiles, supports email, archive/restore, WhatsApp/email shortcuts, and prefilled manual-order creation. Customer changes synchronize only through the explicit Sync Centre push.
- **Catalog** supports add/edit/archive/restore for items, category add/rename/reorder/activate/deactivate, web-compatibility control, bundles, and a visual food-image picker. Catalog Preview is an admin presentation mode that hides editing controls and empty categories; it is not a faithful public-site preview.
- **Publish menu** saves either a one-day or weekly publication locally, supports one optional Today's Special, clears builder selections, exports compact and photo PDFs, previews and exports template PNGs, and shares dish names and prices through WhatsApp. One-day dates resolve to tomorrow in India; weekly output displays a rolling seven-day window. All exports use the latest locally saved publication.
- **Operations** uses accordion sections for runtime brand, contact, ordering, fulfilment, service area, platforms, public location, an ordered themed announcement collection, the same-day preorder window, and optional India-calendar closures.
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

Packaged applications load append-only migrations from `resources/drizzle`. Electron Builder's `extraResources` entry must remain in place or fresh installs and upgrades will fail at startup.

## Neon permissions

Use separate least-privilege roles. Restrict the desktop sync role to the synchronized catalog, settings, publication, customer, address, order, line, and event tables. Keep the webhook role restricted to `whatsapp_inbox`. Never use a Neon owner credential in the application.

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

Artifacts are written to `release/`, including `Gruhswad-Admin-Setup-0.3.0.exe`, its block map, `latest.yml`, and `win-unpacked`. Windows SmartScreen may warn because version 0.3.0 is unsigned.

Pushing a `v*` tag runs `.github/workflows/release.yml` with `APP_ENV=prod`, builds Windows NSIS plus macOS DMG/ZIP artifacts, and publishes the update metadata consumed by `electron-updater`. Space-free artifact names must stay aligned with `latest.yml` and `latest-mac.yml`. Unsigned macOS builds trigger Gatekeeper; users must explicitly approve the application. Add `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`, `MAC_CERTIFICATE`, `MAC_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` repository secrets to enable signing and notarization in a future release.

The published 0.3.0 release is available at <https://github.com/amol-pandhare/gruhswad-admin-desktop/releases/tag/v0.3.0>.

## Commands

- `pnpm dev` - Electron development mode
- `pnpm test` - contract and domain tests
- `pnpm typecheck` - strict TypeScript checks
- `pnpm build` - production bundles
- `pnpm pack` - unpacked application build
- `pnpm dist` - local installer build

When smoke-testing a packaged app from an automation shell, unset `ELECTRON_RUN_AS_NODE` and set `GRUHSWAD_TEST_USER_DATA` to an isolated profile directory.
