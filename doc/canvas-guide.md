# Using the AV schematic canvas

The canvas is an infinite React Flow surface for AV signal-flow drawings. Every
change is written straight to IndexedDB, so there is no save button — "Save
project" exports a file, it does not commit anything.

```bash
bun dev            # http://localhost:4321, hot reload on
bun start          # production mode
bun run desktop:dev   # Tauri desktop shell (builds the Bun sidecar first)
```

---

## 1. The toolbar

Pick a tool, then click on empty canvas to place that node. The tool snaps back
to **Select** after one placement.

| Tool | Key | Digit | What it places |
| --- | --- | --- | --- |
| Select | `V` | `1` | — (drag, marquee, edit) |
| Pan | `H` | `2` | — (or hold `Space` from any tool) |
| Pen | `P` | `3` | Freehand ink stroke |
| Text | `T` | `4` | Plain text label |
| Memo | `M` | `5` | Sticky note |
| Image | `I` | `6` | File picker → embedded image (stored as a data URL) |
| AV Device | `D` | `7` | Device block with ports |
| Icon + Label | `N` | — | Icon with a caption |
| Shape | `S` | — | Rectangle / ellipse / etc. |
| Zone | `G` | `8` | Room / area container |
| Equipment Rack | `R` | `9` | Rack elevation |
| Title Block | `B` | `0` | Drawing title block |

Also on the toolbar: a **snap-to-grid** toggle (grid size lives in tool
settings, default 8) and **Clear canvas**.

### Keyboard

| Shortcut | Action |
| --- | --- |
| `⌘/Ctrl` + `Z` / `⇧Z` | Undo / redo |
| `⌘/Ctrl` + `D` | Duplicate selection |
| `⌘/Ctrl` + `A` | Select all |
| `Space` (hold) | Temporary pan; releases back to the previous tool |
| `Esc` | Back to Select (and out of the 3D room view) |
| `1`–`0`, letter keys | Jump to a tool |

Shortcuts are suppressed while you are typing in an input, textarea or any
contenteditable field.

---

## 2. Devices and ports

A device block carries a **tag** (reference designator, auto-uppercased), a
**description**, **manufacturer** and **model**, plus two port lists.

- **+ Input / + Output** adds a port. Inputs get a handle on the left, outputs
  on the right.
- Click a port's colour dot to cycle its **signal class**. The dot colour is the
  cable colour.
- The small `conn` field is the connector type (`XLR-F`, `RJ45`, `PHOENIX`,
  `HDMI`…) — free text, blank is fine.
- Deleting a port deletes any cable attached to it; edges are re-derived from
  the port list whenever it changes.

### Signal legend

The legend strip shows one chip per signal class. Defaults:

| Key | Label | Code | Colour |
| --- | --- | --- | --- |
| `audio` | Audio | AUD | `#16a34a` |
| `video` | Video | VID | `#2563eb` |
| `network` | Network | NET | `#9333ea` |
| `control` | Control | CTL | `#ea580c` |
| `power` | Power | PWR | `#dc2626` |

Click the pencil to rename, recolour, add or remove classes. Each class has a
stable internal `key` that never changes when you rename it, so retagging the
legend never orphans existing ports or cables. Custom classes get generated
keys (`sig…`) — use those exact keys when driving the canvas from an agent.

---

## 3. Cables

Drag from an output handle to an input handle. The cable takes its colour from
the source port's signal class.

- Cables route **orthogonally** and steer around device blocks
  (`src/lib/routing.ts`, `obstacles.ts`, `lanes.ts`).
- Hovering a cable reveals two drag dots: one moves its vertical leg, one moves
  its horizontal leg. **Double-click a dot to reset** that leg to automatic
  routing.
- Click the label above the line to type a **cable ID** (`A-101`, `V-204`…).
- Plain arrow edges (`arrow-edge`) support a direction of forward, backward or
  both, for annotation arrows that are not signal cables.

---

## 4. Zones

A zone is a labelled container for a room or area.

- Drop a device inside a zone and it becomes a **child** of that zone: the zone
  now moves as a unit and the device is clamped to the zone's bounds.
- Drag a device back out to detach it.
- Zones auto-place in a row (520 px apart) and cycle through preset accent
  colours when you don't specify one.

**Create zones before the devices that belong to them** — a device can only join
a zone that already exists.

---

## 5. Racks and title blocks

**Equipment rack** — a rack elevation with a unit count (default 24) and a list
of bays. A bay has a label, an optional matching **device tag**, a bottom U
(1 is the bottom) and a height in U. Setting a bay's tag to a device's
schematic tag is what ties the elevation to the signal flow.

**Title block** — a standard drawing title block; its fields are plain
key/value data you can fill in or set programmatically.

---

## 6. Aligning

Select two or more nodes to get the align bar: align left / centres / right /
top / middles / bottom, and distribute horizontally or vertically (distribution
needs three or more nodes).

---

## 7. The 3D room view

Open it from the file menu ("3D room view"), leave with `Esc`.

The room is modelled in **metres**, origin at the near-left floor corner:
`x` right (width), `y` up (height), `z` back (depth). Default room is 6 × 5 ×
2.7 m.

Item kinds — AV: `tv`, `projector`, `screen`, `speaker`, `subwoofer`, `rack`,
`camera`, `keypad`. Furniture: `table`, `desk`, `sofa`, `chair`, `cabinet`,
`rug`, `plant`, `door`, `window`. Each kind has default size, mount and colour
(`KIND_DEFAULTS` in `src/lib/room.ts`), so you usually only need a position.

Mounts: `wall`, `ceiling`, `floor`, `table`, `rack`.

View presets: ISO, FRONT, REAR, LEFT, RIGHT, TOP. In plan view you can drag
items to reposition them; wall-mounted items slide along their wall. The
inspector shows X/Y/Z in metres and AFF (height above finished floor).

Give a room item the same `tag` as a device on the schematic to link the two
representations.

---

## 8. File menu

| Item | Result |
| --- | --- |
| Open project… | Replaces the whole drawing from a `.json` project file |
| Save project | Downloads a `.json` project (`kind: "av-schematic"`, version 1) |
| Export schedules | `.xlsx` device and cable schedules |
| Print / Export PDF | PDF via jsPDF |
| Export image | PNG |
| Export vector | SVG |
| Interactive viewer | One self-contained `.html` file — pannable, zoomable, no server needed |
| 3D room view | Switches to the room |

The coloured dot next to the menu is the **AI bridge status**: grey = offline,
amber = connecting, green = live. If it is not green, an agent cannot drive the
canvas.

Opening a project validates it first: it must be valid JSON with
`kind: "av-schematic"` and node/edge arrays, or the open is rejected and the
current drawing is left alone.

---

## 9. Where state lives

Dexie database `av-schematic-db` (schema v4) in the browser:

| Table | Contents |
| --- | --- |
| `nodes`, `edges` | The drawing |
| `drawings` | Pen strokes |
| `viewport` | Pan/zoom |
| `settings` | Sticky tool defaults (pen colour/width, text, memo, snap, grid) |
| `room`, `roomItems` | The 3D room |
| `legend` | The signal legend |

Two browser tabs on the same origin share one database but do **not** live-sync
— the last write wins. Clearing site data wipes the drawing; export a project
file first.
