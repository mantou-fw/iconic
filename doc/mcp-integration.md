# Connect through MCP

For copyable instructions inside the app, choose **iconic → AI guide**. Optionally enter the project directory, then copy the complete prompt or download it. The prompt uses the current canvas origin, describes how to locate/install the Node.js MCP server, and points the agent to `.agents/skills/av-schematic/SKILL.md`. It distinguishes MCP tools from manual app exports.

Run `npm run desktop:dev`, open the packaged app, or run `npm run dev` and open the web editor. Default address: `http://localhost:4321`.

Register the Node.js stdio server in Codex:

```sh
codex mcp add av-schematic -- node /absolute/path/to/iconic/mcp/server.mjs
```

Other MCP clients can use `command: "node"`, `args: ["/absolute/path/to/iconic/mcp/server.mjs"]`. Use an absolute Node path if PATH is unavailable. Install this workspace's dependencies with `npm install` first. Restart/reload the MCP client after changing registration. No CLI model selection inside iconic is required; the agent manages its own model and login.

For another app port, configure the MCP process environment:

```json
{"AV_CANVAS_URL":"http://localhost:8080"}
```

Verify with `npm run mcp:check` while the app is open. It lists tools and reads devices/cables without editing.

## Tools

The canonical schemas and descriptions live in `mcp/server.mjs`. Tools cover listing devices, creating zones/devices/text/memos, connecting ports, deleting devices, layout, racks, room state/items, clearing and batched system/room construction.

Read the current drawing before editing. Preserve existing work unless the user requests removal. Create zones before devices and devices before cables. Use exact device tags and port labels; reuse tags across schematic, rack equipment and room items. Room measurements use metres.

Batch operations await each command's acknowledgement before proceeding. A command failure stops the remaining batch; already-applied changes remain. Read the drawing after a failed/expired operation before retrying, so you do not create duplicates.

## Transport and scope

The MCP server speaks standard stdio to the agent. It uses Node fetch to POST commands to the app's TanStack Start `/api/canvas` server route. The renderer long-polls the same route and returns an ID-correlated response after React commits. There is no Bun runtime or separate WebSocket server.

The route accepts JSON requests only on loopback Host names and rejects foreign browser Origins and cross-site requests. It has no remote access/authentication service: local processes can control the drawing, as expected for a local MCP bridge. Do not expose the server through a public proxy.

One renderer owns the connection per app server. Close the existing tab before using another drawing; disconnected leases expire after 30 seconds. Commands expire after 10 seconds and expired queued commands are not replayed.

If the canvas cannot be reached, open the app and check `AV_CANVAS_URL`. If no canvas is connected, wait for the app to finish opening. If another canvas owns the connection, close that tab or use a different app port. The menu's connection dot indicates renderer-to-server readiness, not whether an AI client is currently connected.

## Standalone pack and skills CLI

The app's **AI 使用說明** panel now provides an agent-pack ZIP and client selection. The pack bundles the MCP server and its dependencies, so it does not need the app source checkout or `npm install`. From its permanent extracted directory, run `node scripts/setup-agent.mjs --agent codex --with-skill` (or `claude-code`). Preview with `--dry-run` first. Generic mode prints JSON for other clients.

The installer can install the skill through Vercel skills CLI 1.7.4, requiring Node.js 22.20+. Installing the skill alone uses `npx skills@1.7.4 add . --skill av-schematic -a codex -a claude-code -g --copy`. This does not register MCP. See [distribution details](agent-distribution.md) for existing-registration handling, verification and publishing.
