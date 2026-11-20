import type { Edge, Node } from "@xyflow/react";

import type { ToolSettings } from "./db";
import type { RoomItem, RoomSpec } from "./room";
import type { SignalDef } from "./signal-types";

export type SchematicSnapshot = {
  nodes: Node[];
  edges: Edge[];
  signals: SignalDef[];
  grid: Pick<ToolSettings, "snapToGrid" | "gridSize">;
};

export type RoomSnapshot = { room: RoomSpec; items: RoomItem[] };
export type Snapshot = { schematic: SchematicSnapshot; room: RoomSnapshot };

const LIMIT = 60;

function historyFor<T>(equals: (a: T, b: T) => boolean) {
  const past: T[] = [];
  const future: T[] = [];
  let current: T | undefined;
  let lastGroup: symbol | undefined;

  return {
    record(next: T, group?: symbol) {
      if (!current) {
        current = next;
        return false;
      }
      if (equals(current, next)) return false;

      if (!group || group !== lastGroup) {
        past.push(current);
        if (past.length > LIMIT) past.shift();
      }
      current = next;
      lastGroup = group;
      return true;
    },
    clearRedo() {
      future.length = 0;
    },
    undo() {
      const previous = past.pop();
      if (!previous || !current) return undefined;
      future.push(current);
      current = previous;
      lastGroup = undefined;
      return previous;
    },
    redo() {
      const next = future.pop();
      if (!next || !current) return undefined;
      past.push(current);
      current = next;
      lastGroup = undefined;
      return next;
    },
  };
}

const sameJson = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

function sameNodes(a: Node[], b: Node[]) {
  return a === b || (a.length === b.length && a.every((node, i) => {
    const other = b[i]!;
    if (node === other) return true;
    const { autoFocus: _a, ...data } = node.data;
    const { autoFocus: _b, ...otherData } = other.data;
    return node.id === other.id && node.type === other.type && node.parentId === other.parentId
      && node.position.x === other.position.x && node.position.y === other.position.y
      && node.width === other.width && node.height === other.height
      && (node.data === other.data || sameJson(data, otherData));
  }));
}

function sameEdges(a: Edge[], b: Edge[]) {
  return a === b || (a.length === b.length && a.every((edge, i) => {
    const other = b[i]!;
    return edge === other || (
      edge.id === other.id && edge.type === other.type
      && edge.source === other.source && edge.target === other.target
      && edge.sourceHandle === other.sourceHandle && edge.targetHandle === other.targetHandle
      && sameJson(edge.data, other.data)
    );
  }));
}

/** Keep each surface's history with the mounted project, outside viewport and selection state. */
export function createDocumentHistory() {
  const schematic = historyFor<SchematicSnapshot>((a, b) =>
    sameNodes(a.nodes, b.nodes) && sameEdges(a.edges, b.edges)
      && sameJson(a.signals, b.signals) && sameJson(a.grid, b.grid),
  );
  const room = historyFor<RoomSnapshot>((a, b) => sameJson(a.room, b.room) && sameJson(a.items, b.items));

  function record(snapshot: Snapshot, group?: symbol) {
    const changedDrawing = schematic.record(snapshot.schematic, group);
    const changedRoom = room.record(snapshot.room, group);
    if (changedDrawing || changedRoom) {
      schematic.clearRedo();
      room.clearRedo();
    }
  }

  function undo<S extends keyof Snapshot>(surface: S, snapshot: Snapshot, group?: symbol): Snapshot[S] | undefined;
  function undo(surface: keyof Snapshot, snapshot: Snapshot, group?: symbol) {
    record(snapshot, group);
    return (surface === "room" ? room : schematic).undo();
  }

  function redo<S extends keyof Snapshot>(surface: S, snapshot: Snapshot, group?: symbol): Snapshot[S] | undefined;
  function redo(surface: keyof Snapshot, snapshot: Snapshot, group?: symbol) {
    record(snapshot, group);
    return (surface === "room" ? room : schematic).redo();
  }

  return { record, undo, redo };
}
