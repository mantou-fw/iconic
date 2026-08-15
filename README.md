# HTIFA-Schema

An AV schematic canvas: draw signal-flow diagrams, rack elevations and a 3D room model — and let an AI agent build them for you over MCP.

Built with Bun, React 19, React Flow (@xyflow/react), Three.js (via react-three-fiber) and Tailwind CSS 4. Ships as a web app and a Tauri desktop wrapper.

## Features

- **Signal-flow canvas** — draw AV devices, zones, racks, title blocks, memos, text, shapes, images and freehand drawings on a React Flow canvas
- **Cable routing** — orthogonal cable routing with obstacle avoidance (`src/lib/routing.ts`)
- **3D room model** — a react-three-fiber room view with metres, item kinds and per-kind size/mount defaults
- **Editable signal legend** — audio / video / network / control / power by default, fully editable (`src/lib/signal-types.ts`)
- **Exports** — PNG / SVG / PDF, a self-contained HTML viewer, and XLSX cable schedules
- **Persistence** — state lives in browser IndexedDB (Dexie, `av-schematic-db`); no server-side database
- **AI via MCP** — a Claude agent (or any MCP client) can draw on the canvas live over a WebSocket relay

## Getting started

```bash
bun install
bun dev                       # serves the canvas + the AI bridge on :4321
open http://localhost:4321
```

Override the port with `PORT`, e.g. `PORT=8080 bun dev`.

## Using it with an AI agent

Register the MCP server once:

```bash
claude mcp add av-schematic -- bun /Volumes/Project/HTIFA-Schema/mcp/server.ts
```

Then ask Claude to *"build a 4-zone QSC audio system on the canvas"* and watch the drawing appear live in the browser tab.

## How the pieces fit

```
Claude / MCP client
        │  stdio (MCP tools)
        ▼
mcp/server.ts ──── ws://localhost:4321/ws?role=ai ────┐
                                                      │  Bun relay
browser canvas ─── ws://localhost:4321/ws?role=canvas ┘  (src/index.ts)
```

- `src/index.ts` is a **dumb relay**. Anything an `ai` socket sends is republished to every `canvas` socket, and vice versa. No command logic lives in the server.
- `src/lib/ai-bridge.ts` holds the **message contract** (`AICommand` / `AIReply`).
- `src/components/canvas.tsx` (`runCommand`) **executes** the commands against React Flow state.
- `mcp/server.ts` wraps that contract in typed MCP tools so an agent never sees the socket.

## Scripts

| Command | What it does |
| --- | --- |
| `bun dev` | Start the dev server with hot reload on :4321 |
| `bun start` | Run in production mode |
| `bun run build` | Build the web bundle (`build.ts`) |
| `bun test` | Run the test suite |
| `bun run desktop:dev` | Build the sidecar + run the Tauri desktop app |
| `bun run desktop:build` | Build the sidecar + package the Tauri desktop app |

## Repository map

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
| `mcp/server.ts` | MCP stdio server exposing typed tools |
| `scripts/` | CLI (`av.ts`), MCP smoke test (`mcp-check.ts`), demo builds |
| `src-tauri/` | Desktop wrapper; the Bun server ships as a sidecar binary |

## Documentation

| Document | What's in it |
| --- | --- |
| [`doc/canvas-guide.md`](doc/canvas-guide.md) | Using the canvas by hand — tools, ports, cables, zones, racks, 3D room, exports |
| [`doc/mcp-integration.md`](doc/mcp-integration.md) | Connecting Claude (or any MCP client) to a running canvas, and the full tool reference |
| [`doc/bridge-protocol.md`](doc/bridge-protocol.md) | The raw WebSocket command contract, for scripts that skip MCP |

## Requirements

- [Bun](https://bun.com) 1.x (this project defaults to Bun everywhere — no Node.js/npm needed)
