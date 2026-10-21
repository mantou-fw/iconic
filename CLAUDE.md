# Working on iconic

Follow [AGENTS.md](AGENTS.md) for project architecture and security requirements.

Use Node.js 22.20+ and npm:

- `npm ci` installs the locked dependencies.
- `npm run dev` starts the TanStack Start editor.
- `npm run desktop:dev` starts the Electron app.
- `npm run build` builds the Node server.
- `npm run typecheck` and `npm test` validate changes.
- `npm run desktop:build:mac` and `npm run desktop:build:windows` produce installers.

The canonical AV skill is `.agents/skills/av-schematic/SKILL.md`.
MCP uses `mcp/server.mjs` and the local `/api/canvas` route.
Read the current drawing before editing and preserve existing user content.
