# Setup and connection

Use Node.js 22.20+ and npm. Keep the iconic app or web editor open, normally at http://localhost:4321. The app's **iconic → AI guide** menu provides a downloadable agent pack and setup prompt.

The agent pack bundles MCP dependencies. Extract it to a permanent folder, then run from that folder:

```sh
node scripts/setup-agent.mjs --agent codex --with-skill --dry-run
node scripts/setup-agent.mjs --agent codex --with-skill
```

Use `--agent claude-code` for Claude Code, or `--agent generic` to print MCP JSON for another client without editing settings. `--url http://localhost:8080` selects another app port. `--with-skill` uses Vercel's skills CLI to install this skill globally for the selected client. Do not move the pack after registration.

For a source checkout, install dependencies with `npm install` before using its setup script. Do not assume the agent is in that source directory or that the user's machine has a developer's path.

Install only the skill from an extracted pack or checkout:

```sh
npx skills add . --skill av-schematic -a codex -a claude-code -g --copy
```

A GitHub source can replace `.` once the matching skill version has been published. Never claim unpublished changes can already be installed remotely. Other supported clients use their own `-a` identifier. No plugin marketplace is required for this workflow.

Setup preserves a different existing `av-schematic` registration unless the user deliberately supplies `--replace`. Do not overwrite unrelated entries. Reload the AI client after setup. Then run the pack's read-only `scripts/mcp-check.mjs` with `AV_CANVAS_URL` set to the chosen origin, or call `list_devices` through MCP. Registration alone is not proof of a live connection.

Only one drawing connects to each app server. If another canvas owns the connection, close that tab or use a different app port. Never expose the local canvas endpoint publicly. If tools remain unavailable, explain the concrete registration, reload or app-connection problem; do not pretend to have changed the drawing.
