import { expect, test } from "vitest";

import { parseProject } from "./project";

const base = { kind: "av-schematic", version: 1, nodes: [], edges: [] };
const read = (changes: object) => parseProject(JSON.stringify({ ...base, ...changes }));
const zone = (id: string, parentId?: string) => ({
  id, type: "zone", position: { x: 0, y: 0 }, data: { name: "Zone" }, parentId,
});
const device = (id: string) => ({
  id, type: "database", position: { x: 0, y: 0 }, data: {
    tag: id, ports: [
      { id: "in", label: "In", dir: "in" },
      { id: "out", label: "Out", dir: "out" },
    ],
  },
});

test.each([
  [{ nodes: [null] }, /nodes\[0\]/],
  [{ version: 99 }, /Unsupported project format version.*99/],
  [{ nodes: [zone("z"), zone("z")] }, /nodes\[1\].id/],
  [{ nodes: [zone("z", "missing")] }, /nodes\[0\].parentId/],
  [{ nodes: [zone("child", "parent"), zone("parent", "missing")] }, /nodes\[1\].parentId/],
  [{ nodes: [zone("z", "q"), zone("q", "z")] }, /cycle/],
  [{ nodes: [{ ...zone("z"), position: { x: "0", y: 2 } }] }, /nodes\[0\].position.x/],
  [{ nodes: [{ ...zone("z"), type: "unknown" }] }, /nodes\[0\].type/],
  [{ edges: [{ id: "edge", source: "missing", target: "nowhere" }] }, /edges\[0\].source/],
  [{ nodes: [device("one"), device("two")], edges: [{
    id: "edge", source: "one", target: "two", sourceHandle: "out", targetHandle: "out",
  }] }, /edges\[0\].targetHandle/],
  [{ signals: [{ key: "audio", label: 123, short: "AUD", color: "#fff" }] }, /signals\[0\].label/],
])("rejects malformed project data with its field path", (changes, message) => {
  expect(() => read(changes)).toThrow(message);
});

test("preserves supported legacy objects and fills omitted optional file fields", () => {
  const legacy = {
    kind: "av-schematic",
    nodes: [{
      id: "early-device", type: "database", position: { x: -5, y: 12 },
      data: { label: "原名", fields: [{ id: "legacy-in", type: "XLR", name: "古い端子" }], notes: "Preserve this" },
    }, device("sender")],
    edges: [{ id: "early-link", source: "sender", target: "early-device", sourceHandle: "out", targetHandle: "legacy-in" }],
  };
  const loaded = parseProject(JSON.stringify(legacy));
  expect(loaded.version).toBe(1);
  expect(loaded.nodes).toEqual(legacy.nodes);
  expect(loaded.edges).toEqual(legacy.edges);
  expect(loaded.drawings).toEqual([]);
  expect(loaded.settings.gridSize).toBe(8);
  expect(loaded.signals?.length).toBeGreaterThan(0);
});
