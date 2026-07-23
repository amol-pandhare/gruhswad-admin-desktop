# Gruhswad Admin Desktop Agent Guide

## Purpose and boundaries

- This repository is the independent Electron operations application at `C:\Workspace\gruhswad-admin-desktop`.
- Treat `C:\Workspace\gruhswad` as read-only. Never implement desktop work by editing the web project.
- Supported web integration is explicit Neon synchronization for catalog, runtime settings, current publication, and cloud order data using `src/shared/contracts.ts`.
- Never commit credentials, `.env` files, SQLite databases, encrypted backups, signing certificates, Meta webhook payloads, `out`, `release`, or `node_modules`.

## Stack and repository layout

- Electron 37, React 19, TypeScript, Electron Vite, SQLite through `better-sqlite3`, Drizzle schemas, Zod validation, Vitest, and Electron Builder.
- `src/main` is the trusted Electron process: migrations, repositories, synchronization and conflict logic, IPC handlers, encrypted backups, CSV exports, inbox synchronization, and updates.
- `src/preload` is the sole renderer bridge. Expose only typed allowlisted methods from `AdminApi`; never expose `ipcRenderer` or Node APIs.
- `src/renderer` is a sandboxed React application with no Node access. Operational content must come from the preload API rather than hardcoded records.
- `src/shared` owns cross-process contracts and pure business logic. Keep publication, order, expense, payment, date-range, and parser validation here.
- `src/shared/master-menu.seed.json` is a copied bootstrap snapshot. It seeds an empty SQLite database only; it is not the runtime source of truth.
- `drizzle` contains append-only SQLite migrations. `src/main/schema.ts` mirrors the current schema for typed queries.
- `webhook` is a separately deployable Vercel package for Meta verification, signature validation, idempotent Neon inbox storage, authenticated pulls, acknowledgement, and retention cleanup.
- `tests` contains contract and pure-domain coverage. Add integration tests here as repositories mature.

## Runtime invariants

- Keep `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` in every `BrowserWindow`.
- The project is ESM, but `electron-updater` is CommonJS and must use its default export before destructuring `autoUpdater`.
- The sandboxed preload must remain CommonJS. `electron.vite.config.ts` must emit `out/preload/index.cjs`, and `BrowserWindow` must load that exact file. An ESM preload produces a blank renderer because `window.admin` is never exposed.
- When launching the built app without a Vite development URL, load `out/renderer/index.html`; call `loadURL` only when `ELECTRON_RENDERER_URL` is present.
- Preserve the renderer Content Security Policy. Add external origins narrowly and only when a feature requires them.
- Keep renderer source encoding-safe. Prefer ordinary ASCII punctuation for UI separators and labels; use Unicode escapes in parsers where exact code points matter. Scan for mojibake sequences after editing user-facing strings.
- `better-sqlite3` is native. After changing Electron, Node, architecture, or dependencies, run `pnpm exec electron-builder install-app-deps` before runtime testing.

## Data and behavior rules

- Neon is authoritative for web orders and synchronized Gruhswad business data. SQLite is the durable offline cache and remains authoritative for desktop-only finance records.
- Pull and push are separate explicit user actions. Never add automatic background push.
- Preserve dirty records during pull, use optimistic concurrency during push, and require explicit conflict resolution.
- Expenses, payments, manual orders, reports, and WhatsApp imports are local-only and must never enter a Neon push.
- Database changes require a new numbered migration. Never rewrite a migration that may have shipped. Keep foreign keys enabled and preserve WAL mode.
- Validate renderer input at IPC boundaries with Zod even if the form already validates it.
- Cash-basis revenue includes received payments minus refunds. Profit is cash revenue minus expenses recorded within the selected period.
- Structured WhatsApp messages create draft orders. Use Meta message IDs and the `whatsapp_imports` unique constraint to prevent duplicates; unmatched text stays visible for manual handling.
- Store connection secrets with Electron `safeStorage`. Do not return decrypted secrets to the renderer. Preserve previously stored secrets when a settings field is left blank.
- Before restoring a backup, decrypt it, run SQLite integrity validation, and verify the migration table. Apply a valid staged restore only on restart.
- Publish only available, web-compatible item IDs. The featured item must belong to the selected set, and duplicate IDs are invalid.
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

## Known setup requirements

- Replace the placeholder GitHub owner in `package.json` before publishing releases.
- Production publishing needs a dedicated Neon URL entered through Settings.
- WhatsApp ingestion needs a deployed webhook, Meta Business credentials, and a matching inbox API token.
- Signed automatic releases require Windows and macOS certificates plus Apple notarization credentials in GitHub Actions secrets.
