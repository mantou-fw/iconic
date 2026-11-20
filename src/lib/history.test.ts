import { expect, test } from "vitest";

import { createDocumentHistory, type Snapshot } from "./history";
import { DEFAULT_ROOM, makeRoomItem } from "./room";
import { DEFAULT_SIGNALS } from "./signal-types";

function documentAt(x: number): Snapshot {
  return {
    schematic: {
      nodes: [{ id: "node", type: "text", position: { x, y: 0 }, data: { text: "label" } }],
      edges: [],
      signals: DEFAULT_SIGNALS,
      grid: { snapToGrid: false, gridSize: 8 },
    },
    room: { room: DEFAULT_ROOM, items: [] },
  };
}

test("immediate Undo and Redo capture the current edit before the render is recorded", () => {
  const history = createDocumentHistory();
  history.record(documentAt(0));
  history.record(documentAt(10));
  expect(history.undo("schematic", documentAt(20))?.nodes[0]!.position.x).toBe(10);
  expect(history.redo("schematic", documentAt(10))?.nodes[0]!.position.x).toBe(20);
});

test("groups one gesture and records subsequent gestures independently", () => {
  const history = createDocumentHistory();
  const gesture = Symbol();
  history.record(documentAt(0));
  history.record(documentAt(3), gesture);
  history.record(documentAt(6), gesture);
  expect(history.undo("schematic", documentAt(10), gesture)?.nodes[0]!.position.x).toBe(0);
  expect(history.redo("schematic", documentAt(0))?.nodes[0]!.position.x).toBe(10);
  history.record(documentAt(20), Symbol());
  expect(history.undo("schematic", documentAt(20))?.nodes[0]!.position.x).toBe(10);
  expect(history.redo("schematic", documentAt(12))).toBeUndefined();
});

test("selection and editor-only flags do not record a history step", () => {
  const history = createDocumentHistory();
  history.record(documentAt(0));
  const selected = documentAt(0);
  selected.schematic.nodes[0]!.selected = true;
  selected.schematic.nodes[0]!.data.autoFocus = true;
  expect(history.undo("schematic", selected)).toBeUndefined();
});

test("room changes undo separately and a room import rolls back in one step", () => {
  const history = createDocumentHistory();
  const before = documentAt(10);
  const imported = documentAt(10);
  imported.room = {
    room: { ...DEFAULT_ROOM, width: 18 },
    items: [
      makeRoomItem({ id: "display", kind: "tv", label: "Display" }, DEFAULT_ROOM),
      makeRoomItem({ id: "speaker", kind: "speaker", label: "Speaker" }, DEFAULT_ROOM),
    ],
  };
  history.record(documentAt(0));
  history.record(before);
  history.record(imported);
  expect(history.undo("room", imported)).toEqual(before.room);
  expect(history.undo("room", before)).toBeUndefined();
  expect(history.redo("room", before)).toEqual(imported.room);
  expect(history.undo("schematic", imported)).toEqual(documentAt(0).schematic);
});

test("new projects and restored versions start with an empty undo stack", () => {
  const oldHistory = createDocumentHistory();
  oldHistory.record(documentAt(0));
  oldHistory.record(documentAt(10));
  const remountedHistory = createDocumentHistory();
  remountedHistory.record(documentAt(55));
  expect(remountedHistory.undo("schematic", documentAt(55))).toBeUndefined();
});
