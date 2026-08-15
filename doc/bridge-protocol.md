# The raw WebSocket bridge

MCP is the recommended path. This document covers the layer underneath it, for
shell scripts, tests and non-MCP agents.

## Connecting

```
ws://localhost:4321/ws?role=ai        # the agent side
ws://localhost:4321/ws?role=canvas    # the browser (opened for you by the app)
```

`role` defaults to `canvas` for anything that isn't literally `ai`.

The server (`src/index.ts`) is a relay: each socket subscribes to a topic named
after its own role, and everything it sends is republished to the *other* role.
It never inspects the payload. On connect you get
`{"type":"hello","role":…,"peers":{…}}`, and `{"type":"peers",…}` whenever a
peer joins or leaves — both are bookkeeping, not replies, and both should be
ignored by clients.

Send one JSON object per message. The canvas replies with exactly one message
per command it handles.

## Commands

The authoritative list is the `AICommand` union in `src/lib/ai-bridge.ts`; the
implementation is `runCommand` in `src/components/canvas.tsx`.

```jsonc
{ "type": "get_state" }
{ "type": "clear" }
{ "type": "layout" }

{ "type": "add_zone", "name": "Living Room", "color": "#16a34a",
  "position": { "x": 40, "y": 40 }, "width": 460, "height": 320 }

{ "type": "add_device", "tag": "DSP-01", "name": "Audio DSP",
  "manufacturer": "QSC", "model": "Core 110f", "zone": "Head End",
  "inputs":  [{ "label": "Mic 1", "connector": "XLR-F",   "signal": "audio" }],
  "outputs": [{ "label": "Zone 1", "connector": "PHOENIX", "signal": "audio" }],
  "position": { "x": 80, "y": 80 } }

{ "type": "connect", "from": "DSP-01", "fromPort": "Zone 1",
  "to": "AMP-01", "toPort": "Line In", "label": "A-201" }

{ "type": "delete_device", "tag": "AMP-01" }
{ "type": "add_text", "text": "Rack room", "position": { "x": 0, "y": 0 } }
{ "type": "add_memo", "text": "Verify AFF with client" }

{ "type": "add_rack", "tag": "RK-01", "name": "Head End Rack", "units": 24,
  "equipment": [{ "label": "Core 110f", "tag": "DSP-01", "u": 1, "height": 1,
                  "color": "#64748b" }] }

{ "type": "add_title_block", "fields": { "project": "HTIFA", "sheet": "AV-101" } }

{ "type": "set_room", "name": "Living Room", "width": 6, "depth": 5,
  "height": 2.7, "clearItems": true }
{ "type": "add_room_item", "kind": "speaker", "label": "Left Surround",
  "tag": "SPK-L", "position": { "x": 0.6, "z": 3.2 }, "mount": "wall",
  "rotation": 90, "note": "1.8 m AFF" }
{ "type": "clear_room" }
{ "type": "get_room" }
```

`add_title_block` has no MCP tool of its own — the socket is the only way to
place one programmatically.

## Replies

```jsonc
{ "type": "ack",   "command": "add_device", "ok": true, "detail": { … } }
{ "type": "error", "command": "connect", "ok": false, "message": "No device tagged \"AMP-01\"" }
{ "type": "state", "devices": [ … ], "cables": [ … ] }
```

`get_state` returns `state` with every device (tag, name, manufacturer, model,
position, ports) and every cable (label, from, fromPort, to, toPort).
`get_room` reuses the `state` envelope, packing `{ room, items }` as the single
entry in `devices`.

Replies are **not correlated by id** — a client matches them to requests in
arrival order (that's exactly what `mcp/server.ts` does with its `waiters`
queue). Running two agents against one canvas will interleave them.

## Timing

React Flow commits nodes asynchronously, so a `connect` fired in the same tick
as the `add_device` it references can miss. Wait ~400 ms between the device
burst and the cable burst — `build_system` in `mcp/server.ts` and
`scripts/av.ts apply` both do this.

## Included clients

| Script | Purpose |
| --- | --- |
| `scripts/av.ts` | CLI: `state`, `clear`, `layout`, `zone`, `device`, `connect`, `delete`, `apply <file.json>` |
| `scripts/mcp-check.ts` | Smoke-tests the MCP server end to end |
| `scripts/ai-demo.ts` | Small example system |
| `scripts/room-demo.ts` | Example 3D room |
| `scripts/qsc-multiroom.ts` | 4-zone QSC Core 110f multi-room build |

**Port gotcha:** every script in `scripts/` defaults to `ws://localhost:3000`,
but the server listens on **4321**. Set the env var:

```bash
AV_WS=ws://localhost:4321/ws?role=ai bun scripts/av.ts state
AV_WS=ws://localhost:4321/ws?role=ai bun scripts/qsc-multiroom.ts
```

Or start the server on 3000 instead: `PORT=3000 bun dev`.

### CLI examples

```bash
export AV_WS=ws://localhost:4321/ws?role=ai

bun scripts/av.ts zone "Living Room"
bun scripts/av.ts device DSP-01 "Audio DSP" --mfr QSC --model "Core 110f" \
    --in "Mic 1:XLR-F:audio" --out "Zone 1:PHOENIX:audio" --zone "Living Room"
bun scripts/av.ts connect DSP-01 "Zone 1" AMP-01 "Line In" --label A-201
bun scripts/av.ts state
```

Ports are `Label:CONNECTOR:signal`; the signal defaults to `audio`.

`apply` takes a JSON file shaped exactly like `build_system`'s arguments:

```json
{
  "clearFirst": true,
  "zones":   [{ "name": "Head End", "color": "#0071e3" }],
  "devices": [{ "tag": "DSP-01", "name": "Audio DSP", "zone": "Head End",
                "outputs": [{ "label": "Zone 1", "signal": "audio" }] }],
  "cables":  [{ "from": "DSP-01", "to": "AMP-01", "label": "A-201" }]
}
```

```bash
bun scripts/av.ts apply system.json
```
