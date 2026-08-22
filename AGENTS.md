# Gruhswad Admin Desktop Agent Guide

## Purpose and boundaries

- This repository is the independent Electron operations application at `C:\Workspace\gruhswad-admin-desktop`.
- Treat `C:\Workspace\gruhswad` as read-only. Never implement desktop work by editing the web project.
- Supported web integration is explicit Neon synchronization for catalog, runtime settings, current publication, customer profiles, and cloud order data using `src/shared/contracts.ts`.
- Never commit credentials, `.env` files, SQLite databases, encrypted backups, signing certificates, Meta webhook payloads, `out`, `release`, or `node_modules`.

## Stack and repository layout

- Electron 37, React 19, TypeScript, Electron Vite, SQLite through `better-sqlite3`, Drizzle schemas, Zod validation, Vitest, and Electron Builder.
- `src/main` is the trusted Electron process: migrations, repositories, synchronization and conflict logic, IPC handlers, encrypted backups, CSV exports, inbox synchronization, and updates.
- `src/preload` is the sole renderer bridge. Expose only typed allowlisted methods from `AdminApi`; never expose `ipcRenderer` or Node APIs.
- `src/renderer` is a sandboxed React application with no Node access. Operational content must come from the preload API rather than hardcoded records.
- `src/shared` owns cross-process contracts and pure business logic. Keep publication, order, expense, payment, date-range, and parser validation here.
- `src/shared/master-menu.seed.json` is a copied bootstrap snapshot. It seeds an empty SQLite database only; it is not the runtime source of truth.
- `drizzle` contains append-only SQLite migrations. `src/main/schema.ts` mirrors the current schema for typed queries.
- Packaged builds must copy `drizzle` to `process.resourcesPath/drizzle` through Electron Builder `extraResources`. Keeping migrations only inside `app.asar` breaks both fresh-install and upgrade startup.
- `webhook` is a separately deployable Vercel package for Meta verification, signature validation, idempotent Neon inbox storage, authenticated pulls, acknowledgement, and retention cleanup.
- `tests` contains contract and pure-domain coverage. Add integration tests here as repositories mature.

## Runtime invariants

- Keep `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` in every `BrowserWindow`.
- The project is ESM, but `electron-updater` is CommonJS and must use its default export before destructuring `autoUpdater`.
- The sandboxed preload must remain CommonJS. `electron.vite.config.ts` must emit `out/preload/index.cjs`, and `BrowserWindow` must load that exact file. An ESM preload produces a blank renderer because `window.admin` is never exposed.
- When launching the built app without a Vite development URL, load `out/renderer/index.html`; call `loadURL` only when `ELECTRON_RENDERER_URL` is present.
- Preserve the renderer Content Security Policy. Add external origins narrowly and only when a feature requires them.
- Keep external navigation allowlisted in the trusted main process. The Alpha Initiatives credit must use the fixed `external:open-alpha-initiatives` action; do not replace it with a renderer-controlled URL or a generic `openExternal` bridge.
- Keep renderer source encoding-safe. Prefer ordinary ASCII punctuation for UI separators and labels; use Unicode escapes in parsers where exact code points matter. Scan for mojibake sequences after editing user-facing strings.
- `better-sqlite3` is native. After changing Electron, Node, architecture, or dependencies, run `pnpm exec electron-builder install-app-deps` before runtime testing.

## Data and behavior rules

- Neon is authoritative for web orders and synchronized Gruhswad business data. SQLite is the durable offline cache and remains authoritative for desktop-only finance records.
- Website enquiries remain authoritative in Neon. The desktop uses a read-only `(created_at,id)` cursor poll for native alerts and stores only its notification cursor/preference locally. Every new-row poll emits a renderer arrival event so the badge and filtered Enquiries view refresh even when native alerts are disabled or unavailable. The Enquiries section reads list/detail/event data directly and changes status only through the restricted Neon transition function; never add direct table writes or include enquiries in Sync Centre pushes.
- Background unread-count reconciliation must classify nested Neon/Undici transport failures as temporary unavailability, return no replacement count, retain the renderer's last known badge, and retry on the normal interval. Do not hide authorization, schema, or query failures as network outages.
- Enquiry read state is Neon-backed and independent of workflow status. Viewing or opening a notification calls only `gruhswad_mark_enquiry_seen`; it must never imply that the customer was contacted. The navigation badge counts `seen_at IS NULL`.
- Deploy `neon-migrations/0004_enquiry_seen_state.sql` with an owner/migration credential before using Seen/Unread against a Neon branch. The desktop login inherits only `EXECUTE` through `gruhswad_desktop_sync`; never broaden it to direct enquiry updates or DDL.
- Pull and push are separate explicit user actions. Never add automatic background push.
- Online preorder handoff state is read-only in Electron and separate from operational state. Operational changes remain dirty until Sync Centre calls the restricted `gruhswad_transition_order` function. Show the pending state; never restore handoff values to the editable workflow.
- Preserve dirty records during pull, use optimistic concurrency during push, and require explicit conflict resolution.
- Expenses, payments, manual orders, reports, and WhatsApp imports are local-only and must never enter a Neon push.
- Customer profiles are synchronized independently from local manual orders. Recording a manual order may create or update a dirty `cloud_customer`, but must never make the order, its lines, or its payments pushable.
- Keep the unified Orders identities explicit: online and manual records may share human-facing details but must retain separate stable IDs and `kind` values to prevent double counting or accidental cloud writes.
- Customer deletion is archive/restore. Normalize phones to E.164 and optional emails to lowercase; resolve WhatsApp and email destinations in the main process from a validated customer ID.
- Neon customer schema changes belong in `neon-migrations` and require an owner/migration role. Never grant schema-changing permissions to the desktop sync credential.
- Database changes require a new numbered migration. Never rewrite a migration that may have shipped. Keep foreign keys enabled and preserve WAL mode.
- Validate renderer input at IPC boundaries with Zod even if the form already validates it.
- Cash-basis revenue includes received payments minus refunds. Profit is cash revenue minus expenses recorded within the selected period.
- Unified local payments may reference mirrored online or local service orders. Completion never implies payment; revenue uses payment occurrence dates.
- Customer milestone outreach is available only for confirmed, ready, and cancelled orders. Resolve the order and phone in the main process, open a versioned prefilled WhatsApp message, and record only `whatsapp_opened` locally. Never infer sent, delivered, or contacted, and never synchronize contact audit events.
- Inventory, recipes, purchases, reservations, Tiffin plans, and generated cycles are profile-local and never pushed. Reserve recipe snapshots on confirmation, consume on preparation, require an audited shortage override, and correct stock through ledger entries rather than deleting history.
- Enquiry conversion quantity defaults use the largest positive whole number captured in guest count, people count, or quantity expectations. Apply it to every selected Party/Bulk line. Tiffin plans preserve people and quantity notes separately, then use their larger numeric value when generating cycle quantities before multiplying by eligible days and meal slots.
- Recipe videos store validated YouTube IDs only. In-app playback uses the privacy-enhanced embed origin and external opening resolves a canonical URL in the trusted main process.
- Structured WhatsApp messages create draft orders. Use Meta message IDs and the `whatsapp_imports` unique constraint to prevent duplicates; unmatched text stays visible for manual handling.
- Store connection secrets with Electron `safeStorage`. Do not return decrypted secrets to the renderer. Preserve previously stored secrets when a settings field is left blank.
- Keep GCS credentials and catalog image filesystem paths in the main process. Renderer image selection must use short-lived opaque tokens, and preview/file APIs must remain scoped to allowlisted packaged assets or the latest completed export.
- Catalog cloud images use `menu-items/{item-id}.{ext}` and stable filename-only `image_asset` values. Never allow renderer-supplied bucket names, object paths, or arbitrary local paths.
- Menu image publication uses verified persisted export metadata and stable `menus/` object names. Upload pages before manifests, reject modified or stale local exports, and never delete outside the controlled master/one-day prefixes.
- Before restoring a backup, decrypt it, run SQLite integrity validation, and verify the migration table. Apply a valid staged restore only on restart.
- Portable backups must use online SQLite backups for every included profile and cover the complete SQLite databases, the versioned settings inventory, profile selection, managed environment values, profile secrets, and durable receipt attachments. Encrypt the whole bundle with password-derived AES-256-GCM; re-encrypt secrets with destination `safeStorage`, reject unsafe archive paths/checksum failures, preserve timestamped safety copies, and never auto-sync after import.
- Receipt OCR is local-only and always produces a review draft. Persist the immutable source file, hash, OCR text, extracted payload, and corrected payload only with the confirmed expense. Duplicate hashes require an audited override; mapped inventory receipts and their single linked expense must commit transactionally.
- Resolve the fixed Production or Intensive-testing local-data profile before opening SQLite. Switching profiles requires relaunch; never hot-swap an open database or accept arbitrary database paths.
- Refresh the test database only through SQLite's online backup API, validate integrity and migration history before promotion, and preserve the prior test copy. Keep secrets, caches, WAL/SHM files, and restore staging profile-local.
- Publish only available, web-compatible item IDs. The featured item must belong to the selected set, and duplicate IDs are invalid.
- Keep landing announcements in the separate `announcement` app-settings key as `{ maxAnnouncements, items }`. Normalize the admin limit to 1-6 (default 6), preserve ordered stable IDs and themes, force overflow items disabled, and match the web text, HTTPS link, and schedule validation. Legacy single-object payloads normalize to one-item collections.
- Preserve publication backward compatibility: missing `mode` and `weeklyStartDate` normalize to one-day mode. One-day customer dates are derived as tomorrow in `Asia/Kolkata`; weekly output uses the rolling seven-day window beginning tomorrow.
- Preserve the same-day Operations preorder-window contract as `HH:mm` India-time start/end values with the end strictly later than the start. Legacy Operations records normalize to `00:00`-`21:00`.
- Preserve the nullable Operations `closurePeriod` contract as valid `YYYY-MM-DD` India-calendar start/end dates with an inclusive, non-reversed range. A one-day closure stores equal dates and legacy records normalize to `null`.
- Preserve `maxPartyBulkGuests` as the synchronized Party/Bulk standard-capacity threshold (integer 1-500, legacy default 25). Web enquiries may request up to three times the threshold; counts above the threshold require feasibility copy. It does not govern Tiffin.
- Preserve the private `notification` app-setting as `{ backupEmail }`. It is an Operations sync record but must not be merged into public runtime configuration. Blank disables backup mail; validate and normalize nonblank addresses before marking the setting dirty.
- The explicit closure clear action must set `closurePeriod: null` and restore `open: true`. It saves locally and becomes customer-visible only after the existing explicit Sync Centre push; never add an automatic push.
- Preserve `src/renderer/public/alpha-initiatives-credit.png` byte-for-byte from the read-only web source asset. Keep it at the bottom-left of the desktop sidebar with accessible button text and its original aspect ratio.
- Use separate least-privilege Neon roles: a desktop sync role restricted to synchronized Gruhswad tables, and a webhook role restricted to `whatsapp_inbox`. Never use an owner credential.

## Development workflow

- Install with `pnpm install`, then rebuild native Electron dependencies with `pnpm exec electron-builder install-app-deps` when needed.
- Start development with `pnpm dev`. A direct build smoke test can use `pnpm build` followed by Electron, but ensure `ELECTRON_RUN_AS_NODE` is unset.
- Use `apply_patch` for source edits and preserve unrelated user changes.
- Keep the desktop and webhook environment examples current whenever configuration changes.
- Update `README.md`, tests, migrations, and this guide when changing architecture, setup, security, or release behavior.

## Required verification

Run before handoff:

```powershell
pnpm test
pnpm typecheck
pnpm --filter @gruhswad/whatsapp-webhook typecheck
pnpm build
```

If the pnpm launcher cannot access the registry but dependencies are already installed, use the local binaries:

```powershell
.\node_modules\.bin\vitest.cmd run
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\tsc.cmd --noEmit -p webhook\tsconfig.json
.\node_modules\.bin\electron-vite.cmd build
```

- Runtime-test Electron after changing main, preload, native dependencies, IPC, renderer startup, or CSP. Capture main and renderer console errors; a running process alone is not sufficient.
- Scan renderer output for `Ã`, `Â`, `â`, `Ä`, `Ā`, and the replacement character after editing display text.
- Publication or parser changes require contract tests for valid payloads, duplicates, featured-item membership, structured messages, and unmatched messages.
- Schema changes require new-database, upgrade, backup, and restore verification.
- Changes to Electron Builder, signing, or updates require checking both Windows and macOS jobs in `.github/workflows/release.yml`.
- Packaged runtime smoke tests must unset `ELECTRON_RUN_AS_NODE` and use `GRUHSWAD_TEST_USER_DATA` for an isolated profile. Verify database creation and captured stderr, not merely that the process launched.

## Release invariants

- Releases start only when a `v*` tag is pushed; merging a pull request does not publish a release.
- The tag must exactly match `v${package.json version}` and point to the reviewed commit on `master`. Never move or reuse a published tag; fix release defects with a new patch version.
- Keep release validation, Windows packaging, macOS packaging, and GitHub publication as gated jobs. Packaging must use `--publish never`; only the final dependent job may receive `contents: write` and create the release.
- Preserve the complete artifact sets: Windows installer, blockmap, and `latest.yml`; macOS DMG, ZIP, both blockmaps, and `latest-mac.yml`. Missing artifacts must fail the workflow.
- CI installs with pnpm's frozen lockfile, runs the repository-required checks, and keeps unsigned signing discovery disabled. Adding signing or notarization requires an explicit security and recovery review.
- Before tagging, package on an available local platform, inspect updater metadata for filename alignment, and runtime-smoke-test the packaged application. A workflow is not proven until a real tag run and its GitHub Release assets have been verified.

## Known setup requirements

- GitHub releases publish to `amol-pandhare/gruhswad-admin-desktop`. Keep space-free Windows and macOS artifact names aligned with `latest.yml` and `latest-mac.yml`.
- Production publishing needs a dedicated Neon URL entered through Settings.
- WhatsApp ingestion needs a deployed webhook, Meta Business credentials, and a matching inbox API token.
- Cloud order status pushes call Neon's `gruhswad_transition_order`; do not restore direct order/event writes or send customer notifications from Electron.
- Current 0.3.3 artifacts are unsigned. Signed automatic releases require Windows and macOS certificates plus Apple notarization credentials in GitHub Actions secrets.
