# Project instructions

Use **Node.js and npm** for all app, server, test and build work.

- `npm install` / `npm ci` for dependencies; commit `package-lock.json`.
- `npm run dev` for TanStack Start; `npm run build` for its Nitro Node output.
- `npm test` runs Vitest on Node; `npm run typecheck` checks TypeScript.
- `npm run desktop:dev` and `npm run desktop:build` use Electron.
- Use TanStack Start file routes, server routes and server functions for app web/server work. Its Vite toolchain is approved by the framework migration request.
- Preserve the existing React Flow and Three.js editor, project format, exports and IndexedDB data.
- AI integration uses the Node.js MCP stdio server (`mcp/server.mjs`) and the local TanStack Start `/api/canvas` route. The user explicitly reverted the local CLI launcher. Do not reintroduce the in-app agent launcher.
- Keep renderer Node integration disabled and context isolation enabled. Canvas commands must be validated, correlated by ID and limited to a local server; preserve browser Origin and loopback Host checks.
- Read current canvas state before agent edits; never clear user drawings without an explicit request.

See README.md and doc/mcp-integration.md for the current architecture and workflow.

- Product branding is iconic. Keep English, Traditional Chinese (`zh-Hant`) and Japanese catalogs in `src/locales/` synchronized; translate UI chrome, never user-authored drawing data.
- Keep the existing IndexedDB name and project JSON kind for compatibility. Desktop profile migration must preserve the original profile.
- Release builds use `.github/workflows/release.yml`; upload built installers and agent/web archives as GitHub Release assets, not Git source files.

- Commits in this repository use the `mantou-fw` maintainer identity; keep Git identity changes repository-local.
