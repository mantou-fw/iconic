import type { Edge, Node } from "@xyflow/react";
import { expect, test } from "vitest";
import { readProjectContext, readProjectObject } from "./project-read";
import { DEFAULT_ROOM, makeRoomItem } from "./room";

const node = (id: string, type: string, data: Node["data"] = {}, parentId?: string): Node =>
  ({ id, type, data, parentId, position: { x: 10, y: 20 }, selected: true });

test("reads all schematic object types, nested positions and linked room items without changing editor state", () => {
  const nodes = [
    node("floor", "zone"), node("zone", "zone", {}, "floor"),
    node("device", "database", { tag: "DSP-01", ports: [{ id: "out", label: "Output" }] }, "zone"),
    node("rack", "rack", { items: [{ deviceId: "device", label: "Processor" }] }),
    node("title", "titleblock"), node("memo", "memo"), node("text", "text"), node("icon", "icon-text"),
    node("shape", "shape"), node("image", "image", { src: "data:image/png;base64,AABB" }),
    node("stroke", "drawing", { points: [{ x: 0, y: 0 }] }),
  ];
  const edges: Edge[] = [{ id: "link", source: "device", sourceHandle: "out", target: "shape" }];
  const roomItems = [makeRoomItem({ id: "room-display", kind: "tv", label: "Display", deviceId: "device" }, DEFAULT_ROOM)];
  const project = { nodes, edges, room: DEFAULT_ROOM, roomItems };
  const before = structuredClone(project);
  const result = readProjectContext(project);
  expect(result.nodes.map(({ id }) => id)).toEqual(nodes.map(({ id }) => id));
  expect(result.nodes[2]).toMatchObject({ parentId: "zone", position: { relativeTo: "parent", x: 10, y: 20 } });
  expect(result.nodes[0]).toMatchObject({ parentId: null, position: { relativeTo: "canvas" } });
  expect(result.nodes[9]?.data).toEqual({ source: { embedded: true, length: 26 } });
  expect(result.nodes[10]?.data).toEqual({ pointCount: 1 });
  expect(result.cables[0]?.source).toEqual({ nodeId: "device", portId: "out", tag: "DSP-01", label: "Output" });
  expect(result.room.items[0]).toMatchObject({ id: "room-display", deviceId: "device", displayTag: "DSP-01" });
  expect(readProjectObject(project, "node", "stroke")).toMatchObject({ found: true, object: { data: { points: [{ x: 0, y: 0 }] } } });
  expect(project).toEqual(before);
  nodes[2]!.data.tag = "DSP-02";
  expect(readProjectContext(project).room.items[0]).toMatchObject({ id: "room-display", displayTag: "DSP-02" });
});

test("returns empty collections and an explicit missing-object result", () => {
  const project = { nodes: [], edges: [], room: DEFAULT_ROOM, roomItems: [] };
  expect(readProjectContext(project)).toMatchObject({ version: 1, nodes: [], cables: [], room: { items: [] } });
  expect(readProjectObject(project, "cable", "missing")).toEqual({ version: 1, kind: "cable", id: "missing", found: false, object: null });
});
