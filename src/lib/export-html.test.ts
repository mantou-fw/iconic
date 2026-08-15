import { expect, test } from "bun:test";
import type { Edge, Node } from "@xyflow/react";

import { buildViewerHtml } from "./export-html";
import { DEFAULT_ROOM, makeRoomItem } from "./room";

const device = (id: string, tag: string, name: string, x: number, y: number): Node => ({
  id,
  type: "database",
  position: { x, y },
  data: {
    tag,
    name,
    manufacturer: "QSC",
    model: "Core 110f",
    ports: [
      { id: `${id}-i1`, label: "Mic 1", dir: "in", connector: "XLR-F", signal: "audio" },
      { id: `${id}-o1`, label: "Zone 1", dir: "out", connector: "PHOENIX", signal: "audio" },
      { id: `${id}-o2`, label: "LAN", dir: "out", connector: "RJ45", signal: "network" },
    ],
  },
});

const nodes: Node[] = [
  device("n1", "DSP-01", "Audio DSP", 0, 0),
  device("n2", "AMP-01", "Amplifier", 600, 0),
  {
    id: "tb",
    type: "titleblock",
    position: { x: 1200, y: 0 },
    data: { title: "MULTI-ROOM AUDIO", client: "Acme Ltd", project: "HQ Fitout", rev: "B" },
    width: 300,
    height: 900,
  },
];

const edges: Edge[] = [
  {
    id: "e1",
    source: "n1",
    target: "n2",
    sourceHandle: "n1-o1",
    targetHandle: "n2-i1",
    data: { label: "A-101" },
  },
];

const items = [
  makeRoomItem({ id: "r1", kind: "tv", label: '85" Display' }, DEFAULT_ROOM),
  makeRoomItem({ id: "r2", kind: "sofa", label: "Sofa" }, DEFAULT_ROOM),
];

const build = (over: Partial<Parameters<typeof buildViewerHtml>[0]> = {}) =>
  buildViewerHtml({
    nodes,
    edges,
    room: DEFAULT_ROOM,
    roomItems: items,
    absolute: (n) => n.position,
    ...over,
  });

test("produces a standalone document with no external references", () => {
  const html = build();
  expect(html.startsWith("<!doctype html>")).toBe(true);
  // Nothing may be fetched at open time — the client may be offline.
  expect(html).not.toMatch(/<script[^>]+\bsrc=/i);
  expect(html).not.toMatch(/<link[^>]+stylesheet/i);
  expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
});

test("renders every device and cable into the SVG", () => {
  const html = build();
  expect(html).toContain('data-id="n1"');
  expect(html).toContain('data-id="n2"');
  expect(html).toContain('data-id="e1"');
  expect(html).toContain("DSP-01");
  expect(html).toContain("Amplifier");
  expect(html).toContain("A-101");
});

test("carries the port and connector detail a client needs", () => {
  const html = build();
  expect(html).toContain("Mic 1");
  expect(html).toContain("PHOENIX");
  expect(html).toContain("RJ45");
});

test("cables are tagged with their signal class so they can be filtered", () => {
  const html = build();
  expect(html).toContain('data-signal="audio"');
});

test("bakes literal colours, never the app's theme variables", () => {
  // The viewer has no access to the app's stylesheet: a var(--sig-*) would
  // render as black. Signal colours must be resolved to hex at export time.
  const html = build();
  expect(html).not.toContain("var(--sig-");
  expect(html).toContain("#16a34a"); // audio
  expect(html).toContain("#9333ea"); // network
});

test("includes the schedules and the title block identity", () => {
  const html = build();
  expect(html).toContain("Bill of materials");
  expect(html).toContain("Cable schedule");
  expect(html).toContain("MULTI-ROOM AUDIO");
  expect(html).toContain("Acme Ltd");
});

test("includes the room plan when the drawing has one", () => {
  expect(build()).toContain('85&quot; Display');
  // …and degrades to a message rather than an empty tab when it does not.
  expect(build({ roomItems: [] })).toContain("No room layout");
});

test("is read-only: no editing affordances are emitted", () => {
  const html = build();
  expect(html).not.toContain("contenteditable");
  expect(html).not.toMatch(/<textarea/i);
  // The only inputs are the viewer's own search box and signal filters.
  const inputs = html.match(/<input[^>]*>/gi) ?? [];
  expect(inputs.length).toBeGreaterThan(0);
  expect(inputs.every((i) => /type="(search|checkbox)"/.test(i))).toBe(true);
});

test("escapes markup in user content instead of injecting it", () => {
  const nasty: Node[] = [device("n1", "</script><b>x", '"><img>', 0, 0)];
  const html = buildViewerHtml({
    nodes: nasty,
    edges: [],
    room: DEFAULT_ROOM,
    roomItems: [],
    absolute: (n) => n.position,
  });
  expect(html).not.toContain("</script><b>x");
  expect(html).not.toContain('"><img>');
  expect(html).toContain("&lt;/script&gt;");
});

test("survives an empty drawing", () => {
  const html = buildViewerHtml({
    nodes: [],
    edges: [],
    room: DEFAULT_ROOM,
    roomItems: [],
    absolute: (n) => n.position,
  });
  expect(html).toContain("<svg");
  expect(html.length).toBeGreaterThan(1000);
});
