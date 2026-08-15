# HTIFA-Schema documentation

An AV schematic canvas: draw signal-flow diagrams, rack elevations and a 3D room
model, and let an AI agent build them for you over MCP.

| Document | What's in it |
| --- | --- |
| [canvas-guide.md](./canvas-guide.md) | Using the canvas by hand — tools, ports, cables, zones, racks, 3D room, exports |
| [mcp-integration.md](./mcp-integration.md) | Connecting Claude (or any MCP client) to a running canvas, and the full tool reference |
| [bridge-protocol.md](./bridge-protocol.md) | The raw WebSocket command contract, for scripts that skip MCP |

## 60-second start

```bash
bun install
bun dev                       # serves the canvas + the AI bridge on :4321
open http://localhost:4321
```

Then, in a second terminal, register the MCP server once:

```bash
claude mcp add av-schematic -- bun /Volumes/Project/HTIFA-Schema/mcp/server.ts
```

Ask Claude to *"build a 4-zone QSC audio system on the canvas"* and watch the
drawing appear live in the browser tab.

## How the pieces fit

```
Claude / MCP client
        │  stdio (MCP tools)
        ▼
mcp/server.ts ──── ws://localhost:4321/ws?role=ai ────┐
                                                      │  Bun relay
browser canvas ─── ws://localhost:4321/ws?role=canvas ┘  (src/index.ts)
```

- `src/index.ts` is a **dumb relay**. Anything an `ai` socket sends is
  republished to every `canvas` socket, and vice versa. No command logic lives
  in the server.
- `src/lib/ai-bridge.ts` holds the **message contract** (`AICommand` / `AIReply`).
- `src/components/canvas.tsx` (`runCommand`, around line 877) **executes** the
  commands against React Flow state.
- `mcp/server.ts` wraps that contract in typed MCP tools so an agent never sees
  the socket.

State lives in the browser's IndexedDB (`av-schematic-db`, via Dexie) — the
canvas persists across reloads, and there is no server-side database.

## Repo map

| Path | Role |
| --- | --- |
| `src/index.ts` | Bun server: HTML routes + `/ws` relay (port 4321, override with `PORT`) |
| `src/components/canvas.tsx` | The whole canvas: tools, nodes, edges, history, AI command handler |
| `src/components/nodes/` | Node renderers: device, zone, rack, title block, memo, text, shape, image, drawing |
| `src/components/edges/` | Cable (`labeled-edge`) and plain `arrow-edge` renderers |
| `src/lib/ai-bridge.ts` | `AICommand` / `AIReply` types + the reconnecting canvas socket hook |
| `src/lib/db.ts` | Dexie schema (nodes, edges, drawings, viewport, settings, room, roomItems, legend) |
| `src/lib/room.ts` | 3D room model: metres, item kinds, per-kind size/mount defaults |
| `src/lib/signal-types.ts` | The editable signal legend (audio/video/network/control/power by default) |
| `src/lib/routing.ts`, `obstacles.ts`, `lanes.ts` | Orthogonal cable routing and obstacle avoidance |
| `src/lib/export-*.ts`, `schedules.ts` | PNG/SVG/PDF, self-contained HTML viewer, XLSX schedules |
| `mcp/server.ts` | MCP stdio server exposing 14 tools |
| `scripts/` | CLI (`av.ts`), MCP smoke test (`mcp-check.ts`), demo builds |
| `src-tauri/` | Desktop wrapper; the Bun server ships as a sidecar binary |
