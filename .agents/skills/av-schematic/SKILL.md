---
name: av-schematic
description: Draw and edit AV signal-flow schematics, rack elevations and 3D room layouts on the HTIFA-Schema canvas through its MCP server. Use whenever a task involves the AV canvas, AV devices/zones/cables, rack elevations, the 3D room view, or the av-schematic MCP tools.
---

# AV schematic canvas

The canvas is a live browser app. Its MCP server (`mcp/server.ts`) holds no
state — every tool call is relayed to an open browser tab over a WebSocket and
executed against React Flow there.

Full docs: `doc/canvas-guide.md` (using the canvas), `doc/mcp-integration.md`
(MCP setup + tool reference), `doc/bridge-protocol.md` (raw socket).

## Before anything else

Both must be true or every call times out after 5 seconds:

1. `bun dev` is running (serves canvas + bridge on **:4321**).
2. A browser tab is **open** on http://localhost:4321.

If a tool errors with *"Cannot reach the canvas"* the server is down; with
*"The canvas did not respond"* no tab is open. Tell the user which one and stop
— don't retry, and don't try to work around it with the CLI scripts.

Registration, if the tools aren't present:

```bash
Codex mcp add av-schematic -- bun /Volumes/Project/HTIFA-Schema/mcp/server.ts
bun scripts/mcp-check.ts    # verifies the whole chain
```

## Rules

- **Read before you write.** Call `list_devices` (and `get_room` for 3D) before
  touching a drawing you did not create. Tags and port labels are the only
  handles the write tools have.
- **Never call `clear_canvas` or `clearFirst: true` without the user asking.**
  There is no undo through MCP and the drawing is the user's work.
- **Batch.** Use `build_system` / `build_room` for anything past two or three
  items. They order the operations correctly and read the canvas back so you
  can verify in one round trip.
- **Tags are the join key** between the schematic, rack bays and 3D room items.
  Pick a scheme (`DSP-01`, `AMP-02`, `SPK-L`, `RK-01`) and reuse the exact same
  tag in all three.
- **Zones before devices.** `add_device`'s `zone` must name an existing zone.
- Give every port a `signal` — it drives the cable colour, and an uncoloured
  drawing is a useless drawing.

## Build order

1. `list_devices` — see what's there.
2. Zones (rooms / areas).
3. Devices, each with its full input and output port lists and its `zone`.
4. Cables, matched by port label (omit the port to take the first available).
5. `add_rack` with bay `tag`s matching the device tags.
6. `build_room` with item `tag`s matching the same device tags.
7. `list_devices` again to confirm what actually landed, and report that — not
   what you intended to place.

## Signal classes

`audio` (green) · `video` (blue) · `network` (purple) · `control` (amber) ·
`power` (red). The legend is user-editable and custom classes get generated
keys — if the user has customised it, read a device back with `list_devices` to
learn the real keys instead of guessing.

## Ports and connectors

A port is `{ label, connector?, signal? }`. `label` is what `connect_devices`
matches on, case insensitively. Use real AV connector names: `XLR-F`, `XLR-M`,
`PHOENIX`, `RJ45`, `HDMI`, `SDI`, `RCA`, `TRS`, `SPEAKON`, `IEC`.

Name ports the way the equipment does — `Mic 1`, `Line In`, `Zone 1`, `Dante`,
`LAN`, `HDMI 1` — not `Input 1`/`Output 1`, so the drawing reads like the
manual.

## Rack elevations

`add_rack` takes `units` (default 24) and `equipment[]` of
`{ label, tag?, u?, height?, color? }`. `u` is the lowest rack unit occupied and
`1` is the bottom; omit it and bays stack upward. Heavy amps low, patch panels
and switches at the top, 1U gaps for airflow around hot gear.

## 3D room

Metres, origin at the near-left floor corner: **x** right (width), **y** up
(height), **z** back (depth). Size and mount default per kind, so `kind` +
`label` + `position` is usually enough.

Kinds — AV: `tv`, `projector`, `screen`, `speaker`, `subwoofer`, `rack`,
`camera`, `keypad`. Furniture: `table`, `desk`, `sofa`, `chair`, `cabinet`,
`rug`, `plant`, `door`, `window`. Mounts: `wall`, `ceiling`, `floor`, `table`,
`rack`.

Call `set_room` (or `build_room`) before placing items, so default positions
land inside the actual room.

## Failure messages and what they mean

| Message | Fix |
| --- | --- |
| `No zone named "X"` | Create the zone first; match is by name, case insensitive |
| `"X" has no matching output` / `input` | Wrong port label — `list_devices` and use the exact one, or omit it |
| `No device tagged "X"` | The tag doesn't exist; matching also accepts the device's `name` |

## Changing the canvas itself

Adding a capability means editing three files in order — the command union in
`src/lib/ai-bridge.ts`, the `runCommand` switch in `src/components/canvas.tsx`
(~line 877), then a `registerTool` in `mcp/server.ts`. See the "Extending the
tool set" section of `doc/mcp-integration.md`.

Note for local scripts: everything in `scripts/` defaults to port **3000** while
the server listens on **4321** — prefix with
`AV_WS=ws://localhost:4321/ws?role=ai`.
