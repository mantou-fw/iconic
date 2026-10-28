# Changelog

## 0.3.0 — 2026-10-28

- Added a separate Couchbase Lite JavaScript database for each project, a project switcher, autosave status and complete named versions.
- Restoring a version retains a backup of the current work and creates a new revision atomically. Concurrent editors cannot silently overwrite one another.
- Copy the existing IndexedDB drawing into a project once, preserving the original database. JSON imports create separate projects; room state and viewport are included in snapshots and exports.
- Added model/datasheet device imports and image-derived room imports through MCP, with source evidence and estimated dimensions.

## 0.2.2 — 2026-10-21

- Removed the retired desktop sources, compiled caches, sidecar binary and obsolete runtime declarations.
- Replaced stale agent instructions with the Node.js / npm / Electron workflow.
- Corrected repository ownership links and commit attribution.

## 0.2.1 — 2026-10-21

- Made installer path expectations portable across macOS and Windows.
- Included the repository license in desktop, MCP and web distributions.

## 0.2.0 — 2026-10-21

- Renamed the app, desktop packages, environment variables, downloads and project documentation to iconic.
- Added a vector signal-path icon, desktop PNG/ICNS/ICO assets and web favicon.
- Added English, Traditional Chinese and Japanese catalogs, remembered language selection and localized AI setup prompts.
- Added toolbar tooltips for mouse hover and keyboard focus, with shortcuts and accessible names.
- Preserved project JSON and IndexedDB formats; added one-time migration of the previous Electron profile.
- Completed the Node.js / TanStack Start / Electron workflow with a bundled MCP agent pack.
- Added macOS/Windows release automation, a portable web-server archive and installation documentation.
