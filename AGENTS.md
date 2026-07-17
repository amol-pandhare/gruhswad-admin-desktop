# Gruhswad Admin Desktop Agent Guide

## Boundaries
- This repository is independent from `C:\Workspace\gruhswad`. Never edit the web project from this app.
- Gruhswad integration is limited to the documented `menu_publications/current` JSON contract.
- Do not commit credentials, database files, backups, signing certificates, or Meta webhook payloads.

## Architecture
- `src/main`: trusted Electron process, SQLite repositories, migrations, Neon publication, backups, updater.
- `src/preload`: the only renderer bridge. Add explicit, typed IPC methods; never expose `ipcRenderer` directly.
- `src/renderer`: sandboxed React UI with no Node access.
- `src/shared`: Zod contracts and pure domain logic shared by processes and tests.
- `drizzle`: append-only, versioned SQLite migrations.
- `webhook`: separately deployable Meta webhook and temporary Neon inbox.

## Data and security
- SQLite is the local source of truth. UI screens must not hardcode operational records.
- Validate all renderer, import, publication, and webhook inputs with Zod.
- Keep `contextIsolation: true`, `nodeIntegration: false`, and renderer sandboxing enabled.
- Store secrets through `safeStorage`; use a least-privilege Neon role.
- Schema changes require a new migration; never edit a migration already shipped.

## Verification
- Run `pnpm test`, `pnpm typecheck`, and `pnpm build` before handoff.
- Contract changes require publication and parser tests.
- Verify both Windows and macOS release jobs when changing Electron Builder or updater configuration.
