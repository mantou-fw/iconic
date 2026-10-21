# Local canvas command protocol

The supported agent entry is the Node.js MCP stdio server (`mcp/server.mjs`). It uses the TanStack Start server route `POST /api/canvas`. Both the Electron and web renderer use this same route; no privileged preload is required.

Requests use `Content-Type: application/json`:

- `{ "action": "poll", "canvasId": "<per-tab UUID>" }`: renderer waits for `{ id, command }`, or `null` after 15 seconds.
- `{ "action": "command", "command": { "type": "get_state" } }`: MCP process waits for the corresponding canvas reply (10-second timeout).
- `{ "action": "reply", "canvasId": "<UUID>", "id": "<request UUID>", "reply": { "type": "state", "devices": [], "cables": [] } }`: renderer answers exactly one request.

The server accepts one active canvas. A second canvas cannot claim the drawing while its 30-second lease is current. Replies are matched by ID; expired queued requests are discarded. MCP batches wait for acknowledgements in order and stop on errors. Application is sequential, not transactional.

Command types are defined in `src/lib/ai-bridge.ts` and validated by `desktop/commands.mjs`. Supported types: `get_state`, `get_room`, `add_zone`, `add_device`, `connect`, `add_text`, `add_memo`, `add_rack`, `add_title_block`, `layout`, `set_room`, `add_room_item`, `clear`, `clear_room`, `delete_device`.

Only loopback Host names are accepted; foreign browser Origin and cross-site requests are rejected. The endpoint is intended for trusted processes on the local machine. See [MCP integration](mcp-integration.md).
