# Connecting an AI agent over MCP

`mcp/server.ts` is an MCP stdio server that turns the canvas into 14 typed
tools. It holds no drawing state of its own — it forwards each tool call to the
open browser tab over the WebSocket bridge and returns whatever the canvas
answers.

## Prerequisites, in order

1. `bun install`
2. `bun dev` — the Bun server serves the canvas **and** the bridge on **:4321**.
3. **Open http://localhost:4321 in a browser and leave the tab open.** The
   canvas *is* the state; with no tab open every tool call times out after 5 s
   with *"The canvas did not respond."*
4. Check the dot next to the file menu is **green** (AI bridge live).

## Register with Claude Code

```bash
claude mcp add av-schematic -- bun /Volumes/Project/HTIFA-Schema/mcp/server.ts
```

Verify inside Claude Code with `/mcp`, or from the shell:

```bash
bun scripts/mcp-check.ts
```

That starts the server over stdio, lists its tools, and runs a real
`list_devices` against the live canvas. Exit code 0 and a device count means the
whole chain works.

### Other MCP clients

Any stdio MCP client works — the config is always "run `bun` with the absolute
path to `mcp/server.ts`":

```json
{
  "mcpServers": {
    "av-schematic": {
      "command": "bun",
      "args": ["/Volumes/Project/HTIFA-Schema/mcp/server.ts"],
      "env": { "AV_WS": "ws://localhost:4321/ws?role=ai" }
    }
  }
}
```

`AV_WS` is optional; it defaults to `ws://localhost:4321/ws?role=ai`. Set it if
you changed the server's `PORT`, or if the canvas runs on another machine.

---

## Tool reference

### Reading

| Tool | Args | Returns |
| --- | --- | --- |
| `list_devices` | — | Every device with tag, name, manufacturer, model, position and ports; every cable with label and both endpoints |
| `get_room` | — | Room dimensions and every item in it |

Call these **before modifying a drawing you did not create**. Names and tags are
the only handles the write tools have.

### Schematic

| Tool | Key args |
| --- | --- |
| `add_zone` | `name`, `color?`, `position?`, `width?`, `height?` |
| `add_device` | `tag?`, `name?`, `manufacturer?`, `model?`, `inputs?`, `outputs?`, `zone?`, `position?` |
| `connect_devices` | `from`, `fromPort?`, `to`, `toPort?`, `label?` |
| `delete_device` | `tag` |
| `add_note` | `text`, `style` (`memo` \| `text`), `position?` |
| `add_rack` | `tag?`, `name?`, `units?` (24), `equipment[]`, `position?` |
| `auto_layout` | — |
| `clear_canvas` | — (destructive; confirm with the user first) |
| `build_system` | `zones[]`, `devices[]`, `cables[]`, `clearFirst` |

A **port** is `{ label, connector?, signal? }` where `signal` is one of
`audio`, `video`, `network`, `control`, `power` (or a custom legend key, read
back from the canvas). Port `label` is what `connect_devices` matches on, case
insensitively; omit `fromPort`/`toPort` to take the device's first output/input.

`add_device` uppercases the tag. `zone` must name an **existing** zone or the
call fails.

Rack `equipment` entries are `{ label, tag?, u?, height?, color? }`. Omit `u`
and bays stack upward from the bottom; `1` is the bottom U.

### 3D room

| Tool | Key args |
| --- | --- |
| `set_room` | `name?`, `width?`, `depth?`, `height?` (metres), `clearItems` |
| `add_room_item` | `kind`, `label`, `tag?`, `position?`, `size?`, `rotation?`, `mount?`, `color?`, `note?` |
| `clear_room` | — |
| `build_room` | `name?`, `width?`, `depth?`, `height?`, `clearFirst`, `items[]` |

Positions are metres from the near-left floor corner: `x` right, `y` up, `z`
back. Any axis you omit gets a sensible default for that kind (e.g. wall-mount
height). Size and mount also default per kind, so `kind` + `label` +
`position` is normally enough.

### Prefer the batch tools

`build_system` and `build_room` issue their commands as one burst and then read
the canvas back, which is far faster than a call per device. Use them for
anything past two or three items. `build_system` creates zones first, then
devices, waits ~400 ms for React Flow to commit, then draws cables — so cables
can safely reference devices created in the same call.

---

## Working order that avoids failures

1. `list_devices` (unless you are starting from scratch)
2. `clear_canvas` — only with the user's say-so
3. Zones
4. Devices, each with its full port list and a `zone`
5. Cables, matched by port label
6. `add_rack` with bay `tag`s matching the device tags
7. `build_room` with item `tag`s matching the same device tags
8. `list_devices` to confirm what actually landed

Tags are the join key across all three views — schematic, rack elevation and 3D
room. Keep them consistent (`DSP-01`, `AMP-02`, `SPK-L`) and the drawing stays
coherent.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| *"Cannot reach the canvas at ws://localhost:4321…"* | The Bun server isn't running. `bun dev`. |
| *"The canvas did not respond"* (5 s timeout) | The server is up but no browser tab is open on http://localhost:4321. Open one. |
| Status dot amber or grey | The page's socket is retrying (backoff up to 8 s). It reconnects itself after a dev-server restart; reload if it doesn't. |
| `connect_devices` → *"has no matching output"* | The port label doesn't match. `list_devices` and use the exact label, or omit the port to take the first one. |
| `add_device` → *"No zone named X"* | Create the zone first; the match is by name, case insensitive. |
| Replies look out of order | The bridge pairs replies to requests **by arrival order**, not by id. Don't run two MCP clients against one canvas. |
| Scripts in `scripts/` can't connect | They default to port **3000**, the server listens on **4321**. Run them as `AV_WS=ws://localhost:4321/ws?role=ai bun scripts/av.ts state`, or start the server with `PORT=3000 bun dev`. `mcp/server.ts` is unaffected — it already defaults to 4321. |

## Security note

The relay does no authentication and does not check origins: anything that can
open a WebSocket to the port can read and rewrite the drawing. It is built for
`localhost`. Don't expose the port on an untrusted network.

## Extending the tool set

A new capability touches three files, in this order:

1. `src/lib/ai-bridge.ts` — add the variant to the `AICommand` union.
2. `src/components/canvas.tsx` — handle it in `runCommand` (~line 877); return
   `ok(command, detail)` or `fail(command, message)`.
3. `mcp/server.ts` — `server.registerTool(...)` wrapping `call({ type: … })`.

Write the tool `description` for an agent that cannot see the screen: say when
to call it, what it needs first, and whether it destroys anything.
