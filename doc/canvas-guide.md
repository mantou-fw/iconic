# Using the AV schematic canvas

The canvas is an infinite React Flow surface for AV signal-flow drawings. Every
change is written straight to IndexedDB, so there is no save button — "Save
project" exports a file, it does not commit anything.

```bash
npm run dev            # http://localhost:4321, hot reload on
npm run build && npm start  # Node.js production mode
npm run desktop:dev   # Electron + TanStack Start (Node.js)
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

Use **Room setup** to name and size the room. **Add room object** opens the
equipment and furniture list and can link the new object to an existing
schematic device. Select an object to edit its label, coordinates, dimensions,
rotation, mounting, and notes or to duplicate or remove it. A duplicate is
unlinked so two room objects do not implicitly represent the same device.
Room edits use the normal Undo and Redo shortcuts.

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

Room and rack references store the schematic device ID so tag edits retain the
link. A unique tag also works when creating a reference. For older projects
with conflicting or missing references, use **Review device references** to
choose the intended device or keep the original tag without a link.

---

## 8. File menu

| Item | Result |
| --- | --- |
| Open project… | Validates a drawing JSON file and opens it as a new local project |
| Save project | Downloads a `.json` project (`kind: "av-schematic"`, version 1) |
| Export schedules | `.xlsx` device and cable schedules |
| Print / Export PDF | PDF via jsPDF |
| Export image | PNG |
| Export vector | SVG |
| Interactive viewer | One self-contained `.html` file — pannable, zoomable, no server needed |
| 3D room view | Switches to the room |
| Reusable library | Saves and places reviewed equipment definitions and room templates |

The interactive viewer keeps each title block on the drawing. The first block
also supplies the viewer's heading and project metadata.

The coloured dot next to the menu is the **desktop command channel status**: grey = offline,
amber = connecting, green = live. If it is not green, an agent cannot drive the
canvas.

Opening a project validates its version, objects, parent references and cable
endpoints before creating or activating a new project. The error identifies the
first invalid field. If the active project cannot load, export its original
stored contents, create a blank project or switch to another one from the
recovery screen. The affected project remains in storage.

---

## 9. Where state lives

The project catalog and each project's working copy, images and version history
are stored locally in IndexedDB. The old `av-schematic-db` database remains
available for the initial legacy import. Working copies save automatically,
and a named version records a separate recovery point.

Tabs on the same origin share storage. If another tab saves the current
project, a stale editor rejects the conflicting save and lets you download its
open work before reopening. The project manager keeps a backup of the current
work before restoring an earlier version. Clearing site data removes the local
catalog and history. Drawing JSON includes the current project and embedded
images. In **Projects and versions**, use **Export project archive** to save
both the current drawing and its retained versions, including embedded
images. **Import project archive** opens that backup as an independent project.

The project list supports searching, renaming, and archiving. Restoring an
archived project makes it available again. Duplication copies the working
drawing to a new project with its own history.

Preview a version to compare its contents against the current drawing before
restoring. To manage retention, select the versions to remove and confirm the
list. The current drawing and unselected versions are kept, and at least one
version must remain.

## 10. Reuse equipment and room layouts

Open **Reusable library** from the file menu. Choose a schematic device or the
current room under **Save from project**. A device definition keeps its
specifications, ports, and source evidence. Instantiating it creates a new
device and tag. Save a new library version to keep earlier definitions
available. To update a drawing device, review the version and explicitly
apply it to that device. Connected ports must remain present.

A room template creates a separate project with new room item IDs. Links to
schematic devices in the original project are cleared. Use **Export library**
and **Import library** to transfer definitions and their version histories.

## Photo to 3D Room

Choose **iconic → Photo to 3D Room** from the schematic menu. The demo uses
an original generated reference photo and a hand-authored nine-object layout.
The table is 2.4 m long in the demo; other dimensions are provisional.
Use **Compare** to blend the photo with the front model, then select
**Dollhouse** or **Top** to inspect the editable geometry. Photo alignment is
approximate, not a calibrated overlay or a survey.

To review a real room:

1. Select **Use your own photo** and open a local JPEG, PNG or WebP file.
   If you know the room width, depth or height, enter the value in metres.
2. Choose **Copy vision prompt**, then attach the same photo to a
   vision-capable AI client of your choice and send it the prompt.
   The client returns a draft in the existing iconic room-import JSON shape.
   As always, share photos only with a client permitted to handle them.
3. Paste the returned JSON, or load it from a JSON file, and select **Review
   draft**. Check the objects and assumptions before using **Apply to new
   project**. Then use the normal 3D editor to move, resize, add, or delete items.

Iconic itself does not upload the photo, retain it in the new project, or
modify the current project. The new project stores the room geometry and the
draft's plain-text provenance. The existing MCP room tools are unchanged.
